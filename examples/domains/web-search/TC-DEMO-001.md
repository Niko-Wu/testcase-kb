---
id: TC-DEMO-001
domain: web-search
apps: [demo-search]
title: 天气搜索冒烟
priority: P0
type: e2e
status: active
spec: specs/web-search/demo-search.spec.ts
---

# 天气搜索冒烟

搜索「天气预报」出结果列表，点击结果查看详情（通过示例 ✅：多步链路 + 两张截图——搜索结果与详情视图）。

## 前置条件

- 本地 demo 站在线（pnpm kb:server，无需登录态）

## 步骤

1. 打开 demo 站首页
2. 搜索框输入「天气预报」并回车
3. 等结果页渲染
4. 点击第一条结果查看详情

## 断言

- [ ] 搜索框可用（首页渲染完成）
- [ ] 结果列表渲染（含天气内容）
- [ ] 点击结果可查看详情（详情面板渲染）
