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
out = sys.argv[2] if len(sys.argv) > 2 else sys.argv[1]
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

# tab icons from Shikashi (CC BY 4.0), cell = 32px. (col,row). Needs the sheet as argv[1]; with one argument only the rounded frames are redrawn.
sheet = Image.open(sys.argv[1]).convert('RGBA') if len(sys.argv) > 2 else None
cells = dict(workshop=(4, 4), stores=(11, 11), shop=(6, 12), war=(9, 5), crew=(8, 11))
for k, (cx, cy) in (cells.items() if sheet else []):
    ic = sheet.crop((cx * 32, cy * 32, cx * 32 + 32, cy * 32 + 32))
    px = ic.load()
    for y in range(32):
        for x in range(32):
            r, g, b, a = px[x, y]
            px[x, y] = nearest((r, g, b)) + (255,) if a > 127 else (0, 0, 0, 0)
    save(f'tab-{k}', ic)


# ================= Rounded pixel frames (dark + light) =================
# Stepped pixel corners (no anti-aliasing). The ring colours are the nearest DawnBringer 32 colour to the theme token; the fill band
# uses the exact token colour so the frame blends into the CSS background that shows through the transparent centre.
import json
THEMES = {
    'dark': dict(paper='1a212d', sunk='141a24', rule='3a4457', woad='9db1ff', woad_soft='243050', bad='ff7a70', ink='ece8dc'),
    'light': dict(paper='f6f7f2', sunk='ebede5', rule='c6cabe', woad='2a479e', woad_soft='dfe5f5', bad='b3261e', ink='1b2030'),
}
def hx(h): return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
def mix(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def rr_frame(s, ins, layers, bevel=None, fill=None, flip=False, accent=None, top_line=None, top_only=False, h=None, lip=None):
    """9-slice image, band s px wide, transparent centre and transparent corner pixels (stepped, no anti-aliasing).
    ins     corner row insets (6px radius = [4,2,1,1,0,0]).
    layers  colours from the outside in: layers[0] = outer dark line, layers[1] = e.g. the inner rule line (None = skip to bevel).
    bevel   (highlight, shade) applied to the layer after `layers` (lighter on the top/left, darker bottom/right; flip = pressed in).
    fill    the exact token colour for everything deeper. accent = gilt colour for the inner-line pixels in each corner (2-3 px).
    top_line colour of a highlight line along the top edge of the bevel layer (primary button brass line).
    top_only: flush bottom, image height h; lip = colours of the first rows (sheet brass lip)."""
    w = 2 * s + 2
    H = h or w
    def inside(x, y):
        if x < 0 or x >= w or y < 0: return False
        if y >= H: return top_only
        dx = min(x, w - 1 - x)
        dy = y if top_only else min(y, H - 1 - y)
        if dx < len(ins) and dy < ins[dx]: return False
        if dy < len(ins) and dx < ins[dy]: return False
        return True
    # erosion layers: 0 = pixels touching the outside, 1 = touching layer 0, ...
    layer = {}
    pts = [(x, y) for y in range(H) for x in range(w) if inside(x, y)]
    remaining = set(pts); k = 0
    while remaining:
        edge = {p for p in remaining if any(not inside(p[0] + a, p[1] + b) or (p[0] + a, p[1] + b) in layer for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)))}
        if not edge: edge = set(remaining)
        for p in edge: layer[p] = k
        remaining -= edge; k += 1
    nl = len(layers)
    im = Image.new('RGBA', (w, H), (0, 0, 0, 0))
    for (x, y) in pts:
        L = layer[(x, y)]
        from_bottom = 99 if top_only else H - 1 - y
        if min(x, w - 1 - x, from_bottom) >= s and y >= (len(lip) if lip else s): continue   # transparent centre
        low = lambda a, b: layer.get((x + a, y + b), 99) < L or not inside(x + a, y + b) and (x + a, y + b)[1] < H
        if L < nl and layers[L] is not None: c = layers[L]
        elif bevel and L == nl:
            tl = low(0, -1) or low(-1, 0)
            c = bevel[0] if tl != flip else bevel[1]
            if top_line and low(0, -1) and not low(-1, 0) and not low(1, 0): c = top_line
        else: c = fill
        if lip and y < len(lip) and L > 0: c = lip[y]
        if accent and L == nl - 1 and min(x, w - 1 - x) + (y if top_only else min(y, H - 1 - y)) <= 8 and min(x, w - 1 - x) <= 5 and (y if top_only else min(y, H - 1 - y)) <= 5:
            c = accent
        im.putpixel((x, y), c + (255,))
    return im

def build_rounded(outdir):
    for tn, T in THEMES.items():
        td = os.path.join(outdir, 'frames', tn); os.makedirs(td, exist_ok=True)
        pa, su, ru, wo, ws, bad = (hx(T[k]) for k in ('paper', 'sunk', 'rule', 'woad', 'woad_soft', 'bad'))
        light = tn == 'light'
        D = lambda k: C[k]
        def c(h): return PAL[DB32.index(h)]
        white, black = (255, 255, 255), (0, 0, 0)
        def sv(name, im): im.save(os.path.join(td, name + '.png'), optimize=True)
        R6, R5, R4 = [5, 3, 2, 1, 1, 0], [4, 2, 1, 1, 0], [3, 1, 1, 0]
        gilt = c('d9a066')
        if not light:   # all ring colours are DawnBringer 32; fills are the exact dark tokens
            P = dict(out=c('696a6a'), inn=c('3f3f74'), hl=c('323c39'), sh=c('222034'),
                     b_out=c('696a6a'), b_hl=c('323c39'), b_sh=c('222034'),
                     h_out=c('5b6ee1'), h_hl=c('3f3f74'), h_sh=c('222034'),
                     d_out=c('5b6ee1'), d_a=c('222034'), d_b=c('3f3f74'),
                     p_out=c('3f3f74'), p_hl=c('cbdbfc'), p_sh=c('5b6ee1'),
                     x_out=c('ac3232'), x_hl=c('3f3f74'), x_sh=c('222034'),
                     s_out=c('45283c'), s_hl=c('eec39a'), s_sh=c('ac3232'), bar_out=c('3f3f74'), bar_hl=c('323c39'), bar_sh=c('222034'))
        else:
            P = dict(out=c('847e87'), inn=c('9badb7'), hl=c('ffffff'), sh=c('cbdbfc'),
                     b_out=c('847e87'), b_hl=c('ffffff'), b_sh=c('cbdbfc'),
                     h_out=c('5b6ee1'), h_hl=c('ffffff'), h_sh=c('9badb7'),
                     d_out=c('3f3f74'), d_a=c('9badb7'), d_b=c('ffffff'),
                     p_out=c('3f3f74'), p_hl=c('5b6ee1'), p_sh=c('222034'),
                     x_out=c('ac3232'), x_hl=c('ffffff'), x_sh=c('cbdbfc'),
                     s_out=c('45283c'), s_hl=c('d95763'), s_sh=c('663931'), bar_out=c('9badb7'), bar_hl=c('cbdbfc'), bar_sh=c('ffffff'))
        # panels: outer line, inner rule line, bevel, gilt corner accents
        sv('card', rr_frame(6, R6, [P['out'], pa, P['inn']], (P['hl'], P['sh']), pa, accent=gilt))
        sv('sheet', rr_frame(6, R6, [P['out'], pa, P['inn']], (P['hl'], P['sh']), pa, accent=gilt, top_only=True, h=12,
                             lip=[c('222034'), c('d9a066'), c('df7126'), c('8a6f30')]))
        sv('bar', rr_frame(4, R4, [P['bar_out']], (P['bar_sh'], P['bar_hl']) if False else (P['bar_sh'] if light else P['bar_sh'], P['bar_hl']), su))
        # buttons: outer line + 1px bevel
        sv('btn', rr_frame(5, R5, [P['b_out']], (P['b_hl'], P['b_sh']), su))
        sv('btn-hover', rr_frame(5, R5, [P['h_out']], (P['h_hl'], P['h_sh']), ws))
        dn = tuple(round(v * .78) for v in ws)
        sv('btn-down', rr_frame(5, R5, [P['d_out']], (P['d_a'], P['d_b']), dn))
        sv('btn-primary', rr_frame(5, R5, [P['p_out']], (P['p_hl'], P['p_sh']), wo, top_line=c('d9a066')))
        sv('btn-danger', rr_frame(5, R5, [P['x_out']], (P['x_hl'], P['x_sh']), pa))
        sv('btn-danger-solid', rr_frame(5, R5, [P['s_out']], (P['s_hl'], P['s_sh']), bad, top_line=c('d9a066')))
    def spec(sl, wd): return dict(slice=sl, width=wd)
    spec_d = {'card': spec(6, '6px'), 'bar': spec(4, '4px'), 'sheet': spec('6 6 0 6', '6px 6px 0 6px')}
    for k in ('btn', 'btn-hover', 'btn-down', 'btn-primary', 'btn-danger', 'btn-danger-solid'): spec_d[k] = spec(5, '5px')
    for k, v in spec_d.items():
        v['file'] = {t: f'frames/{t}/{k}.png' for t in THEMES}
        v['css'] = (f"border-style: solid; border-color: transparent; border-image-source: url(<file>); border-image-slice: {v['slice']}; "
                    f"border-image-width: {v['width']}; border-image-repeat: stretch; background-clip: padding-box; image-rendering: pixelated;")
    spec_d['_doc'] = ('Rounded pixel frames (6px radius panels, 5px buttons, 4px bar), per theme folder (dark default, light). Centre and corner pixels are '
                      'transparent: no border-radius, set background-clip: padding-box and the background token the frame was drawn for: '
                      'card/sheet/btn-danger --paper, bar/btn --sunk, btn-hover --woad-soft, btn-down --woad-soft darkened 22%, btn-primary --woad, '
                      'btn-danger-solid --bad. Regenerate: python3 scripts/art/ui-frames.py client/src/ui-art')
    with open(os.path.join(outdir, 'frames.json'), 'w') as f: json.dump(spec_d, f, indent=1); f.write('\n')

build_rounded(out)
