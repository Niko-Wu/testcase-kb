import { defineConfig } from 'vitepress'

// 站点构建配置（产物 serve 归 scripts/kb-server.mjs，执行 API 也在 server——这里只管静态站点）
// 导航的「领域知识库」按数据目录（KB_ROOT，纯本地私有）实际存在的域生成；构建前先 kb-init 保证有示例域。
import { collect } from '../scripts/gen-data.mjs'
import { readFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const KB_ROOT = resolve(process.env.KB_ROOT || join(homedir(), '.testcase-kb'))
const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const { cases: kbCases } = collect()
const domainList = [...new Set(kbCases.map((c: any) => c.domain))].sort()

// 仓库地址：读 package.json repository；未配置则不渲染仓库入口
const repoUrl = String(JSON.parse(readFileSync(resolve(PLUGIN_ROOT, 'package.json'), 'utf8'))?.repository?.url || '').replace(/\.git$/, '')

export default defineConfig({
  lang: 'zh-CN',
  title: '测试用例知识库',
  description: '本地测试用例知识库 — 业务域主轴、markdown 单源、可执行可回写、数据纯私有',
  srcDir: KB_ROOT, // 站点内容（用例页/知识页）全部从数据目录构建
  ignoreDeadLinks: true,
  srcExclude: ['_templates/**', 'examples/**', 'scripts/**', 'node_modules/**', 'runs/**', 'specs/**', '.auth/**'],
  outDir: 'site-dist',
  themeConfig: {
    nav: [
      { text: '用例总览', link: '/' },
      { text: '执行进度', link: '/progress' },
      { text: '领域知识库', items: domainList.map((d: string) => ({ text: d, link: `/knowledge/${d}.html` })) },
      ...(repoUrl ? [{ text: '仓库', link: repoUrl }] : []),
    ],
    outline: { level: [2, 3] },
    docFooter: { prev: false, next: false },
  },
})
