# specs/ — 可执行 spec.ts

与 `domains/` 域名对齐：`domains/web-search/` 的用例，其 spec 放 `specs/web-search/`。

- 用例 frontmatter 的 `spec` 字段指向这里的相对路径
- spec 由 e2e 执行会话（claude code / e2e-flow）编写与维护，跑完回写用例状态
- 跨应用流程的 spec 不放任何单一应用仓库——本仓是唯一归宿
