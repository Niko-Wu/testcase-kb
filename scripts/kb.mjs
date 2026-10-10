#!/usr/bin/env node
// kb.mjs — 用例库 CLI：scan / validate / new / import
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collect } from './gen-data.mjs'

import { PLUGIN_ROOT, KB_ROOT } from './paths.mjs'
const ROOT = KB_ROOT

const ENUM = {
  type: ['e2e', 'smoke', 'api'],
  priority: ['P0', 'P1', 'P2'],
  status: ['draft', 'active', 'flaky', 'deprecated'],
  result: ['pass', 'fail', 'blocked', ''],
}

function validate({ cases }) {
  const errs = []
  const seen = new Set()
  for (const c of cases) {
    const where = c.id || c.url
    for (const f of ['id', 'domain', 'apps', 'title', 'priority', 'type', 'status']) {
      if (!c[f]) errs.push(`${where}: 缺必填字段 ${f}`)
    }
    if (c.id) {
      if (seen.has(c.id)) errs.push(`${c.id}: id 重复`)
      seen.add(c.id)
      const fileBase = c.url.split('/').pop()
      if (fileBase !== c.id) errs.push(`${c.id}: id 与文件名 ${fileBase}.md 不一致`)
    }
    if (c.domain && !c.url.includes(`/domains/${c.domain}/`)) {
      errs.push(`${where}: domain "${c.domain}" 与所在目录不一致`)
    }
    if (!Array.isArray(c.apps) || !c.apps.length) errs.push(`${where}: apps 必须是非空数组`)
    for (const [f, values] of Object.entries(ENUM)) {
      if (c[f] && !values.includes(c[f])) errs.push(`${where}: ${f}="${c[f]}" 不在 ${JSON.stringify(values)}`)
    }
  }
  return errs
}

// ---- kb new / kb import ----

function parseArgs(argv) {
  const opts = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) opts[a.slice(2)] = argv[++i]
    else opts._.push(a)
  }
  return opts
}

function nextId(domain, prefix) {
  const { cases } = collect()
  const re = new RegExp(`^TC-([A-Z0-9]+)-(\\d+)$`)
  const nums = []
  let inferred = ''
  for (const c of cases) {
    if (c.domain !== domain) continue
    const m = re.exec(c.id || '')
    if (m) { inferred = inferred || m[1]; nums.push(+m[2]) }
  }
  const p = (prefix || inferred).toUpperCase()
  if (!p) { console.error('该域无用例，无法推断 id 前缀，请 --prefix XXX 指定'); process.exit(1) }
  return { id: `TC-${p}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`, prefix: p }
}

function templateBody() {
  const tpl = readFileSync(join(ROOT, '_templates/TC.md'), 'utf8')
  return tpl.slice(tpl.indexOf('---', 3) + 3) // frontmatter 之后的正文
}

function writeCase(domain, title, { apps, priority, type, status, prefix }) {
  const { id } = nextId(domain, prefix)
  const dir = join(ROOT, 'domains', domain)
  mkdirSync(dir, { recursive: true })
  const fm = [
    '---',
    `id: ${id}`,
    `domain: ${domain}`,
    `apps: [${apps.split('|').map((s) => s.trim()).join(', ')}]`,
    `title: ${title}`,
    `priority: ${priority || 'P1'}`,
    `type: ${type || 'e2e'}`,
    `status: ${status || 'draft'}`,
    `spec: ''`,
    `last_run: ''`,
    `last_result: ''`,
    '---',
  ].join('\n')
  const file = join(dir, `${id}.md`)
  if (existsSync(file)) { console.error(`${id} 已存在`); process.exit(1) }
  writeFileSync(file, fm + '\n# ' + title + '\n' + templateBody())
  console.log(`✓ 已创建 domains/${domain}/${id}.md — 记得补步骤/断言，然后 pnpm validate`)
}

function cmdNew(opts) {
  const [domain, title] = opts._
  if (!domain || !title) { console.error('用法: kb new <domain> <title> [--apps a|b] [--priority P0] [--type e2e] [--prefix XXX]'); process.exit(1) }
  writeCase(domain, title, {
    apps: opts.apps || '', priority: opts.priority, type: opts.type, status: opts.status, prefix: opts.prefix,
  })
  if (!opts.apps) console.error('⚠ 未传 --apps，validate 会报缺字段；补: --apps <应用1>|<应用2>')
}

function cmdImport(opts) {
  const [csv] = opts._
  const domain = opts.domain
  if (!csv || !domain) { console.error('用法: kb import <cases.csv> --domain <域> [--prefix XXX]'); process.exit(1) }
  // CSV 格式（首行表头必须）: title,apps,priority,type,status  — apps 用 | 分隔多值，字段内不要逗号
  const lines = readFileSync(csv, 'utf8').split(/\r?\n/).filter((l) => l.trim())
  const header = lines[0].split(',').map((s) => s.trim())
  const need = ['title', 'apps', 'priority', 'type', 'status']
  for (const h of need) if (!header.includes(h)) { console.error(`表头缺 ${h}；要求: ${need.join(',')}`); process.exit(1) }
  let n = 0
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((s) => s.trim())
    const row = Object.fromEntries(header.map((h, i) => [h, cells[i] || '']))
    if (!row.title) continue
    writeCase(domain, row.title, row)
    n++
  }
  console.log(`✓ 导入 ${n} 条到 domains/${domain}/（正文为模板占位，需补步骤/断言）`)
}

const cmd = process.argv[2] || 'scan'
const data = collect()

if (cmd === 'scan') {
  const by = (k) => data.cases.reduce((acc, c) => ((acc[c[k]] = (acc[c[k]] || 0) + 1), acc), {})
  console.log(`用例 ${data.cases.length} 条 / 应用画像 ${data.apps.length} 个 / 回执 ${data.runs.length} 次`)
  console.log('按状态:', JSON.stringify(by('status')))
  console.log('按域:  ', JSON.stringify(by('domain')))
  console.log('按优先级:', JSON.stringify(by('priority')))
  for (const c of data.cases) {
    console.log(`  ${c.status.padEnd(10)} ${c.priority}  ${c.id}  ${c.title}  [${(c.apps || []).join(',')}]`)
  }
} else if (cmd === 'validate') {
  const errs = validate(data)
  // 回执中的 case id 必须能对上用例
  const ids = new Set(data.cases.map((c) => c.id))
  for (const r of data.runs) {
    for (const c of r.cases || []) {
      if (!ids.has(c.id)) errs.push(`run ${r.run_id}: 用例 ${c.id} 不存在于 domains/`)
    }
  }
  if (errs.length) {
    console.error(`✗ ${errs.length} 个问题:`)
    for (const e of errs) console.error('  - ' + e)
    process.exit(1)
  }
  console.log(`✓ ${data.cases.length} 条用例全部通过校验`)
} else if (cmd === 'new') {
  cmdNew(parseArgs(process.argv.slice(3)))
} else if (cmd === 'import') {
  cmdImport(parseArgs(process.argv.slice(3)))
} else {
  console.error('用法: kb scan | kb validate | kb new <domain> <title> [opts] | kb import <csv> --domain <域>')
  process.exit(1)
}
