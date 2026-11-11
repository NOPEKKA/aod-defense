// Contact sheets of the source models, to see what the packs contain.
//   node tools/bake/run.mjs --script tools/bake/scripts/sheets.mjs [chars|props|dungeon|halloween|medieval]
export default async ({ run, args, fs, path, root }) => {
  const which = args.length ? args : ['chars'];
  const list = (dir, re) =>
    fs
      .readdirSync(path.join(root, 'art-src', dir))
      .filter((f) => re.test(f))
      .sort()
      .map((f) => `/${dir}/${f}`);
  const label = (url) => url.split('/').pop().replace('.gltf.glb', '').replace('.gltf', '');
  // split into pages that stay under 2000 px so labels are readable
  const pages = async (name, items, cols = 10, cell = 190, per = 60, passes = 12) => {
    for (let p = 0; p * per < items.length; p++) {
      await run('sheet', { items: items.slice(p * per, (p + 1) * per), cols, cell, out: `output/bake/sheet-${name}-${p + 1}.png`, passes });
    }
  };

  if (which.includes('chars')) {
    const adv = ['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded'].map((n) => `/kaykit/adventurers/${n}.glb`);
    const sk = ['Skeleton_Minion', 'Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Rogue'].map((n) => `/kaykit/skeletons/${n}.glb`);
    const items = [];
    for (const url of [...adv, ...sk]) {
      items.push({ url, clip: 'Idle', t: 0.2, label: 'all parts', yaw: 35 });
      items.push({ url, clip: 'Idle', t: 0.2, hands: [], label: 'bare hands', yaw: 35 });
      items.push({ url, clip: 'Walking_A', t: 0.3, hands: [], label: 'walk side', yaw: 60 });
      items.push({ url, clip: '1H_Melee_Attack_Chop', t: 0.45, hands: [], label: 'chop', yaw: 60 });
    }
    await run('sheet', { items, cols: 4, cell: 360, fit: 3.2, out: 'output/bake/sheet-chars.png', passes: 32 });
  }
  if (which.includes('props')) {
    const items = [...list('kaykit/adventurers/props', /\.gltf$/), ...list('kaykit/skeletons/props', /\.gltf$/)].map((url) => ({ url, label: label(url) }));
    await pages('props', items, 9, 210, 54, 16);
  }
  if (which.includes('dungeon')) {
    const all = list('kaykit/dungeon', /\.gltf\.glb$/);
    const skip = /banner_(pattern|thin|triple|shield)|bottle|plate|table_|bed_|trunk|key|stool|chair|shelf|shelves|candle/;
    await pages('dungeon', all.filter((u) => !skip.test(u)).map((url) => ({ url, label: label(url) })));
  }
  if (which.includes('halloween')) {
    await pages('halloween', list('kaykit/halloween', /\.gltf$/).map((url) => ({ url, label: label(url) })));
  }
  if (which.includes('medieval')) {
    const items = [
      ...list('kaykit/medieval/buildings/blue', /\.gltf$/),
      ...list('kaykit/medieval/buildings/neutral', /\.gltf$/),
      ...list('kaykit/medieval/decoration/props', /\.gltf$/),
      ...list('kaykit/medieval/decoration/nature', /\.gltf$/).filter((u) => /cloud|hill|mountain|rock|tree/.test(u)),
    ].map((url) => ({ url, label: label(url) }));
    await pages('medieval', items);
  }
};
