---
description: 起本地知识库站点（进度/总览可视化）并给出可分享链接
argument-hint: "[端口（默认 4570）]"
---

# kb-view

起本地站点（跑完直接给可点击的链接）。

1. 检查端口（默认 4570）是否已被 kb-server 占用：`lsof -i :4570`。已占用直接给链接。
2. 未占用：`KB_ROOT=<数据目录> node <插件根>/scripts/kb-server.mjs --port <端口>` 后台常驻；首启自动构建站点（1-2 分钟，仅一次）。
3. 给用户输出：
   - 本机：http://localhost:4570
   - 局域网分享（测试同学无需任何安装）：http://<本机IP>:4570/progress
4. 站点实时刷新（执行中 2s 轮询），不用重启 server。

不在站点产物目录里改任何业务文件；server 崩了重启即可（数据在 KB_ROOT 不受影响）。
