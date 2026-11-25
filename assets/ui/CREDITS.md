# UI art and font credits

## UI material kit (`kit/`)

Everything in `kit/` (`kit.webp` atlas, `kit.json`, `parchment.webp`, `wood.webp`,
`leather.webp`) is original procedural art made for this project. Nothing was downloaded
and nothing comes from the original game or the film.

- Generator: `output/ui-tools/gen_kit.py` and `output/ui-tools/mat.py` (Python, numpy and PIL).
  Tileable value-noise fBm, signed-distance shapes and heightmap lighting.
- Contents: vellum, oak, charred wood, oxblood leather, brass and forged-iron plank buttons;
  a leather page binding with iron corner guards; a deckled, scorched sheet edge; iron plaques,
  bar troughs, unit boards, spell rings and a portrait frame; gold and silver coins; red, black
  and gold wax seals; a cloth banner; ink and gold dividers; ink chapter emblems, a skull and a
  compass rose; a chain tile; stars; a soft glow.
- Texture resolution: 2 texture px per logical px.
- Licence: same as the project. The kit is the author's own work.

The icon atlases `hd/`, `sd/` and `meta/` are baked from the project's own 3D renders
(see `tools/bake`). They are not part of this kit.

## Fonts (`public/fonts/`)

All fonts are bundled. None is loaded from the network at runtime.

| Font | Use | Author | Licence | Source |
|---|---|---|---|---|
| Taviraj (Regular, SemiBold, Bold) | body text and UI numerals, Thai and Latin | Cadson Demak | SIL OFL 1.1 (`Taviraj-OFL.txt`) | github.com/google/fonts `ofl/taviraj` |
| Pirata One | Latin headings and logo (blackletter) | Rodrigo Fuenzalida, Nicolas Massi | SIL OFL 1.1, Reserved Font Name "Pirata" (`PirataOne-OFL.txt`) | github.com/google/fonts `ofl/pirataone` |
| Chonburi | Thai headings, and every heading digit | Cadson Demak | SIL OFL 1.1 (`Chonburi-OFL.txt`) | github.com/google/fonts `ofl/chonburi` |
| Kanit | loading text and battle damage numbers (unchanged) | Cadson Demak | SIL OFL 1.1 (`Kanit-OFL.txt`) | already in the project |

The font files are unmodified.
