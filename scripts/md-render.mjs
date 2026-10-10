// md-render — 执行附件 md 的站内渲染（kb-server /runs/**.md 用；三态着色与站点抽屉一致）
import { PLUGIN_ROOT } from './paths.mjs'

let renderer = null
async function getMd() {
  if (renderer) return renderer
  const { createMarkdownRenderer } = await import('vitepress').catch(() => ({}))
  if (!createMarkdownRenderer) return null
  renderer = await createMarkdownRenderer(PLUGIN_ROOT, { linkify: false }, '/') // linkify 关闭：网络明细 URL 保持纯文本（可点会 404）
  return renderer?.md?.render ? renderer.md : renderer
}

const STYLE = `
:root{--ink:#1c2b33;--body:#33424c;--dim:#64748b;--line:#d8e2e4;--soft:#f2f6f6;--brand:#0e7490;--mono:ui-monospace,'SF Mono','JetBrains Mono',Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{font:15px/1.8 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:var(--body);max-width:840px;margin:0 auto;padding:40px 24px 64px}
header{border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:26px;display:flex;justify-content:space-between;align-items:baseline}
header h1{font-size:15px;font-weight:600;color:var(--ink);margin:0}
header code{font:12px var(--mono);color:var(--dim)}
h2{font-size:17px;font-weight:600;color:var(--ink);margin:32px 0 12px;padding-left:12px;border-left:3px solid var(--brand)}
h3{font-size:15px;font-weight:600;color:var(--ink);margin:24px 0 8px}
p{margin:10px 0} ul,ol{padding-left:22px;margin:10px 0} li{margin:4px 0}
a{color:var(--brand)}
code{font:13px var(--mono);background:var(--soft);border:1px solid var(--line);border-radius:4px;padding:1px 5px}
pre{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:14px 16px;overflow:auto;font-size:12.5px;line-height:1.65}
pre code{background:none;border:none;padding:0;font-size:12.5px}
blockquote{margin:14px 0;padding:8px 16px;border-left:3px solid var(--line);color:var(--dim);background:var(--soft);border-radius:0 6px 6px 0}
table{border-collapse:collapse;width:100%;margin:14px 0;font-size:13.5px}
th{text-align:left;font-weight:600;color:var(--dim);border-bottom:1px solid var(--line);padding:8px 10px}
td{border-bottom:1px solid var(--line);padding:10px;vertical-align:top}
hr{border:none;border-top:1px solid var(--line);margin:28px 0}
strong{color:var(--ink)}
img{max-width:100%}
li.mk-ok{color:#16a34a} li.mk-bad{color:#dc2626} li.mk-warn{color:#d97706}
.act-ok{color:#16a34a;font-weight:600} .act-bad{color:#dc2626;font-weight:600}
`

export async function mdHtml(rel, text) {
  const md = await getMd()
  // 断言明细附件是 JSON 行存储（引擎读回用）——直出即"乱码"；给人渲染成表格
  const lines = text.split('\n').filter((l) => l.trim().startsWith('{"text"'))
  let inner
  if (lines.length) {
    const rows = lines.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    inner = `<h2>断言明细（预期 vs 实际）</h2><table>
<thead><tr><th>预期（断言描述）</th><th>结果</th><th>实际</th></tr></thead><tbody>
${rows.map((r) => `<tr><td>${esc(r.text)}</td><td>${r.status === 'pass' ? '✅ 通过' : r.status === 'fail' ? '❌ 失败' : '⚠️ ' + (r.status || '')}</td><td>${esc(r.detail && r.detail !== '断言通过' ? r.detail : '—')}</td></tr>`).join('\n')}
</tbody></table>`
  } else if (md) {
    inner = md.render(text)
      .replace(/<li>(✅|❌|⚠️)\s*/g, (_m, e) => `<li class="mk-${e === '✅' ? 'ok' : e === '❌' ? 'bad' : 'warn'}">${e} `)
      .replace(/实际✓/g, '<span class="act-ok">实际✓</span>')
      .replace(/实际✗/g, '<span class="act-bad">实际✗</span>')
  } else {
    inner = `<pre>${text.replace(/</g, '&lt;')}</pre>`
  }
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>执行附件</title>
<style>${STYLE}</style></head><body>
<header><h1>执行附件</h1><code>${rel.split('/').pop()}</code></header>
${inner}
</body></html>`
}
const esc = (s) => String(s ?? '').replace(/</g, '&lt;')
