# testcase-kb — Local Test-Case Knowledge Base (Claude Code Plugin)

中文 | [English](./README.md)

**What it is**: a test-case knowledge base that lives inside Claude Code. Describe a case in one sentence — Claude writes the executable e2e test; the engine runs it; you watch progress, screenshots, and tri-state assertion results in a browser. All data stays on your machine.

**The problem it solves**: writing a runnable Playwright test is hard for non-engineers (selectors, waits, assertions, auth, environments). This plugin hands that craft to Claude (anchors are probe-verified, never guessed) and turns "reading results" into a visual page made for testers.

**What you get**:
- Test designers: one sentence → one executable case; assertion checklists auto-align with results (✅ pass / ❌ fail / ⚠️ blocked)
- Test execution: run a whole domain in one command, filter failures and batch-rerun, flaky notes archived
- Testers: open a LAN link to see progress, failure reasons, and screenshots — zero install
- Team asset: data is local-first and fully private by default; to share the domain knowledge base and test cases, push the data dir (domains/ apps/ specs/ knowledge/) to a hosted git repo — plain markdown, clone gives the whole library

```
Claude (this plugin)             Local data dir ~/.testcase-kb (fully private)
/kb-case  write ───────────────▶  domains/  case markdown (single source)
/kb-run   run   ──engine runs──▶  specs/    Playwright scripts
/kb-view  watch ◀──site link────  runs/     receipts (screenshots / tri-state / network)
                                  apps/     app profiles / knowledge/ domain knowledge
```

> Ships with a local demo domain (pass ✅ / fail ❌ / blocked ⚠️) that hits the plugin's built-in demo site — offline and deterministic.

## What it looks like

**Case overview** — assertion checklists auto-aligned with the latest run:

![Case overview](docs/screenshots/overview.png)

**Run progress** — tri-state summary with executed/total; click a row to expand:

![Run progress](docs/screenshots/progress.png)

**Run detail** — multi-select result filter, assertion checklist, failure reasons, and screenshots:

![Run detail](docs/screenshots/progress-detail.png)

**Case drawer** — click "detail + attachments" for per-assertion checks with failure/blocked reasons (actual ✓/✗):

![Case drawer](docs/screenshots/case-detail.png)

## Quick Start (Claude Code plugin)

```bash
# ① Register the marketplace (local path also works: claude plugin marketplace add /path/to/testcase-kb)
claude plugin marketplace add https://github.com/Niko-Wu/testcase-kb.git
# ② Install the plugin
claude plugin install testcase-kb@testcase-kb
```

Then, in any Claude Code session:

```
/kb-init      # first run auto-installs deps + Chromium (~1-2 min), then seeds the data dir (~/.testcase-kb) with the demo domain
/kb-case web-search search a news keyword and verify the result list   # write your own case
/kb-run web-search    # run the domain — tri-state report
/kb-view              # open http://localhost:4570 (LAN-shareable)
```

## Commands

| Command | What it does |
|---|---|
| `/kb-init` | Initialize the data dir (demo domain + dependency symlink + site pages) |
| `/kb-case` | Write/fix a case (conversational; generates dual-source files; probe-verified anchors) |
| `/kb-run` | Execute (single case / whole domain / smoke), live tri-state progress |
| `/kb-view` | Start the site and hand you the link (`http://localhost:4570`, LAN-shareable) |
| `/kb-analyze` | Failure triage (receipt evidence chain → conclusion + next step) |

CLI equivalents (`KB_ROOT` defaults to `~/.testcase-kb`):

```bash
pnpm kb:init                 # seed/repair the data dir
pnpm kb:server               # the site (--port 4570)
pnpm run:case TC-DEMO-001    # single case
pnpm run:domain web-search   # whole domain
pnpm auth import <host>      # import auth state from your browser (private sites)
pnpm record <url>            # Playwright codegen recording
```

## Verdict semantics

- **Only spec assertions decide**: all pass = ✅; any fail = ❌ (assertions before the failure stay ✅, unexecuted ones after it become ⚠️); timeout/interruption = ⚠️ blocked
- **Expected vs actual, one-to-one**: assertion descriptions equal the case's checklist text; real observations attach "actual ✓/✗" rows
- **5xx is a warning, not a failure**: environment noise goes into the exception allowlist (a regex); verdicts never change

## Writing an app profile (`apps/*.md`)

```yaml
---
name: my-app
kind: frontend
envs:                 # environment URLs (first = default)
  daily: https://my.daily.example.com
  prod: https://my.example.com
exec:
  headers:            # gateway routing headers (as needed)
    x-micro-app-name: my-app
  locale: zh-CN       # app language (headless default en-US renders English)
auth: none            # public site: skip the auth probe (delete for private sites)
---
```

The body covers: e2e environment strategy / account handling / known pitfalls — testing concerns only; keep project history in your own notes.

## Data dir layout (`~/.testcase-kb`)

```
├── domains/<domain>/TC-*.md    cases (frontmatter + steps + assertion checklist)
├── specs/<domain>/*.spec.ts    Playwright scripts (common/fixture shared)
├── apps/<app>.md               app profiles: envs / exec.headers / locale / auth / pitfalls
├── knowledge/<domain>.md       domain knowledge: scope / configs / verified pitfalls
└── runs/<timestamp>/           receipts: run.yaml + per-case 结果.md / screenshots / assertion details
```

Engine and site code live in the plugin repo (upgrades never touch your data).

**Local vs shared mode**: fully local by default (`~/.testcase-kb`, in no git). To share the domain knowledge base and test-case library with a team, push the data dir to a hosted git repo; teammates clone it and set `KB_ROOT=<repo path>` (or run from inside it) to get the same domains/ apps/ specs/ knowledge/. Execution receipts (runs/) and auth state (.auth/) stay on each machine via the pre-seeded `.gitignore` — they never mix.

## Developing this plugin

```bash
pnpm build          # build site to site-dist/ (auto-built on first server start, too)
pnpm kb:server      # serve static + /__kb/* APIs + live runs aggregation
```

Re-run `pnpm build` after theme changes (the server only serves built assets); engine scripts take effect immediately.

## License

MIT
