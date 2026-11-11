"""Shared helpers for the scene art build (DB32 remap, ramps, shelf packer).
NOTE: scripts/art/remap.py (icons agent, branch phase3/art-icons) is the shared remap tool; swap `remap_db32`
for it at merge time."""
import numpy as np
from PIL import Image

DB32 = ['000000','222034','45283c','663931','8f563b','df7126','d9a066','eec39a','fbf236','99e550','6abe30','37946e',
        '4b692f','524b24','323c39','3f3f74','306082','5b6ee1','639bff','5fcde4','cbdbfc','ffffff','9badb7','847e87',
        '696a6a','595652','76428a','ac3232','d95763','d77bba','8f974a','8a6f30']
PAL = np.array([[int(h[i:i+2], 16) for i in (0, 2, 4)] for h in DB32], dtype=np.int32)

def rgb(h):
    h = h.lstrip('#'); return np.array([int(h[i:i+2], 16) for i in (0, 2, 4)], dtype=np.float32)

def remap_db32(img):
    """Nearest-colour DB32 remap (RGB euclidean); alpha is binarised at 128."""
    a = np.array(img.convert('RGBA'))
    flat = a[..., :3].reshape(-1, 3).astype(np.int32)
    uniq, inv = np.unique(flat, axis=0, return_inverse=True)
    d = ((uniq[:, None, :] - PAL[None, :, :]) ** 2).sum(-1)
    m = PAL[d.argmin(1)][inv.reshape(-1)].reshape(a.shape[0], a.shape[1], 3)
    out = np.zeros_like(a)
    out[..., :3] = m
    out[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
    out[out[..., 3] == 0, :3] = 0
    return Image.fromarray(out, 'RGBA')

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
