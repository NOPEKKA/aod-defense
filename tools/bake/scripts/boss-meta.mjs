// After baking bosses: write "scale" (display multiplier) into each boss sprite meta JSON.
//   node tools/bake/scripts/boss-meta.mjs
// Keep the factors in sync with BOSS_SCALE in tools/bake/src/defs/bosses.ts.
import fs from 'node:fs';
const F = { boss_sheila_demon: 0.9, boss_evil_ash: 0.82, boss_gravewright: 0.7, boss_mother_mire: 0.8, boss_sir_hollow: 0.88, boss_malachar: 0.75 };
for (const [id, f] of Object.entries(F)) {
  const p = `public/assets/sprites/meta/${id}.json`;
  if (!fs.existsSync(p)) continue;
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (f === 1) delete m.scale;
  else m.scale = +(1 / f).toFixed(4);
  fs.writeFileSync(p, JSON.stringify(m, null, 1));
  console.log(id, 'scale', m.scale ?? 1);
}
