/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 3 acceptance: play waves 1-3 like a player.
 *
 * Real input is used for every acceptance step (page.mouse on menu buttons and HUD
 * rects, page.keyboard, CDP touch). Shortcuts are marked "SHORTCUT" in each test:
 * __aodd.startWave / setProfile, ui:pause on the bus, __aodd.input + advanceTime
 * (the bot), and reading the live runtime for asserts.
 *
 * Acceptance checks (user brief, phase 3):
 *   1. controls          -> 'phase 3 / 1. controls*', 'phase 3 / more controls'
 *   2. enemies           -> 'phase 3 / 2. enemies'
 *   3. castle falls      -> 'phase 3 / 3. castle falls', 'phase 3 / more outcomes'
 *   4. win -> next wave  -> 'phase 3 / 4. win -> next wave'
 *   5. save              -> 'phase 3 / 5. save'
 * Extra: restart x3 / resize / frame time -> 'phase 3 / extra checks'.
 * Known bugs are test.fail() with their id (BUG-C1, BUG-R1, BUG-R2, BUG-G2): flip them when fixed.
 * Screenshots go to output/qa3/ (gitignored).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  abandonCastle,
  advance,
  bootGame,
  clearEvents,
  clickUi,
  enterWaveViaMenus,
  events,
  findUi,
  hudPoint,
  battleGeo,
  installListenerCounter,
  listenerCounts,
  pauseSim,
  percentile,
  recordEvents,
  runBot,
  snap,
  touch,
  tr,
  uiButtons,
  viewToPage,
  visibleTexts,
  waitBooted,
  waitScene,
  waitTicks,
  worldEntities,
} from './play';

const BATTLE_EVENTS = ['unit:summoned', 'summon:denied', 'spell:cast', 'spell:denied', 'ui:pause', 'ui:speed', 'ui:aim', 'wave:started', 'wave:ended'];

async function ashX(page: Page): Promise<number> {
  return (await snap(page)).ash.x as number;
}

/** hold a key in real time for at least `ticks` sim ticks; returns Ash's x delta */
async function holdKey(page: Page, key: string, ticks = 30): Promise<number> {
  const x0 = await ashX(page);
  await page.keyboard.down(key);
  await waitTicks(page, ticks);
  await page.keyboard.up(key);
  await waitTicks(page, 2);
  return (await ashX(page)) - x0;
}

test.describe('phase 3 / 1. controls', () => {
  test('menus: Title -> Map -> wave 1 -> PreWave -> Start by mouse clicks', async ({ page }) => {
    const errors = await bootGame(page);
    await waitScene(page, 'Title');
    // fresh save: no Continue button
    const titleLabels = (await uiButtons(page)).flatMap((b) => b.texts);
    expect(titleLabels).not.toContain(await tr(page, 'ui.continue'));
    await clickUi(page, await tr(page, 'ui.new_game'));
    await waitScene(page, 'Map');
    // only wave 1 is playable on a fresh save
    const nodes = (await uiButtons(page)).filter((b) => /^\d+$/.test(b.texts[0] ?? '')).map((b) => b.texts[0]);
    expect(nodes).toEqual(['1']);
    await clickUi(page, '1');
    await waitScene(page, 'PreWave');
    expect(await visibleTexts(page)).toContain(await tr(page, 'ui.wave', { n: 1, total: 50 }));
    await clickUi(page, await tr(page, 'prewave.start'));
    await waitScene(page, 'Battle');
    const s = await snap(page);
    expect(s.wave.number).toBe(1);
    expect(s.phase).toBe('running');
    expect(s.summonSlots.map((x: any) => x.unit)).toEqual(['peasant', 'swordsman']);
    expect(s.spellSlots.map((x: any) => x.spell)).toEqual(['super_boomstick', 'arrow_volley']);
    await page.screenshot({ path: 'output/qa3/1-battle-start.png' });
    expect(errors).toEqual([]);
  });

  test('keyboard: A/D and arrows move Ash, 1/2 summon, Q casts, E aims, P pauses, F toggles x2', async ({ page }) => {
    const errors = await bootGame(page);
    await enterWaveViaMenus(page, 1);
    await recordEvents(page, BATTLE_EVENTS);
    await waitTicks(page, 5);

    // --- movement (real time; asserts are per sim tick because headless frame pacing varies)
    const dD = await holdKey(page, 'KeyD');
    expect(dD).toBeGreaterThan(60);
    expect((await snap(page)).ash.facing).toBe(1);
    const dA = await holdKey(page, 'KeyA');
    expect(dA).toBeLessThan(-60);
    expect((await snap(page)).ash.facing).toBe(-1);
    expect(await holdKey(page, 'ArrowRight')).toBeGreaterThan(60);
    expect(await holdKey(page, 'ArrowLeft')).toBeLessThan(-60);
    // released = standing still
    const xs = await ashX(page);
    await waitTicks(page, 20);
    expect(await ashX(page)).toBe(xs);

    // v2: the wave starts with 10 iron (blacksmith L1 makes 1.2/s, cap 30): let the smithy fill the store first
    await advance(page, 20_000);
    // --- 1 / 2 summon: exactly one unit per press, iron drops by the slot cost
    await clearEvents(page);
    let s = await snap(page);
    const iron0 = s.res.iron as number;
    await page.keyboard.press('Digit1');
    await expect.poll(async () => (await events(page, 'unit:summoned')).length).toBe(1);
    s = await snap(page);
    expect(s.res.iron).toBeLessThanOrEqual(iron0 - 4); // peasant costs 5 iron (SPEC v2.4)
    expect(s.counts.ally).toBe(1);
    const iron1 = s.res.iron as number;
    await page.keyboard.press('Digit2');
    await expect.poll(async () => (await events(page, 'unit:summoned')).length).toBe(2);
    const sum = await events(page, 'unit:summoned');
    expect(sum.map((e) => [e.p.slot, e.p.unitId])).toEqual([[0, 'peasant'], [1, 'swordsman']]);
    s = await snap(page);
    expect(s.res.iron).toBeLessThanOrEqual(iron1 - 9); // swordsman costs 10 iron (SPEC v2.4)
    expect(s.counts.ally).toBe(2);
    // the allies walk right from the stairs
    const allyX0 = (await worldEntities(page)).filter((e) => e.kind === 'ally').map((e) => e.x);
    await waitTicks(page, 30);
    const allyX1 = (await worldEntities(page)).filter((e) => e.kind === 'ally').map((e) => e.x);
    expect(Math.min(...allyX1.map((x, i) => x - allyX0[i]))).toBeGreaterThan(0);

    // --- Q casts the line spell: mana drops
    const mana0 = (await snap(page)).res.mana as number;
    await page.keyboard.press('KeyQ');
    await expect.poll(async () => (await events(page, 'spell:cast')).length).toBe(1);
    expect((await events(page, 'spell:cast'))[0].p).toMatchObject({ slot: 0, spellId: 'super_boomstick' });
    expect((await snap(page)).res.mana).toBeLessThanOrEqual(mana0 - 29);
    // Q again while on cooldown is denied, not cast twice
    await page.keyboard.press('KeyQ');
    await expect.poll(async () => (await events(page, 'spell:denied')).map((e) => e.p.reason)).toContain('cooldown');
    expect((await events(page, 'spell:cast')).length).toBe(1);

    // --- E aims the point spell, Esc cancels, E + click on the field casts at that x
    await page.keyboard.press('KeyE');
    await expect.poll(async () => (await events(page, 'ui:aim')).at(-1)?.p.slot).toBe(1);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await events(page, 'ui:aim')).at(-1)?.p.slot).toBe(null);
    expect((await snap(page)).paused).toBe(false); // Esc while aiming cancels, does not pause
    await page.keyboard.press('KeyE');
    await expect.poll(async () => (await events(page, 'ui:aim')).at(-1)?.p.slot).toBe(1);
    const aimAt = await viewToPage(page, 900, 380);
    await page.mouse.move(aimAt.x, aimAt.y);
    const geo = await battleGeo(page);
    await page.mouse.click(aimAt.x, aimAt.y);
    await expect.poll(async () => (await events(page, 'spell:cast')).length).toBe(2);
    const cast = (await events(page, 'spell:cast'))[1].p;
    expect(cast.slot).toBe(1);
    expect(cast.spellId).toBe('arrow_volley');
    expect(Math.abs(cast.x - (900 + geo.cameraX))).toBeLessThan(25);

    // --- P pauses (tick stops), P resumes
    await page.keyboard.press('KeyP');
    await expect.poll(async () => (await snap(page)).paused).toBe(true);
    const t0 = (await snap(page)).tick;
    await page.waitForTimeout(600);
    expect((await snap(page)).tick).toBe(t0);
    await page.keyboard.press('KeyP');
    await expect.poll(async () => (await snap(page)).paused).toBe(false);
    await waitTicks(page, 10);

    // --- F toggles x2: the sim runs about twice as many ticks per real second
    const rate = async () => {
      const a = await snap(page);
      const r0 = Date.now();
      await page.waitForTimeout(1500);
      const b = await snap(page);
      return (b.tick - a.tick) / ((Date.now() - r0) / 1000);
    };
    const r1 = await rate();
    await page.keyboard.press('KeyF');
    await expect.poll(async () => (await snap(page)).speed).toBe(2);
    const r2 = await rate();
    await page.keyboard.press('KeyF');
    await expect.poll(async () => (await snap(page)).speed).toBe(1);
    test.info().annotations.push({ type: 'speed', description: `ticks/s x1=${r1.toFixed(1)} x2=${r2.toFixed(1)}` });
    expect(r2 / r1).toBeGreaterThan(1.4);
    expect((await events(page, 'ui:speed')).map((e) => e.p.speed)).toEqual([2, 1]);

    await page.screenshot({ path: 'output/qa3/1-keyboard-end.png' });
    expect(errors).toEqual([]);
  });

  test('mouse: unit slots, spell buttons, aim + click on field, right-click cancels, pause/speed buttons', async ({ page }) => {
    const errors = await bootGame(page);
    await enterWaveViaMenus(page, 1);
    await recordEvents(page, BATTLE_EVENTS);
    await waitTicks(page, 5);
    // v2: the wave starts with 10 iron (blacksmith L1 makes 1.2/s, cap 30): let the smithy fill the store first
    await advance(page, 20_000);

    // unit slots
    const slot0 = await hudPoint(page, 'unitSlots', 0);
    await page.mouse.click(slot0.x, slot0.y);
    await expect.poll(async () => (await events(page, 'unit:summoned')).map((e) => e.p.slot)).toEqual([0]);
    const slot1 = await hudPoint(page, 'unitSlots', 1);
    await page.mouse.click(slot1.x, slot1.y);
    await expect.poll(async () => (await events(page, 'unit:summoned')).map((e) => e.p.slot)).toEqual([0, 1]);
    // an empty slot does nothing
    const slot5 = await hudPoint(page, 'unitSlots', 5);
    await page.mouse.click(slot5.x, slot5.y);
    await waitTicks(page, 3);
    expect((await events(page, 'unit:summoned')).length).toBe(2);
    expect((await events(page, 'summon:denied')).length).toBe(0);

    // spell 0 (line) casts on click
    const sp0 = await hudPoint(page, 'spellButtons', 0);
    await page.mouse.click(sp0.x, sp0.y);
    await expect.poll(async () => (await events(page, 'spell:cast')).map((e) => e.p.spellId)).toEqual(['super_boomstick']);

    // spell 1 (point): click the button -> aim, right-click cancels
    const sp1 = await hudPoint(page, 'spellButtons', 1);
    await page.mouse.click(sp1.x, sp1.y);
    await expect.poll(async () => (await events(page, 'ui:aim')).at(-1)?.p.slot).toBe(1);
    const field = await viewToPage(page, 1000, 350);
    await page.mouse.move(field.x, field.y);
    await page.mouse.click(field.x, field.y, { button: 'right' });
    await expect.poll(async () => (await events(page, 'ui:aim')).at(-1)?.p.slot).toBe(null);
    expect((await events(page, 'spell:cast')).length).toBe(1);
    // click the × cancel button
    await page.mouse.click(sp1.x, sp1.y);
    await expect.poll(async () => (await events(page, 'ui:aim')).at(-1)?.p.slot).toBe(1);
    const cancel = await hudPoint(page, 'cancelAimButton');
    await page.mouse.click(cancel.x, cancel.y);
    await expect.poll(async () => (await events(page, 'ui:aim')).at(-1)?.p.slot).toBe(null);
    expect((await events(page, 'spell:cast')).length).toBe(1);
    // aim again and click the field: casts at that world x, Ash does not walk
    await page.mouse.click(sp1.x, sp1.y);
    await expect.poll(async () => (await events(page, 'ui:aim')).at(-1)?.p.slot).toBe(1);
    const x0 = await ashX(page);
    const target = await viewToPage(page, 1100, 330);
    await page.mouse.move(target.x, target.y, { steps: 4 });
    const geo = await battleGeo(page);
    await page.mouse.click(target.x, target.y);
    await expect.poll(async () => (await events(page, 'spell:cast')).length).toBe(2);
    const cast = (await events(page, 'spell:cast'))[1].p;
    expect(cast.spellId).toBe('arrow_volley');
    expect(Math.abs(cast.x - (1100 + geo.cameraX))).toBeLessThan(25);
    await waitTicks(page, 5);
    expect(await ashX(page)).toBe(x0);

    // a mouse press on the field (not aiming) walks Ash toward that half while held
    const right = await hudPoint(page, 'moveZoneRight', 0, 0.8, 0.5);
    const xr = await ashX(page);
    await page.mouse.move(right.x, right.y);
    await page.mouse.down();
    await waitTicks(page, 30);
    await page.mouse.up();
    expect((await ashX(page)) - xr).toBeGreaterThan(60);

    // pause button: tick stops; the pause menu's Resume button resumes
    const pause = await hudPoint(page, 'pauseButton');
    await page.mouse.click(pause.x, pause.y);
    await expect.poll(async () => (await snap(page)).paused).toBe(true);
    const t0 = (await snap(page)).tick;
    await page.waitForTimeout(500);
    expect((await snap(page)).tick).toBe(t0);
    await page.screenshot({ path: 'output/qa3/1-pause-menu.png' });
    await clickUi(page, await tr(page, 'ui.resume'));
    await expect.poll(async () => (await snap(page)).paused).toBe(false);
    // pause button again, then the same button resumes
    await page.mouse.click(pause.x, pause.y);
    await expect.poll(async () => (await snap(page)).paused).toBe(true);
    await page.mouse.click(pause.x, pause.y);
    await expect.poll(async () => (await snap(page)).paused).toBe(false);

    // speed button toggles x2 and back
    const speed = await hudPoint(page, 'speedButton');
    await page.mouse.click(speed.x, speed.y);
    await expect.poll(async () => (await snap(page)).speed).toBe(2);
    await page.mouse.click(speed.x, speed.y);
    await expect.poll(async () => (await snap(page)).speed).toBe(1);
    expect(errors).toEqual([]);
  });
});

test.describe('phase 3 / 1. controls (touch)', () => {
  test.use({ hasTouch: true });

  test('touch: hold move zones, tap unit slot, two fingers (walk + tap slot), tap spell', async ({ page }) => {
    const errors = await bootGame(page);
    // menus by tapping: Title -> Map -> wave 1 -> PreWave -> Start
    const tapUi = async (label: string) => {
      const b = await findUi(page, label);
      await page.touchscreen.tap(b.x, b.y);
    };
    await tapUi(await tr(page, 'ui.new_game'));
    await waitScene(page, 'Map');
    await tapUi('1');
    await waitScene(page, 'PreWave');
    await tapUi(await tr(page, 'prewave.start'));
    await waitScene(page, 'Battle');
    await recordEvents(page, BATTLE_EVENTS);
    const cdp = await page.context().newCDPSession(page);
    await waitTicks(page, 5);
    // v2: the wave starts with 10 iron (blacksmith L1 makes 1.2/s, cap 30): let the smithy fill the store first
    await advance(page, 20_000);

    // hold the right move zone
    const zr = await hudPoint(page, 'moveZoneRight', 0, 0.75, 0.5);
    let x0 = await ashX(page);
    await touch(cdp, 'touchStart', [{ id: 1, ...zr }]);
    await waitTicks(page, 30);
    await touch(cdp, 'touchEnd', []);
    await waitTicks(page, 2);
    expect((await ashX(page)) - x0).toBeGreaterThan(60);
    expect((await snap(page)).ash.facing).toBe(1);

    // hold the left move zone
    const zl = await hudPoint(page, 'moveZoneLeft', 0, 0.25, 0.5);
    x0 = await ashX(page);
    await touch(cdp, 'touchStart', [{ id: 2, ...zl }]);
    await waitTicks(page, 30);
    await touch(cdp, 'touchEnd', []);
    await waitTicks(page, 2);
    expect((await ashX(page)) - x0).toBeLessThan(-60);

    // tap a unit slot: exactly one summon
    await clearEvents(page);
    const slot0 = await hudPoint(page, 'unitSlots', 0);
    await page.touchscreen.tap(slot0.x, slot0.y);
    await expect.poll(async () => (await events(page, 'unit:summoned')).length).toBe(1);
    await waitTicks(page, 10);
    expect((await events(page, 'unit:summoned')).length).toBe(1);

    // two fingers: hold right zone, tap slot 1 with a second finger while walking
    x0 = await ashX(page);
    const slot1 = await hudPoint(page, 'unitSlots', 1);
    const walk = { id: 3, ...zr };
    await touch(cdp, 'touchStart', [walk]);
    await waitTicks(page, 10);
    await touch(cdp, 'touchStart', [walk, { id: 4, ...slot1 }]);
    await waitTicks(page, 2);
    await touch(cdp, 'touchEnd', [walk]);
    await waitTicks(page, 20);
    const xMid = await ashX(page);
    await touch(cdp, 'touchEnd', []);
    await expect.poll(async () => (await events(page, 'unit:summoned')).map((e) => e.p.slot)).toEqual([0, 1]);
    expect(xMid - x0).toBeGreaterThan(60); // kept walking during and after the second tap

    // tap the line spell button
    const sp0 = await hudPoint(page, 'spellButtons', 0);
    await page.touchscreen.tap(sp0.x, sp0.y);
    await expect.poll(async () => (await events(page, 'spell:cast')).map((e) => e.p.slot)).toEqual([0]);

    // tap the point spell, then tap the field: casts there
    const sp1 = await hudPoint(page, 'spellButtons', 1);
    await page.touchscreen.tap(sp1.x, sp1.y);
    await expect.poll(async () => (await events(page, 'ui:aim')).at(-1)?.p.slot).toBe(1);
    const geo = await battleGeo(page);
    const f = await viewToPage(page, 1000, 360);
    await page.touchscreen.tap(f.x, f.y);
    await expect.poll(async () => (await events(page, 'spell:cast')).length).toBe(2);
    expect(Math.abs((await events(page, 'spell:cast'))[1].p.x - (1000 + geo.cameraX))).toBeLessThan(25);
    expect(errors).toEqual([]);
  });
});

test.describe('phase 3 / 2. enemies', () => {
  test('skeletons spawn on the right, walk left at data speed, and damage allies and Ash', async ({ page }) => {
    const errors = await bootGame(page);
    // SHORTCUT: startWave + pause on the bus + advanceTime / injected input
    await page.evaluate(() => (window as any).__aodd.startWave(1));
    await waitScene(page, 'Battle');
    await pauseSim(page);
    await recordEvents(page, ['entity:spawned', 'entity:damaged', 'entity:attack', 'unit:summoned']);
    await advance(page, 4100);
    const spawned = (await events(page, 'entity:spawned')).filter((e) => e.p.kind === 'enemy');
    expect(spawned.length).toBe(1);
    expect(spawned[0].p.defId).toBe('skeleton');
    expect(spawned[0].p.x).toBeGreaterThanOrEqual(2400); // right edge (enemySpawnX 2500)
    const id = spawned[0].p.id;
    const xAt = async () => (await worldEntities(page)).find((e) => e.id === id)!.x as number;
    const x1 = await xAt();
    await advance(page, 4000);
    const x2 = await xAt();
    expect(x1 - x2).toBeGreaterThan(170); // 45 px/s * 4 s = 180
    expect(x1 - x2).toBeLessThan(190);
    expect((await worldEntities(page)).find((e) => e.id === id)!.facing).toBe(-1);

    // v2: 10 iron at the start; the swordsman costs 20
    await advance(page, 1000);
    // a swordsman walks out, meets the skeletons far from Ash, and takes hits
    await page.evaluate(() => (window as any).__aodd.input({ commands: [{ type: 'summon', slot: 1 }] }, 1));
    await advance(page, 100);
    const sw = (await events(page, 'unit:summoned'))[0].p.entityIds[0];
    const enemyIds = new Set<number>();
    let allyHit: any;
    for (let i = 0; i < 80 && !allyHit; i++) {
      await advance(page, 500);
      for (const e of await events(page, 'entity:spawned')) if (e.p.kind === 'enemy') enemyIds.add(e.p.id);
      allyHit = (await events(page, 'entity:damaged')).find((e) => e.p.id === sw && enemyIds.has(e.p.sourceId));
    }
    expect(allyHit, 'a skeleton damaged the swordsman').toBeTruthy();
    expect((await events(page, 'entity:attack')).some((e) => enemyIds.has(e.p.id) && e.p.targetId === sw)).toBe(true);

    // Ash walks into the next skeletons and gets hit
    const ashId = await page.evaluate(async () => (await import('/src/core/app.ts')).getRuntime().battle!.runner.world.ashId);
    let ashHit: any;
    for (let i = 0; i < 120 && !ashHit; i++) {
      await page.evaluate(() => (window as any).__aodd.input({ move: 1 }, 30));
      await advance(page, 500);
      for (const e of await events(page, 'entity:spawned')) if (e.p.kind === 'enemy') enemyIds.add(e.p.id);
      ashHit = (await events(page, 'entity:damaged')).find((e) => e.p.id === ashId && enemyIds.has(e.p.sourceId));
    }
    expect(ashHit, 'a skeleton damaged Ash').toBeTruthy();
    expect((await snap(page)).ash.hp).toBeLessThan(200);
    await pauseSim(page, false);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'output/qa3/2-ash-fighting.png' });
    expect(errors).toEqual([]);
  });

  test('an undefended book loses HP', async ({ page }) => {
    const errors = await bootGame(page);
    // SHORTCUT: startWave + pause + scripted input (Ash leaves the castle, no troops)
    await page.evaluate(() => (window as any).__aodd.startWave(1));
    await waitScene(page, 'Battle');
    await pauseSim(page);
    await recordEvents(page, ['book:damaged']);
    const s = await abandonCastle(page, 'book_hit');
    expect(s.outcome).toBeNull();
    await advance(page, 5000);
    const hits = await events(page, 'book:damaged');
    expect(hits.length).toBeGreaterThanOrEqual(3);
    // payload hp is the running book hp and matches the world
    for (let i = 1; i < hits.length; i++) expect(hits[i].p.hp).toBeCloseTo(hits[i - 1].p.hp - hits[i].p.amount, 5);
    const after = await snap(page);
    expect(after.book.hp).toBeLessThan(500);
    expect(after.book.hp).toBeCloseTo(hits.at(-1)!.p.hp, 5);
    // the HUD book bar shows the same number
    await expect.poll(async () => visibleTexts(page)).toContain(String(Math.ceil(after.book.hp)));
    expect(errors).toEqual([]);
  });
});

test.describe('phase 3 / 3. castle falls', () => {
  test('no defence -> wave lost, Result shows defeat, Retry restarts the same wave', async ({ page }) => {
    const errors = await bootGame(page);
    await enterWaveViaMenus(page, 1);
    await recordEvents(page, ['wave:ended', 'wave:started']);
    // SHORTCUT: pause + scripted input until the book falls
    await pauseSim(page);
    const s = await abandonCastle(page, 'outcome');
    expect(s.outcome?.result).toBe('lost');
    expect(['book_destroyed', 'ash_died']).toContain(s.outcome?.reason);
    expect(s.phase).toBe('lost');
    const ended = await events(page, 'wave:ended');
    expect(ended.length).toBe(1);
    expect(ended[0].p.goldTotal).toBe(Math.floor(ended[0].p.goldCollected * 0.5));
    // Result appears on its own (1.4 s after the end)
    await waitScene(page, 'Result');
    const texts = await visibleTexts(page);
    expect(texts).toContain(await tr(page, 'ui.defeat'));
    const reasonKey = s.outcome.reason === 'book_destroyed' ? 'result.reason.book' : 'result.reason.ash';
    const reasonText = await tr(page, reasonKey);
    expect(texts.some((t) => t.includes(reasonText))).toBe(true);
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'output/qa3/3-result-defeat.png' });
    // no "next wave" after a loss; progress unchanged
    expect((await uiButtons(page)).flatMap((b) => b.texts)).not.toContain(await tr(page, 'ui.next_wave'));
    const prof = await page.evaluate(() => (window as any).__aodd.app().profile);
    expect(prof.highestWave).toBe(0);
    expect(prof.gold).toBe(ended[0].p.goldTotal);

    // Retry: same wave, fresh state
    await clickUi(page, await tr(page, 'ui.retry'));
    await waitScene(page, 'Battle');
    const r = await snap(page);
    expect(r.wave.number).toBe(1);
    expect(r.phase).toBe('running');
    expect(r.outcome).toBeNull();
    expect(r.book.hp).toBe(r.book.maxHp);
    expect(r.ash.hp).toBe(r.ash.maxHp);
    expect(r.wave.enemiesSpawned).toBe(0);
    expect(r.time).toBeLessThan(2);
    expect((await events(page, 'wave:started')).length).toBe(1);
    expect(errors).toEqual([]);
  });
});

/** play the current battle with the bot (SHORTCUT) and wait for the Result scene */
async function botWin(page: Page, wave: number): Promise<any> {
  await pauseSim(page);
  const r = await runBot(page);
  test.info().annotations.push({ type: `bot wave ${wave}`, description: JSON.stringify(r) });
  expect(r.result, `bot result on wave ${wave}: ${JSON.stringify(r)}`).toBe('won');
  await waitScene(page, 'Result');
  return page.evaluate(() => (window as any).__qaEv.filter((e: any) => e.n === 'wave:ended').at(-1).p);
}

async function expectVictoryScreen(page: Page, outcome: any): Promise<void> {
  const texts = await visibleTexts(page);
  expect(texts).toContain(await tr(page, 'ui.victory'));
  expect(texts).toContain(String(outcome.goldTotal));
  expect(texts).toContain(await tr(page, 'result.gold_now', { n: await page.evaluate(() => (window as any).__aodd.app().profile.gold) }));
}

test.describe('phase 3 / 4. win -> next wave', () => {
  test('win waves 1, 2, 3 in a row: victory + gold on Result, Next wave, archer unlock after wave 2', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await bootGame(page);
    await recordEvents(page, ['wave:ended', 'wave:started', 'pickup:collected']);
    await enterWaveViaMenus(page, 1);

    // ---- wave 1
    const o1 = await botWin(page, 1);
    expect(o1).toMatchObject({ result: 'won', wave: 1, firstClear: true });
    expect(o1.goldCollected).toBeGreaterThan(0); // the bot walked over coins
    expect(o1.goldBonus).toBe((20 + 5 * 1) * 2); // first clear doubles the wave bonus
    expect(o1.goldTotal).toBe(o1.goldCollected + o1.goldUncollectedKept + o1.goldBonus);
    expect(o1.stars).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(900); // star tweens
    await page.screenshot({ path: 'output/qa3/4-result-wave1.png' });
    await expectVictoryScreen(page, o1);
    let prof = await page.evaluate(() => (window as any).__aodd.app().profile);
    expect(prof.highestWave).toBe(1);
    expect(prof.gold).toBe(o1.goldTotal);
    expect(prof.stars['1']).toBe(o1.stars);

    // ---- Next wave -> PreWave 2 -> Start (real clicks)
    await clickUi(page, await tr(page, 'ui.next_wave'));
    await waitScene(page, 'PreWave');
    expect(await visibleTexts(page)).toContain(await tr(page, 'ui.wave', { n: 2, total: 50 }));
    await clickUi(page, await tr(page, 'prewave.start'));
    await waitScene(page, 'Battle');
    expect((await snap(page)).wave.number).toBe(2);
    const o2 = await botWin(page, 2);
    expect(o2).toMatchObject({ result: 'won', wave: 2, firstClear: true });
    expect(o2.unlocks).toContain('archer'); // archer: unlockWave 3
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'output/qa3/4-result-wave2.png' });
    await expectVictoryScreen(page, o2);
    expect(await visibleTexts(page)).toContain(await tr(page, 'unit.archer'));
    prof = await page.evaluate(() => (window as any).__aodd.app().profile);
    expect(prof.highestWave).toBe(2);
    expect(prof.gold).toBe(o1.goldTotal + o2.goldTotal);

    // ---- wave 3: the archer card is unlocked in PreWave; pick it (real click) and start
    await clickUi(page, await tr(page, 'ui.next_wave'));
    await waitScene(page, 'PreWave');
    const archerName = await tr(page, 'unit.archer');
    const card = await findUi(page, archerName);
    expect(card.texts).toContain('10'); // iron cost shown instead of the lock label (archer: 10 iron, SPEC v2.4)
    await page.mouse.click(card.x, card.y);
    await expect.poll(async () => page.evaluate(() => (window as any).__aodd.app().profile.loadout.units)).toEqual(['peasant', 'swordsman', 'archer']);
    await page.screenshot({ path: 'output/qa3/4-prewave-wave3.png' });
    await clickUi(page, await tr(page, 'prewave.start'));
    await waitScene(page, 'Battle');
    let s = await snap(page);
    expect(s.wave.number).toBe(3);
    expect(s.summonSlots.map((x: any) => x.unit)).toEqual(['peasant', 'swordsman', 'archer']);
    const o3 = await botWin(page, 3);
    expect(o3).toMatchObject({ result: 'won', wave: 3, firstClear: true });
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'output/qa3/4-result-wave3.png' });
    await expectVictoryScreen(page, o3);
    prof = await page.evaluate(() => (window as any).__aodd.app().profile);
    expect(prof.highestWave).toBe(3);
    expect(prof.gold).toBe(o1.goldTotal + o2.goldTotal + o3.goldTotal);

    // Next wave goes to wave 4
    await clickUi(page, await tr(page, 'ui.next_wave'));
    await waitScene(page, 'PreWave');
    expect(await visibleTexts(page)).toContain(await tr(page, 'ui.wave', { n: 4, total: 50 }));
    s = await snap(page);
    expect(s.highestWave).toBe(3);
    expect((await events(page, 'wave:started')).map((e) => e.p.wave)).toEqual([1, 2, 3]);
    expect(errors).toEqual([]);
  });
});

async function profile(page: Page): Promise<any> {
  return page.evaluate(() => JSON.parse(JSON.stringify((window as any).__aodd.app().profile)));
}

async function mapNodes(page: Page): Promise<string[]> {
  return (await uiButtons(page)).filter((b) => b.scene === 'Map' && /^\d+$/.test(b.texts[0] ?? '')).map((b) => b.texts[0]);
}

/** SHORTCUT: a profile built from save.defaults() with overrides, saved through setProfile */
async function setProfile(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate((p) => {
    const app = (window as any).__aodd.app();
    (window as any).__aodd.setProfile({ ...app.save.defaults(), ...p });
  }, patch);
}

async function loopCap(page: Page): Promise<{ fpsLimit: number; hasFpsLimit: boolean }> {
  return page.evaluate(async () => {
    const { getRuntime } = await import('/src/core/app.ts');
    const loop = getRuntime().game.loop as any;
    return { fpsLimit: loop.fpsLimit, hasFpsLimit: loop.hasFpsLimit };
  });
}

test.describe('phase 3 / 5. save', () => {
  test('progress: after winning, reload shows Continue, gold and highestWave persist, Map unlocks waves 2 and 3', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await bootGame(page);
    await recordEvents(page, ['wave:ended']);
    await enterWaveViaMenus(page, 1);
    const o1 = await botWin(page, 1);
    // autosaved at wave end
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('aodd.save')!));
    expect(saved).toMatchObject({ highestWave: 1, gold: o1.goldTotal });
    expect(saved.stars['1']).toBe(o1.stars);

    await page.reload();
    await waitBooted(page);
    await recordEvents(page, ['wave:ended']);
    const cont = await findUi(page, await tr(page, 'ui.continue'));
    expect(cont.texts).toContain(await tr(page, 'title.progress', { wave: 1, total: 50 }));
    expect(await snap(page)).toMatchObject({ scene: 'Title', highestWave: 1, gold: o1.goldTotal });
    await page.screenshot({ path: 'output/qa3/5-title-continue.png' });
    await page.mouse.click(cont.x, cont.y);
    await waitScene(page, 'Map');
    expect(await mapNodes(page)).toEqual(['1', '2']);
    expect(await visibleTexts(page)).toContain(String(o1.goldTotal)); // gold badge

    // wave 2 from the map, then reload again
    await clickUi(page, '2');
    await waitScene(page, 'PreWave');
    await clickUi(page, await tr(page, 'prewave.start'));
    await waitScene(page, 'Battle');
    const o2 = await botWin(page, 2);
    await page.reload();
    await waitBooted(page);
    expect(await snap(page)).toMatchObject({ highestWave: 2, gold: o1.goldTotal + o2.goldTotal });
    await clickUi(page, await tr(page, 'ui.continue'));
    await waitScene(page, 'Map');
    expect(await mapNodes(page)).toEqual(['1', '2', '3']);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'output/qa3/5-map-after-wave2.png' });
    // the loadout picked before also persisted
    expect((await profile(page)).loadout.units).toEqual(['peasant', 'swordsman']);
    expect(errors).toEqual([]);
  });

  test('shop: an upgrade bought with gold persists after reload and applies in battle', async ({ page }) => {
    const errors = await bootGame(page);
    await setProfile(page, { gold: 500, highestWave: 1 });
    await page.reload();
    await waitBooted(page);
    await clickUi(page, await tr(page, 'ui.continue'));
    await waitScene(page, 'Map');
    await clickUi(page, await tr(page, 'ui.upgrade'));
    await waitScene(page, 'Shop');
    const buyLabel = await tr(page, 'shop.buy');
    await findUi(page, buyLabel); // wait until the rows are clickable
    const buy = (await uiButtons(page)).filter((b) => b.ready && b.texts.includes(buyLabel))[0]; // first row: ash.hp (60 gold)
    expect(buy).toBeTruthy();
    await page.mouse.click(buy.x, buy.y);
    await expect.poll(async () => (await profile(page)).upgrades['ash.hp']).toBe(1);
    expect((await profile(page)).gold).toBe(500 - 60);
    expect(await visibleTexts(page)).toContain(await tr(page, 'shop.level', { n: 1, max: 10 }));
    await page.screenshot({ path: 'output/qa3/5-shop-bought.png' });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aodd.save')!).upgrades['ash.hp'])).toBe(1);

    await page.reload();
    await waitBooted(page);
    expect((await profile(page)).upgrades['ash.hp']).toBe(1);
    expect((await profile(page)).gold).toBe(440);
    await clickUi(page, await tr(page, 'ui.continue'));
    await waitScene(page, 'Map');
    await clickUi(page, await tr(page, 'ui.upgrade'));
    await waitScene(page, 'Shop');
    expect(await visibleTexts(page)).toContain(await tr(page, 'shop.level', { n: 1, max: 10 }));
    // and Ash has more HP in battle
    await clickUi(page, await tr(page, 'ui.map'));
    await waitScene(page, 'Map');
    await enterWaveViaMenus(page, 1);
    expect((await snap(page)).ash.maxHp).toBeGreaterThan(200);
    expect(errors).toEqual([]);
  });

  test('settings: language TH<->EN and the 60 fps cap persist after reload', async ({ page }) => {
    const errors = await bootGame(page);
    await clickUi(page, await tr(page, 'ui.settings'));
    await waitScene(page, 'Settings');
    await clickUi(page, 'English');
    await expect.poll(async () => (await profile(page)).settings.lang).toBe('en');
    await expect.poll(async () => visibleTexts(page)).toContain('Language');
    await clickUi(page, '60 fps');
    await expect.poll(async () => (await profile(page)).settings.fpsCap).toBe(60);
    expect(await loopCap(page)).toEqual({ fpsLimit: 60, hasFpsLimit: true });
    await page.screenshot({ path: 'output/qa3/5-settings-en.png' });

    await page.reload();
    await waitBooted(page);
    expect((await profile(page)).settings).toMatchObject({ lang: 'en', fpsCap: 60 });
    expect(await loopCap(page)).toEqual({ fpsLimit: 60, hasFpsLimit: true });
    expect((await uiButtons(page)).flatMap((b) => b.texts)).toContain('New game');
    await page.screenshot({ path: 'output/qa3/5-title-en.png' });

    // and back: Thai + unlimited
    await clickUi(page, 'Settings');
    await waitScene(page, 'Settings');
    await clickUi(page, 'ไทย');
    await expect.poll(async () => (await profile(page)).settings.lang).toBe('th');
    await clickUi(page, /^ตามจอ/);
    await expect.poll(async () => (await profile(page)).settings.fpsCap).toBe(0);
    await page.reload();
    await waitBooted(page);
    expect((await profile(page)).settings).toMatchObject({ lang: 'th', fpsCap: 0 });
    expect(await loopCap(page)).toEqual({ fpsLimit: 0, hasFpsLimit: false });
    expect((await uiButtons(page)).flatMap((b) => b.texts)).toContain('เริ่มใหม่');
    expect(errors).toEqual([]);
  });

  test('corrupted aodd.save recovers from aodd.save.bak with a notice; both corrupted -> fresh save with a notice', async ({ page }) => {
    const errors = await bootGame(page);
    // SHORTCUT: two saves so that .bak holds the first one
    await setProfile(page, { gold: 111, highestWave: 1 });
    await setProfile(page, { gold: 222, highestWave: 2 });
    const bak = await page.evaluate(() => JSON.parse(localStorage.getItem('aodd.save.bak')!));
    expect(bak).toMatchObject({ gold: 111, highestWave: 1 });
    await page.evaluate(() => localStorage.setItem('aodd.save', '{"schemaVersion":1,"gold":'));
    await page.reload();
    await waitBooted(page);
    expect(await page.evaluate(() => (window as any).__aodd.app().save.lastRecovery?.from)).toBe('backup');
    expect(await profile(page)).toMatchObject({ gold: 111, highestWave: 1 });
    await expect.poll(async () => visibleTexts(page)).toContain(await tr(page, 'save.recovered.backup'));
    await page.screenshot({ path: 'output/qa3/5-recovered-backup.png' });
    const cont = await findUi(page, await tr(page, 'ui.continue'));
    expect(cont.texts).toContain(await tr(page, 'title.progress', { wave: 1, total: 50 }));

    // schema-invalid main save (valid JSON, wrong types) also falls back to the backup
    await page.evaluate(() => localStorage.setItem('aodd.save', JSON.stringify({ schemaVersion: 1, gold: 'lots', highestWave: -1 })));
    await page.reload();
    await waitBooted(page);
    expect(await page.evaluate(() => (window as any).__aodd.app().save.lastRecovery?.from)).toBe('backup');
    expect((await profile(page)).gold).toBe(111);

    // both broken -> defaults + notice
    await page.evaluate(() => {
      localStorage.setItem('aodd.save', 'garbage');
      localStorage.setItem('aodd.save.bak', 'garbage');
    });
    await page.reload();
    await waitBooted(page);
    expect(await page.evaluate(() => (window as any).__aodd.app().save.lastRecovery?.from)).toBe('defaults');
    expect(await profile(page)).toMatchObject({ gold: 0, highestWave: 0 });
    await expect.poll(async () => visibleTexts(page)).toContain(await tr(page, 'save.recovered.defaults'));
    expect(errors).toEqual([]);
  });
});

/**
 * SHORTCUT: pause the runner synchronously on wave:started (emitted inside Battle.create,
 * before the first frame), so every battle starts paused at tick 0 and a scripted segment
 * can be compared between runs.
 */
async function pauseOnEveryWaveStart(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    if (w.__qaPauseHook) return;
    w.__qaPauseHook = true;
    const bus = w.__aodd.app().bus;
    w.__qaWaveStarts = 0;
    bus.on('wave:started', () => {
      w.__qaWaveStarts++;
      bus.emit('ui:pause', { paused: true });
    });
  });
}

/** SHORTCUT: fixed input script from tick 0, then a fingerprint of the world */
async function scriptedFingerprint(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { getRuntime } = await import('/src/core/app.ts');
    const w = window as any;
    const world = getRuntime().battle!.runner.world;
    if (world.tick !== 0) return `not at tick 0: ${world.tick}`;
    w.__aodd.input({ move: 1, commands: [{ type: 'summon', slot: 0 }] }, 40);
    w.__aodd.input({ move: 0, commands: [{ type: 'summon', slot: 1 }] }, 600);
    w.__aodd.input({ move: -1, commands: [{ type: 'cast', slot: 0, target: 'auto' }] }, 20);
    w.advanceTime(25_000);
    const ents = world.entities
      .filter((e) => e.alive)
      .map((e) => `${e.kind}:${e.defId}:${e.x.toFixed(3)}:${e.hp.toFixed(3)}:${e.anim}`)
      .sort();
    const r = world.resources;
    return JSON.stringify({ tick: world.tick, ents, iron: r.iron.toFixed(3), mana: r.mana.toFixed(3), gold: r.goldCollected, book: world.book.hp, wave: world.wave });
  });
}

test.describe('phase 3 / extra checks', () => {
  test('restart 3x (Retry, Retry, pause-menu restart): identical behaviour, one summon per key press, no listener leaks', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = await bootGame(page);
    await installListenerCounter(page); // must wrap bus.on before the first battle subscribes
    await recordEvents(page, ['unit:summoned', 'wave:started', 'wave:ended', 'summon:denied']);
    await pauseOnEveryWaveStart(page);
    await enterWaveViaMenus(page, 1);

    const prints: string[] = [];
    const counts: Array<Record<string, number>> = [];
    const stats: Array<Record<string, unknown>> = [];
    for (let run = 0; run < 4; run++) {
      if (run === 1 || run === 2) {
        // lose (SHORTCUT) -> Result -> Retry (real click)
        await abandonCastle(page, 'outcome');
        await waitScene(page, 'Result');
        await clickUi(page, await tr(page, 'ui.retry'));
        await waitScene(page, 'Battle');
      } else if (run === 3) {
        // pause menu -> Restart wave -> confirm (real clicks); the battle is paused by the hook
        await clickUi(page, await tr(page, 'pause.restart_wave'));
        await clickUi(page, await tr(page, 'ui.restart'));
        await expect.poll(async () => (await snap(page)).tick).toBe(0);
        await waitScene(page, 'Battle');
      }
      await expect.poll(async () => (await snap(page)).paused).toBe(true);
      expect((await snap(page)).tick).toBe(0);
      await page.waitForTimeout(300); // a few rendered frames at tick 0
      stats.push(await page.evaluate(async () => {
        const { getRuntime } = await import('/src/core/app.ts');
        const rt = getRuntime();
        const sc = rt.battle!.scene as any;
        return {
          children: sc.children.list.length,
          tweens: sc.tweens.getTweens().length,
          timers: sc.time.getAllEvents ? sc.time.getAllEvents().length : -1,
          inputList: sc.sys.input._list.length,
          textures: rt.game.textures.getTextureKeys().length,
          activeScenes: rt.game.scene.getScenes(true).map((x: any) => x.scene.key).join('+'),
        };
      }));
      prints.push(await scriptedFingerprint(page));
      // real key press: exactly one summon per press
      await pauseSim(page, false);
      await waitTicks(page, 3);
      await clearEvents(page);
      await page.keyboard.press('Digit1');
      await expect.poll(async () => (await events(page, 'unit:summoned')).length + (await events(page, 'summon:denied')).length).toBe(1);
      await waitTicks(page, 15);
      const summoned = await events(page, 'unit:summoned');
      const denied = await events(page, 'summon:denied');
      expect(summoned.length + denied.length, `run ${run}: one result per key press`).toBe(1);
      counts.push(await listenerCounts(page));
      await pauseSim(page, true);
    }
    expect(prints[0]).not.toContain('not at tick 0');
    for (let i = 1; i < prints.length; i++) expect(prints[i], `run ${i} replays run 0 exactly`).toBe(prints[0]);
    for (let i = 1; i < counts.length; i++) expect(counts[i], `run ${i}: bus listener counts`).toEqual(counts[0]);
    test.info().annotations.push({ type: 'listeners', description: JSON.stringify(counts[0]) });
    test.info().annotations.push({ type: 'restart stats', description: JSON.stringify(stats) });
    for (let i = 1; i < stats.length; i++) expect(stats[i], `run ${i}: display list / tweens / textures at tick 0`).toEqual(stats[0]);
    expect(await page.evaluate(() => (window as any).__qaWaveStarts)).toBe(4);
    expect(errors).toEqual([]);
  });

  test('window resize mid-battle (1280 -> 1600 -> 1280 wide) keeps HUD buttons clickable', async ({ page }) => {
    const errors = await bootGame(page);
    await enterWaveViaMenus(page, 1);
    await recordEvents(page, ['unit:summoned', 'spell:cast', 'ui:aim']);
    await waitTicks(page, 5);
    // v2: the wave starts with 10 iron (blacksmith L1 makes 1.2/s, cap 30): let the smithy fill the store first
    await advance(page, 20_000);

    await page.setViewportSize({ width: 1600, height: 720 });
    await expect.poll(async () => (await battleGeo(page)).viewW).toBe(1600);
    const slot0 = await hudPoint(page, 'unitSlots', 0);
    await page.mouse.click(slot0.x, slot0.y);
    await expect.poll(async () => (await events(page, 'unit:summoned')).map((e) => e.p.slot)).toEqual([0]);
    const sp0 = await hudPoint(page, 'spellButtons', 0);
    expect(sp0.x).toBeGreaterThan(1280); // spell buttons moved with the right edge
    await page.mouse.click(sp0.x, sp0.y);
    await expect.poll(async () => (await events(page, 'spell:cast')).length).toBe(1);
    // aim + click at the new width still maps to the right world x
    const sp1 = await hudPoint(page, 'spellButtons', 1);
    await page.mouse.click(sp1.x, sp1.y);
    await expect.poll(async () => (await events(page, 'ui:aim')).at(-1)?.p.slot).toBe(1);
    const geo = await battleGeo(page);
    const f = await viewToPage(page, 1450, 360);
    await page.mouse.move(f.x, f.y);
    await page.mouse.click(f.x, f.y);
    await expect.poll(async () => (await events(page, 'spell:cast')).length).toBe(2);
    expect(Math.abs((await events(page, 'spell:cast'))[1].p.x - (1450 + geo.cameraX))).toBeLessThan(25);
    const pause = await hudPoint(page, 'pauseButton');
    await page.mouse.click(pause.x, pause.y);
    await expect.poll(async () => (await snap(page)).paused).toBe(true);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'output/qa3/x-resize-1600-paused.png' });
    await page.mouse.click(pause.x, pause.y);
    await expect.poll(async () => (await snap(page)).paused).toBe(false);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'output/qa3/x-resize-1600.png' });

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect.poll(async () => (await battleGeo(page)).viewW).toBe(1280);
    await waitTicks(page, 5);
    const slot1 = await hudPoint(page, 'unitSlots', 1);
    await page.mouse.click(slot1.x, slot1.y);
    await expect.poll(async () => (await events(page, 'unit:summoned')).map((e) => e.p.slot)).toEqual([0, 1]);
    const speed = await hudPoint(page, 'speedButton');
    await page.mouse.click(speed.x, speed.y);
    await expect.poll(async () => (await snap(page)).speed).toBe(2);
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'output/qa3/x-resize-1280.png' });
    expect(errors).toEqual([]);
  });

  test('busy wave-3 fight: frame-time sample (indicative, headless) and HUD numbers match the world', async ({ page }) => {
    const errors = await bootGame(page);
    await page.evaluate(() => {
      const app = (window as any).__aodd.app();
      const p = app.save.defaults();
      p.highestWave = 2;
      p.loadout.units = ['peasant', 'swordsman', 'archer'];
      (window as any).__aodd.setProfile(p);
    });
    // SHORTCUT: startWave + bot (input + advanceTime) to the third group of skeletons
    await page.evaluate(() => (window as any).__aodd.startWave(3));
    await waitScene(page, 'Battle');
    await pauseSim(page);
    await runBot(page, { maxSec: 63 });
    const s = await snap(page);
    expect(s.outcome).toBeNull();
    const counts = s.counts;
    await pauseSim(page, false);
    await page.waitForTimeout(500);
    await page.evaluate(() => (window as any).__aodd.frameTimes());
    await page.waitForTimeout(3000);
    const ft = (await page.evaluate(() => (window as any).__aodd.frameTimes())) as number[];
    const p50 = percentile(ft, 0.5);
    const p95 = percentile(ft, 0.95);
    const line = `frames=${ft.length} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${Math.max(...ft).toFixed(1)}ms entities=${JSON.stringify(counts)}`;
    console.log(`[perf] wave 3 busy: ${line}`);
    test.info().annotations.push({ type: 'perf', description: line });
    await page.screenshot({ path: 'output/qa3/x-wave3-busy.png' });
    expect(ft.length).toBeGreaterThan(30);
    expect(p50).toBeLessThan(50);

    // HUD numbers (paused so the world does not move between the reads)
    await pauseSim(page);
    await page.waitForTimeout(200);
    const w = await snap(page);
    const texts = await visibleTexts(page);
    expect(texts).toContain(String(Math.ceil(w.ash.hp)));
    expect(texts).toContain(String(Math.ceil(w.book.hp)));
    expect(texts).toContain(String(w.res.iron));
    expect(texts).toContain(String(Math.floor(w.res.gold)));
    expect(texts).toContain(String(w.wave.enemiesTotal - w.wave.enemiesKilled));
    expect(errors).toEqual([]);
  });
});

test.describe('phase 3 / more controls', () => {
  test('point spell: pressing E twice auto-casts at the enemies (keyboard double press)', async ({ page }) => {
    const errors = await bootGame(page);
    // SHORTCUT: startWave + advanceTime until a skeleton is within auto-target range (700 px) of Ash
    await page.evaluate(() => (window as any).__aodd.startWave(1));
    await waitScene(page, 'Battle');
    await pauseSim(page);
    await advance(page, 34_000);
    const s = await snap(page);
    const target = s.hostiles[0];
    expect(target).toBeTruthy();
    expect(target.x - s.ash.x).toBeLessThan(700);
    await recordEvents(page, ['spell:cast', 'spell:denied', 'ui:aim']);
    await pauseSim(page, false);
    await page.keyboard.press('KeyE');
    await expect.poll(async () => (await events(page, 'ui:aim')).at(-1)?.p.slot).toBe(1);
    await page.keyboard.press('KeyE');
    await expect.poll(async () => (await events(page, 'spell:cast')).length).toBe(1);
    const cast = (await events(page, 'spell:cast'))[0].p;
    expect(cast.spellId).toBe('arrow_volley');
    const nowX = (await snap(page)).hostiles[0]?.x ?? target.x;
    expect(Math.abs(cast.x - nowX)).toBeLessThan(160); // within the volley's aim radius of the skeleton
    expect((await events(page, 'ui:aim')).at(-1)?.p.slot).toBe(null);
    expect(errors).toEqual([]);
  });

  test('pause menu: language and 60 fps quick toggles apply mid-battle and persist', async ({ page }) => {
    const errors = await bootGame(page);
    await enterWaveViaMenus(page, 1);
    await page.keyboard.press('KeyP');
    await expect.poll(async () => (await snap(page)).paused).toBe(true);
    await clickUi(page, await tr(page, 'pause.lang', { lang: await tr(page, 'lang.th') }));
    await expect.poll(async () => page.evaluate(() => (window as any).__aodd.app().profile.settings.lang)).toBe('en');
    // HUD and pause menu relabel in English
    await expect.poll(async () => visibleTexts(page)).toContain('Wave 1/50');
    expect(await visibleTexts(page)).toContain('Paused');
    await clickUi(page, '60 fps cap: off');
    await expect.poll(async () => page.evaluate(() => (window as any).__aodd.app().profile.settings.fpsCap)).toBe(60);
    expect(await loopCap(page)).toEqual({ fpsLimit: 60, hasFpsLimit: true });
    await page.screenshot({ path: 'output/qa3/x-pause-en.png' });
    await clickUi(page, 'Resume');
    await expect.poll(async () => (await snap(page)).paused).toBe(false);
    await waitTicks(page, 30); // the sim keeps running with the cap on
    await page.reload();
    await waitBooted(page);
    expect(await page.evaluate(() => (window as any).__aodd.app().profile.settings)).toMatchObject({ lang: 'en', fpsCap: 60 });
    expect(errors).toEqual([]);
  });

  test('BUG-C1: the sim keeps real-time pace right after entering a battle with quick menu clicks', async ({ page }) => {
    // BUG-C1 (core): fps.target = measured refresh rate; Phaser smoothStep's 120-frame cool-down after the
    // window gains focus clamps the frame delta to 1000/refreshHz, so when real frames are slower than the
    // measured refresh the battle runs in slow motion for ~2 s. Reproduces only when frames are slower than
    // 1000/refreshHz (headless SwiftShader here: refresh measured 165 Hz, frames ~22 ms).
    // fixed in phase 3 integration (was test.fail())
    const errors = await bootGame(page);
    // a player clicking straight through Title -> Map -> wave 1 -> Start (first clicks focus the window)
    await enterWaveViaMenus(page, 1);
    const a = await snap(page);
    const t0 = Date.now();
    await page.waitForTimeout(1500);
    const b = await snap(page);
    const ticksPerSec = (b.tick - a.tick) / ((Date.now() - t0) / 1000);
    const loop = await page.evaluate(async () => {
      const { getRuntime } = await import('/src/core/app.ts');
      const rt = getRuntime();
      return { raw: rt.game.loop.rawDelta, hz: rt.app.refreshHz };
    });
    test.info().annotations.push({ type: 'BUG-C1', description: `ticks/s=${ticksPerSec.toFixed(1)} rawDelta=${loop.raw.toFixed(1)}ms refreshHz=${loop.hz}` });
    test.skip(loop.raw < 1.5 * (1000 / loop.hz), 'frames are as fast as the measured refresh rate: BUG-C1 cannot show here');
    expect(ticksPerSec).toBeGreaterThan(50);
    expect(errors).toEqual([]);
  });
});

test.describe('phase 3 / more outcomes', () => {
  test('Ash dies -> wave lost (ash_died), Result shows the Ash reason', async ({ page }) => {
    const errors = await bootGame(page);
    await recordEvents(page, ['wave:ended']);
    // SHORTCUT: startWave + Ash gets a permanent stun where he stands (blocking the lane), so the
    // skeletons reach him and he cannot fight back. (Pre BUG-G2 fix this used "hold left at the wall".)
    await page.evaluate(() => (window as any).__aodd.startWave(1));
    await waitScene(page, 'Battle');
    await pauseSim(page);
    await page.evaluate(async () => {
      const { getRuntime } = await import('/src/core/app.ts');
      const world = getRuntime().battle!.runner.world;
      const ash = world.entities.find((e) => e.id === world.ashId && e.alive)!;
      ash.statuses.push({ id: 'stun', remaining: 1e9, magnitude: 1 });
      const w = window as any;
      for (let i = 0; i < 400 && !world.outcome; i++) w.advanceTime(1000);
    });
    const s = await snap(page);
    expect(s.outcome).toMatchObject({ result: 'lost', reason: 'ash_died' });
    await waitScene(page, 'Result');
    const texts = await visibleTexts(page);
    expect(texts).toContain(await tr(page, 'ui.defeat'));
    const reason = await tr(page, 'result.reason.ash');
    expect(texts.some((t) => t.includes(reason))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('replaying a cleared wave pays the normal bonus (no first-clear x2) and keeps highestWave', async ({ page }) => {
    const errors = await bootGame(page);
    await setProfile(page, { highestWave: 2, gold: 100 });
    await recordEvents(page, ['wave:ended']);
    await page.reload();
    await waitBooted(page);
    await recordEvents(page, ['wave:ended']);
    await clickUi(page, await tr(page, 'ui.continue'));
    await waitScene(page, 'Map');
    await clickUi(page, '1');
    await waitScene(page, 'PreWave');
    await clickUi(page, await tr(page, 'prewave.start'));
    await waitScene(page, 'Battle');
    const o = await botWin(page, 1);
    expect(o).toMatchObject({ result: 'won', wave: 1, firstClear: false, unlocks: [] });
    expect(o.goldBonus).toBe(20 + 5 * 1);
    const p = await profile(page);
    expect(p.highestWave).toBe(2);
    expect(p.gold).toBe(100 + o.goldTotal);
    expect(await visibleTexts(page)).not.toContain(await tr(page, 'result.first_clear'));
    expect(errors).toEqual([]);
  });
});

test.describe('phase 3 / known bugs (test.fail until fixed)', () => {
  test('BUG-R1: spell buttons show the mana icon next to the mana cost', async ({ page }) => {
    // BUG-R1 (render): HudRenderer.makeSlot() creates every cost icon as 'ui_iron', spells included,
    // so the HUD shows an iron ingot next to "30"/"35" on Q/E (PreWave shows the mana drop correctly).
    // fixed in phase 3 integration (was test.fail())
    await bootGame(page);
    await enterWaveViaMenus(page, 1);
    const r = await page.evaluate(async () => {
      const { getRuntime } = await import('/src/core/app.ts');
      const { spriteFrame } = await import('/src/render/art/atlas.ts');
      const sc = getRuntime().battle!.scene as any;
      const hud = sc.renderers.find((x: any) => x.id === 'hud' || x.constructor.name === 'HudRenderer');
      const mana = spriteFrame('ui_mana');
      return { icons: hud.spells.map((s: any) => s.costIcon.frame.name), mana: mana.frame };
    });
    for (const f of r.icons) expect(f).toBe(r.mana);
  });

  test('BUG-R2: pause menu wave subtitle does not touch the Resume button', async ({ page }) => {
    // BUG-R2 (render, cosmetic): PauseMenu puts the "Wave 1/50" line at py+70 and the Resume button
    // top at py+96; the 18 px text runs into the button edge (see output/qa3/x-crop-pause.png).
    // fixed in phase 3 integration (was test.fail())
    await bootGame(page);
    await enterWaveViaMenus(page, 1);
    await page.keyboard.press('KeyP');
    await expect.poll(async () => (await snap(page)).paused).toBe(true);
    const sub = await tr(page, 'ui.wave', { n: 1, total: 50 });
    const m = await page.evaluate(async (subText) => {
      const { getRuntime } = await import('/src/core/app.ts');
      const sc = getRuntime().battle!.scene;
      const texts = sc.children.list.filter((o: any) => o.type === 'Text' && o.text === subText && o.depth >= 5000) as any[];
      const resume = sc.children.list.filter((o: any) => o.type === 'Container' && o.depth >= 5000 && o.input).sort((a: any, b: any) => a.y - b.y)[0] as any;
      const tb = texts[0].getBounds();
      return { textBottom: tb.y + tb.height, buttonTop: resume.y - resume.height / 2 };
    }, sub);
    expect(m.buttonTop - m.textBottom).toBeGreaterThanOrEqual(4);
  });

  test('BUG-G2: Ash held against the castle wall still fights skeletons that reach him', async ({ page }) => {
    // BUG-G2 (gameplay): while a move key is held Ash faces the move direction even when the clamp at
    // ashMinX stops him, so holding A/← at the castle he faces the wall, keeps the walk anim and never
    // shoots or swings at the skeletons hitting his back (SPEC §2: face the move direction *while walking*).
    // fixed in phase 3 integration (was test.fail())
    await bootGame(page);
    await recordEvents(page, ['entity:attack', 'entity:damaged']);
    // SHORTCUT: startWave + held-left input + advanceTime
    await page.evaluate(() => (window as any).__aodd.startWave(1));
    await waitScene(page, 'Battle');
    await pauseSim(page);
    const ashId = await page.evaluate(async () => (await import('/src/core/app.ts')).getRuntime().battle!.runner.world.ashId);
    await page.evaluate(() => {
      const w = window as any;
      for (let i = 0; i < 120; i++) {
        const s = JSON.parse(w.render_game_to_text());
        if (s.hostiles.some((h: any) => h.x - s.ash.x < 70)) break;
        w.__aodd.input({ move: -1 }, 30);
        w.advanceTime(500);
      }
    });
    const s = await snap(page);
    expect(s.ash.x).toBe(230); // balance.world.ashMinX (SPEC v2.2)
    // After the fix Ash, still holding left against the wall, turns and shoots the skeletons
    // as soon as they enter gun range, so they usually never reach him at all.
    expect((await events(page, 'entity:attack')).some((e) => e.p.id === ashId)).toBe(true);
    expect(s.ash.anim).not.toBe('walk');
    expect(s.ash.facing).toBe(1);
  });
});
