// Online co-op smoke test: two pages in one Chrome, A hosts, B joins with the code.
// Needs the dev server (npm run dev, or AODD_PORT=<port>) and internet (PeerJS cloud signalling).
//   node tools/net-smoke.mjs            -> screenshots in output/net-shots/
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const port = Number(process.env.AODD_PORT ?? 8080);
const base = `http://localhost:${port}/`;
const out = 'output/net-shots';
mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = async (p) => JSON.parse(await p.evaluate(() => window.render_game_to_text()));
async function until(label, fn, timeout = 30000, every = 200) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timeout: ${label}`);
    await sleep(every);
  }
}
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
async function open(tag) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${tag}: ${e}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
  await p.addInitScript(() => localStorage.clear());
  await p.goto(base);
  await until(`${tag} title`, async () => (await p.evaluate(() => window.render_game_to_text?.() ?? '{}')).includes('"scene":"Title"'));
  return p;
}
const lobby = (p, data) => p.evaluate((d) => window.__aodd.runtime().game.scene.getScene('Title').scene.start('Lobby', d), data);
const net = (p) => p.evaluate(() => {
  const n = window.__aodd.runtime().modules.net;
  return { role: n.role, status: n.status, code: n.code, error: n.error };
});

try {
  const A = await open('A');
  const B = await open('B');
  await shot(A, '01-title');

  // A hosts
  await lobby(A, {});
  await sleep(600);
  await A.evaluate(() => window.__aodd.runtime().modules.net.host());
  const code = (await until('room code', async () => {
    const n = await net(A);
    if (n.status === 'error') throw new Error(`host error ${n.error}`);
    return n.status === 'waiting' && n.code;
  }));
  console.log('room code', code);
  await sleep(500);
  await shot(A, '02-host-code');

  // B joins by typing the code on the lobby keypad (keyboard path)
  await lobby(B, { join: true });
  await sleep(800);
  await B.keyboard.type(code.toLowerCase(), { delay: 60 });
  await shot(B, '03-guest-keypad');
  await B.keyboard.press('Enter');
  await until('guest connected', async () => {
    const n = await net(B);
    if (n.status === 'error') throw new Error(`join error ${n.error}`);
    return n.status === 'connected';
  });
  await until('host sees guest', async () => (await net(A)).status === 'connected');
  await sleep(600);
  await shot(A, '04-host-connected');
  await shot(B, '05-guest-waiting');

  // A starts wave 3; B must follow into the battle
  await A.evaluate(() => window.__aodd.startWave(3));
  await until('B in battle with entities', async () => {
    const s = await text(B);
    return s.scene?.includes('Battle') && s.ash && (s.counts?.enemy ?? 0) > 0;
  }, 40000);
  await sleep(1500);
  await shot(A, '06-host-battle');
  await shot(B, '07-guest-battle');

  // B presses summon slot 1 (key "1"); A's world gains an ally
  const allies = async () => (await text(A)).counts?.ally ?? 0;
  const before = await allies();
  let gained = false;
  for (let i = 0; i < 20 && !gained; i++) {
    await B.keyboard.press('Digit1');
    try {
      await until('ally appears on A', async () => (await allies()) > before, 1500, 100);
      gained = true;
    } catch {
      /* not enough iron yet: wait and press again */
    }
  }
  if (!gained) throw new Error('guest summon never reached the host');
  console.log(`allies on A: ${before} -> ${await allies()}`);
  await until('ally mirrored on B', async () => ((await text(B)).counts?.ally ?? 0) > before, 5000);
  await sleep(800);
  await shot(B, '08-guest-after-summon');
  await shot(A, '09-host-after-summon');
  const sa = await text(A);
  const sb = await text(B);
  console.log('snapshot', JSON.stringify(sa.net), 'guest', JSON.stringify(sb.net));

  // pause on the host pauses the guest too
  await A.evaluate(() => window.__aodd.app().bus.emit('ui:pause', { paused: true }));
  await until('B paused', async () => (await text(B)).paused === true, 5000);
  await A.evaluate(() => window.__aodd.app().bus.emit('ui:pause', { paused: false }));
  await until('B resumed', async () => (await text(B)).paused === false, 5000);
  console.log('pause mirrored');

  // play the wave out fast on the host (x2 speed + time skips); B keeps mirroring
  await A.evaluate(() => window.__aodd.app().bus.emit('ui:speed', { speed: 2 }));
  await until('wave over', async () => {
    const s = await text(A);
    if (s.outcome) return true;
    await A.evaluate(() => window.advanceTime(1500));
    return false;
  }, 240000, 150);
  const outcome = (await text(A)).outcome;
  console.log('outcome', outcome.result, outcome.reason ?? '');
  await until('A result', async () => (await text(A)).scene.includes('Result'), 15000);
  await until('B result', async () => (await text(B)).scene.includes('Result'), 15000);
  await sleep(1200);
  await shot(A, '10-host-result');
  await shot(B, '11-guest-result');

  // host leaves: the guest goes back to Title with a message
  await A.evaluate(() => window.__aodd.runtime().modules.net.leave());
  await until('B back at title', async () => (await text(B)).scene.includes('Title'), 20000);
  await sleep(400);
  await shot(B, '12-guest-host-left');
  console.log('B after host left', JSON.stringify(await net(B)));
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
  console.log(errors.length ? 'DONE with page errors' : 'PASS');
} catch (err) {
  console.error('FAIL', err);
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
