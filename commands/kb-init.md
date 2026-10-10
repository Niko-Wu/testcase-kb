---
description: 初始化/修复本地用例知识库（数据目录 + 依赖 + 站点）
argument-hint: [数据目录路径（可选，默认 ~/.testcase-kb）]
---

# kb-init

为用户初始化测试用例知识库。步骤：

1. 定位插件安装根（本插件仓库目录，含 scripts/ 与 examples/）；数据目录默认 `~/.testcase-kb`（参数可覆盖，导出 KB_ROOT 给后续命令）。
2. 运行 `node <插件根>/scripts/kb-init.mjs`（KB_ROOT=<数据目录>）——依赖自举（缺 node_modules/Chromium 会就地安装，首次约 1-2 分钟）、从 examples 播种示例域、软链 node_modules、种站点入口页。
3. 校验：`node <插件根>/scripts/kb.mjs validate`（KB_ROOT 环境变量带上）。
4. 告诉用户数据目录位置与示例域（web-search），引导跑 `/kb-run web-search` 验证。

注意：数据目录是用户私有资产，任何写操作前确认目标路径；已存在的文件 kb-init 不覆盖。
