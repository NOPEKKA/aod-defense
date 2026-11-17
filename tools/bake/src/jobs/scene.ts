/** Background jobs: `scene` bakes a background (layers + meta + preview); `scene_bounds` prints model sizes. */
import * as THREE from 'three';
import { loadProp } from '../assets';
import { bakeScene, getScene, sceneIds, type LayerId, type SpriteAtlas } from '../scene';
import { registerJob } from '../studio';

import.meta.glob('../scenes/*.ts', { eager: true });

registerJob('scene_bounds', async (args, log) => {
  for (const url of args.urls as string[]) {
    const o = await loadProp(url);
    o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o);
    const f = (v: THREE.Vector3): string => `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
    log(`${url.split('/').pop()}  min ${f(b.min)}  max ${f(b.max)}`);
  }
  return [];
});

registerJob('scene_list', async (_a, log) => {
  for (const id of sceneIds()) log(id);
  return [];
});

/** args: { id, passes?, layers?, debug?, sprites?: Record<string, SpriteAtlas> } */
registerJob('scene', async (args, log) => {
  const def = getScene(args.id as string);
  const r = await bakeScene(
    def,
    {
      passes: args.passes as number | undefined,
      layers: args.layers as LayerId[] | undefined,
      debug: args.debug as boolean | undefined,
      sprites: args.sprites as Record<string, SpriteAtlas> | undefined,
    },
    log,
  );
  for (const [k, v] of Object.entries(r.sizes)) log(`  ${k}: ${(v / 1024).toFixed(0)} KB`);
  const tot = Object.entries(r.sizes)
    .filter(([k]) => k.startsWith('hd/'))
    .reduce((a, [, v]) => a + v, 0);
  log(`${def.id}: hd total ${(tot / 1024).toFixed(0)} KB`);
  return r.files;
});
