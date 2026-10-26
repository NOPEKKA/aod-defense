# AGENTS.md

> Read this file **first**, every session, before doing anything else. Claude users: `CLAUDE.md` points here.

This project follows the [`make-game`](https://github.com/OpusGameLabs/game-creator) pipeline, with the user's own 8-phase brief layered on top (recorded in `docs/STATE.md`). Do not improvise process.

## Project overview

- **Title:** AoD Defense (a personal remake, never published)
- **Pitch:** Ash holds Lord Arthur's castle against 50 waves of Deadites. Walk the lane, collect gold, summon troops with iron, cast Necronomicon spells with mana. There is a boss every 10 waves.
- **Genre / type:** 2D side-view castle defense with light RPG upgrades
- **Engine:** Phaser 3.90.0. Stay on 3.x: the brief says Phaser 3, even though npm `latest` is 4.x.
- **Language:** TypeScript (strict)
- **Target platform:** Browser on desktop and mobile, landscape. LAN only (`npm run dev:lan`). No public deploy.

## Phase gate (the user's brief)

- Work one phase at a time. At the end of each phase: commit, update `docs/STATE.md` (done / remaining / problems), give the user a short report **in Thai**, then **stop and wait for "ไปต่อ"**.
- Never skip a phase.
- Label every guess "เดา". Never invent things silently.
- When a decision is genuinely the user's, ask. Do not pick for them.
- Never use images or sounds extracted from the original game or film.
- Never put an API key in code.

## Source-of-truth files

Read these at session start. Propose changes; do not rewrite them unilaterally.

- `docs/STATE.md`: last handoff, current phase, locked phase-0 answers. Read it first.
- `docs/SPEC.md`: the game definition. It wins over `docs/gameplan.md`, which only points to it.
- `docs/ARCHITECTURE.md`: folder ownership, data flow, fixed timestep, coordinates.
- `src/contracts.ts`: shared types, schemas and events. **Only the lead agent edits it.**
- `docs/tech.md`, `docs/architectural-decisions/`: the stack and locked decisions.
- `reference/NOTES.md`: facts about the original game, with sources.

## Architecture rules

- **Folder ownership:** `systems/`, `controls/`, `render/`, `gameplay/` and `qa/` each have one owner. Never edit another owner's folder. Never import across those folders. Import only `src/contracts.ts` and the pure helpers in `src/core/`.
- **Fixed timestep:** all game logic runs in `SimSystem.tick` at 60 Hz with `SIM_DT`. Nothing may depend on frame count. Render interpolates with `alpha`.
- **Determinism:** the simulation never calls `Math.random()`. Use `ctx.rng`.
- **EventBus:** typed `domain:action` events declared in `GameEvents`. Payloads are always objects.
- **Data-driven:** every number and every piece of content lives in `data/*.json`, validated at boot. New behaviors, effects and attacks are registered in `gameplay/`.
- **Pooling:** entities, projectiles, particles and damage numbers are pooled. Do not allocate in `tick` or `frame`.
- **Coordinates:** logical pixels, 720 tall. Generate textures at `renderScale` and display them at `1/renderScale`. HUD positions come only from `core/layout.ts`.
- **QA hooks:** `window.render_game_to_text()`, `window.advanceTime(ms)`, `window.__aodd`.

## Commands

- **Dev server:** `npm run dev` (http://localhost:8080). Use `npm run dev:lan` to reach it from a phone on home wifi.
- **Tests:** `npm test` (Playwright, using the local Chrome)
- **Typecheck:** `npm run typecheck`
- **Build:** `npm run build`

## Live iterate (after every code change)

1. Typecheck. Then confirm the game boots with no console errors (`npm test -- -g boots`).
2. Read `render_game_to_text()` and check the state matches the change.
3. For anything time-dependent, step with `advanceTime(ms)` and read it again.
4. For anything visual, take a screenshot to `output/` (gitignored).
5. Smoke-check nearby features for regressions.

## Last regenerated

2026-10-26 by Claude (lead), at the end of phase 2.
