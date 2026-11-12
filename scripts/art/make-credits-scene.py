#!/usr/bin/env python3
"""Write art/credits-scene.md from the LPC generator's sheet_definitions (credit records of every layer used).
usage: make-credits-scene.py <LPC repo dir> <out md>"""
import sys, os, json
REPO, OUT = sys.argv[1], sys.argv[2]
HOOD = 'headwear/coverings/hoods/hat_hood_cloth.json'
DEFS = ['body/body.json', 'head/heads/human/heads_human_male.json', 'hair/short/hair_plain.json', 'feet/boots/feet_boots_basic.json',
        'legs/pants/legs_pants.json', 'legs/legs_armour.json', 'torso/armour/torso_armour_plate.json', 'torso/armour/torso_armour_leather.json',
        'torso/torso_chainmail.json', 'torso/shirts/longsleeve/torso_clothes_longsleeve2.json', 'headwear/helmets/helmets/hat_helmet_kettle.json',
        'headwear/helmets/helmets/hat_helmet_mail.json', 'headwear/hats/caps/hat_cap_leather.json', HOOD,
        'weapons/sword/weapon_sword_arming.json', 'weapons/blunt/weapon_blunt_mace.json', 'weapons/magic/weapon_magic_simple.json',
        'weapons/ranged/bow/weapon_ranged_bow_normal.json', 'tools/tool_pickaxe.json', 'tools/tool_axe.json', 'tools/tool_hammer.json', 'tools/tool_rod.json',
        'weapons/shields/shield_spartan.json', 'weapons/shields/engrailed/shield_crusader.json', 'weapons/shields/engrailed/shield_plus.json']
PERM = ('OGA-BY', 'CC-BY 3', 'CC-BY 4', 'CC0')
def permissive(l):
    u = l.upper().replace('-', ' ')
    return ('OGA BY' in u or u.startswith('CC0') or u.startswith('CC BY 3') or u.startswith('CC BY 4')) and 'SA' not in u.split()[:3]
rows, flags = [], []
for d in DEFS:
    j = json.load(open(os.path.join(REPO, 'sheet_definitions', d)))
    for c in j['credits']:
        if d == 'body/body.json' and not c['file'].endswith('/male'): continue
        ok = [l for l in c['licenses'] if permissive(l)]
        if not ok: flags.append((j['name'], c['file']))
        rows.append((j['name'], c['file'], '; '.join(c['authors']), ', '.join(ok) or 'NO PERMISSIVE LICENCE', ' '.join(c.get('urls', []))))
with open(OUT, 'w') as f:
    f.write('# Scene art credits (wt-scene, phase 3 steps 6-7)\n\nMerge these rows into `art/CREDITS.md` and the in-game credits screen.\n\n')
    f.write('## Universal LPC Spritesheet Character Generator layers (hero and crew)\n'
            'Source: https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator (per-layer licences in its CREDITS.csv). '
            'Layers are cropped to the east-facing animation rows, recoloured and remapped to DawnBringer 32; no scaling. '
            'The licence shown is the permissive one we rely on (never the share-alike or GPL option). **No CC-BY-SA layer is used.**\n\n')
    f.write('| Layer | Files | Authors | Licence relied on | Links | Share-alike |\n| --- | --- | --- | --- | --- | --- |\n')
    for r in rows: f.write(f'| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} | No |\n')
    f.write('\n## Ninja Adventure asset pack (backdrops and boss portraits)\n\n| Asset | Author | Licence | Link | Share-alike |\n| --- | --- | --- | --- | --- |\n'
            '| Ninja Adventure Asset Pack: Backgrounds/Tilesets (Nature, House, Floor, Water, Relief) for the action backdrops; Actor/Boss Faceset.png for the six boss portraits (DragonGreen, DragonBlue, GiantBamboo, GiantBlueSamurai, TenguBlue, SquidGreen). Remapped to DB32. | Pixel-boy and AAA | CC0 1.0 | https://pixel-boy.itch.io/ninja-adventure-asset-pack | No |\n')
print('rows', len(rows), 'flags', flags)
