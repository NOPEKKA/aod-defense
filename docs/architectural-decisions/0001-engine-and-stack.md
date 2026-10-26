# ADR 0001: Engine, stack, simulation model and art pipeline

## Status

accepted

## Date

2026-10-26

## Context

The project is a personal remake of a 2011 2D side-view castle-defense game. It has to run in desktop and mobile browsers in landscape. It must render smoothly at 120 Hz while still playing correctly at 60 Hz. All game content has to live in JSON so new content needs no code changes. The user's brief fixes the stack as Phaser 3 + TypeScript + Vite, and phase 3 relies on four agents working in parallel against a shared contract. Phaser 4 (4.2.1) is the current npm `latest`, but the brief says Phaser 3, and the installed game-creator `phaser` skill documents Phaser 3 patterns.

## Decision

- Use Phaser 3 (the latest 3.x at scaffold time), TypeScript and Vite. Test with Playwright.
- Game logic runs on a fixed 60 Hz timestep. Rendering interpolates between ticks, and the frame rate follows the display refresh rate, with an optional 60 fps cap.
- Every piece of content (heroes, troops, enemies, bosses, spells, levels, balance, text) lives in schema-validated JSON under `data/`. Content is built from behaviors registered in code.
- Art is a bright 2D cartoon style, drawn as vector in code and baked to texture atlases. No image-generation API.

## Consequences

### Positive

- Gameplay is deterministic and testable through `advanceTime`, so QA bots and balance runs give the same result at 60 and 120 Hz.
- Content can be added by editing JSON.
- Art needs no paid keys, stays crisp at any DPI, and the atlases keep draw calls low on phones.
- Folder ownership plus `contracts.ts` lets four agents work in parallel.

### Negative

- Interpolation adds a "previous state" copy for every moving entity.
- Phaser's arcade physics stepping must be either kept off the sim path or driven by our own fixed step.
- Vector-in-code art caps how detailed things can look, compared with painted art.
- Staying on Phaser 3 means missing Phaser 4's renderer improvements.

## Alternatives considered

- **Phaser 4:** It is newer, but the brief names Phaser 3 and the skills target 3. The user can switch it on request (SPEC §10 item 7).
- **Variable timestep (delta-scaled):** It is simpler, but it drifts between 60 and 120 Hz and breaks deterministic QA. Rejected by the brief.
- **AI-generated or pixel art:** It needs a paid key or hand pixel work, and was not chosen in phase 0.

## Related

- `docs/SPEC.md` §8 (performance) and §9 (data)
- `reference/NOTES.md`
