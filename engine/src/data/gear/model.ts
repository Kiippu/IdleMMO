// Gear model constants (gear spec 2026-11-12). The formulas that use them live in src/gear.ts.
// All combat stats are on the x10 display scale.
/* eslint-disable */

export const TIERS_LIVE = [1, 2, 3];                       // tiers generated this release (data model allows 1..5)
export const TIER_BUDGET = [0, 60, 90, 135, 203, 304];      // index = tier
export const TIER_LEVEL = [0, 1, 15, 30, 45, 60];           // first recipe level of each tier
export const GEAR_GRADE_MULT = [0.97, 1.00, 1.02, 1.04, 1.06]; // Rough .. Pristine (stats/effects only; values keep DATA.grades)
export const PRIMARY_STEP = 0.12;                           // primary affix: +12% of base per rarity step
export const SECONDARY_SHARE = 0.05;                        // fight secondary affix: ~5% of slot budget
export const HP_PER_POINT = 2.5;                            // one stat point of HP weight = 2.5 HP on the x10 scale; chest HP = 2.5 x its defence
// Health has its own x2 scale (owner 2026-11-13): every HP number is the x10 value / HP_DIV, computed on the x10 scale
// first and divided exactly, so fights and raids play out exactly as before (HP can carry one decimal, steps of 0.2).
export const HP_DIV = 5;
export const hpOf = (x10) => Math.round(x10) / HP_DIV;
export const ROLL_MIN = 0.8, ROLL_MAX = 1.2;
export const ENDURING_PCT = 20;
export const DURABILITY = [100, 130, 160, 200, 300, 400];  // fight gear, by rarity index
export const ELEMENT_AFFIX = [0, 5, 6, 7, 8, 10];           // % weapon damage share per element affix, by tier (jewellery: half)
export const WARD_AFFIX = [0, 2, 2.5, 3, 3.5, 4];           // % less damage taken per Warded affix, by tier
export const NAMED_ELEMENT_SHARE = 25;
export const BOW_ELEMENT_BONUS = 10;
export const ELEMENT_SHARE_CAP = 50;
export const WARD_CAP = 20;
export const ELEMENT_MULT = { weak: 1.25, own: 0.75 };

export const SLOT_SHARE = { twoHand: 1.0, oneHand: 0.66, offhand: 0.33, head: 1.0, chest: 1.0, legs: 1.0, ring: 0.3, amulet: 0.4 };

// ---- work effects
export const EFFECTS = [
  // caps lowered by the lead 2026-11-13 (spec 8 / 10 / 10) so a T5 Mythic Pristine gather kit lands near +10% income;
  // speed keeps the lowest cap (it also speeds XP)
  { id: 'speed', name: 'Speed', unit: 'pct', cap: 4 },
  { id: 'double', name: 'Double output', unit: 'pct', cap: 5 },
  { id: 'save', name: 'Save input', unit: 'pct', cap: 5 },
  { id: 'quality', name: 'Quality', unit: 'pts', cap: 10 },
  { id: 'find', name: 'Bonus find', unit: 'pct', cap: 30 },
  { id: 'rarity', name: 'Rarity odds', unit: 'pct', cap: 25 }
];
export const EFFECT_IDS = EFFECTS.map((e) => e.id);
export const GROUP_EFFECTS = {
  gathering: ['speed', 'double', 'find'],
  refining: ['speed', 'save', 'double'],
  gearcraft: ['speed', 'quality', 'rarity', 'save'],
  consumables: ['speed', 'double', 'save', 'quality']
};
export const SKILL_GROUP = {
  mining: 'gathering', woodcutting: 'gathering', herbalism: 'gathering', fishing: 'gathering',
  smelting: 'refining', carpentry: 'refining', tanning: 'refining', weaving: 'refining',
  smithing: 'gearcraft', woodworking: 'gearcraft', leatherworking: 'gearcraft', tailoring: 'gearcraft', jewelcrafting: 'gearcraft',
  alchemy: 'consumables', cooking: 'consumables'
};
export const TOOL_SKILLS = Object.keys(SKILL_GROUP);
export const GROUP_SET = { gathering: 'gather', refining: 'refine', gearcraft: 'craft', consumables: 'craft' };
export const KIND_SET = { gather: 'gather', refine: 'refine', craft: 'craft' };
// tool primary effect by group, value by tier (index = tier)
export const TOOL_EFFECT = {
  gathering: { id: 'speed', v: [0, 1.0, 1.5, 2.0, 2.5, 3.0] },
  refining: { id: 'save', v: [0, 1.0, 1.5, 2.0, 2.5, 3.0] },
  gearcraft: { id: 'quality', v: [0, 2, 3, 4, 5, 6] },
  consumables: { id: 'double', v: [0, 1.0, 1.5, 2.0, 2.5, 3.0] }
};
// outfit primary effect per piece by set, value by tier
export const OUTFIT_EFFECT = {
  gather: [{ id: 'double', v: [0, 0.25, 0.4, 0.5, 0.6, 0.75] }],
  refine: [{ id: 'save', v: [0, 0.25, 0.4, 0.5, 0.6, 0.75] }],
  craft: [{ id: 'quality', group: 'gearcraft', v: [0, 0.5, 1, 1, 1.5, 2] }, { id: 'double', group: 'consumables', v: [0, 0.25, 0.4, 0.5, 0.6, 0.75] }]
};
// secondary work affix values (Common roll), by tier
export const WORK_AFFIX_VALUE = {
  speed: [0, 0.3, 0.4, 0.5, 0.6, 0.75],
  double: [0, 0.4, 0.6, 0.8, 1.0, 1.2],
  save: [0, 0.5, 0.75, 1.0, 1.25, 1.5],
  find: [0, 3, 4, 5, 6, 8],
  quality: [0, 1, 1, 2, 2, 3],
  rarity: [0, 2, 3, 4, 5, 6]
};
// tool wear: -1% condition per hour of work / (1 + 0.2 x rarity index); speed penalty below 50/25/10%
export const WEAR_STEPS = [{ below: 10, pct: 8 }, { below: 25, pct: 5 }, { below: 50, pct: 3 }];
export const TOOL_REPAIR_PER10 = 100;
export const TOOL_REPAIR_TIER = [0, 1, 2, 4, 7, 12];
// crafted quality: mastery points by mastery tier index
export const MASTERY_QUALITY = [0, 2, 4, 7, 10];

// ---- affixes
export const AFFIXES = [
  { id: 'primary', name: 'Primary', kind: 'any', key: 'primary', prefix: false },
  { id: 'savage', name: 'Savage', kind: 'fight', key: 'atk', prefix: true },
  { id: 'sturdy', name: 'Sturdy', kind: 'fight', key: 'def', prefix: true },
  { id: 'soothing', name: 'Soothing', kind: 'fight', key: 'heal', prefix: true },
  { id: 'hale', name: 'Hale', kind: 'fight', key: 'hp', prefix: true },
  { id: 'of_embers', name: 'of Embers', kind: 'fight', key: 'fire', prefix: false },
  { id: 'of_rime', name: 'of Rime', kind: 'fight', key: 'frost', prefix: false },
  { id: 'of_venom', name: 'of Venom', kind: 'fight', key: 'venom', prefix: false },
  { id: 'of_dawn', name: 'of Dawn', kind: 'fight', key: 'holy', prefix: false },
  { id: 'warded_fire', name: 'Fireproof', kind: 'fight', key: 'ward_fire', prefix: true },
  { id: 'warded_frost', name: 'Frostproof', kind: 'fight', key: 'ward_frost', prefix: true },
  { id: 'warded_venom', name: 'Venomproof', kind: 'fight', key: 'ward_venom', prefix: true },
  { id: 'warded_holy', name: 'Hallowed', kind: 'fight', key: 'ward_holy', prefix: true },
  { id: 'enduring', name: 'Enduring', kind: 'fight', key: 'dur', prefix: true },
  { id: 'brisk', name: 'Brisk', kind: 'work', key: 'speed', prefix: true },
  { id: 'bountiful', name: 'Bountiful', kind: 'work', key: 'double', prefix: true },
  { id: 'prolific', name: 'Prolific', kind: 'work', key: 'double', prefix: true },
  { id: 'keen_eyed', name: 'Keen-eyed', kind: 'work', key: 'find', prefix: true },
  { id: 'thrifty', name: 'Thrifty', kind: 'work', key: 'save', prefix: true },
  { id: 'masterful', name: 'Masterful', kind: 'work', key: 'quality', prefix: true },
  { id: 'fortunate', name: 'Fortunate', kind: 'work', key: 'rarity', prefix: true }
];
export const WORK_POOL = {
  gather: ['bountiful', 'keen_eyed', 'brisk'],
  refine: ['thrifty', 'prolific', 'brisk'],
  craft: ['masterful', 'fortunate', 'thrifty', 'brisk']
};
export const ELEMENT_AFFIXES = ['of_embers', 'of_rime', 'of_venom', 'of_dawn'];
export const WARD_AFFIXES = ['warded_fire', 'warded_frost', 'warded_venom', 'warded_holy'];
export const STAT_AFFIX = { atk: 'savage', def: 'sturdy', heal: 'soothing', hp: 'hale' };

export const FIGHT_SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'ring1', 'ring2', 'amulet'];
export const OUTFIT_SETS = ['gather', 'refine', 'craft'];
export const OUTFIT_PIECES = ['head', 'body', 'hands', 'feet'];

/** slot share of the tier budget */
export function shareOf(slot, hands?) {
  if (slot === 'weapon') return hands === 2 ? SLOT_SHARE.twoHand : SLOT_SHARE.oneHand;
  return SLOT_SHARE[slot] != null ? SLOT_SHARE[slot] : 1;
}
/** unrounded base stats (Common, Standard grade, x10 scale) of a fight item: budget x share x weight (HP x 2.5); chest HP += 2.5 x def */
export function baseStatsRaw(it) {
  const out = {};
  if (!it || it.section !== 'fight') return out;
  const b = TIER_BUDGET[it.tier] * shareOf(it.slot, it.hands);
  Object.keys(it.weights || {}).forEach((k) => { out[k] = b * it.weights[k] * (k === 'hp' ? HP_PER_POINT : 1); });
  if (it.slot === 'chest') out['hp'] = (out['hp'] || 0) + (out['def'] || 0) * HP_PER_POINT;
  return out;
}

// Crafted tool recipes are scaled so their input value is about this much (lead 2026-11-13): a Common Standard tool
// of the tier then pays back in 20–50 h of its skill's work at the tier's mid level (value 1.3 x inputs / gain).
export const TOOL_INPUT_TARGET = [0, 600, 2300, 5000, 11000, 24000];
// Role power (x10 scale; lead 2026-11-13): a full Common Standard kit of tier N at the tier's mid combat level is
// 1.0–1.15x boss N's need for its role, guardian at most 10% above the others. Spec striker x3 rescaled.
export const ROLE_POWER = { striker: { atk: 2.16 }, guardian: { def: 1.16, maxHp: 0.25 }, mender: { heal: 2.05 } }; // maxHp on the x2 HP scale (0.05 on x10)
