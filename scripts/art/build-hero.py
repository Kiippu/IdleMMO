#!/usr/bin/env python3
"""Build the LPC hero/crew layer atlas for the Workshop scene.
usage: build-hero.py <lpc spritesheets dir> <out dir>
East-facing row only, each (layer, animation) cropped to its own bounding box and shelf-packed into one
PNG (hero.png) + hero.json. Everything is remapped to DawnBringer 32. No scaling."""
import sys, os, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from scenelib import remap_db32, ramp_tint, mult_tint, shelf_pack

SRC, OUT = sys.argv[1], sys.argv[2]
CANVAS = 192
ANIMS = {'idle': (2, 'idle', 3), 'slash': (6, 'slash', 8), 'cast': (7, 'spellcast', 8), 'shoot': (13, 'shoot', 12)}
EAST = 3

def P(*a): return os.path.join(SRC, *a)

def body_paths(base, anim_file): return P(base, anim_file + '.png')

# ---- layer table: key -> {anim: path} (+ optional tint) --------------------------------------------------
def std(base):  # standard LPC layer with one file per animation
    return {a: P(base, ANIMS[a][1] + '.png') for a in ANIMS}

HAIR_HERO = ['#222034', '#45283c', '#663931', '#8f563b']
HAIR_CREW = ['#663931', '#8a6f30', '#d9a066', '#fbf236']
BOOT_HERO = ['#222034', '#45283c', '#663931', '#8f563b']
PANTS_HERO = ['#222034', '#3f3f74', '#306082', '#639bff']
PANTS_CREW = ['#222034', '#324c3a', '#4b692f', '#99e550']
SHIRT_CREW = ['#45283c', '#76428a', '#ac3232', '#d95763']
SKIN_CREW = (0.80, 0.62, 0.52)
CLOTH_HERO = ['#222034', '#3f3f74', '#5b6ee1', '#cbdbfc']

LAYERS = {
  'body': (std('body/bodies/male'), None),
  'head': (std('head/heads/human/male'), None),
  'hair': (std('hair/plain/adult'), ('ramp', HAIR_HERO)),
  'boots': (std('feet/boots/basic/male'), ('ramp', BOOT_HERO)),
  'pants': (std('legs/pants/male'), ('ramp', PANTS_HERO)),
  'legs_plate': (std('legs/armour/plate/male'), None),
  't_plate': (std('torso/armour/plate/male'), None),
  't_chain': (std('torso/chainmail/male'), None),
  't_leather': (std('torso/armour/leather/male'), None),
  't_cloth': (std('torso/clothes/longsleeve/longsleeve2/male'), ('ramp', CLOTH_HERO)),
  'h_kettle': (std('hat/helmet/kettle/adult'), None),
  'h_mail': (std('hat/helmet/mail/adult'), None),
  'h_cap': (std('hat/cloth/leather_cap/adult'), None),
  'h_hood': (std('hat/cloth/hood/adult'), ('ramp', CLOTH_HERO)),
  # crewmate variant (different palette): skin, hair, boots, trousers, shirt
  'c_body': (std('body/bodies/male'), ('mult', SKIN_CREW)),
  'c_head': (std('head/heads/human/male'), ('mult', SKIN_CREW)),
  'c_hair': (std('hair/plain/adult'), ('ramp', HAIR_CREW)),
  'c_boots': (std('feet/boots/basic/male'), ('ramp', BOOT_HERO)),
  'c_pants': (std('legs/pants/male'), ('ramp', PANTS_CREW)),
  'c_shirt': (std('torso/clothes/longsleeve/longsleeve2/male'), ('ramp', SHIRT_CREW)),
}
for mat in ('bronze', 'iron', 'steel', 'gold'):
    for part in ('bg', 'fg'):
        LAYERS[f'sword_{mat}_{part}'] = ({'slash': P(f'weapon/sword/arming/attack_slash/{part}/{mat}.png')}, None)
LAYERS['mace_bg'] = ({'slash': P('weapon/blunt/mace/attack_slash/behind/mace.png')}, None)
LAYERS['mace_fg'] = ({'slash': P('weapon/blunt/mace/attack_slash/mace.png')}, None)
LAYERS['staff_bg'] = ({'cast': P('weapon/magic/simple/background/spellcast/simple.png')}, None)
LAYERS['staff_fg'] = ({'cast': P('weapon/magic/simple/foreground/spellcast/simple.png')}, None)
LAYERS['bow_bg'] = ({'shoot': P('weapon/ranged/bow/normal/universal/background/shoot/normal.png')}, None)
LAYERS['bow_fg'] = ({'shoot': P('weapon/ranged/bow/normal/universal/foreground/shoot/normal.png')}, None)
for t in ('pickaxe', 'axe', 'hammer'):
    for part in ('bg', 'fg'):
        LAYERS[f'{t}_{part}'] = ({'slash': P(f'tools/{t}/{part}.png')}, None)

def row_frames(path, cols):
    im = Image.open(path).convert('RGBA')
    fs = im.width // cols
    assert im.height == fs * 4, (path, im.size, cols)
    frames = []
    for c in range(cols):
        f = im.crop((c * fs, EAST * fs, (c + 1) * fs, (EAST + 1) * fs))
        canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        canvas.paste(f, ((CANVAS - fs) // 2, (CANVAS - fs) // 2))
        frames.append(canvas)
    return frames

def apply_tint(frames, tint):
    if not tint: return frames
    kind, arg = tint
    return [ramp_tint(f, arg) if kind == 'ramp' else mult_tint(f, arg) for f in frames]

# feet anchor: bottom of the body layer, idle frame 0 (192 canvas coords), x centre = 96
bf = row_frames(LAYERS['body'][0]['idle'], 2)[0]
FEET = bf.getbbox()[3]
entries, rects = {}, []
for key, (paths, tint) in LAYERS.items():
    for anim, path in paths.items():
        cols = ANIMS[anim][0]
        frames = remap_db32_frames = [remap_db32(f) for f in apply_tint(row_frames(path, cols), tint)]
        boxes = [f.getbbox() for f in frames if f.getbbox()]
        if not boxes: continue
        x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes); x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
        w, h = x1 - x0, y1 - y0
        entries[(key, anim)] = dict(frames=[f.crop((x0, y0, x1, y1)) for f in frames], w=w, h=h, ox=x0 - 96, oy=y0 - FEET)
        rects.append(((key, anim), w * cols, h))
pos, H = shelf_pack(rects, 1024)
atlas = Image.new('RGBA', (1024, H), (0, 0, 0, 0))
man = {'anims': {a: {'frames': v[0], 'fps': v[2]} for a, v in ANIMS.items()}, 'layers': {}}
for (key, anim), e in entries.items():
    x, y = pos[(key, anim)]
    for i, f in enumerate(e['frames']): atlas.paste(f, (x + i * e['w'], y))
    man['layers'].setdefault(key, {})[anim] = dict(x=x, y=y, w=e['w'], h=e['h'], ox=e['ox'], oy=e['oy'])
# trim atlas height
atlas = atlas.crop((0, 0, 1024, H))
os.makedirs(OUT, exist_ok=True)
atlas.save(os.path.join(OUT, 'hero.png'), optimize=True)
# tallest point above the feet per animation (to size the scene headroom)
man['top'] = {a: -min(v[a]['oy'] for v in man['layers'].values() if a in v) for a in ANIMS}
json.dump(man, open(os.path.join(OUT, 'hero.json'), 'w'), separators=(',', ':'))
print('atlas', atlas.size, os.path.getsize(os.path.join(OUT, 'hero.png')) // 1024, 'KB; top', man['top'], 'feet', FEET)
