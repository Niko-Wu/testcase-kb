---
id: app-demo-search
name: demo-search
kind: website
stack: 本地静态 demo（插件自带，零外部依赖）
envs:
  demo: http://127.0.0.1:4570/__demo/
auth: none # 公开站点无需登录态（引擎跳过登录探针）
---

# demo-search — 应用画像（示例）

知识库自带示例站：由 `kb-server` 在 `/__demo/` 路径托管（`examples/demo-site/`），本地静态、离线可用、永远稳定。

## e2e 环境策略

- 前置：站点 server 在线（`pnpm kb:server` 或 `/kb-view`）；默认端口 4570
- 锚点与真实搜索页对齐：搜索框 `#kw`、按钮 `#su`、结果列表 `#content_left`——**换真实站点做测试时只改本画像 envs，用例零改动**

## 做用例时的坑

- 结果渲染有 300ms 模拟延迟——断言用 expect 等待而非 sleep（demo 特意保留这个教学点）
- 搜「天气」类词走固定天气数据（含温度文案）；其他词走通用结果
