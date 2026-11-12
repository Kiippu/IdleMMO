import { buildGear } from './data/gear/build';
import { EFFECTS, AFFIXES, FIGHT_SLOTS, OUTFIT_SETS, OUTFIT_PIECES, TOOL_SKILLS, SKILL_GROUP } from './data/gear/model';
// Static game content (was window.GW.DATA). Ported from legacy/data.js unchanged.
/* eslint-disable */

// ---------- items ----------
// Everything that looks optional in the legacy call sites is declared optional here so
// the port can mirror those calls verbatim (e.g. `mat('coal', 'Coal', 2, 6, 'coal', '#x')`
// with no `extra`). All argument lists match legacy/data.js.
const items: Record<string, any> = {};
function add(id: string, name: string, kind: string, tier: any, value: any, sprite: any, tint: any, extra?: any) {
  items[id] = Object.assign({ id, name, kind, tier, value, sprite, tint }, extra || {});
}
const P = { perishable: true };
const mat = (id: string, name: string, tier: any, value: any, sprite: any, tint: any, extra?: any) => add(id, name, 'material', tier, value, sprite, tint, extra);
const food = (id: string, name: string, tier: any, tint: any, heal?: any) => add(id, name, 'food', tier, null, 'food', tint, { heal });
const potion = (id: string, name: string, tier: any, tint: any, extra?: any) => add(id, name, 'potion', tier, null, 'potion', tint, extra);
const catalyst = (id: string, name: string, tier: any, tint: any, procMult?: any) => add(id, name, 'catalyst', tier, null, 'catalyst', tint, { procMult });
const core = (id: string, name: string, tint?: any) => add(id, name, 'core', 5, 900, 'core', tint);

// gathered: mining
mat('copper_ore', 'Copper ore', 1, 2, 'ore', '#c47a45');
mat('tin_ore', 'Tin ore', 1, 2, 'ore', '#b9b8ad');
mat('iron_ore', 'Iron ore', 2, 7, 'ore', '#8a5a44');
mat('coal', 'Coal', 2, 6, 'coal', '#3a3533');
mat('silver_ore', 'Silver ore', 3, 22, 'ore', '#c9cfd6');
mat('gold_ore', 'Gold ore', 3, 38, 'ore', '#e2b13c');
mat('mithril_ore', 'Mithril ore', 4, 70, 'ore', '#6fb8c9');
mat('rough_gem', 'Rough gem', 1, 5, 'gem', '#9aa77f');
mat('sapphire', 'Sapphire', 3, 48, 'gem', '#3a64c8');
mat('ruby', 'Ruby', 4, 95, 'gem', '#c8304a');
// woodcutting
mat('pine_log', 'Pine log', 1, 2, 'log', '#9b6b3f');
mat('oak_log', 'Oak log', 2, 7, 'log', '#7a5230');
mat('yew_log', 'Yew log', 3, 22, 'log', '#5c3b2a');
mat('ironwood_log', 'Ironwood log', 4, 68, 'log', '#4a4440');
mat('amber_resin', 'Amber resin', 2, 9, 'resin', '#e3a33a');
// herbalism
mat('flax_fiber', 'Flax fiber', 1, 2, 'fiber', '#c9b98a');
mat('wild_grain', 'Wild grain', 1, 1, 'fiber', '#d6b85a');
mat('mint_leaf', 'Mint leaf', 1, 3, 'herb', '#6fbf73', P);
mat('nettle_fiber', 'Nettle fiber', 2, 7, 'fiber', '#7d8f4e');
mat('bloodmoss', 'Bloodmoss', 2, 12, 'herb', '#a3343c', P);
mat('frostcap', 'Frostcap', 3, 30, 'herb', '#8fd3e8', P);
mat('sunpetal', 'Sunpetal', 4, 80, 'herb', '#f2c94c', P);
// fishing
mat('minnow', 'Minnow', 1, 2, 'fish', '#9fb4bf', P);
mat('trout', 'Brook trout', 2, 8, 'fish', '#a7866a', P);
mat('salmon', 'Red salmon', 3, 24, 'fish', '#e07a5f', P);
mat('abyssal_angler', 'Abyssal angler', 4, 70, 'fish', '#3b4a6b', P);
mat('river_pearl', 'River pearl', 3, 40, 'pearl', '#efe6da');
mat('black_pearl', 'Black pearl', 4, 120, 'pearl', '#3a3448');
// combat drops
mat('scrap_hide', 'Scrap hide', 1, 2, 'hide', '#a07850', P);
mat('bone_shard', 'Bone shard', 1, 2, 'bone', '#e6dcc3');
mat('wolf_pelt', 'Wolf pelt', 2, 8, 'hide', '#7d7468', P);
mat('bear_hide', 'Bear hide', 3, 26, 'hide', '#5a4030', P);
mat('drake_hide', 'Drake hide', 4, 85, 'hide', '#3f6b4a', P);
mat('spider_silk', 'Spider silk', 3, 18, 'thread', '#e9e4f0', P);
mat('faint_essence', 'Faint essence', 1, 3, 'essence', '#b7c7e8');
mat('glow_essence', 'Glow essence', 2, 10, 'essence', '#8fe3c0');
mat('storm_essence', 'Storm essence', 3, 32, 'essence', '#9a8cf0');
mat('moon_essence', 'Moon essence', 4, 90, 'essence', '#dfe5ff');
mat('stone_heart', 'Stone heart', 3, 58, 'gem', '#8c8c7a');     // guardian elite (cores-lite)
mat('drake_scale', 'Drake scale', 4, 140, 'scale', '#4f8f6a');  // guardian elite (cores-lite)
// refined: smelting
mat('copper_bar', 'Copper bar', 1, 5, 'bar', '#d08a55');
mat('copper_rivet', 'Copper rivet', 1, 1, 'rivet', '#c98a52');
mat('bronze_bar', 'Bronze bar', 1, 5, 'bar', '#b08d57');
mat('iron_bar', 'Iron bar', 2, 22, 'bar', '#8f8f95');
mat('steel_bar', 'Steel bar', 3, 32, 'bar', '#b4bcc6');
mat('silver_bar', 'Silver bar', 3, 54, 'bar', '#dfe4ea');
mat('gold_bar', 'Gold bar', 4, 88, 'bar', '#f0c24a');
mat('mithril_bar', 'Mithril bar', 4, 170, 'bar', '#7fd0e0');
// carpentry
mat('pine_plank', 'Pine plank', 1, 5, 'plank', '#d1a46b');
mat('oak_plank', 'Oak plank', 2, 16, 'plank', '#a97a48');
mat('yew_plank', 'Yew plank', 3, 50, 'plank', '#7b4f33');
mat('ironwood_plank', 'Ironwood plank', 4, 150, 'plank', '#5a524c');
mat('wood_varnish', 'Wood varnish', 2, 20, 'oil', '#c88a2a');
// tanning
mat('rough_leather', 'Rough leather', 1, 5, 'leather', '#b08560');
mat('tanned_leather', 'Tanned leather', 2, 18, 'leather', '#8b5a3c');
mat('leather_strap', 'Leather strap', 2, 6, 'leather', '#6e4630');
mat('hardened_leather', 'Hardened leather', 3, 62, 'leather', '#5b3a26');
mat('drakeskin', 'Drakeskin', 4, 195, 'leather', '#3d6b4f');
// weaving
mat('linen_thread', 'Linen thread', 1, 5, 'thread', '#e8dfc8');
mat('linen_cloth', 'Linen cloth', 2, 12, 'cloth', '#efe7d2');
mat('nettle_canvas', 'Nettle canvas', 2, 20, 'cloth', '#8b9a5b');
mat('silk_thread', 'Silk thread', 3, 40, 'thread', '#f3eefa');
mat('silk_cloth', 'Silk cloth', 4, 130, 'cloth', '#e9d9f2');
mat('moonweave', 'Moonweave', 5, 380, 'cloth', '#cfd8ff');
// boss materials
mat('ember_scale', 'Ember scale', 5, 260, 'scale', '#e0683a');
mat('rime_shard', 'Rime shard', 5, 280, 'gem', '#bfe8ff');
mat('venom_gland', 'Venom gland', 5, 300, 'essence', '#7fbf3a');
mat('halo_fragment', 'Halo fragment', 5, 340, 'essence', '#ffe9a8');
mat('grave_silver', 'Grave silver', 5, 380, 'bar', '#9d93b8');
mat('abyssal_pearl', 'Abyssal pearl', 5, 450, 'pearl', '#2fb5a8');
// boss cores
core('wyrm_core', 'Wyrm core', '#f06a3a');
core('rimefang_core', 'Rimefang core', '#7ec8f0');
core('blight_core', 'Blight core', '#8fcf3a');
core('seraph_core', 'Seraph core', '#ffd86a');
core('crown_core', 'Hollow crown core', '#a58cf0');
core('leviathan_core', 'Leviathan core', '#38c9b8');



// food (cooking)
food('bread', 'Bread', 1, '#d9a35b', 120);
food('grilled_minnows', 'Grilled minnows', 1, '#c9a27a', 100);
food('herb_trout', 'Herb-baked trout', 2, '#b88a5a', 250);
food('bloodmoss_broth', 'Bloodmoss broth', 2, '#a3443c', 400);
food('salmon_pie', 'Salmon pie', 3, '#e09a6a', 550);
food('frostcap_salmon', 'Frostcap salmon', 3, '#e8b0a0', 750);
food('angler_feast', 'Angler feast', 4, '#f2c94c', 1100);
// potions (alchemy)
potion('mint_tonic', 'Mint tonic', 1, '#7fd18a', { heal: 150 });
potion('wisplight_salve', 'Wisplight salve', 1, '#b7c7e8', { heal: 250 });
potion('ironskin_draught', 'Ironskin draught', 2, '#9a9a8a', { buff: { stat: 'def', pct: 0.1 } });
potion('fury_draught', 'Fury draught', 2, '#d0463c', { buff: { stat: 'atk', pct: 0.1 } });
potion('restoring_elixir', 'Restoring elixir', 3, '#e06a8a', { heal: 600 });
potion('frostward_tonic', 'Frostward tonic', 3, '#8fd3e8', { heal: 200, buff: { stat: 'def', pct: 0.15 } });
potion('clarity_draught', 'Clarity draught', 3, '#b4a8f5', { buff: { stat: 'heal', pct: 0.15 } });
potion('sunpetal_elixir', 'Sunpetal elixir', 4, '#f6d55c', { heal: 1200, buff: { stat: 'heal', pct: 0.2 } });
potion('rimeheart_draught', 'Rimeheart draught', 5, '#bfe8ff', { heal: 400, buff: { stat: 'def', pct: 0.25 } });
// catalysts
catalyst('quickening_salts', 'Quickening salts', 2, '#e8c46a', 1.5);
catalyst('cut_prism', 'Cut prism', 3, '#7aa0f0', 1.75);
catalyst('starlight_reagent', 'Starlight reagent', 4, '#e6ecff', 2.0);
catalyst('emberglass_lens', 'Emberglass lens', 5, '#f08a4a', 2.5);

// ---------- actions ----------
const actions = [];
const G = (id, skill, name, level, sec, xp, outputs, bonus?) =>
  actions.push(Object.assign({ id, skill, kind: 'gather', name, level, sec, xp, outputs }, bonus ? { bonus } : {}));
const R = (id, skill, name, level, sec, xp, inputs, outputs) =>
  actions.push({ id, skill, kind: 'refine', name, level, sec, xp, inputs, outputs });
const C = (id, skill, name, level, sec, xp, inputs, outputs?) =>
  actions.push({ id, skill, kind: 'craft', name, level, sec, xp, inputs, outputs: outputs || { [id]: 1 } });
const F = (id, skill, name, level, sec, xp, zone, enemy, gold, drops) =>
  actions.push({ id, skill, kind: 'combat', name, level, sec, xp, zone, enemy, gold, drops });
const b = (item, chance, qty?) => ({ item, chance, qty: qty || 1 });
const d = (item, chance, min, max) => ({ item, chance, qty: [min, max] });

// gathering
G('mine_copper', 'mining', 'Copper vein', 1, 3, 8, { copper_ore: 1 }, [b('rough_gem', 0.02)]);
G('mine_tin', 'mining', 'Tin seam', 1, 3, 8, { tin_ore: 1 }, [b('rough_gem', 0.02)]);
G('mine_iron', 'mining', 'Iron lode', 10, 4, 18, { iron_ore: 1 }, [b('rough_gem', 0.03)]);
G('mine_coal', 'mining', 'Coal seam', 14, 4, 22, { coal: 1 });
G('mine_silver', 'mining', 'Silver pocket', 30, 6, 40, { silver_ore: 1 }, [b('sapphire', 0.03), b('rough_gem', 0.05)]);
G('mine_geode', 'mining', 'Geode wall', 36, 6, 46, { rough_gem: 1 }, [b('sapphire', 0.08), b('ruby', 0.02)]);
G('mine_gold', 'mining', 'Gold vein', 42, 7, 58, { gold_ore: 1 }, [b('ruby', 0.02), b('sapphire', 0.03)]);
G('mine_mithril', 'mining', 'Mithril deep', 54, 8, 80, { mithril_ore: 1 }, [b('ruby', 0.04)]);

G('chop_pine', 'woodcutting', 'Pine stand', 1, 3, 8, { pine_log: 1 }, [b('amber_resin', 0.03)]);
G('chop_oak', 'woodcutting', 'Oak grove', 12, 4, 20, { oak_log: 1 }, [b('amber_resin', 0.08)]);
G('tap_resin', 'woodcutting', 'Resin tapping', 20, 5, 26, { amber_resin: 1 });
G('chop_yew', 'woodcutting', 'Yew thicket', 30, 6, 40, { yew_log: 1 }, [b('amber_resin', 0.1)]);
G('chop_ironwood', 'woodcutting', 'Ironwood heart', 50, 8, 78, { ironwood_log: 1 });

G('pick_flax', 'herbalism', 'Flax patch', 1, 3, 8, { flax_fiber: 1 });
G('pick_grain', 'herbalism', 'Wild wheat', 1, 3, 7, { wild_grain: 2 });
G('pick_mint', 'herbalism', 'Riverside mint', 1, 3, 8, { mint_leaf: 1 });
G('pick_nettle', 'herbalism', 'Nettle bank', 15, 4, 22, { nettle_fiber: 1 });
G('pick_bloodmoss', 'herbalism', 'Bloodmoss hollow', 25, 5, 32, { bloodmoss: 1 });
G('pick_frostcap', 'herbalism', 'Frostcap ledge', 38, 6, 50, { frostcap: 1 });
G('pick_sunpetal', 'herbalism', 'Sunpetal meadow', 55, 8, 82, { sunpetal: 1 });

G('fish_minnow', 'fishing', 'Shallows net', 1, 3, 8, { minnow: 1 });
G('fish_trout', 'fishing', 'Brook pools', 12, 4, 20, { trout: 1 });
G('fish_salmon', 'fishing', 'Salmon run', 30, 6, 40, { salmon: 1 }, [b('river_pearl', 0.04)]);
G('fish_pearls', 'fishing', 'Pearl beds', 40, 7, 54, { river_pearl: 1 }, [b('black_pearl', 0.01)]);
G('fish_angler', 'fishing', 'Abyssal trench', 50, 8, 75, { abyssal_angler: 1 }, [b('black_pearl', 0.03)]);

// refining
R('smelt_copper', 'smelting', 'Copper bar', 1, 3, 8, { copper_ore: 2 }, { copper_bar: 1 });
R('cast_rivets', 'smelting', 'Copper rivets', 1, 3, 7, { copper_bar: 1 }, { copper_rivet: 8 });
R('smelt_bronze', 'smelting', 'Bronze bar', 5, 4, 12, { copper_ore: 1, tin_ore: 1 }, { bronze_bar: 1 });
R('smelt_iron', 'smelting', 'Iron bar', 15, 5, 24, { iron_ore: 2, coal: 1 }, { iron_bar: 1 });
R('smelt_steel', 'smelting', 'Steel bar', 30, 6, 40, { iron_ore: 2, coal: 2 }, { steel_bar: 1 });
R('smelt_silver', 'smelting', 'Silver bar', 35, 6, 48, { silver_ore: 2, coal: 1 }, { silver_bar: 1 });
R('smelt_gold', 'smelting', 'Gold bar', 45, 7, 62, { gold_ore: 2, coal: 1 }, { gold_bar: 1 });
R('smelt_mithril', 'smelting', 'Mithril bar', 55, 8, 88, { mithril_ore: 2, coal: 3 }, { mithril_bar: 1 });

R('saw_pine', 'carpentry', 'Pine planks', 1, 3, 8, { pine_log: 2 }, { pine_plank: 1 });
R('saw_oak', 'carpentry', 'Oak planks', 12, 4, 20, { oak_log: 2 }, { oak_plank: 1 });
R('boil_varnish', 'carpentry', 'Wood varnish', 20, 5, 28, { amber_resin: 2 }, { wood_varnish: 1 });
R('saw_yew', 'carpentry', 'Yew planks', 30, 6, 40, { yew_log: 2 }, { yew_plank: 1 });
R('saw_ironwood', 'carpentry', 'Ironwood planks', 50, 8, 80, { ironwood_log: 2 }, { ironwood_plank: 1 });

R('tan_scrap', 'tanning', 'Rough leather', 1, 3, 9, { scrap_hide: 2 }, { rough_leather: 1 });
R('tan_wolf', 'tanning', 'Tanned leather', 12, 4, 20, { wolf_pelt: 2 }, { tanned_leather: 1 });
R('cut_straps', 'tanning', 'Leather straps', 14, 3, 16, { tanned_leather: 1 }, { leather_strap: 3 });
R('tan_bear', 'tanning', 'Hardened leather', 32, 6, 44, { bear_hide: 2, amber_resin: 1 }, { hardened_leather: 1 });
R('tan_drake', 'tanning', 'Drakeskin', 52, 8, 84, { drake_hide: 2, wood_varnish: 1 }, { drakeskin: 1 });

R('spin_linen', 'weaving', 'Linen thread', 1, 3, 8, { flax_fiber: 2 }, { linen_thread: 1 });
R('weave_linen', 'weaving', 'Linen cloth', 5, 4, 12, { linen_thread: 2 }, { linen_cloth: 1 });
R('weave_canvas', 'weaving', 'Nettle canvas', 16, 5, 24, { nettle_fiber: 2, linen_thread: 1 }, { nettle_canvas: 1 });
R('spin_silk', 'weaving', 'Silk thread', 30, 5, 38, { spider_silk: 2 }, { silk_thread: 1 });
R('weave_silk', 'weaving', 'Silk cloth', 42, 7, 58, { silk_thread: 3 }, { silk_cloth: 1 });
R('weave_moon', 'weaving', 'Moonweave', 55, 8, 90, { silk_cloth: 2, moon_essence: 1 }, { moonweave: 1 });

// crafting: gear (smithing, woodworking, leatherworking, tailoring, jewelcrafting) is generated from the
// gear families (data/gear) and merged below. Jewelcrafting also cuts catalysts:
C('cut_prism', 'jewelcrafting', 'Cut prism', 33, 6, 50, { sapphire: 1, silver_bar: 1 });
C('emberglass_lens', 'jewelcrafting', 'Emberglass lens', 60, 10, 180, { ember_scale: 1, ruby: 1, silver_bar: 1 });
// alchemy
C('mint_tonic', 'alchemy', 'Mint tonic', 1, 3, 8, { mint_leaf: 3 });
C('wisplight_salve', 'alchemy', 'Wisplight salve', 6, 4, 14, { faint_essence: 2, mint_leaf: 1 });
C('ironskin_draught', 'alchemy', 'Ironskin draught', 15, 5, 26, { glow_essence: 1, nettle_fiber: 2, bone_shard: 1 });
C('fury_draught', 'alchemy', 'Fury draught', 22, 5, 32, { glow_essence: 1, bloodmoss: 1, bone_shard: 1 });
C('quickening_salts', 'alchemy', 'Quickening salts', 26, 6, 40, { glow_essence: 2, amber_resin: 1, bone_shard: 2 });
C('restoring_elixir', 'alchemy', 'Restoring elixir', 32, 6, 46, { storm_essence: 1, bloodmoss: 2 });
C('frostward_tonic', 'alchemy', 'Frostward tonic', 40, 6, 56, { frostcap: 2, storm_essence: 1 });
C('clarity_draught', 'alchemy', 'Clarity draught', 45, 7, 62, { frostcap: 1, storm_essence: 1, mint_leaf: 3 });
C('starlight_reagent', 'alchemy', 'Starlight reagent', 50, 8, 80, { moon_essence: 1, river_pearl: 1, storm_essence: 2 });
C('sunpetal_elixir', 'alchemy', 'Sunpetal elixir', 55, 8, 90, { sunpetal: 1, moon_essence: 1 });
C('rimeheart_draught', 'alchemy', 'Rimeheart draught', 60, 9, 120, { rime_shard: 1, frostcap: 2, moon_essence: 1 });
// cooking
C('bake_bread', 'cooking', 'Bread', 1, 3, 8, { wild_grain: 3 }, { bread: 2 });
C('grill_minnows', 'cooking', 'Grilled minnows', 1, 3, 8, { minnow: 2 }, { grilled_minnows: 1 });
C('bake_trout', 'cooking', 'Herb-baked trout', 12, 4, 20, { trout: 1, mint_leaf: 1 }, { herb_trout: 1 });
C('brew_broth', 'cooking', 'Bloodmoss broth', 25, 5, 32, { trout: 2, bloodmoss: 1, wild_grain: 1 }, { bloodmoss_broth: 1 });
C('bake_salmon_pie', 'cooking', 'Salmon pie', 32, 6, 45, { salmon: 1, wild_grain: 2, mint_leaf: 1 }, { salmon_pie: 1 });
C('sear_frostcap_salmon', 'cooking', 'Frostcap salmon', 42, 7, 60, { salmon: 2, frostcap: 1 }, { frostcap_salmon: 1 });
C('cook_angler_feast', 'cooking', 'Angler feast', 55, 8, 85, { abyssal_angler: 1, sunpetal: 1, wild_grain: 3 }, { angler_feast: 2 });

// combat: striker (hides, silk)
F('fight_wolfwood', 'striker', 'Mangy wolves', 1, 5, 12, 'Wolfwood edge', { name: 'Mangy wolf', power: 30, dmg: 20 }, [1, 3],
  [d('scrap_hide', 0.6, 1, 2), d('bone_shard', 0.4, 1, 2), d('wolf_pelt', 0.05, 1, 1)]);
F('fight_ridge', 'striker', 'Ridge wolves', 12, 6, 26, 'Howling ridge', { name: 'Ridge wolf', power: 100, dmg: 60 }, [3, 8],
  [d('wolf_pelt', 0.6, 1, 2), d('bone_shard', 0.4, 1, 2)]);
F('fight_hollow', 'striker', 'Hollow spiders', 28, 7, 44, 'Webbed hollow', { name: 'Hollow spider', power: 220, dmg: 120 }, [8, 18],
  [d('spider_silk', 0.6, 1, 3), d('bone_shard', 0.3, 1, 3)]);
F('fight_bearclaw', 'striker', 'Cave bears', 35, 8, 56, 'Bearclaw pass', { name: 'Cave bear', power: 300, dmg: 160 }, [12, 26],
  [d('bear_hide', 0.55, 1, 2), d('wolf_pelt', 0.3, 1, 2)]);
F('fight_drakemire', 'striker', 'Mire drakes', 52, 9, 90, 'Drakemire', { name: 'Mire drake', power: 480, dmg: 260 }, [25, 50],
  [d('drake_hide', 0.5, 1, 2), d('bone_shard', 0.5, 2, 4)]);
// combat: guardian (hides, elite cores-lite)
F('fight_quarry_road', 'guardian', 'Quarry rats', 1, 5, 12, 'Old quarry road', { name: 'Quarry rat', power: 30, dmg: 30 }, [1, 3],
  [d('scrap_hide', 0.5, 1, 2), d('bone_shard', 0.3, 1, 1), d('copper_ore', 0.3, 1, 3)]);
F('fight_palisade', 'guardian', 'Palisade bandits', 15, 6, 30, 'Bandit palisade', { name: 'Palisade bandit', power: 120, dmg: 70 }, [5, 12],
  [d('wolf_pelt', 0.45, 1, 2), d('iron_ore', 0.3, 1, 3)]);
F('fight_ironhide', 'guardian', 'Ironhide bears', 30, 7, 48, 'Ironhide den', { name: 'Ironhide bear', power: 260, dmg: 140 }, [10, 22],
  [d('bear_hide', 0.5, 1, 2), d('scrap_hide', 0.4, 1, 3)]);
F('fight_golems', 'guardian', 'Granite golems (elite)', 40, 9, 66, 'Golem quarry', { name: 'Granite golem', power: 360, dmg: 200 }, [16, 34],
  [d('stone_heart', 0.12, 1, 1), d('iron_ore', 0.5, 2, 4), d('coal', 0.5, 2, 4)]);
F('fight_roost', 'guardian', 'Roost wardens (elite)', 56, 10, 100, 'Drake roost', { name: 'Roost warden', power: 520, dmg: 300 }, [30, 60],
  [d('drake_scale', 0.1, 1, 1), d('drake_hide', 0.4, 1, 2)]);
// combat: mender (essences)
F('fight_shrine', 'mender', 'Restless wisps', 1, 5, 12, 'Hollow shrine', { name: 'Restless wisp', power: 30, dmg: 20 }, [1, 3],
  [d('faint_essence', 0.6, 1, 2)]);
F('fight_marsh', 'mender', 'Marsh glimmers', 14, 6, 28, 'Glimmer marsh', { name: 'Marsh glimmer', power: 110, dmg: 60 }, [4, 10],
  [d('glow_essence', 0.5, 1, 2), d('faint_essence', 0.4, 1, 2)]);
F('fight_spire', 'mender', 'Storm sprites', 32, 7, 50, 'Stormcrown spire', { name: 'Storm sprite', power: 280, dmg: 150 }, [10, 24],
  [d('storm_essence', 0.45, 1, 2), d('glow_essence', 0.3, 1, 2)]);
F('fight_chapel', 'mender', 'Drowned acolytes', 40, 8, 64, 'Sunken chapel', { name: 'Drowned acolyte', power: 360, dmg: 200 }, [15, 30],
  [d('storm_essence', 0.5, 1, 2), d('river_pearl', 0.1, 1, 1), d('glow_essence', 0.3, 1, 2)]);
F('fight_barrow', 'mender', 'Barrow revenants', 50, 9, 88, 'Moonlit barrow', { name: 'Barrow revenant', power: 450, dmg: 250 }, [22, 46],
  [d('moon_essence', 0.35, 1, 1), d('storm_essence', 0.3, 1, 2), d('bone_shard', 0.5, 1, 3)]);

// gear items + recipes (gear spec 2026-11-12): families x tiers, see data/gear/
{ const g = buildGear(undefined, (id) => (items[id] ? items[id].value : 0)); Object.assign(items, g.items); g.actions.forEach((a) => actions.push(a)); }

// crafted item values: ~1.3x the Standard value of the recipe inputs, per unit made
for (const a of actions as any[]) {
  if (a.kind !== 'craft') continue;
  let cost = 0;
  for (const [id, q] of Object.entries(a.inputs) as [string, any][]) cost += items[id].value * q;
  for (const [id, q] of Object.entries(a.outputs) as [string, any][]) {
    if (items[id].value == null) items[id].value = Math.max(1, Math.round((cost * 1.3) / q));
  }
}

// ---------- bosses ----------
const bosses = [
  { id: 'ashen_wyrm', name: 'Ashen Wyrm', title: 'Boss 1', hp: 1700000, power: 200, reqPower: 300, weekends: 1.6, cores: 24, weakTo: 'frost', hits: 'fire',
    phases: [{ name: 'Scorched hide', check: 'mitigation' }, { name: 'Burn', check: 'damage' }, { name: 'Ember rain', check: 'healing' }],
    loot: [d('wyrm_core', 0.15, 1, 1), d('ember_scale', 0.6, 1, 3), d('coal', 0.8, 4, 10)],
    palette: ['#3b2a2a', '#c2462e', '#f0a04b'] },
  { id: 'rimefang_matriarch', name: 'Rimefang Matriarch', title: 'Boss 2', hp: 4700000, power: 340, reqPower: 500, weekends: 1.8, cores: 24, weakTo: 'fire', hits: 'frost',
    phases: [{ name: 'Frozen pelt', check: 'mitigation' }, { name: 'Blizzard howl', check: 'healing' }, { name: 'Pack frenzy', check: 'damage' }],
    loot: [d('rimefang_core', 0.15, 1, 1), d('rime_shard', 0.6, 1, 3), d('wolf_pelt', 0.8, 4, 8)],
    palette: ['#1f2c3d', '#5d9ccf', '#dff3ff'] },
  { id: 'blightroot_colossus', name: 'Blightroot Colossus', title: 'Boss 3', hp: 7800000, power: 500, reqPower: 750, weekends: 2.0, cores: 22, weakTo: 'holy', hits: 'venom',
    phases: [{ name: 'Barkskin', check: 'mitigation' }, { name: 'Spore cloud', check: 'healing' }, { name: 'Uprooting', check: 'damage' }],
    loot: [d('blight_core', 0.15, 1, 1), d('venom_gland', 0.6, 1, 3), d('bloodmoss', 0.8, 3, 8)],
    palette: ['#1f2a1a', '#5f8a2e', '#c6e05a'] },
  { id: 'sunfallen_seraph', name: 'Sunfallen Seraph', title: 'Boss 4', hp: 11500000, power: 660, reqPower: 1000, weekends: 2.2, cores: 20, weakTo: 'venom', hits: 'holy',
    phases: [{ name: 'Radiant ward', check: 'mitigation' }, { name: 'Judgement', check: 'damage' }, { name: 'Searing light', check: 'healing' }],
    loot: [d('seraph_core', 0.15, 1, 1), d('halo_fragment', 0.6, 1, 3), d('sunpetal', 0.7, 2, 5)],
    palette: ['#3a2f1a', '#d9b44a', '#fff4c2'] },
  { id: 'hollow_king', name: 'The Hollow King', title: 'Boss 5', hp: 15000000, power: 800, reqPower: 1200, weekends: 2.4, cores: 18, weakTo: 'holy', hits: 'frost',
    phases: [{ name: 'Grave guard', check: 'mitigation' }, { name: 'Soul drain', check: 'healing' }, { name: 'Last court', check: 'damage' }],
    loot: [d('crown_core', 0.15, 1, 1), d('grave_silver', 0.6, 1, 3), d('moon_essence', 0.7, 2, 4)],
    palette: ['#1c1a24', '#6b5b8f', '#c9b8f0'] },
  { id: 'abyssal_leviathan', name: 'Abyssal Leviathan', title: 'Boss 6', hp: 20000000, power: 1000, reqPower: 1500, weekends: 2.6, cores: 16, weakTo: 'frost', hits: 'venom',
    phases: [{ name: 'Tidal shell', check: 'mitigation' }, { name: 'Undertow', check: 'damage' }, { name: 'Brine plague', check: 'healing' }],
    loot: [d('leviathan_core', 0.15, 1, 1), d('abyssal_pearl', 0.6, 1, 2), d('black_pearl', 0.5, 1, 3)],
    palette: ['#0f1d2a', '#2b6f8a', '#7fe0d0'] }
];

// chest + tier drops reuse each boss's non-core loot; extra per-boss mats for the floor payout
const bossFloor = { ashen_wyrm: 'coal', rimefang_matriarch: 'wolf_pelt', blightroot_colossus: 'bloodmoss',
  sunfallen_seraph: 'sunpetal', hollow_king: 'moon_essence', abyssal_leviathan: 'black_pearl' };
bosses.forEach((b: any) => { b.floorItem = bossFloor[b.id]; b.coreItem = b.loot[0].item; b.bossMat = b.loot[1].item; });

// ---------- v4: raid roles, stat tags, rules, crew ranks ----------
const raidRoles = [
  { id: 'guardian', name: 'Guardian', check: 'mitigation', stat: 'def', powerLabel: 'Defence power', aura: 'mitigation', takesHits: true, blurb: 'Soaks hits. Fills mitigation checks.' },
  { id: 'mender', name: 'Mender', check: 'healing', stat: 'heal', powerLabel: 'Healing power', aura: 'healing', takesHits: true, blurb: 'Keeps the line standing. Fills healing checks.' },
  { id: 'striker', name: 'Striker', check: 'damage', stat: 'atk', powerLabel: 'Damage power', aura: 'damage', takesHits: true, blurb: 'Hits hard. Fills damage checks.' },
  { id: 'supply', name: 'Supply line', check: null, stat: null, powerLabel: 'Supplies carried', aura: null, takesHits: false, blurb: 'Carries your pouch to the front. Counts as attendance; no hits taken.' }
];
const tactics = [
  { id: 'focus', name: 'Focus adds', blurb: '+15% damage in damage phases.' },
  { id: 'interrupt', name: 'Interrupt casts', blurb: '-25% damage taken in healing phases.' },
  { id: 'endure', name: 'Brace', blurb: '+20% mitigation all fight.' }
];
const stances = [
  { id: 'aggressive', name: 'Aggressive', blurb: '+25% damage, +30% damage taken.' },
  { id: 'balanced', name: 'Balanced', blurb: 'No modifiers.' },
  { id: 'defensive', name: 'Defensive', blurb: '-20% damage, -30% damage taken, +20% mitigation.' }
];
const ALL = { viewVault: true, deposit: true, withdraw: true, postRequisitions: true, setSchedule: true, marketList: true, manageRoles: true };
const crewRanks = [
  { id: 'leader', name: 'Leader', perms: ALL, withdrawCap: Infinity },
  { id: 'officer', name: 'Officer', perms: Object.assign({}, ALL), withdrawCap: 40 },
  { id: 'member', name: 'Member', perms: { viewVault: true, deposit: true, withdraw: false, postRequisitions: false, setSchedule: false, marketList: false, manageRoles: false }, withdrawCap: 0 },
  { id: 'recruit', name: 'Recruit', perms: { viewVault: true, deposit: true, withdraw: false, postRequisitions: false, setSchedule: false, marketList: false, manageRoles: false }, withdrawCap: 0 }
];

// ---- Economy unit H: one hour of a typical level-40 player's income (gold/hour) at speedFactor 1.
// Measured with E.incomePerHour: the median, across the four gathering skills, of each skill's best
// level-40 action sold at Standard value after market tax. test/economy.test.ts re-measures it and
// fails if this drifts more than 5%. Every gold amount priced "in hours of play" derives from H, so a
// speed change rescales them all from here.
const SPEED = 1;
export const H = Math.round(14820 / SPEED);
export const ECON = {
  H,
  specSwitchHours: 3,          // spec switch = ~3 H
  raidPayHours: 1.5,           // a player's NET raid gold at boss tier 1, full contribution, full turnout
  raidTierGrowth: 1.25,        // x per boss tier above the first
  raidTreasuryShare: 0.025,    // share of each raid gold pool routed to the crew treasury: a typical 5-person crew (~55k pool) banks ~1.4k, enough at 75% to fund next week's ~1k of town contracts
  raidCapAttendees: 18,        // pool cap = this many full-turnout attendees' worth (bites only for big crews)
  contractRewardMult: 1.1,     // contract pay per unit = item value x this (market sale nets 0.95 x value)
  // Raid gold split (owner 2026-11-09): of the payable pool (pool - treasury share), raidEvenShare is split
  // evenly between attendees (the floor share) and raidContribShare by each attendee's share of the
  // crew's check points. Each player's payout is capped at raidCapIncomeHours x THEIR own hourly income
  // (E.hourlyIncome: the H measure at their levels); what the cap cuts goes to the crew treasury.
  raidEvenShare: 0.25,
  raidContribShare: 0.75,
  raidCapIncomeHours: 3,
  // Salvage (QoL pass 2026-11-11): share of a gear piece's recipe inputs returned, by the piece's rarity.
  // Per input: qty x pct, rounded up or down at random (expected value exact). Mats come back at the
  // grade matching the piece's quality.
  salvagePct: { common: 0.2, uncommon: 0.4, rare: 0.6, epic: 0.75, legendary: 0.9, mythic: 1 } as Record<string, number>,
  // NPC general store (2026-11-08; replaces the player market, which is parked). Prices are multiples of
  // item value, so in hours of play: buying 1 H worth of a level-40 gatherer's output costs ~1.58 H
  // (1.5 / 0.95 after-tax value); selling 1 H of output to the store returns ~0.42 H.
  storeResourceMult: 1.5,      // store buy price for raw/refined materials = value x this
  storeGearMult: 2,            // store buy price for gear (Common, Standard) = value x this; value = 1.3x inputs, so ~2.6x the mats: crafting stays worthwhile
  storeSellMult: 0.4,          // the store buys anything from the player at value x this (gold floor + sink); below contracts (1.1x)
  storeResourceSlots: 6,       // resource slots per hourly rotation
  storeGearSlots: 3,           // gear slots per hourly rotation
  storeGearMaxTier: 1,         // fight gear tiers in the hourly rotation (gear spec: T1 only)
  // Common T1 tools, Rough grade, always on sale (owner playtest 2026-11-13; was Uncommon 600g). 1,000g: pays back in
  // 30–45 h of gathering at level 7 vs no tool, and stays dearer than repairing a fully worn T1 tool (990g).
  storeToolPrice: 1000,
  storeToolTier: 1,
  storeToolRarity: 'common',
};

// Display rarity per item id (the collect reveal orders rarer items last and flashes their ink).
// Stackables use their tier (1 common .. 5 legendary); boss cores are mythic. A crafted gear PIECE has
// its own rolled rarity on the instance (gear.rarity), which wins over this base value.
export const TIER_RARITY = ['common', 'common', 'uncommon', 'rare', 'epic', 'legendary'];
export const itemRarity: Record<string, string> = {};
for (const id of Object.keys(items)) {
  const it = items[id];
  it.rarity = it.kind === 'core' ? 'mythic' : TIER_RARITY[Math.max(1, Math.min(5, Math.floor(Number(it.tier) || 1)))];
  itemRarity[id] = it.rarity;
}

export const DATA: any = {
  config: {
    saveKey: 'guildwright-proto-v1',
    startingGold: 150,
    xpMult: 4,
    // Owner decision 2026-11-11: levelling was too fast. Every level's XP threshold is x this (owner 2026-11-11: 5).
    xpCurveMult: 5,
    // Owner decision 2026-11-11: offline is more rewarding than watching. Catch-up runs at 1.5x active
    // speed with no time limit (offlineCapSec 0 = unlimited; was 12 h at 10% speed).
    offlineCapSec: 0,
    offlineRate: 1,
    maxLevel: 99,
    marketTax: 0.05,
    // Player market parked 2026-11-08 (the NPC general store replaces it). The code stays; with this
    // false the NPC board never refreshes, listings never fill, buy/list refuse, and loading a save
    // cancels the player's open listings (items back to the bag).
    playerMarket: false,
    pityThreshold: 40,
    speedFactor: SPEED,           // phase 2.5: match the prototype's pace (owner's call, 2026-11-08)
    baseHp: 600,                  // x10 combat scale (gear spec 2026-11-12)
    hpPerCombatLevel: 40,
    // v4 weekend raids
    raidWindow: { startDay: 6, startHour: 10, endDay: 0, endHour: 22 }, // Sat 10:00 -> Sun 22:00 local
    raidChargeHours: 10,          // raid hours per weekend; 6 frames per hour in the sim
    serverPop: 1200,              // simulated active players (trailing 4 weeks drive boss HP)
    serverTurnout: 0.85,
    checkpoints: [0.25, 0.5, 0.75],
    tierShares: { bronze: 0.5, silver: 1.0, gold: 2.0 },   // x fair share (1 / population)
    tierTickets: { floor: 1, bronze: 2, silver: 4, gold: 8 },
    corePityMax: 3,               // fallback; see corePityByTier
    corePityByTier: { gold: 3, silver: 4, bronze: 5, none: 6 }, // empty joined kills before a guaranteed core, by contribution tier
    auraTierAttendance: [6, 12, 20], // doc: 10/25/50; scaled for the prototype's ~16-member crews
    auraStrength: [0, 0.04, 0.08, 0.12],
    faintFrames: 3,               // 30 min at camp
    reviveDurability: 2,
    pouchCap: 60,
    // Raid gold (in hours of play, see ECON): pool = perAttendee x attendees x tierScale x contribution x
    // turnoutFactor, capped at perAttendee x raidCapAttendees x tierScale. raidTreasuryShare of the pool goes
    // to the crew treasury, the rest is split evenly between attendees. perAttendee is set so the net
    // per-player share at tier 1 with full contribution and turnout is raidPayHours x H.
    raidGoldPerAttendee: Math.round(ECON.raidPayHours * H / (1 - ECON.raidTreasuryShare)),
    raidTierGrowth: ECON.raidTierGrowth,
    raidCapAttendees: ECON.raidCapAttendees,
    raidTreasuryShare: ECON.raidTreasuryShare,
    weekBuffs: [{ kind: 'repair', value: 0.3, label: 'Repairs 30% cheaper' }], // market-tax buff removed 2026-11-09 (market parked)
    crewStartTreasury: 120,
    // phase 2.5: town contracts (generated each Monday from what the coming raid needs). Gold only.
    contractBudgetShare: 0.75,    // share of free treasury gold escrowed for town contract rewards
    contractRewardMult: ECON.contractRewardMult, // gold per unit = item value x this (>= market after tax)
    contractNpcShare: 0.5,        // NPC crewmates fill at most this share of each contract (Fri until the raid)
    // ~3 hours of a typical level-40 player's income: the median, across the four gathering skills,
    // of each skill's best level-40 action sold at Standard value after tax (~14,800 g/h at speedFactor 1).
    // Pinned by test/economy.test.ts (cost / hourly income must stay within 2.5-3.5).
    specSwitchCost: Math.round(ECON.specSwitchHours * H / 1000) * 1000,
    // core draw: average tier tickets per server participant (floor ticket is added on top)
    serverAvgTierTickets: 2.6
  },

  rarities: [
    { id: 'common', name: 'Common', baseChance: 0.70, affixSlots: 0, statMult: 1.00, durability: 100, valueMult: 1 },
    { id: 'uncommon', name: 'Uncommon', baseChance: 0.22, affixSlots: 1, statMult: 1.15, durability: 130, valueMult: 2.5 },
    { id: 'rare', name: 'Rare', baseChance: 0.065, affixSlots: 2, statMult: 1.30, durability: 160, valueMult: 8 },
    { id: 'epic', name: 'Epic', baseChance: 0.013, affixSlots: 3, statMult: 1.50, durability: 200, valueMult: 30 },
    { id: 'legendary', name: 'Legendary', baseChance: 0.002, affixSlots: 4, statMult: 1.75, durability: 300, valueMult: 120 },
    { id: 'mythic', name: 'Mythic', baseChance: 0, affixSlots: 5, statMult: 2.10, durability: 400, valueMult: 500 }
  ],

  grades: [
    { id: 'rough', name: 'Rough', min: 1, max: 39, mult: 0.85, procMult: 0.9 },
    { id: 'standard', name: 'Standard', min: 40, max: 59, mult: 1.00, procMult: 1.0 },
    { id: 'fine', name: 'Fine', min: 60, max: 79, mult: 1.15, procMult: 1.15 },
    { id: 'superior', name: 'Superior', min: 80, max: 94, mult: 1.30, procMult: 1.3 },
    { id: 'pristine', name: 'Pristine', min: 95, max: 100, mult: 1.50, procMult: 1.45 }
  ],

  masteryTiers: [
    { crafts: 0, mult: 1.0, name: 'Novice' }, { crafts: 10, mult: 1.1, name: 'Apprentice' },
    { crafts: 100, mult: 1.25, name: 'Journeyman' }, { crafts: 1000, mult: 1.5, name: 'Master' },
    { crafts: 10000, mult: 1.75, name: 'Grandmaster' }
  ],

  skills: [
    { id: 'mining', name: 'Mining', tier: 'gathering', blurb: 'Ore, coal and gems.' },
    { id: 'woodcutting', name: 'Woodcutting', tier: 'gathering', blurb: 'Logs and amber resin.' },
    { id: 'herbalism', name: 'Herbalism', tier: 'gathering', blurb: 'Herbs, grain and plant fibers.' },
    { id: 'fishing', name: 'Fishing', tier: 'gathering', blurb: 'Fish for the pot and pearls for the jeweller.' },
    { id: 'smelting', name: 'Smelting', tier: 'refining', blurb: 'Ore into bars, bars into rivets.' },
    { id: 'carpentry', name: 'Carpentry', tier: 'refining', blurb: 'Logs into planks; resin into varnish.' },
    { id: 'tanning', name: 'Tanning', tier: 'refining', blurb: 'Hides into leather and straps.' },
    { id: 'weaving', name: 'Weaving', tier: 'refining', blurb: 'Fibers into thread and cloth.' },
    { id: 'smithing', name: 'Smithing', tier: 'crafting', blurb: 'Blades, maces and plate armour.' },
    { id: 'woodworking', name: 'Woodworking', tier: 'crafting', blurb: 'Bows, staves and shields.' },
    { id: 'leatherworking', name: 'Leatherworking', tier: 'crafting', blurb: 'Light armour for strikers.' },
    { id: 'tailoring', name: 'Tailoring', tier: 'crafting', blurb: 'Robes and hoods for menders.' },
    { id: 'jewelcrafting', name: 'Jewelcrafting', tier: 'crafting', blurb: 'Rings and cut catalysts.' },
    { id: 'alchemy', name: 'Alchemy', tier: 'crafting', blurb: 'Potions, buffs and catalysts.' },
    { id: 'cooking', name: 'Cooking', tier: 'crafting', blurb: 'Food that keeps you standing.' },
    { id: 'guardian', name: 'Guardian', tier: 'combat', blurb: 'Hold the line. Defence wins fights.' },
    { id: 'mender', name: 'Mender', tier: 'combat', blurb: 'Heal through it. Essences drop here.' },
    { id: 'striker', name: 'Striker', tier: 'combat', blurb: 'Hit hard. Hides and silk drop here.' }
  ],

  elements: ['fire', 'frost', 'venom', 'holy'],

  items,
  itemRarity,
  actions,

  affixes: AFFIXES,
  effects: EFFECTS,
  fightSlots: FIGHT_SLOTS,
  outfitSets: OUTFIT_SETS,
  outfitPieces: OUTFIT_PIECES,
  toolSkills: TOOL_SKILLS,
  skillGroups: SKILL_GROUP,

  bosses,
  raidRoles,
  tactics,
  stances,
  crewRanks,

  npcNames: [
    'Brannoc', 'Mirelle', 'Tobyn_Ash', 'Kestra', 'Holt', 'Wenna', 'Corvin', 'Ilsabet', 'Rook77', 'Fenwick',
    'Sable', 'Dunmore', 'Petra_V', 'Oswin', 'Yara', 'Gideon', 'Linnet', 'Marrow', 'Tamsin', 'Quill',
    'Brisa', 'Halvard', 'Nettlefoot', 'Ines', 'Calder', 'Juno_K', 'Wrenna', 'Barlow', 'Ottilie', 'Severin'
  ],
  npcGuilds: [
    { name: 'Iron Pact', aura: 'mitigation' },
    { name: 'Lantern Wardens', aura: 'healing' },
    { name: 'Red Tithe', aura: 'damage' },
    { name: 'Copperbell Union', aura: 'mitigation' },
    { name: 'Mossgate Menders', aura: 'healing' },
    { name: 'Ninefold Blades', aura: 'damage' },
    { name: 'Saltmarch Crew', aura: 'damage' }
  ],

  starter: {
    items: { bread: [0, 10, 0, 0, 0] },
    // fight starter kit (Common, Rough) worn; every new save also gets a Common T1 Standard tool in all 15 tool slots
    gear: [{ itemId: 'bronze_sword', equip: true, quality: 30 }, { itemId: 'hessian_robe', equip: true, quality: 30 }],
    toolTier: 1
  }
};
