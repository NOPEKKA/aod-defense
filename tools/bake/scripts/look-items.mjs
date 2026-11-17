// Contact sheet of the source models the items agent considers using (dev helper).
export default async ({ run }) => {
  const d = (n) => `/kaykit/dungeon/${n}.gltf.glb`;
  const h = (n) => `/kaykit/halloween/${n}.gltf`;
  const a = (n) => `/kaykit/adventurers/props/${n}.gltf`;
  const items = [
    a('spellbook_closed'), a('spellbook_open'), a('arrow'), a('arrow_bundle'), a('quiver'), a('smokebomb'),
    d('coin'), d('coin_stack_large'), d('coin_stack_small'), d('plate_food_A'), d('plate_food_B'), d('keg'),
    d('pillar'), d('column'), d('barrier_column'), d('floor_tile_big_grate'), d('floor_tile_big_grate_open'), d('floor_tile_grate'),
    h('shrine'), h('plaque'), h('pillar'), h('lantern_standing'), h('candle_triple'), h('skull'),
    d('candle_lit'), d('candle_triple'), d('torch_lit'), d('banner_blue'), d('banner_thin_blue'), d('banner_shield_blue'),
    d('bottle_A_brown'), d('bottle_C_green'), d('key'), d('chest_gold'), d('barrel_small'), d('rubble_half'),
  ].map((url) => ({ url }));
  await run('sheet', { items, cols: 6, cell: 300, out: 'output/bake/sheet-look-items.png', passes: 16 });
};
