#!/usr/bin/env python3
"""Contact sheet of every mapped item icon, grouped by section and tier, labelled with the item id (2x).
usage: atlas-review.py out.png    (needs the private Seveneves pack; reads art/icon-map.json)"""
import json, sys, textwrap
from pathlib import Path
from PIL import Image, ImageDraw
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build
ROOT = build.ROOT
mp = json.loads(build.MAPF.read_text())
ids = list(mp['items'])
TIER = {'bronze': 1, 'iron': 1.5, 'steel': 2.5}
MAT = {'bronze': 1, 'pine': 1, 'leather': 1, 'hessian': 1, 'copper': 1, 'iron': 2, 'oak': 2, 'studded': 2, 'linen': 2, 'glowstone': 2,
       'steel': 3, 'yew': 3, 'hardened': 3, 'silk': 3, 'sapphire': 3}
TOOLS = 'pickaxe felling_axe sickle saw chisel awl needle_set gem_file fishing_rod spindle fleshing_scraper smith_hammer rolling_pin bellows mortar'.split()
OUTFIT = [f'{k}_{p}' for k in ('field', 'work', 'craft') for p in ('cap', 'vest', 'smock', 'apron', 'gloves', 'boots')]
FIGHT = ('sword axe dagger spear greatsword mace warhammer halberd scepter parrying_dagger bow staff wand shield tome helm cuirass greaves cap jerkin breeches '
         'hood robe trousers signet band loop pendant torc locket').split()
def split(i):
    m, _, t = i.partition('_')
    return (m, t) if m in MAT else (None, i)
sections = {'Fight': {}, 'Tools': {}, 'Outfit': {}}
other, named_o = [], []
for i in ids:
    m, t = split(i)
    if m and t in TOOLS: sections['Tools'].setdefault(t, {})[MAT[m]] = i
    elif m and t in OUTFIT: sections['Outfit'].setdefault(t, {})[MAT[m]] = i
    elif m and t in FIGHT: sections['Fight'].setdefault(t, {})[MAT[m]] = i
    else: other.append(i)
# named overrides join their type row
OV = {'anglers_hat': ('Outfit', 'field_cap', 1), 'foragers_satchel': ('Outfit', 'field_vest', 1), 'artisans_apron': ('Outfit', 'craft_apron', 1),
      'frostbite_saber': ('Fight', 'sword', 3), 'venomstring_bow': ('Fight', 'bow', 3), 'dawnward_staff': ('Fight', 'staff', 3), 'stoneheart_maul': ('Fight', 'warhammer', 3)}
for k, (s, t, tr) in OV.items():
    if k in other: other.remove(k); sections[s].setdefault(t, {})[tr] = k
cache = {}
def icon(i):
    if i not in cache: cache[i] = build.make_icon(mp['items'][i])[0]
    return cache[i]
BG, FG, Y = (16, 20, 28, 255), (215, 222, 235, 255), (255, 220, 100, 255)
CW, RH = 130, 110
def cell(im, d, x, y, i):
    im.alpha_composite(icon(i).resize((64, 64), Image.NEAREST), (x + 33, y)); lines = textwrap.wrap(i.replace('_', ' '), 20)[:2]
    for k, l in enumerate(lines): d.text((x + 65 - len(l) * 3, y + 66 + k * 10), l, fill=FG)
blocks = []
for sec, rows in sections.items():
    for t, tiers in rows.items(): blocks.append((sec, t, tiers))
COLS = 3; W = COLS * (3 * CW) + 20
nrows_sec = (len(blocks) + COLS - 1) // COLS
OC = 9
other_rows = (len(other) + OC - 1) // OC
H = 30 + nrows_sec * RH + 40 + other_rows * RH + 20
im = Image.new('RGBA', (max(W, OC * CW // 1 + 10), H), BG); d = ImageDraw.Draw(im)
d.text((8, 8), 'Item icons by section; columns per block: T1, T2, T3 (2x). Fight / Tools / Outfit, then materials and consumables.', fill=FG)
y0 = 30
for n, (sec, t, tiers) in enumerate(blocks):
    x = (n % COLS) * 3 * CW + 28; y = y0 + (n // COLS) * RH
    d.text((x, y), f'{sec}: {t}', fill=Y)
    for tr in (1, 2, 3):
        if tr in tiers: cell(im, d, x + (tr - 1) * CW - 20, y + 10, tiers[tr])
y = y0 + nrows_sec * RH + 10
d.text((8, y), 'Materials and consumables', fill=Y); y += 14
for n, i in enumerate(other): cell(im, d, (n % OC) * CW - 20 + 8, y + (n // OC) * RH, i)
im = im.crop((0, 0, im.width, y + other_rows * RH + 6))
im.save(sys.argv[1]); print(im.size, len(ids), 'items')
