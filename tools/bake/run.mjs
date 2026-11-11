// Art bake driver. Starts the bake page (Vite), opens it in headless Chrome on the
// real GPU, runs jobs and writes the files they return.
//
//   node tools/bake/run.mjs <job> [json-args | @args-file.json]
//   node tools/bake/run.mjs --script tools/bake/scripts/<name>.mjs
//
// A script module exports `default async (ctx) => {...}` with ctx.run(job, args).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const root = process.cwd();
const argv = process.argv.slice(2);

const server = await createServer({ configFile: path.join(root, 'vite/config.bake.mjs') });
await server.listen();
const port = server.config.server.port;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl2-compute-context', '--disable-gpu-vsync'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('console', (m) => {
  const text = m.text();
  if (/willReadFrequently|favicon|status of 404/.test(text)) return;
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[page ${m.type()}] ${text}`);
});
page.on('pageerror', (e) => console.log('[page error]', String(e)));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => typeof window.__bake === 'object', null, { timeout: 30000 });
console.log('GPU:', await page.evaluate(() => window.__bake.info()));

async function run(job, args = {}) {
  const t0 = Date.now();
  const res = await page.evaluate(([j, a]) => window.__bake.run(j, a), [job, args]);
  for (const line of res.log) console.log(`  ${line}`);
  for (const f of res.files) {
    const out = path.join(root, f.path);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(f.base64, 'base64'));
    console.log(`  wrote ${f.path} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  }
  console.log(`${job} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return res;
}

let code = 0;
try {
  if (argv[0] === '--script') {
    const mod = await import(pathToFileURL(path.resolve(argv[1])).href);
    await mod.default({ run, page, root, args: argv.slice(2), fs, path });
  } else if (argv[0]) {
    let args = {};
    if (argv[1]?.startsWith('@')) args = JSON.parse(fs.readFileSync(argv[1].slice(1), 'utf8'));
    else if (argv[1]) args = JSON.parse(argv[1]);
    await run(argv[0], args);
  } else {
    console.log('jobs:', await page.evaluate(() => window.__bake.jobs()));
  }
} catch (err) {
  console.error(err);
  code = 1;
}
await browser.close();
await server.close();
process.exit(code);
