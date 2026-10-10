// TC-DEMO-001 天气搜索冒烟（通过示例：多步多图——搜索结果 + 点击详情两张截图）
import { test, expect, capture } from '../common/fixture';

test('TC-DEMO-001 天气搜索冒烟', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/__demo/', { waitUntil: 'domcontentloaded', timeout: 60_000 }); // demo 站挂在 kb-server 的 /__demo/ 路径；换真实站点改画像 envs 后 goto('/')
  const kw = page.locator('#kw');
  await expect(kw, '搜索框可用（首页渲染完成）').toBeVisible({ timeout: 30_000 });
  await kw.fill('天气预报');
  await kw.press('Enter');
  await expect(page.locator('#content_left'), '结果列表渲染（含天气内容）').toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#content_left')).toContainText(/天气/, { timeout: 30_000 });
  await capture(page, testInfo, '搜索结果');
  // 点击第一条结果查看详情（第二视图）
  await page.locator('#content_left li').first().click();
  await expect(page.locator('#detail'), '点击结果可查看详情（详情面板渲染）').toContainText('当前温度', { timeout: 15_000 });
  await capture(page, testInfo, '结果详情');
});
