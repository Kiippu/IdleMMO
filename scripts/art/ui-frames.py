#!/usr/bin/env python3
"""Generates the Phase 3 UI frame 9-slices, the tab bar icons and the app texture.
Frames and texture are drawn here (own art, DawnBringer 32 colours only). Tab icons are cut from Shikashi's
sheet and remapped to DB32 by nearest colour. Usage: ui-frames.py <shikashi sheet png> <out dir>"""
import sys, random
from PIL import Image

DB32 = ['000000','222034','45283c','663931','8f563b','df7126','d9a066','eec39a','fbf236','99e550','6abe30','37946e',
        '4b692f','524b24','323c39','3f3f74','306082','5b6ee1','639bff','5fcde4','cbdbfc','ffffff','9badb7','847e87',
        '696a6a','595652','76428a','ac3232','d95763','d77bba','8f974a','8a6f30']
PAL = [tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) for h in DB32]
C = {k: PAL[DB32.index(v)] for k, v in dict(ink='222034', slate='323c39', grey='696a6a', mist='9badb7', ice='cbdbfc', white='ffffff',
     blue='5b6ee1', sky='639bff', navy='3f3f74', red='ac3232', rose='d95763', tan='d9a066', cream='eec39a', brass='8a6f30',
     green='37946e', orange='df7126', violet='76428a', steel='306082').items()}

def nearest(p):
    return min(PAL, key=lambda q: sum((a - b) ** 2 for a, b in zip(p, q)))

def frame(s, rings, size=None):
    """Square 9-slice with `s` px borders. rings[r] = (top-left colour, bottom-right colour). Corner pixel is chipped."""
    n = size or s * 2 + 2
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    for y in range(n):
        for x in range(n):
            r = min(x, y, n - 1 - x, n - 1 - y)
            if r >= s: continue
            if x == r and y == r or x == n - 1 - r and y == r or x == r and y == n - 1 - r or x == n - 1 - r and y == n - 1 - r:
                if r == 0: continue          # chipped outer corner
            tl = (y == r and x <= n - 1 - r) or (x == r and y <= n - 1 - r)
            c = rings[r][0 if tl else 1]
            im.putpixel((x, y), c + (255,))
    return im

def solid(c): return (c, c)
out = sys.argv[2]
import os; os.makedirs(out, exist_ok=True)
def save(name, im): im.save(f'{out}/{name}.png', optimize=True)

# card: soft outline, white bevel
save('card', frame(2, [solid(C['grey']), (C['white'], C['ice'])]))
# buttons
save('btn', frame(2, [solid(C['slate']), (C['white'], C['mist'])]))
save('btn-hover', frame(2, [solid(C['navy']), (C['white'], C['sky'])]))
save('btn-down', frame(2, [solid(C['slate']), (C['mist'], C['white'])]))
save('btn-primary', frame(2, [solid(C['ink']), (C['sky'], C['navy'])]))
save('btn-danger', frame(2, [solid(C['red']), (C['white'], C['rose'])]))
save('btn-danger-solid', frame(2, [solid(C['ink']), (C['rose'], C['violet'])]))
# slots: dark outline + rarity ring
rar = dict(common=C['grey'], uncommon=C['green'], rare=C['blue'], epic=C['violet'], legendary=C['orange'], mythic=C['red'], none=C['mist'])
for k, v in rar.items(): save(f'slot-{k}', frame(2, [solid(C['ink']), solid(v)]))
save('slot-empty', frame(2, [solid(C['mist']), solid(C['ice'])]))
# bar track
save('bar', frame(2, [solid(C['slate']), (C['grey'], C['white'])]))
# sheet: brass lip on top, thin sides (top 4px source, sides 2px)
n = 12; sh = Image.new('RGBA', (n, n), (0, 0, 0, 0))
rows = [C['ink'], C['tan'], C['brass'], C['cream']]
for y in range(n):
    for x in range(n):
        if y < 4: c = rows[y]
        elif x < 2: c = C['ink'] if x == 0 else C['tan']
        elif x >= n - 2: c = C['ink'] if x == n - 1 else C['tan']
        else: continue
        if y < 4 and (x < 2 or x >= n - 2):
            d = min(x, n - 1 - x)               # distance from the side
            if d == 0 and y == 0: continue
            c = rows[y] if (d >= y or y == 0) else (C['ink'] if d == 0 else C['tan'])
        sh.putpixel((x, y), c + (255,))
save('sheet', sh)

# app background texture: 48x48 tile of sparse 2px specks, low alpha so the plaster token shows through
random.seed(7)
t = Image.new('RGBA', (48, 48), (0, 0, 0, 0))
for _ in range(70):
    x, y = random.randrange(0, 48, 2), random.randrange(0, 48, 2)
    col = (40, 52, 70, 14) if random.random() < .6 else (255, 255, 255, 40)
    for dx in range(2):
        for dy in range(2): t.putpixel((x + dx, y + dy), col)
save('texture', t)

# tab icons from Shikashi (CC BY 4.0), cell = 32px. (col,row)
sheet = Image.open(sys.argv[1]).convert('RGBA')
cells = dict(workshop=(4, 4), stores=(11, 11), shop=(6, 12), war=(9, 5), crew=(8, 11))
for k, (cx, cy) in cells.items():
    ic = sheet.crop((cx * 32, cy * 32, cx * 32 + 32, cy * 32 + 32))
    px = ic.load()
    for y in range(32):
        for x in range(32):
            r, g, b, a = px[x, y]
            px[x, y] = nearest((r, g, b)) + (255,) if a > 127 else (0, 0, 0, 0)
    save(f'tab-{k}', ic)
