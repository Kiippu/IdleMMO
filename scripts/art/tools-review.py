#!/usr/bin/env python3
"""Review sheet: our drawn tools beside pack tools at 2x.  usage: tools-review.py out.png"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw
sys.path.insert(0, str(Path(__file__).resolve().parent))
from remap import remap_image
ROOT = Path(__file__).resolve().parents[2]
SV = ROOT / 'art' / 'private-src' / 'seveneves'
def sv(f, n):
    d = next(SV.glob(f'{f:02d}-*')); return Image.open(d / f'icon_{n:02d}.png').convert('RGBA')
def pad(im):
    c = Image.new('RGBA', (32, 32), (0, 0, 0, 0)); c.alpha_composite(im, ((32 - im.width) // 2, (32 - im.height) // 2)); return c
pack = [('pickaxe', sv(6, 14)), ('hammer', sv(6, 67)), ('saw', sv(6, 78)), ('rod', sv(6, 61)), ('spools', sv(13, 31)), ('felling axe', sv(1, 4))]
own = [(p.stem[5:], Image.open(p).convert('RGBA')) for p in sorted((ROOT / 'art' / 'src' / 'own').glob('tool_*.png'))]
rows = [('pack', pack), ('ours', own)]
im = Image.new('RGBA', (8 * 80 + 10, 2 * 2 * 80 + 60), (16, 20, 28, 255)); d = ImageDraw.Draw(im)
y = 10
for lab, items in rows:
    d.text((6, y), lab, fill=(255, 220, 100, 255))
    for i, (n, ic) in enumerate(items):
        x = 6 + (i % 8) * 80; yy = y + 14
        a = pad(remap_image(ic)).resize((64, 64), Image.NEAREST); im.alpha_composite(a, (x, yy)); d.text((x, yy + 66), n[:13], fill=(215, 222, 235, 255))
    y += 100
# big zoom of ours
y += 4
d.text((6, y), 'ours at 4x', fill=(255, 220, 100, 255)); y += 14
im2 = Image.new('RGBA', (8 * 144 + 10, im.height + 160), (16, 20, 28, 255)); im2.alpha_composite(im, (0, 0)); d = ImageDraw.Draw(im2)
for i, (n, ic) in enumerate(own):
    im2.alpha_composite(pad(ic).resize((128, 128), Image.NEAREST), (6 + i * 144, y))
im2.crop((0, 0, im2.width, y + 140)).save(sys.argv[1])
