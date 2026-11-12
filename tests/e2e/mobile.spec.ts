import { expect, test } from '@playwright/test';
import { boot, report, shot, state, waitScene } from './helpers';

// Phone-sized touch run (Pixel 7 emulation): touch buttons, virtual joystick, tap-to-use.
test('mobile: touch controls work in the lockdown scene', async ({ page }) => {
  const run = await boot(page, 8);
  await shot(page, 'm1-mobile-title');
  await page.getByTestId('begin').tap();
  await waitScene(page, 'exam');
  await page.getByTestId('skip').tap();
  await waitScene(page, 'code');
  await expect(page.getByTestId('obj-away')).toBeVisible({ timeout: 60_000 });
  // real touch events through CDP so the joystick receives pointer events
  const cdp = await page.context().newCDPSession(page);
  await page.getByTestId('crouch-btn').tap();
  await expect.poll(async () => (await page.evaluate(() => window.__lockdown.player())).stance).toBe('crouch');
  await page.getByTestId('phone-btn').tap();
  await page.getByTestId('phone-silent').tap();
  await expect.poll(async () => (await state(page)).steps.phoneSilenced).toBe(true);
  await expect(page.getByTestId('phone')).not.toHaveClass(/open/);
  await page.waitForTimeout(500);
  await expect(page.locator('.joy')).toBeVisible();
  const joy = (await page.locator('.joy').boundingBox())!;
  const cx = joy.x + joy.width / 2;
  const cy = joy.y + joy.height / 2;
  const before = await page.evaluate(() => window.__lockdown.player());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy + 45 }] });
  await page.waitForTimeout(1200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = await page.evaluate(() => window.__lockdown.player());
  expect(after.z).toBeGreaterThan(before.z + 0.5); // pulled the stick down = walked backwards
  // drag to look
  const yaw0 = after.yaw;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 300 }] });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - i * 20, y: 300 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  const yaw1 = (await page.evaluate(() => window.__lockdown.player())).yaw;
  expect(yaw1).not.toBeCloseTo(yaw0, 2);
  await shot(page, 'm2-mobile-code');
  // texting Zoe on a phone screen: every reply must be on-screen and tappable
  await page.getByTestId('skip').tap();
  await waitScene(page, 'texts');
  await expect(page.getByTestId('reply-nothing')).toBeVisible({ timeout: 60_000 });
  const vp = page.viewportSize()!;
  for (const id of ['reply-calm', 'reply-stay', 'reply-come', 'reply-nothing']) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.y + b.height, `${id} inside viewport`).toBeLessThanOrEqual(vp.height);
    expect(b.y).toBeGreaterThanOrEqual(0);
  }
  await expect(page.getByTestId('msg-zoe').filter({ hasText: 'noah im scared' })).toBeInViewport();
  await shot(page, 'm3-mobile-texts');
  await page.getByTestId('reply-calm').tap();
  await expect.poll(async () => (await state(page)).replies[0]).toBe('calm');
  await page.getByTestId('exit').tap();
  await expect(page.getByTestId('exit-screen')).toBeVisible();
  await shot(page, 'm4-mobile-exit');
  report('mobile', { moved: after.z - before.z, yawChange: yaw1 - yaw0, errors: run.errors });
  expect(run.errors).toEqual([]);
});
