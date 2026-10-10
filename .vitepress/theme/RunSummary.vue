<script setup lang="ts">
import { computed, ref } from 'vue'
import MarkdownIt from 'markdown-it'
import { cases, runs, apps, dataReady } from './data'

const mdIt = new MarkdownIt({ html: false, linkify: false }) // linkify 会把网络明细里的 URL 变可点链接（点了 404）

const pageSize = ref(10)
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(runs.value.length / pageSize.value)))
const recent = computed(() => runs.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
function goPage(p: number) {
  page.value = Math.min(Math.max(1, p), totalPages.value)
}

const titleOf = (id: string) => cases.value.find((c) => c.id === id)?.title || ''

const overall = computed(() => {
  const active = cases.value.filter((c) => c.status === 'active')
  const passed = active.filter((c) => c.last_result === 'pass').length
  return { active: active.length, passed, rate: active.length ? Math.round((passed / active.length) * 100) : null }
})

const runningNow = computed(() => runs.value.filter((r) => r.status === 'running').length)

// 明细折叠：默认收起，点主行切换（有 notes/附件 的执行才可展开）
const expanded = ref(new Set<string>())
// 展开明细的结果筛选（多选，对所有展开行生效）：跑大批量时只盯失败+阻塞
const fResult = ref(new Set<string>())
const resultChips = [
  { key: 'pass', label: '✅ 通过', cls: 'pass' },
  { key: 'fail', label: '❌ 失败', cls: 'fail' },
  { key: 'blocked', label: '⚠️ 阻塞', cls: 'blocked' },
]
function toggleChip(k: string) {
  const s = new Set(fResult.value)
  s.has(k) ? s.delete(k) : s.add(k)
  fResult.value = s
}
const detailCases = (r: any) =>
  r.cases.filter(
    (x: any) =>
      // 未选：只列有内容的行；选了状态：按结果全列
      fResult.value.size ? fResult.value.has(x.result) : (x.notes || (x.artifacts || []).length),
  )

// 执行入口只在 kb-server 在线时显示（纯静态预览无 API，点了也没用）
const isDev = dataReady

// 明细重跑：勾选若干用例（常配合「❌ 失败」筛选），按本批同环境同标签重跑
const rerunSel = ref(new Set<string>())
const rerunBusy = ref(false)
function toggleRerun(id: string) {
  const s = new Set(rerunSel.value)
  s.has(id) ? s.delete(id) : s.add(id)
  rerunSel.value = s
}
// 勾选当前筛选命中的全部用例（如筛「❌ 失败」后一键全勾）
function selectFiltered(r: any) {
  const s = new Set(rerunSel.value)
  for (const c of detailCases(r)) s.add(c.id)
  rerunSel.value = s
}
const envUrl = (name: string) => {
  for (const a of apps.value as any[]) {
    const hit = Object.entries(a.envs || {}).find(([k]) => k === name)
    if (hit) return String(hit[1]).replace(/\/$/, '')
  }
  return ''
}
const selOf = (r: any) => (rerunSel.value.size ? r.cases.filter((c: any) => rerunSel.value.has(c.id)).map((c: any) => c.id) : [])
async function rerunSelected(r: any) {
  const ids = selOf(r)
  if (!ids.length || rerunBusy.value) return
  const baseUrl = envUrl(r.env)
  if (!baseUrl) { alert(`未找到环境「${r.env}」的链接——请在应用画像（apps/*.md）维护 envs`) ; return }
  rerunBusy.value = true
  try {
    const res = await fetch(`/__kb/run?ids=${ids.join(',')}&baseUrl=${encodeURIComponent(baseUrl)}${r.env_tag ? `&envTag=${encodeURIComponent(r.env_tag)}` : ''}`)
    const v = await res.json()
    if (v.needAuth) alert('登录态已过期——请到「用例总览」点任意执行按钮走登录流程后重试')
    else if (!v.ok) alert(v.error || '派发失败')
    else rerunSel.value = new Set()
  } catch (e: any) { alert('派发失败：' + e.message) } finally { rerunBusy.value = false }
}
function hasDetail(r: any) {
  return r.cases?.some((c: any) => c.notes || (c.artifacts || []).length)
}
function toggleRun(id: string) {
  const s = new Set(expanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expanded.value = s
}

const resultDot: Record<string, string> = { pass: 'ok', fail: 'bad', blocked: 'warn', skipped: 'dim' }
const resultLabel: Record<string, string> = { pass: '通过', fail: '失败', blocked: '阻塞', skipped: '跳过', pending: '进行中' }
const resultCls: Record<string, string> = { pass: 'pass', fail: 'fail', blocked: 'blocked' }
function noteCls(r: string) {
  if (r === 'fail') return 'fail'
  if (r === 'blocked') return 'warn'
  return 'plain'
}

const isImg = (a: string) => /\.(png|jpg|jpeg|gif|webp)$/i.test(a)

// 右侧抽屉：表格只留一个入口 → 打开 结果.md，图片在 md 底部轮播（大图+切换+缩略条）
const drawer = ref<{ runId: string; title: string; arts: string[]; current: string } | null>(null)
const drawerHtml = ref('')
const drawerLoading = ref(false)
const galleryIdx = ref(0)

async function openCase(r: any, c: any) {
  const arts: string[] = c.artifacts || []
  const entry = arts.find((a) => /结果\.md$/.test(a)) || ''
  drawer.value = { runId: r.run_id, title: `${c.id} · ${titleOf(c.id) || ''}`, arts, current: entry || arts[0] || '' }
  galleryIdx.value = 0
  drawerHtml.value = ''
  if (!entry) return // 无 md（残缺/纯图）：直接画廊，不 fetch
  drawerLoading.value = true
  try {
    let text = await (await fetch(`/runs/${r.run_id}/${entry}?raw=1`)).text()
    // 「## 附件」列表段剥掉——图片已在下方画廊轮播，避免重复
    text = text.replace(/## 附件[\s\S]*$/, '').replace(/\s+$/, '')
    drawerHtml.value = mdIt.render(text)
      // 断言 checklist 三态着色 + 实际行着色：✅ 绿 / ❌ 红 / ⚠️ 黄；实际✓ 绿、实际✗ 红
      .replace(/<li>(✅|❌|⚠️)\s*/g, (_m, e: string) => `<li class="mk-${e === '✅' ? 'ok' : e === '❌' ? 'bad' : 'warn'}">${e} `)
      .replace(/实际✓/g, '<span class="act-ok">实际✓</span>')
      .replace(/实际✗/g, '<span class="act-bad">实际✗</span>')
  } catch (e: any) {
    drawerHtml.value = `<p>加载失败：${e.message}</p>`
  } finally {
    drawerLoading.value = false
  }
}
const galleryImgs = computed(() => (drawer.value ? drawer.value.arts.filter(isImg) : []))
const lightbox = ref('')
function closeLightbox(e: Event) {
  if ((e.target as HTMLElement).tagName !== 'IMG') lightbox.value = ''
}
function stepImg(delta: number) {
  if (!galleryImgs.value.length) return
  galleryIdx.value = (galleryIdx.value + delta + galleryImgs.value.length) % galleryImgs.value.length
}
function closeDrawer() {
  drawer.value = null
}
function onKey(e: KeyboardEvent) {
  if (!drawer.value) return
  if (e.key === 'Escape') closeDrawer()
  if (e.key === 'ArrowLeft') stepImg(-1)
  if (e.key === 'ArrowRight') stepImg(1)
}
if (typeof window !== 'undefined') window.addEventListener('keydown', onKey)
</script>

<template>
  <div class="kb">
    <div class="kb-hero">
      <p class="lead">每次执行自动落回执到本地 runs/ 并同步至此——失败带原因、TID 与现场截图，点开即查证。</p>
      <div class="kb-legend" style="margin-top:0">
        <span><span class="dot ok" />生效用例 <b>{{ overall.active }}</b></span>
        <span><span class="dot ok" style="visibility:hidden" />最近通过 <b>{{ overall.passed }}</b></span>
        <span><span class="dot ok" style="visibility:hidden" />通过率 <b>{{ overall.rate === null ? '—' : overall.rate + '%' }}</b></span>
        <span><span class="dot dim" style="visibility:hidden" />累计执行 <b>{{ runs.length }}</b> 次<template v-if="runningNow">（<span class="ok">进行中 {{ runningNow }}</span>）</template></span>
      </div>
    </div>

    <p v-if="!runs.length" class="kb-empty">
      尚无执行记录。跑第一条：<code>pnpm run:case &lt;TC-ID&gt;</code>，或在「用例总览」页点行内「执行」按钮（本地 dev 模式）。
    </p>

    <table v-else class="kb-table kb-runs">
      <thead>
        <tr><th>执行时间</th><th>状态</th><th>环境</th><th>环境标签</th><th>触发</th><th>已执行</th><th>通过</th><th>失败</th><th>阻塞</th><th>明细</th></tr>
      </thead>
      <tbody>
        <template v-for="r in recent" :key="r.run_id">
          <tr :class="{ expandable: hasDetail(r) }" @click="hasDetail(r) && toggleRun(r.run_id)">
            <td>
              <span v-if="hasDetail(r)" class="exp" :class="{ open: expanded.has(r.run_id) }">▸</span>
              <span class="mono">{{ r.date || r.run_id }}</span>
            </td>
            <td><span v-if="r.status === 'running'"><span class="dot run" />进行中</span><span v-else class="dim">已完成</span></td>
            <td><span class="mono">{{ (r.env || '').split(' · ')[0] }}</span></td>
            <td><span class="mono" :class="{ dim: !(r.env_tag || (r.env || '').split(' · ')[1]) }">{{ r.env_tag || (r.env || '').split(' · ')[1] || '—' }}</span></td>
            <td><span class="mono">{{ r.trigger }}</span></td>
            <td><span class="mono">{{ (r.summary?.pass ?? 0) + (r.summary?.fail ?? 0) + (r.summary?.blocked ?? 0) }}/{{ r.summary?.total ?? '—' }}</span></td>
            <td><b class="ok mono">{{ r.summary?.pass ?? 0 }}</b></td>
            <td><b :class="{ 'bad mono': r.summary?.fail }" class="mono">{{ r.summary?.fail ?? 0 }}</b></td>
            <td><b :class="{ 'warn mono': r.summary?.blocked }" class="mono">{{ r.summary?.blocked ?? 0 }}</b></td>
            <td>
              <span v-for="c in r.cases.slice(0, 5)" :key="c.id" class="run-chip" :data-title="titleOf(c.id)">
                <span class="chip-id">
                  <span class="dot" :class="c.result === 'pending' ? 'run' : resultDot[c.result] || 'dim'" />
                  <span class="mono">{{ c.id }}</span>
                </span>
                <span class="chip-title">{{ titleOf(c.id) }}</span>
              </span>
              <span
                v-if="r.cases.length > 5" class="run-chip chip-more"
                :data-title="r.cases.slice(5).map((x: any) => `${x.id} ${titleOf(x.id)}（${resultLabel[x.result] || x.result}）`).join('\n')"
                @click.stop="hasDetail(r) && toggleRun(r.run_id)"
              >
                <span class="chip-id"><span class="mono">查看全部 {{ r.cases.length }}</span></span>
                <span class="chip-title">展开本行明细</span>
              </span>
            </td>
          </tr>
          <tr v-if="expanded.has(r.run_id) && hasDetail(r)" class="run-note-row">
            <td :colspan="10">
              <div class="kb-chips">
                <button class="chip-btn" :class="{ on: !fResult.size }" @click="fResult = new Set()">全部</button>
                <button
                  v-for="ch in resultChips" :key="ch.key" class="chip-btn" :class="[ch.cls, { on: fResult.has(ch.key) }]"
                  @click="toggleChip(ch.key)"
                >{{ ch.label }} <span>{{ r.cases.filter((x: any) => x.result === ch.key).length }}</span></button>
                <span style="flex:1" />
                <button
                  v-if="isDev && r.status === 'done'" class="chip-btn rerun" :class="{ on: rerunSel.size > 0 }"
                  :disabled="rerunBusy || !selOf(r).length" :title="`同环境（${r.env}）重跑选中 ${selOf(r).length} 条`"
                  @click="rerunSelected(r)"
                >{{ rerunBusy ? '派发中…' : `重跑选中 ${selOf(r).length}` }}</button>
                <button
                  v-if="isDev && r.status === 'done' && fResult.size" class="chip-btn" @click="selectFiltered(r)"
                >勾选筛选结果 {{ detailCases(r).length }}</button>
                <button
                  v-if="isDev && r.status === 'done' && rerunSel.size" class="chip-btn" @click="rerunSel = new Set()"
                >清空勾选</button>
              </div>
              <div v-for="c in detailCases(r)" :key="c.id" class="note" :class="noteCls(c.result)">
                <input
                  v-if="isDev && r.status === 'done'" type="checkbox" class="note-sel"
                  :checked="rerunSel.has(c.id)" title="加入重跑" @click.stop="toggleRerun(c.id)"
                />
                <code>{{ c.id }}</code>
                <span class="note-title" :title="titleOf(c.id)">{{ titleOf(c.id) }}</span>
                <span class="res" :class="resultCls[c.result] || ''">{{ resultLabel[c.result] || c.result }}</span>
                <a v-if="(c.artifacts || []).length" href="javascript:void 0" class="art-entry" @click.prevent="openCase(r, c)">
                  明细 + 附件 {{ (c.artifacts || []).filter(isImg).length }} 图 ›
                </a>
                <span v-if="c.notes && c.result !== 'pass'" class="sub-note" :title="String(c.notes).replace(/\s+/g, ' ')">{{ String(c.notes).replace(/\s+/g, ' ') }}</span>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <div v-if="runs.length" class="kb-pager">
      <select v-model.number="pageSize" class="pg-size" aria-label="每页条数"><option :value="10">10 条/页</option><option :value="20">20 条/页</option><option :value="50">50 条/页</option><option :value="100">100 条/页</option></select>
      <button class="pg-btn" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
      <span class="mono">{{ page }} / {{ totalPages }} · 共 {{ runs.length }} 次</span>
      <button class="pg-btn" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页</button>
    </div>

    <Teleport to="body">
      <div v-if="lightbox" class="kb-lightbox" @click="closeLightbox">
        <img :src="lightbox" alt="附件大图" />
      </div>
      <div v-if="drawer" class="kb-drawer-mask" @click.self="closeDrawer">
        <aside class="kb-drawer" role="dialog" aria-label="用例执行明细">
          <header class="kb-drawer-head">
            <div class="kb-drawer-title">
              <span class="mono">{{ drawer.title }}</span>
              <span class="dim mono kb-drawer-file">{{ galleryImgs.length ? `第 ${galleryIdx + 1}/${galleryImgs.length} 张 · ${galleryImgs[galleryIdx].split('/').pop()}` : drawer.current.split('/').pop() }}</span>
            </div>
            <button class="pg-btn" @click="closeDrawer">关闭</button>
          </header>

          <div class="kb-drawer-body">
            <p v-if="drawerLoading" class="dim">加载中…</p>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="md-view" v-html="drawerHtml"></div>

            <!-- 附件图片在 md 底部直接轮播；单击大图全屏放大 -->
            <div v-if="galleryImgs.length" class="kb-gallery">
              <div class="kb-gallery-main">
                <button class="pg-btn kb-nav" :disabled="galleryImgs.length <= 1" @click="stepImg(-1)">‹</button>
                <img :src="`/runs/${drawer.runId}/${galleryImgs[galleryIdx]}`" alt="页面截图（点击放大）" title="单击放大" @click="lightbox = `/runs/${drawer.runId}/${galleryImgs[galleryIdx]}`" />
                <button class="pg-btn kb-nav" :disabled="galleryImgs.length <= 1" @click="stepImg(1)">›</button>
              </div>
              <div class="kb-art-strip">
                <a
                  v-for="(a, i) in galleryImgs" :key="a" href="javascript:void 0"
                  class="art-thumb" :class="{ active: i === galleryIdx }" @click.prevent="galleryIdx = i"
                >
                  <img :src="`/runs/${drawer.runId}/${a}`" loading="lazy" :alt="a" />
                </a>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </Teleport>
  </div>
</template>
