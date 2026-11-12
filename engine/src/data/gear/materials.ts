// Material families by tier (index 1..5). `name` is the item-name prefix, `key` the id prefix.
/* eslint-disable */
export const MATERIALS = {
  metal: [null,
    { key: 'bronze', name: 'Bronze', tint: '#b08d57' }, { key: 'iron', name: 'Iron', tint: '#8f8f95' },
    { key: 'steel', name: 'Steel', tint: '#b4bcc6' }, { key: 'mithril', name: 'Mithril', tint: '#7fd0e0' },
    { key: 'wyrmforged', name: 'Wyrmforged', tint: '#e0683a' }],
  wood: [null,
    { key: 'pine', name: 'Pine', tint: '#d1a46b' }, { key: 'oak', name: 'Oak', tint: '#a97a48' },
    { key: 'yew', name: 'Yew', tint: '#7b4f33' }, { key: 'ironwood', name: 'Ironwood', tint: '#5a524c' },
    { key: 'heartwood', name: 'Heartwood', tint: '#a8432e' }],
  leather: [null,
    { key: 'leather', name: 'Leather', tint: '#b08560' }, { key: 'studded', name: 'Studded', tint: '#8b5a3c' },
    { key: 'hardened', name: 'Hardened', tint: '#5b3a26' }, { key: 'drakeskin', name: 'Drakeskin', tint: '#3d6b4f' },
    { key: 'wyrmhide', name: 'Wyrmhide', tint: '#b8452e' }],
  cloth: [null,
    { key: 'hessian', name: 'Hessian', tint: '#c9b98a' }, { key: 'linen', name: 'Linen', tint: '#efe7d2' },
    { key: 'silk', name: 'Silk', tint: '#e9d9f2' }, { key: 'finesilk', name: 'Fine silk', tint: '#f3e6ff' },
    { key: 'moonweave', name: 'Moonweave', tint: '#cfd8ff' }],
  jewel: [null,
    { key: 'copper', name: 'Copper', tint: '#d08a55' }, { key: 'glowstone', name: 'Glowstone', tint: '#8fe3c0' },
    { key: 'sapphire', name: 'Sapphire', tint: '#3a64c8' }, { key: 'ruby', name: 'Ruby', tint: '#c8304a' },
    { key: 'rime', name: 'Rime', tint: '#bfe8ff' }]
};
// Recipe input roles → item id per tier (index 1..5). null = not used at that tier.
export const INPUTS = {
  metal: [null, 'bronze_bar', 'iron_bar', 'steel_bar', 'mithril_bar', 'mithril_bar'],
  wood: [null, 'pine_plank', 'oak_plank', 'yew_plank', 'ironwood_plank', 'ironwood_plank'],
  leather: [null, 'rough_leather', 'tanned_leather', 'hardened_leather', 'drakeskin', 'drakeskin'],
  cloth: [null, 'linen_thread', 'linen_cloth', 'silk_thread', 'silk_cloth', 'moonweave'],
  fiber: [null, 'flax_fiber', 'nettle_canvas', 'silk_thread', 'silk_cloth', 'moonweave'],
  string: [null, 'linen_thread', 'linen_thread', 'silk_thread', 'silk_thread', 'silk_thread'],
  jmetal: [null, 'copper_bar', 'iron_bar', 'silver_bar', 'gold_bar', 'mithril_bar'],
  gem: [null, 'rough_gem', 'glow_essence', 'sapphire', 'ruby', 'rime_shard'],
  pearl: [null, 'rough_gem', 'glow_essence', 'river_pearl', 'black_pearl', 'abyssal_pearl'],
  essence: [null, 'faint_essence', 'glow_essence', 'storm_essence', 'moon_essence', 'moon_essence'],
  rivet: [null, 'copper_rivet', 'copper_rivet', 'copper_rivet', 'copper_rivet', 'copper_rivet'],
  bind: [null, 'linen_thread', 'leather_strap', 'leather_strap', 'leather_strap', 'leather_strap'],
  finish: [null, null, 'wood_varnish', 'wood_varnish', 'wood_varnish', 'wood_varnish'],
  trim: [null, null, null, 'silver_bar', 'gold_bar', 'gold_bar']
};
