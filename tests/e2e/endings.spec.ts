import { expect, test } from '@playwright/test';
import {
  boot,
  breatheWithTheo,
  clickTarget,
  doLockdownSteps,
  finishEnding,
  report,
  shot,
  state,
  waitScene,
  walk,
} from './helpers';

// One browser playthrough per ending. The game runs at ?speed=12 (sim time);
// UI buttons are clicked for real, 3D objects are clicked on the canvas after
// turning the camera to them, and movement uses the real player controller.

test('ending 1 - everyone went home (full walkthrough, screenshot of every scene)', async ({ page }) => {
  const run = await boot(page);
  await shot(page, '01-title-content-notice');
  await page.getByTestId('begin').click();
  await waitScene(page, 'exam');

  // Scene 1: exam
  await expect(page.getByTestId('subtitles')).toContainText('Ten more minutes', { timeout: 20_000 });
  await shot(page, '02-exam');
  await page.getByTestId('theo-help').click({ timeout: 30_000 });
  for (let r = 0; r < 8; r++) await clickTarget(page, `bubble:${r}:${(r * 3 + 1) % 4}`);
  expect((await state(page)).bubbles.length).toBe(8);
  await expect(page.getByTestId('obj-eraser')).toBeVisible({ timeout: 30_000 });
  await clickTarget(page, 'eraser');
  await expect.poll(async () => (await state(page)).gaveEraser).toBe(true);
  await page.evaluate(() => window.__lockdown.aim('door'));
  await expect(page.getByTestId('subtitles')).toContainText('hall pass', { timeout: 30_000 });
  await shot(page, '03-exam-zoe-hall-pass');

  // Scene 2: the code
  await waitScene(page, 'code');
  await expect(page.getByTestId('subtitles')).toContainText('science fair', { timeout: 30_000 });
  await shot(page, '04-code-pa');
  await expect(page.getByTestId('obj-away')).toBeVisible({ timeout: 60_000 });
  await shot(page, '05-code-steps');
  await doLockdownSteps(page, { helpTheo: true });
  await page.evaluate(() => window.__lockdown.aim('door'));
  await shot(page, '06-code-lights-off');

  // Scene 3: texts with Zoe
  await waitScene(page, 'texts');
  await expect(page.getByTestId('reply-calm')).toBeVisible({ timeout: 60_000 });
  await shot(page, '07-texts-zoe');
  await page.getByTestId('reply-calm').click();
  await expect(page.getByTestId('reply-calm')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('reply-calm').click();

  // Scene 4: waiting
  await waitScene(page, 'waiting');
  await expect(page.getByTestId('captions')).toContainText('rattles', { timeout: 60_000 });
  await page.evaluate(() => window.__lockdown.aim('door'));
  await shot(page, '08-waiting-handle');
  await expect(page.getByTestId('breathe-btn')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => window.__lockdown.aim('window'));
  await shot(page, '08b-waiting-breathe-sirens');
  await breatheWithTheo(page);
  await expect.poll(async () => (await state(page)).theoHelp.breathed, { timeout: 30_000 }).toBe(true);

  // Scene 5: the door
  await waitScene(page, 'door');
  await expect(page.getByTestId('door-keep')).toBeVisible({ timeout: 60_000 });
  await shot(page, '09-door-choice');
  await page.getByTestId('door-keep').click();

  await waitScene(page, 'ending');
  await expect(page.getByTestId('subtitles')).toContainText('Room 214, police', { timeout: 60_000 });
  await page.waitForTimeout(800);
  await shot(page, '10-ending-police');
  await finishEnding(page, 'all_clear', '11-end-everyone-went-home');

  const s = await state(page);
  expect(s.noise).toBeLessThan(45);
  expect(s.zoeTrust).toBeGreaterThanOrEqual(2);
  expect(s.helpedClassmate).toBe(true);
  const cues = await page.evaluate(() => window.__lockdown.audioLog());
  for (const c of ['bang', 'paChime', 'handleRattle', 'knock', 'voice:door', 'sirens', 'keys', 'footstepsHall'])
    expect(cues.some((x) => x.startsWith(c)), `sound cue ${c}`).toBe(true);
  report('ending-1-all_clear', { ending: s.ending, noise: s.noise, zoeTrust: s.zoeTrust, helped: s.helpedClassmate, noiseLog: s.noiseLog, errors: run.errors, warnings: run.warnings.length, cues: [...new Set(cues)] });
  expect(run.errors).toEqual([]);
});

test('ending 2 - left on read (ignore Zoe, keep the door locked)', async ({ page }) => {
  const run = await boot(page, 14);
  await page.getByTestId('begin').click();
  await waitScene(page, 'exam');
  await page.getByTestId('skip').click();
  await waitScene(page, 'code');
  await doLockdownSteps(page, { helpTheo: false });
  await waitScene(page, 'texts');
  await expect(page.getByTestId('reply-nothing')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('reply-nothing').click();
  await expect(page.getByTestId('reply-nothing')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('reply-nothing').click();
  await waitScene(page, 'waiting');
  await breatheWithTheo(page);
  await waitScene(page, 'door');
  await page.getByTestId('door-keep').click({ timeout: 60_000 });
  await finishEnding(page, 'left_on_read', '12-end-left-on-read');
  const s = await state(page);
  report('ending-2-left_on_read', { ending: s.ending, noise: s.noise, zoeTrust: s.zoeTrust, helped: s.helpedClassmate, errors: run.errors });
  expect(run.errors).toEqual([]);
});

test('ending 3 - the long minute (Theo left alone, door locked)', async ({ page }) => {
  const run = await boot(page, 14);
  await page.getByTestId('begin').click();
  await waitScene(page, 'exam');
  await expect(page.getByTestId('obj-eraser')).toBeVisible({ timeout: 60_000 });
  await clickTarget(page, 'eraser');
  await page.getByTestId('skip').click();
  await waitScene(page, 'code');
  await doLockdownSteps(page, { helpTheo: false });
  await waitScene(page, 'texts');
  await expect(page.getByTestId('reply-calm')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('reply-calm').click();
  await expect(page.getByTestId('reply-stay')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('reply-stay').click();
  await waitScene(page, 'waiting');
  // do not breathe with Theo: wait for the moment to pass
  await expect(page.getByTestId('breathe-btn')).toBeVisible({ timeout: 60_000 });
  await waitScene(page, 'door', 90_000);
  await page.getByTestId('door-keep').click({ timeout: 60_000 });
  await waitScene(page, 'ending');
  await page.evaluate(() => window.__lockdown.setSpeed(2));
  await expect(page.getByTestId('captions')).toContainText('Right outside the door', { timeout: 30_000 });
  await page.evaluate(() => window.__lockdown.aim('door'));
  await shot(page, '13-ending-long-minute-sequence');
  await page.evaluate(() => window.__lockdown.setSpeed(14));
  await finishEnding(page, 'long_minute', '14-end-the-long-minute');
  const s = await state(page);
  report('ending-3-long_minute', { ending: s.ending, noise: s.noise, zoeTrust: s.zoeTrust, helped: s.helpedClassmate, errors: run.errors });
  expect(run.errors).toEqual([]);
});

test('ending 4 - the door held (open the door, Theo was helped)', async ({ page }) => {
  const run = await boot(page, 14);
  await page.getByTestId('begin').click();
  await waitScene(page, 'exam');
  await page.getByTestId('skip').click();
  await waitScene(page, 'code');
  await doLockdownSteps(page, { helpTheo: true });
  await waitScene(page, 'texts');
  await expect(page.getByTestId('reply-come')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('reply-come').click();
  await expect(page.getByTestId('reply-stay')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('reply-stay').click();
  await waitScene(page, 'waiting');
  await page.getByTestId('skip').click();
  await waitScene(page, 'door');
  await expect(page.getByTestId('door-open')).toBeVisible({ timeout: 60_000 });
  const zoeMsgs = await page.getByTestId('msg-zoe').allTextContents();
  expect(zoeMsgs.join('|')).toContain("i didnt leave. still in the closet. who's knocking??");
  await page.getByTestId('door-open').click();
  await waitScene(page, 'ending');
  await page.evaluate(() => window.__lockdown.setSpeed(2));
  await expect(page.getByTestId('captions')).toContainText('opens an inch', { timeout: 30_000 });
  await page.waitForTimeout(300);
  await shot(page, '15-ending-door-held-sequence');
  await page.evaluate(() => window.__lockdown.setSpeed(14));
  await finishEnding(page, 'door_held', '16-end-the-door-held');
  const s = await state(page);
  report('ending-4-door_held', { ending: s.ending, noise: s.noise, zoeTrust: s.zoeTrust, helped: s.helpedClassmate, errors: run.errors });
  expect(run.errors).toEqual([]);
});

test('ending 5 - the open door (loud, Theo alone, open the door)', async ({ page }) => {
  const run = await boot(page, 14);
  await page.getByTestId('begin').click();
  await waitScene(page, 'exam');
  await page.getByTestId('skip').click();
  await waitScene(page, 'code');
  await expect(page.getByTestId('obj-away')).toBeVisible({ timeout: 60_000 });
  // Stand up and walk around: footsteps, chairs, phone keeps buzzing. Never silence it.
  await walk(page, [
    [1.75, -1.25],
    [-0.2, -1.3],
    [0.3, -0.2],
    [1.75, -1.25],
  ]);
  const p = await page.evaluate(() => window.__lockdown.player());
  expect(p.stance).toBe('stand');
  expect(p.travelled.stand).toBeGreaterThan(3);
  // let the 75 s timer run out; Ms. Okafor does the steps for you
  await waitScene(page, 'texts', 90_000);
  expect((await state(page)).teacherDid.length).toBeGreaterThan(0);
  await expect(page.getByTestId('reply-stay')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('reply-stay').click();
  await expect(page.getByTestId('reply-nothing')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('reply-nothing').click();
  await waitScene(page, 'waiting');
  await expect(page.getByTestId('captions')).toContainText('rattles, hard', { timeout: 60_000 });
  await waitScene(page, 'door', 90_000);
  await page.getByTestId('door-open').click({ timeout: 60_000 });
  await waitScene(page, 'ending');
  await page.evaluate(() => window.__lockdown.setSpeed(2));
  await expect(page.getByTestId('captions')).toContainText('Theo', { timeout: 30_000 });
  await page.waitForTimeout(300);
  await shot(page, '17-ending-open-door-sequence');
  await page.evaluate(() => window.__lockdown.setSpeed(14));
  await finishEnding(page, 'open_door', '18-end-the-open-door');
  const s = await state(page);
  expect(s.noise).toBeGreaterThanOrEqual(45);
  report('ending-5-open_door', { ending: s.ending, noise: s.noise, zoeTrust: s.zoeTrust, helped: s.helpedClassmate, noiseSources: [...new Set(s.noiseLog.map((n: any) => n.source))], errors: run.errors });
  expect(run.errors).toEqual([]);
});

test('exit and skip are always available; exit shows guidance and returns to start', async ({ page }) => {
  const run = await boot(page, 14);
  // exit from the content notice
  await page.getByTestId('leave').click();
  await expect(page.getByTestId('exit-screen')).toBeVisible();
  await page.getByTestId('restart').click();
  await page.getByTestId('begin').click();
  for (const sc of ['exam', 'code', 'texts', 'waiting', 'door']) {
    await waitScene(page, sc);
    await expect(page.getByTestId('exit')).toBeVisible();
    await expect(page.getByTestId('skip')).toBeVisible();
    await page.getByTestId('skip').click();
  }
  await waitScene(page, 'ending');
  await page.getByTestId('skip').click();
  await expect(page.getByTestId('ending')).toBeVisible();
  await page.getByTestId('exit').click();
  await expect(page.getByTestId('exit-screen')).toBeVisible();
  await expect(page.getByTestId('guidance')).toContainText('112 in Germany');
  await shot(page, '19-exit-screen');
  report('exit-skip', { errors: run.errors });
  expect(run.errors).toEqual([]);
});
