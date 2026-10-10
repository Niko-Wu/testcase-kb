// TC-DEMO-003 搜索阻塞示例：超时预算 3s + 步骤长等待 → 超时中断，断言全部未执行 → ⚠️
import { test, expect, capture } from '../common/fixture';

test('TC-DEMO-003 搜索阻塞示例', async ({ page }, testInfo) => {
  test.setTimeout(3_000);
  await page.goto('/__demo/', { waitUntil: 'domcontentloaded', timeout: 60_000 }); // demo 站挂在 kb-server 的 /__demo/ 路径；换真实站点改画像 envs 后 goto('/')
  await page.waitForTimeout(30_000); // 故意超出预算：用例被超时打断
  await expect(page.locator('#kw'), '搜索框可用（首页渲染完成）').toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#content_left'), '结果列表渲染（含天气内容）').toBeVisible({ timeout: 60_000 });
  await capture(page, testInfo, '阻塞示例');
});
