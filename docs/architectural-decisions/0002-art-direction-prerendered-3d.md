# ADR 0002: Art direction v2 — sprites pre-rendered from 3D models

## Status

accepted (replaces the "bright 2D vector cartoon drawn in code" art decision of ADR-0001; the engine, language and simulation decisions of ADR-0001 stand)

## Date

2026-11-11

## Context

After phase 3 the user compared the game with three screenshots of the original and said it looked nothing like it. The original uses chunky 3D characters pre-rendered into sprites, fighting inside a torch-lit castle courtyard with a smithy, with units spread over a band of depth. Our phase-3 art was flat vector shapes outside a castle. The user asked for graphics and gameplay better than the original, allowed web search and downloads from GitHub, and told us to keep working without stopping for approval at each phase.

Constraints that still hold: Phaser 3 + TypeScript + Vite, 2D runtime, 60 fps on mid-range phones and smooth at 120 Hz, no assets extracted from the original game or film, no API keys in code, private use only.

## Decision

Characters, props, icons and backgrounds are **rendered offline from 3D models into 2D atlases** with our own tool (`tools/bake`, three.js in headless Chrome on the local GPU). The game stays a Phaser 2D game that draws those sprites.

- Models: the CC0 KayKit packs by Kay Lousberg (Adventurers, Skeletons, Dungeon Remastered, Halloween Bits, Medieval Hexagon), downloaded from the author's GitHub account, plus props we build in code (shotgun, chainsaw, bow, horse, siege engines, boss gear). The nine character rigs share one skeleton, so parts and clips are mixed to make each unit.
- Render: accumulation of 32 jittered passes per frame (anti-aliasing, soft shadows, ambient occlusion), Khronos neutral tone mapping, a dark silhouette outline, key light from the side the character faces.
- Output: per sprite, atlases at 1.5x and 1x logical resolution in WebP, a Phaser multiatlas JSON, and a meta file (frame size, anchor, animation table with `hitAt` and `stride`). A manifest indexes everything. Atlases are loaded per wave.
- Layout: side view at a 20 degree pitch, 75 logical px per world unit, three depth rows in the lane, backgrounds baked with the same camera in parallax layers, HUD arranged like the original.

## Consequences

### Positive

- The look matches the original's technique and reads as 3D, at far higher resolution and with better lighting.
- Runtime cost stays that of a 2D sprite game: a handful of draw calls, predictable on phones.
- All art is reproducible from code and CC0 sources; no paid generator, no key, nothing taken from the original.
- New units are mostly data: a base rig, parts, colours, props and a clip table.

### Negative

- Limb animation is frame-based (8 to 14 frames per action), not interpolated.
- Baked images add tens of megabytes to the repository and need per-wave loading and a memory budget.
- Lighting on characters is baked; scene lighting changes are approximated with tints and glow overlays.
- The bake needs Chrome and a GPU on the build machine.

## Alternatives considered

- **Real-time 3D (three.js scene in the game):** dynamic lighting and free animation, but breaks the 2D/Phaser constraint and is a performance risk on phones with 100 skinned characters.
- **Keep the vector art and polish it:** cannot reach the 3D look the user asked for.
- **AI image generation:** needs a paid key, inconsistent between frames, hard to animate.
- **Path-traced bakes:** best lighting, but minutes per sprite; the accumulation rasteriser gets most of the look in seconds.

## Related

- `docs/ART_BIBLE.md`, `tools/bake/README.md`
- `docs/SPEC.md` section "v2"
- Asset licences: `art-src/kaykit/*/LICENSE.txt` (CC0 1.0)
