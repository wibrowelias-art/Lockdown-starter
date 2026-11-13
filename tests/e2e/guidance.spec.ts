import { type Page, expect, test } from '@playwright/test';
import { boot, breatheWithTheo, clickTarget, clickUntil, guidance, report, setSpeed, shot, state, waitScene } from './helpers';

const ALL = [
  'bubbles', 'holdStillAisle', 'zoeBackpack', 'lookPA', 'dropDown',
  'wallByDoor', 'theoDown', 'blinds', 'coverWindow', 'barricade', 'ringingPhone', 'silencePhone', 'lockAndLights',
  'zoeReplies', 'testQuestion', 'textMom', 'coverGlow',
  'holdStill', 'breatheTheo', 'schoolAlert', 'whisper', 'stayDown',
  'readTiming', 'decide',
];

interface Seen {
  kind: string;
  highlight: boolean;
  uiGlow: string | null;
  card: boolean;
  markersHidden: boolean;
}

const G = 'docs/screenshots/guidance';

/** A bot that only does what the guidance card says. */
test('guidance leads the player through all 24 tasks', async ({ page }) => {
  const run = await boot(page, 4, { lowq: true });
  await page.getByTestId('begin').click();
  await waitScene(page, 'exam');
  const seen: Record<string, Seen> = {};
  const doneChecked = new Set<string>();
  let bubble = 0;
  let wentInHerWay = false;
  const shotTaken = new Set<string>();
  const trace: string[] = [];
  const stale: Record<string, number> = {};
  let lastKey = '';
  const end = Date.now() + 480_000;
  const snap = async (kind: string, name: string) => {
    if (shotTaken.has(kind)) return;
    shotTaken.add(kind);
    await shot(page, name, G);
  };
  while (Date.now() < end) {
    // state and guidance read together, two frames after the last action
    const { sc, g, st } = await page.evaluate(
      () =>
        new Promise<{ sc: string; g: Record<string, any>; st: Record<string, any> }>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r({ sc: window.__lockdown.scene(), g: window.__lockdown.guidance(), st: window.__lockdown.state() }))),
        ),
    );
    if (sc === 'ending') break;
    // test overhead counts as story time; keep the 75 s lockdown fair
    const want = sc === 'lockdown' ? 1.5 : 4;
    if ((await page.evaluate(() => window.__lockdown.getSpeed())) !== want) await setSpeed(page, want);
    for (const t of Object.keys(seen))
      if (st.tasks[t] && !doneChecked.has(t)) {
        if (g.task === t) {
          stale[t] = (stale[t] ?? 0) + 1;
          expect(stale[t], `${t}: guidance moves on once done`).toBeLessThan(3);
        } else doneChecked.add(t);
      }
    if (g.task && !st.tasks[g.task]) {
      const p = seen[g.task];
      seen[g.task] = {
        kind: g.kind,
        highlight: g.highlight || !!p?.highlight,
        uiGlow: g.uiGlow ?? p?.uiGlow ?? null,
        card: g.cardVisible || !!p?.card,
        markersHidden: g.markersHidden || !!p?.markersHidden,
      };
    }
    if (await page.getByTestId('theo-help').isVisible()) {
      await page.getByTestId('theo-help').click();
      continue;
    }
    const t: string | null = g.task;
    const target: string | null = g.target;
    const key = `${sc}:${t}:${target}`;
    if (key !== lastKey) {
      lastKey = key;
      trace.push(`${(await page.evaluate(() => window.__lockdown.simTime())).toFixed(0)} ${key}`);
    }
    switch (t) {
      case 'bubbles':
        if (g.highlight) await snap('world', 'world-outline-sheet');
        await clickTarget(page, `bubble:${bubble++ % 8}:1`);
        break;
      case 'zoeBackpack':
        await page.evaluate(() => window.__lockdown.aim('zoeBackpack'));
        await page.waitForTimeout(400);
        break;
      case 'holdStillAisle':
      case 'holdStill':
        await page.keyboard.down('Space');
        await snap('meter', 'meter-hold-still');
        await expect(page.getByTestId('holdmeter')).toBeHidden({ timeout: 60_000 });
        await page.keyboard.up('Space');
        break;
      case 'lookPA':
        await page.evaluate(() => window.__lockdown.aim('pa'));
        await page.waitForTimeout(200);
        break;
      case 'dropDown':
        await snap('none', 'card-only-drop');
        await page.keyboard.press('c');
        break;
      case 'wallByDoor':
        if (!wentInHerWay) {
          // stand in Ms. Okafor's way once, so the NPC task becomes current
          wentInHerWay = true;
          await page.evaluate(() => window.__lockdown.navTo(2.0, -3.7, 0.2));
          await page.waitForFunction(() => window.__lockdown.guidance().task === 'lockAndLights', null, { timeout: 30_000 }).catch(() => {});
          break;
        }
        if (g.iconVisible) await snap('icon', 'world-icon-wall');
        await page.evaluate(() => window.__lockdown.navTo(0.4, -3.1, 0.12));
        break;
      case 'lockAndLights':
        await page.waitForTimeout(300);
        await page.evaluate(() => window.__lockdown.navTo(0.4, -3.1, 0.12));
        break;
      case 'silencePhone':
        if (g.uiGlow) await snap('ui', 'ui-glow-phone');
        await page.getByTestId(g.uiGlow ?? 'phone-btn').click();
        break;
      case 'ringingPhone': {
        await page.evaluate((id) => window.__lockdown.navToTarget(id!, 1.1), target);
        // the sound is the clue for 6 s; then the marker appears
        await page.waitForFunction(() => window.__lockdown.guidance().highlight || window.__lockdown.guidance().task !== 'ringingPhone', null, { timeout: 20_000 });
        const g2 = await guidance(page);
        if (g2.task === 'ringingPhone') {
          seen.ringingPhone.highlight = true;
          await clickUntil(page, target!, async () => (await state(page)).tasks.ringingPhone || (await state(page)).missed.includes('ringingPhone'));
        }
        break;
      }
      case 'barricade':
        await page.evaluate(() => window.__lockdown.navTo(3.95, -3.4, 0.25));
        await page.keyboard.down('e');
        await page.waitForFunction(() => window.__lockdown.state().tasks.barricade, null, { timeout: 30_000 });
        await page.keyboard.up('e');
        break;
      case 'coverWindow':
        if (target === 'spareSheet') {
          await page.evaluate(() => window.__lockdown.navToTarget('spareSheet', 1.0));
          await clickUntil(page, 'spareSheet', () => page.evaluate(() => window.__lockdown.holdingSheet()));
        } else {
          await page.evaluate(() => window.__lockdown.navTo(2.1, -3.6, 0.25));
          await clickUntil(page, 'doorWindow', async () => (await state(page)).tasks.coverWindow);
        }
        break;
      case 'theoDown':
        if (target === 'theo') {
          await page.evaluate(() => window.__lockdown.navToTarget('theo', 1.0));
          await clickUntil(page, 'theo', () => page.evaluate(() => window.__lockdown.theoFollowing()));
        } else await page.evaluate(() => window.__lockdown.navTo(0.4, -3.1, 0.12));
        break;
      case 'blinds':
        await page.evaluate(() => window.__lockdown.navTo(-3.9, 0.6, 0.3));
        await clickUntil(page, 'blinds', async () => (await state(page)).tasks.blinds);
        break;
      case 'coverGlow':
        await page.keyboard.down('Space');
        await page.waitForFunction(() => !window.__lockdown.danger(), null, { timeout: 30_000 });
        await page.keyboard.up('Space');
        break;
      case 'zoeReplies':
        if (g.uiGlow === 'phone-btn') await page.getByTestId('phone-btn').click();
        else await page.getByTestId('reply-calm').click();
        break;
      case 'testQuestion':
        await page.getByTestId('reply-ask').click();
        break;
      case 'textMom':
        if (g.uiGlow === 'tab-mom') await page.getByTestId('tab-mom').click();
        else {
          await page.getByTestId('reply-mom').click();
          await page.getByTestId('tab-zoe').click();
        }
        break;
      case 'breatheTheo':
        await breatheWithTheo(page);
        break;
      case 'schoolAlert':
        await clickUntil(page, 'alert', async () => (await state(page)).tasks.schoolAlert);
        break;
      case 'whisper':
        await page.getByTestId('whisper-stay').click();
        break;
      case 'stayDown':
        await page.waitForTimeout(300);
        break;
      case 'readTiming':
        await page.getByTestId('phone-btn').click();
        break;
      case 'decide':
        await page.getByTestId('door-keep').click();
        break;
      default:
        await page.waitForTimeout(150);
    }
  }
  await waitScene(page, 'ending', 60_000);
  await page.waitForTimeout(300);
  const after = await guidance(page);
  if (after.task !== 'decide') doneChecked.add('decide');
  const st = await state(page);
  const problems: string[] = [];
  for (const t of ALL) {
    const s = seen[t];
    if (!s) {
      problems.push(`${t}: never the current task`);
      continue;
    }
    if (!s.card) problems.push(`${t}: no task card`);
    if (s.kind === 'world' && !s.highlight) problems.push(`${t}: no world outline while current`);
    if (s.kind === 'ui' && !s.uiGlow) problems.push(`${t}: no UI glow while current`);
    if (s.kind === 'meter' && !s.markersHidden) problems.push(`${t}: markers not hidden during the stillness beat`);
    if (st.tasks[t] && !doneChecked.has(t)) problems.push(`${t}: done but not checked`);
  }
  const faceMin = await page.evaluate(() => (window as unknown as { __lockdown: { faceMin: () => number } }).__lockdown.faceMin());
  const faceMinAt = await page.evaluate(() => (window as unknown as { __lockdown: { faceMinAt: () => string } }).__lockdown.faceMinAt());
  report('guidance-bot', { faceMin: +faceMin.toFixed(2), faceMinAt, seen: Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.kind])), tasksDone: Object.values(st.tasks).filter(Boolean).length, ending: st.ending, problems, teacherDid: st.teacherDid, trace: trace.filter((x) => x.includes('lockdown')), errors: run.errors });
  expect(problems).toEqual([]);
  // faces (Ms. Okafor, Theo) are never seen closer than ~1 m
  expect(faceMin).toBeGreaterThan(0.95);
  expect(run.errors).toEqual([]);
});

async function toLockdown(page: Page): Promise<void> {
  await page.getByTestId('begin').click();
  for (const sc of ['exam', 'code']) {
    await waitScene(page, sc);
    await page.getByTestId('skip').click();
  }
  await waitScene(page, 'lockdown');
}

test('guidance: edge pointer angle, ringing ping, Minimal and Off modes', async ({ page }) => {
  const run = await boot(page, 2, { lowq: true });
  await toLockdown(page);
  await page.waitForFunction(() => window.__lockdown.guidance().task === 'wallByDoor' && window.__lockdown.guidance().highlight, null, { timeout: 30_000 });
  await setSpeed(page, 0);
  const yaw = (await page.evaluate(() => window.__lockdown.yawTo('wallSpot')))!;
  const angleAt = async (dy: number) => {
    await page.evaluate((y) => window.__lockdown.setYaw(y), yaw + dy);
    await setSpeed(page, 0.25);
    await page.waitForTimeout(250);
    await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n >= 3 ? r(0) : requestAnimationFrame(f)); requestAnimationFrame(f); }));
    await setSpeed(page, 0);
    return guidance(page);
  };
  const right = await angleAt(Math.PI / 2);
  expect(right.pointerVisible).toBe(true);
  expect(Math.abs(right.pointerAngle)).toBeLessThan(0.6);
  await shot(page, 'pointer-edge-right', G);
  const left = await angleAt(-Math.PI / 2);
  expect(left.pointerVisible).toBe(true);
  expect(Math.abs(left.pointerAngle)).toBeGreaterThan(Math.PI - 0.6);
  const behind = await angleAt(Math.PI);
  expect(behind.pointerVisible).toBe(true);
  expect(behind.pointerAngle).toBeLessThan(-0.6);
  const ahead = await angleAt(0);
  expect(ahead.pointerVisible).toBe(false);
  expect(ahead.highlight).toBe(true);
  // Minimal: task card only
  await page.evaluate(() => window.__lockdown.setGuidance('minimal'));
  await setSpeed(page, 0.25);
  await page.waitForTimeout(250);
  await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n >= 3 ? r(0) : requestAnimationFrame(f)); requestAnimationFrame(f); }));
  let g = await guidance(page);
  expect(g.cardVisible).toBe(true);
  expect(g.highlight || g.pointerVisible || g.iconVisible || !!g.uiGlow).toBe(false);
  await shot(page, 'mode-minimal', G);
  // Off: nothing
  await page.evaluate(() => window.__lockdown.setGuidance('off'));
  await page.waitForTimeout(250);
  await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n >= 3 ? r(0) : requestAnimationFrame(f)); requestAnimationFrame(f); }));
  g = await guidance(page);
  expect(g.cardVisible || g.highlight || g.pointerVisible || g.iconVisible || !!g.uiGlow).toBe(false);
  await expect(page.getByTestId('guide-card')).toBeHidden();
  await expect(page.getByTestId('guide-pointer')).toBeHidden();
  await expect(page.getByTestId('guide-icon')).toBeHidden();
  await shot(page, 'mode-off', G);
  // back to Full: the ringing phone gets no marker for 6 s, then a ping
  await page.evaluate(() => window.__lockdown.setGuidance('full'));
  await setSpeed(page, 6);
  await page.waitForFunction(() => window.__lockdown.audioLog().includes('ringtone'), null, { timeout: 60_000 });
  await setSpeed(page, 1);
  const early = await guidance(page);
  if (early.task === 'ringingPhone') expect(early.highlight || early.pointerVisible).toBe(false);
  await page.evaluate(() => window.__lockdown.setYaw(window.__lockdown.yawTo('pack:malik')! + Math.PI));
  await page.waitForFunction(() => window.__lockdown.guidance().task === 'ringingPhone' && (window.__lockdown.guidance().ping || window.__lockdown.guidance().highlight), null, { timeout: 30_000 });
  const late = await guidance(page);
  expect(late.ping).toBe(true);
  await shot(page, 'pointer-ping-ringing', G);
  report('guidance-modes', { right: right.pointerAngle, left: left.pointerAngle, behind: behind.pointerAngle, errors: run.errors });
  expect(run.errors).toEqual([]);
});
