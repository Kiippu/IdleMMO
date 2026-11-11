#!/usr/bin/env python3
"""DawnBringer 32 remap + small pixel-art helpers (importable and CLI).

CLI:   python3 scripts/art/remap.py in.png out.png [--alpha-cut 128]
Python: from remap import remap_image, tint_image, outline_image, DB32

Every opaque pixel is replaced by the nearest DB32 colour measured in CIE Lab (a perceptual space), so
shading keeps its look. Alpha is made binary (>= cut -> opaque, else transparent) because pixel art
should not have soft edges; pass alpha_cut=None to keep alpha untouched.
"""
import sys
from functools import lru_cache
from PIL import Image

DB32_HEX = ('000000 222034 45283c 663931 8f563b df7126 d9a066 eec39a fbf236 99e550 6abe30 37946e '
            '4b692f 524b24 323c39 3f3f74 306082 5b6ee1 639bff 5fcde4 cbdbfc ffffff 9badb7 847e87 '
            '696a6a 595652 76428a ac3232 d95763 d77bba 8f974a 8a6f30').split()
DB32 = [tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) for h in DB32_HEX]
OUTLINE = DB32[1]  # 222034, the dark outline colour


def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _unlin(c):
    c = max(0.0, min(1.0, c))
    v = 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    return int(round(v * 255))


def rgb_to_lab(rgb):
    r, g, b = (_lin(x) for x in rgb)
    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
    y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def lab_to_rgb(lab):
    L, a, b = lab
    fy = (L + 16) / 116
    fx, fz = fy + a / 500, fy - b / 200
    inv = lambda t: t ** 3 if t ** 3 > 0.008856 else (t - 16 / 116) / 7.787
    x, y, z = inv(fx) * 0.95047, inv(fy), inv(fz) * 1.08883
    r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z
    g = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z
    bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z
    return (_unlin(r), _unlin(g), _unlin(bl))


_DB32_LAB = [rgb_to_lab(c) for c in DB32]


@lru_cache(maxsize=None)
def nearest_db32(rgb):
    """Nearest DB32 colour (as an RGB tuple) to rgb, by Euclidean distance in Lab."""
    l = rgb_to_lab(rgb)
    best = min(range(32), key=lambda i: sum((l[k] - _DB32_LAB[i][k]) ** 2 for k in range(3)))
    return DB32[best]


def remap_image(im, alpha_cut=128):
    im = im.convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if alpha_cut is not None:
                if a < alpha_cut:
                    px[x, y] = (0, 0, 0, 0)
                    continue
                a = 255
            elif a == 0:
                continue
            px[x, y] = nearest_db32((r, g, b)) + (a,)
    return im


def is_outline_px(rgb):
    return rgb_to_lab(rgb)[0] < 22


def tint_image(im, tint_hex, strength=1.0):
    """Recolour towards tint_hex keeping the shading: lightness is shifted so the sprite's average
    lightness matches the tint's, chroma/hue is blended towards the tint. Dark outline pixels are kept.
    The result should be passed through remap_image afterwards."""
    im = im.convert('RGBA')
    px = im.load()
    t = rgb_to_lab(tuple(int(tint_hex.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)))
    body = [rgb_to_lab(px[x, y][:3]) for y in range(im.height) for x in range(im.width)
            if px[x, y][3] and not is_outline_px(px[x, y][:3])]
    if not body:
        return im
    mean_l = sum(p[0] for p in body) / len(body)
    # Pull the base's lightness part of the way to the tint's so very light/dark bases still read as the tint.
    shift = (t[0] - mean_l) * strength
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a or is_outline_px((r, g, b)):
                continue
            L, A, B = rgb_to_lab((r, g, b))
            L2 = max(8.0, min(98.0, L + shift))
            # keep some of the original chroma variation, scaled by how much lightness moved
            A2 = A * (1 - strength) + t[1] * strength
            B2 = B * (1 - strength) + t[2] * strength
            px[x, y] = lab_to_rgb((L2, A2, B2)) + (a,)
    return im


def desaturate_image(im, lift=0.0):
    """Grey version of a sprite (used for generic fallback bases that the client multiplies by a tint)."""
    im = im.convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a or is_outline_px((r, g, b)):
                continue
            L = rgb_to_lab((r, g, b))[0]
            v = lab_to_rgb((min(98, L + lift), 0, 0))
            px[x, y] = v + (a,)
    return im


def edge_darkness(im):
    """Share of edge pixels (opaque with a transparent 4-neighbour) that are dark outline colours."""
    px = im.load()
    n = d = 0
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3] < 128:
                continue
            if any(not (0 <= x + dx < im.width and 0 <= y + dy < im.height) or px[x + dx, y + dy][3] < 128
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                n += 1
                d += is_outline_px(px[x, y][:3])
    return d / n if n else 1.0


def outline_image(im, colour=OUTLINE):
    """Add a 1px outline in the transparent pixels touching the sprite (4-neighbour)."""
    out = im.copy()
    src, dst = im.load(), out.load()
    for y in range(im.height):
        for x in range(im.width):
            if src[x, y][3] >= 128:
                continue
            if any(0 <= x + dx < im.width and 0 <= y + dy < im.height and src[x + dx, y + dy][3] >= 128
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                dst[x, y] = colour + (255,)
    return out


def normalise_to_32(im, outline='auto'):
    """16px (or smaller) sources: whole-number nearest upscale to 32px, then a 1px outline if the sprite has none.
    32px sources are returned as they are (placed on a 32px canvas)."""
    im = im.convert('RGBA')
    k = max(1, 32 // max(im.width, im.height))
    if k > 1:
        im = im.resize((im.width * k, im.height * k), Image.NEAREST)
    canvas = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((32 - im.width) // 2, (32 - im.height) // 2))
    if outline is True or (outline == 'auto' and edge_darkness(canvas) < 0.6):
        canvas = outline_image(canvas)
    return canvas


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) != 2:
        sys.exit(__doc__)
    cut = 128
    if '--alpha-cut' in sys.argv:
        cut = int(sys.argv[sys.argv.index('--alpha-cut') + 1])
    remap_image(Image.open(args[0]), cut).save(args[1])
