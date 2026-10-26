import { expect, test, type Page } from '@playwright/test';
import { advance, openGame, snapshot, waitForScene } from './helpers';

/** Scaffold-level checks: boots clean into Title, data validates, fixed-step sim runs, Ash walks, wave 1 spawns. */

async function startPaused(page: Page, wave = 1): Promise<void> {
  await page.evaluate((w) => (window as any).__aodd.startWave(w), wave); // eslint-disable-line @typescript-eslint/no-explicit-any
  await waitForScene(page, 'Battle');
  await page.evaluate(() => (window as any).__aodd.app().bus.emit('ui:pause', { paused: true })); // eslint-disable-line @typescript-eslint/no-explicit-any
}

test('boots into the title screen without console errors', async ({ page }) => {
  const errors = await openGame(page);
  await waitForScene(page, 'Title');
  await startPaused(page);
  const s = await snapshot(page);
  expect(s.wave.number).toBe(1);
  expect(s.ash).not.toBeNull();
  expect(s.book.maxHp).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).__aodd.input({ move: 1 }, 30)); // eslint-disable-line @typescript-eslint/no-explicit-any
  await advance(page, 12_000);
  await page.evaluate(() => (window as any).__aodd.app().bus.emit('ui:pause', { paused: false })); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'output/qa/smoke-battle.png' });
  expect(errors).toEqual([]);
});

test('advanceTime runs whole fixed ticks (60 per second)', async ({ page }) => {
  await openGame(page);
  await startPaused(page);
  const before = await snapshot(page);
  await advance(page, 2000);
  const after = await snapshot(page);
  expect(after.tick - before.tick).toBe(120);
  expect(after.time - before.time).toBeCloseTo(2, 1);
});

test('Ash walks right at his data speed when input says move=1', async ({ page }) => {
  await openGame(page);
  await startPaused(page);
  const x0 = (await snapshot(page)).ash.x as number;
  await page.evaluate(() => (window as any).__aodd.input({ move: 1 }, 60)); // eslint-disable-line @typescript-eslint/no-explicit-any
  await advance(page, 1000);
  const s = await snapshot(page);
  expect(s.ash.x - x0).toBeGreaterThan(200);
  expect(s.ash.x - x0).toBeLessThan(240);
  expect(s.ash.facing).toBe(1);
});

test('wave 1 schedule spawns skeletons over time', async ({ page }) => {
  await openGame(page);
  await startPaused(page);
  await advance(page, 10_000);
  const s = await snapshot(page);
  expect(s.counts.enemy ?? 0).toBeGreaterThan(0);
  expect(s.hostiles[0].def).toBe('skeleton');
});

test('frame times are recorded for perf QA', async ({ page }) => {
  await openGame(page);
  await waitForScene(page, 'Title');
  await page.evaluate(() => (window as any).__aodd.frameTimes()); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.waitForTimeout(1000);
  const ft = (await page.evaluate(() => (window as any).__aodd.frameTimes())) as number[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(ft.length).toBeGreaterThan(10);
});
