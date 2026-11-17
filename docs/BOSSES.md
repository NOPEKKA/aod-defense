# BOSSES — pattern sheets

Owner: gameplay. Numbers live in `data/bosses.json` (all [เดา]); code in `src/gameplay/bosses.ts`.
This sheet describes the shipped data; if the two disagree, the data wins.

## How every boss works

- **Loop**: each phase repeats its steps in order: walk / hover until the step is ready → **telegraph** (anim `telegraph:<id>`, the warning is drawn as `world.telegraphs`) → **attack** (anim `attack:<id>`) → recover.
- **Phases** at 66% and 33% HP. On a phase change the running step is cancelled, the boss is invulnerable for 1.5 s (anim `cast:phase`), every live minion is thrown back 220 px, and the new phase's minions are scheduled.
- **Telegraphs** of damaging steps last 0.6 to 1.2 s (checked at boot by `validateData`). Shapes: `band` (ground strip, centre x + full length), `circle` (centre + radius), `line` (aim line, centre + full length), `shadow` (something falling: centre + radius).
- **Dodging**: everything can be avoided by walking out of the marked area before it fires, or by rolling (0.35 s of invulnerability) as it lands / as the front passes. Rolls go *through* moving fronts (towards where they come from); a roll the same way a front travels stays inside it.
- **Book**: bands that reach the book (melee combo, shovel slam, shotgun line) damage it too.
- **Stuns** (Matins Bell, Morwen's flare, Magic Words) pause the loop; Matins Bell tier 2 cancels a step that is still telegraphing.
- Hazards that are already armed keep going while the boss is stunned.

Speeds are px/s. "Ash x" = where Ash stands when the item is armed.

## The Gravewright (wave 10) — `gravewright`

HP 1800, armor 2, speed 40. Drop: relic **Gravedigger's Lantern**, unlocks **Sister Morwen**, 200 gold.

| Phase | Step | Telegraph | Shape | Damage | How to dodge |
|---|---|---|---|---|---|
| 1 | `shovel_slam` | 1.0 s | band 260 in front of him | 28, knockback 60, hits the book | step out of the strip or roll |
| 1 | `grave_hands` | 0.9 s each | 3 circles r 50 at Ash x, 0.45 s apart | 18 + root 1 s | keep walking: each circle is where you were |
| 2 | `burrow` | 2.0 s tracking + 0.8 s | dust follows Ash (260 px/s), then circle r 70 | 35, knockback 80 | walk away once the circle appears, or roll |
| 2 | `shovel_slam` / `grave_hands` | 0.9 s | as phase 1 | as phase 1 | |
| 3 | `coffin_toss` | 0.9 s each | 3 shadows r 60 at Ash x, 0.5 s apart | 30, knockback 40 | keep walking |
| 3 | `shovel_slam` | **0.6 s** | band 260 | 30 | faster: roll or stay out of melee |
| 3 | `burrow` | 1.6 s tracking (300 px/s) + 0.8 s | circle r 70 | 35 | |

Minions: phase 1: 4 skeletons from 4 s; phase 2: 3 skeleton_helm; phase 3: 3 skeleton_spear.
While burrowed he is untargetable and does not block (`telegraph:burrow` = underground, draw only the dust).

## Mother Mire, the Bog Witch (wave 20) — `mother_mire`

HP 2600, armor 1, speed 24 (keeps ~520 px from the front line on ranged steps). Drop: relic **Mire Cauldron Shard**, 300 gold.

| Phase | Step | Telegraph | Shape | Damage | How to dodge |
|---|---|---|---|---|---|
| 1 | `toss_poison` | 1.0 s | 4 shadows r 55 spread 280 around Ash | 16 on landing, then a pool: 8/s for 6 s | walk out; do not stand in pools |
| 1 | `summon` | — | | 3 skeletons | |
| 2 | `mud_wave` | 1.2 s | two bands = danger, the **gap** between them (150 px, near Ash) is safe | 30, wave 380 px/s from her to the castle | stand in the gap, or roll through the front |
| 2 | `toss_poison` | 1.0 s | as phase 1 | | |
| 3 | `steam_beam` | 1.0 s | line over 900 px in front of her | 26 per pass, 3 passes at 520 px/s, width 50 | roll as the beam reaches you (once per pass) |
| 3 | `summon` | — | | 4 skeleton_helm | |
| 3 | `toss_poison` | 1.0 s | 5 shadows spread 320 | 18, pools 9/s | |

Minions: phase 2: 3 skeleton_shield.

## Sir Hollow, the Headless Crusader (wave 30) — `sir_hollow`

HP 3400, armor 4, speed 55. Drop: relic **Hollow Spur**, unlocks **Garrick Hollowbrand**, 400 gold.

| Phase | Step | Telegraph | Shape | Damage | How to dodge |
|---|---|---|---|---|---|
| 1 | `charge` | 1.2 s | band over the whole lane from him to the castle | 40, knockback 120, 900 px/s; **units are knocked away but never killed** (Ash takes full damage) | roll through him as he passes (towards him) |
| 1 | `melee_combo` | 0.7 s | band 110 in front | 2 hits × 24, 0.25 s apart | step back or roll |
| 2 | `throw_head` | 0.9 s, then 0.7 s per bounce | circle r 60 at Ash x, bounces 2× 220 px towards the castle, each bounce re-marked | 30 fire per landing | walk out of each circle |
| 2 | `charge` | 1.2 s | as phase 1, 950 px/s | | |
| 3 | `double_charge` | 1.2 s, then 0.8 s | charges to the castle, turns, charges back; each run marked | 40 each run | two rolls |
| 3 | `throw_head` | as phase 2 | | | |

After a charge he rides back to where he started. Minions: phase 1: 3 skeleton_helm; phase 3: 2 skeleton_knight.

## Abbot Malachar, the Fallen Bishop (wave 40) — `malachar`

HP 4200, armor 3, speed 35. Drop: relic **Censer of Matins**, 500 gold.

| Phase | Step | Telegraph | Shape | Effect | How to stop / dodge |
|---|---|---|---|---|---|
| 1 | `summon` | — | | 4 skeletons | |
| 1 | `raise_dead` | 1.2 s | ritual circle r 160 at him | enemies that died in the last 5 s rise with 50% HP (max 6) | deal **150** damage to him during the ritual to break it (he is stunned 1.5 s) |
| 2 | `black_bell` | 1.0 s each | circle r 600 at him; 3 rings 2.0 s apart expanding at 420 px/s, width 50 | 30, knockback 40 | stay farther than 600, or roll through each ring edge (towards him) |
| 2 | `summon` | — | | 4 skeleton_helm | |
| 2 | `raise_dead` | 1.2 s | | max 6, break 180 | |
| 3 | `float_fireballs` | 0.8 s each | he floats up; 5 shadows r 60 at Ash x, 0.6 s apart | 26 fire | keep walking |
| 3 | `raise_dead` ×2 per loop | 1.0 s | | max 8, break 220, recovers 0.8 s ("twice as fast") | |
| 3 | `black_bell` | 1.0 s | rings at 460 px/s | 30 | |

Minions: phase 1: 2 skeleton_wizard; phase 3: 1 skeleton_knight.

## Evil Ash (wave 50) — `evil_ash`

HP 5000, armor 4, speed 60. Drop: relic **Doppel Boomstick**, unlocks the **Evil Ash** hero, 600 gold.

| Phase | Step | Telegraph | Shape | Damage | How to dodge |
|---|---|---|---|---|---|
| 1 | `shotgun_line` | 0.8 s | aim line 520 px towards the players | 32, knockback 40, hits the book | get beyond 520 px or roll as it fires |
| 1 | `melee_combo` | 0.6 s | band 110 | 3 hits × 24 | step back or roll |
| 2 | `summon` | — | | 5 skeleton_helm | |
| 2 | `ground_wave` (×2 per loop) | 0.9 s | band from him to the castle | 30, front 420/460 px/s, width 60 | roll through the front (towards him) |
| 2 | `melee_combo` | 0.6 s | | | |
| 3 | `drain_book` | 1.0 s (circle at the book) | channel 20 s | the book loses 12 HP/s | deal **400** damage to him while he channels: the channel breaks and he is stunned 1.5 s |
| 3 | `fire_storm` | 0.9 s each | 6 shadows r 60 around Ash (±300), 0.45 s apart | 28 fire | keep walking |
| 3 | `shotgun_line` | 0.8 s | as phase 1 | | |

Minions: phase 1: 4 skeletons; phase 2: 2 skeleton_knight.

## Demon Sheila (wave 45) — `sheila_demon` (one phase, original)

HP 2200, armor 2, flying, speed 70; hovers ~260 px ahead of the front line. Drop: unlocks the **Sheila** hero, 250 gold.

| Step | Telegraph | Shape | Damage | How to dodge |
|---|---|---|---|---|
| `swoop` | 0.8 s + 0.35 s dive | band 260 at the front line | 30 | step out of the band or roll as she lands |
| `summon` | — | | 3 winged_deadite | |
| `scream` | 0.8 s | circle r 300 at her | stun 1.5 s | get out of the circle or roll |

## What render / art needs

- Anims per boss: `idle`, `walk`, `hurt`, `die`, `stunned`, `cast:phase`, and `telegraph:<id>` + `attack:<id>` for every step above.
- Effect entities (`kind: 'effect'`; `defId` = the attack id, sprite key below, `alt` animates falling objects): coffin_toss `rock`, throw_head `fireball`, toss_poison `mana_orb` (tint green) then `fx_poison_pool` (`value` = radius), fire_storm / float_fireballs `fireball`, grave_hands `fx_bone_burst`, burrow tracker `fx_dust_puff`, mud_wave front `fx_smoke_puff`, ground_wave front and black_bell ring `fx_shockwave` (ring: `value` = current radius), steam_beam `fx_holy_beam`. Dedicated art can replace these keys later.
