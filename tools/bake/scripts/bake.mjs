// Bake sprites by id, regex or all, then rebuild the manifest.
//   node tools/bake/run.mjs --script tools/bake/scripts/bake.mjs ash unit_swordsman
//   node tools/bake/run.mjs --script tools/bake/scripts/bake.mjs "re:^enemy_"
//   node tools/bake/run.mjs --script tools/bake/scripts/bake.mjs --all
import { spawnSync } from 'node:child_process';

export default async ({ run, page, args, root }) => {
  const all = await page.evaluate(() => window.__bake.lib.sprite.spriteIds());
  let ids = [];
  for (const a of args) {
    if (a === '--all') ids = all;
    else if (a.startsWith('re:')) ids.push(...all.filter((id) => new RegExp(a.slice(3)).test(id)));
    else if (all.includes(a)) ids.push(a);
    else throw new Error(`unknown sprite "${a}" (have: ${all.join(', ')})`);
  }
  ids = [...new Set(ids)];
  if (ids.length === 0) {
    console.log('sprites:', all.join(', '));
    return;
  }
  const failed = [];
  for (const id of ids) {
    try {
      await run('sprite', { id });
    } catch (err) {
      failed.push(id);
      console.error(`FAILED ${id}: ${String(err).split('\n')[0]}`);
    }
  }
  const r = spawnSync(process.execPath, ['tools/bake/manifest.mjs'], { cwd: root, stdio: 'inherit' });
  if (failed.length) throw new Error(`failed sprites: ${failed.join(', ')}`);
  if (r.status !== 0) throw new Error('manifest build failed');
};
