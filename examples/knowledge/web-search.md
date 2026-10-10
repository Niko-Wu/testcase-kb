---
title: web-search 领域知识库
---

# web-search — 搜索域（示例）

演示域：打插件自带的本地 demo 站（离线可用、永远稳定）展示知识库全流程——通过 / 失败 / 阻塞三态、附件截图、断言 checklist。

## 测试用例范围

| 面 | 覆盖 |
|---|---|
| 搜索链路 | 首页渲染 → 输入 → 回车 → 结果列表 |
| 三态演示 | TC-DEMO-001 通过 / 002 失败（前序断言仍 ✅）/ 003 阻塞（checklist 全 ⚠️） |

## 特殊配置

- 环境：画像 `apps/demo-search.md` envs（本地 demo 站，前置 `pnpm kb:server`；无需登录态）
- 域配置：`domains/web-search/_config.yaml`（tagHeader 默认 envtag，未用到）

## 做用例时的坑

- 首页偶发风控/安全验证跳转——失败先看终态截图确认页面落点
- 断言描述必须与用例 md 的 checklist 文本一致（执行结果三态勾选靠文本对齐匹配）
