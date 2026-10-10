#!/usr/bin/env node
// kb-init — 初始化数据目录（纯本地私有）：依赖自举（node_modules + Chromium）→ 从插件仓 examples 播种首个域 → node_modules 软链
// 幂等：已存在的文件/已装的依赖不重做；再次执行只补缺。Windows：junction 软链 + .cmd 走 shell。
import { cpSync, existsSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readdirSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { PLUGIN_ROOT, KB_ROOT } from './paths.mjs'

// ── 依赖自举：插件是 clone 下来的（plugin add 不装依赖），首次 init 在插件仓就地补齐 ──
const SHELL = process.platform === 'win32' // win32 下 pnpm/npm/npx 是 .cmd，必须走 shell
const run = (cmd, args) => spawnSync(cmd, args, { cwd: PLUGIN_ROOT, stdio: 'inherit', shell: SHELL }).status === 0
if (!existsSync(join(PLUGIN_ROOT, 'node_modules', '@playwright', 'test'))) {
  console.log('□ 安装插件依赖（首次约 1-2 分钟）…')
  const hasPnpm = spawnSync('pnpm', ['-v'], { shell: SHELL }).status === 0
  if (!run(hasPnpm ? 'pnpm' : 'npm', ['install'])) { console.error('✗ 依赖安装失败——请检查 node/npm 后重试，或手动在插件目录执行 ' + (hasPnpm ? 'pnpm' : 'npm') + ' install'); process.exit(1) }
  console.log('✓ 插件依赖就绪')
}
{
  // Chromium 检测：playwright-core 的 executablePath 不存在即需补装（install 幂等）
  let needBrowser = true
  try {
    const { chromium } = await import('playwright-core')
    needBrowser = !existsSync(chromium.executablePath())
  } catch { /* playwright-core 不可用（异常态）——交给 playwright install 兜底 */ }
  if (needBrowser) {
    console.log('□ 下载 Chromium（首次约 1-2 分钟）…')
    if (!run('npx', ['playwright', 'install', 'chromium'])) { console.error('✗ Chromium 下载失败——检查网络后重试，或手动执行: npx playwright install chromium'); process.exit(1) }
    console.log('✓ Chromium 就绪')
  }
}


const SEEDS = ['domains', 'apps', 'specs', 'knowledge', '_templates']
const PAGES = ['index.md', 'progress.md'] // 站点入口页（VitePress srcDir=数据目录）
mkdirSync(KB_ROOT, { recursive: true })
let created = 0
for (const dir of SEEDS) {
  const src = join(PLUGIN_ROOT, 'examples', dir)
  if (!existsSync(src)) continue
  const dst = join(KB_ROOT, dir)
  if (!existsSync(dst)) { cpSync(src, dst, { recursive: true }); created++; console.log(`✓ 播种 ${dir}/`); continue }
  // 目录已存在：只补子项（不覆盖同名——用户改过的东西优先）
  for (const item of readdirSync(src)) {
    const s = join(src, item), d = join(dst, item)
    if (!existsSync(d)) { cpSync(s, d, { recursive: true }); created++; console.log(`✓ 补 ${dir}/${item}`) }
  }
}
// spec 在数据目录运行，import '@playwright/test' / fixture 依赖插件仓 node_modules——软链一次到位
const link = join(KB_ROOT, 'node_modules')
const target = join(PLUGIN_ROOT, 'node_modules')
if (!existsSync(link) && existsSync(target)) {
  try { symlinkSync(target, link, 'junction'); console.log('✓ node_modules → 插件依赖（软链）') }
  catch (e) { console.log(`⚠ 软链失败（${e.message}）——手动执行: ln -s ${target} ${link}`) }
} else if (existsSync(link) && existsSync(target)) {
  // 已有软链：目标换了插件目录（升级/重装）时刷新指向
  try {
    const cur = readlinkSync(link)
    if (cur !== target) { rmSync(link); symlinkSync(target, link, 'junction'); console.log('✓ node_modules 软链已刷新 → 插件依赖') }
  } catch {}
}
// 公开站点示例（无需登录）：种一个空登录态占位，避免引擎登录探针链路对无 cookie 场景报错
mkdirSync(join(KB_ROOT, '.auth'), { recursive: true })
const stateFile = join(KB_ROOT, '.auth/state.json')
if (!existsSync(stateFile)) { writeFileSync(stateFile, JSON.stringify({ cookies: [], origins: [] }, null, 2)); console.log('✓ 空登录态占位（.auth/state.json——公开站点可直接跑）') }
for (const pg of PAGES) {
  const dst = join(KB_ROOT, pg)
  if (!existsSync(dst)) { cpSync(join(PLUGIN_ROOT, pg), dst); console.log(`✓ 页面 ${pg}`) }
}
// 数据目录想 git 共享时的忽略模板
const gitignore = join(KB_ROOT, '.gitignore')
if (!existsSync(gitignore)) {
  writeFileSync(gitignore, 'runs/\n.auth/\n.artifacts/\n.kb-run.lock\n.kb-memory.json\nnode_modules\n')
  console.log('✓ .gitignore（runs/登录态不入库）')
}
console.log(`\n数据目录就绪：${KB_ROOT}${created ? '' : '（无新增）'}`)
