// Bake backgrounds, then rebuild the manifest.
//   node tools/bake/run.mjs --script tools/bake/scripts/bake-scenes.mjs courtyard_dusk
//   node tools/bake/run.mjs --script tools/bake/scripts/bake-scenes.mjs --all
// Options: --passes=N (quick looks), --layers=main,front, --debug (anchor markers in the preview)
import { spawnSync } from 'node:child_process';

function atlas(fs, path, root, id) {
  const dir = path.join(root, 'public/assets/sprites/hd');
  const json = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
  const man = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/manifest.json'), 'utf8')).sprites[id];
  const pages = {};
  for (const t of json.textures) pages[t.image] = `data:image/webp;base64,${fs.readFileSync(path.join(dir, t.image)).toString('base64')}`;
  return { meta: { anchorX: man.anchorX, anchorY: man.anchorY, frameW: man.frameW, frameH: man.frameH }, json, pages };
}

export default async ({ run, page, args, root, fs, path }) => {
  const all = await page.evaluate(async () => (await window.__bake.run('scene_list')).log);
  const opt = {};
  const ids = [];
  for (const a of args) {
    if (a === '--all') ids.push(...all);
    else if (a === '--debug') opt.debug = true;
    else if (a.startsWith('--passes=')) opt.passes = Number(a.slice(9));
    else if (a.startsWith('--layers=')) opt.layers = a.slice(9).split(',');
    else if (all.includes(a)) ids.push(a);
    else throw new Error(`unknown scene "${a}" (have: ${all.join(', ')})`);
  }
  if (!ids.length) {
    console.log('scenes:', all.join(', '));
    return;
  }
  const sprites = {};
  for (const id of ['unit_swordsman', 'enemy_skeleton']) {
    try {
      sprites[id] = atlas(fs, path, root, id);
    } catch (e) {
      console.log(`no preview sprite ${id}`);
    }
  }
  for (const id of [...new Set(ids)]) await run('scene', { id, ...opt, sprites });
  const r = spawnSync(process.execPath, ['tools/bake/manifest.mjs'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('manifest build failed');
};
