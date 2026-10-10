---
id: TC-DEMO-002
domain: web-search
apps: [demo-search]
title: 搜索失败示例（断言不通过）
priority: P1
type: e2e
status: active
spec: specs/web-search/demo-search-fail.spec.ts
---

# 搜索失败示例（断言不通过）

演示失败态 ❌：搜索正常完成、前序断言通过，最后一条断言锚一个不存在的元素（3s 超时失败）——
失败用例中已过的断言仍标 ✅，失败项之后未执行到的标 ⚠️。

## 前置条件

- 本地 demo 站在线（pnpm kb:server，无需登录态）

## 步骤

1. 打开 demo 站首页，搜索「天气预报」
2. 断言结果列表渲染
3. 断言一个演示用不存在元素

## 断言

- [ ] 结果列表渲染（含天气内容）
- [ ] 演示失败断言（不存在的元素可见）
