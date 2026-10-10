<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { cases, apps, runs, dataReady } from './data'
const domains = computed(() => [...new Set(cases.value.map((c) => c.domain))].sort())
const fDomain = ref('')
const fStatus = ref('')
const fPriority = ref('')

const runningIds = computed(() =>
  new Set(
    runs.value
      .filter((r) => r.status === 'running')
      .flatMap((r) => (r.cases || []).map((c) => c.id)),
  ),
)

const filtered = computed(() =>
  cases.value.filter(
    (c) =>
      (!fDomain.value || c.domain === fDomain.value) &&
      (!fStatus.value || c.status === fStatus.value) &&
      (!fPriority.value || c.priority === fPriority.value),
  ),
)

// 分页（与执行进度一致，默认 10/页）；筛选变化自动回第 1 页
const pageSize = ref(10)
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
function goPage(p: number) {
  page.value = Math.min(Math.max(1, p), totalPages.value)
}
watch([fDomain, fStatus, fPriority, pageSize], () => (page.value = 1))

const stats = computed(() => {
  const by = (k: string, v: string) => cases.value.filter((c) => c[k] === v).length
  return {
    total: cases.value.length,
    active: by('status', 'active'),
    flaky: by('status', 'flaky'),
    draft: by('status', 'draft'),
    deprecated: by('status', 'deprecated'),
    automated: cases.value.filter((c) => c.spec).length,
    passing: cases.value.filter((c) => c.last_result === 'pass').length,
    running: runningIds.value.size,
  }
})

// 状态比例条分段：绿(passing active) | 琥珀(flaky) | 蓝(running) | 灰(其余)
const segs = computed(() => {
  const s = [
    { key: 'pass', n: stats.value.passing, label: '最近执行通过' },
    { key: 'warn', n: stats.value.flaky, label: '不稳定' },
    { key: 'run', n: stats.value.running, label: '运行中' },
    { key: 'dim', n: stats.value.total - stats.value.passing - stats.value.flaky - stats.value.running, label: '待执行' },
  ]
  return s.filter((x) => x.n > 0)
})

const statusDot: Record<string, string> = { active: 'ok', draft: 'dim', flaky: 'warn', deprecated: 'bad' }
const statusLabel: Record<string, string> = { active: '生效', draft: '草稿', flaky: '不稳定', deprecated: '已废弃' }
const resultDot: Record<string, string> = { pass: 'ok', fail: 'bad', blocked: 'warn', skipped: 'dim' }
const resultLabel: Record<string, string> = { pass: '通过', fail: '失败', blocked: '阻塞', skipped: '跳过' }
const noteCls = (r: string) => (r === 'fail' ? 'fail' : r === 'blocked' ? 'warn' : 'plain')

// dev 模式：行内「执行」按钮 → 本地执行引擎；build 版降级隐藏
// 执行入口只在 kb-server 在线时显示（纯静态预览无 API，点了也没用）
const isDev = dataReady

// 执行配置：点执行时弹对话框带上环境/环境标签/异常白名单（同一用例可在不同环境跑）；
// 选项来自应用画像 frontmatter envs；记忆落本地文件 .kb-exec.json（/__kb/exec-config API 读写，不依赖浏览器 localStorage）
import { onMounted } from 'vue'
const envOptions = computed(() => {
  const m = new Map<string, string>()
  for (const a of apps.value as any[]) for (const [k, v] of Object.entries(a.envs || {})) if (!m.has(k)) m.set(k, v as string)
  return [...m.entries()]
})
const envName = ref(envOptions.value[0]?.[0] || '__custom')
const envCustom = ref('') // 选「自定义」时的手输 URL
const envTag = ref('')
const skip5xx = ref('') // 异常白名单（正则匹配 URL）：按当次环境噪音执行前给定，命中接口的 5xx 不影响判定
const envUrl = computed(() => (envName.value === '__custom' ? envCustom.value.trim() : envOptions.value.find(([k]) => k === envName.value)?.[1] || ''))
onMounted(async () => {
  try {
    const cfg = await fetch('/__kb/exec-config').then((r) => r.json())
    if (cfg.env) envName.value = cfg.env
    if (cfg.customUrl) envCustom.value = cfg.customUrl
    if (typeof cfg.tag === 'string') envTag.value = cfg.tag
    if (typeof cfg.skip5xx === 'string') skip5xx.value = cfg.skip5xx
  } catch { /* dev server 不在则用默认 */ }
})
async function saveExecConfig() {
  try {
    await fetch('/__kb/exec-config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ env: envName.value, customUrl: envCustom.value.trim(), tag: envTag.value.trim(), skip5xx: skip5xx.value.trim() }) })
  } catch { /* 保存失败不阻断执行 */ }
}
const execModal = ref<{ ids: string[] } | null>(null) // 待执行目标：确认对话框后才真正派发
const execErr = ref('') // 对话框内校验提示（如自定义 URL 未填）
function execQuery() {
  const p = new URLSearchParams()
  if (envUrl.value) p.set('baseUrl', envUrl.value)
  if (envTag.value.trim()) p.set('envTag', envTag.value.trim())
  if (skip5xx.value.trim()) p.set('skip5xx', skip5xx.value.trim())
  const s = p.toString()
  return s ? `&${s}` : ''
}

// 派发公用：needAuth → 登录态弹窗引导（登录链接 + 重导 + 自动重发）；业务错 → 对话框内提示
const batchMsg = ref('')
const authModal = ref<{ loginUrl?: string, message?: string } | null>(null)
let lastDispatch = ''
async function dispatch(qs: string): Promise<boolean> {
  lastDispatch = qs
  const v = await fetch(qs).then((r) => r.json()).catch(() => ({ ok: false, error: '执行引擎无响应（dev server 在跑？）' }))
  if (v.needAuth) { authModal.value = v; return false }
  if (!v.ok) { execErr.value = v.error || '派发失败'; return false }
  return true
}
async function reimportAuth() {
  authBusy.value = true
  try {
    const p = new URLSearchParams()
    if (envUrl.value) p.set('baseUrl', envUrl.value)
    const v = await fetch(`/__kb/auth?${p}`, { method: 'POST' }).then((r) => r.json())
    if (v.ok) {
      authModal.value = null
      batchMsg.value = '登录态已更新'
      if (lastDispatch) await dispatch(lastDispatch)
    } else {
      authModal.value = v
    }
  } catch (e) {
    authModal.value = { message: '重导失败：' + String(e) }
  } finally { authBusy.value = false }
}
const authBusy = ref(false)

// 登录后自动检测：弹窗期间轮询「重提 cookie + 复验」（5s）。仍过期=还没登录完（继续等不计数）；
// 导入失败（如钥匙串拒绝）连续 3 次停轮询防反复弹框，按钮兜底。弹窗关闭即停。
let authPoll: ReturnType<typeof setInterval> | null = null
let authPollFails = 0
function stopAuthPoll() { if (authPoll) { clearInterval(authPoll); authPoll = null } }
async function authCheckOnce() {
  const p = new URLSearchParams()
  if (envUrl.value) p.set('baseUrl', envUrl.value)
  return fetch(`/__kb/auth?${p}`, { method: 'POST' }).then((r) => r.json())
}
function startAuthPoll() {
  stopAuthPoll()
  authPollFails = 0
  authPoll = setInterval(async () => {
    if (authBusy.value || !authModal.value) return
    authBusy.value = true
    try {
      const v = await authCheckOnce()
      if (v.ok) {
        stopAuthPoll()
        authModal.value = null
        batchMsg.value = '登录态已自动更新'
        if (lastDispatch) await dispatch(lastDispatch)
      } else if (v.status !== 'EXPIRED' && ++authPollFails >= 3) {
        stopAuthPoll()
        if (authModal.value) authModal.value = { ...authModal.value, message: (authModal.value.message || '') + '（自动检测已暂停——登录后点下方按钮手动继续）' }
      }
    } catch { /* 轮询容错：单次网络抖动忽略 */ } finally { authBusy.value = false }
  }, 5000)
}
watch(authModal, (v) => (v ? startAuthPoll() : stopAuthPoll()))

const running = ref<Record<string, boolean>>({})
function runCase(id: string) {
  if (!isDev.value || running.value[id]) return
  execErr.value = ''
  execModal.value = { ids: [id] }
}

// 批量执行：勾选优先，未勾选则整域（引擎互斥，重复派发 409 拒绝）
const selected = ref(new Set<string>())
function toggleSelect(id: string) {
  const s = new Set(selected.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selected.value = s
}
const allSelected = computed(() => filtered.value.length > 0 && filtered.value.every((c) => selected.value.has(c.id)))
function toggleAll() {
  const s = new Set(selected.value)
  if (allSelected.value) filtered.value.forEach((c) => s.delete(c.id))
  else filtered.value.forEach((c) => s.add(c.id))
  selected.value = s
}
// 可执行目标 = 有 spec 且不在运行中（引擎互斥，跑中的再派发只会 409）
const pendingIds = computed(() => filtered.value.filter((c) => c.spec && !runningIds.value.has(c.id)).map((c) => c.id))
const selRunnable = computed(() => pendingIds.value.filter((id) => selected.value.has(id)))
function runBatch() {
  if (!isDev.value || batchBusy.value) return
  const ids = selected.value.size ? selRunnable.value : pendingIds.value
  if (!ids.length) return
  execErr.value = ''
  execModal.value = { ids }
}
// 执行对话框确认：真正派发；单条跑完按钮转 3 秒忙态，批量提示去进度页
const batchBusy = ref(false)
async function confirmExec() {
  if (!execModal.value) return
  if (envName.value === '__custom' && !envUrl.value) { execErr.value = '自定义环境未填 URL——填写或选回画像环境'; return }
  void saveExecConfig() // 记忆落本地文件（.kb-exec.json），不依赖浏览器
  const ids = execModal.value.ids
  const qs = ids.length === 1 ? `/__kb/run?id=${encodeURIComponent(ids[0])}${execQuery()}` : `/__kb/run?ids=${ids.join(',')}${execQuery()}`
  if (!(await dispatch(qs))) return
  execModal.value = null
  // 派发成功直接跳执行进度页看过程（用户不必自己找入口）
  window.location.href = '/progress'
  if (ids.length === 1) {
    running.value = { ...running.value, [ids[0]]: true }
    setTimeout(() => (running.value = { ...running.value, [ids[0]]: false }), 3000)
  } else {
    batchBusy.value = true
    batchMsg.value = `已派发 ${ids.length} 条，进度看「执行进度」页`
    setTimeout(() => {
      batchBusy.value = false
      batchMsg.value = ''
    }, 5000)
  }
}
</script>

<template>
  <div class="kb">
    <div class="kb-hero">
      <p class="lead">以业务域为主轴的跨应用用例资产——下面这条信号带就是整个库的健康度：绿=最近通过，蓝=运行中，灰=待执行。</p>
      <div class="kb-strip" role="img" :aria-label="`共 ${stats.total} 条用例`">
        <div v-for="s in segs" :key="s.key" class="seg" :class="`seg-${s.key}`" :style="{ width: (s.n / stats.total) * 100 + '%' }" :title="`${s.label} ${s.n}`" />
      </div>
      <div class="kb-legend">
        <span v-for="s in segs" :key="s.key"><span class="dot" :class="s.key" />{{ s.label }} <b>{{ s.n }}</b></span>
        <span><span class="dot dim" style="visibility:hidden" />共 <b>{{ stats.total }}</b> 条 · 已自动化 <b>{{ stats.automated }}</b></span>
      </div>
    </div>

    <div class="kb-filters">
      <select v-model="fDomain" aria-label="按域筛选"><option value="">全部域</option><option v-for="d in domains" :key="d">{{ d }}</option></select>
      <select v-model="fStatus" aria-label="按状态筛选"><option value="">全部状态</option><option value="active">生效</option><option value="draft">草稿</option><option value="flaky">不稳定</option><option value="deprecated">已废弃</option></select>
      <select v-model="fPriority" aria-label="按优先级筛选"><option value="">全部优先级</option><option>P0</option><option>P1</option><option>P2</option></select>
      <span class="kb-count">{{ filtered.length }}/{{ cases.length }}</span>
      <span style="flex:1" />
      <button v-if="isDev" class="run-btn batch" :class="{ busy: batchBusy }" :disabled="batchBusy || !(selected.size ? selRunnable.length : pendingIds.length)" :title="selected.size ? `pnpm run:ids ${[...selected].join(',')}` : '只派发当前不在运行中的用例'" @click="runBatch">
        {{ batchBusy ? '批量执行中…' : selected.size ? `▶ 执行选中 (${selRunnable.length})` : `▶ 批量执行全部 (${pendingIds.length})` }}
      </button>
      <span v-if="batchMsg" class="batch-msg">{{ batchMsg }}</span>
    </div>

    <table class="kb-table">
      <thead>
        <tr>
          <th class="col-sel"><input type="checkbox" :checked="allSelected" title="全选/全不选（按当前筛选）" @click.stop="toggleAll" /></th>
          <th>用例</th><th>域</th><th>应用</th><th>P</th><th>状态</th><th>最近执行</th><th>结果</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="c in paged" :key="c.id">
          <tr>
            <td class="col-sel"><input type="checkbox" :checked="selected.has(c.id)" @click.stop="toggleSelect(c.id)" /></td>
            <td><a :href="c.url">{{ c.id }}</a><div class="sub">{{ c.title }}</div></td>
            <td><span class="mono">{{ c.domain }}</span></td>
            <td><span v-for="a in c.apps" :key="a" class="app-chip">{{ a }}</span></td>
            <td><span class="mono">{{ c.priority }}</span></td>
            <td>
              <span v-if="runningIds.has(c.id)"><span class="dot run" />运行中</span>
              <span v-else><span class="dot" :class="statusDot[c.status] || 'dim'" />{{ statusLabel[c.status] || c.status }}</span>
              <button v-if="isDev && c.spec" class="run-btn" :class="{ busy: running[c.id] || runningIds.has(c.id) }" :disabled="running[c.id] || runningIds.has(c.id)" :title="runningIds.has(c.id) ? '该用例正在执行中' : `pnpm run:case ${c.id}`" @click="runCase(c.id)">执行</button>
            </td>
            <td><span class="mono">{{ c.last_run || '—' }}</span></td>
            <td>
              <span v-if="c.last_result"><span class="dot" :class="resultDot[c.last_result] || 'dim'" />{{ resultLabel[c.last_result] || c.last_result }}</span>
              <span v-else class="dim">—</span>
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <div v-if="filtered.length > 10" class="kb-pager">
      <select v-model.number="pageSize" class="pg-size" aria-label="每页条数"><option :value="10">10 条/页</option><option :value="20">20 条/页</option><option :value="50">50 条/页</option><option :value="100">100 条/页</option></select>
      <button class="pg-btn" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
      <span class="mono">{{ page }} / {{ totalPages }} · 共 {{ filtered.length }} 条</span>
      <button class="pg-btn" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页</button>
    </div>

    <p v-if="!cases.length" class="kb-empty">
      还没有用例。建第一条：<code>pnpm kb new &lt;域&gt; "用例标题" --apps a|b</code>，或用 <code>pnpm kb import cases.csv --domain &lt;域&gt;</code> 批量导入。
    </p>

    <!-- 执行配置对话框：点执行先带环境/envtag/5xx 豁免，确认才派发（同一用例可在不同环境跑） -->
    <div v-if="execModal" class="auth-overlay" @click.self="execModal = null">
      <div class="auth-card" role="dialog" aria-modal="true" aria-label="执行配置">
        <h3>执行配置</h3>
        <p class="exec-target">{{ execModal.ids.length === 1 ? execModal.ids[0] : `已选 ${execModal.ids.length} 条用例` }}</p>
        <div class="exec-form">
          <label>环境</label>
          <select v-model="envName" aria-label="执行环境">
            <option v-for="[k, v] in envOptions" :key="k" :value="k">{{ k }} · {{ v }}</option>
            <option value="__custom">自定义…</option>
          </select>
          <template v-if="envName === '__custom'">
            <span />
            <input v-model="envCustom" class="exec-input" placeholder="https://环境域名（完整 base URL）" spellcheck="false" />
          </template>
          <label>环境标签</label>
          <input v-model="envTag" class="exec-input" placeholder="可空——需求分支联调时填（如 v632-xxx）" spellcheck="false" />
          <label>异常白名单</label>
          <input v-model="skip5xx" class="exec-input" placeholder="可空——正则匹配 URL，环境噪音接口（5xx 报错）在此忽略不计" spellcheck="false" />
        </div>
        <p v-if="execErr" class="exec-err">{{ execErr }}</p>
        <div class="auth-actions">
          <button class="run-btn batch" :disabled="batchBusy || (envName === '__custom' && !envUrl)" @click="confirmExec">▶ 执行{{ execModal.ids.length > 1 ? ` ${execModal.ids.length} 条` : '' }}</button>
          <button class="run-btn" @click="execModal = null">取消</button>
        </div>
      </div>
    </div>

    <!-- 登录态过期引导：给登录链接 → 你的浏览器登录 → 重导 cookie → 自动重发派发 -->
    <div v-if="authModal" class="auth-overlay" @click.self="authModal = null">
      <div class="auth-card" role="dialog" aria-modal="true" aria-label="登录态已过期">
        <h3>登录态已过期</h3>
        <p class="auth-msg">{{ authModal.message || '目标环境的登录态需要更新' }}</p>
        <ol class="auth-steps">
          <li>在你的浏览器打开 <a :href="authModal.loginUrl" target="_blank" rel="noopener">登录页面</a>，完成登录（若被登出，登录后回到该站点首页即可）；</li>
          <li>登录完成后<b>本页会自动检测并继续执行</b>（每 5 秒检测一次；首次提取可能弹出钥匙串/凭据授权，请允许——建议勾选「总是允许」）。也可登录后手动点下方按钮。</li>
        </ol>
        <div class="auth-actions">
          <button class="run-btn batch" :disabled="authBusy" @click="reimportAuth">{{ authBusy ? '正在重新导入…' : '已登录，重新导入并继续' }}</button>
          <button class="run-btn" @click="authModal = null">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>
