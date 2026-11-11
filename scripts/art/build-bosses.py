#!/usr/bin/env python3
"""Six boss portraits (Ninja Adventure facesets, CC0) framed consistently into bosses.png (6 x 44x44), DB32.
usage: build-bosses.py <Ninja Adventure - Asset Pack dir> <out dir>"""
import sys, os, json
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from scenelib import remap_db32
NIN, OUT = sys.argv[1], sys.argv[2]
# engine boss order (engine/src/data.ts): id -> (Ninja boss folder, frame accent from the boss palette)
BOSSES = [('ashen_wyrm', 'DragonGreen', '#df7126'), ('rimefang_matriarch', 'DragonBlue', '#639bff'),
          ('blightroot_colossus', 'GiantBamboo', '#6abe30'), ('sunfallen_seraph', 'GiantBlueSamurai', '#fbf236'),
          ('hollow_king', 'TenguBlue', '#76428a'), ('abyssal_leviathan', 'SquidGreen', '#5fcde4')]
S = 44
atlas = Image.new('RGBA', (S * len(BOSSES), S), (0, 0, 0, 0))
for i, (bid, folder, accent) in enumerate(BOSSES):
    f = Image.open(os.path.join(NIN, 'Actor', 'Boss', folder, 'Faceset.png')).convert('RGBA')
    tile = Image.new('RGBA', (S, S), '#222034'); tile.paste(Image.new('RGBA', (S - 2, S - 2), accent), (1, 1))
    tile.paste(Image.new('RGBA', (S - 4, S - 4), '#222034'), (2, 2))
    pad = Image.new('RGBA', (38, 38), '#222034'); pad.alpha_composite(f)
    tile.paste(pad, (3, 3)); atlas.paste(tile, (i * S, 0))
atlas = remap_db32(atlas)
os.makedirs(OUT, exist_ok=True)
atlas.save(os.path.join(OUT, 'bosses.png'), optimize=True)
json.dump(dict(size=S, order=[b[0] for b in BOSSES]), open(os.path.join(OUT, 'bosses.json'), 'w'))
print('bosses', atlas.size, os.path.getsize(os.path.join(OUT, 'bosses.png')) // 1024, 'KB')
