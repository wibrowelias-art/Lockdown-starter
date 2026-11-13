import { expect, test } from '@playwright/test';
import { SHOTS, boot, report, shot, state, waitScene } from './helpers';

// phones run the Low preset, so their screenshots stay Low too

// Phone-sized touch run (Pixel 7 emulation): touch buttons, virtual joystick, drag-to-look, texting.
test('mobile: touch controls and texting work', async ({ page }) => {
  const run = await boot(page, 8);
  await shot(page, 'm1-mobile-title', SHOTS, false);
  await page.getByTestId('begin').tap();
  expect(await page.evaluate(() => window.__lockdown.quality())).toBe('low');
  for (const sc of ['exam', 'code']) {
    await waitScene(page, sc);
    await page.getByTestId('skip').tap();
  }
  await waitScene(page, 'lockdown');
  await expect(page.getByTestId('crouch-btn')).toBeVisible();
  await page.getByTestId('phone-btn').tap();
  await page.getByTestId('phone-silent').tap();
  await expect.poll(async () => (await state(page)).tasks.silencePhone).toBe(true);
  await expect(page.getByTestId('phone')).not.toHaveClass(/open/);
  await page.waitForTimeout(500);
  const cdp = await page.context().newCDPSession(page);
  const joy = (await page.locator('.joy').boundingBox())!;
  const cx = joy.x + joy.width / 2;
  const cy = joy.y + joy.height / 2;
  const before = await page.evaluate(() => window.__lockdown.player());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - 45 }] });
  await page.waitForTimeout(900);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = await page.evaluate(() => window.__lockdown.player());
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  expect(moved).toBeGreaterThan(0.5);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 420 }] });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - i * 20, y: 420 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  const yaw1 = (await page.evaluate(() => window.__lockdown.player())).yaw;
  expect(yaw1).not.toBeCloseTo(after.yaw, 2);
  await shot(page, 'm2-mobile-lockdown', SHOTS, false);
  await page.getByTestId('skip').tap();
  await waitScene(page, 'texts');
  await expect(page.getByTestId('phone-btn')).toHaveClass(/badge/, { timeout: 60_000 });
  await page.getByTestId('phone-btn').tap();
  await expect(page.getByTestId('reply-nothing')).toBeVisible({ timeout: 60_000 });
  const vp = page.viewportSize()!;
  for (const id of ['reply-calm', 'reply-stay', 'reply-come', 'reply-nothing']) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.y + b.height, `${id} inside viewport`).toBeLessThanOrEqual(vp.height);
    expect(b.y).toBeGreaterThanOrEqual(0);
  }
  await expect(page.getByTestId('msg-zoe').filter({ hasText: 'noah im scared' })).toBeInViewport();
  await shot(page, 'm3-mobile-phone', SHOTS, false);
  await page.getByTestId('reply-calm').tap();
  await expect.poll(async () => (await state(page)).replies[0]).toBe('calm');
  await page.getByTestId('exit').tap();
  await expect(page.getByTestId('exit-screen')).toBeVisible();
  report('mobile', { moved, errors: run.errors });
  expect(run.errors).toEqual([]);
});
