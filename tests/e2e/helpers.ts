import { type Page, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const SHOTS = 'docs/screenshots';

declare global {
  interface Window {
    __lockdown: {
      state: () => Record<string, any>;
      scene: () => string;
      setSpeed: (n: number) => void;
      getSpeed: () => number;
      audioLog: () => string[];
      player: () => { x: number; z: number; stance: string; yaw: number; pitch: number; travelled: { stand: number; crouch: number } };
      aim: (id: string) => boolean;
      lookAt: (x: number, y: number, z: number) => void;
      screenPos: (id: string) => { x: number; y: number; onScreen: boolean } | null;
      walkTo: (x: number, z: number) => Promise<{ x: number; z: number }>;
      breath: () => { cycles: number; active: boolean; guide: number; you: number };
      lightsOn: () => boolean;
      simTime: () => number;
      fps: () => number;
      quality: () => string;
      holdUse: (down: boolean) => void;
      holdingSheet: () => boolean;
      theoFollowing: () => boolean;
      guidance: () => Record<string, any>;
      setGuidance: (m: 'full' | 'minimal' | 'off') => void;
      navTo: (x: number, z: number, within?: number) => Promise<boolean>;
      navToTarget: (id: string, within?: number) => Promise<boolean>;
      danger: () => boolean;
      setYaw: (y: number) => void;
      yawTo: (id: string) => number | null;
    };
  }
}

export interface Run {
  errors: string[];
  warnings: string[];
}

/** Boots the game. Tests bypass pointer lock (?nolock) and use real clicks/keys. */
export async function boot(page: Page, speed = 14, opts: { lowq?: boolean } = {}): Promise<Run> {
  const run: Run = { errors: [], warnings: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') run.errors.push(m.text());
    if (m.type() === 'warning') run.warnings.push(m.text());
  });
  page.on('pageerror', (e) => run.errors.push(`pageerror: ${e.message}`));
  await page.goto(`/?speed=${speed}&nolock${opts.lowq ? '&lowq' : ''}`);
  await expect(page.getByTestId('content-notice')).toBeVisible();
  await expect(page.getByTestId('exit')).toBeVisible();
  return run;
}

export async function setSpeed(page: Page, n: number): Promise<void> {
  await page.evaluate((s) => window.__lockdown.setSpeed(s), n);
}

/** Screenshot with sim time frozen, so slow software-GL captures don't eat timed windows. */
export async function shot(page: Page, name: string, dir = SHOTS): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const speed = await page.evaluate(() => {
    const s = window.__lockdown.getSpeed();
    window.__lockdown.setSpeed(0);
    return s;
  });
  await page.waitForTimeout(250);
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file });
  await page.evaluate((s) => window.__lockdown.setSpeed(s), speed);
  return file;
}

export async function waitScene(page: Page, s: string, timeout = 120_000): Promise<void> {
  await page.waitForFunction((x) => window.__lockdown.scene() === x, s, { timeout, polling: 100 });
}

export async function state(page: Page): Promise<Record<string, any>> {
  return page.evaluate(() => window.__lockdown.state());
}

export async function task(page: Page, t: string): Promise<boolean> {
  return (await state(page)).tasks[t];
}

/** Turn the camera to a world target and click it on the canvas (real raycast). */
export async function clickTarget(page: Page, id: string): Promise<void> {
  await page.evaluate((t) => window.__lockdown.aim(t), id);
  await page.waitForTimeout(120);
  const p = await page.evaluate((t) => window.__lockdown.screenPos(t), id);
  expect(p?.onScreen, `${id} on screen`).toBe(true);
  await page.mouse.move(p!.x, p!.y);
  await page.mouse.click(p!.x, p!.y);
}

/** Click a 3D target until a condition holds (guards against a click landing mid-frame). */
export async function clickUntil(page: Page, id: string, ok: () => Promise<boolean>, tries = 4): Promise<void> {
  for (let i = 0; i < tries; i++) {
    await clickTarget(page, id);
    await page.waitForTimeout(200);
    if (await ok()) return;
  }
  expect(await ok(), `clicking ${id} worked`).toBe(true);
}

export async function walk(page: Page, pts: [number, number][]): Promise<void> {
  for (const pt of pts) await page.evaluate(([x, z]) => window.__lockdown.walkTo(x, z), pt);
}

export async function holdSpaceWhile(page: Page, testid: string, timeout = 60_000): Promise<void> {
  await expect(page.getByTestId(testid)).toBeVisible({ timeout });
  await page.keyboard.down('Space');
  await expect(page.getByTestId(testid)).toBeHidden({ timeout: 30_000 });
  await page.keyboard.up('Space');
}

/** Breathe with Theo: closed-loop on the guide ring (hold while it grows). */
export async function guidance(page: Page): Promise<Record<string, any>> {
  return page.evaluate(() => window.__lockdown.guidance());
}

export async function breatheWithTheo(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__lockdown.breath().active, null, { timeout: 90_000 });
  const speed = await page.evaluate(() => window.__lockdown.getSpeed());
  await setSpeed(page, 2);
  let down = false;
  for (let i = 0; i < 600; i++) {
    const b = await page.evaluate(() => window.__lockdown.breath());
    if (!b.active || b.cycles >= 3) break;
    const want = b.guide > b.you;
    if (want !== down) {
      if (want) await page.keyboard.down('Space');
      else await page.keyboard.up('Space');
      down = want;
    }
    await page.waitForTimeout(40);
  }
  if (down) await page.keyboard.up('Space');
  await setSpeed(page, speed);
}

export async function finishEnding(page: Page, id: string, shotName: string): Promise<void> {
  await expect(page.getByText(/Raise your hands/)).toBeVisible({ timeout: 120_000 });
  await page.keyboard.down('Space');
  await page.waitForTimeout(400);
  await page.keyboard.up('Space');
  const card = page.getByTestId('ending');
  await expect(card).toBeVisible({ timeout: 120_000 });
  await expect(card).toHaveAttribute('data-ending', id);
  await page.getByTestId('skip').click();
  await expect(page.locator('.after.in')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('guidance')).toHaveText(
    "In a real lockdown, follow your school's plan and your teacher's instructions, keep phones silent, and call emergency services (911 in the US, 112 in Germany) when it is safe.",
  );
  await shot(page, shotName);
}

export function report(name: string, data: Record<string, unknown>): void {
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(path.join('test-results', `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`[report] ${name}: ${JSON.stringify(data)}`);
}
