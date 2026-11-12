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
      screenPos: (id: string) => { x: number; y: number; onScreen: boolean } | null;
      walkTo: (x: number, z: number) => Promise<{ x: number; z: number }>;
      breath: () => { cycles: number; active: boolean };
      lightsOn: () => boolean;
      simTime: () => number;
    };
  }
}

export interface Run {
  errors: string[];
  warnings: string[];
}

export async function boot(page: Page, speed = 12): Promise<Run> {
  const run: Run = { errors: [], warnings: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') run.errors.push(m.text());
    if (m.type() === 'warning') run.warnings.push(m.text());
  });
  page.on('pageerror', (e) => run.errors.push(`pageerror: ${e.message}`));
  await page.goto(`/?speed=${speed}`);
  await expect(page.getByTestId('content-notice')).toBeVisible();
  await expect(page.getByTestId('exit')).toBeVisible();
  return run;
}

/** Screenshot with sim time frozen, so slow software-GL captures don't eat timed windows. */
export async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOTS, { recursive: true });
  const speed = await page.evaluate(() => {
    const s = window.__lockdown.getSpeed();
    window.__lockdown.setSpeed(0);
    return s;
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  await page.evaluate((s) => window.__lockdown.setSpeed(s), speed);
}

export async function scene(page: Page): Promise<string> {
  return page.evaluate(() => window.__lockdown.scene());
}

export async function waitScene(page: Page, s: string, timeout = 60_000): Promise<void> {
  await page.waitForFunction((x) => window.__lockdown.scene() === x, s, { timeout, polling: 100 });
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

export async function walk(page: Page, pts: [number, number][]): Promise<void> {
  for (const pt of pts) await page.evaluate(([x, z]) => window.__lockdown.walkTo(x, z), pt);
}

export async function state(page: Page): Promise<Record<string, any>> {
  return page.evaluate(() => window.__lockdown.state());
}

/** Full lockdown routine: crouch, silence phone, lights off, back wall. */
export async function doLockdownSteps(page: Page, opts: { helpTheo: boolean }): Promise<void> {
  await expect(page.getByTestId('obj-away')).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('c');
  await page.getByTestId('phone-btn').click();
  await page.getByTestId('phone-silent').click();
  await walk(page, [
    [1.75, -1.25],
    [3.8, -1.3],
    [3.9, -2.3],
  ]);
  await clickTarget(page, 'switch');
  await expect.poll(() => page.evaluate(() => window.__lockdown.lightsOn())).toBe(false);
  if (opts.helpTheo) {
    await walk(page, [[3.8, -0.3]]);
    await clickTarget(page, 'theo');
    await expect.poll(async () => (await state(page)).theoHelp.pulledDown).toBe(true);
  }
  await walk(page, [
    [3.8, -0.3],
    [3.8, 1.9],
    [2.6, 3.3],
  ]);
}

export async function breatheWithTheo(page: Page): Promise<void> {
  const btn = page.getByTestId('breathe-btn');
  await expect(btn).toBeVisible({ timeout: 60_000 });
  const box = (await btn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 4; i++) {
    if ((await page.evaluate(() => window.__lockdown.breath().cycles)) >= 3) break;
    await page.mouse.down();
    await page.waitForFunction(() => document.querySelector('.b-label')?.textContent?.includes('let go'), null, { timeout: 10_000 });
    await page.mouse.up();
    await page.waitForTimeout(450);
  }
}

export async function finishEnding(page: Page, id: string, shotName: string): Promise<void> {
  const card = page.getByTestId('ending');
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(card).toHaveAttribute('data-ending', id);
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
