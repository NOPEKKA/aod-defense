// Bake procedural effect sheets, then rebuild the manifest.
//   node tools/bake/run.mjs --script tools/bake/scripts/bake-fx.mjs [fx_id ...]     (no ids = all fx_* sheets)
// Note: fx_deathcoaster is a 3D sprite, baked with scripts/bake.mjs.
import { spawnSync } from 'node:child_process';

export default async ({ run, page, args, root }) => {
  const all = await page.evaluate(async () => (await window.__bake.run('fx-list')).log);
  const ids = args.length ? args : all;
  for (const id of ids) if (!all.includes(id)) throw new Error(`unknown fx "${id}" (have: ${all.join(', ')})`);
  await run('fx', { ids });
  const r = spawnSync(process.execPath, ['tools/bake/manifest.mjs'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('manifest build failed');
};
