#!/usr/bin/env node
// kb-server — 本地站点服务：静态站点（VitePress 构建产物）+ 执行 API + 数据实时聚合
// 数据全在 KB_ROOT（纯本地私有）；站点与依赖在插件仓。默认监听 0.0.0.0:4570（局域网可分享给测试同学）。
// 用法: node scripts/kb-server.mjs [--port 4570] [--no-build]（首次无构建产物时自动 build）
import { createServer } from 'node:http'
import { spawn, execFile } from 'node:child_process'
import {
  existsSync, readFileSync, writeFileSync, statSync, readdirSync, watchFile, watch,
} from 'node:fs'
import { join, resolve, extname } from 'node:path'
import { PLUGIN_ROOT, KB_ROOT } from './paths.mjs'
import { collect } from './gen-data.mjs'

const args = process.argv.slice(2)
const portIdx = args.indexOf('--port')
const PORT = Number(portIdx >= 0 ? args[portIdx + 1] : process.env.KB_PORT || 4570)
const DIST = join(PLUGIN_ROOT, 'site-dist')

// ── 数据聚合（内存缓存 + 文件变化失效；「跑完一个绿一个」靠它） ──────────────
let dataCache = null
function aggregate() {
  const t0 = Date.now()
  try {
    const { cases, apps, runs } = collect()
    dataCache = { cases, apps, runs, generated_at: new Date().toISOString() }
    return true
  } catch (e) {
    console.error('[kb-server] 聚合失败：', e.message)
    return false
  } finally {
    if (dataCache) dataCache._ms = Date.now() - t0
  }
}
aggregate()

// 轮询兜底 + watch 双保险（runs 目录会整目录删除重建，watch 需重挂）
let watchTimer = null
function armWatch() {
  try {
    const w = watch(KB_ROOT, { recursive: true }, (_evt, file) => {
      const f = String(file || '')
      if (!/(^|\/)(runs|domains|apps)(\/|$)/.test(f) && !/^runs/.test(f)) return
      clearTimeout(watchTimer)
      watchTimer = setTimeout(() => { if (aggregate()) console.log(`[kb-server] 数据已刷新 (${dataCache.cases.length} cases / ${dataCache.runs.length} runs)`) }, 300)
    })
    w.on('error', () => {}) // 目录重建瞬间 watch 断裂——轮询兜底
  } catch {}
}
armWatch()
setInterval(() => {
  // 廉价新鲜度检查：runs 目录 mtime 变化即重聚合
  try {
    const entries = readdirSync(join(KB_ROOT, 'runs'))
    const newest = Math.max(0, ...entries.map((n) => { try { return statSync(join(KB_ROOT, 'runs', n)).mtimeMs } catch { return 0 } }))
    if (newest !== lastRunsStamp) { lastRunsStamp = newest; if (aggregate()) console.log('[kb-server] runs 变化，数据已刷新') }
  } catch {}
}, 2000)
let lastRunsStamp = -1

// ── 工具 ────────────────────────────────────────────────────────────────────
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)) }
const readBody = (req) => new Promise((rel) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => rel(b)) })

// 登录态探针：判定单源 kb-auth.mjs（结构化结果）
function authVerify(baseUrl) {
  return new Promise((rel) =>
    execFile('node', [join(PLUGIN_ROOT, 'scripts/kb-auth.mjs'), 'verify', '--json', baseUrl], { cwd: PLUGIN_ROOT, timeout: 30_000 }, (_e, stdout, stderr) => {
      try { rel(JSON.parse(String(stdout || stderr || '').trim().split('\n').pop() || '{}')) } catch { rel({ ok: false, status: 'UNKNOWN' }) }
    }),
  )
}

// 执行环境白名单：应用画像 envs（代码零写死）
function envUrlSet() {
  const s = new Set()
  for (const a of dataCache?.apps || []) for (const v of Object.values(a.envs || {})) s.add(String(v).replace(/\/$/, ''))
  return s
}

// ── 静态站点（VitePress 构建产物） ──────────────────────────────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' }
function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]).replace(/^\//, '')
  let file = resolve(DIST, rel === '' ? 'index.html' : rel)
  // SPA 兜底：无扩展名路径 → <path>/index.html → 404.html/根 index
  if (!extname(file)) file = join(file + '', 'index.html')
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return }
  if (!existsSync(file) || !statSync(file).isFile()) {
    const fallback = existsSync(join(DIST, '404.html')) ? join(DIST, '404.html') : join(DIST, 'index.html')
    file = fallback
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
  res.end(readFileSync(file))
}

// ── API 路由 ────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x')
  const p = u.pathname

  // 站点数据（前端轮询/首载）
  if (p === '/__kb/data' && req.method === 'GET') {
    if (!dataCache) aggregate()
    return json(res, 200, dataCache || { cases: [], apps: [], runs: [] })
  }

  // 执行配置持久化（KB_ROOT/.kb-memory.json，不依赖浏览器）
  if (p === '/__kb/exec-config') {
    const file = join(KB_ROOT, '.kb-memory.json')
    const readCfg = () => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} } }
    if (req.method === 'POST') {
      const cfg = JSON.parse((await readBody(req)) || '{}')
      const clean = { env: String(cfg.env || '').slice(0, 40), customUrl: String(cfg.customUrl || '').slice(0, 200), tag: String(cfg.tag || '').slice(0, 64), skip5xx: String(cfg.skip5xx || '').slice(0, 200) }
      writeFileSync(file, JSON.stringify(clean, null, 2))
      return json(res, 200, { ok: true, ...clean })
    }
    return json(res, 200, { ok: true, ...readCfg() })
  }

  // 登录态探针/重导
  if (p === '/__kb/auth') {
    const baseUrl = (u.searchParams.get('baseUrl') || '').replace(/\/$/, '')
    if (!baseUrl) return json(res, 400, { ok: false, error: '需要 baseUrl 参数（目标环境，来自应用画像 envs）' })
    if (req.method === 'POST') {
      const host = new URL(baseUrl).hostname
      await new Promise((rel, rej) => execFile('node', [join(PLUGIN_ROOT, 'scripts/kb-auth.mjs'), 'import', host], { cwd: PLUGIN_ROOT, timeout: 120_000 }, (e, _so, se) => (e ? rej(new Error(String(se || e.message).slice(0, 300))) : rel())))
        .catch((e) => { json(res, 200, { ok: false, status: 'IMPORT_FAIL', message: String(e.message || e) }); throw 'done' })
    }
    return json(res, 200, await authVerify(baseUrl))
  }

  // 执行派发（引擎 pid 锁互斥；环境参数校验后注入子进程）
  if (p === '/__kb/run') {
    const q = u.searchParams
    const id = q.get('id'), domain = q.get('domain'), ids = q.get('ids')
    const baseUrl = (q.get('baseUrl') || '').replace(/\/$/, ''), envTag = q.get('envTag') || '', skip5xx = q.get('skip5xx') || ''
    if (!id && !domain && !ids) return json(res, 400, { ok: false, error: '需要 id、domain 或 ids 参数' })
    if (id && !/^TC-[A-Z0-9]+-\d+$/.test(id)) return json(res, 400, { ok: false, error: 'bad id' })
    if (baseUrl && !envUrlSet().has(baseUrl)) return json(res, 400, { ok: false, error: 'baseUrl 不在应用画像 envs 内——请在 apps/*.md 维护后再用' })
    if (envTag && !/^[\w.-]{0,64}$/.test(envTag)) return json(res, 400, { ok: false, error: 'bad envTag' })
    if (skip5xx && (skip5xx.length > 200 || (() => { try { new RegExp(skip5xx); return false } catch { return true } })())) return json(res, 400, { ok: false, error: 'skip5xx 不是合法正则（或超长）' })
    if (!baseUrl) return json(res, 200, { ok: false, error: '未指定执行环境——请先在应用画像（apps/*.md）维护 envs' })
    // 画像声明 auth: none（公开站点）跳过登录探针——不强求用户登录
    const app = (dataCache?.apps || []).find((a) => Object.values(a.envs || {}).some((v) => String(v).replace(/\/$/, '') === baseUrl))
    if (app?.auth !== 'none') {
      const v = await authVerify(baseUrl)
      if (!v.ok) return json(res, 200, { ok: false, needAuth: true, ...v })
    }
    const lockFile = join(KB_ROOT, '.kb-run.lock')
    if (existsSync(lockFile)) {
      const pid = Number(readFileSync(lockFile, 'utf8').trim())
      try { process.kill(pid, 0); return json(res, 409, { ok: false, error: `已有执行进行中（pid ${pid}），请等它跑完` }) } catch { /* 陈锁，引擎清理 */ }
    }
    const argv = id ? ['case', id] : domain ? ['domain', String(domain)] : ['ids', String(ids)]
    const child = spawn('node', [join(PLUGIN_ROOT, 'scripts/kb-run.mjs'), ...argv], {
      cwd: PLUGIN_ROOT, detached: true, stdio: 'ignore',
      env: { ...process.env, KB_ROOT, ...(baseUrl ? { BASE_URL: baseUrl } : {}), ...(envTag ? { ENV_TAG: envTag } : {}), ...(skip5xx ? { SKIP_5XX_PATTERN: skip5xx } : {}) },
    })
    child.unref()
    console.log(`[kb-server] 已派发: ${argv.join(' ')}${baseUrl ? ' @ ' + baseUrl : ''} (pid ${child.pid})`)
    return json(res, 200, { ok: true })
  }

  // 执行附件：KB_ROOT/runs/**（截图直出；md 支持 raw=1 给抽屉渲染）
  if (p.startsWith('/runs/')) {
    const rel = decodeURIComponent(p).replace(/^\//, '').replace(/\.html$/i, '')
    const file = resolve(KB_ROOT, rel)
    if (!file.startsWith(join(KB_ROOT, 'runs')) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return }
    if (u.searchParams.get('raw') === '1' || extname(file) !== '.md') {
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
      res.end(readFileSync(file))
      return
    }
    // 附件 md 站内渲染（与站点抽屉同款三态着色）——渲染器按需加载，避免启动依赖 vitepress
    const { mdHtml } = await import('./md-render.mjs').catch(() => ({ mdHtml: null }))
    if (!mdHtml) { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end(readFileSync(file, 'utf8')); return }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(await mdHtml(rel, readFileSync(file, 'utf8')))
    return
  }

  // 示例 demo 站（examples/demo-site，本地静态零依赖）——同端口固定路径，离线可跑
  if (p === '/__demo' || p.startsWith('/__demo/')) {
    const demoDir = join(PLUGIN_ROOT, 'examples', 'demo-site')
    let rel = decodeURIComponent(p).replace(/^\/__demo\/?/, '')
    const file = resolve(demoDir, rel || 'index.html')
    if (file.startsWith(demoDir) && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'text/html; charset=utf-8' })
      res.end(readFileSync(file))
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('demo not found')
    return
  }

  serveStatic(res, p)
})

// ── 启动 ────────────────────────────────────────────────────────────────────
async function ensureDist() {
  if (existsSync(join(DIST, 'index.html')) || args.includes('--no-build')) return
  console.log('[kb-server] 站点产物缺失，首次构建（一次性，约 1-2 分钟）…')
  await new Promise((rel) => {
    const c = spawn('npx', ['vitepress', 'build', '.'], { cwd: PLUGIN_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
    )
    c.on('close', rel)
  })
}
ensureDist().then(() => {
  if (!existsSync(join(KB_ROOT, 'domains'))) {
    console.log(`[kb-server] 数据目录为空：${KB_ROOT}\n  先初始化: node scripts/kb-init.mjs`)
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✓ 测试用例知识库: http://localhost:${PORT}\n  数据目录: ${KB_ROOT}（纯本地）\n  局域网分享: http://<本机IP>:${PORT}\n`)
  })
})
