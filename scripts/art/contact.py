#!/usr/bin/env python3
"""Dev helper: render a labelled contact sheet of a grid sheet region so cells can be picked by eye.
usage: contact.py sheet.png cell out.png [row0 row1] [scale]
Labels are 'col,row'."""
import sys
from PIL import Image, ImageDraw
src, cell, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
r0 = int(sys.argv[4]) if len(sys.argv) > 4 else 0
r1 = int(sys.argv[5]) if len(sys.argv) > 5 else None
sc = int(sys.argv[6]) if len(sys.argv) > 6 else 2
im = Image.open(src).convert('RGBA')
cols, rows = im.width // cell, im.height // cell
r1 = min(r1 or rows, rows)
pad = 12
cw = cell * sc
W, H = cols * (cw + 2), (r1 - r0) * (cw + pad + 2)
o = Image.new('RGBA', (W, H), (200, 190, 170, 255))
d = ImageDraw.Draw(o)
for r in range(r0, r1):
    for c in range(cols):
        x, y = c * (cw + 2), (r - r0) * (cw + pad + 2)
        t = im.crop((c * cell, r * cell, (c + 1) * cell, (r + 1) * cell)).resize((cw, cw), Image.NEAREST)
        o.alpha_composite(t, (x, y + pad))
        d.text((x + 1, y), f'{c},{r}', fill=(0, 0, 0, 255))
o.convert('RGB').save(out)
print(o.size)
