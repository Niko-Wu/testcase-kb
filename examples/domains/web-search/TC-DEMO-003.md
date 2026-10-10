---
id: TC-DEMO-003
domain: web-search
apps: [demo-search]
title: 搜索阻塞示例（超时中断）
priority: P1
type: e2e
status: active
spec: specs/web-search/demo-search-blocked.spec.ts
---

# 搜索阻塞示例（超时中断）

演示阻塞态 ⏸：用例超时预算 3s，但步骤里故意等待 30s——执行被超时打断，断言全部未执行到，
checklist 整体标 ⚠️。

## 前置条件

- 本地 demo 站在线（pnpm kb:server，无需登录态）

## 步骤

1. 打开 demo 站首页
2. 故意长等待（超出用例超时预算）

## 断言

- [ ] 搜索框可用（首页渲染完成）
- [ ] 结果列表渲染（含天气内容）
