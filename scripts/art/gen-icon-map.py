#!/usr/bin/env python3
"""Writes art/icon-map.json (all icons from Seveneves 'sv:' or our own 'own:' icons). Edit the tables here, re-run, then `npm run art`.
Gear ids follow the gear overhaul contract: ${material}_${type}, plus named overrides."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
items = {}
M = {'metal': ['bronze', 'iron', 'steel'], 'wood': ['pine', 'oak', 'yew'], 'leather': ['leather', 'studded', 'hardened'],
     'cloth': ['hessian', 'linen', 'silk'], 'jewel': ['copper', 'glowstone', 'sapphire']}
def sv(f, n): return f'sv:{f}/{n}'
def tier3(fam, typ, specs, tintstr=(None, None, None)):
    """specs: three icon specs (or one, reused with a material tint on every tier)."""
    if isinstance(specs, str): specs = [specs] * 3
    for i, mat in enumerate(M[fam]):
        t = tintstr[i]
        spec = specs[i] + (f' mat={fam}.{mat}@{t}' if t else '')
        items[f'{mat}_{typ}'] = spec

W, A, J, T, S, FD, MT = '01', '02', '05', '06', '07', '09', '13'
BR = (.7, None, None)   # T1 metal icons are drawn steel-grey: warm them to bronze
# ---- fight weapons (distinct icon per tier)
tier3('metal', 'sword', [sv(W, 2), sv(W, 0), sv(W, 36)], BR)
tier3('metal', 'axe', [sv(W, 5), sv(W, 6), sv(W, 7)], BR)
tier3('metal', 'dagger', [sv(W, 12), sv(W, 13), sv(W, 14)], BR)
tier3('metal', 'spear', [sv(W, 16), sv(W, 17), sv(W, 19)], BR)
tier3('metal', 'greatsword', [sv(W, 1), sv(W, 15), sv(W, 37)], BR)
tier3('metal', 'mace', [sv(W, 20), sv(W, 60), sv(W, 62)], BR)
tier3('metal', 'warhammer', [sv(W, 40), sv(W, 41), sv(W, 42)], BR)
tier3('metal', 'halberd', [sv(W, 32), sv(W, 35), sv(W, 33)], BR)
tier3('metal', 'scepter', [sv(W, 22), sv(W, 23), sv(W, 26)])
tier3('metal', 'parrying_dagger', [sv(W, 48), sv(W, 49), sv(W, 50)], BR)
tier3('wood', 'bow', [sv(W, 8), sv(W, 10), sv(W, 11)])
tier3('wood', 'staff', [sv(W, 24), sv(W, 25), sv(S, 58)])
tier3('wood', 'wand', [sv(S, 48), sv(S, 52), sv(S, 56)])
tier3('wood', 'shield', [sv(A, 4), sv(A, 61), sv(A, 58)])
tier3('leather', 'tome', [sv(S, 41), sv(S, 42), sv(S, 47)])
# ---- armour
tier3('metal', 'helm', [sv(A, 1), sv(A, 2), sv(A, 3)], BR)
tier3('metal', 'cuirass', [sv(A, 10), sv(A, 9), sv(A, 8)])
tier3('metal', 'greaves', [sv(A, 31), sv(A, 32), sv(A, 34)], BR)
tier3('leather', 'cap', sv(A, 44), (.9, .9, .9))
tier3('leather', 'jerkin', sv(A, 15), (.9, .9, .9))
tier3('leather', 'breeches', sv(A, 33), (.9, .9, .9))
tier3('cloth', 'hood', sv(A, 46), (.9, .9, .9))
tier3('cloth', 'robe', sv(A, 40), (.8, .8, .8))
tier3('cloth', 'trousers', sv(A, 35), (.8, .8, .8))
# ---- jewellery (jewel family: copper, glowstone, sapphire)
tier3('jewel', 'signet', [sv(J, 16), sv(J, 26), sv(J, 1)])
tier3('jewel', 'band', [sv(J, 8), sv(J, 7), sv(J, 3)])
tier3('jewel', 'loop', [sv(J, 24), sv(J, 20), sv(J, 25)])
tier3('jewel', 'pendant', [sv(J, 11), sv(J, 17), sv(J, 59)])
tier3('jewel', 'torc', [sv(J, 13), sv(J, 15), sv(J, 47)])
tier3('jewel', 'locket', [sv(J, 32), sv(J, 63), sv(J, 12)])
# ---- tools
tier3('metal', 'pickaxe', [sv(T, 25), sv(T, 14), sv(T, 16)])
tier3('metal', 'felling_axe', sv(W, 4), (.7, None, .5))
tier3('metal', 'sickle', 'own:tool_sickle', (.7, None, .6))
tier3('metal', 'saw', [sv(T, 79), sv(T, 78), sv(T, 80)])
tier3('metal', 'chisel', 'own:tool_chisel', (.7, .5, .6))
tier3('metal', 'awl', 'own:tool_awl', (.7, None, .6))
tier3('metal', 'needle_set', 'own:tool_needle_set')
tier3('metal', 'gem_file', 'own:tool_gem_file', (.5, None, .5))
tier3('wood', 'fishing_rod', [sv(T, 55), sv(T, 61), sv(T, 62)])
tier3('wood', 'spindle', sv('04', 21), (.6, .6, .6))
tier3('wood', 'fleshing_scraper', sv(W, 45), None if False else (.6, .6, .6))
tier3('wood', 'smith_hammer', [sv(T, 68), sv(T, 67), sv(T, 69)])
tier3('wood', 'rolling_pin', 'own:tool_rolling_pin', (.8, .8, .8))
tier3('leather', 'bellows', 'own:tool_bellows', (.7, .7, .7))
tier3('jewel', 'mortar', 'own:tool_mortar_pestle', (.7, .7, .7))
# ---- outfit (cloth tiers): field = gather, work = refine, craft = craft
for mat in M['cloth']:
    k = (mat,)
    for kind, head, body, hands, feet, bodyname in (('field', sv(A, 44), sv(A, 13), sv(A, 22), sv(A, 16), 'vest'),
                                                    ('work', sv(A, 47), sv(A, 41), sv(A, 23), sv(A, 17), 'smock'),
                                                    ('craft', sv(A, 45), sv(A, 43), sv(A, 21), sv(A, 18), 'apron')):
        t = f' mat=cloth.{mat}@.8'
        items[f'{mat}_{kind}_cap'] = head + t
        items[f'{mat}_{kind}_{bodyname}'] = body + t
        items[f'{mat}_{kind}_gloves'] = hands + t
        items[f'{mat}_{kind}_boots'] = feet + t
# ---- named overrides (replace a pattern slot)
for k in ('hessian_field_cap', 'hessian_field_vest', 'hessian_craft_apron', 'steel_sword', 'yew_bow', 'yew_staff', 'steel_warhammer'):
    items.pop(k, None)
items.update({'anglers_hat': sv(A, 47), 'foragers_satchel': sv('08', 8), 'artisans_apron': sv(A, 43),
              'frostbite_saber': sv(W, 51), 'venomstring_bow': sv(W, 11), 'dawnward_staff': sv(S, 58),
              'stoneheart_maul': sv(W, 43)})
# the named bow/staff shared an icon with the pattern: keep them distinct
items['oak_bow'] = sv(W, 10); items['pine_bow'] = sv(W, 8); items['venomstring_bow'] = sv(W, 11)
# ---- materials and consumables (existing ids)
mats = {
 'copper_ore': '04/9', 'tin_ore': '04/11', 'iron_ore': '04/8', 'coal': '04/14', 'silver_ore': '04/12', 'gold_ore': '04/10', 'mithril_ore': '04/13',
 'copper_bar': '13/10', 'bronze_bar': '13/8', 'iron_bar': '04/48', 'steel_bar': '13/11', 'silver_bar': '04/51', 'gold_bar': '04/50', 'mithril_bar': '04/53', 'grave_silver': '13/15',
 'pine_log': '04/16', 'oak_log': '04/20', 'yew_log': '04/22', 'ironwood_log': '13/18',
 'pine_plank': '04/17 mat=wood.pine@.6', 'oak_plank': '04/17 mat=wood.oak@.7', 'yew_plank': '04/17 mat=wood.yew@.7', 'ironwood_plank': '04/17 mat=wood.ironwood@.8',
 'rough_leather': '13/24', 'tanned_leather': '13/28', 'leather_strap': '13/47', 'hardened_leather': '13/27', 'drakeskin': '04/27',
 'scrap_hide': '04/24', 'wolf_pelt': '04/26', 'bear_hide': '13/25', 'drake_hide': '04/25',
 'linen_cloth': '04/29', 'nettle_canvas': '04/31', 'silk_cloth': '04/28', 'moonweave': '13/30',
 'flax_fiber': '04/30', 'wild_grain': '12/0', 'nettle_fiber': '04/34',
 'spider_silk': '04/46', 'linen_thread': '04/21', 'silk_thread': '13/31',
 'faint_essence': '04/15', 'glow_essence': '04/61', 'storm_essence': '07/14', 'moon_essence': '04/59', 'venom_gland': '04/43', 'halo_fragment': '07/5',
 'minnow': '11/0', 'trout': '11/2', 'salmon': '11/1', 'abyssal_angler': '11/5',
 'rough_gem': '04/7', 'sapphire': '04/5', 'ruby': '04/0', 'stone_heart': '04/63', 'rime_shard': '04/57',
 'river_pearl': '11/24', 'black_pearl': '11/24 tint=#2a2a3a@.8', 'abyssal_pearl': '11/63',
 'mint_leaf': '04/34', 'bloodmoss': '04/32', 'frostcap': '04/37', 'sunpetal': '04/35',
 'bone_shard': '04/41', 'wood_varnish': '13/52', 'amber_resin': '04/7', 'copper_rivet': '13/34',
 'drake_scale': '04/58', 'ember_scale': '07/0',
 'quickening_salts': '04/15', 'cut_prism': '04/4', 'starlight_reagent': '04/61', 'emberglass_lens': '04/56',
 'wyrm_core': '04/56', 'rimefang_core': '04/57', 'blight_core': '04/60', 'seraph_core': '07/5', 'crown_core': '07/4', 'leviathan_core': '04/59',
 'bread': '09/0', 'grilled_minnows': '09/40', 'herb_trout': '09/42', 'bloodmoss_broth': '09/30', 'salmon_pie': '09/24', 'frostcap_salmon': '09/41', 'angler_feast': '09/59',
 'mint_tonic': '10/2', 'wisplight_salve': '10/5', 'ironskin_draught': '10/6', 'fury_draught': '10/13', 'restoring_elixir': '10/16',
 'frostward_tonic': '10/17', 'clarity_draught': '10/25', 'sunpetal_elixir': '10/57', 'rimeheart_draught': '03/7',
}
for k, v in mats.items():
    f, _, rest = v.partition('/'); n, _, extra = rest.partition(' ')
    items[k] = f'sv:{f}/{n}' + (' ' + extra if extra else '')
generic = {
 'ore': '04/8', 'coal': '04/14', 'gem': '04/4', 'log': '04/16', 'resin': '04/7', 'fiber': '04/30', 'herb': '04/34', 'fish': '11/0', 'pearl': '11/24',
 'hide': '04/24', 'bone': '04/41', 'thread': '04/21', 'essence': '04/15', 'scale': '04/58', 'bar': '04/48', 'rivet': '13/34', 'plank': '04/17',
 'oil': '13/52', 'leather': '13/28', 'cloth': '04/29', 'core': '04/60', 'sword': '01/0', 'bow': '01/8', 'helm': '02/1', 'chest': '02/8', 'legs': '02/32',
 'shield': '02/4', 'staff': '01/24', 'ring': '05/0', 'amulet': '05/11', 'tome': '07/41', 'tool': '06/14', 'outfit': '02/13', 'food': '09/0',
 'potion': '03/0', 'catalyst': '04/4', 'material': '04/8', 'gear': '01/0', 'item': '08/8',
}
named = {
 'gold': '08/0', 'bond': '08/5', 'hourglass': '14/42', 'bag': '08/8', 'chest': '08/16', 'key': '08/12', 'skull': '14/0', 'coins': '08/2',
 'skill:mining': '06/14', 'skill:woodcutting': '01/4', 'skill:herbalism': 'own:tool_sickle', 'skill:fishing': '06/61',
 'skill:smelting': 'own:tool_bellows', 'skill:carpentry': '06/78', 'skill:tanning': '01/45', 'skill:weaving': '04/21',
 'skill:smithing': '06/67', 'skill:woodworking': 'own:tool_chisel', 'skill:leatherworking': 'own:tool_awl', 'skill:tailoring': 'own:tool_needle_set',
 'skill:jewelcrafting': 'own:tool_gem_file', 'skill:alchemy': 'own:tool_mortar_pestle', 'skill:cooking': 'own:tool_rolling_pin',
 'skill:guardian': '02/4', 'skill:mender': '03/1', 'skill:striker': '01/0', 'craft': '06/67', 'fight': '01/50',
 'fight:fight_wolfwood': '04/26', 'fight:fight_ridge': '04/25', 'fight:fight_hollow': '04/46', 'fight:fight_bearclaw': '04/45',
 'fight:fight_drakemire': '04/27', 'fight:fight_quarry_road': '04/8', 'fight:fight_palisade': '04/16', 'fight:fight_ironhide': '04/24',
 'fight:fight_golems': '04/13', 'fight:fight_roost': '04/62', 'fight:fight_shrine': '07/29', 'fight:fight_marsh': '04/37',
 'fight:fight_spire': '07/10', 'fight:fight_chapel': '07/33', 'fight:fight_barrow': '14/0',
}
def norm(d):
    out = {}
    for k, v in d.items():
        out[k] = v if ':' in v and not v[0].isdigit() else 'sv:' + v
    return out
doc = ('item id -> "src [mat=family.name@strength] [tint[=#hex][@strength]]". src = sv:<folder>/<icon> (Seveneves pack, private source) '
       'or own:<file> (art/src/own). Generated by scripts/art/gen-icon-map.py: edit that file, not this one.')
out = {'_doc': doc, 'items': items, 'generic': norm(generic), 'named': norm(named)}
(ROOT / 'art' / 'icon-map.json').write_text(json.dumps(out, indent=1) + '\n')
print(len(items), 'items', len(generic), 'generic', len(named), 'named')
