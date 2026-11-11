#!/usr/bin/env python3
"""Fight-scene foes: one left-facing 4-frame idle row (16x16) per Ninja Adventure Actor/Monster sprite (CC0), DB32.
usage: build-foes.py <Ninja Adventure - Asset Pack dir> <out dir>"""
import sys, os, json
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from scenelib import remap_db32
NIN, OUT = sys.argv[1], sys.argv[2]
MON = os.path.join(NIN, 'Actor', 'Monster')
# engine fight action id -> (Ninja Monster folder, sheet file)
FOES = {
  'fight_wolfwood': ('Beast', 'Beast'), 'fight_ridge': ('Beast2', 'Beast2'), 'fight_hollow': ('SpiderRed', 'SpriteSheet'),
  'fight_bearclaw': ('Bear', 'SpriteSheet'), 'fight_drakemire': ('Dragon', 'SpriteSheet'),
  'fight_quarry_road': ('Mouse', 'SpriteSheet'), 'fight_palisade': ('Racoon', 'SpriteSheet'), 'fight_ironhide': ('Panda', 'SpriteSheet'),
  'fight_golems': ('Cyclope', 'SpriteSheet'), 'fight_roost': ('DragonYellow', 'SpriteSheet'),
  'fight_shrine': ('Spirit', 'SpriteSheet'), 'fight_marsh': ('LanternGreen', 'SpriteSheet'), 'fight_spire': ('Spirit2', 'SpriteSheet'),
  'fight_chapel': ('KappaGreen', 'SpriteSheet'), 'fight_barrow': ('Skull', 'SpriteSheet'),
}
DEFAULT = ('Slime', 'Slime')     # any other foe
rows = list(dict.fromkeys(list(FOES.values()) + [DEFAULT]))
atlas = Image.new('RGBA', (64, 16 * len(rows)), (0, 0, 0, 0))
for r, (d, f) in enumerate(rows):
    im = Image.open(os.path.join(MON, d, f + '.png')).convert('RGBA')
    for k in range(4): atlas.alpha_composite(im.crop((32, k * 16, 48, k * 16 + 16)), (k * 16, r * 16))   # column 2 = facing left
atlas = remap_db32(atlas)
os.makedirs(OUT, exist_ok=True)
atlas.save(os.path.join(OUT, 'foes.png'), optimize=True)
json.dump(dict(map={a: rows.index(v) for a, v in FOES.items()}, default=rows.index(DEFAULT), frames=4, size=16), open(os.path.join(OUT, 'foes.json'), 'w'))
print('foes', atlas.size, os.path.getsize(os.path.join(OUT, 'foes.png')) // 1024, 'KB')
