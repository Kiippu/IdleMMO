#!/usr/bin/env python3
"""Review sheet of the 16px stat/effect/badge icons from the built atlas at 16px (1x, 2x) and 32px, dark and light. usage: stat-icons-review.py out.png"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[2]
D = ROOT / 'client' / 'src' / 'art'
man = json.loads((D / 'icons.json').read_text()); atlas = Image.open(D / 'icons.png').convert('RGBA')
KEYS = ['stat_atk', 'stat_def', 'stat_heal', 'stat_hp', 'el_fire', 'el_frost', 'el_venom', 'el_holy', 'ward', 'fx_speed', 'fx_double', 'fx_save', 'fx_quality', 'fx_find', 'fx_rarity', 'badge_crafted', 'badge_raid', 'badge_starter', 'badge_shop']
def cell(k):
    i = man['named'][k]; c, r = i % man['cols'], i // man['cols']
    return atlas.crop((c * 32, r * 32, c * 32 + 32, r * 32 + 32))
def panel(bg, fg):
    W = 150 + 3 * 100; H = 24 + len(KEYS) * 40
    im = Image.new('RGBA', (W, H), bg); d = ImageDraw.Draw(im); d.text((8, 6), 'key   |  16px at 1x, 2x, and 32px native', fill=fg)
    for n, k in enumerate(KEYS):
        y = 24 + n * 40; d.text((8, y + 14), k, fill=fg)
        c = cell(k); s16 = c.resize((16, 16), Image.NEAREST)
        im.alpha_composite(s16, (160, y + 12))
        im.alpha_composite(s16.resize((32, 32), Image.NEAREST), (260, y + 4))
        im.alpha_composite(c.resize((64, 64), Image.NEAREST), (352, y - 12)) if False else im.alpha_composite(c, (360, y + 4))
    return im
a, b = panel((26, 33, 45, 255), (236, 232, 220, 255)), panel((246, 247, 242, 255), (27, 32, 48, 255))
sheet = Image.new('RGBA', (a.width + b.width, a.height)); sheet.paste(a, (0, 0)); sheet.paste(b, (a.width, 0))
sheet = sheet.resize((sheet.width * 2 // 2, sheet.height), Image.NEAREST)
sheet.convert('RGB').save(sys.argv[1]); print(sheet.size)
