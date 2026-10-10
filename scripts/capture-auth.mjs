// 取登录态：headed 打开目标环境站点，用户手动登录（滑块验证码 headless 连拒）。
// 被动判定：目标域出现会话 cookie 且页面驻留目标域（不回跳 auth.）后，单次复验通过才保存。
// 注意：绝不循环 reload——会打断用户进行中的滑块登录。
// 用法: node scripts/capture-auth.mjs [BASE_URL]；缺省取应用画像 envs 第一个（维护者把常用环境放首位）
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { collect } from './gen-data.mjs';

const OUT = path.resolve(import.meta.dirname, '../.auth/state.json');
const LOGIN_URL = (process.argv[2] || collect().apps.map((a) => Object.values(a.envs || {})[0]).filter(Boolean).map(String)[0] || '').replace(/\/$/, '');
if (!LOGIN_URL) {
  console.error('未找到目标环境：请在应用画像（apps/*.md）frontmatter 维护 envs，或显式传参 node scripts/capture-auth.mjs <BASE_URL>');
  console.error('环境链接由维护者管理（应用画像 frontmatter envs），脚本零写死。');
  process.exit(1);
}
const HOST = new URL(LOGIN_URL).hostname;
const WAIT_MS = 8 * 60 * 1000; // 最长等 8 分钟

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 通用判定：存在 domain 覆盖目标 host 的 cookie（不写死会话 cookie 名——SSO 实现各环境可异）
const hasSessionCookie = (ctx) =>
  ctx.cookies().then((cs) => cs.some((c) => { const d = (c.domain || '').replace(/^\./, ''); return d && (HOST === d || HOST.endsWith('.' + d)) }));

console.log('请登录'); // 弹窗标记：请在浏览器里完成登录（含滑块验证码），登录后停在开发者平台页面即可

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(LOGIN_URL, { waitUntil: 'commit', timeout: 60_000 }).catch(() => {});

const deadline = Date.now() + WAIT_MS;
let ok = false;
while (Date.now() < deadline) {
  const onTarget = page.url().startsWith(LOGIN_URL);
  if (!onTarget || !(await hasSessionCookie(context))) {
    await sleep(3000); // 被动等待：用户在 SSO/滑块页，绝不 reload
    continue;
  }
  // 目标域 cookie 在 + 已驻留目标域：单次复验（reload 一次，仍站得住才算）
  const resp = await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null);
  await page.waitForTimeout(5000);
  if (resp?.ok() && !page.url().includes('auth.')) { ok = true; break; }
  await sleep(3000); // 复验失败回跳 SSO：回被动等待
}
if (!ok) {
  console.error('FAIL: 8 分钟内未取得有效登录态（目标域 cookie + 驻留 + 复验通过）');
  await browser.close();
  process.exit(1);
}
console.log('OK: 登录态有效（复验通过:', page.url(), '）');

await context.storageState({ path: OUT });
console.log('OK: 登录态已保存', OUT);
await browser.close();

// 附：session 接口 200 复核（网关认不认这个 cookie 的最终裁决）
const ctx2 = await chromium.launch().then((b) => b.newContext({ storageState: OUT }));
const p2 = await ctx2.newPage();
const r = await p2.request.get(LOGIN_URL).catch(() => null);
console.log(r ? `目标环境复核: HTTP ${r.status()}` : '目标环境复核: 请求失败');
await ctx2.close();
