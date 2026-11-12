#!/usr/bin/env python3
"""Build the LPC hero/crew layer atlas for the Workshop scene.
usage: build-hero.py <lpc spritesheets dir> <out dir>
East-facing row only, each (layer, animation) cropped to its own bounding box and shelf-packed into one
PNG (hero.png) + hero.json. Everything is remapped to DawnBringer 32. No scaling."""
import sys, os, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from remap import outline_image
from scenelib import remap_db32, ramp_tint, mult_tint, shelf_pack

SRC, OUT = sys.argv[1], sys.argv[2]
CANVAS = 192
ANIMS = {'idle': (2, 'idle', 3), 'slash': (6, 'slash', 8), 'cast': (7, 'spellcast', 8), 'shoot': (13, 'shoot', 12), 'fish': (13, 'thrust', 6)}
FILE_COLS = {'idle': 2, 'slash': 6, 'cast': 7, 'shoot': 13, 'fish': 8}     # columns in the source sheet
FISH_SEQ = [0, 1, 2, 3, 4, 5, 4, 4, 4, 5, 4, 2, 3]                         # LPC tool_rod: thrust frame order (fishing_rod layer is 13 frames)
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
LAYERS['rod_bg'] = ({'fish': P('tools/fishing_rod/bg.png')}, None)
LAYERS['rod_fg'] = ({'fish': P('tools/fishing_rod/fg.png')}, None)
for t in ('pickaxe', 'axe', 'hammer'):
    for part in ('bg', 'fg'):
        LAYERS[f'{t}_{part}'] = ({'slash': P(f'tools/{t}/{part}.png')}, None)

# Offhand shields (bluecarrot16 + Sander Frenken, OGA-BY 3.0). Only slash/cast/shoot/fish (thrust) exist; a shield-only idle holds slash frame 0.
SHIELD_A = ['slash', 'cast', 'shoot', 'fish']
SHIELD_DIR = {'slash': 'slash', 'cast': 'spellcast', 'shoot': 'shoot', 'fish': 'thrust'}
def shield_layers(key, tint, path):
    for part in ('bg', 'fg'):
        LAYERS[f'{key}_{part}'] = ({a: path(part, SHIELD_DIR[a]) for a in SHIELD_A}, tint)
OAK = ['#45283c', '#663931', '#8f563b', '#d9a066']
YEW = ['#222034', '#45283c', '#663931', '#8f563b']
IRON = ['#222034', '#595652', '#847e87', '#cbdbfc']
BRASS = ['#663931', '#8a6f30', '#d9a066', '#fbf236']
DRAKE = ['#222034', '#324c3a', '#37946e', '#99e550']
shield_layers('sh_buckler', None, lambda pt, a: P(f'shield/spartan/{pt}/{a}/spartan.png'))                                   # Pine buckler: round wooden, as drawn
shield_layers('sh_kite', ('dual', OAK, IRON), lambda pt, a: P(f'shield/crusader/{pt}/{a}/crusader.png' if pt == 'bg' else f'shield/crusader/fg/male/{a}/crusader.png'))   # Oak kite
shield_layers('sh_tower', ('dual', YEW, BRASS), lambda pt, a: P(f'shield/plus/{pt}/{a}/plus.png'))                           # Yew tower
shield_layers('sh_aegis', ('ramp', DRAKE), lambda pt, a: P(f'shield/spartan/{pt}/{a}/spartan.png'))                          # Drakescale aegis (round, scale green)

# ---- worn look per weapon type, three material looks each (key w_<type>_<mat>_<bg|fg>); closest LPC layer, recoloured by material ----
# Licences (generator CREDITS.csv, option relied on): longsword OGA-BY 3.0, dagger OGA-BY 3.0, rapier OGA-BY 3.0, mace OGA-BY 3.0,
# wand OGA-BY 3.0, simple staff CC0, bow OGA-BY 3.0+/CC-BY 4.0, hand tools OGA-BY 3.0/CC-BY 4.0. The polearms (spear, halberd), war axe and
# flail are CC-BY-SA/GPL only and are NOT used: spear and halberd borrow the rapier and the pickaxe.
BRONZE_R = ['#45283c', '#8f563b', '#d9a066', '#eec39a']
IRON_R = ['#222034', '#595652', '#847e87', '#cbdbfc']
STEEL_R = ['#222034', '#696a6a', '#9badb7', '#ffffff']
PINE_R = ['#663931', '#8f563b', '#d9a066', '#eec39a']
METAL = {'bronze': BRONZE_R, 'iron': IRON_R, 'steel': STEEL_R}
WOODEN = {'pine': PINE_R, 'oak': OAK, 'yew': YEW}
SHIFT = {}
def wlayers(key, anim, bg, fg, mats, shift=0):
    for mat, ramp in mats.items():
        for part, path in (('bg', bg), ('fg', fg)):
            if path:
                LAYERS[f'w_{key}_{mat}_{part}'] = ({anim: P(path)}, ('ramp', ramp))
                if shift: SHIFT[f'w_{key}_{mat}_{part}'] = shift   # -1 = mirrored (points to the off side), drawn behind the body
wlayers('greatsword', 'slash', 'weapon/sword/longsword/attack_slash/behind/longsword.png', 'weapon/sword/longsword/attack_slash/longsword.png', METAL)
wlayers('dagger', 'slash', 'weapon/sword/dagger/behind/slash/dagger.png', 'weapon/sword/dagger/slash/dagger.png', METAL)
wlayers('spear', 'slash', 'weapon/sword/rapier/attack_slash/behind/rapier.png', 'weapon/sword/rapier/attack_slash/rapier.png', METAL)
wlayers('axe', 'slash', 'tools/axe/bg.png', 'tools/axe/fg.png', METAL)
wlayers('halberd', 'slash', 'tools/pickaxe/bg.png', 'tools/pickaxe/fg.png', METAL)
wlayers('warhammer', 'slash', 'tools/hammer/bg.png', 'tools/hammer/fg.png', METAL)
wlayers('mace', 'slash', 'weapon/blunt/mace/attack_slash/behind/mace.png', 'weapon/blunt/mace/attack_slash/mace.png', METAL)
wlayers('scepter', 'slash', 'weapon/blunt/mace/attack_slash/behind/mace.png', 'weapon/blunt/mace/attack_slash/mace.png', {'bronze': BRASS, 'iron': ['#222034', '#8a6f30', '#d9a066', '#fbf236'], 'steel': ['#3f3f74', '#5b6ee1', '#639bff', '#cbdbfc']})
wlayers('wand', 'slash', None, 'weapon/magic/wand/male/slash/wand.png', {'pine': PINE_R, 'oak': ['#8f563b', '#d9a066', '#eec39a', '#fbf236'], 'yew': ['#5b6ee1', '#639bff', '#5fcde4', '#cbdbfc']})
wlayers('staff', 'cast', 'weapon/magic/simple/background/spellcast/simple.png', 'weapon/magic/simple/foreground/spellcast/simple.png', WOODEN)
wlayers('bow', 'shoot', 'weapon/ranged/bow/normal/universal/background/shoot/normal.png', 'weapon/ranged/bow/normal/universal/foreground/shoot/normal.png', WOODEN)
# offhand parrying dagger: the dagger drawn in front and shifted back, so it reads as held at the off side
wlayers('pd', 'slash', 'weapon/sword/dagger/behind/slash/dagger.png', 'weapon/sword/dagger/slash/dagger.png', METAL, shift=-1)
# offhand tome: no book layer in LPC; the small round shield recoloured as leather-bound board
shield_layers('sh_tome', ('ramp', ['#222034', '#45283c', '#8f563b', '#d9a066']), lambda pt, a: P(f'shield/spartan/{pt}/{a}/spartan.png'))

OUTLINED = {'w', 'sword', 'rod', 'pickaxe', 'axe', 'hammer'}   # 1px dark outline so held tools read on any backdrop

def row_frames(path, cols, row=EAST):
    """First `cols` frames of the east-facing row (frame size = sheet height / 4; wider sheets such as the wand's 13 columns are cut)."""
    im = Image.open(path).convert('RGBA')
    fs = im.height // 4
    assert im.height == fs * 4 and im.width >= fs * cols, (path, im.size, cols)
    frames = []
    for c in range(cols):
        f = im.crop((c * fs, row * fs, (c + 1) * fs, (row + 1) * fs))
        canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        canvas.paste(f, ((CANVAS - fs) // 2, (CANVAS - fs) // 2))
        frames.append(canvas)
    return frames

def dual_tint(img, body, accent):
    """Recolour a heraldic shield: saturated pixels (the cross) take the accent ramp, the rest the body ramp (both by luminance)."""
    a = np.array(img.convert('RGBA')).astype(np.float32)
    mx, mn = a[..., :3].max(-1), a[..., :3].min(-1)
    acc = ((mx - mn) / np.maximum(mx, 1)) > 0.30
    b, c = np.array(ramp_tint(img, body)), np.array(ramp_tint(img, accent))
    out = np.where(acc[..., None], c, b); out[..., 3] = a[..., 3].astype(np.uint8)
    return Image.fromarray(out.astype(np.uint8), 'RGBA')

def apply_tint(frames, tint):
    if not tint: return frames
    kind, *arg = tint
    if kind == 'dual': return [dual_tint(f, *arg) for f in frames]
    return [ramp_tint(f, arg[0]) if kind == 'ramp' else mult_tint(f, arg[0]) for f in frames]

# feet anchor: bottom of the body layer, idle frame 0 (192 canvas coords), x centre = 96
bf = row_frames(LAYERS['body'][0]['idle'], 2)[0]
FEET = bf.getchannel('A').point(lambda v: 255 if v >= 128 else 0).getbbox()[3]
entries, rects = {}, []
for key, (paths, tint) in LAYERS.items():
    for anim, path in paths.items():
        rod = key.startswith('rod_')
        frames = row_frames(path, 13 if rod else FILE_COLS[anim], 0 if key == 'rod_bg' else EAST)   # the rod's bg sheet only fills its first row
        if anim == 'fish' and not rod: frames = [frames[i] for i in FISH_SEQ]
        cols = ANIMS[anim][0]
        frames = apply_tint(frames, tint)
        if key in SHIFT:
            frames = [f.transpose(Image.FLIP_LEFT_RIGHT) for f in frames]
        boxes = [b for b in (f.getchannel('A').point(lambda v: 255 if v >= 128 else 0).getbbox() for f in frames) if b]
        if not boxes: continue
        outl = key.split('_')[0] in OUTLINED
        x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes); x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
        if outl: x0, y0, x1, y1 = max(0, x0 - 1), max(0, y0 - 1), min(CANVAS, x1 + 1), min(CANVAS, y1 + 1)   # room for the outline
        w, h = x1 - x0, y1 - y0
        entries[(key, anim)] = dict(frames=[(outline_image if outl else (lambda im: im))(remap_db32(f.crop((x0, y0, x1, y1)))) for f in frames], w=w, h=h, ox=x0 - 96, oy=y0 - FEET)
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
