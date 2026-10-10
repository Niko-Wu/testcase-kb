import { defineConfig, devices } from '@playwright/test';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// 数据目录（纯本地私有）：用例/spec/登录态都在这里，KB_ROOT 环境变量可覆盖
const KB_ROOT = resolve(process.env.KB_ROOT || join(homedir(), '.testcase-kb'));

// 环境参数化：环境链接由维护者写在应用画像（apps/*.md frontmatter envs），代码零写死
//   BASE_URL       目标环境域名——必填，无默认。引擎按用例关联应用画像 envs 自动推导；手跑需显式设
//   ENV_TAG        需求分支标签（注入 envtag 请求头），不设走默认路由
//   EXTRA_HEADERS  附加请求头 JSON（如网关路由微应用的头），由引擎从应用画像 exec.headers 透传
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL 未设置：请通过 pnpm run:case / run:domain / run:smoke 执行（环境自动从应用画像 envs 推导），或显式设 BASE_URL=https://...');
const ENV_TAG = process.env.ENV_TAG || '';
// 项目环境标签注入的请求头名：ENV_TAG_HEADER 指定（引擎按域配置透传），默认 envtag
const ENV_TAG_HEADER = process.env.ENV_TAG_HEADER || 'envtag';
const EXTRA_HEADERS: Record<string, string> = process.env.EXTRA_HEADERS ? JSON.parse(process.env.EXTRA_HEADERS) : {};

export default defineConfig({
  testDir: join(KB_ROOT, 'specs'),
  timeout: 300_000,
  fullyParallel: false,
  workers:  1,
  retries: 0,
  reporter: [['list']],
  outputDir: '.artifacts/',
  use: {
    // e2e 标准姿势：直打目标环境域名（登录态 cookie 同域生效），不起本地前端
    baseURL: BASE_URL,
    storageState: join(KB_ROOT, '.auth/state.json'),
    extraHTTPHeaders: {
      ...EXTRA_HEADERS,
      ...(ENV_TAG ? { [ENV_TAG_HEADER]: ENV_TAG } : {}),
    },
    viewport: { width: 1440, height: 900 },
    // 被测应用语言/时区由应用画像 exec.locale 配置（引擎经 KB_LOCALE/KB_TIMEZONE 透传），引擎不写死——多语言用例改画像即可
    ...(process.env.KB_LOCALE ? { locale: process.env.KB_LOCALE } : {}),
    ...(process.env.KB_TIMEZONE ? { timezoneId: process.env.KB_TIMEZONE } : {}),
    // 产物收敛：截图由 fixture.capture 统一管理（每页一张+去重+清遮挡），trace 默认关
    trace: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 90_000, // 测试环境加载慢（实证），goto 一律 domcontentloaded + 元素等待兜底
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
