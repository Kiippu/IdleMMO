#!/usr/bin/env python3
"""Build action backdrops (144x64 native each, stacked into one PNG) from Ninja Adventure tiles (CC0, Pixel-boy and AAA).
usage: build-backdrops.py <Ninja Adventure - Asset Pack dir> <out dir>"""
import sys, os, json, random
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from scenelib import remap_db32

NIN, OUT = sys.argv[1], sys.argv[2]
TS = os.path.join(NIN, 'Backgrounds', 'Tilesets')
W, H, GY = 144, 64, 48          # backdrop size; ground line (feet sit at GY+10)
_cache = {}
def sheet(name):
    if name not in _cache: _cache[name] = Image.open(os.path.join(TS, name)).convert('RGBA')
    return _cache[name]
def tile(name, c, r, w=1, h=1): return sheet(name).crop((c * 16, r * 16, (c + w) * 16, (r + h) * 16))
NAT, HOUSE, FLOOR, WATER, RELIEF = 'TilesetNature.png', 'TilesetHouse.png', 'TilesetFloor.png', 'TilesetWater.png', 'TilesetRelief.png'

def new(): return Image.new('RGBA', (W, H), (0, 0, 0, 0))
def put(im, t, x, y): im.alpha_composite(t, (int(x), int(y)))
def rep(im, t, x0, y0, x1, y1):
    for y in range(y0, y1, t.height):
        for x in range(x0, x1, t.width): put(im, t, x, y)
def rect(im, x0, y0, x1, y1, col):
    Image.Image.paste(im, Image.new('RGBA', (x1 - x0, y1 - y0), col), (x0, y0))
def sky(im, bands=('#639bff', '#5fcde4', '#cbdbfc')):
    for i, c in enumerate(bands): rect(im, 0, i * GY // len(bands), W, (i + 1) * GY // len(bands) + 1, c)
def prop(im, t, cx, ybot): put(im, t, cx - t.width // 2, ybot - t.height)
def grass(im, y0=GY, seed=1):
    rnd = random.Random(seed); base = tile(FLOOR, 3, 12); rep(im, base, 0, y0, W, H)
    for _ in range(14): put(im, tile(FLOOR, rnd.choice([1, 2]), 12), rnd.randrange(0, W - 16), rnd.randrange(y0, H - 8))
def planks_wall(im):
    w = Image.new('RGBA', (W, GY + 2)); rep(w, tile(HOUSE, 23, 13), 0, 0, W, GY + 2)
    from scenelib import mult_tint
    put(im, mult_tint(w, (0.62, 0.55, 0.6)), 0, 0)
    rect(im, 0, GY, W, GY + 2, (34, 32, 52, 255))
def wood_floor(im): rep(im, tile(WATER, 6, 13), 0, GY, W, H)
def shadow(im, cx, y, w=18): rect(im, cx - w // 2, y, cx + w // 2, y + 1, (34, 32, 52, 70))

def mine():
    im = new()
    for ry, r in enumerate((0, 1, 2)):
        for cx in range(0, W, 16): put(im, tile(RELIEF, 4 + (cx // 16) % 3, r), cx, ry * 16)
    rep(im, tile(FLOOR, 14, 16), 0, GY, W, H)
    prop(im, tile(NAT, 17, 5, 3, 3), 112, GY + 6)     # grey boulder = the ore face
    prop(im, tile(NAT, 4, 14, 2, 2), 120, GY + 10); prop(im, tile(NAT, 8, 14, 2, 2), 24, GY + 12)
    prop(im, tile(NAT, 17, 16, 2, 1), 14, GY + 14)
    return im
def forest():
    im = new(); sky(im); grass(im)
    for i, cx in enumerate((8, 40, 74, 104, 134)): prop(im, tile(NAT, 0 if i % 2 == 0 else 2, 0, 2, 2), cx, GY - 2 + (i % 2) * 3)
    prop(im, tile(NAT, 0, 8, 2, 2), 122, GY + 14)
    prop(im, tile(NAT, 0, 10), 20, GY + 14)
    return im
def field():
    im = new(); sky(im, ('#5fcde4', '#cbdbfc', '#cbdbfc')); grass(im, GY - 12, seed=3)
    rnd = random.Random(5)
    for _ in range(18): put(im, tile(NAT, rnd.choice([0, 1, 2, 3, 6, 7]), 11), rnd.randrange(0, W - 16), rnd.randrange(GY - 8, H - 12))
    prop(im, tile(NAT, 6, 8, 2, 2), 8, GY); prop(im, tile(NAT, 0, 0, 2, 2), 130, GY - 4)
    for x in (100, 112, 90): put(im, tile(NAT, 7, 11), x, GY + 2)
    return im
def river():
    im = new(); sky(im, ('#639bff', '#5fcde4', '#cbdbfc'))
    rep(im, tile(FLOOR, 3, 12), 0, 24, W, 34)
    for i, cx in enumerate((10, 50, 96, 132)): prop(im, tile(NAT, 0 if i % 2 else 2, 0, 2, 2), cx, 30)
    rnd = random.Random(2)
    for x in range(0, W, 16):
        for y in range(34, GY + 2, 16): put(im, tile(WATER, 11, rnd.choice([0, 1, 4])), x, y)
    rep(im, tile(WATER, 6, 13), 0, GY + 2, W, H)
    prop(im, tile(NAT, 8, 8, 1, 2), 124, GY + 4); prop(im, tile(NAT, 11, 8, 1, 2), 134, GY + 4)
    prop(im, tile(NAT, 8, 8, 1, 2), 12, GY + 4)
    return im
def forge():
    im = new(); planks_wall(im); wood_floor(im)
    prop(im, tile(HOUSE, 29, 13, 2, 2), 112, GY + 8)  # stone furnace
    prop(im, tile(HOUSE, 29, 15), 28, GY + 12)         # anvil-like iron lump
    prop(im, tile(HOUSE, 18, 14, 1, 2), 12, GY + 8)    # barrel
    put(im, tile(HOUSE, 23, 15), 30, 12)
    return im
def workbench():
    im = new(); planks_wall(im); wood_floor(im)
    prop(im, tile(HOUSE, 31, 15, 2, 1), 112, GY + 6)
    prop(im, tile(HOUSE, 29, 8, 2, 1), 28, GY + 4)
    prop(im, tile(HOUSE, 19, 14, 2, 2), 130, GY + 8)
    put(im, tile(HOUSE, 24, 15), 60, 10); put(im, tile(HOUSE, 23, 15), 84, 10)
    return im
def kitchen():
    im = new(); planks_wall(im); wood_floor(im)
    prop(im, tile(HOUSE, 29, 10, 2, 1), 112, GY + 6)    # counter with pot
    prop(im, tile(HOUSE, 31, 12, 2, 3), 134, GY + 12)   # clay oven with chimney
    prop(im, tile(HOUSE, 18, 11), 20, GY + 6)
    put(im, tile(HOUSE, 31, 10), 30, 24); put(im, tile(HOUSE, 32, 8), 14, 22)
    put(im, tile(HOUSE, 19, 14, 2, 2), 8, GY - 4)
    return im
def alchemy():
    im = new(); planks_wall(im); wood_floor(im)
    prop(im, tile(HOUSE, 32, 10), 112, GY + 8)          # cauldron
    for i, r in enumerate((12, 13, 14, 15)): put(im, tile(HOUSE, 21, r), 8 + (i % 2) * 14, 14 + (i // 2) * 16)
    prop(im, tile(HOUSE, 18, 11), 28, GY + 6); prop(im, tile(HOUSE, 18, 12), 130, GY + 12)
    put(im, tile(HOUSE, 24, 15), 70, 10)
    return im
def combat():
    # calm, dark dusk so pale weapons and armour read; only sparse props at the edges, nothing behind the hero
    im = new(); sky(im, ('#222034', '#3f3f74', '#5b6ee1')); rep(im, tile(FLOOR, 14, 16), 0, GY, W, H)
    from scenelib import mult_tint
    g = new(); rep(g, tile(FLOOR, 14, 16), 0, GY, W, H); put(im, mult_tint(g, (0.55, 0.55, 0.65)), 0, 0)
    for cx in (10, 140): prop(im, mult_tint(tile(NAT, 4, 0, 2, 2), (0.5, 0.5, 0.6)), cx, GY - 2)
    return im
def yard():
    im = new(); sky(im); grass(im, seed=7)
    for i, cx in enumerate((20, 112)): prop(im, tile(NAT, 0, 0, 2, 2), cx, GY + 2)
    prop(im, tile(HOUSE, 19, 14, 2, 2), 28, GY + 12)
    return im

BACKDROPS = dict(mine=mine, forest=forest, field=field, river=river, forge=forge, workbench=workbench, kitchen=kitchen,
                 alchemy=alchemy, combat=combat, yard=yard)
if __name__ == '__main__':
    names = list(BACKDROPS)
    sheet_im = Image.new('RGBA', (W, H * len(names)), (0, 0, 0, 0))
    for i, n in enumerate(names): sheet_im.alpha_composite(BACKDROPS[n](), (0, i * H))
    sheet_im = remap_db32(sheet_im)
    os.makedirs(OUT, exist_ok=True)
    sheet_im.save(os.path.join(OUT, 'backdrops.png'), optimize=True)
    json.dump(dict(w=W, h=H, ground=GY, names=names), open(os.path.join(OUT, 'backdrops.json'), 'w'))
    print('backdrops', sheet_im.size, os.path.getsize(os.path.join(OUT, 'backdrops.png')) // 1024, 'KB')
