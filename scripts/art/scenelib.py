"""Shared helpers for the scene art build (ramps, shelf packer). DB32 remapping is the shared remap.py."""
import numpy as np
from PIL import Image
from remap import remap_image

def rgb(h):
    h = h.lstrip('#'); return np.array([int(h[i:i+2], 16) for i in (0, 2, 4)], dtype=np.float32)

def remap_db32(img):
    """DB32 remap via the shared scripts/art/remap.py (Lab nearest colour, binary alpha at 128)."""
    return remap_image(img)

def ramp_tint(img, stops, lo=40.0, hi=250.0):
    """Recolour by luminance through a list of hex stops (dark -> light)."""
    a = np.array(img.convert('RGBA')).astype(np.float32)
    L = a[..., 0] * .3 + a[..., 1] * .59 + a[..., 2] * .11
    t = np.clip((L - lo) / (hi - lo), 0, 1) * (len(stops) - 1)
    cols = np.stack([rgb(s) for s in stops])
    i = np.clip(np.floor(t).astype(int), 0, len(stops) - 2)
    f = (t - i)[..., None]
    out = cols[i] * (1 - f) + cols[i + 1] * f
    a[..., :3] = out
    return Image.fromarray(a.astype(np.uint8), 'RGBA')

def mult_tint(img, m):
    a = np.array(img.convert('RGBA')).astype(np.float32)
    a[..., :3] = np.clip(a[..., :3] * np.array(m, dtype=np.float32), 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')

def shelf_pack(rects, width=1024, pad=1):
    """rects: list of (key, w, h). Returns ({key: (x, y)}, total_height)."""
    order = sorted(rects, key=lambda r: -r[2])
    pos, x, y, rowh = {}, 0, 0, 0
    for key, w, h in order:
        if x + w > width: x, y, rowh = 0, y + rowh + pad, 0
        pos[key] = (x, y); x += w + pad; rowh = max(rowh, h)
    return pos, y + rowh
