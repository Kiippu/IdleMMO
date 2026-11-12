#!/usr/bin/env python3
"""Review sheets for the rounded frames. usage: ui-frames-review.py review.png [mock.png]
review = every frame, dark and light, 1x/2x/3x.  mock = a 360px phone screen (panel with 3 rows, two buttons, a bar) at 1x and 2x."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / 'client' / 'src' / 'ui-art'
SPEC = json.loads((UI / 'frames.json').read_text())
T = {'dark': dict(plaster='10141c', paper='1a212d', sunk='141a24', woad='9db1ff', ws='243050', bad='ff7a70', ink='ece8dc', ink2='b0b5c1', onwoad='0c1121', brass='eec45f', rule='3a4457'),
     'light': dict(plaster='e2e5dc', paper='f6f7f2', sunk='ebede5', woad='2a479e', ws='dfe5f5', bad='b3261e', ink='1b2030', ink2='545b6b', onwoad='ffffff', brass='7e5507', rule='c6cabe')}
hx = lambda h: tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
F = ImageFont.load_default(size=11); FB = ImageFont.load_default(size=14)
def slices(name):
    s = SPEC[name]['slice']; v = [int(x) for x in str(s).split()]
    return tuple(v * 4) if len(v) == 1 else tuple(v)   # t r b l
def frame(theme, name, w, h, fill):
    """Compose like CSS: fill under the padding box, then the 9-slice border over the border box."""
    img = Image.open(UI / SPEC[name]['file'][theme]).convert('RGBA')
    t, r, b, l = slices(name)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(Image.new('RGBA', (w - l - r, h - t - b), fill), (l, t))
    iw, ih = img.size
    xs = [(0, l, 0, l), (l, w - r, l, iw - r), (w - r, w, iw - r, iw)]
    ys = [(0, t, 0, t), (t, h - b, t, ih - b), (h - b, h, ih - b, ih)]
    for dy0, dy1, sy0, sy1 in ys:
        for dx0, dx1, sx0, sx1 in xs:
            if dx1 <= dx0 or dy1 <= dy0 or sx1 <= sx0 or sy1 <= sy0: continue
            out.alpha_composite(img.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.NEAREST), (dx0, dy0))
    return out
def fills(P):
    dn = tuple(round(a * .78) for a in P['ws'][:3]) + (255,)
    return {'btn': P['sunk'], 'btn-hover': P['ws'], 'btn-down': dn, 'btn-primary': P['woad'], 'btn-danger': P['paper'], 'btn-danger-solid': P['bad'], 'card': P['paper'], 'sheet': P['paper'], 'bar': P['sunk']}
TC = {'btn': 'ink2', 'btn-hover': 'woad', 'btn-down': 'woad', 'btn-primary': 'onwoad', 'btn-danger': 'bad', 'btn-danger-solid': 'paper'}
def text_c(d, xy, s, col, font=F, anchor=None):
    d.text(xy, s, fill=col, font=font, anchor=anchor)
def render(theme, scale):
    P = {k: hx(v) for k, v in T[theme].items()}; FL = fills(P)
    W, H = 360, 280
    im = Image.new('RGBA', (W, H), P['plaster']); d = ImageDraw.Draw(im)
    d.text((8, 4), f'{theme} {scale}x', fill=P['ink2'], font=F)
    im.alpha_composite(frame(theme, 'card', 344, 62, FL['card']), (8, 18)); d.text((24, 32), 'Panel text, soft pixel corners', fill=P['ink'], font=F); d.text((24, 50), '14 322 g', fill=P['brass'], font=F)
    im.alpha_composite(frame(theme, 'bar', 344, 14, FL['bar']), (8, 88)); d.rectangle([12, 92, 12 + int(336 * .3), 97], fill=P['woad'])
    im.alpha_composite(frame(theme, 'sheet', 344, 52, FL['sheet']), (8, 110)); d.text((24, 134), 'Sheet title', fill=P['ink'], font=F)
    for i, (nm, lab) in enumerate([('btn', 'BUTTON'), ('btn-hover', 'HOVER'), ('btn-down', 'DOWN'), ('btn-primary', 'PRIMARY'), ('btn-danger', 'DANGER'), ('btn-danger-solid', 'SOLID')]):
        bx, by = 8 + (i % 3) * 116, 172 + (i // 3) * 52
        im.alpha_composite(frame(theme, nm, 108, 44, FL[nm]), (bx, by)); d.text((bx + 54, by + 22), lab, fill=P[TC[nm]], font=F, anchor='mm')
    return im.resize((W * scale, H * scale), Image.NEAREST)
def mock(theme, scale):
    P = {k: hx(v) for k, v in T[theme].items()}; FL = fills(P)
    W, H = 360, 520
    im = Image.new('RGBA', (W, H), P['plaster']); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 44], fill=P['paper']); d.text((16, 22), 'Workshop', fill=P['woad'], font=FB, anchor='lm'); d.text((344, 22), '14 322 g', fill=P['brass'], font=F, anchor='rm')
    im.alpha_composite(frame(theme, 'card', 328, 190, FL['card']), (16, 60))
    d.text((32, 80), 'Crew requests', fill=P['ink'], font=FB)
    for i, (a, b) in enumerate([('Copper bar x10', '60 g'), ('Pine plank x20', '48 g'), ('Linen cloth x5', '35 g')]):
        y = 108 + i * 44
        d.line([(30, y - 6), (330, y - 6)], fill=hx(T[theme]['rule']))
        d.text((32, y + 14), a, fill=P['ink'], font=F, anchor='lm'); d.text((330, y + 14), b, fill=P['brass'], font=F, anchor='rm')
    d.text((16, 262), 'Gathering  64%', fill=P['ink2'], font=F)
    im.alpha_composite(frame(theme, 'bar', 328, 16, FL['bar']), (16, 280)); d.rectangle([20, 284, 20 + int(320 * .3), 291], fill=P['woad'])
    im.alpha_composite(frame(theme, 'btn', 156, 48, FL['btn']), (16, 316)); d.text((94, 340), 'STOP', fill=P['ink2'], font=F, anchor='mm')
    im.alpha_composite(frame(theme, 'btn-primary', 156, 48, FL['btn-primary']), (188, 316)); d.text((266, 340), 'COLLECT', fill=P['onwoad'], font=F, anchor='mm')
    im.alpha_composite(frame(theme, 'btn-danger', 156, 48, FL['btn-danger']), (16, 376)); d.text((94, 400), 'SELL ALL', fill=P['bad'], font=F, anchor='mm')
    im.alpha_composite(frame(theme, 'btn-down', 156, 48, FL['btn-down']), (188, 376)); d.text((266, 400), 'PRESSED', fill=P['woad'], font=F, anchor='mm')
    return im.resize((W * scale, H * scale), Image.NEAREST)
def stack(tiles, cols):
    rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
    Wd = sum(t.width for t in rows[0]); Hd = sum(max(t.height for t in r) for r in rows)
    sh = Image.new('RGBA', (Wd, Hd), (30, 30, 30, 255)); y = 0
    for r in rows:
        x = 0
        for t in r: sh.alpha_composite(t, (x, y)); x += t.width
        y += max(t.height for t in r)
    return sh
if __name__ == '__main__':
    stack([render(t, s) for t in ('dark', 'light') for s in (1, 2, 3)], 3).convert('RGB').save(sys.argv[1])
    if len(sys.argv) > 2:
        d1, l1 = mock('dark', 1), mock('light', 1)
        left = Image.new('RGBA', (360, 1040), (30, 30, 30, 255)); left.alpha_composite(d1, (0, 0)); left.alpha_composite(l1, (0, 520))
        sh = stack([left, mock('dark', 2), mock('light', 2)], 3)
        sh.convert('RGB').save(sys.argv[2])
