# Art bake tool

Turns 3D models into the game's 2D art: sprite atlases, icons and backgrounds under `public/assets/`.
It is a dev-only page (three.js) driven by headless Chrome on the machine's real GPU. Nothing here ships in the game bundle.

Read `docs/ART_BIBLE.md` first: it has the look, the roster and the animation table. This file is the how-to.

## Running

```bash
export MSYS_NO_PATHCONV=1          # Git Bash rewrites args that start with "/" otherwise

node tools/bake/run.mjs --script tools/bake/scripts/bake.mjs                 # list sprite ids and icon groups
node tools/bake/run.mjs --script tools/bake/scripts/bake.mjs unit_archer     # bake one sprite
node tools/bake/run.mjs --script tools/bake/scripts/bake.mjs "re:^enemy_"    # bake by regex
node tools/bake/run.mjs --script tools/bake/scripts/bake.mjs icons:allies    # bake one icon group
node tools/bake/run.mjs --script tools/bake/scripts/bake.mjs --all           # everything
node tools/bake/manifest.mjs                                                  # rebuild public/assets/manifest.json only
```

Each sprite takes 2 to 5 seconds. Every bake also writes a preview to `output/bake/preview/<id>.png` (gitignored).
**Look at the preview with the Read tool after every change.** A sprite is not done until you have looked at it.

Port 8090 is used by the bake page. Two bakes cannot run at the same time in one checkout.

## What a bake writes

| File | Contents |
|---|---|
| `public/assets/sprites/hd/<id>-N.webp`, `<id>.json` | atlas pages at 1.5 px per logical px + Phaser multiatlas JSON |
| `public/assets/sprites/sd/...` | the same at 1 px per logical px |
| `public/assets/sprites/meta/<id>.json` | frame size, anchor, height, facing, animation table |
| `public/assets/ui/{hd,sd}/icons_<group>-N.webp`, `.json`, `ui/meta/icons_<group>.json` | icon atlases |
| `public/assets/manifest.json` | index of all meta files; the game loads this first |

Baked files are committed. Frame names are `<anim>/<index>` (for example `walk/3`, `attack:shoot/0`) plus `shadow`.

## Defining a sprite

Put definitions in `src/defs/<your-file>.ts`. Every file in `src/defs/` and `src/jobs/` is loaded automatically.
Each owner edits only their own def files; shared modules (`engine.ts`, `sprite.ts`, `character.ts`, `props.ts`, `icon.ts`, `studio.ts`, `main.ts`) belong to the lead.
If you need a shared change, add a new module next to them (for example `props_enemies.ts`) and report it.

```ts
import { character } from '../character';
import { defineSprite } from '../sprite';
import { definePortrait } from '../icon';

async function buildSpearman() {
  return character({
    base: '/kaykit/adventurers/Knight.glb',   // any of the 9 rigs
    hide: ['Knight_Cape'],                    // nodes to hide
    hands: ['Round_Shield'],                  // built-in hand items to keep (all others hidden)
    recolor: { '0,1': ['#4a86e8', '#1f4396'] },                       // palette cell -> [top, bottom]
    parts: [{ from: '/kaykit/adventurers/Rogue.glb', mesh: 'Rogue_Head', replace: 'Knight_Head' }],
    borrow: [{ from: '/kaykit/skeletons/Skeleton_Warrior.glb', node: 'Skeleton_Warrior_Helmet' }],
    attach: [{ to: 'handslot.r', object: spear(), rot: [0, 0, 0] }],  // your own prop on a bone
    clipsFrom: ['/kaykit/skeletons/Skeleton_Minion.glb'],             // extra animation clips
    scale: 1,                                 // 1 = 165 px tall body. Use this, not heightPx.
    mirror: true,                             // shield on the camera side for an ally facing right
  });
}

defineSprite({
  id: 'unit_spearman',          // must equal the `sprite` key in data/*.json
  facing: 1,                    // 1 = baked facing right (allies), -1 = facing left (enemies)
  build: buildSpearman,
  anims: {
    idle: { clip: '2H_Melee_Idle', frames: 8, loop: true },
    walk: { clip: 'Walking_A', frames: 12, loop: true },
    attack: { clip: '2H_Melee_Attack_Stab', from: 0.2, to: 1.1, frames: 10, duration: 0.6, hitAt: 0.45 },
    hurt: { clip: 'Hit_A', frames: 4, duration: 0.3 },
    die: { clip: 'Death_A', frames: 10, duration: 0.9 },
  },
});
definePortrait('portrait_unit_spearman', 'allies', buildSpearman);
```

`AnimDef` fields: `clip`, `from`/`to` (seconds inside the clip), `frames`, `loop`, `duration` (playback seconds in game),
`hitAt` (0..1, where the hit or shot lands), `apply(built, u, frame)` (your own procedural motion after the clip pose),
`stride` (override the measured walk stride), `clipGround` (hide everything below the ground: rising from a grave).

`SpriteDef` fields: `id`, `build`, `facing`, `yaw` (default 62 degrees: three-quarter profile), `anims`, `shadow` (default true),
`outline` (logical px, default 1.2), `rig` (light overrides), `margin`, `restAnim`.

## The rigs

All nine rigs share one 41-bone skeleton, so skinned parts (`parts`), rigid items (`borrow`) and animation clips (`clipsFrom`) mix freely.

| Rig | Skinned meshes | Rigid items | Notes |
|---|---|---|---|
| `adventurers/Knight.glb` | `Knight_Head` (short blond hair), `Knight_Body`, `Knight_ArmLeft/Right`, `Knight_LegLeft/Right` | `Knight_Helmet`, `Knight_Cape`; hands: `1H_Sword`, `2H_Sword`, `1H_Sword_Offhand`, `Badge_Shield`, `Rectangle_Shield`, `Round_Shield`, `Spike_Shield` | plate armour |
| `adventurers/Barbarian.glb` | `Barbarian_Head` (bald, grey beard), `_Body`, arms, legs | `Barbarian_Hat` (bear), `Barbarian_Cape`; hands: `1H_Axe`, `2H_Axe`, `1H_Axe_Offhand`, `Barbarian_Round_Shield`, `Mug` | fur and leather |
| `adventurers/Mage.glb` | `Mage_Head` (black hair in a bun), `_Body`, arms, legs | `Mage_Hat`, `Mage_Cape`; hands: `Spellbook`, `Spellbook_open`, `1H_Wand`, `2H_Staff` | robe |
| `adventurers/Rogue.glb` | `Rogue_Head` (brown bob), `_Body`, arms, legs | `Rogue_Cape`; hands: `Knife`, `Knife_Offhand`, `1H_Crossbow`, `2H_Crossbow`, `Throwable` | tunic, belt, pouches |
| `adventurers/Rogue_Hooded.glb` | `Rogue_Head_Hooded`, rest as Rogue | as Rogue | hood |
| `skeletons/Skeleton_Minion.glb` | `Skeleton_Minion_Head`, `_Jaw`, `_Eyes`, `_Body`, `_Cloak`, arms, legs | none | plain skeleton |
| `skeletons/Skeleton_Warrior.glb` | as Minion (`Skeleton_Warrior_*`) | `Skeleton_Warrior_Helmet` (horned) | armoured |
| `skeletons/Skeleton_Mage.glb` | `Skeleton_Mage_Skull`, `_Jaw`, `_Eyes`, `_Body`, arms, legs | `Skeleton_Mage_Hat` | robe |
| `skeletons/Skeleton_Rogue.glb` | as Minion (`Skeleton_Rogue_*`) | `Skeleton_Rogue_Hood`, `Skeleton_Rogue_Cape` | hooded |

Bones: `root`, `hips`, `spine`, `chest`, `head`, `upperarm.l/r`, `lowerarm.l/r`, `wrist.l/r`, `hand.l/r`, `handslot.l/r`,
`upperleg.l/r`, `lowerleg.l/r`, `foot.l/r`, `toes.l/r`. GLTFLoader strips the dots (`handslotr`); `byName()` accepts both spellings.

Skeleton rigs have no built-in weapons: attach the props in `skeletons/props/` (`Skeleton_Blade`, `Skeleton_Axe`, `Skeleton_Staff`,
`Skeleton_Crossbow`, `Skeleton_Shield_Large_A/B`, `Skeleton_Shield_Small_A/B`, `Skeleton_Arrow`, `Skeleton_Quiver`).
Adventurer props are in `adventurers/props/` (swords, axes, shields, crossbows, dagger, staff, wand, spellbooks, arrow, quiver, mug, smokebomb).
Scenery packs: `dungeon/` (walls, stairs, torches, banners, barrels, coins...), `halloween/` (bones, skull, coffin, graves, lanterns, pumpkins, dead trees),
`medieval/` (blacksmith, towers, castle, tent, weapon rack, hills, trees, clouds). Contact sheets of all of them: run `scripts/sheets.mjs`.

### Hand slots

Model space: +Z forward, +Y up, +X the character's left. In a hand slot:

- **+Y is the weapon's long axis.** A sword blade or a spear shaft runs along +Y from the grip at the origin.
- **+X is the shooting direction** for the right hand in the ranged clips. A gun or crossbow whose barrel points along its own +Z needs `rot: [0, 90, 0]`.
- Built-in shields sit at `pos: [0, 0.02, 0.16]` in `handslot.l`.

Print the facts for any rig and pose: `node tools/bake/run.mjs --script tools/bake/scripts/slotinfo.mjs /kaykit/adventurers/Rogue.glb Idle:0 1H_Ranged_Shoot:0.35`.

### Which side faces the camera

A character facing right shows its **right** arm to the camera; one facing left shows its **left** arm.
The rigs are right-handed (weapon right, shield left). So:

- Enemies (facing left) show their shield without any change.
- Allies with a shield use `mirror: true`, which swaps left and right: the shield comes to the camera side.
- Ash is mirrored so that the gun is in his left hand and the chainsaw on his right, as designed.

### Animation clips

Adventurers have 76 clips, skeletons 95 (they add `Death_C_Skeletons`, `Spawn_Ground_Skeletons`, `Walking_D_Skeletons`, `Idle_Combat`,
`Taunt`, `Spellcast_Summon`, `1H_Melee_Attack_Jump_Chop`, `Running_C`...). List them:
`node tools/bake/run.mjs --script tools/bake/scripts/slotinfo.mjs /kaykit/skeletons/Skeleton_Minion.glb` prints slots; for clip names and lengths use
the `clips` job, which also renders strips so you can choose by eye:

```bash
node tools/bake/run.mjs clips '{"sprite":"ash","clips":["Dualwield_Melee_Attack_Stab","Throw"],"frames":8,"out":"output/bake/clips-ash.png"}'
node tools/bake/run.mjs clips '{"url":"/kaykit/adventurers/Knight.glb","hands":["2H_Sword"],"clips":["2H_Melee_Attack_Chop","2H_Melee_Attack_Slice"],"out":"output/bake/clips-knight.png"}'
```

Useful families: `Idle`, `2H_Melee_Idle`, `Unarmed_Idle`, `Walking_A/B/C`, `Running_A/B`, `1H_Melee_Attack_Chop/Slice_Diagonal/Slice_Horizontal/Stab`,
`2H_Melee_Attack_Chop/Slice/Spin/Stab`, `Dualwield_Melee_Attack_Chop/Slice/Stab`, `1H_Ranged_Aiming/Shoot/Reload`, `2H_Ranged_Aiming/Shoot/Reload`,
`Block`, `Blocking`, `Block_Attack`, `Block_Hit`, `Spellcast_Shoot/Raise/Long`, `Spellcasting`, `Throw`, `Hit_A/B`, `Death_A/B`, `Dodge_Forward/Backward`,
`Jump_Full_Short/Long`, `Cheer`, `Sit_Chair_Idle`, `Lie_Idle`, `Use_Item`, `Interact`, `PickUp`.

## Recolouring

Each rig has a 1024 px palette texture: an 8 by 4 grid of gradient cells. A mesh maps its UVs into cells.
`node tools/bake/scripts/uvcells.mjs art-src/kaykit/adventurers/Knight.glb` prints which cells each mesh uses.
Look at the texture PNG next to the model to see the colours. `recolor: { 'col,row': '#hex' | ['#top', '#bottom'] }` repaints cells.
A cell is shared by every mesh that uses it, so repainting the Knight's cell `0,1` changes the cape and the red trim together.
`parts` and `attach` take their own `recolor`.

## Your own props

`src/props.ts` has primitives in the pack's look (low-poly, flat-shaded, matte): `box`, `cyl`, `cone`, `sphere`, `torus`, `lathe`, `extrude`,
`group`, `at(obj, x, y, z, rx, ry, rz)`, `mat(color, opts)`, `glow(color, radius)` and the `PAL` colours. Units: 1 = 75 logical px.
Keep a hand-held prop's grip at the origin. Keep props chunky: thin parts vanish at game size.

## Icons and portraits

`definePortrait(id, group, build)` bakes a head-and-shoulders bust. `defineIcon({...})` takes any camera.
Ids: `portrait_<spriteKey>`, `icon_<spellId>` (must equal the `icon` key in `data/spells.json`), `relic_<id>`, `ui_<name>`.
One atlas per `group`, so two owners never write the same file: use your own group names.

## Checklist before you call a sprite done

1. Feet stand on the baseline in `idle`, `walk` and `attack`; nothing is cut off at the frame edge.
2. The silhouette reads at half size: weapon visible, team colour visible, face lit.
3. The frame at `hitAt` is the moment of impact, and the swing starts from the idle pose and returns to it.
4. `walk` loops without a jump between the last and the first frame.
5. `die` ends lying on the ground (or as a pile of bones) and stays inside the frame.
6. The sprite id equals the `sprite` key the game data uses, and `facing` follows the convention.

## Gotchas

- Bash heredocs that contain an apostrophe fail in this environment. Write files with the Write tool.
- `page.evaluate` scripts cannot `import 'three'`; use `window.__bake.lib` (`THREE`, `assets`, `character`, `props`, `sprite`, `icon`, `engine`, `shoot`).
- Negative scale (mirror) is fine; three.js flips the winding for you.
- Transparent glows (`glow()`) work; additive blending does not survive the accumulation pass.
- The key light comes from the side the character faces, so a sprite flipped at runtime still looks right.
