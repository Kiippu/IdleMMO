#!/usr/bin/env python3
"""Review sheet: the hero holding each weapon type (T1/T2/T3 look) and each offhand, from the built atlas.  usage: hero-weapons-review.py out.png"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[2]
D = ROOT / 'client' / 'src' / 'scene' / 'art'
man = json.loads((D / 'hero.json').read_text()); atlas = Image.open(D / 'hero.png').convert('RGBA')
UNDER = ['body', 'head', 'boots', 'pants', 'c_shirt', 'hair']
def draw(layers, anim, frame, cx, feet, im):
    for k in layers:
        r = man['layers'].get(k, {}).get(anim)
        if not r: continue
        f = atlas.crop((r['x'] + frame * r['w'], r['y'], r['x'] + (frame + 1) * r['w'], r['y'] + r['h']))
        im.alpha_composite(f, (cx + r['ox'], feet + r['oy']))
def fig(bg, fg, anim, frame, scale=3):
    im = Image.new('RGBA', (96, 80), (26, 33, 45, 255)); draw(bg + UNDER + fg, anim, frame, 48, 70, im) if False else None
    draw(bg, anim, frame, 48, 70, im); draw(UNDER, 'idle', 0, 48, 70, im) if anim == 'idle' else draw(UNDER, anim, frame, 48, 70, im); draw(fg, anim, frame, 48, 70, im)
    return im.resize((96 * scale, 80 * scale), Image.NEAREST)
types = [('sword', 'slash', 0), ('greatsword', 'slash', 0), ('dagger', 'slash', 0), ('axe', 'slash', 0), ('spear', 'slash', 0), ('halberd', 'slash', 0),
         ('mace', 'slash', 0), ('warhammer', 'slash', 0), ('scepter', 'slash', 0), ('wand', 'slash', 0), ('staff', 'cast', 0), ('bow', 'shoot', 3)]
WOOD = {'bow', 'staff', 'wand'}
cells = []
for t, anim, fr in types:
    for tier, mat in enumerate((['pine', 'oak', 'yew'] if t in WOOD else ['bronze', 'iron', 'steel'])):
        if t == 'sword': bg, fg = [f'sword_{mat}_bg'], [f'sword_{mat}_fg']
        else: bg, fg = [f'w_{t}_{mat}_bg'], [f'w_{t}_{mat}_fg']
        cells.append((f'{t} T{tier + 1}', fig(bg, fg, anim, fr)))
for lab, bg, fg in [('shield T1', ['sh_buckler_bg'], ['sh_buckler_fg']), ('shield T2', ['sh_kite_bg'], ['sh_kite_fg']), ('shield T3', ['sh_tower_bg'], ['sh_tower_fg']),
                    ('tome', ['sh_tome_bg'], ['sh_tome_fg']), ('parry dagger', ['w_pd_iron_bg', 'w_pd_iron_fg'], []), ('sword+parry', ['w_pd_iron_bg', 'w_pd_iron_fg', 'sword_iron_bg'], ['sword_iron_fg'])]:
    cells.append((lab, fig(bg, fg, 'slash', 0)))
cols = 6; cw, ch = 96 * 3, 80 * 3 + 16
sheet = Image.new('RGBA', (cols * cw // 2 + 0, ((len(cells) + cols - 1) // cols) * (ch // 2)), (16, 20, 28, 255))
d = ImageDraw.Draw(sheet)
for i, (lab, im) in enumerate(cells):
    sm = im.resize((cw // 2, (ch - 16) // 2), Image.NEAREST)
    x, y = (i % cols) * (cw // 2), (i // cols) * (ch // 2)
    sheet.alpha_composite(sm, (x, y + 12)); d.text((x + 4, y + 1), lab, fill=(255, 220, 100, 255))
sheet.convert('RGB').save(sys.argv[1]); print(sheet.size, len(cells))
