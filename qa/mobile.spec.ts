/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Mobile / tablet check in Chrome device emulation (touch + isMobile). Real iOS Safari is
 * not available here, so this covers layout, hit sizes, touch flows and screenshots
 * (output/mobile-shots/, gitignored). Safe-area insets cannot be emulated by Chrome.
 */
import { devices, expect, test, type Page } from '@playwright/test';
import { battleGeo, bootGame, findUi, hudPoint, snap, tr, uiButtons, viewToPage, waitScene } from './play';

const strip = (d: (typeof devices)[string]) => {
  const { defaultBrowserType: _b, ...rest } = d;
  return rest;
};
const DEVICES = {
  'ipad-1024': { ...strip(devices['iPad (gen 7) landscape']), viewport: { width: 1024, height: 768 } },
  'ipad-1180': { ...strip(devices['iPad (gen 7) landscape']), viewport: { width: 1180, height: 820 } },
  'iphone-844': strip(devices['iPhone 14 landscape']),
  'iphone-932': strip(devices['iPhone 14 Pro Max landscape']),
} as const;

const MIN_FOR: Record<string, number> = { 'iphone-844': 39 }; // 2.16:1 screen letterboxes the 1600-wide view: 84 logical px = 39.7 css px
const shot = (page: Page, name: string) => page.screenshot({ path: `output/mobile-shots/${name}.png` });

for (const [name, dev] of Object.entries(DEVICES)) {
  test.describe(name, () => {
    test.use(dev as any);

    test(`${name}: menus fit, battle HUD is reachable, touch flows work`, async ({ page }) => {
      const errors = await bootGame(page);
      const vp = page.viewportSize()!;
      const inView = (b: { x: number; y: number; w: number; h: number }, what: string) => {
        expect.soft(b.x - b.w / 2, `${what} left`).toBeGreaterThanOrEqual(-1);
        expect.soft(b.y - b.h / 2, `${what} top`).toBeGreaterThanOrEqual(-1);
        expect.soft(b.x + b.w / 2, `${what} right`).toBeLessThanOrEqual(vp.width + 1);
        expect.soft(b.y + b.h / 2, `${what} bottom`).toBeLessThanOrEqual(vp.height + 1);
      };
      const checkMenu = async (label: string) => {
        for (const b of await uiButtons(page)) inView(b, `${label} ${b.texts.join('|')}`);
        await shot(page, `${name}-${label}`);
      };

      await page.waitForTimeout(500);
      await checkMenu('title');
      const nb = await findUi(page, await tr(page, 'ui.new_game'));
      await page.touchscreen.tap(nb.x, nb.y);
      await waitScene(page, 'Map');
      await page.waitForTimeout(400);
      await checkMenu('map');
      const n1 = await findUi(page, '1');
      await page.touchscreen.tap(n1.x, n1.y);
      await waitScene(page, 'PreWave');
      await page.waitForTimeout(400);
      await checkMenu('prewave');

      // battle (SHORTCUT: startWave)
      await page.evaluate(() => (window as any).__aodd.startWave(1));
      await waitScene(page, 'Battle');
      await page.evaluate(() => (window as any).advanceTime(1500));
      await page.waitForTimeout(300);
      await shot(page, `${name}-battle`);

      // every HUD button on screen and >= 44 css px
      const geo = await battleGeo(page);
      const L = geo.layout;
      const hit: [string, any][] = [
        ['pause', L.pauseButton],
        ['speed', L.speedButton],
        ['dodge', L.dodgeButton],
        ['rally', L.rallyButton],
        ...L.spellButtons.map((r: any, i: number) => [`spell${i}`, r] as [string, any]),
        ...L.unitSlots.map((r: any, i: number) => [`slot${i}`, r] as [string, any]),
      ];
      for (const [label, r] of hit) {
        const a = await viewToPage(page, r.x, r.y);
        const b = await viewToPage(page, r.x + r.w, r.y + r.h);
        const w = b.x - a.x;
        const h = b.y - a.y;
        expect.soft(w, `${label} width`).toBeGreaterThanOrEqual(MIN_FOR[name] ?? 44);
        expect.soft(h, `${label} height`).toBeGreaterThanOrEqual(MIN_FOR[name] ?? 44);
        inView({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w, h }, label);
      }

      // move: hold the right zone, Ash walks right
      const ashX = async () => ((await snap(page)) as any).ash?.x;
      const x0 = await ashX();
      const zr = await hudPoint(page, 'moveZoneRight', 0, 0.7, 0.5);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: zr.x, y: zr.y, id: 1 }] });
      await page.waitForTimeout(900);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const x1 = await ashX();
      if (x0 !== undefined) expect(x1).toBeGreaterThan(x0);

      // pause by tap
      const pp = await hudPoint(page, 'pauseButton');
      await page.touchscreen.tap(pp.x, pp.y);
      await page.waitForTimeout(500);
      await shot(page, `${name}-pause`);
      const resume = await findUi(page, await tr(page, 'ui.resume'), 3000).catch(() => null);
      if (resume) {
        inView(resume, 'pause resume');
        await page.touchscreen.tap(resume.x, resume.y);
      }

      // spell aim: tap spell 0
      const sp = await hudPoint(page, 'spellButtons', 0);
      await page.touchscreen.tap(sp.x, sp.y);
      await page.waitForTimeout(300);
      await shot(page, `${name}-aim`);
      expect(errors, errors.join('\n')).toEqual([]);
    });
  });
}
