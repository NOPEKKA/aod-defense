// Builds public/assets/manifest.json from the per-asset meta files the bake jobs write:
//   public/assets/sprites/meta/*.json   (one per sprite)
//   public/assets/bg/meta/*.json        (one per background)
//   public/assets/ui/meta/*.json        (icon / UI atlases)
// Run after baking:  node tools/bake/manifest.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const assets = path.join(root, 'public/assets');

function readDir(dir) {
  const full = path.join(assets, dir);
  if (!fs.existsSync(full)) return {};
  const out = {};
  for (const f of fs.readdirSync(full).filter((x) => x.endsWith('.json')).sort()) {
    const meta = JSON.parse(fs.readFileSync(path.join(full, f), 'utf8'));
    out[meta.id ?? f.replace(/\.json$/, '')] = meta;
  }
  return out;
}

const manifest = {
  version: 1,
  /** px of texture per logical px for each quality level */
  scales: { hd: 1.5, sd: 1 },
  sprites: readDir('sprites/meta'),
  backgrounds: readDir('bg/meta'),
  ui: readDir('ui/meta'),
};

// sanity: every page file named by a meta must exist
const problems = [];
for (const [id, m] of Object.entries(manifest.sprites)) {
  for (const [scale, pages] of Object.entries(m.pages ?? {})) {
    const json = path.join(assets, 'sprites', scale, `${id}.json`);
    if (!fs.existsSync(json)) problems.push(`missing ${path.relative(root, json)}`);
    for (let i = 0; i < pages; i++) {
      const ok = ['webp', 'png'].some((ext) => fs.existsSync(path.join(assets, 'sprites', scale, `${id}-${i}.${ext}`)));
      if (!ok) problems.push(`missing page ${i} of ${id} (${scale})`);
    }
  }
}

fs.writeFileSync(path.join(assets, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`manifest: ${Object.keys(manifest.sprites).length} sprites, ${Object.keys(manifest.backgrounds).length} backgrounds, ${Object.keys(manifest.ui).length} ui sets`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
