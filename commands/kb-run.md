---
description: 执行用例（单条/整域/筛选），实时汇报三态进度
argument-hint: "<TC-ID 或 域名 或 筛选条件> [环境名]"
---

# kb-run

执行已有用例（写用例走 kb-case）。

1. 环境变量 KB_ROOT 指向数据目录；cwd 用插件根（依赖在那）。
2. 登录态：私有站点画像无 `auth: none` 时，先 `node <插件根>/scripts/kb-auth.mjs verify <baseUrl>`；过期 → 引导用户浏览器登录后 `kb-auth.mjs import <host>`（不自动走登录页，风控）。
3. 执行：`node <插件根>/scripts/kb-run.mjs case <ID> | domain <域> | smoke`。长批挂后台，轮询 `<KB_ROOT>/runs/<最新>/run.yaml` 汇报进度（pass ✅ / fail ❌ / blocked ⚠️）。
4. 完成后：读最新回执 summary；失败用例读 `runs/<run>/<TC-ID>/<TC-ID>-结果.md` 归因（断言三态 + 服务端错误段 + 截图）；flaky（同锚点他批通过）建议重跑，锚点错误走 kb-case 修。
5. 可视化：`/kb-view` 给用户站点链接。

不修改任何业务代码；用例脚本问题才改 spec（改前说明）。
