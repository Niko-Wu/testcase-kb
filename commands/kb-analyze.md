---
description: 失败/阻塞用例归因（读回执证据链给出结论与下一步）
argument-hint: "<TC-ID 或 最新一批>"
---

# kb-analyze

失败归因，输出「结论 + 证据 + 下一步」，不猜。

1. 定位最新回执：`ls <KB_ROOT>/runs | sort | tail`；找目标用例目录。
2. 读证据链（全在 `runs/<run>/<TC-ID>/`）：
   - `<ID>-结果.md`：断言三态 checklist（哪个 ❌、之后 ⚠️）、服务端错误段、环境警告
   - `<ID>-断言明细.md`：逐条断言的预期 vs 实际
   - `<ID>-页面-终态.png`：失败现场（用 Read 看图）
   - `../engine.log`：引擎级故障（pw-err / FATAL 段）
3. 归因分类给结论：
   - 环境波动（5xx/超时/风控页）→ 建议 kb-run 重跑
   - 锚点失效（选择器/文案漂移）→ 走 kb-case 重锚
   - 用例设计缺陷（断言本身不合理）→ 说明并给修改建议
   - 真实业务 bug → 整理证据（截图+traceid+步骤）给用户
4. 多条批量失败先看 engine.log（引擎级故障会全员 blocked）再逐条。
