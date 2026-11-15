/** Background jobs: `scene` bakes a background (layers + meta + preview); `scene_bounds` prints model sizes. */
import * as THREE from 'three';
import { loadProp } from '../assets';
import { registerJob } from '../studio';

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
