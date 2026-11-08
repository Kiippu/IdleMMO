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
// gear value is derived from its recipe below when left null
const gear = (id: string, name: string, tier: any, sprite: any, tint: any, slot: any, role: any, stats: any, extra?: any) =>
  add(id, name, 'gear', tier, null, sprite, tint, Object.assign({ slot, role, stats }, extra || {}));
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

// gear: striker
gear('training_sword', 'Training sword', 1, 'sword', '#b8875a', 'weapon', 'striker', { atk: 3 });
gear('pine_shortbow', 'Pine shortbow', 1, 'bow', '#d1a46b', 'weapon', 'striker', { atk: 4 });
gear('bronze_sword', 'Bronze sword', 1, 'sword', '#b08d57', 'weapon', 'striker', { atk: 7 });
gear('leather_cap', 'Leather cap', 1, 'helm', '#b08560', 'head', 'striker', { atk: 1, def: 1 }, { tags: { hunting: 0.05 } });
gear('leather_jerkin', 'Leather jerkin', 1, 'chest', '#b08560', 'chest', 'striker', { atk: 1, def: 2, hp: 5 });
gear('leather_breeches', 'Leather breeches', 1, 'legs', '#a07850', 'legs', 'striker', { atk: 1, def: 1, hp: 4 });
gear('iron_longsword', 'Iron longsword', 2, 'sword', '#8f8f95', 'weapon', 'striker', { atk: 12 });
gear('oak_longbow', 'Oak longbow', 2, 'bow', '#a97a48', 'weapon', 'striker', { atk: 11 });
gear('studded_jerkin', 'Studded jerkin', 2, 'chest', '#8b5a3c', 'chest', 'striker', { atk: 2, def: 4, hp: 10 });
gear('studded_leggings', 'Studded leggings', 2, 'legs', '#8b5a3c', 'legs', 'striker', { atk: 1, def: 3, hp: 8 }, { tags: { hunting: 0.08 } });
gear('frostbite_saber', 'Frostbite saber', 3, 'sword', '#9fd8ee', 'weapon', 'striker', { atk: 18 }, { element: 'frost' });
gear('venomstring_bow', 'Venomstring yew bow', 3, 'bow', '#6f8f3a', 'weapon', 'striker', { atk: 20 }, { element: 'venom' });
gear('hardened_hood', 'Hardened hood', 3, 'helm', '#5b3a26', 'head', 'striker', { atk: 3, def: 4, hp: 8 }, { tags: { hunting: 0.12 } });
gear('hardened_brigandine', 'Hardened brigandine', 3, 'chest', '#5b3a26', 'chest', 'striker', { atk: 4, def: 9, hp: 25 });
gear('emberbrand', 'Emberbrand', 4, 'sword', '#e2603a', 'weapon', 'striker', { atk: 32 }, { element: 'fire' });
gear('dawnstring_greatbow', 'Dawnstring greatbow', 4, 'bow', '#f2d27a', 'weapon', 'striker', { atk: 30 }, { element: 'holy' });
gear('drakeskin_leggings', 'Drakeskin leggings', 4, 'legs', '#3d6b4f', 'legs', 'striker', { atk: 5, def: 10, hp: 30 });
gear('drakeskin_coat', 'Drakeskin coat', 4, 'chest', '#3d6b4f', 'chest', 'striker', { atk: 7, def: 14, hp: 40 });
// gear: guardian
gear('pine_buckler', 'Pine buckler', 1, 'shield', '#d1a46b', 'offhand', 'guardian', { def: 3 });
gear('copper_helm', 'Copper helm', 1, 'helm', '#d08a55', 'head', 'guardian', { def: 2, hp: 5 }, { tags: { mining: 0.05 } });
gear('bronze_mace', 'Bronze mace', 1, 'sword', '#b08d57', 'weapon', 'guardian', { atk: 3, def: 2 });
gear('bronze_chainmail', 'Bronze chainmail', 2, 'chest', '#b08d57', 'chest', 'guardian', { def: 7, hp: 15 });
gear('oak_kite_shield', 'Oak kite shield', 2, 'shield', '#a97a48', 'offhand', 'guardian', { def: 7, hp: 10 });
gear('iron_greaves', 'Iron greaves', 2, 'legs', '#8f8f95', 'legs', 'guardian', { def: 6, hp: 12 });
gear('iron_warhammer', 'Iron warhammer', 2, 'sword', '#8f8f95', 'weapon', 'guardian', { atk: 6, def: 4 });
gear('steel_greathelm', 'Steel greathelm', 3, 'helm', '#b4bcc6', 'head', 'guardian', { def: 9, hp: 20 });
gear('steel_cuirass', 'Steel cuirass', 3, 'chest', '#b4bcc6', 'chest', 'guardian', { def: 16, hp: 40 });
gear('yew_tower_shield', 'Yew tower shield', 3, 'shield', '#7b4f33', 'offhand', 'guardian', { def: 14, hp: 25 });
gear('stoneheart_maul', 'Stoneheart maul', 3, 'sword', '#8c8c7a', 'weapon', 'guardian', { atk: 10, def: 6, hp: 15 }, { element: 'holy' });
gear('mithril_greaves', 'Mithril greaves', 4, 'legs', '#7fd0e0', 'legs', 'guardian', { def: 16, hp: 35 });
gear('drakescale_aegis', 'Drakescale aegis', 4, 'shield', '#4f8f6a', 'offhand', 'guardian', { def: 22, hp: 45 });
gear('mithril_plate', 'Mithril plate', 4, 'chest', '#7fd0e0', 'chest', 'guardian', { def: 28, hp: 70 });
// gear: mender
gear('padded_tunic', 'Padded tunic', 1, 'chest', '#d8cbb0', 'chest', 'mender', { def: 2, heal: 1, hp: 10 }, { tags: { quality: 2 } });
gear('pine_staff', 'Pine staff', 1, 'staff', '#d1a46b', 'weapon', 'mender', { atk: 1, heal: 4 });
gear('linen_hood', 'Linen hood', 1, 'helm', '#efe7d2', 'head', 'mender', { heal: 1, hp: 3 }, { tags: { foraging: 0.05 } });
gear('linen_robe', 'Linen robe', 1, 'chest', '#efe7d2', 'chest', 'mender', { def: 1, heal: 2, hp: 6 });
gear('oak_staff', 'Oak staff', 2, 'staff', '#a97a48', 'weapon', 'mender', { atk: 2, heal: 9 });
gear('canvas_trousers', 'Canvas trousers', 2, 'legs', '#8b9a5b', 'legs', 'mender', { def: 3, heal: 2, hp: 8 }, { tags: { foraging: 0.06 } });
gear('nettle_robe', 'Nettle robe', 2, 'chest', '#8b9a5b', 'chest', 'mender', { def: 2, heal: 5, hp: 10 });
gear('herbalist_cowl', 'Herbalist cowl', 2, 'helm', '#7d8f4e', 'head', 'mender', { def: 1, heal: 3, hp: 6 }, { tags: { foraging: 0.12 } });
gear('dawnward_staff', 'Dawnward staff', 3, 'staff', '#f2e3a0', 'weapon', 'mender', { atk: 4, heal: 18 }, { element: 'holy' });
gear('silk_cowl', 'Silk cowl', 3, 'helm', '#f3eefa', 'head', 'mender', { def: 2, heal: 6, hp: 10 }, { tags: { quality: 4 } });
gear('silk_trousers', 'Silk trousers', 3, 'legs', '#e9d9f2', 'legs', 'mender', { def: 4, heal: 5, hp: 14 });
gear('silk_robe', 'Silk robe', 3, 'chest', '#e9d9f2', 'chest', 'mender', { def: 4, heal: 10, hp: 20 });
gear('moonweave_hood', 'Moonweave hood', 4, 'helm', '#cfd8ff', 'head', 'mender', { def: 3, heal: 10, hp: 18 });
gear('moonweave_vestment', 'Moonweave vestment', 4, 'chest', '#cfd8ff', 'chest', 'mender', { def: 7, heal: 18, hp: 40 });
gear('moonheart_staff', 'Moonheart staff', 4, 'staff', '#dfe5ff', 'weapon', 'mender', { atk: 6, heal: 32 }, { element: 'holy' });
// gear: rings (jewelcrafting)
gear('copper_band', 'Copper band', 1, 'ring', '#d08a55', 'ring', 'guardian', { hp: 6 }, { tags: { mining: 0.04 } });
gear('gemstone_ring', 'Gemstone ring', 1, 'ring', '#9aa77f', 'ring', 'striker', { atk: 2 }, { tags: { quality: 3 } });
gear('glowstone_ring', 'Glowstone ring', 2, 'ring', '#8fe3c0', 'ring', 'mender', { heal: 3 }, { tags: { foraging: 0.06 } });
gear('iron_signet', 'Iron signet', 2, 'ring', '#8f8f95', 'ring', 'guardian', { def: 3, hp: 8 }, { tags: { mining: 0.06 } });
gear('pearl_ring', 'Pearl-set silver ring', 3, 'ring', '#efe6da', 'ring', 'mender', { heal: 6, hp: 6 }, { tags: { fishing: 0.08 } });
gear('sapphire_signet', 'Sapphire signet', 3, 'ring', '#3a64c8', 'ring', 'guardian', { def: 5, hp: 20 });
gear('ruby_warband', 'Ruby war-band', 4, 'ring', '#c8304a', 'ring', 'striker', { atk: 8, hp: 10 }, { element: 'fire' });
gear('black_pearl_ring', 'Black pearl ring', 4, 'ring', '#3a3448', 'ring', 'mender', { heal: 12, hp: 12 });

// gear: skill tools and clothing (boost gathering / crafting; light combat stats)
gear('copper_pickaxe', 'Copper pickaxe', 1, 'sword', '#d08a55', 'weapon', 'utility', { atk: 1 }, { tags: { mining: 0.15 } });
gear('bronze_hatchet', 'Bronze hatchet', 1, 'sword', '#b08d57', 'weapon', 'utility', { atk: 2 }, { tags: { woodcutting: 0.15 } });
gear('iron_pickaxe', 'Iron pickaxe', 2, 'sword', '#8f8f95', 'weapon', 'utility', { atk: 3 }, { tags: { mining: 0.25 } });
gear('iron_felling_axe', 'Iron felling axe', 2, 'sword', '#8f8f95', 'weapon', 'utility', { atk: 4 }, { tags: { woodcutting: 0.25 } });
gear('foragers_satchel', "Forager's satchel", 1, 'shield', '#c9b98a', 'offhand', 'utility', { hp: 3 }, { tags: { foraging: 0.15 } });
gear('anglers_hat', "Angler's hat", 1, 'helm', '#9fb4bf', 'head', 'utility', { hp: 3 }, { tags: { fishing: 0.15 } });
gear('artisans_apron', "Artisan's apron", 2, 'chest', '#8b5a3c', 'chest', 'utility', { def: 1, hp: 6 }, { tags: { quality: 6 } });
gear('trappers_leggings', "Trapper's leggings", 2, 'legs', '#7d7468', 'legs', 'utility', { def: 2, hp: 6 }, { tags: { hunting: 0.15 } });

// food (cooking)
food('bread', 'Bread', 1, '#d9a35b', 12);
food('grilled_minnows', 'Grilled minnows', 1, '#c9a27a', 10);
food('herb_trout', 'Herb-baked trout', 2, '#b88a5a', 25);
food('bloodmoss_broth', 'Bloodmoss broth', 2, '#a3443c', 40);
food('salmon_pie', 'Salmon pie', 3, '#e09a6a', 55);
food('frostcap_salmon', 'Frostcap salmon', 3, '#e8b0a0', 75);
food('angler_feast', 'Angler feast', 4, '#f2c94c', 110);
// potions (alchemy)
potion('mint_tonic', 'Mint tonic', 1, '#7fd18a', { heal: 15 });
potion('wisplight_salve', 'Wisplight salve', 1, '#b7c7e8', { heal: 25 });
potion('ironskin_draught', 'Ironskin draught', 2, '#9a9a8a', { buff: { stat: 'def', pct: 0.1 } });
potion('fury_draught', 'Fury draught', 2, '#d0463c', { buff: { stat: 'atk', pct: 0.1 } });
potion('restoring_elixir', 'Restoring elixir', 3, '#e06a8a', { heal: 60 });
potion('frostward_tonic', 'Frostward tonic', 3, '#8fd3e8', { heal: 20, buff: { stat: 'def', pct: 0.15 } });
potion('clarity_draught', 'Clarity draught', 3, '#b4a8f5', { buff: { stat: 'heal', pct: 0.15 } });
potion('sunpetal_elixir', 'Sunpetal elixir', 4, '#f6d55c', { heal: 120, buff: { stat: 'heal', pct: 0.2 } });
potion('rimeheart_draught', 'Rimeheart draught', 5, '#bfe8ff', { heal: 40, buff: { stat: 'def', pct: 0.25 } });
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

// crafting: smithing
C('training_sword', 'smithing', 'Training sword', 1, 4, 12, { copper_bar: 1, pine_plank: 1 });
C('copper_helm', 'smithing', 'Copper helm', 3, 5, 16, { copper_bar: 2, copper_rivet: 6 });
C('bronze_mace', 'smithing', 'Bronze mace', 6, 5, 20, { bronze_bar: 3, pine_plank: 1 });
C('bronze_sword', 'smithing', 'Bronze sword', 8, 5, 22, { bronze_bar: 3, copper_rivet: 4, rough_leather: 1 });
C('bronze_chainmail', 'smithing', 'Bronze chainmail', 12, 6, 30, { bronze_bar: 4, copper_rivet: 20, rough_leather: 1 });
C('iron_longsword', 'smithing', 'Iron longsword', 20, 6, 40, { iron_bar: 3, copper_rivet: 6, tanned_leather: 1 });
C('iron_greaves', 'smithing', 'Iron greaves', 22, 6, 42, { iron_bar: 3, leather_strap: 2, copper_rivet: 10 });
C('iron_warhammer', 'smithing', 'Iron warhammer', 25, 7, 48, { iron_bar: 3, oak_plank: 1, tanned_leather: 1 });
C('frostbite_saber', 'smithing', 'Frostbite saber', 35, 8, 75, { steel_bar: 6, leather_strap: 2, copper_rivet: 16, frostcap: 2 });
C('steel_greathelm', 'smithing', 'Steel greathelm', 38, 8, 80, { steel_bar: 5, leather_strap: 2, copper_rivet: 20, linen_cloth: 1 });
C('stoneheart_maul', 'smithing', 'Stoneheart maul', 42, 8, 90, { steel_bar: 4, stone_heart: 1, yew_plank: 1, hardened_leather: 1 });
C('steel_cuirass', 'smithing', 'Steel cuirass', 45, 10, 120, { steel_bar: 12, leather_strap: 4, copper_rivet: 40 });
C('mithril_greaves', 'smithing', 'Mithril greaves', 56, 9, 140, { mithril_bar: 6, drakeskin: 2, copper_rivet: 30, linen_cloth: 2 });
C('emberbrand', 'smithing', 'Emberbrand', 58, 10, 165, { mithril_bar: 6, drakeskin: 2, copper_rivet: 30, ruby: 2 });
C('mithril_plate', 'smithing', 'Mithril plate', 60, 10, 200, { mithril_bar: 10, drake_scale: 1, drakeskin: 4, copper_rivet: 60 });
C('copper_pickaxe', 'smithing', 'Copper pickaxe', 2, 4, 14, { copper_bar: 2, pine_plank: 1 });
C('bronze_hatchet', 'smithing', 'Bronze hatchet', 5, 5, 18, { bronze_bar: 2, pine_plank: 1 });
C('iron_pickaxe', 'smithing', 'Iron pickaxe', 18, 6, 36, { iron_bar: 2, oak_plank: 1, leather_strap: 1 });
C('iron_felling_axe', 'smithing', 'Iron felling axe', 21, 6, 40, { iron_bar: 2, oak_plank: 2 });
// woodworking
C('pine_shortbow', 'woodworking', 'Pine shortbow', 1, 4, 12, { pine_plank: 2, linen_thread: 1 });
C('pine_buckler', 'woodworking', 'Pine buckler', 1, 4, 12, { pine_plank: 3, copper_rivet: 4 });
C('pine_staff', 'woodworking', 'Pine staff', 3, 4, 14, { pine_plank: 3, faint_essence: 1 });
C('oak_kite_shield', 'woodworking', 'Oak kite shield', 15, 6, 34, { oak_plank: 3, iron_bar: 1, copper_rivet: 8 });
C('oak_staff', 'woodworking', 'Oak staff', 16, 6, 34, { oak_plank: 3, glow_essence: 1, copper_bar: 1 });
C('oak_longbow', 'woodworking', 'Oak longbow', 18, 6, 38, { oak_plank: 3, linen_thread: 2, bone_shard: 2 });
C('dawnward_staff', 'woodworking', 'Dawnward staff', 35, 8, 75, { yew_plank: 3, storm_essence: 2, silver_bar: 1, wood_varnish: 1 });
C('venomstring_bow', 'woodworking', 'Venomstring yew bow', 38, 8, 80, { yew_plank: 4, silk_thread: 3, bloodmoss: 3, wood_varnish: 1 });
C('yew_tower_shield', 'woodworking', 'Yew tower shield', 40, 8, 85, { yew_plank: 4, steel_bar: 3, hardened_leather: 2, copper_rivet: 20 });
C('dawnstring_greatbow', 'woodworking', 'Dawnstring greatbow', 55, 9, 150, { ironwood_plank: 4, silk_cloth: 1, drakeskin: 2, wood_varnish: 2, sunpetal: 1 });
C('drakescale_aegis', 'woodworking', 'Drakescale aegis', 57, 10, 170, { ironwood_plank: 4, drake_scale: 2, mithril_bar: 2, copper_rivet: 30 });
C('moonheart_staff', 'woodworking', 'Moonheart staff', 60, 10, 190, { ironwood_plank: 3, moon_essence: 2, black_pearl: 1, gold_bar: 1 });
// leatherworking
C('leather_cap', 'leatherworking', 'Leather cap', 1, 4, 12, { rough_leather: 2, copper_rivet: 2 });
C('leather_jerkin', 'leatherworking', 'Leather jerkin', 5, 5, 18, { rough_leather: 3, copper_rivet: 4 });
C('leather_breeches', 'leatherworking', 'Leather breeches', 8, 5, 20, { rough_leather: 2, linen_thread: 2, copper_rivet: 4 });
C('studded_jerkin', 'leatherworking', 'Studded jerkin', 18, 6, 36, { tanned_leather: 3, copper_rivet: 12 });
C('studded_leggings', 'leatherworking', 'Studded leggings', 22, 6, 40, { tanned_leather: 2, leather_strap: 2, copper_rivet: 8 });
C('hardened_hood', 'leatherworking', 'Hardened hood', 32, 7, 60, { hardened_leather: 2, silk_thread: 1, copper_rivet: 10 });
C('hardened_brigandine', 'leatherworking', 'Hardened brigandine', 40, 8, 85, { hardened_leather: 4, steel_bar: 2, copper_rivet: 30, silk_thread: 1 });
C('drakeskin_leggings', 'leatherworking', 'Drakeskin leggings', 52, 9, 130, { drakeskin: 3, silk_thread: 2, copper_rivet: 24 });
C('drakeskin_coat', 'leatherworking', 'Drakeskin coat', 56, 10, 160, { drakeskin: 4, mithril_bar: 2, copper_rivet: 40, silk_thread: 2 });
C('artisans_apron', 'leatherworking', "Artisan's apron", 12, 5, 26, { rough_leather: 3, linen_thread: 2, copper_rivet: 4 });
C('trappers_leggings', 'leatherworking', "Trapper's leggings", 16, 6, 32, { tanned_leather: 2, bone_shard: 3, linen_thread: 1 });
// tailoring
C('padded_tunic', 'tailoring', 'Padded tunic', 1, 4, 12, { linen_thread: 3 });
C('foragers_satchel', 'tailoring', "Forager's satchel", 4, 4, 16, { linen_cloth: 1, linen_thread: 2 });
C('anglers_hat', 'tailoring', "Angler's hat", 7, 5, 18, { linen_cloth: 1, flax_fiber: 3 });
C('linen_hood', 'tailoring', 'Linen hood', 3, 4, 14, { linen_cloth: 1, linen_thread: 1 });
C('linen_robe', 'tailoring', 'Linen robe', 6, 5, 20, { linen_cloth: 3, linen_thread: 2 });
C('canvas_trousers', 'tailoring', 'Canvas trousers', 15, 6, 32, { nettle_canvas: 2, leather_strap: 1, copper_rivet: 4 });
C('nettle_robe', 'tailoring', 'Nettle robe', 20, 6, 38, { nettle_canvas: 3, linen_thread: 2, glow_essence: 1 });
C('herbalist_cowl', 'tailoring', 'Herbalist cowl', 24, 6, 42, { nettle_canvas: 2, bloodmoss: 1 });
C('silk_cowl', 'tailoring', 'Silk cowl', 34, 7, 62, { silk_thread: 3, frostcap: 1, leather_strap: 1 });
C('silk_trousers', 'tailoring', 'Silk trousers', 38, 8, 72, { silk_thread: 4, hardened_leather: 1, copper_rivet: 8 });
C('silk_robe', 'tailoring', 'Silk robe', 44, 8, 85, { silk_cloth: 2, leather_strap: 2, storm_essence: 1 });
C('moonweave_hood', 'tailoring', 'Moonweave hood', 56, 9, 140, { moonweave: 1, silk_cloth: 1, sunpetal: 1, leather_strap: 1 });
C('moonweave_vestment', 'tailoring', 'Moonweave vestment', 60, 10, 190, { moonweave: 2, drakeskin: 1, gold_bar: 1 });
// jewelcrafting
C('copper_band', 'jewelcrafting', 'Copper band', 1, 4, 12, { copper_bar: 2 });
C('gemstone_ring', 'jewelcrafting', 'Gemstone ring', 8, 5, 20, { bronze_bar: 1, rough_gem: 1 });
C('glowstone_ring', 'jewelcrafting', 'Glowstone ring', 16, 5, 32, { copper_bar: 1, glow_essence: 2, rough_gem: 1 });
C('iron_signet', 'jewelcrafting', 'Iron signet', 20, 6, 38, { iron_bar: 2, rough_gem: 1, leather_strap: 1 });
C('pearl_ring', 'jewelcrafting', 'Pearl-set silver ring', 30, 6, 55, { silver_bar: 1, river_pearl: 1, linen_thread: 2 });
C('cut_prism', 'jewelcrafting', 'Cut prism', 33, 6, 50, { sapphire: 1, silver_bar: 1 });
C('sapphire_signet', 'jewelcrafting', 'Sapphire signet', 40, 7, 75, { silver_bar: 1, sapphire: 1, leather_strap: 1 });
C('ruby_warband', 'jewelcrafting', 'Ruby war-band', 52, 8, 120, { gold_bar: 1, ruby: 1, wood_varnish: 1 });
C('black_pearl_ring', 'jewelcrafting', 'Black pearl ring', 58, 9, 150, { mithril_bar: 1, black_pearl: 1, moon_essence: 1 });
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
F('fight_wolfwood', 'striker', 'Mangy wolves', 1, 5, 12, 'Wolfwood edge', { name: 'Mangy wolf', power: 3, dmg: 2 }, [1, 3],
  [d('scrap_hide', 0.6, 1, 2), d('bone_shard', 0.4, 1, 2), d('wolf_pelt', 0.05, 1, 1)]);
F('fight_ridge', 'striker', 'Ridge wolves', 12, 6, 26, 'Howling ridge', { name: 'Ridge wolf', power: 10, dmg: 6 }, [3, 8],
  [d('wolf_pelt', 0.6, 1, 2), d('bone_shard', 0.4, 1, 2)]);
F('fight_hollow', 'striker', 'Hollow spiders', 28, 7, 44, 'Webbed hollow', { name: 'Hollow spider', power: 22, dmg: 12 }, [8, 18],
  [d('spider_silk', 0.6, 1, 3), d('bone_shard', 0.3, 1, 3)]);
F('fight_bearclaw', 'striker', 'Cave bears', 35, 8, 56, 'Bearclaw pass', { name: 'Cave bear', power: 30, dmg: 16 }, [12, 26],
  [d('bear_hide', 0.55, 1, 2), d('wolf_pelt', 0.3, 1, 2)]);
F('fight_drakemire', 'striker', 'Mire drakes', 52, 9, 90, 'Drakemire', { name: 'Mire drake', power: 48, dmg: 26 }, [25, 50],
  [d('drake_hide', 0.5, 1, 2), d('bone_shard', 0.5, 2, 4)]);
// combat: guardian (hides, elite cores-lite)
F('fight_quarry_road', 'guardian', 'Quarry rats', 1, 5, 12, 'Old quarry road', { name: 'Quarry rat', power: 3, dmg: 3 }, [1, 3],
  [d('scrap_hide', 0.5, 1, 2), d('bone_shard', 0.3, 1, 1), d('copper_ore', 0.3, 1, 3)]);
F('fight_palisade', 'guardian', 'Palisade bandits', 15, 6, 30, 'Bandit palisade', { name: 'Palisade bandit', power: 12, dmg: 7 }, [5, 12],
  [d('wolf_pelt', 0.45, 1, 2), d('iron_ore', 0.3, 1, 3)]);
F('fight_ironhide', 'guardian', 'Ironhide bears', 30, 7, 48, 'Ironhide den', { name: 'Ironhide bear', power: 26, dmg: 14 }, [10, 22],
  [d('bear_hide', 0.5, 1, 2), d('scrap_hide', 0.4, 1, 3)]);
F('fight_golems', 'guardian', 'Granite golems (elite)', 40, 9, 66, 'Golem quarry', { name: 'Granite golem', power: 36, dmg: 20 }, [16, 34],
  [d('stone_heart', 0.12, 1, 1), d('iron_ore', 0.5, 2, 4), d('coal', 0.5, 2, 4)]);
F('fight_roost', 'guardian', 'Roost wardens (elite)', 56, 10, 100, 'Drake roost', { name: 'Roost warden', power: 52, dmg: 30 }, [30, 60],
  [d('drake_scale', 0.1, 1, 1), d('drake_hide', 0.4, 1, 2)]);
// combat: mender (essences)
F('fight_shrine', 'mender', 'Restless wisps', 1, 5, 12, 'Hollow shrine', { name: 'Restless wisp', power: 3, dmg: 2 }, [1, 3],
  [d('faint_essence', 0.6, 1, 2)]);
F('fight_marsh', 'mender', 'Marsh glimmers', 14, 6, 28, 'Glimmer marsh', { name: 'Marsh glimmer', power: 11, dmg: 6 }, [4, 10],
  [d('glow_essence', 0.5, 1, 2), d('faint_essence', 0.4, 1, 2)]);
F('fight_spire', 'mender', 'Storm sprites', 32, 7, 50, 'Stormcrown spire', { name: 'Storm sprite', power: 28, dmg: 15 }, [10, 24],
  [d('storm_essence', 0.45, 1, 2), d('glow_essence', 0.3, 1, 2)]);
F('fight_chapel', 'mender', 'Drowned acolytes', 40, 8, 64, 'Sunken chapel', { name: 'Drowned acolyte', power: 36, dmg: 20 }, [15, 30],
  [d('storm_essence', 0.5, 1, 2), d('river_pearl', 0.1, 1, 1), d('glow_essence', 0.3, 1, 2)]);
F('fight_barrow', 'mender', 'Barrow revenants', 50, 9, 88, 'Moonlit barrow', { name: 'Barrow revenant', power: 45, dmg: 25 }, [22, 46],
  [d('moon_essence', 0.35, 1, 1), d('storm_essence', 0.3, 1, 2), d('bone_shard', 0.5, 1, 3)]);

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
  { id: 'ashen_wyrm', name: 'Ashen Wyrm', title: 'Boss 1', hp: 1700000, power: 20, reqPower: 30, weekends: 1.6, cores: 24, weakTo: 'frost', hits: 'fire',
    phases: [{ name: 'Scorched hide', check: 'mitigation' }, { name: 'Burn', check: 'damage' }, { name: 'Ember rain', check: 'healing' }],
    loot: [d('wyrm_core', 0.15, 1, 1), d('ember_scale', 0.6, 1, 3), d('coal', 0.8, 4, 10)],
    palette: ['#3b2a2a', '#c2462e', '#f0a04b'] },
  { id: 'rimefang_matriarch', name: 'Rimefang Matriarch', title: 'Boss 2', hp: 4700000, power: 34, reqPower: 50, weekends: 1.8, cores: 24, weakTo: 'fire', hits: 'frost',
    phases: [{ name: 'Frozen pelt', check: 'mitigation' }, { name: 'Blizzard howl', check: 'healing' }, { name: 'Pack frenzy', check: 'damage' }],
    loot: [d('rimefang_core', 0.15, 1, 1), d('rime_shard', 0.6, 1, 3), d('wolf_pelt', 0.8, 4, 8)],
    palette: ['#1f2c3d', '#5d9ccf', '#dff3ff'] },
  { id: 'blightroot_colossus', name: 'Blightroot Colossus', title: 'Boss 3', hp: 7800000, power: 50, reqPower: 75, weekends: 2.0, cores: 22, weakTo: 'holy', hits: 'venom',
    phases: [{ name: 'Barkskin', check: 'mitigation' }, { name: 'Spore cloud', check: 'healing' }, { name: 'Uprooting', check: 'damage' }],
    loot: [d('blight_core', 0.15, 1, 1), d('venom_gland', 0.6, 1, 3), d('bloodmoss', 0.8, 3, 8)],
    palette: ['#1f2a1a', '#5f8a2e', '#c6e05a'] },
  { id: 'sunfallen_seraph', name: 'Sunfallen Seraph', title: 'Boss 4', hp: 11500000, power: 66, reqPower: 100, weekends: 2.2, cores: 20, weakTo: 'venom', hits: 'holy',
    phases: [{ name: 'Radiant ward', check: 'mitigation' }, { name: 'Judgement', check: 'damage' }, { name: 'Searing light', check: 'healing' }],
    loot: [d('seraph_core', 0.15, 1, 1), d('halo_fragment', 0.6, 1, 3), d('sunpetal', 0.7, 2, 5)],
    palette: ['#3a2f1a', '#d9b44a', '#fff4c2'] },
  { id: 'hollow_king', name: 'The Hollow King', title: 'Boss 5', hp: 15000000, power: 80, reqPower: 120, weekends: 2.4, cores: 18, weakTo: 'holy', hits: 'frost',
    phases: [{ name: 'Grave guard', check: 'mitigation' }, { name: 'Soul drain', check: 'healing' }, { name: 'Last court', check: 'damage' }],
    loot: [d('crown_core', 0.15, 1, 1), d('grave_silver', 0.6, 1, 3), d('moon_essence', 0.7, 2, 4)],
    palette: ['#1c1a24', '#6b5b8f', '#c9b8f0'] },
  { id: 'abyssal_leviathan', name: 'Abyssal Leviathan', title: 'Boss 6', hp: 20000000, power: 100, reqPower: 150, weekends: 2.6, cores: 16, weakTo: 'frost', hits: 'venom',
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
const statTags = [
  { id: 'damage', name: 'Damage', kind: 'combat', unit: 'pts', stat: 'atk' },
  { id: 'defence', name: 'Defence', kind: 'combat', unit: 'pts', stat: 'def' },
  { id: 'healing', name: 'Healing', kind: 'combat', unit: 'pts', stat: 'heal' },
  { id: 'vitality', name: 'Vitality', kind: 'combat', unit: 'pts', stat: 'hp' },
  { id: 'mining', name: 'Mining speed', kind: 'skill', unit: 'pct', skill: 'mining', effect: 'speed' },
  { id: 'woodcutting', name: 'Woodcutting speed', kind: 'skill', unit: 'pct', skill: 'woodcutting', effect: 'speed' },
  { id: 'foraging', name: 'Foraging', kind: 'skill', unit: 'pct', skill: 'herbalism', effect: 'yield' },
  { id: 'fishing', name: 'Fishing', kind: 'skill', unit: 'pct', skill: 'fishing', effect: 'yield' },
  { id: 'hunting', name: 'Hunting', kind: 'skill', unit: 'pct', skill: 'combat', effect: 'drops' },
  { id: 'quality', name: 'Quality', kind: 'skill', unit: 'pts', skill: 'crafting', effect: 'quality' },
  { id: 'speed', name: 'Speed', kind: 'skill', unit: 'pct', skill: 'all', effect: 'speed' }
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

export const DATA: any = {
  config: {
    saveKey: 'guildwright-proto-v1',
    startingGold: 150,
    xpMult: 4,
    offlineCapSec: 43200,
    offlineRate: 0.1,       // offline catch-up runs at 10% speed, capped at 12 h (offlineCapSec)
    maxLevel: 99,
    marketTax: 0.05,
    pityThreshold: 40,
    speedFactor: 1,               // phase 2.5: match the prototype's pace (owner's call, 2026-11-08)
    baseHp: 60,
    hpPerCombatLevel: 4,
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
    crewGoldPerAttendee: 10,      // x boss tier
    crewGoldCap: 180,             // x boss tier
    weekBuffs: [{ kind: 'repair', value: 0.3, label: 'Repairs 30% cheaper' }, { kind: 'tax', value: 0.02, label: 'Market tax 2%' }],
    crewStartTreasury: 120,
    // phase 2.5: town contracts (generated each Monday from what the coming raid needs). Gold only.
    contractBudgetShare: 0.75,    // share of free treasury gold escrowed for town contract rewards
    contractRewardMult: 0.5,      // gold per unit = item value x this
    contractNpcShare: 0.5,        // NPC crewmates fill at most this share of each contract (Fri until the raid)
    // ~3 hours of a typical level-40 player's income: the median, across the four gathering skills,
    // of each skill's best level-40 action sold at Standard value after tax (~14,800 g/h at speedFactor 1).
    // Pinned by test/economy.test.ts (cost / hourly income must stay within 2.5-3.5).
    specSwitchCost: 45000,
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
  actions,

  affixes: [
    { id: 'keen', name: 'Keen', stat: 'atk', range: [1, 6] },
    { id: 'savage', name: 'Savage', stat: 'atk', range: [4, 12] },
    { id: 'sturdy', name: 'Sturdy', stat: 'def', range: [1, 6] },
    { id: 'bulwark', name: 'Bulwark', stat: 'def', range: [4, 12] },
    { id: 'soothing', name: 'Soothing', stat: 'heal', range: [1, 6] },
    { id: 'radiant', name: 'Radiant', stat: 'heal', range: [4, 12] },
    { id: 'hale', name: 'Hale', stat: 'hp', range: [5, 25] },
    { id: 'of_the_bear', name: 'of the Bear', stat: 'hp', range: [15, 45] },
    { id: 'of_embers', name: 'of Embers', stat: 'fire', range: [2, 8] },
    { id: 'of_rime', name: 'of Rime', stat: 'frost', range: [2, 8] },
    { id: 'of_venom', name: 'of Venom', stat: 'venom', range: [2, 8] },
    { id: 'of_dawn', name: 'of Dawn', stat: 'holy', range: [2, 8] },
    { id: 'enduring', name: 'Enduring', stat: 'dur', range: [10, 30] },
    { id: 'swift', name: 'Swift', stat: 'speed', range: [3, 10] }
  ],

  bosses,
  raidRoles,
  statTags,
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
    gear: [{ itemId: 'training_sword', equip: true }, { itemId: 'padded_tunic', equip: true }]
  }
};
