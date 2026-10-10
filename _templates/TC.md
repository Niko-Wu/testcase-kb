---
id: TC-<域缩写>-<序号>        # 必填，与文件名一致，全局唯一
domain: <业务域>              # 必填，与所在目录名一致，如 web-search
apps: [demo-search]    # 必填，数组。跨应用用例列全，如 [demo-search, my-backend]
title: 用例标题                # 必填，一句话说清场景
priority: P0                  # 必填，P0 主流程 / P1 重要分支 / P2 边缘
type: e2e                     # 必填，e2e / smoke / api
status: draft                 # 必填，draft / active / flaky / deprecated
spec: ''                      # 对应 specs/ 下 spec.ts 路径，空 = 未自动化
last_run: ''                  # 执行回写，人不手改
last_result: ''               # 执行回写：pass / fail / blocked
---

# <用例标题>

## 前置条件

- 登录态 / 数据 / 环境要求

## 步骤

1. …

## 断言

- [ ] 断言 1（严格 pass：全部断言过才算过）
- [ ] 断言 2

## 历史坑

- （为什么这么设计、踩过什么雷——知识库的核心价值在这里）
