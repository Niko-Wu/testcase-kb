# 贡献指南

感谢关注 testcase-kb！这是一个本地优先的测试用例知识库 Claude Code 插件。

## 环境要求

- Node.js ≥ 20（建议 22）
- pnpm ≥ 9
- 首次运行会自动下载 Chromium（Playwright，约 1-2 分钟，仅一次）

## 本地跑通（5 分钟）

```bash
git clone https://github.com/Niko-Wu/testcase-kb.git
cd testcase-kb
pnpm install
KB_ROOT=/tmp/kb-test node scripts/kb-init.mjs   # 初始化数据目录到任意路径
KB_ROOT=/tmp/kb-test node scripts/kb.mjs validate  # 3 条示例用例应全部通过
```

跑一条示例用例（内置离线 demo 站，kb-server 会自动拉起）：

```bash
KB_ROOT=/tmp/kb-test node scripts/kb-run.mjs case TC-DEMO-001
```

> 内置三态示例：TC-DEMO-001 通过 / TC-DEMO-002 故意失败 / TC-DEMO-003 故意阻塞——后两条失败是设计如此。

## 项目结构

```
scripts/        引擎与工具（kb-run 执行 / kb-init 初始化 / kb-server 站点 / kb-auth 登录态）
examples/       新用户首次 init 时播种的示例域（web-search + 模板）
commands/       Claude Code slash 命令（/kb-init /kb-case /kb-run /kb-view /kb-analyze）
skills/         写用例规范（kb-authoring：双源同构）
.vitepress/     站点配置与主题（进度页）
```

## 写/改用例的核心规则：双源同构

每条用例有两个源，断言文本必须逐字对齐：

1. `domains/<域>/<TC-ID>.md` —— 用例文档（frontmatter + 步骤 + 预期结果 checklist）
2. `specs/<域>/<名称>.spec.ts` —— Playwright 脚本（步骤注释 = 文档步骤；`expect` 描述 = checklist 项）

改一处必须同步另一处，`kb.mjs validate` 会校验两源一致性。详见 `skills/kb-authoring/`。

## 提交与 PR

- Commit message 用 Conventional Commits（`feat:` / `fix:` / `docs:` / `chore:`）
- fork → 建分支 → 提 PR；CI（依赖安装 + init 自举 + validate + 站点构建）必须绿
- 改动 `scripts/` 或 `skills/` 的，请在 PR 里贴一段实际运行输出作为验证证据
- 界面/文档改动保持中文为主（英文文档 `README.en.md` 同步更新）

## 行为准则

保持友善与就事论事；issue 讨论聚焦技术本身。
