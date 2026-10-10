#!/usr/bin/env node
// pnpm setup — 新人一键引导：依赖 → 浏览器 → 登录态 → 环境探活
// 任何一步失败即停并打印 remedy；全程幂等，可重复执行
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PLUGIN_ROOT, KB_ROOT } from './paths.mjs'
const ROOT = KB_ROOT
// 探活/导登录态的目标环境：应用画像 envs 第一个（维护者把常用环境放首位）；画像未维护则跳过相关步骤并提示
import { collect } from './gen-data.mjs'
const firstEnv = collect().apps.map((a) => Object.values(a.envs || {})[0]).filter(Boolean).map(String).map((u) => u.replace(/\/$/, ''))[0] || ''
const BASE_URL = (process.env.BASE_URL || firstEnv).replace(/\/$/, '')
const HOST = BASE_URL ? new URL(BASE_URL).hostname : ''
const step = (n, msg) => console.log(`\n[${n}/5] ${msg}`)
const ok = (msg) => console.log(`  ✓ ${msg}`)

try {
  step(1, '安装 npm 依赖')
  execSync('pnpm install', { cwd: ROOT, stdio: 'inherit' })
  ok('依赖就绪')

  step(2, '安装 Playwright Chromium 浏览器（约 150MB，首次较慢）')
  execSync('npx playwright install chromium', { cwd: ROOT, stdio: 'inherit' })
  ok('浏览器就绪')

  step(3, '登录态（从你的浏览器导入 cookie，不走登录页）')
  if (!BASE_URL) {
    console.log('  ⚠ 应用画像未维护 envs（apps/*.md frontmatter）——先补环境链接，登录态导入跳过')
  } else if (existsSync(join(ROOT, '.auth/state.json'))) {
    ok('已存在 .auth/state.json，跳过（过期可重跑: pnpm auth import ' + HOST + '）')
  } else {
    console.log('  即将打开引导——按提示从你的浏览器导入，请确保浏览器已登录 ' + HOST)
    execSync(`node scripts/kb-auth.mjs import ${HOST}`, { cwd: ROOT, stdio: 'inherit' })
    ok('登录态导入完成')
  }

  step(4, '环境探活')
  if (!BASE_URL) {
    console.log('  ⚠ 未指定环境（BASE_URL 或应用画像 envs）——探活跳过')
  } else {
    const code = await fetch(BASE_URL, { redirect: 'manual' }).then((r) => r.status).catch(() => 0)
    if (!code) throw new Error(`${BASE_URL} 不可达（VPN/内网？）`)
    ok(`${BASE_URL} → HTTP ${code}`)
    // 登录态已导入的顺带真探针（过期不阻断 setup，提醒即可）
    if (existsSync(join(ROOT, '.auth/state.json'))) {
      try { execSync(`node scripts/kb-auth.mjs verify ${BASE_URL}`, { cwd: ROOT, stdio: 'inherit' }) } catch { console.log('  ⚠ 登录态已过期——跑用例前重跑 pnpm auth import ' + HOST) }
    }
  }

  step(5, '用例校验')
  execSync('node scripts/kb.mjs validate', { cwd: ROOT, stdio: 'inherit' })

  console.log(`
✅ 环境就绪。接下来：

  pnpm run:smoke              # 跑全部 P0 用例
  pnpm run:case TC-DEMO-001   # 跑单条
  pnpm dev                    # 起站点（用例总览/执行进度可视化）

执行前提：你的浏览器已登录 ${BASE_URL}；cookie 过期重跑 pnpm auth import ${HOST}
`)
} catch (e) {
  console.error(`\n❌ 引导失败：${e.message}\n按上方提示处理后重跑 pnpm setup`)
  process.exit(1)
}
