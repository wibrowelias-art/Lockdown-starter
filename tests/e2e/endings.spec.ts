import { expect, test } from '@playwright/test';
import { boot, breatheWithTheo, clickTarget, finishEnding, holdSpaceWhile, report, setSpeed, shot, state, task, waitScene, walk } from './helpers';

// One browser playthrough per ending. ?speed= runs story time faster; buttons and
// keys are pressed for real, 3D objects are clicked on the canvas after turning the
// camera to them, movement uses the real player controller. Pointer lock is bypassed
// (?nolock). Ending 1 plays every task at full quality; the others use Skip where a
// phase doesn't matter to that ending, at low quality (faster in software GL).

test('ending 1 - everyone went home: every task, all six phases', async ({ page }) => {
  const run = await boot(page, 12);
  await shot(page, '01-title-content-notice');
  await page.getByTestId('begin').click();
  await waitScene(page, 'exam');

  // 1 exam
  await expect(page.getByTestId('titlecard')).toHaveClass(/in/);
  await shot(page, '02-exam');
  await page.getByTestId('theo-help').click({ timeout: 60_000 });
  for (let r = 0; r < 4; r++) await clickTarget(page, `bubble:${r}:${(r * 3 + 1) % 4}`);
  expect(await task(page, 'bubbles')).toBe(true);
  await page.evaluate(() => window.__lockdown.aim('zoeBackpack'));
  await expect.poll(() => task(page, 'zoeBackpack')).toBe(true);
  await setSpeed(page, 4);
  await holdSpaceWhile(page, 'holdmeter');
  expect(await task(page, 'holdStillAisle')).toBe(true);
  await setSpeed(page, 12);

  // 2 code
  await waitScene(page, 'code');
  await setSpeed(page, 3);
  await page.waitForFunction(() => window.__lockdown.audioLog().includes('paChime'), null, { timeout: 60_000 });
  await page.evaluate(() => window.__lockdown.aim('pa'));
  await expect.poll(() => task(page, 'lookPA')).toBe(true);
  await shot(page, '03-code-pa');
  await expect(page.getByText(/DROP/)).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('c');
  await expect.poll(() => task(page, 'dropDown')).toBe(true);

  // 3 lockdown: free order, 75 s
  await waitScene(page, 'lockdown');
  await expect(page.getByTestId('task-wallByDoor')).toBeVisible();
  await shot(page, '04-lockdown-start');
  await page.getByTestId('phone-btn').click();
  await page.getByTestId('phone-silent').click();
  await expect(page.getByTestId('phone')).not.toHaveClass(/open/);
  await clickTarget(page, 'spareSheet');
  await walk(page, [[1.75, 0.95], [3.3, 0.95]]);
  await clickTarget(page, 'theo');
  await walk(page, [[3.75, 0.95], [3.75, -0.85], [1.8, -0.85]]);
  await page.waitForFunction(() => window.__lockdown.audioLog().includes('ringtone'), null, { timeout: 60_000 });
  await clickTarget(page, 'pack:malik');
  expect(await task(page, 'ringingPhone')).toBe(true);
  await walk(page, [[-3.9, -0.85], [-3.9, 0.4]]);
  await clickTarget(page, 'blinds');
  await walk(page, [[-3.9, -2.75], [1.5, -2.75], [2.1, -3.6]]);
  await clickTarget(page, 'doorWindow');
  expect(await task(page, 'coverWindow')).toBe(true);
  await walk(page, [[3.0, -3.35], [3.95, -3.4]]);
  await page.keyboard.down('e');
  await expect.poll(() => task(page, 'barricade'), { timeout: 30_000 }).toBe(true);
  await page.keyboard.up('e');
  await expect.poll(() => task(page, 'theoDown'), { timeout: 30_000 }).toBe(true);
  const lock = await state(page);
  for (const t of ['wallByDoor', 'theoDown', 'blinds', 'coverWindow', 'barricade', 'ringingPhone', 'silencePhone']) expect(lock.tasks[t], t).toBe(true);
  await page.evaluate(() => window.__lockdown.aim('door'));
  await waitScene(page, 'texts', 90_000);
  await shot(page, '05-lockdown-done');

  // 4 phone: three rounds, the test question, Mom, cover the glow
  await setSpeed(page, 5);
  for (let r = 0; r < 3; r++) {
    await expect(page.getByTestId('phone-btn')).toHaveClass(/badge/, { timeout: 90_000 });
    await page.getByTestId('phone-btn').click();
    if (r === 0) {
      await page.getByTestId('tab-mom').click();
      await page.getByTestId('reply-mom').click();
      await page.getByTestId('tab-zoe').click();
    }
    if (r === 1) {
      // footsteps pass while the screen is lit: cover it until they're gone, then reply
      await expect(page.getByText(/cover the glow/)).toBeVisible({ timeout: 60_000 });
      await page.keyboard.down('Space');
      await expect(page.getByText(/cover the glow/)).toBeHidden({ timeout: 60_000 });
      await page.keyboard.up('Space');
    }
    await expect(page.getByTestId('reply-calm')).toBeVisible({ timeout: 60_000 });
    if (r === 0) {
      await shot(page, '06-phone-zoe');
      await page.getByTestId('reply-ask').click();
      await expect.poll(() => task(page, 'testQuestion')).toBe(true);
      await expect(page.getByTestId('reply-calm')).toBeVisible({ timeout: 30_000 });
    }
    await page.getByTestId(r === 1 ? 'reply-stay' : 'reply-calm').click();
  }
  const ph = await state(page);
  expect(ph.tasks.textMom && ph.tasks.coverGlow && ph.tasks.testQuestion).toBe(true);

  // 5 the wait
  await waitScene(page, 'waiting', 90_000);
  await setSpeed(page, 3);
  await holdSpaceWhile(page, 'holdmeter');
  await shot(page, '07-waiting-hold-still');
  await breatheWithTheo(page);
  await expect.poll(() => task(page, 'breatheTheo'), { timeout: 30_000 }).toBe(true);
  await expect(page.getByText(/Read it over her shoulder/)).toBeVisible({ timeout: 60_000 });
  await clickTarget(page, 'alert');
  await expect.poll(() => task(page, 'schoolAlert')).toBe(true);
  await holdSpaceWhile(page, 'holdmeter');
  await page.getByTestId('whisper-stay').click({ timeout: 60_000 });
  await holdSpaceWhile(page, 'holdmeter');
  await page.waitForFunction(() => window.__lockdown.audioLog().some((c) => c.startsWith('sirens')), null, { timeout: 60_000 });
  await page.evaluate(() => window.__lockdown.lookAt(-4.5, 2.2, 0.1));
  await page.waitForTimeout(800);
  await shot(page, '08-waiting-sirens');
  await expect.poll(() => task(page, 'stayDown'), { timeout: 60_000 }).toBe(true);

  // 6 the knock
  await waitScene(page, 'door', 90_000);
  await page.evaluate(() => window.__lockdown.aim('door'));
  await expect(page.getByTestId('phone-btn')).toHaveClass(/badge/, { timeout: 90_000 });
  await page.getByTestId('phone-btn').click();
  await expect.poll(() => task(page, 'readTiming')).toBe(true);
  await expect(page.getByTestId('dont-open').first()).toBeVisible();
  await shot(page, '09-knock-1052');
  await expect(page.getByTestId('door-text')).toBeVisible({ timeout: 90_000 });
  await shot(page, '10-knock-choice');
  await page.getByTestId('door-text').click();
  await expect(page.getByTestId('door-keep')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('door-keep').click();

  await waitScene(page, 'ending');
  await setSpeed(page, 12);
  await expect(page.getByText(/Raise your hands/)).toBeVisible({ timeout: 120_000 });
  await shot(page, '11-ending-police');
  await finishEnding(page, 'all_clear', '12-end-everyone-went-home');

  const s = await state(page);
  expect(s.noise).toBeLessThan(45);
  expect(s.clues).toEqual({ testQuestion: true, schoolAlert: true, timing: true });
  const done = Object.values(s.tasks).filter(Boolean).length;
  const cues = await page.evaluate(() => window.__lockdown.audioLog());
  for (const c of ['bang', 'paChime', 'ringtone', 'silence', 'handleRattle', 'pipeKnock', 'farSlam', 'knock', 'voice:door', 'drone', 'keys']) expect(cues.some((x) => x.startsWith(c)), `sound cue ${c}`).toBe(true);
  const fps = await page.evaluate(() => window.__lockdown.fps());
  report('ending-1-all_clear', { ending: s.ending, tasksDone: done, battery: s.battery, noise: s.noise, zoeTrust: s.zoeTrust, theoCalm: s.theoCalm, holdStill: s.holdStill, clues: s.clues, fpsHeadlessSoftwareGL: Math.round(fps * 10) / 10, errors: run.errors, warnings: run.warnings.length });
  expect(run.errors).toEqual([]);
});

test('ending 2 - left on read: never look at the phone', async ({ page }) => {
  const run = await boot(page, 14, { lowq: true });
  await page.getByTestId('begin').click();
  for (const sc of ['exam', 'code', 'lockdown']) {
    await waitScene(page, sc);
    await page.getByTestId('skip').click();
  }
  await waitScene(page, 'texts');
  await waitScene(page, 'waiting', 120_000);
  await page.getByTestId('skip').click();
  await waitScene(page, 'door');
  await page.getByTestId('door-keep').click({ timeout: 120_000 });
  await finishEnding(page, 'left_on_read', '13-end-left-on-read');
  const s = await state(page);
  expect(s.replies).toEqual(['nothing', 'nothing', 'nothing']);
  report('ending-2-left_on_read', { ending: s.ending, zoeTrust: s.zoeTrust, noise: s.noise, errors: run.errors });
  expect(run.errors).toEqual([]);
});

test('ending 3 - the long minute: freeze up, keep it locked', async ({ page }) => {
  const run = await boot(page, 14, { lowq: true });
  await page.getByTestId('begin').click();
  for (const sc of ['exam', 'code', 'lockdown', 'texts']) {
    await waitScene(page, sc);
    await page.getByTestId('skip').click();
  }
  await waitScene(page, 'waiting');
  await expect(page.getByTestId('holdmeter')).toBeVisible({ timeout: 90_000 });
  await waitScene(page, 'door', 240_000);
  await page.getByTestId('door-keep').click({ timeout: 120_000 });
  await waitScene(page, 'ending');
  await setSpeed(page, 2);
  await expect(page.getByTestId('captions')).toContainText('Right outside the door', { timeout: 60_000 });
  await page.evaluate(() => window.__lockdown.aim('door'));
  await shot(page, '14-ending-long-minute-feet');
  await setSpeed(page, 14);
  await finishEnding(page, 'long_minute', '15-end-the-long-minute');
  const s = await state(page);
  expect(s.holdStill).toBeLessThan(2);
  report('ending-3-long_minute', { ending: s.ending, holdStill: s.holdStill, helped: s.helpedClassmate, noise: s.noise, errors: run.errors });
  expect(run.errors).toEqual([]);
});

test('ending 4 - the door held: barricade, then open the door', async ({ page }) => {
  const run = await boot(page, 14, { lowq: true });
  await page.getByTestId('begin').click();
  for (const sc of ['exam', 'code']) {
    await waitScene(page, sc);
    await page.getByTestId('skip').click();
  }
  await waitScene(page, 'lockdown');
  await setSpeed(page, 4);
  await expect(page.getByTestId('task-barricade')).toBeVisible();
  await walk(page, [[1.75, 0.95], [1.8, -0.85], [1.8, -2.75], [3.0, -3.3], [3.95, -3.4]]);
  await page.keyboard.down('Shift');
  await page.keyboard.down('e');
  await expect.poll(() => task(page, 'barricade'), { timeout: 30_000 }).toBe(true);
  await page.keyboard.up('e');
  await page.keyboard.up('Shift');
  expect((await state(page)).noiseLog.some((n: { source: string }) => n.source === 'deskScrape')).toBe(true);
  await page.getByTestId('skip').click();
  await setSpeed(page, 14);
  for (const sc of ['texts', 'waiting']) {
    await waitScene(page, sc);
    await page.getByTestId('skip').click();
  }
  await waitScene(page, 'door');
  await page.getByTestId('door-open').click({ timeout: 120_000 });
  await waitScene(page, 'ending');
  await setSpeed(page, 2);
  await expect(page.getByTestId('captions')).toContainText('opens an inch', { timeout: 60_000 });
  await shot(page, '16-ending-door-held');
  await setSpeed(page, 14);
  await finishEnding(page, 'door_held', '17-end-the-door-held');
  const s = await state(page);
  report('ending-4-door_held', { ending: s.ending, barricade: s.tasks.barricade, noise: s.noise, errors: run.errors });
  expect(run.errors).toEqual([]);
});

test('ending 5 - the open door: loud, Theo alone, no barricade, open it', async ({ page }) => {
  const run = await boot(page, 14, { lowq: true });
  await page.getByTestId('begin').click();
  for (const sc of ['exam', 'code', 'lockdown', 'texts']) {
    await waitScene(page, sc);
    await page.getByTestId('skip').click();
  }
  await waitScene(page, 'door', 240_000);
  await page.getByTestId('door-open').click({ timeout: 120_000 });
  await waitScene(page, 'ending');
  await setSpeed(page, 2);
  await expect(page.getByTestId('captions')).toContainText('Theo', { timeout: 60_000 });
  await shot(page, '18-ending-open-door');
  await setSpeed(page, 14);
  await finishEnding(page, 'open_door', '19-end-the-open-door');
  const s = await state(page);
  expect(s.noise).toBeGreaterThanOrEqual(45);
  report('ending-5-open_door', { ending: s.ending, noise: s.noise, noiseSources: [...new Set(s.noiseLog.map((n: { source: string }) => n.source))], errors: run.errors });
  expect(run.errors).toEqual([]);
});

test('exit and skip are always available; exit shows guidance and returns to start', async ({ page }) => {
  const run = await boot(page, 14, { lowq: true });
  await page.getByTestId('leave').click();
  await expect(page.getByTestId('exit-screen')).toBeVisible();
  await page.getByTestId('restart').click();
  await page.getByTestId('begin').click();
  for (const sc of ['exam', 'code', 'lockdown', 'texts', 'waiting', 'door']) {
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
  await shot(page, '20-exit-screen');
  // options panel
  await page.getByTestId('restart').click();
  await page.getByTestId('options-btn').click();
  await expect(page.getByTestId('options')).toBeVisible();
  await page.getByTestId('opt-lowq').uncheck();
  expect(await page.evaluate(() => window.__lockdown.quality())).toBe('high');
  await page.getByTestId('opt-lowq').check();
  expect(await page.evaluate(() => window.__lockdown.quality())).toBe('low');
  report('exit-skip-options', { errors: run.errors });
  expect(run.errors).toEqual([]);
});
