import { type Page, expect, test } from '@playwright/test';
import fs from 'node:fs';
import { boot, setSpeed, shot, waitScene } from './helpers';

// Portrait (9:16, like the reference video). The game plays at Low (software GL is slow);
// every capture is rendered at High. For each phase: our screenshot next to the matching
// reference frame, saved in docs/screenshots/compare-v3/ (v2 kept in compare/).
const DIR = 'docs/screenshots/compare-v3';

async function sideBySide(page: Page, name: string, ref: string, ours: string): Promise<void> {
  const r = fs.readFileSync(`docs/v2/frames/${ref}`).toString('base64');
  const o = fs.readFileSync(ours).toString('base64');
  const p = await page.context().newPage();
  await p.setViewportSize({ width: 820, height: 760 });
  await p.setContent(`<body style="margin:0;background:#16171d;color:#ddd;font:16px sans-serif;display:flex;gap:12px;padding:8px">
    <figure style="margin:0;text-align:center"><img src="data:image/jpeg;base64,${r}" style="height:700px;display:block"><figcaption>reference: ${ref}</figcaption></figure>
    <figure style="margin:0;text-align:center"><img src="data:image/png;base64,${o}" style="height:700px;display:block"><figcaption>game: ${name}</figcaption></figure></body>`);
  await p.screenshot({ path: `${DIR}/${name}.jpg`, type: 'jpeg', quality: 82 });
  await p.close();
  fs.unlinkSync(ours);
}

test('compare each phase with the reference frames', async ({ page }) => {
  test.setTimeout(20 * 60_000); // High-quality captures on software GL are slow
  const run = await boot(page, 4, { lowq: true });
  await page.getByTestId('begin').click();
  await waitScene(page, 'exam');
  await expect(page.getByTestId('titlecard')).toHaveClass(/in/);
  await page.evaluate(() => window.__lockdown.lookAt(0.6, 0.55, -4.5));
  await sideBySide(page, '1-exam', '003s_exam-answer-sheet.jpg', await shot(page, 'tmp-exam', DIR));

  await page.getByTestId('skip').click();
  await waitScene(page, 'code');
  await expect(page.getByTestId('subtitles')).toContainText('Attention', { timeout: 60_000 });
  await page.evaluate(() => window.__lockdown.lookAt(0.2, 1.7, -4.5));
  await sideBySide(page, '2-code-pa', '018s_pa-speaker-glow.jpg', await shot(page, 'tmp-code', DIR));

  await waitScene(page, 'lockdown', 60_000);
  await expect(page.getByTestId('subtitles')).toContainText('Phones silent', { timeout: 30_000 });
  await page.evaluate(() => window.__lockdown.lookAt(2.6, 1.2, -4.5));
  await sideBySide(page, '3-lockdown', '037s_teacher-at-door-lights-off.jpg', await shot(page, 'tmp-lock', DIR));

  await page.getByTestId('skip').click();
  await waitScene(page, 'texts');
  await expect(page.getByTestId('phone-btn')).toHaveClass(/badge/, { timeout: 60_000 });
  await page.getByTestId('phone-btn').click();
  await expect(page.getByTestId('reply-stay')).toBeVisible({ timeout: 60_000 });
  await sideBySide(page, '4-phone', '054s_phone-zoe-texts.jpg', await shot(page, 'tmp-phone', DIR));
  await page.getByTestId('reply-stay').click();

  await page.getByTestId('skip').click();
  await waitScene(page, 'waiting');
  await expect(page.getByTestId('holdmeter')).toBeVisible({ timeout: 60_000 });
  await setSpeed(page, 1);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__lockdown.lookAt(2.6, 0.3, -4.5));
  await sideBySide(page, '5-wait-feet', '073s_feet-shadows-under-door.jpg', await shot(page, 'tmp-wait', DIR));
  await setSpeed(page, 4);
  // wait on the game state (the "Sirens." subtitle is on screen for a split second at speed)
  await page.waitForFunction(() => (window.__lockdown as unknown as { world: () => { sirenLevel: number } }).world().sirenLevel > 0.6, null, { timeout: 180_000 });
  await setSpeed(page, 0.5);
  await page.evaluate(() => window.__lockdown.lookAt(-4.5, 2.2, 0.1));
  await page.waitForTimeout(600);
  await sideBySide(page, '5b-sirens', '082s_siren-pink-blinds.jpg', await shot(page, 'tmp-siren', DIR));

  await waitScene(page, 'door', 120_000);
  await setSpeed(page, 1);
  await expect(page.getByTestId('subtitles')).toContainText("it's me", { timeout: 60_000 });
  await page.evaluate(() => window.__lockdown.lookAt(2.6, 1.0, -4.5));
  await sideBySide(page, '6-knock', '091s_knock-zoe-voice.jpg', await shot(page, 'tmp-knock', DIR));
  await setSpeed(page, 6);
  await expect(page.getByTestId('door-keep')).toBeVisible({ timeout: 120_000 });
  await sideBySide(page, '6b-choice', '119s_choice-card.jpg', await shot(page, 'tmp-choice', DIR));
  const fps = await page.evaluate(() => window.__lockdown.fps());
  console.log(`[report] compare: fps(headless software GL, Low while playing, portrait 405x720@2x)=${fps.toFixed(1)} errors=${JSON.stringify(run.errors)}`);
  expect(run.errors).toEqual([]);
});
