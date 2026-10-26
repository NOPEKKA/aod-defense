import { expect, type Page } from '@playwright/test';

/** Parsed render_game_to_text() snapshot. Fields depend on the scene. */
export type Snapshot = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function snapshot(page: Page): Promise<Snapshot> {
  return JSON.parse(await page.evaluate(() => (window as any).render_game_to_text())); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function advance(page: Page, ms: number): Promise<void> {
  await page.evaluate((t) => (window as any).advanceTime(t), ms); // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Open the game with a clean save and collect console errors. */
export async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await expect.poll(async () => page.evaluate(() => typeof (window as any).render_game_to_text === 'function'), { timeout: 15_000 }).toBe(true); // eslint-disable-line @typescript-eslint/no-explicit-any
  return errors;
}

export async function waitForScene(page: Page, scene: string): Promise<void> {
  await expect.poll(async () => (await snapshot(page)).scene as string, { timeout: 15_000 }).toContain(scene);
}
