/**
 * Art bake page. The Node driver (tools/bake/run.mjs) calls window.__bake.run(job, args)
 * and writes the returned files to disk.
 *
 * Everything in ./jobs/*.ts (jobs) and ./defs/*.ts (sprite definitions) registers itself on import.
 */
import * as THREE from 'three';
import * as assetsLib from './assets';
import * as characterLib from './character';
import * as engineLib from './engine';
import * as packLib from './pack';
import * as propsLib from './props';
import * as spriteLib from './sprite';
import * as studio from './studio';

import.meta.glob('./jobs/*.ts', { eager: true });
import.meta.glob('./defs/*.ts', { eager: true });

const api = {
  /** modules for ad-hoc page.evaluate scripts (bare imports do not resolve there) */
  lib: { THREE, assets: assetsLib, character: characterLib, props: propsLib, sprite: spriteLib, engineLib, pack: packLib, studio, engine: studio.engine, shoot: studio.shoot },
  info: () => studio.engine.info(),
  jobs: () => studio.jobNames(),
  run: (name: string, args: Record<string, unknown> = {}) => studio.runJob(name, args),
};
(window as unknown as { __bake: typeof api }).__bake = api;
document.getElementById('log')!.textContent = `bake ready: ${studio.engine.info()}`;
