#!/usr/bin/env node
// kb-run — 用例执行引擎
// 用法:
//   pnpm run:case TC-DEMO-001           # 单用例（按 frontmatter.spec 找 spec）
//   pnpm run:domain <域>                 # 整域
//   pnpm run:smoke                      # 全部 P0 active 用例（冒烟回归）
// 环境变量: BASE_URL / ENV_TAG 透传给 playwright
//
// 引擎职责（团队成员零心智）:
//   1. 环境预检: 登录态缺失自动 pnpm auth import（按用例 apps 画像的 daily 域）
//   2. 执行: playwright 按筛选跑 spec
//   3. 附件归档: 跑完把 .artifacts 下当次失败产物（截图/error-context/trace）拷进 runs/<ts>/
//   4. 回执: 自动写 runs/<ts>/run.yaml（先 running 后 done）
//   5. 状态同步: 回写用例 frontmatter last_run/last_result/status
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync, createWriteStream, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collect, genData } from './gen-data.mjs'

import { PLUGIN_ROOT, KB_ROOT } from './paths.mjs'
const ROOT = KB_ROOT

// 执行环境与执行参数从应用画像推导（零写死）：用例关联的 apps → 画像 frontmatter。
// envs 首位 = 默认环境（维护者把常用环境放首位）；exec.headers / exec.skip5xx 为执行参数透传。
// CLI/站点可用 BASE_URL / ENV_TAG 显式覆盖。画像未维护 envs → 报错指引。
function appConfig(cases) {
  const wanted = new Set(cases.flatMap((c) => c.apps || []))
  const { apps } = collect()
  for (const a of apps) {
    if (!wanted.has(a.name)) continue
    return a // 用例关联的第一个应用画像
  }
  return null
}
const ts = () => {
  const s = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-') // YYYY-MM-DD-HH-mm-ss（秒级防同分钟覆盖）
  return s
}

function pickCases(mode, arg) {
  const { cases } = collect()
  if (mode === 'case') return cases.filter((c) => c.id === arg)
  if (mode === 'ids') return cases.filter((c) => arg.split(',').includes(c.id))
  if (mode === 'domain') return cases.filter((c) => c.domain === arg && c.status !== 'deprecated')
  if (mode === 'smoke') return cases.filter((c) => c.priority === 'P0' && c.status === 'active')
  return []
}

function authPrecheck(baseUrl) {
  // 登录态预检：state.json 缺失 → 自动 import；存在 → 真探针验证（过期则给出登录链接，登录后重导）
  const host = new URL(baseUrl).hostname
  const state = join(ROOT, '.auth/state.json')
  if (!existsSync(state)) {
    console.log('[引擎] 缺登录态，自动导入（从你的浏览器）...')
    try {
      execFileSync('node', [join(PLUGIN_ROOT, 'scripts/kb-auth.mjs'), 'import', host], { stdio: 'inherit', cwd: PLUGIN_ROOT })
    } catch { return false }
  }
  try {
    execFileSync('node', [join(PLUGIN_ROOT, 'scripts/kb-auth.mjs'), 'verify', baseUrl], { stdio: 'inherit', cwd: PLUGIN_ROOT })
    return true
  } catch {
    console.error(`[引擎] 请在浏览器打开上方登录链接登录，然后重跑: pnpm auth import ${host}，再执行用例`)
    return false
  }
}

function writeReceipt(runDir, data) {
  mkdirSync(runDir, { recursive: true })
  // 原子写：先 tmp 再 rename——watcher 不会读到半截 yaml（读到会把回执当坏数据跳过，站点曾整页刷空）
  const tmp = join(runDir, '.run.yaml.tmp')
  writeFileSync(tmp, data)
  renameSync(tmp, join(runDir, 'run.yaml'))
}

// 安全读回 reporter 归档进本 runDir 的文本附件（网络请求/断言明细/环境警告）
function readRunFile(runDir, base) {
  try { return readFileSync(join(runDir, base), 'utf8') } catch { return '' }
}

function yamlEsc(s) { return String(s ?? '').replace(/\x1b\[[\d;]*m/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').replace(/\n/g, ' ').replace(/'/g, "''") } // 去 ANSI/控制符 + 单引号转义（三者任一都会致 YAML 整文件非法、站点刷空）

// 执行互斥：同一时刻仅一个引擎实例（playwright 跨进程并发会死锁——站点连点实证）
// 锁文件记录 pid，进程已死则视为陈锁可抢占
function acquireLock() {
  const LOCK = join(ROOT, '.kb-run.lock')
  if (existsSync(LOCK)) {
    const pid = Number(readFileSync(LOCK, 'utf8').trim())
    let alive = false
    try { process.kill(pid, 0); alive = true } catch { /* 进程已死 */ }
    if (alive) { console.error(`[引擎] 已有执行进行中（pid ${pid}），本次拒绝`); process.exit(2) }
    console.log(`[引擎] 清理陈锁（pid ${pid} 已退出）`)
  }
  writeFileSync(LOCK, String(process.pid))
  process.on('exit', () => { try { rmSync(LOCK, { force: true }) } catch {} })
}

export async function run(mode, arg) {
  acquireLock()
  const cases = pickCases(mode, arg)
  if (!cases.length) { console.error('无可执行用例（检查 id/域/优先级与状态）'); process.exit(1) }
  console.log(`[引擎] ${cases.length} 个用例: ${cases.map((c) => c.id).join(', ')}`)

  // 执行环境与执行参数：显式 BASE_URL 优先，否则按用例关联应用画像 envs 推导；headers/skip5xx 从画像 exec 透传
  const cfg = appConfig(cases)
  const BASE_URL = (process.env.BASE_URL || String(Object.values(cfg?.envs || {})[0] || '')).replace(/\/$/, '')
  if (!BASE_URL) {
    console.error('[引擎] 未找到执行环境：请在用例关联的应用画像（apps/*.md）frontmatter 维护 envs（常用环境放首位），或显式指定 BASE_URL=...')
    process.exit(1)
  }
  const extraHeaders = JSON.stringify(cfg?.exec?.headers || {})
  // 项目环境标签的请求头名：域配置 tagHeader（domains/<域>/_config.yaml）优先，默认 envtag（各团队 key 可不同）
  const tagHeader = String(cases[0]?.tagHeader || 'envtag')
  console.log(`[引擎] 目标环境: ${BASE_URL}${process.env.ENV_TAG ? ' (' + tagHeader + ' ' + process.env.ENV_TAG + ')' : ''}`)
  // 环境显示名：画像 envs 反查短名（daily/pre...，与站点执行下拉一致）；自定义 URL 无匹配退 hostname
  const envKey = String(Object.entries(cfg?.envs || {}).find(([, v]) => String(v).replace(/\/$/, '') === BASE_URL)?.[0] || new URL(BASE_URL).hostname)
  const envLabel = `${envKey}${process.env.ENV_TAG ? ' · ' + process.env.ENV_TAG : ''}`

  const authMode = String(cfg?.auth || '')
  if (authMode === 'none') {
    console.log('[引擎] 公开站点（画像 auth: none）——跳过登录探针')
  } else if (!authPrecheck(BASE_URL)) { console.error('[引擎] 登录态获取失败，中止'); process.exit(1) }

  const runId = ts()
  const runDir = join(ROOT, 'runs', runId)
  const today = new Date().toISOString().slice(0, 10)
  const specFiles = [...new Set(cases.map((c) => c.spec).filter(Boolean))]
  const byCase = Object.fromEntries(cases.map((c) => [c.id, c.spec]))

  // 回执数据结构：内存持有，每条用例完成立即 flush（站点逐个变绿，不用等整批）
  const receipt = {
    runId,
    date: new Date().toLocaleString('zh-CN', { hour12: false }),
    status: 'running',
    env: envKey,
    envTag: process.env.ENV_TAG || '',
    trigger: 'cli',
    summary: { total: cases.length, pass: 0, fail: 0, blocked: 0 },
    cases: cases.map((c) => ({ id: c.id, result: c.spec ? 'pending' : 'skipped', duration_s: 0, notes: c.spec ? '' : '缺 spec（未自动化），跳过' })),
  }
  const caseById = Object.fromEntries(receipt.cases.map((c) => [c.id, c]))
  const artList = (id) => {
    // 结果.md 永远排第一（抽屉入口靠它打开明细），其余附件按归档时序
    const head = existsSync(join(runDir, id, `${id}-结果.md`)) ? [`${id}/${id}-结果.md`] : []
    if (ordered[id]?.length) return [...head, ...ordered[id]].slice(0, 9)
    const dir = join(runDir, id)
    if (!existsSync(dir)) return []
    return readdirSync(dir).map((f) => `${id}/${f}`).slice(0, 9)
  }
  function flush() {
    writeReceipt(runDir, `run_id: ${receipt.runId}\ndate: ${receipt.date}\nstatus: ${receipt.status}\nenv: ${receipt.env}${receipt.envTag ? `\nenv_tag: ${receipt.envTag}` : ''}\ntrigger: ${receipt.trigger}\nsummary: { total: ${receipt.summary.total}, pass: ${receipt.summary.pass}, fail: ${receipt.summary.fail}, blocked: ${receipt.summary.blocked} }\ncases:\n${receipt.cases.map((c) => {
      const arts = artList(c.id)
      return `  - id: ${c.id}\n    result: ${c.result}\n    duration_s: ${c.duration_s}\n    notes: '${yamlEsc(c.notes)}'${arts.length ? `\n    artifacts:\n${arts.map((a) => `      - ${a}`).join('\n')}` : ''}`
    }).join('\n')}\n`)
  }
  // 执行（缺 spec 的用例直接标 skipped）
  const noSpec = cases.filter((c) => !c.spec).map((c) => c.id)
  let passIds = [], failIds = [], blockedIds = [], notes = {}, fullErr = {}, netText = {}, ordered = {}, assertText = {}, envWarn = {}
  const t0 = Date.now()
  // 引擎自记录 + 崩溃自愈：任何未捕获异常——堆栈进 engine.log、僵尸 pending 收尾标阻塞、回执落定 done。
  // 站点派发的引擎 stdio 被 ignore，死了无从查起；这里自己留尸检 + 不留永久 running。
  let logWrite = () => {}
  let engineLog = null
  try { const es = createWriteStream(join(runDir, 'engine.log')); engineLog = es; logWrite = es.write.bind(es) } catch { /* 日志失败不致命 */ }
  const origLog = console.log.bind(console)
  console.log = (...a) => { origLog(...a); try { logWrite(a.join(' ') + '\n') } catch {} }
  console.error = (...a) => { origLog(...a); try { logWrite('[ERR] ' + a.join(' ') + '\n') } catch {} }
  process.on('uncaughtException', (e) => {
    try { engineLog.write('[FATAL uncaught] ' + (e?.stack || e) + '\n') } catch {}
    for (const c of receipt.cases) if (c.result === 'pending') { c.result = 'blocked'; c.notes = '引擎异常中断'; receipt.summary.blocked++ ; blockedIds.push(c.id) }
    receipt.status = 'done'
    try { flush() } catch {}
    process.exit(1)
  })
  process.on('unhandledRejection', (e) => {
    try { engineLog.write('[FATAL rejection] ' + (e?.stack || e) + '\n') } catch {}
  })
  flush() // 开跑即写 running 回执（全 pending）——首条完成前站点也能看到「进行中」
  // 即时回写单条用例 frontmatter（last_run/last_result；status 是用例生命周期，不碰）
  function writeCaseFrontmatter(c, status, today) {
    const file = join(ROOT, 'domains', c.domain, c.id + '.md')
    if (!existsSync(file)) return
    try {
      let text = readFileSync(file, 'utf8')
      // 首跑的用例 frontmatter 尚无 last_run/last_result 行——replace 不中，需在 frontmatter 结尾插入
      if (!/^last_run:/m.test(text)) {
        text = text.replace(/^---\n([\s\S]*?)\n---/, (_m, fm) => `---\n${fm}\nlast_run: ${today}\nlast_result: ${status}\n---`)
      } else {
        text = text
          .replace(/^last_run:.*$/m, `last_run: ${today}`)
          .replace(/^last_result:.*$/m, `last_result: ${status}`)
      }
      writeFileSync(file, text)
    } catch { /* 回写失败不影响执行 */ }
  }
  for (const c of cases.filter((x) => noSpec.includes(x.id))) {
    blockedIds.push(c.id)
    writeCaseFrontmatter(c, 'blocked', today)
  }

  // 逐条实时回执：一次 playwright 全量跑（批量性能不变），自定义 reporter 每完成一条写进度文件，
  // 引擎轮询合并进回执——完成一个绿一个，100 条级别也无额外浏览器启动开销
  const runnable = cases.filter((c) => c.spec)
  if (runnable.length) {
    const artDir = join(ROOT, '.artifacts')
    mkdirSync(artDir, { recursive: true })
    const progressFile = join(artDir, 'progress.jsonl')
    rmSync(progressFile, { force: true })
    const child = spawn('npx', ['playwright', 'test', ...specFiles.map((s) => join(ROOT, s)), '--reporter=json', '--reporter=./scripts/kb-progress-reporter.mjs', '--output', artDir], {
      cwd: PLUGIN_ROOT, // playwright 依赖在插件仓（数据目录无 node_modules；spec 路径均为绝对路径）
      stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
      // BASE_URL 显式带上：CLI 直跑时引擎从画像推导的值不在 process.env（经站点 API 派发则由上层注入，此处同值覆盖无影响）
      // KB_LOCALE/KB_TIMEZONE：画像 exec.locale/timezone（被测应用语言默认，多语言用例在画像层改）
      env: { ...process.env, BASE_URL, EXTRA_HEADERS: extraHeaders, KB_LOCALE: String(cfg?.exec?.locale || process.env.KB_LOCALE || ''), KB_TIMEZONE: String(cfg?.exec?.timezone || process.env.KB_TIMEZONE || ''), ...(process.env.ENV_TAG ? { ENV_TAG_HEADER: tagHeader } : {}), KB_PROGRESS_FILE: progressFile, KB_RUN_DIR: runDir },
    })
    // playwright stderr（收集期编译错/运行期告警）落 engine.log——stdio inherit 时只进终端，站点派发后无从查起
    child.stderr?.on('data', (d) => { try { logWrite('[pw-err] ' + String(d)) } catch {} })
    let seen = 0
    // 轮询体抽函数：间隔调用 + child close 后终排一次——最后一条的进度行可能落在最后间隔里（实测丢过 004）
    function drainProgress() {
      let lines = []
      try { lines = readFileSync(progressFile, 'utf8').split('\n').filter(Boolean) } catch { return /* 尚未生成 */ }
      let dirty = false
      for (const line of lines.slice(seen)) {
        seen++
        let p
        try { p = JSON.parse(line) } catch { continue }
        const id = Object.keys(byCase).find((k) => p.title.includes(k))
        const entry = id && caseById[id]
        if (!entry || entry.result !== 'pending') continue // 只推进 pending（兜底判定不重复计）
        const status = p.status === 'passed' ? 'pass' : p.status === 'skipped' || p.status === 'timedOut' || p.status === 'interrupted' ? 'blocked' : 'fail'
        // 去 ANSI（reporter 原样透传终端控制符，进 YAML 会整文件非法）
        const cleanErr = String(p.error || '').replace(/\x1b\[[\d;]*m/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
        entry.result = status
        entry.duration_s = Math.max(1, Math.round((p.duration_ms || 0) / 1000))
        entry.notes = status === 'pass' ? '通过' : cleanErr.split('\n').filter(Boolean).slice(0, 3).join(' ').slice(0, 180)
        if (status !== 'pass') notes[id] = entry.notes
        // reporter 已逐条归档附件——文本类读回供 结果.md 组装（f 含用例子目录前缀，整段拼路径），其余记入 ordered
        const seenArts = new Set(ordered[id] || [])
        for (const f of p.artifacts || []) {
          if (seenArts.has(f)) continue // 同名重复挂载（expectItem 每次断言都 attach 同一文件）只记一次
          seenArts.add(f)
          ;(ordered[id] = ordered[id] || []).push(f)
          const base = f.split('/').pop()
          if (base.includes('网络请求')) netText[id] = readRunFile(runDir, f)
          if (base.includes('断言明细')) assertText[id] = readRunFile(runDir, f).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
          if (base.includes('环境警告')) envWarn[id] = readRunFile(runDir, f)
        }
        receipt.summary[status]++
        ;(status === 'pass' ? passIds : status === 'blocked' ? blockedIds : failIds).push(id)
        if (status !== 'pass' && !fullErr[id]) fullErr[id] = cleanErr
        const c = cases.find((x) => x.id === id)
        if (c) {
          writeCaseFrontmatter(c, status, today)
          writeResultMd(c) // 结果.md 即时生成——running 期间点开抽屉就有失败原因/断言/网络明细
        }
        console.log(`[引擎] ${id} ${status === 'pass' ? '✅' : status === 'blocked' ? '⏸' : '❌'}（${entry.duration_s}s）`)
        dirty = true
      }
      if (dirty) flush()
    }
    const poll = setInterval(drainProgress, 2000)
    let stdoutBuf = ''
    child.stdout?.on('data', (d) => (stdoutBuf += d)) // json reporter 大输出分片到达，必须积累（单次 read 不完整）
    await new Promise((rel) => child.on('close', rel))
    clearInterval(poll)
    drainProgress() // 终排：吸收 close 后落盘的最后进度行

    // JSON 全量报告：兜底判定（reporter 失败/中断时轮询漏掉的）+ 失败详情；归档已由 reporter 逐条完成
    let json = null
    const stdout = stdoutBuf
    try { json = JSON.parse(stdout.trim()) } catch { /* 解析失败靠轮询结果兜底 */ }
    if (!json) { try { const m = stdout.match(/\{\s*"config"[\s\S]*\}/); if (m) json = JSON.parse(m[0]) } catch { /* 兜底按退出码 */ } }
    const ansi = (s) => String(s ?? '').replace(/\x1b\[[\d;]*m/g, '')
    if (json) {
      for (const s of json.suites || []) for (const st of s.specs || []) {
        const id = Object.keys(byCase).find((k) => st.title.includes(k)) || st.title.slice(0, 40)
        const r = st.tests?.[0]?.results?.[0]
        if (r?.error?.message) fullErr[id] = ansi(r.error.message)
        // 兜底判定：轮询未覆盖（reporter 失败/进程中断）的用例按全量报告判；附件归档已由 reporter 逐条完成
        const entry = caseById[id]
        if (entry && entry.result === 'pending' && id !== st.title) {
          const status = st.ok ? 'pass' : r?.status === 'timedOut' || r?.status === 'interrupted' ? 'blocked' : 'fail'
          entry.result = status
          receipt.summary[status]++
          ;(status === 'pass' ? passIds : status === 'blocked' ? blockedIds : failIds).push(id)
          if (status !== 'pass') { entry.notes = ansi(r?.error?.message || '').split('\n').filter(Boolean).slice(0, 3).join(' ').slice(0, 180); notes[id] = entry.notes }
        }
      }
    }
    // 清理 .artifacts 中间产物（信息已进报告/结果.md）
        if (existsSync(artDir)) for (const name of readdirSync(artDir)) rmSync(join(artDir, name), { recursive: true, force: true })
  }
  for (const id of noSpec) notes[id] = '缺 spec（未自动化）'

  // 回执 2/2：每用例一份「结果.md」（人读单文件）——判定后立即写（running 期间抽屉即看得到），
  // done 阶段再统一重写一遍（信息同源，幂等）
  // 终极兜底：终排后仍 pending（reporter+json 双失）→ 阻塞，不留永久 pending
  for (const c of receipt.cases) if (c.result === 'pending') { c.result = 'blocked'; c.notes = '引擎未收到该用例结果（reporter 双源缺失）'; receipt.summary.blocked++; blockedIds.push(c.id) }
  // 结果.md 生成（drain 判定后与 done 收尾共用；此时段 fullErr/netText/assertText 已就位）
  // 状态直接读回执条目——不引用下方 resultOf（其在 drain 首次调用时尚未初始化，TDZ 会炸引擎）
  function writeResultMd(c) {
    const r = caseById[c.id]?.result || 'fail'
    mkdirSync(join(runDir, c.id), { recursive: true })
    // 附件按归档时序（时间正序）展示
    const files = (ordered[c.id] || []).map((f) => f.split('/').pop()).filter((f) => f !== `${c.id}-结果.md`)
    const L = [
      `# ${c.id} ${c.title || ''} — ${r === 'pass' ? '✅ 通过' : r === 'blocked' ? '⏸ 阻塞' : '❌ 失败'}`,
      '',
      `- 环境: ${envLabel} | ${new Date().toLocaleString('zh-CN', { hour12: false })} | 耗时 ${Math.round((Date.now() - t0) / 1000)}s`,
      `- spec: ${c.spec || '无'}`,
    ]
    if (r === 'fail') {
      L.push('', '## 失败原因', '', '```', (fullErr[c.id] || notes[c.id] || '（未能提取错误信息）').split('\n').slice(0, 40).join('\n'), '```')
      const srv = (fullErr[c.id] || '').split('\n').filter((l) => /traceid=|\[\d{3}\]/.test(l)).slice(0, 10)
      if (srv.length) L.push('', '## 服务端错误（含链路 traceid，可直接进日志平台检索）', '', '```', srv.join('\n'), '```')
      if (netText[c.id]) L.push('', '## 网络请求明细（xhr/fetch）', '', '```', netText[c.id], '```')
    }
    // 断言段：md 预期 checklist 逐项三态勾选——✅ 该断言通过 / ❌ 该断言失败 / ⚠️ 未执行到（含失败之后的全量）；
    // 顺序语义：断言按序执行，首个 ❌ 之后的项即使无记录也标 ⚠️；
    // 真实「实际」观察追加彩色行：✓ 绿 = 实测文本，✗ 红 = 失败摘要；纯「断言通过」噪音不显示。
    try {
      const caseMd = readFileSync(join(ROOT, 'domains', c.domain, c.id + '.md'), 'utf8')
      const assertSec = (caseMd.match(/## 断言\s*\n([\s\S]*?)(\n## |$)/) || [])[1]?.trim()
      if (assertSec) {
        const norm = (s) => String(s).replace(/[「」\[\]()（）\s·，,。:：;；\-—]/g, '')
        const all = assertText[c.id] || []
        const meaningful = all.filter((it) => it.status === 'fail' || (it.detail && it.detail !== '断言通过'))
        const used = new Set()
        const items = assertSec.replace(/^-\s*/gm, '').split('\n').map((s) => s.replace(/\[x\]|\[ \]/g, '').trim()).filter(Boolean)
        let failedSeen = false
        const lines = items.map((text) => {
          // 两轮匹配防歧义：同名/超集描述并存时，先归一化相等（精确），再双向包含（模糊）
          const match = (eq) => all.find((it, i) => {
            if (used.has(i)) return false
            const a = norm(it.text), b = norm(text)
            return a && b && (eq ? a === b : a.includes(b) || b.includes(a))
          })
          const hit = match(true) || match(false)
          if (hit) used.add(all.indexOf(hit))
          let mark
          if (hit && hit.status === 'pass') mark = '✅'
          else if (hit && hit.status === 'fail') mark = '❌'
          else if (failedSeen || r === 'blocked') mark = '⚠️' // 失败已出现 / 用例整体阻塞 → 未执行到
          else mark = r === 'pass' ? '✅' : '❌'
          if (mark === '❌') failedSeen = true
          const actual = hit && meaningful.includes(hit) ? `\n  实际${hit.status === 'pass' ? '✓' : '✗'} ${hit.detail}` : ''
          return `- ${mark} ${text}${actual}`
        })
        meaningful.forEach((it) => {
          if (!used.has(all.indexOf(it))) lines.push(`  实际${it.status === 'pass' ? '✓' : '✗'} ${it.text}：${it.detail}`)
        })
        L.push('', '## 断言（预期结果）', '', ...lines)
      }
    } catch { /* 用例 md 缺失则跳过 */ }
    if (envWarn[c.id]) L.push('', '## 异常白名单外的接口警告（5xx，不影响判定）', '', '```', envWarn[c.id].split('\n').slice(0, 10).join('\n'), '```')
    if (files.length) L.push('', '## 附件', '', ...files.map((f) => `- ${f}`))
    writeFileSync(join(runDir, c.id, `${c.id}-结果.md`), L.join('\n') + '\n')
  }
  for (const c of cases) if (!noSpec.includes(c.id)) writeResultMd(c)

  receipt.status = 'done'
  flush()

  genData() // 站点数据即时刷新
  const summary = `summary: { total: ${cases.length}, pass: ${passIds.length}, fail: ${failIds.length}, blocked: ${blockedIds.length} }`
  console.log(`[引擎] 完成: ${summary.replace('summary: ', '')} — runs/${runId}/（站点已同步）`)
  process.exit(failIds.length || blockedIds.length ? 1 : 0)
}

const [mode, arg] = process.argv.slice(2)
if (!['case', 'ids', 'domain', 'smoke'].includes(mode)) {
  console.error('用法: kb run:case <TC-ID> | run:ids <ID,ID,...> | run:domain <域> | run:smoke')
  process.exit(1)
}
run(mode, arg)
