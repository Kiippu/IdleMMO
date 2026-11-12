// Gear families: one row per family type. Items are generated per tier by data/gear/build.ts:
// id `${material.key}_${type}`, name `${material.name} ${words}`. Named overrides at the bottom.
//   off = recipe level offset inside the tier; recipe = { inputRole: qty } (see materials.ts INPUTS).
/* eslint-disable */
const W = (type, words, mat, maker, off, hands, role, primary, weights, recipe, extra?) =>
  Object.assign({ section: 'fight', slot: 'weapon', type, words, mat, maker, off, hands, role, primary, weights, recipe,
    sprite: type === 'bow' ? 'bow' : ['staff', 'wand'].includes(type) ? 'staff' : 'sword' }, extra || {});
const O = (type, words, mat, maker, off, role, primary, weights, recipe, sprite) =>
  ({ section: 'fight', slot: 'offhand', type, words, mat, maker, off, role, primary, weights, recipe, sprite });
const A = (type, words, mat, maker, off, slot, armour, recipe) => {
  const role = armour === 'plate' ? 'guardian' : armour === 'leather' ? 'striker' : 'mender';
  const weights = armour === 'plate' ? { def: 1.0 } : armour === 'leather' ? { def: 0.7, atk: 0.3 } : { def: 0.6, heal: 0.4 };
  return { section: 'fight', slot, type, words, mat, maker, off, role, armour, primary: 'def', weights, recipe,
    sprite: slot === 'head' ? 'helm' : slot === 'chest' ? 'chest' : 'legs' };
};
const J = (type, words, slot, off, role, primary, weights, recipe) =>
  ({ section: 'fight', slot, type, words, mat: 'jewel', maker: 'jewelcrafting', off, role, primary, weights, recipe, sprite: slot });
const T = (type, words, mat, maker, off, toolSkill, recipe) =>
  ({ section: 'tool', slot: 'tool', type, words, mat, maker, off, toolSkill, recipe, sprite: 'tool' });
const U = (type, words, set, piece, maker, off, recipe) =>
  ({ section: 'outfit', slot: piece, type, words, mat: 'cloth', maker, off, outfitSet: set, recipe, sprite: 'outfit' });

export const FAMILIES = [
  // ---- weapons: striker
  W('sword', 'sword', 'metal', 'smithing', 0, 1, 'striker', 'atk', { atk: 0.9, def: 0.1 }, { metal: 3, rivet: 4, leather: 1 }),
  W('axe', 'axe', 'metal', 'smithing', 7, 1, 'striker', 'atk', { atk: 1.0 }, { metal: 3, wood: 1 }),
  W('dagger', 'dagger', 'metal', 'smithing', 2, 1, 'striker', 'atk', { atk: 0.85, hp: 0.15 }, { metal: 2, leather: 1 }),
  W('spear', 'spear', 'metal', 'smithing', 10, 2, 'striker', 'atk', { atk: 0.8, hp: 0.2 }, { metal: 2, wood: 2, rivet: 2 }),
  W('greatsword', 'greatsword', 'metal', 'smithing', 12, 2, 'striker', 'atk', { atk: 1.0 }, { metal: 5, rivet: 6, leather: 1 }),
  W('bow', 'bow', 'wood', 'woodworking', 2, 2, 'striker', 'atk', { atk: 0.9 }, { wood: 3, string: 1, finish: 1 }, { bowBonus: true }),
  // ---- weapons: guardian
  W('mace', 'mace', 'metal', 'smithing', 5, 1, 'guardian', 'def', { atk: 0.5, def: 0.5 }, { metal: 3, wood: 1 }),
  W('warhammer', 'warhammer', 'metal', 'smithing', 12, 2, 'guardian', 'def', { atk: 0.4, def: 0.4, hp: 0.2 }, { metal: 4, wood: 1, leather: 1 }),
  W('halberd', 'halberd', 'metal', 'smithing', 13, 2, 'guardian', 'atk', { atk: 0.6, def: 0.2, hp: 0.2 }, { metal: 4, wood: 2, trim: 1 }),
  // ---- weapons: mender
  W('wand', 'wand', 'wood', 'woodworking', 3, 1, 'mender', 'heal', { heal: 1.0 }, { wood: 1, essence: 1 }),
  W('scepter', 'scepter', 'metal', 'smithing', 9, 1, 'mender', 'heal', { heal: 0.7, def: 0.3 }, { metal: 2, essence: 1, trim: 1 }),
  W('staff', 'staff', 'wood', 'woodworking', 0, 2, 'mender', 'heal', { heal: 0.85, def: 0.15 }, { wood: 3, essence: 1, finish: 1 }),
  // ---- offhands
  O('parrying_dagger', 'parrying dagger', 'metal', 'smithing', 10, 'striker', 'atk', { atk: 1.0 }, { metal: 2, leather: 1 }, 'sword'),
  O('shield', 'shield', 'wood', 'woodworking', 1, 'guardian', 'def', { def: 0.7, hp: 0.3 }, { wood: 3, rivet: 4, trim: 1 }, 'shield'),
  O('tome', 'tome', 'leather', 'leatherworking', 9, 'mender', 'heal', { heal: 0.8, hp: 0.2 }, { leather: 2, cloth: 1, essence: 1 }, 'tome'),
  // ---- armour
  A('helm', 'helm', 'metal', 'smithing', 3, 'head', 'plate', { metal: 2, rivet: 6 }),
  A('cuirass', 'cuirass', 'metal', 'smithing', 11, 'chest', 'plate', { metal: 5, leather: 1, rivet: 12 }),
  A('greaves', 'greaves', 'metal', 'smithing', 8, 'legs', 'plate', { metal: 3, bind: 2, rivet: 6 }),
  A('cap', 'cap', 'leather', 'leatherworking', 0, 'head', 'leather', { leather: 2, rivet: 2 }),
  A('jerkin', 'jerkin', 'leather', 'leatherworking', 4, 'chest', 'leather', { leather: 3, rivet: 4, string: 1 }),
  A('breeches', 'breeches', 'leather', 'leatherworking', 7, 'legs', 'leather', { leather: 2, string: 2, rivet: 2 }),
  A('hood', 'hood', 'cloth', 'tailoring', 0, 'head', 'cloth', { cloth: 2, fiber: 1 }),
  A('robe', 'robe', 'cloth', 'tailoring', 3, 'chest', 'cloth', { cloth: 3, fiber: 2, essence: 1 }),
  A('trousers', 'trousers', 'cloth', 'tailoring', 6, 'legs', 'cloth', { cloth: 2, leather: 1 }),
  // ---- jewellery (rings 0.3, amulets 0.4)
  J('signet', 'signet', 'ring', 2, 'striker', 'atk', { atk: 0.7, hp: 0.3 }, { jmetal: 1, gem: 1 }),
  J('band', 'band', 'ring', 0, 'guardian', 'def', { def: 0.6, hp: 0.4 }, { jmetal: 2 }),
  J('loop', 'loop', 'ring', 4, 'mender', 'heal', { heal: 0.7, hp: 0.3 }, { jmetal: 1, essence: 1 }),
  J('pendant', 'pendant', 'amulet', 8, 'striker', 'atk', { atk: 0.7, hp: 0.3 }, { jmetal: 1, gem: 1, string: 1 }),
  J('torc', 'torc', 'amulet', 9, 'guardian', 'def', { def: 0.6, hp: 0.4 }, { jmetal: 2, gem: 1 }),
  J('locket', 'locket', 'amulet', 10, 'mender', 'heal', { heal: 0.7, hp: 0.3 }, { jmetal: 1, pearl: 1, essence: 1 }),
  // ---- tools (one per work skill)
  T('pickaxe', 'pickaxe', 'metal', 'smithing', 1, 'mining', { metal: 2, wood: 1 }),
  T('felling_axe', 'felling axe', 'metal', 'smithing', 4, 'woodcutting', { metal: 2, wood: 1 }),
  T('sickle', 'sickle', 'metal', 'jewelcrafting', 1, 'herbalism', { metal: 1, leather: 1 }),
  T('fishing_rod', 'fishing rod', 'wood', 'woodworking', 4, 'fishing', { wood: 2, string: 1 }),
  T('bellows', 'bellows', 'leather', 'leatherworking', 5, 'smelting', { leather: 2, wood: 1 }),
  T('saw', 'saw', 'metal', 'smithing', 6, 'carpentry', { metal: 2, wood: 1 }),
  T('fleshing_scraper', 'fleshing scraper', 'wood', 'woodworking', 6, 'tanning', { wood: 1, metal: 1 }),
  T('spindle', 'spindle', 'wood', 'woodworking', 5, 'weaving', { wood: 2, string: 1 }),
  T('smith_hammer', "smith's hammer", 'wood', 'woodworking', 7, 'smithing', { wood: 1, metal: 2 }),
  T('chisel', 'chisel', 'metal', 'smithing', 8, 'woodworking', { metal: 1, wood: 1 }),
  T('awl', 'awl', 'metal', 'jewelcrafting', 5, 'leatherworking', { metal: 1, wood: 1 }),
  T('needle_set', 'needle set', 'metal', 'jewelcrafting', 6, 'tailoring', { metal: 1, leather: 1 }),
  T('gem_file', 'gem file', 'metal', 'smithing', 9, 'jewelcrafting', { metal: 2, gem: 1 }),
  T('mortar', 'mortar and pestle', 'jewel', 'jewelcrafting', 11, 'alchemy', { jmetal: 1, gem: 1 }),
  T('rolling_pin', 'rolling pin', 'wood', 'woodworking', 8, 'cooking', { wood: 2 }),
  // ---- work outfit (3 sets x head/body/hands/feet); tailoring heads/bodies, leatherworking hands/feet
  U('field_cap', 'field cap', 'gather', 'head', 'tailoring', 2, { cloth: 2, fiber: 1 }),
  U('field_vest', 'field vest', 'gather', 'body', 'tailoring', 4, { cloth: 3, string: 2 }),
  U('field_gloves', 'field gloves', 'gather', 'hands', 'leatherworking', 2, { leather: 1, cloth: 1 }),
  U('field_boots', 'field boots', 'gather', 'feet', 'leatherworking', 3, { leather: 2, cloth: 1 }),
  U('work_cap', 'work cap', 'refine', 'head', 'tailoring', 7, { cloth: 2, fiber: 1 }),
  U('work_smock', 'work smock', 'refine', 'body', 'tailoring', 8, { cloth: 3, string: 2 }),
  U('work_gloves', 'work gloves', 'refine', 'hands', 'leatherworking', 8, { leather: 1, cloth: 1 }),
  U('work_boots', 'work boots', 'refine', 'feet', 'leatherworking', 10, { leather: 2, cloth: 1 }),
  U('craft_cap', 'craft cap', 'craft', 'head', 'tailoring', 10, { cloth: 2, fiber: 1 }),
  U('craft_apron', 'craft apron', 'craft', 'body', 'tailoring', 11, { cloth: 3, string: 2 }),
  U('craft_gloves', 'craft gloves', 'craft', 'hands', 'leatherworking', 11, { leather: 1, cloth: 1 }),
  U('craft_boots', 'craft boots', 'craft', 'feet', 'leatherworking', 12, { leather: 2, cloth: 1 })
];

// Named overrides: replace the generated `${material}_${type}` at that tier (id, name, extras, recipe).
export const OVERRIDES = {
  hessian_field_cap: { id: 'anglers_hat', name: "Angler's hat" },
  hessian_field_vest: { id: 'foragers_satchel', name: "Forager's satchel" },
  hessian_craft_apron: { id: 'artisans_apron', name: "Artisan's apron" },
  steel_sword: { id: 'frostbite_saber', name: 'Frostbite saber', element: 'frost', level: 35, tint: '#9fd8ee',
    recipe: { steel_bar: 6, leather_strap: 2, copper_rivet: 16, frostcap: 2 } },
  yew_bow: { id: 'venomstring_bow', name: 'Venomstring yew bow', element: 'venom', level: 38, tint: '#6f8f3a',
    recipe: { yew_plank: 4, silk_thread: 3, bloodmoss: 3, wood_varnish: 1 } },
  yew_staff: { id: 'dawnward_staff', name: 'Dawnward staff', element: 'holy', level: 35, tint: '#f2e3a0',
    recipe: { yew_plank: 3, storm_essence: 2, silver_bar: 1, wood_varnish: 1 } },
  steel_warhammer: { id: 'stoneheart_maul', name: 'Stoneheart maul', element: 'holy', level: 42, tint: '#8c8c7a',
    recipe: { steel_bar: 4, stone_heart: 1, yew_plank: 1, hardened_leather: 1 } }
};
