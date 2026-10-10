#!/usr/bin/env node
// kb record — 录制生成 spec 骨架（UI 改版重标定 / 新用例）
// 用法: pnpm record [url]   # 缺省取应用画像 envs 第一个（环境链接由维护者管理，脚本零写死）
//
// 原理: playwright codegen + 预载 .auth/state.json 登录态。
// 录制产出粘贴/保存到 specs/<域>/ 后人工收敛（删噪音步骤、补断言）。
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { collect } from './gen-data.mjs'

import { PLUGIN_ROOT, KB_ROOT } from './paths.mjs'
const ROOT = KB_ROOT
const url = (process.argv[2] || collect().apps.map((a) => Object.values(a.envs || {})[0]).filter(Boolean).map(String)[0] || '').replace(/\/$/, '')
if (!url) {
  console.error('未找到目标环境：请在应用画像（apps/*.md）frontmatter 维护 envs，或显式传参 pnpm record <url>')
  process.exit(1)
}
const state = join(ROOT, '.auth/state.json')

if (!existsSync(state)) {
  console.error('缺 .auth/state.json，先: pnpm auth import <host>')
  process.exit(1)
}
console.log(`录制开始 → 浏览器操作，代码实时生成在 codegen 窗口。关窗即结束。\n目标: ${url}`)
const child = spawn('npx', ['playwright', 'codegen', '--load-storage-state', state, url], {
  cwd: PLUGIN_ROOT, stdio: 'inherit', shell: process.platform === 'win32',
})
child.on('exit', (c) => process.exit(c ?? 0))
