// 逐用例进度 + 附件归档（自定义 playwright reporter）：
// 每条 onTestEnd 立即归档附件到 runs/<ts>/<CASE-ID>/ 并写进度 jsonl——引擎轮询实时刷新回执，
// 站点完成一个绿一个、抽屉当场能看图；一次全量跑批量性能不变。
// 启用：playwright test --reporter=./scripts/kb-progress-reporter.mjs（KB_RUN_DIR / KB_PROGRESS_FILE 由引擎注入）
import { appendFileSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export default class ProgressReporter {
  onBegin() {
    this.file = process.env.KB_PROGRESS_FILE
    this.runDir = process.env.KB_RUN_DIR
  }

  onTestEnd(test, result) {
    if (!this.file) return
    const id = (test.title.match(/TC-[\w]+-\d+/) || [])[0] || test.title.slice(0, 20).replace(/\W/g, '_')
    const arts = []
    for (const a of result.attachments || []) {
      const ctype = a.contentType || ''
      if (ctype.includes('zip') || /^trace$/i.test(a.name || '')) continue // trace 不留
      if (/^error-context$/i.test(a.name)) continue // ARIA 快照不入库
      const name = (a.name || 'attachment').replace(/[^\w一-龥-]+/g, '_').slice(0, 40)
      const ext = (a.path || '').match(/\.(png|md|txt|json)$/i)?.[0] || (ctype.includes('png') ? '.png' : '.md')
      try {
        if (this.runDir) {
          mkdirSync(join(this.runDir, id), { recursive: true })
          const dest = join(this.runDir, id, `${id}-${name}${ext}`)
          if (a.path && existsSync(a.path)) copyFileSync(a.path, dest)
          else if (a.body) writeFileSync(dest, Buffer.from(a.body, 'base64'))
          else continue
          arts.push(`${id}/${id}-${name}${ext}`)
        }
      } catch { /* 单附件归档失败不影响整体 */ }
    }
    try {
      appendFileSync(this.file, JSON.stringify({
        title: test.title,
        status: result.status, // passed | failed | timedOut | skipped | interrupted
        duration_ms: result.duration || 0,
        error: String(result.error?.message || '').slice(0, 4000),
        artifacts: arts,
      }) + '\n')
    } catch { /* 上报失败不影响执行 */ }
  }
}
