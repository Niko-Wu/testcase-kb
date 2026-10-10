#!/usr/bin/env node
// kb auth — 登录态管理
// 用法: kb auth import <host>   从你的浏览器提取全套 cookie → .auth/state.json（storageState 格式）
//       kb auth check <host>    探针验证 state.json 对目标域是否有效（302→SSO / 登录页 = 失效）
//
// 原理与兜底见 speckit-workflow shared/auth/cookie-flow.md（本命令是其薄包装，提取脚本直引插件仓）
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PLUGIN_ROOT, KB_ROOT } from './paths.mjs'
const ROOT = KB_ROOT
const EXTRACT_CANDIDATES = [
  '/Users/niko/zNikoApp/code/speckit-workflow/shared/auth/extract_cookies.mjs',
  join(process.env.HOME || '', '.claude/plugins/marketplaces/speckit-workflow/shared/auth/extract_cookies.mjs'),
]

function extractScript() {
  for (const p of EXTRACT_CANDIDATES) if (existsSync(p)) return p
  console.error('未找到 extract_cookies.mjs（依赖 speckit-workflow 插件）。候选路径都缺，请装插件或手提 cookie。')
  process.exit(1)
}

const [sub, host] = process.argv.slice(2)
if (sub === 'import') {
  if (!host) { console.error('用法: kb auth import <host>（host 见应用画像 envs）'); process.exit(1) }
  const script = extractScript()
  execFileSync('node', [script, '--host', host, '--format', 'storageState', '--output', join(ROOT, '.auth/state.json')], { stdio: 'inherit' })
  console.log(`✓ 登录态已写入 .auth/state.json（host: ${host}）`)
} else if (sub === 'check') {
  const state = join(ROOT, '.auth/state.json')
  if (!existsSync(state)) { console.error('✗ .auth/state.json 不存在，先 kb auth import'); process.exit(1) }
  const cookies = JSON.parse(readFileSync(state, 'utf8')).cookies || []
  const target = (host || '').replace(/^\./, '')
  const hit = cookies.filter((c) => {
    const d = (c.domain || '').replace(/^\./, '')
    return !target || d === target || d.endsWith('.' + target) || target.endsWith('.' + d)
  })
  console.log(hit.length ? `✓ ${hit.length} cookies 覆盖 ${target || '全部域'}：${hit.map((c) => c.name).join(', ')}` : `✗ 无 ${target} 的 cookie`)
  process.exit(hit.length ? 0 : 1)
} else if (sub === 'verify') {
  // 真探针：带 storageState cookie 访问目标环境，落点离开业务域（跳 SSO 登录页）= 过期
  // 用法: kb auth verify <BASE_URL> [--json]；判定锚点：未登录/过期 → 跳转 SSO 登录域（落点 host ≠ 目标 host 即过期）
  // 目标环境必传（BASE_URL 或位置参数）——不设默认，环境约定单源在 scripts/kb-env.mjs / 应用画像 envs
  const argUrl = process.argv.slice(3).find((a) => !a.startsWith('--'))
  if (!argUrl && !process.env.BASE_URL) {
    console.error('用法: kb auth verify <BASE_URL> [--json]（或设 BASE_URL 环境变量）')
    process.exit(1)
  }
  const baseUrl = (process.env.BASE_URL || argUrl).replace(/\/$/, '')
  const asJson = process.argv.includes('--json')
  const { hostname } = new URL(baseUrl)
  const state = join(ROOT, '.auth/state.json')
  const fail = (status, msg, loginUrl) => {
    // loginUrl 兜底 = 业务域首页：未登录访问自然跳登录页，无需预知 SSO 域名（保持引擎通用，环境细节归各 app 画像）
    const fallback = baseUrl + '/'
    const out = { ok: false, status, host: hostname, loginUrl: loginUrl || fallback, message: msg }
    if (asJson) console.log(JSON.stringify(out))
    else console.error(`✗ ${msg}\n  登录链接: ${out.loginUrl}`)
    process.exit(1)
  }
  if (!existsSync(state)) fail('MISSING', '.auth/state.json 不存在，先 kb auth import')
  const cookies = JSON.parse(readFileSync(state, 'utf8')).cookies || []
  // 全量携带——Cookie 只对目标域生效，跨域 cookie 无害（按域过滤反而要写死公司域名）
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  if (!cookie) fail('MISSING', 'state.json 内无 cookie')
  const r = await fetch(baseUrl + '/', { redirect: 'follow', headers: { cookie }, signal: AbortSignal.timeout(15_000) }).catch((e) => ({ err: String(e).slice(0, 120) }))
  if (r.err) fail('UNREACHABLE', `环境不可达：${r.err}（VPN/内网？）`)
  const finalUrl = r.url || ''
  // 比落点 host 本身——SSO 页 from= 参数里编码着业务域，字符串 includes 会恒真误判（实测踩过）
  let onSSO = false
  try { onSSO = new URL(finalUrl).hostname !== hostname } catch { onSSO = true }
  if (onSSO) fail('EXPIRED', `登录态已过期（落点 ${finalUrl}）`, finalUrl)
  console.log(asJson ? JSON.stringify({ ok: true, status: 'OK', host: hostname }) : `✓ 登录态有效（${hostname}）`)
  process.exit(0)
} else {
  console.error('用法: kb auth import <host> | kb auth check [host] | kb auth verify [BASE_URL] [--json]')
  process.exit(1)
}
