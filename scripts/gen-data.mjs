// gen-data.mjs — 扫描 domains/apps/runs，聚合生成 .vitepress/theme/data.ts
// dev/build 时由 config.mts 自动调用；VitePress 组件直接 import
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

import { PLUGIN_ROOT, KB_ROOT } from './paths.mjs'
const ROOT = KB_ROOT

export function parseFrontmatter(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return { fm: null, body: text }
  try {
    return { fm: yaml.load(m[1]) || {}, body: text.slice(m[0].length) }
  } catch {
    return { fm: { _error: 'yaml parse fail' }, body: text }
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (name.endsWith('.md')) out.push(p)
  }
  return out
}

export function collect() {
  const cases = []
  for (const file of walk(join(ROOT, 'domains'))) {
    const { fm } = parseFrontmatter(file)
    if (!fm || fm._error) continue
    // yaml 裸日期会被解析成 Date（序列化成 ISO 串），统一转回日期字符串
    if (fm.last_run instanceof Date) fm.last_run = fm.last_run.toISOString().slice(0, 10)
    cases.push({
      ...fm,
      url: '/' + relative(ROOT, file).replace(/\.md$/, ''),
    })
  }
  // 重复 id 拒绝：保首个，其余丢弃并警告（防手滑把用例 md 放错目录层导致同 id 双跑）
  const seen = new Set()
  const dup = []
  const uniq = []
  for (const c of cases) (seen.has(c.id) ? dup.push(c) : (seen.add(c.id), uniq.push(c)))
  if (dup.length) console.error('[collect] 重复 id 已拒绝: ' + dup.map((c) => c.id + ' <- ' + c.url).join('; ') + '（保留首个定义）')
  cases.length = 0
  cases.push(...uniq)
  cases.sort((a, b) => (a.id > b.id ? 1 : -1))
  // 域级执行配置：domains/<域>/_config.yaml（如项目环境标签的请求头名 tagHeader，各团队可不同）
  const domainCfgs = {}
  const domainsDir = join(ROOT, 'domains')
  for (const name of readdirSync(domainsDir)) {
    const f = join(domainsDir, name, '_config.yaml')
    if (statSync(f, { throwIfNoEntry: false })?.isFile()) {
      try { domainCfgs[name] = yaml.load(readFileSync(f, 'utf8')) || {} } catch { domainCfgs[name] = {} }
    }
  }
  const apps = []
  const appsDir = join(ROOT, 'apps')
  if (statSync(appsDir, { throwIfNoEntry: false })) {
    for (const file of walk(appsDir)) {
      const { fm } = parseFrontmatter(file)
      if (!fm) continue
      apps.push({
        name: fm.name || fm.id,
        kind: fm.kind || '',
        envs: fm.envs || {}, // 执行环境入口（daily/pre...），站点执行配置下拉数据源
        auth: fm.auth || '', // none=公开站点无需登录态（引擎跳过登录探针）
        exec: fm.exec || {}, // 执行参数（headers/locale/timezone 等透传给引擎）
        url: '/' + relative(ROOT, file).replace(/\.md$/, ''),
      })
    }
    apps.sort((a, b) => (a.name > b.name ? 1 : -1))
  }

  const runs = []
  const runsDir = join(ROOT, 'runs')
  for (const name of statSync(runsDir, { throwIfNoEntry: false })?.isDirectory() ? readdirSync(runsDir) : []) {
    const runFile = join(runsDir, name, 'run.yaml')
    if (!statSync(runFile, { throwIfNoEntry: false })) continue
    let r = null
    // 读半截/瞬时解析失败重试一次（写入与聚合并发时的竞态窗口；重试仍失败才跳过）
    for (let i = 0; i < 2 && r === null; i++) {
      try { r = yaml.load(readFileSync(runFile, 'utf8')) } catch { if (i === 0) sleepSync(60) }
    }
    if (r && typeof r === 'object') { r._dir = join(runsDir, name); runs.push(r) }
  }
  // 时间倒序（date 字段优先，回退 run_id；目录名格式不统一不作排序依据）
  // 按 run_id 倒序（固定格式补零，字典序=时间序）——date 是本地化字符串（10/9 不补零），字符串比较会把旧回执排前（实测踩过）
  runs.sort((a, b) => String(b?.run_id || '').localeCompare(String(a?.run_id || '')))
  // 每个 case 注入最近一次执行的 notes（失败原因透出）
  for (const c of cases) {
    const r = runs.find((x) => (x.cases || []).some((cc) => cc.id === c.id && cc.notes))
    c.last_notes = r ? (r.cases.find((cc) => cc.id === c.id).notes || '') : ''
  }
  return { cases, apps, runs, domainCfgs }
}

export function genData() {
  // plugin 模式：data.ts 为手写运行时模块（fetch /__kb/data），此处仅命令行体检聚合
  const { cases, apps, runs } = collect()
  return { cases: cases.length, apps: apps.length, runs: runs.length, changed: true }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(genData())
}
