/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Player-level QA helpers (phase 3): real mouse/keyboard/touch on menu buttons
 * and HUD rects, event recording on the app bus, and a simple bot.
 *
 * Menu buttons are found by walking the active scenes' display lists for
 * interactive containers and matching their label text (translated through
 * app.t), then clicked with page.mouse at the container's on-screen centre.
 * HUD rects come from the live Battle scene layout (core/layout.computeHudLayout)
 * converted logical px -> canvas px (x renderScale) -> CSS px (canvas bounding rect).
 */
import { expect, type CDPSession, type Page } from '@playwright/test';

export type Snapshot = Record<string, any>;

export interface UiButton {
  scene: string;
  texts: string[];
  /** centre in page CSS px */
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  /** already in the scene's input list (clickable this frame) */
  ready: boolean;
}

export interface Pt {
  x: number;
  y: number;
}

/**
 * Opens the game and collects console errors / page errors.
 * The save is wiped only on the first load in this tab, so page.reload() keeps it
 * (sessionStorage survives reloads, a new test gets a new context).
 */
export async function bootGame(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('qa.booted')) {
      localStorage.clear();
      sessionStorage.setItem('qa.booted', '1');
    }
  });
  await page.goto('/');
  await waitBooted(page);
  return errors;
}

export async function waitBooted(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => typeof (window as any).render_game_to_text === 'function'), { timeout: 15_000 }).toBe(true);
  await waitScene(page, 'Title');
}

export async function snap(page: Page): Promise<Snapshot> {
  return JSON.parse(await page.evaluate(() => (window as any).render_game_to_text()));
}

export async function sceneName(page: Page): Promise<string> {
  return (await snap(page)).scene as string;
}

/** waits until the active scene list is exactly `scene` (e.g. 'Battle', 'Result') */
export async function waitScene(page: Page, scene: string, timeout = 15_000): Promise<void> {
  await expect.poll(async () => sceneName(page), { timeout }).toBe(scene);
}

export async function tr(page: Page, key: string, vars?: Record<string, string | number>): Promise<string> {
  return page.evaluate(([k, v]) => (window as any).__aodd.app().t(k, v), [key, vars] as const);
}

/** every enabled interactive container (menu buttons, map nodes, cards) in the active scenes */
export async function uiButtons(page: Page): Promise<UiButton[]> {
  return page.evaluate(async () => {
    const { getRuntime } = await import('/src/core/app.ts');
    const rt = getRuntime();
    const canvas = rt.game.canvas;
    const r = canvas.getBoundingClientRect();
    const sx = r.width / canvas.width;
    const sy = r.height / canvas.height;
    const out: any[] = [];
    for (const sc of rt.game.scene.getScenes(true)) {
      const cam = sc.cameras.main;
      const walk = (list: any[]) => {
        for (const o of list) {
          if (o.active === false) continue;
          if (o.type === 'Container' && o.input && o.input.enabled && o.visible !== false) {
            const texts: string[] = [];
            const collect = (c: any) => {
              if (c.type === 'Text' || c.type === 'BitmapText') texts.push(c.text);
              if (c.list) c.list.forEach(collect);
            };
            o.list.forEach(collect);
            const m = o.getWorldTransformMatrix();
            const sfx = o.scrollFactorX ?? 1;
            const sfy = o.scrollFactorY ?? 1;
            const cx = (m.tx - cam.scrollX * sfx) * cam.zoom;
            const cy = (m.ty - cam.scrollY * sfy) * cam.zoom;
            // new interactive objects only join the input list on the next game step
            const ready = !!(sc as any).input?._list?.includes(o);
            out.push({ scene: sc.scene.key, texts, x: r.left + cx * sx, y: r.top + cy * sy, w: o.width * cam.zoom * sx, h: o.height * cam.zoom * sy, depth: o.depth, ready });
          }
          if (o.list) walk(o.list);
        }
      };
      walk(sc.children.list);
    }
    return out;
  });
}

const matches = (t: string, want: string | RegExp) => (typeof want === 'string' ? t === want : want.test(t));

export async function findUi(page: Page, label: string | RegExp, timeout = 10_000): Promise<UiButton> {
  let hit: UiButton | undefined;
  await expect
    .poll(
      async () => {
        const all = await uiButtons(page);
        // topmost first (dialogs / pause menu sit on higher depths)
        all.sort((a, b) => b.depth - a.depth);
        hit = all.find((b) => b.ready && b.texts.some((t) => matches(t, label)));
        return !!hit;
      },
      { timeout, message: `menu button ${String(label)}` },
    )
    .toBe(true);
  return hit!;
}

/** real mouse click on a menu button found by its label */
export async function clickUi(page: Page, label: string | RegExp): Promise<UiButton> {
  const b = await findUi(page, label);
  await page.mouse.click(b.x, b.y);
  return b;
}

/** all visible Text / BitmapText strings in the active scenes */
export async function visibleTexts(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const { getRuntime } = await import('/src/core/app.ts');
    const rt = getRuntime();
    const out: string[] = [];
    for (const sc of rt.game.scene.getScenes(true)) {
      const walk = (list: any[]) => {
        for (const o of list) {
          if (o.visible === false || o.active === false) continue;
          if ((o.type === 'Text' || o.type === 'BitmapText') && o.alpha > 0) out.push(o.text);
          if (o.list) walk(o.list);
        }
      };
      walk(sc.children.list);
    }
    return out;
  });
}

// ---------------------------------------------------------------- battle geometry

export interface BattleGeo {
  cameraX: number;
  renderScale: number;
  viewW: number;
  layout: Record<string, any>;
}

export async function battleGeo(page: Page): Promise<BattleGeo> {
  return page.evaluate(async () => {
    const { getRuntime } = await import('/src/core/app.ts');
    const rt = getRuntime();
    const sc = rt.battle!.scene as any;
    return { cameraX: sc.view.cameraX, renderScale: rt.app.renderScale, viewW: sc.layout.viewW, layout: JSON.parse(JSON.stringify(sc.layout)) };
  });
}

/** logical view px -> page CSS px */
export async function viewToPage(page: Page, vx: number, vy: number): Promise<Pt> {
  return page.evaluate(
    async ([x, y]) => {
      const { getRuntime } = await import('/src/core/app.ts');
      const rt = getRuntime();
      const canvas = rt.game.canvas;
      const r = canvas.getBoundingClientRect();
      const k = (r.width / canvas.width) * rt.app.renderScale;
      return { x: r.left + x * k, y: r.top + y * k };
    },
    [vx, vy] as const,
  );
}

type RectName = 'unitSlots' | 'spellButtons' | 'pauseButton' | 'speedButton' | 'dodgeButton' | 'cancelAimButton' | 'moveZoneLeft' | 'moveZoneRight';

/** centre (or a fractional point) of a HUD rect from the live layout, in page CSS px */
export async function hudPoint(page: Page, name: RectName, index = 0, fx = 0.5, fy = 0.5): Promise<Pt> {
  const geo = await battleGeo(page);
  const v = geo.layout[name];
  const r = Array.isArray(v) ? v[index] : v;
  return viewToPage(page, r.x + r.w * fx, r.y + r.h * fy);
}

// ---------------------------------------------------------------- events

/** Subscribes once per page to the given bus events; payloads are deep-copied. */
export async function recordEvents(page: Page, names: string[]): Promise<void> {
  await page.evaluate((ns) => {
    const w = window as any;
    w.__qaEv = w.__qaEv || [];
    w.__qaSubs = w.__qaSubs || new Set<string>();
    const bus = w.__aodd.app().bus;
    for (const n of ns) {
      if (w.__qaSubs.has(n)) continue;
      w.__qaSubs.add(n);
      bus.on(n, (p: unknown) => w.__qaEv.push({ n, t: performance.now(), p: JSON.parse(JSON.stringify(p, (_k, v) => (v === Infinity ? 'Inf' : v))) }));
    }
  }, names);
}

export async function events(page: Page, name?: string): Promise<Array<{ n: string; t: number; p: any }>> {
  return page.evaluate((n) => ((window as any).__qaEv || []).filter((e: any) => !n || e.n === n), name);
}

export async function clearEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__qaEv = [];
  });
}

/**
 * Counts live bus subscriptions per event by wrapping app.bus.on (installed once per page).
 * Used to spot listener leaks across battle restarts.
 */
export async function installListenerCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    if (w.__qaListeners) return;
    const counts: Record<string, number> = {};
    w.__qaListeners = counts;
    const bus = w.__aodd.app().bus;
    const orig = bus.on.bind(bus);
    bus.on = (ev: string, fn: unknown) => {
      counts[ev] = (counts[ev] ?? 0) + 1;
      const off = orig(ev, fn);
      let done = false;
      return () => {
        if (!done) {
          done = true;
          counts[ev]--;
        }
        off();
      };
    };
  });
}

export async function listenerCounts(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => ({ ...(window as any).__qaListeners }));
}

// ---------------------------------------------------------------- sim control

export async function pauseSim(page: Page, paused = true): Promise<void> {
  await page.evaluate((p) => (window as any).__aodd.app().bus.emit('ui:pause', { paused: p }), paused);
}

export async function advance(page: Page, ms: number): Promise<void> {
  await page.evaluate((t) => (window as any).advanceTime(t), ms);
}

/** real time: waits until the sim tick has advanced by at least n */
export async function waitTicks(page: Page, n: number, timeout = 15_000): Promise<number> {
  const t0 = (await snap(page)).tick as number;
  let now = t0;
  await expect
    .poll(
      async () => {
        now = (await snap(page)).tick as number;
        return now - t0;
      },
      { timeout, message: `waiting for ${n} sim ticks` },
    )
    .toBeGreaterThanOrEqual(n);
  return now - t0;
}

/** world entities (alive) from the live runner */
export async function worldEntities(page: Page): Promise<any[]> {
  return page.evaluate(async () => {
    const { getRuntime } = await import('/src/core/app.ts');
    const w = getRuntime().battle!.runner.world;
    return w.entities.filter((e) => e.alive).map((e) => ({ id: e.id, kind: e.kind, defId: e.defId, x: e.x, y: e.y, hp: e.hp, anim: e.anim, facing: e.facing }));
  });
}

// ---------------------------------------------------------------- flows

/** Title -> Map -> wave node -> PreWave -> Start, all real mouse clicks. Title must be showing. */
export async function enterWaveViaMenus(page: Page, wave: number, opts: { fromTitle?: 'new' | 'continue' } = {}): Promise<void> {
  if ((await sceneName(page)) === 'Title') {
    await clickUi(page, await tr(page, opts.fromTitle === 'continue' ? 'ui.continue' : 'ui.new_game'));
    await waitScene(page, 'Map');
  }
  await clickUi(page, String(wave));
  await waitScene(page, 'PreWave');
  await clickUi(page, await tr(page, 'prewave.start'));
  await waitScene(page, 'Battle');
  await expect.poll(async () => (await snap(page)).wave?.number).toBe(wave);
}

export interface BotResult {
  result: string | null;
  reason: string | null;
  time: number;
  goldCollected: number;
  pickups: number;
  summons: number;
  ashHp: number;
  bookHp: number;
}

/**
 * Simple player bot (shortcut: drives __aodd.input + advanceTime while paused).
 * Each 0.25 s of sim: summon (swordsman > archer > peasant) when iron allows,
 * walk Ash to the nearest coin that is not past the enemy front line, else back to `homeX`.
 * Casts Q when 3+ enemies are within 400 px in front of Ash.
 */
export async function runBot(page: Page, opts: { maxSec?: number; homeX?: number } = {}): Promise<BotResult> {
  return page.evaluate(
    async ({ maxSec, homeX }) => {
      const { getRuntime } = await import('/src/core/app.ts');
      const w = (window as any) as { __aodd: any; advanceTime(ms: number): void };
      const world = getRuntime().battle!.runner.world;
      const slotOf = (id: string) => world.summonSlots.findIndex((s) => s.unitId === id);
      let summons = 0;
      let pickups = 0;
      const off = w.__aodd.app().bus.on('pickup:collected', () => pickups++);
      const off2 = w.__aodd.app().bus.on('unit:summoned', () => summons++);
      const STEP = 15;
      for (let i = 0; i < (maxSec * 60) / STEP && !world.outcome; i++) {
        const cmds: any[] = [];
        const iron = world.resources.iron;
        const ash = world.entities.find((e) => e.id === world.ashId && e.alive);
        if (!ash) break;
        const enemies = world.entities.filter((e) => e.alive && e.hp > 0 && (e.kind === 'enemy' || e.kind === 'boss'));
        const allies = world.entities.filter((e) => e.alive && e.hp > 0 && e.kind === 'ally').length;
        for (const id of ['swordsman', 'archer', 'peasant']) {
          const k = slotOf(id);
          if (k < 0) continue;
          const s = world.summonSlots[k];
          if (s.cooldownLeft > 0 || !s.available || iron < s.ironCost) continue;
          if (id === 'peasant' && allies >= 6) continue;
          cmds.push({ type: 'summon', slot: k });
          break;
        }
        const ahead = enemies.filter((e) => e.x > ash.x && e.x - ash.x < 400).length;
        const q = world.spellSlots[0];
        if (q && ahead >= 3 && q.cooldownLeft <= 0 && world.resources.mana >= q.manaCost) cmds.push({ type: 'cast', slot: 0, target: 'auto' });
        // coins up to the enemy front line are fair game while Ash is healthy
        const frontX = enemies.reduce((m, e) => Math.min(m, e.x), Infinity);
        const coins = ash.hp > ash.maxHp * 0.35 ? world.entities.filter((e) => e.alive && e.kind === 'pickup' && e.x <= frontX + 10) : [];
        coins.sort((a, b) => Math.abs(a.x - ash.x) - Math.abs(b.x - ash.x));
        const target = coins.length ? coins[0].x : homeX;
        const d = target - ash.x;
        // one step is 55 px, so a dead zone of 30 px stops the bot from oscillating around the target
        const move = Math.abs(d) < 30 ? 0 : d > 0 ? 1 : -1;
        w.__aodd.input({ move, commands: cmds }, STEP);
        w.advanceTime((STEP * 1000) / 60);
      }
      off();
      off2();
      const ash = world.entities.find((e) => e.id === world.ashId);
      return {
        result: world.outcome?.result ?? null,
        reason: world.outcome?.reason ?? null,
        time: world.time,
        goldCollected: world.resources.goldCollected,
        pickups,
        summons,
        ashHp: ash ? ash.hp : 0,
        bookHp: world.book.hp,
      };
    },
    { maxSec: opts.maxSec ?? 240, homeX: opts.homeX ?? 620 },
  );
}

/**
 * "Nobody defends the castle" (SHORTCUT: __aodd.input + advanceTime while paused):
 * Ash backs up to the castle (holding left, so he faces the wall and never shoots),
 * waits until `crowd` skeletons are on him, then runs right through them to the far
 * end of the field and stays there. The skeletons left behind walk on to the book.
 * Stops when `until` is met: 'book_hit' (first book:damaged) or 'outcome'.
 */
export async function abandonCastle(page: Page, until: 'book_hit' | 'outcome', crowd = 3): Promise<Snapshot> {
  await page.evaluate(
    async ({ until, crowd }) => {
      const { getRuntime } = await import('/src/core/app.ts');
      const w = (window as any) as { __aodd: any; advanceTime(ms: number): void };
      const world = getRuntime().battle!.runner.world;
      const ash = () => world.entities.find((e) => e.id === world.ashId && e.alive)!;
      const near = () => world.entities.filter((e) => e.alive && e.hp > 0 && e.kind === 'enemy' && e.x < ash().x + 120).length;
      let bookHit = false;
      const off = w.__aodd.app().bus.on('book:damaged', () => (bookHit = true));
      for (let i = 0; i < 600 && !world.outcome && near() < crowd; i++) {
        w.__aodd.input({ move: -1 }, 30);
        w.advanceTime(500);
      }
      for (let i = 0; i < 1200 && !world.outcome && !(until === 'book_hit' && bookHit); i++) {
        w.__aodd.input({ move: 1 }, 15);
        w.advanceTime(250);
      }
      off();
    },
    { until, crowd },
  );
  return snap(page);
}

// ---------------------------------------------------------------- touch (CDP)

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

/** multi-touch through CDP Input.dispatchTouchEvent; `points` = every finger still on the screen */
export async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: TouchPoint[]): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })),
  });
}

export function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}
