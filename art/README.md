# Art pipeline

All pixel art is remapped to the DawnBringer 32 palette. Free assets only; every pack goes in `CREDITS.md`
(author, licence, link, share-alike flag, what we changed, date checked).

## Icons: `npm run art`
`scripts/art/build.py` reads `art/icon-map.json` (item id to source cell and tint) and writes
`client/src/art/icons.png` (one 32px-cell atlas) and `client/src/art/icons.json` (manifest).
Crops of every used cell are committed in `art/src/<pack>/`, so the packs are only needed to add a new cell:
set `ART_PACKS` to the folder holding the unzipped packs (default `~/work/packs`).
`python3 scripts/art/build.py --preview out.png` writes a labelled preview; `--check` also fails on gaps in CREDITS.md.

Map entry: `"iron_bar": "iv:iron_ingot"`, `"tin_ore": "iv:silver_ore tint@.8"`.
Prefixes: `sk` Shikashi (`col,row` of the 32px sheet), `ky` Kyrise (`col,row` of the 16px sheet), `nj` Ninja Adventure
(path under `Items/`), `iv` Inventory, `ia` Armory, `is` Arsenal, `ic` Arcanum (file name), `ix` Alchemical Codex (tile number).
`tint` recolours towards the engine item's `tint` hex (`tint=#rrggbb` for another colour, `@n` is the strength 0 to 1).
16px sources are scaled 2x (nearest) and get a 1px dark outline if they have none.
`generic` entries are grey bases per engine sprite kind (the client tints them as a fallback); `named` entries are non-item icons (gold, bond ...).

## Reusing the DB32 remap (scene, UI)
```
python3 scripts/art/remap.py in.png out.png [--alpha-cut 128]
```
or `from scripts.art.remap import remap_image, tint_image, normalise_to_32, DB32` (add `scripts/art` to `sys.path`).
Nearest colour is measured in CIE Lab. Alpha becomes binary (cut 128) unless `alpha_cut=None`.

## Dev helpers
`contact.py sheet.png cell out.png [row0 row1] [scale]` makes a labelled contact sheet of a grid sheet;
`contact_files.py out.png scale files...` does the same for loose files; `dump_items.mjs` lists engine items.
