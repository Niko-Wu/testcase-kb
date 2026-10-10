// 运行时数据层：kb-server 的 /__kb/data 提供聚合数据（数据目录纯本地私有）
// ref + 首载拉取 + 轮询刷新（执行进度「跑完一个绿一个」靠轮询）；dev 直开（无 server）时静默空态
import { ref } from 'vue'

export const cases = ref<any[]>([])
export const apps = ref<any[]>([])
export const runs = ref<any[]>([])
export const dataReady = ref(false)

let polling: number | undefined
let inflight = false

export async function loadKbData() {
  if (inflight) return
  inflight = true
  try {
    const r = await fetch('/__kb/data')
    if (!r.ok) throw new Error(String(r.status))
    const d = await r.json()
    cases.value = d.cases || []
    apps.value = d.apps || []
    runs.value = d.runs || []
    dataReady.value = true
  } catch {
    /* 无 server（纯静态预览）保持空态 */
  } finally {
    inflight = false
  }
}

// 站点有执行进行中时加速轮询（2s），空闲降到 10s——肉眼「完成一个绿一个」
function armPoll() {
  const hasRunning = () => runs.value.some((r: any) => r.status === 'running')
  let fast = false
  const tick = async () => {
    await loadKbData()
    const want = hasRunning()
    if (want !== fast) {
      fast = want
      if (polling) clearInterval(polling)
      polling = window.setInterval(tick, fast ? 2000 : 10000)
    }
  }
  polling = window.setInterval(tick, 10000)
  tick()
}

if (typeof window !== 'undefined') {
  loadKbData().then(armPoll)
}
