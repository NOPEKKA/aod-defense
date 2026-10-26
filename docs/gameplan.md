# AoD Defense (personal remake)

This file exists because the make-game skill expects it. **The source of truth is [`SPEC.md`](SPEC.md).** If the two ever disagree, SPEC.md wins, and this file should be updated to point at it rather than duplicate it.

## Pitch
Ash holds Lord Arthur's castle against 50 waves of Deadites: walk the lane, collect gold, summon troops with iron, cast Necronomicon spells with mana. Boss every 10 waves. See SPEC §0.

## Core gameplay loop
SPEC §1.

## Game rules
SPEC §3 (systems), §4 (allies), §5 (enemies), §6 (new content).

## Win / lose conditions
Win a wave by clearing every scheduled enemy. Lose if Ash dies or the Necronomicon reaches 0 HP. SPEC §1.1.

## Art style
Bright 2D cartoon, big heads, thick outlines, vector drawn in code and baked to texture atlases. Detail in `docs/ART_BIBLE.md` (phase 6). SPEC §0.

## Audio direction
Open question (SPEC §10 item 3).

## Player goals
Per session: clear the next wave. Long term: clear wave 50, collect every boss relic, push Endless.

## Anti-goals
SPEC §0.

## References
`reference/NOTES.md` (Army of Darkness: Defense, Backflip Studios, 2011).

## Open questions
SPEC §10.
