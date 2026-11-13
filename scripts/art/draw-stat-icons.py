#!/usr/bin/env python3
"""Draws the 16px stat icons the pack lacks into art/src/own/ (own work, DB32 colours, 1px dark outline, lit top-left).
usage: python3 scripts/art/draw-stat-icons.py"""
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[2]
def H(h): return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
K, OUT, ORG, YEL, TAN, BRN, WHT, STEEL, SKY, GRN = (H(x) for x in ('222034', '222034', 'df7126', 'fbf236', 'd9a066', '663931', 'ffffff', '9badb7', '639bff', '6abe30'))
def grid(rows, key):
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in key: im.putpixel((x, y), key[ch])
    return im
def outline(im):
    out = im.copy(); s, d = im.load(), out.load()
    for y in range(16):
        for x in range(16):
            if s[x, y][3]: continue
            if any(0 <= x + a < 16 and 0 <= y + b < 16 and s[x + a, y + b][3] for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))): d[x, y] = K
    return out
def canvas(): return Image.new('RGBA', (16, 16), (0, 0, 0, 0))
def put(im, pts, c):
    for x, y in pts:
        if 0 <= x < 16 and 0 <= y < 16: im.putpixel((x, y), c)
def dilate(pts):
    return {(x + a, y + b) for x, y in pts for a in (-1, 0, 1) for b in (-1, 0, 1)}
# fx_double: two overlapping tokens
double = grid([
    '................', '..oooooo........', '.ooyyyyoo.......', '.oyyttyyo.......', '.oytyyyyo.......', '.oyyyyyyoooooo..', '.oyyyyyoooyyyoo.',
    '..oooooooyyttyo.', '......oyyytyyyo.', '......oyyyyyyyo.', '......oyyyyyyyo.', '.......ooyyyyo..', '.........oooo...', '................', '................', '................',
], dict(o=ORG, y=YEL, t=TAN))
# fx_save: bold steel ingot with a thick green check in front
save = canvas()
for y, (x0, x1) in {3: (4, 11), 4: (3, 12), 5: (2, 13), 6: (2, 13), 7: (2, 13), 8: (2, 13), 9: (2, 13)}.items():
    for x in range(x0, x1 + 1): save.putpixel((x, y), H('696a6a'))
for x in range(4, 12): save.putpixel((x, 3), WHT)
for x in range(3, 13): save.putpixel((x, 4), H('cbdbfc') if x < 9 else STEEL)
for y in range(5, 10): save.putpixel((2, y), STEEL); save.putpixel((3, y), H('847e87'))
for x in range(2, 14): save.putpixel((x, 5), STEEL if x < 12 else H('847e87'))
chk = [(6, 9), (7, 10), (8, 11), (9, 10), (10, 9), (11, 8), (12, 7), (13, 6), (14, 5)]
chk2 = [(x, y + 1) for x, y in chk] + [(x + 1, y) for x, y in chk[:3]]
ring = dilate(chk + chk2)
put(save, ring, K)
put(save, chk2, H('37946e')); put(save, chk, H('99e550'))
# el_holy: sun with halo rays
holy = canvas()
for y in range(16):
    for x in range(16):
        d2 = (x - 7.5) ** 2 + (y - 7.5) ** 2
        if d2 <= 9.5: holy.putpixel((x, y), YEL)
        if d2 <= 9.5 and (x + y) < 14 - 1: holy.putpixel((x, y), H('eec39a')) if d2 <= 3.5 else None
        if d2 <= 9.5 and (x - 7.5) + (y - 7.5) > 1.5: holy.putpixel((x, y), ORG)
rays = [(7, 1), (8, 1), (7, 2), (8, 2), (7, 13), (8, 13), (7, 14), (8, 14), (1, 7), (1, 8), (2, 7), (2, 8), (13, 7), (13, 8), (14, 7), (14, 8),
        (3, 3), (2, 2), (12, 3), (13, 2), (3, 12), (2, 13), (12, 12), (13, 13)]
put(holy, rays, YEL)
# stat_atk: short broad sword at 45 degrees, 2px blade, brass guard, brown grip
atk = canvas()
blade = [(13 - i, 2 + i) for i in range(8)]
put(atk, [(14, 1)], WHT)
put(atk, [(x + 0, y) for x, y in blade], WHT); put(atk, [(x - 1, y) for x, y in blade], H('cbdbfc'))
put(atk, [(x + 1, y) for x, y in blade[2:]], STEEL)
guard = [(4, 8), (5, 9), (6, 10), (7, 11), (8, 12), (5, 8), (6, 9), (7, 10), (8, 11), (9, 12)]
put(atk, guard, YEL); put(atk, [(5, 8), (6, 9)], H('eec39a')); put(atk, [(8, 12), (9, 12)], H('8a6f30'))
put(atk, [(5, 11), (4, 12), (3, 13), (4, 11), (3, 12)], H('8f563b')); put(atk, [(5, 12), (4, 13)], BRN)
put(atk, [(2, 14), (3, 14), (2, 13)], YEL)
rar = grid([
    '................', '.......vv.......', '.......vv.......', '......vwwv......', '......vwwv......', '.....vvwwvv.....', '.vvvvvvwwvvvvvv.', '.vwwwwwwwwwwwwv.',
    '.vwwwwwwwwwwwwv.', '.vvvvvvwwvvvvvv.', '.....vvwwvv.....', '......vwwv......', '......vwwv......', '.......vv.......', '.......vv.......', '................',
], dict(v=H('76428a'), w=H('d77bba')))
for name, im in (('stat_fx_double', double), ('stat_fx_save', save), ('stat_el_holy', holy), ('stat_atk', atk), ('stat_fx_rarity', rar)):
    outline(im).save(ROOT / 'art' / 'src' / 'own' / f'{name}.png')
print('wrote 5 stat icons')
