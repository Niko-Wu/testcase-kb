---
description: 写/改一条可执行测试用例（生成 domains 用例 md + specs 脚本，断言双源同构）
argument-hint: "<域> <用例意图描述>（如：web-search 搜索新闻词出结果列表）"
---

# kb-case

写用例（人不写 spec.ts，你写）。先读技能 `skills/kb-authoring/SKILL.md` 再动手。

流程：

1. **定位**：数据目录（默认 ~/.testcase-kb，KB_ROOT）。读 `apps/*.md` 画像（环境/锚点/坑）与 `knowledge/<域>.md` 领域知识；域不存在时先按 kb-authoring 的画像模板补画像，并询问用户环境链接。
2. **锚点探针**（关键，不许瞎写选择器）：对目标环境用 playwright 探一次真实 DOM（`node <插件根>/scripts/kb-record.mjs <url>` 录制或直接让 Claude 起 playwright 抓页面结构），只锚实证存在的元素/接口/文案。
3. **写双源**：
   - `<KB_ROOT>/domains/<域>/TC-<域缩写>-<序号>.md`：frontmatter（id/domain/apps/title/priority/type/status/spec）+ 步骤 + `## 断言` checklist
   - `<KB_ROOT>/specs/<域>/<slug>.spec.ts`：import `../common/fixture`；**expect 的第二参描述必须与 md 断言文本逐字一致**（执行结果三态勾选靠文本对齐）
4. **自检**：`node <插件根>/scripts/kb.mjs validate`；`BASE_URL=<画像envs首位> npx playwright test <spec> --list`（cwd 插件根，KB_ROOT 带上）确认收集通过。
5. **跑给用户看**：调 kb-run 单条执行，汇报三态结果与截图。

边界：断言锚结构性存在优先于具体文案（内容可变）；不确定的锚点标注「待验证」并跑探针实证，禁止凭记忆写选择器。
