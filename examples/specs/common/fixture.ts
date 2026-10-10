// 全局页面健康守门 + 产物统一管理
// 1) 5xx → 记「环境警告」（判定已降级：以 spec 断言为准，5xx 不否决用例）；SKIP_5XX_PATTERN 可豁免噪音接口
// 2) capture()：唯一截图入口——自动清遮挡浮层（右侧挂件类）+ 同页去重 + 每页一张
// 3) expectItem()：断言「预期 vs 实际」登记——结果.md 一一对应渲染，站点三色（通过绿/失败红/阻塞黄）
// 4) 每用例附「网络请求」明细，引擎合并进单份 结果.md
import { test as base, expect as pwExpect } from '@playwright/test'
import { writeFileSync, appendFileSync } from 'node:fs'

const STATIC = /\.(js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|map|html?)(\?|$)/i
const SKIP_5XX = process.env.SKIP_5XX_PATTERN ? new RegExp(process.env.SKIP_5XX_PATTERN) : null

// 健康守门 + 网络明细采集
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const bad: string[] = []
    const net: string[] = []
    CURRENT = { testInfo, n: 0 } // 断言自动登记上下文（use 期间挂载，用例间隔离）
    page.on('response', (r) => {
      const url = r.url()
      // 静态资源/轮询心跳不进网络明细；命中 SKIP_5XX_PATTERN 的接口（噪音通道类）5xx 只记录不拦截
      if (!url.startsWith('http') || STATIC.test(url) || /websocket|heartbeat|polling/i.test(url)) return
      const traceId = r.headers()['x-b3-traceid'] || ''
      const line = `[${r.status()}] ${r.request().method()} ${new URL(url).pathname} ${traceId ? ` traceid=${traceId}` : ""}`
      if (r.status() >= 500 && !(SKIP_5XX && SKIP_5XX.test(url))) bad.push(line)
      net.push(line)
    })
    await use(page)
    // 终态兜底图：步骤图已拍则被同图去重吸收；首步即挂也能留现场
    await capture(page, testInfo, '终态')
    if (net.length) {
      const md = testInfo.outputPath('网络请求.md')
      writeFileSync(md, `共 ${net.length} 条\n${net.slice(-80).join('\n')}`)
      await testInfo.attach('网络请求', { path: md, contentType: 'text/plain' })
    }
    if (bad.length) {
      // 判定降级（用户拍板）：5xx 不否决用例——记「环境警告」附件，回执/结果.md 警告段透出
      const warn = testInfo.outputPath('环境警告-5xx.txt')
      writeFileSync(warn, `以下接口返回 5xx（页面对应「服务器错误」提示）。判定以 spec 断言为准，本警告不改变用例结果：\n${[...new Set(bad)].slice(0, 10).join('\n')}`)
      await testInfo.attach('环境警告-5xx', { path: warn, contentType: 'text/plain' })
      console.warn(`[守门] ${bad.length} 条 5xx（已降级为警告，不影响判定）`)
    }
    CURRENT = null // 用例结束，登记上下文卸载（防泄漏到下一用例）
  },
})

// 断言登记「预期 vs 实际」——通用拦截方案：fixture 代理 expect，每次断言自动登记
// （断言描述 = expect(x, '描述') 第二参，团队既有写法零改动）；
// 结果.md 一一对应渲染，站点三色显示（✅ 绿 / ❌ 红 / ⚠️ 黄=阻塞）。
// expectItem() 保留为补充登记口（需自定义「实际」文本时用），非必需。

// 当前用例上下文（workers=1 串行，模块级安全）：page fixture use 期间挂载
let CURRENT: { testInfo: any; n: number } | null = null
function recordAssert(status: 'pass' | 'fail', text: string, detail: string) {
  if (!CURRENT) return
  try {
    appendFileSync(CURRENT.testInfo.outputPath('断言明细.jsonl'), JSON.stringify({ text, status, detail }) + '\n')
    // path 附件（json reporter 才回传引擎）；重复挂载无害——引擎读文件内容
    void CURRENT.testInfo.attach('断言明细', { path: CURRENT.testInfo.outputPath('断言明细.jsonl'), contentType: 'application/json' })
  } catch { /* 登记失败不影响执行 */ }
}

// 代理 expect：拦截各 matcher 调用，按结果登记（异步 matcher 走 then 包装，同步走 try/catch）
function proxyMatcher(matcher: any, text: string): any {
  if (typeof matcher !== 'object' || matcher === null) return matcher
  return new Proxy(matcher, {
    get(target: any, prop: string | symbol) {
      const v = target[prop as any]
      if (typeof v !== 'function' || typeof prop !== 'string') return typeof v === 'object' && v !== null ? proxyMatcher(v, text) : v
      return (...args: any[]) => {
        try {
          const r = v.apply(target, args)
          if (r && typeof r.then === 'function') {
            return r.then(
              (ok: any) => { recordAssert('pass', text, '断言通过'); return ok },
              (e: any) => { recordAssert('fail', text, firstLine(e)); throw e },
            )
          }
          recordAssert('pass', text, '断言通过')
          return r
        } catch (e: any) {
          recordAssert('fail', text, firstLine(e))
          throw e
        }
      }
    },
  })
}
const firstLine = (e: any) => String(e?.message || e).split('\n').map((l: string) => l.trim()).filter(Boolean)[0]?.slice(0, 200) || '断言未达成'

function patchedExpect(actual: any, messageOrOptions?: any, ...rest: any[]) {
  const text = typeof messageOrOptions === 'string' && messageOrOptions ? messageOrOptions : `断言 ${CURRENT ? ++CURRENT.n : '?'}`
  try {
    const matcher = (baseExpect as any)(actual, messageOrOptions, ...rest)
    return proxyMatcher(matcher, text)
  } catch (e: any) {
    recordAssert('fail', text, firstLine(e))
    throw e
  }
}
const baseExpect = pwExpect
const wrappedExpect: any = Object.assign(patchedExpect, pwExpect)

// expectItem：显式登记（自定义「实际」文本），兼容旧调用方
export async function expectItem(testInfo: any, text: string, fn: () => any) {
  let status = 'pass'
  let detail = ''
  const prev = CURRENT
  CURRENT = { testInfo, n: 0 } // expectItem 内部的 expect 也自动登记
  try {
    detail = String((await fn()) || '断言通过')
  } catch (e: any) {
    status = 'fail'
    detail = firstLine(e)
    throw e
  } finally {
    CURRENT = prev
    try {
      appendFileSync(testInfo.outputPath('断言明细.jsonl'), JSON.stringify({ text, status, detail }) + '\n')
      void testInfo.attach('断言明细', { path: testInfo.outputPath('断言明细.jsonl'), contentType: 'application/json' })
    } catch { /* 登记失败不影响执行 */ }
  }
}

// 统一截图：清遮挡（ESC + display:none 右侧大浮层，截图后还原）→ 同一用例内同页（URL）去重
const shotUrls = new WeakMap<any, Set<string>>()

export async function capture(page: any, testInfo: any, name: string) {
  await page.keyboard.press('Escape').catch(() => {})
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const cs = getComputedStyle(el)
      if (!/fixed|absolute/.test(cs.position)) continue
      const r = el.getBoundingClientRect()
      // 右侧大浮层（如助手挂件侧栏及其子浮条）：占右半屏的浮层整棵 display:none（子元素显式 visible 也无法复活）
      if (r.left > innerWidth * 0.55 && r.top < 250 && r.width > 150) {
        el.style.setProperty('__kb_hidden__', '1')
        el.style.display = 'none'
      }
    }
  }).catch(() => {})
  const buf = await page.screenshot({ fullPage: false }).catch((e: any) => { console.warn(`[capture:${name}] 截图失败`, String(e).slice(0, 120)); return null })
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('[style*="__kb_hidden__"]')) {
      el.style.removeProperty('display')
      el.style.removeProperty('__kb_hidden__')
    }
  }).catch(() => {})
  if (!buf) return
  // 同页去重：同一用例内同「URL+步骤名」只留一张；不同步骤名各留一张（SPA 站内多视图：列表→详情同 URL 两张）
  const key = page.url() + '::' + name
  let set = shotUrls.get(testInfo)
  if (!set) { set = new Set(); shotUrls.set(testInfo, set) }
  if (set.has(key)) return
  set.add(key)
  // path 模式挂附件（实证：body 模式经 json reporter 会丢内容 path=N b64=0，path 模式稳定）
  const file = testInfo.outputPath(`页面-${name}.png`)
  writeFileSync(file, buf)
  await testInfo.attach(`页面-${name}`, { path: file, contentType: 'image/png' }).catch((e: any) => console.warn(`[capture:${name}] 附件挂载失败`, String(e).slice(0, 120)))
}

export { wrappedExpect as expect }
export type { TestInfo } from '@playwright/test'
