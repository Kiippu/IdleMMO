#!/usr/bin/env python3
"""Guildwright icon atlas pipeline.   npm run art

Reads art/icon-map.json (item id -> source cell + tint), crops the cells from the free packs
(art/src/ holds the committed crops, so packs are only needed when a crop is missing; point ART_PACKS at the
folder that holds the unzipped packs), normalises every icon to 32px (16px sources: nearest x2 + 1px outline when
they lack one), tints, remaps every pixel to DawnBringer 32 and writes
  client/src/art/icons.png   one 32px-cell atlas (indexed PNG, DB32 palette)
  client/src/art/icons.json  manifest: { cell, cols, rows, items:{id:index}, generic:{kind:index},
                             named:{name:index}, pack:{id:packKey} }  (index -> col = i % cols, row = i // cols)

usage: build.py [--preview out.png] [--check] [--inventory] [--map-only]
  --inventory  list usable Seveneves icons per folder (needs the private pack)
  --check   fail if the mapping misses an engine item or CREDITS.md misses a pack that is used
"""
import json, os, re, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from remap import (DB32, remap_image, tint_image, desaturate_image, normalise_to_32)  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PACKS = Path(os.environ.get('ART_PACKS', Path.home() / 'work' / 'packs'))
SRC = ROOT / 'art' / 'src'
# Raw Seveneves pack: private, gitignored (licence forbids redistributing the assets on their own). Override with SEVENEVES_SRC.
SEVENEVES = Path(os.environ.get('SEVENEVES_SRC', ROOT / 'art' / 'private-src' / 'seveneves'))
SV_EXCLUDE_DIRS_PREFIX = ('weapon_',)       # 01-weapons/weapon_NN.png repeat icon_NN.png: use icon_NN only
SV_NEAR_EMPTY = {'06/58', '06/59', '06/72'}  # fewer than 30 opaque pixels
MATF = ROOT / 'art' / 'materials.json'
MAPF = ROOT / 'art' / 'icon-map.json'
OUT_PNG = ROOT / 'client' / 'src' / 'art' / 'icons.png'
OUT_JSON = ROOT / 'client' / 'src' / 'art' / 'icons.json'
COLS = 16

# prefix -> (pack key, folder under packs, credits link used to check CREDITS.md)
PACK = {
    'sk': ('shikashi', 'shikashi', 'shikashipx.itch.io/shikashis-fantasy-icons-pack'),
    'ky': ('kyrise', 'kyrise', 'kyrise.itch.io/kyrises-free-16x16-rpg-icon-pack'),
    'nj': ('ninja', 'ninja', 'pixel-boy.itch.io/ninja-adventure-asset-pack'),
    'iv': ('idylwild-inventory', 'idylwild-inventory', 'idylwild.itch.io/idylwilds-inventory'),
    'ia': ('idylwild-armory', 'idylwild-armory', 'idylwild.itch.io/idylwilds-armory'),
    'is': ('idylwild-arsenal', 'idylwild-arsenal', 'idylwild.itch.io/idylwilds-arsenal'),
    'ic': ('idylwild-arcanum', 'idylwild-arcanum', 'idylwild.itch.io/idylwilds-arcanum'),
    'sv': ('seveneves', 'seveneves', 'sevenevesai.itch.io/1000-modern-rpg-icon-pack'),
    'own': ('own', 'own', 'own work'),
    'ix': ('idylwild-alchemical-codex', 'idylwild-alchemical-codex', 'idylwild.itch.io/idylwilds-alchemical-codex'),
}


def crop_path(src):
    """src: 'sk:c,r' | 'ky:c,r' | 'nj:Items/Resource/Rock.png' | 'iv:name' ... -> committed crop file (made on demand)."""
    pre, ref = src.split(':', 1)
    if pre == 'sv':
        return sv_path(ref)
    if pre == 'own':
        f = SRC / 'own' / (ref if ref.endswith('.png') else ref + '.png')
        if not f.exists():
            raise SystemExit(f'own icon missing: {f}')
        return f
    key = PACK[pre][0]
    safe = re.sub(r'[^A-Za-z0-9_.,-]+', '_', ref).replace(',', '_').replace('.png', '')
    f = SRC / key / f'{safe}.png'
    if f.exists():
        return f
    root = next((p for p in (PACKS / PACK[pre][1]).glob('*')), None) if pre in ('sk', 'ky', 'nj') else PACKS / PACK[pre][1]
    if pre == 'sk':
        im = Image.open(root / '#1 - Transparent Icons.png').convert('RGBA')
        c, r = map(int, ref.split(','))
        out = im.crop((c * 32, r * 32, c * 32 + 32, r * 32 + 32))
    elif pre == 'ky':
        im = Image.open(root / 'spritesheet' / 'spritesheet_16x16.png').convert('RGBA')
        c, r = map(int, ref.split(','))
        out = im.crop((c * 16, r * 16, c * 16 + 16, r * 16 + 16))
    elif pre == 'nj':
        out = Image.open(root / ref).convert('RGBA')
    else:
        name = ref if ref.endswith('.png') else (f'tile{int(ref):03d}' if pre == 'ix' and ref.isdigit() else ref) + '.png'
        out = Image.open(root / name).convert('RGBA')
    f.parent.mkdir(parents=True, exist_ok=True)
    out.save(f, optimize=True)
    return f


def sv_path(ref):
    """'sv:06/14' -> art/private-src/seveneves/06-*/icon_14.png (folder number / icon number)."""
    if ref in SV_NEAR_EMPTY:
        raise SystemExit(f'sv:{ref} is a near-empty icon, pick another')
    if not SEVENEVES.is_dir():
        raise SystemExit(
            f'Seveneves pack not found at {SEVENEVES}.\n'
            'The raw pack is private and never committed. Put the unzipped pack there (16 folders 01-weapons .. 16-runes-enchantments)\n'
            'or set SEVENEVES_SRC. The committed atlas client/src/art/icons.png is still usable; nothing was changed.')
    folder, num = ref.split('/')
    d = next(iter(sorted(SEVENEVES.glob(f'{int(folder):02d}-*'))), None)
    f = d / f'icon_{int(num):02d}.png' if d else None
    if not f or not f.exists():
        raise SystemExit(f'sv:{ref} not found under {SEVENEVES}')
    return f


def material_hex(name):
    fam, _, tier = name.partition('.')
    return json.loads(MATF.read_text())['families'][fam][tier]


def parse_spec(spec, item_tint):
    """'iv:log tint@.8' -> (src, tint_hex|None, strength).  tint = item tint; tint=#hex = explicit; @n = strength."""
    toks = spec.split()
    src, tint, st = toks[0], None, 1.0
    for t in toks[1:]:
        mm = re.match(r'mat=([a-z]+\.[a-z0-9_]+)(?:@([0-9.]+))?$', t)
        if mm:  # material tint: mat=metal.iron@.8 (see art/materials.json)
            tint, st = material_hex(mm.group(1)), float(mm.group(2) or 1.0)
            continue
        m = re.match(r'tint(?:=(#[0-9a-fA-F]{6}))?(?:@([0-9.]+))?$', t)
        if not m:
            raise SystemExit(f'bad token {t!r} in {spec!r}')
        tint = m.group(1) or item_tint
        st = float(m.group(2)) if m.group(2) else 1.0
        if not tint:
            raise SystemExit(f'{spec!r}: no tint available')
    return src, tint, st


def make_icon(spec, item_tint=None, grey=False):
    src, tint, st = parse_spec(spec, item_tint)
    im = normalise_to_32(Image.open(crop_path(src)), False if src.split(':')[0] in ('sv', 'own') else 'auto')
    if tint:
        im = tint_image(im, tint, st)
    if grey:
        im = desaturate_image(im, lift=14)
    return remap_image(im), src


def engine_items():
    """Engine item list. The engine imports extensionless .ts files, so bundle the dump script with esbuild first."""
    import tempfile
    esb = ROOT / 'node_modules' / '.bin' / 'esbuild'
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / 'dump.mjs'
        subprocess.run([str(esb), str(ROOT / 'scripts' / 'art' / 'dump_items.mjs'), '--bundle', '--platform=node', '--format=esm',
                        f'--outfile={out}', '--log-level=error'], check=True)
        res = subprocess.run(['node', str(out)], capture_output=True, text=True, check=True).stdout
    return json.loads(res)


def to_indexed(atlas):
    """RGBA atlas (DB32 colours only) -> palette PNG with index 32 transparent."""
    pal = Image.new('P', atlas.size)
    flat = [c for rgb in DB32 for c in rgb] + [0, 0, 0]
    pal.putpalette(flat + [0] * (768 - len(flat)))
    lut = {rgb: i for i, rgb in enumerate(DB32)}
    px, dst = atlas.load(), pal.load()
    for y in range(atlas.height):
        for x in range(atlas.width):
            r, g, b, a = px[x, y]
            dst[x, y] = lut[(r, g, b)] if a >= 128 else 32
    pal.info['transparency'] = 32
    return pal


def credits_check(packs_used):
    text = (ROOT / 'art' / 'CREDITS.md').read_text().lower()
    missing = [PACK[p][2] for p in packs_used if PACK[p][2].lower() not in text]
    return missing


def sv_inventory():
    """Usable Seveneves icons per folder: no sheets, no weapon_NN repeats, no near-empty (<30 opaque px), no pixel duplicates."""
    import hashlib
    sv_path('01/00')  # fails with the clear message if the pack is missing
    for d in sorted(p for p in SEVENEVES.iterdir() if p.is_dir()):
        seen, skipped = {}, []
        for f in sorted(d.glob('icon_*.png')):
            im = Image.open(f).convert('RGBA')
            if sum(1 for a in im.getchannel('A').tobytes() if a) < 30:
                skipped.append(f.name + ' (near-empty)'); continue
            k = hashlib.md5(im.tobytes()).hexdigest()
            if k in seen:
                skipped.append(f'{f.name} (= {seen[k]})'); continue
            seen[k] = f.name
        print(f'{d.name}: {len(seen)} usable', skipped or '')


def main():
    args = sys.argv[1:]
    if '--inventory' in args:
        return sv_inventory()
    mp = json.loads(MAPF.read_text())
    if '--map-only' in args:   # review builds before the engine data exists: every mapped id, no engine tints
        items = [{'id': k, 'name': k, 'tint': None} for k in mp['items']]
    else:
        items = engine_items()
    ids = [i['id'] for i in items]
    miss = [i for i in ids if i not in mp['items']]
    extra = [i for i in mp['items'] if i not in ids]
    if miss or extra:
        print('mapping missing:', miss, 'unknown ids in mapping:', extra)
        if '--check' in args or miss:
            sys.exit(1)
    cells, manifest = [], {'cell': 32, 'cols': COLS, 'items': {}, 'generic': {}, 'named': {}, 'pack': {}}
    labels = []
    used = set()

    def add(group, key, spec, tint=None, grey=False, label=None):
        im, src = make_icon(spec, tint, grey)
        manifest[group][key] = len(cells)
        cells.append(im)
        labels.append(label or key)
        used.add(src.split(':')[0])
        if group == 'items':
            manifest['pack'][key] = PACK[src.split(':')[0]][0]

    for it in items:
        add('items', it['id'], mp['items'][it['id']], it['tint'])
    for k, spec in mp['generic'].items():
        add('generic', k, spec, None, grey=True, label='g:' + k)
    for k, spec in mp['named'].items():
        add('named', k, spec, None, label='n:' + k)
    rows = (len(cells) + COLS - 1) // COLS
    atlas = Image.new('RGBA', (COLS * 32, rows * 32), (0, 0, 0, 0))
    for i, im in enumerate(cells):
        atlas.alpha_composite(im, ((i % COLS) * 32, (i // COLS) * 32))
    manifest['rows'] = rows
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    to_indexed(atlas).save(OUT_PNG, optimize=True)
    OUT_JSON.write_text(json.dumps(manifest, separators=(',', ':')) + '\n')
    print(f'{len(cells)} icons, atlas {atlas.size}, {OUT_PNG.stat().st_size / 1024:.1f} KB')
    from collections import Counter
    print(Counter(manifest['pack'].values()))
    missing = credits_check(used)
    if missing:
        print('CREDITS.md is missing:', missing)
        if '--check' in args:
            sys.exit(1)
    if '--preview' in args:
        out = Path(args[args.index('--preview') + 1])
        cw, ch, per = 84, 84, 10
        pr = Image.new('RGBA', (per * cw, ((len(cells) + per - 1) // per) * ch), (232, 224, 208, 255))
        d = ImageDraw.Draw(pr)
        for i, im in enumerate(cells):
            x, y = (i % per) * cw, (i // per) * ch
            pr.alpha_composite(im.resize((64, 64), Image.NEAREST), (x + 10, y))
            d.text((x + 1, y + 66), labels[i][:16], fill=(30, 30, 30, 255))
        pr.convert('RGB').save(out)
        print('preview', out, pr.size)


if __name__ == '__main__':
    main()
