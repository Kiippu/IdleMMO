#!/usr/bin/env python3
"""Draws the 7 tool icons the Seveneves pack lacks (own work, DB32 colours only) into art/src/own/.
usage: python3 scripts/art/draw-tools.py [out_dir]
Style target: the pack's tools: soft 3 to 4 tone shading lit from the top left, 1px black outline, diagonal pose, ~26px."""
import math, sys
from pathlib import Path
from PIL import Image, ImageDraw

def H(h): return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
BLACK = H('000000')
RAMP = {  # dark -> light, all DB32
    'wood':  [H('45283c'), H('663931'), H('8f563b'), H('d9a066')],
    'red': [H('45283c'), H('ac3232'), H('d95763'), H('d77bba')],
    'steel': [H('323c39'), H('595652'), H('696a6a'), H('9badb7'), H('cbdbfc')],
    'leather': [H('45283c'), H('663931'), H('8f563b'), H('d9a066')],
    'brass': [H('663931'), H('8a6f30'), H('fbf236'), H('eec39a')],
    'stone': [H('595652'), H('847e87'), H('9badb7'), H('cbdbfc')],
    'blue':  [H('3f3f74'), H('306082'), H('5b6ee1'), H('639bff')],
    'gem':   [H('3f3f74'), H('5b6ee1'), H('639bff'), H('5fcde4')],
    'thread': [H('306082'), H('5b6ee1'), H('639bff')],
}
N = 32
def mask(): return Image.new('L', (N, N), 0)
def poly(m, pts): ImageDraw.Draw(m).polygon(pts, fill=255); return m
def seg(m, a, b, w0, w1=None):
    """tapered bar from a to b, widths w0 -> w1 (pixels)."""
    w1 = w0 if w1 is None else w1
    dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L
    pts = [(a[0] + nx * w0 / 2, a[1] + ny * w0 / 2), (b[0] + nx * w1 / 2, b[1] + ny * w1 / 2),
           (b[0] - nx * w1 / 2, b[1] - ny * w1 / 2), (a[0] - nx * w0 / 2, a[1] - ny * w0 / 2)]
    ImageDraw.Draw(m).polygon(pts, fill=255); return m
def ell(m, box): ImageDraw.Draw(m).ellipse(box, fill=255); return m
def sub(a, b):
    a = a.copy(); pa, pb = a.load(), b.load()
    for y in range(N):
        for x in range(N):
            if pb[x, y]: pa[x, y] = 0
    return a

def shade(canvas, m, ramp, bias=0.0, rim=True):
    """Fill mask m on canvas with ramp tones: a smooth top-left to bottom-right gradient across the part, one step lighter
    on top/left edge pixels, one step darker on bottom/right edge pixels."""
    px = m.load(); pts = [(x, y) for y in range(N) for x in range(N) if px[x, y] > 127]
    if not pts: return
    vals = [x * 0.7 + y * 1.0 for x, y in pts]; lo, hi = min(vals), max(vals); span = (hi - lo) or 1
    k = len(ramp)
    def inside(x, y): return 0 <= x < N and 0 <= y < N and px[x, y] > 127
    cp = canvas.load()
    for (x, y), v in zip(pts, vals):
        t = 1 - (v - lo) / span + bias            # 1 = lit
        i = t * (k - 1)
        if rim:
            if not inside(x, y - 1) or not inside(x - 1, y): i += 0.8
            if not inside(x, y + 1) or not inside(x + 1, y): i -= 0.8
        cp[x, y] = ramp[max(0, min(k - 1, int(round(i))))]

def outline(canvas):
    out = canvas.copy(); s, d = canvas.load(), out.load()
    for y in range(N):
        for x in range(N):
            if s[x, y][3]: continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if 0 <= x + dx < N and 0 <= y + dy < N and s[x + dx, y + dy][3]:
                    d[x, y] = BLACK; break
    return out

def px_set(canvas, pts, col):
    p = canvas.load()
    for x, y in pts:
        if 0 <= x < N and 0 <= y < N and p[x, y][3]: p[x, y] = col

def new(): return Image.new('RGBA', (N, N), (0, 0, 0, 0))

def sickle():
    c = new()
    handle = seg(mask(), (4, 27), (14, 17), 4, 4)
    shade(c, handle, RAMP['wood'])
    ferr = seg(mask(), (13.5, 17.5), (16, 15), 4, 4); shade(c, ferr, RAMP['brass'])
    outer = ell(mask(), (8, 1, 31, 23)); inner = ell(mask(), (13, 7, 32, 27))
    blade = sub(outer, inner)
    keep = mask(); poly(keep, [(12, 0), (32, 0), (32, 17), (22, 17), (12, 18), (11, 8)])
    px, kp = blade.load(), keep.load()
    for y in range(N):
        for x in range(N):
            if not kp[x, y]: px[x, y] = 0
    shade(c, blade, RAMP['steel'], bias=0.15)
    return outline(c)

def bellows():
    c = new()
    nozzle = seg(mask(), (19, 12), (29, 4), 4, 3); shade(c, nozzle, RAMP['steel'])
    tip = seg(mask(), (28, 5), (30, 3), 2.5, 2.5); shade(c, tip, RAMP['steel'], bias=-0.2)
    # leather body: wide wedge, with folds
    body = poly(mask(), [(4, 17), (18, 10), (22, 15), (8, 24)])
    shade(c, body, RAMP['leather'])
    px_set(c, [(7, 19), (8, 18), (9, 18), (11, 16), (12, 15), (14, 14), (15, 13), (9, 21), (10, 20), (12, 19), (13, 18), (15, 17), (16, 16)], RAMP['leather'][0])
    top = poly(mask(), [(3, 14), (17, 7), (20, 10), (6, 18)]); shade(c, top, RAMP['wood'])
    bot = poly(mask(), [(7, 24), (21, 17), (24, 21), (10, 29)]); shade(c, bot, RAMP['wood'])
    handle = seg(mask(), (3, 15), (0.5, 12), 2.5, 2.5); shade(c, handle, RAMP['wood'], rim=False)
    studs = [(5, 16), (15, 9), (9, 26), (22, 19)]
    px_set(c, studs, RAMP['steel'][3])
    return outline(c)

def chisel():
    c = new()
    handle = seg(mask(), (5, 28), (13, 20), 5, 5); shade(c, handle, RAMP['wood'])
    cap = seg(mask(), (3.5, 29.5), (5.5, 27.5), 5.5, 5.5); shade(c, cap, RAMP['steel'], bias=-0.1)
    ferr = seg(mask(), (12.5, 20.5), (15, 18), 5, 5); shade(c, ferr, RAMP['brass'])
    blade = seg(mask(), (15, 18), (28, 5), 3.4, 5.4); shade(c, blade, RAMP['steel'])
    return outline(c)

def needle():
    c = new()
    n = seg(mask(), (5, 28), (25, 8), 2.6, 1.8); shade(c, n, RAMP['steel'], rim=False, bias=0.2)
    n2 = seg(mask(), (9, 29), (19, 19), 2, 1.5); shade(c, n2, RAMP['steel'], rim=False, bias=-0.1)
    ear = ell(mask(), (22, 4, 28, 10)); shade(c, ear, RAMP['steel'], rim=False, bias=0.25)
    ImageDraw.Draw(ear).ellipse((24, 6, 26, 8), fill=0)
    cp, ep = c.load(), ear.load()
    for y in range(N):
        for x in range(N):
            if ep[x, y] == 0 and 22 <= x <= 28 and 4 <= y <= 10 and (x - 25) ** 2 + (y - 7) ** 2 <= 9: cp[x, y] = (0, 0, 0, 0)
    # thread through the eye, loose end curling down
    th = [(25, 7), (26, 8), (27, 10), (27, 12), (26, 14), (25, 16), (23, 18), (22, 20), (22, 22), (23, 24), (25, 25), (27, 25)]
    q = c.load()
    for x, y in th: q[x, y] = RAMP['thread'][2]
    for x, y in th[3:]: 
        if y + 1 < N: q[x, y + 1] = RAMP['thread'][1]
    pad = ell(mask(), (2, 19, 13, 29)); shade(c, pad, RAMP['red'], bias=0.1)
    px_set(c, [(5, 21), (6, 21)], RAMP['red'][3])
    n3 = seg(mask(), (6, 26), (11, 21), 1.8, 1.4); shade(c, n3, RAMP['steel'], rim=False, bias=0.1)
    return outline(c)

def gem_file():
    c = new()
    handle = seg(mask(), (3, 29), (11, 21), 4.5, 4.5); shade(c, handle, RAMP['wood'])
    ferr = seg(mask(), (10.5, 21.5), (13, 19), 5, 5); shade(c, ferr, RAMP['brass'])
    fl = seg(mask(), (13, 19), (27, 5), 5, 3.4); shade(c, fl, RAMP['steel'])
    # teeth: diagonal ticks across the file body
    for i in range(14, 27, 2):
        px_set(c, [(i, 32 - i - 8 + 0), (i + 1, 32 - i - 9 + 0)], RAMP['steel'][1])
    # small cut gem resting at the lower right
    gem = poly(mask(), [(19, 21), (23, 18), (28, 21), (25, 28), (21, 28)]); shade(c, gem, RAMP['gem'])
    px_set(c, [(22, 20), (23, 20), (22, 21)], H('cbdbfc'))
    return outline(c)

def mortar():
    c = new()
    pest = seg(mask(), (15, 15), (27, 3), 5, 7); shade(c, pest, RAMP['stone'])
    knob = ell(mask(), (23, 1, 30, 8)); shade(c, knob, RAMP['stone'], bias=0.1)
    bowl = ell(mask(), (3, 13, 30, 31)); keep = mask(); poly(keep, [(0, 19), (32, 19), (32, 32), (0, 32)])
    bp, kp = bowl.load(), keep.load()
    for y in range(N):
        for x in range(N):
            if not kp[x, y]: bp[x, y] = 0
    shade(c, bowl, RAMP['stone'], bias=0.05)
    rim = ell(mask(), (3, 14, 30, 24)); shade(c, rim, RAMP['stone'], rim=True, bias=0.2)
    mouth = ell(mask(), (6, 16, 27, 22))
    cp, mp = c.load(), mouth.load()
    for y in range(N):
        for x in range(N):
            if mp[x, y]: cp[x, y] = RAMP['stone'][0] if y < 20 else RAMP['stone'][1]
    foot = seg(mask(), (11, 30), (22, 30), 3, 3)
    pest2 = seg(mask(), (15, 15), (24, 6), 5, 6.5); shade(c, pest2, RAMP['stone'])
    shade(c, knob, RAMP['stone'], bias=0.1)
    return outline(c)

def rolling_pin():
    c = new()
    body = seg(mask(), (9, 23), (22, 10), 9, 9); shade(c, body, RAMP['wood'], bias=0.05)
    h1 = seg(mask(), (9, 23), (3, 29), 3.2, 3.2); shade(c, h1, RAMP['wood'], rim=True, bias=-0.1)
    h2 = seg(mask(), (22, 10), (28, 4), 3.2, 3.2); shade(c, h2, RAMP['wood'], rim=True, bias=0.1)
    k1 = ell(mask(), (1, 27, 6, 31)); shade(c, k1, RAMP['wood'], bias=-0.1)
    k2 = ell(mask(), (26, 1, 31, 6)); shade(c, k2, RAMP['wood'], bias=0.2)
    # grain lines
    px_set(c, [(12, 16), (13, 15), (15, 17), (16, 16), (11, 19), (12, 18), (17, 12), (18, 11), (14, 20), (15, 19)], RAMP['wood'][1])
    return outline(c)

def awl():
    c = new()
    handle = ell(mask(), (2, 20, 14, 31)); shade(c, handle, RAMP['wood'], bias=0.05)
    grip = seg(mask(), (8, 24), (14, 18), 5, 4); shade(c, grip, RAMP['wood'])
    ferr = seg(mask(), (13, 19), (15.5, 16.5), 3.6, 3.2); shade(c, ferr, RAMP['brass'])
    spike = seg(mask(), (15.5, 16.5), (28, 4), 2.8, 0.8); shade(c, spike, RAMP['steel'], rim=False, bias=0.2)
    return outline(c)

def fishing_rod():
    c = new()
    rod = seg(mask(), (4, 28), (27, 5), 3.6, 2.2); shade(c, rod, RAMP['wood'], bias=0.05)
    grip = seg(mask(), (3, 29), (10, 22), 4.6, 4.6); shade(c, grip, RAMP['leather'], bias=-0.05)
    reel = ell(mask(), (10, 19, 17, 26)); shade(c, reel, RAMP['steel'], bias=0.1)
    px_set(c, [(13, 22), (14, 22), (13, 23)], RAMP['steel'][0])
    q = c.load()
    for x, y in [(27, 5), (28, 6), (29, 8), (29, 10), (29, 12), (29, 14), (28, 16)]: q[x, y] = RAMP['thread'][2]
    for x, y in [(28, 17), (27, 18), (27, 19), (28, 19)]: q[x, y] = RAMP['steel'][3]
    return outline(c)

TOOLS = {'fishing_rod': fishing_rod, 'awl': awl, 'sickle': sickle, 'bellows': bellows, 'chisel': chisel, 'needle_set': needle, 'gem_file': gem_file,
         'mortar_pestle': mortar, 'rolling_pin': rolling_pin}

if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / 'art' / 'src' / 'own'
    out.mkdir(parents=True, exist_ok=True)
    for k, fn in TOOLS.items():
        fn().save(out / f'tool_{k}.png', optimize=True)
    print('wrote', len(TOOLS), 'icons to', out)
