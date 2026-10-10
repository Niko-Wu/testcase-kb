// TC-DEMO-002 搜索失败示例：前序断言通过、末条断言锚不存在元素 → ❌（演示失败态）
import { test, expect, capture } from '../common/fixture';

test('TC-DEMO-002 搜索失败示例', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/__demo/', { waitUntil: 'domcontentloaded', timeout: 60_000 }); // demo 站挂在 kb-server 的 /__demo/ 路径；换真实站点改画像 envs 后 goto('/')
  await page.locator('#kw').fill('天气预报');
  await page.locator('#kw').press('Enter');
  await expect(page.locator('#content_left'), '结果列表渲染（含天气内容）').toBeVisible({ timeout: 60_000 });
  // 演示失败断言：故意锚一个不存在的元素（3s 超时 → ❌，后续断言如存在将标 ⚠️）
  await expect(page.locator('#kb-demo-nonexistent'), '演示失败断言（不存在的元素可见）').toBeVisible({ timeout: 3_000 });
  await capture(page, testInfo, '失败示例');
});
