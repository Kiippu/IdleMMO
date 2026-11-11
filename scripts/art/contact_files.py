#!/usr/bin/env python3
"""Dev helper: contact sheet of individual icon files with their names. usage: contact_files.py out.png scale files..."""
import sys, os
from PIL import Image, ImageDraw
out, sc, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
cell = 32 * sc + 4
cols = 7
rows = (len(files) + cols - 1) // cols
o = Image.new('RGBA', (cols * (cell + 40), rows * (cell + 14)), (200, 190, 170, 255))
d = ImageDraw.Draw(o)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGBA')
    im = im.resize((im.width * sc, im.height * sc), Image.NEAREST)
    x, y = (i % cols) * (cell + 40), (i // cols) * (cell + 14)
    o.alpha_composite(im, (x, y + 12))
    d.text((x, y), os.path.basename(f)[:-4], fill=(0, 0, 0, 255))
o.convert('RGB').save(out)
