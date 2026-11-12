// Balance export (gear overhaul 2026-11-12): every T1–T3 gear item x rarity x grade → CSV, plus a sanity
// summary on stdout (sword/chest by tier, tool/outfit totals, income gain and hours to level 70 per kit).
// Stats are the PRIMARY-only build (no secondary affixes), so each row is exact and reproducible; kit sums
// below add secondaries at roll 1, cycling through each pool.
// Run: node scripts/balance/run.mjs [out.csv]
/* eslint-disable */
import { writeFileSync } from 'node:fs';
import { createEngine, mulberry32, memoryStorage, DATA } from '../../engine/src/index';
import { buildGear } from '../../engine/src/data/gear/build';
import { WORK_POOL, EFFECT_IDS } from '../../engine/src/data/gear/model';
import { maxDurOf } from '../../engine/src/gear';

const OUT = process.argv[2] || '/home/claude/balance.csv';
const E: any = createEngine({ rng: mulberry32(1), now: () => Date.UTC(2026, 10, 2, 9), storage: memoryStorage(), data: DATA });
const RAR = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const GRADES = [['Rough', 30], ['Standard', 50], ['Fine', 70], ['Superior', 87], ['Pristine', 97]] as const;
const items: Record<string, any> = DATA.items;
const gearIds = Object.keys(items).filter((id) => items[id].kind === 'gear');
const piece = (itemId: string, r: number, q: number, extra: any[] = []) => {
  const it = items[itemId]; const g: any = { uid: 'x', itemId, rarity: RAR[r], quality: q, affixes: r > 0 ? [{ id: 'primary', roll: 1 }, ...extra] : [] };
  if (it.section === 'fight') { g.maxDur = maxDurOf(g.rarity, g.affixes); g.dur = g.maxDur; } else if (it.section === 'tool') g.cond = 100;
  return g;
};
const s0 = E.newState();
const fx = (g: any) => { s0.gear = [g]; return E.gearDetail(s0, 'x'); };

// ---- CSV
const head = ['itemId', 'name', 'section', 'slot', 'type', 'material', 'tier', 'level', 'maker', 'rarity', 'grade', 'quality',
  'atk', 'def', 'heal', 'hp', 'elementShare', ...EFFECT_IDS.map((e) => 'eff_' + e), 'maxDur', 'value'];
const rows = [head.join(',')];
for (const id of gearIds) {
  const it = items[id];
  for (let r = 0; r < RAR.length; r++) for (const [gn, q] of GRADES) {
    const g = piece(id, r, q); const d = fx(g);
    const st: any = {}; d.stats.forEach((l: any) => { st[l.key] = l.value; });
    const ef: any = {}; EFFECT_IDS.forEach((e) => { ef[e] = 0; });
    d.effects.forEach((l: any) => { ef[l.key] = Math.max(ef[l.key], l.value); });
    const elem = ['fire', 'frost', 'venom', 'holy'].reduce((a, k) => a + (st[k] || 0), 0);
    rows.push([id, JSON.stringify(it.name), it.section, it.slot, it.type, it.material, it.tier, it.level, it.maker, RAR[r], gn, q,
      st.atk || 0, st.def || 0, st.heal || 0, st.hp || 0, elem, ...EFFECT_IDS.map((e) => ef[e]), it.section === 'fight' ? g.maxDur : '', E.gearValue(g)].join(','));
  }
}
writeFileSync(OUT, rows.join('\n') + '\n');
console.log(`wrote ${rows.length - 1} rows (${gearIds.length} items x 6 rarities x 5 grades) to ${OUT}`);

// ---- sanity: primary stat by tier/rarity at Rough/Standard/Pristine
const prim = (id: string) => { const it = items[id]; return RAR.map((_, r) => GRADES.filter((x) => ['Rough', 'Standard', 'Pristine'].includes(x[0])).map(([, q]) => {
  const d = fx(piece(id, r, q)); return (d.stats.find((l: any) => l.key === it.primary) || {}).value; }).join('/')).join('  '); };
console.log('\nPrimary stat Rough/Standard/Pristine, Common → Mythic');
for (const id of ['bronze_sword', 'iron_sword', 'frostbite_saber', 'bronze_cuirass', 'iron_cuirass', 'steel_cuirass']) console.log(`  ${id.padEnd(16)} ${prim(id)}`);
const chest = (id: string) => fx(piece(id, 0, 50)).stats.map((l: any) => `${l.key} ${l.value}`).join(', ');
console.log(`  chest HP: ${['bronze_cuirass', 'iron_cuirass', 'steel_cuirass'].map((id) => `${id} (${chest(id)})`).join('; ')}`);

// ---- full fight kits (Common Standard) vs boss needs
const MID = [0, 7, 22, 37];
function kitPower(tier: number) {
  const s = E.newState(); s.gear = []; Object.keys(s.equipped).forEach((k) => { s.equipped[k] = null; });
  const pick = (type: string) => gearIds.find((id) => items[id].tier === tier && items[id].type === type)!;
  const out: any = {};
  for (const [role, list] of Object.entries({ striker: ['greatsword', 'cap', 'jerkin', 'breeches', 'signet', 'signet', 'pendant'],
    guardian: ['mace', 'shield', 'helm', 'cuirass', 'greaves', 'band', 'band', 'torc'], mender: ['staff', 'hood', 'robe', 'trousers', 'loop', 'loop', 'locket'] }) as any) {
    s.gear = []; Object.keys(s.equipped).forEach((k) => { s.equipped[k] = null; });
    ['guardian', 'mender', 'striker'].forEach((k) => { s.skills[k].xp = k === role ? E.xpForLevel(MID[tier]) : 0; });
    list.forEach((type: string, i: number) => { const g = piece(pick(type), 0, 50); g.uid = 'k' + i; s.gear.push(g); E.equip(s, g.uid); });
    out[role] = E.rolePower(s, role, 'equipped');
  }
  return out;
}
console.log('\nFull Common Standard kit role power (x10) at the tier mid combat level (7/22/37) vs boss N need (300 / 500 / 750)');
for (const t of [1, 2, 3]) { const p = kitPower(t); const need = [0, 300, 500, 750][t];
  console.log(`  T${t}: ${Object.entries(p).map(([r, v]: any) => `${r} ${v} (x${(v / need).toFixed(2)})`).join(', ')}`); }

// ---- work kits: tool + 4 outfit pieces of the gather set, secondaries cycling the pool at roll 1
const T5 = buildGear([5]).items; Object.assign(items, T5);
function workKit(tier: number, r: number, q: number, best = false, skill = 'mining') {
  const s = E.newState(); s.gear = [];
  const set = 'gather'; const pool = best ? ['brisk', 'bountiful'] : WORK_POOL[set]; let k = 0;
  const sec = () => { const out = []; for (let i = 1; i < r; i++) out.push({ id: pool[k++ % pool.length], roll: best ? 1.2 : 1 }); return out; };
  const toolId = Object.keys(items).find((id) => items[id].section === 'tool' && items[id].toolSkill === skill && items[id].tier === tier)!;
  const t = piece(toolId, r, q, sec()); t.uid = 'tool'; s.gear.push(t); s.tools[skill] = 'tool';
  for (const p of ['head', 'body', 'hands', 'feet']) {
    const id = Object.keys(items).find((x) => items[x].section === 'outfit' && items[x].outfitSet === set && items[x].slot === p && items[x].tier === tier)!;
    const g = piece(id, r, q, sec()); g.uid = 'o' + p; s.gear.push(g); s.workOutfit[set][p] = g.uid;
  }
  return s;
}
function hoursTo70(s: any, skill = 'mining') {
  let h = 0; const acts = DATA.actions.filter((a: any) => a.skill === skill);
  for (let L = 1; L < 70; L++) {
    s.skills[skill].xp = E.xpForLevel(L);
    const need = E.xpForLevel(L + 1) - E.xpForLevel(L);
    const best = acts.filter((a: any) => a.level <= L).map((a: any) => a.xp * DATA.config.xpMult / E.actionTime(s, a.id)).sort((a: number, b: number) => b - a)[0];
    h += need / best / 3600;
  }
  return h;
}
function incomeGain(s: any) {
  const base = E.newState(); base.skills.mining.xp = E.xpForLevel(40); s.skills.mining.xp = E.xpForLevel(40);
  const a = 'mine_silver';
  const g0 = E.incomePerHour(base, a); const wb = E.workBonus(s, 'mining');
  const g1 = E.incomePerHour(s, a, { withGear: true }) * (1 + wb.totals.double / 100);
  return { pct: (g1 / g0 - 1) * 100, wb };
}
console.log('\nWork kit (mining tool + 4 Gather outfit pieces): totals (soft-capped), income gain at level 40, hours to level 70');
const none = E.newState(); Object.keys(none.tools).forEach((k) => { none.tools[k] = null; });
console.log(`  no tools:               hours to 70 = ${hoursTo70(none).toFixed(1)}`);
for (const [label, tier, r, q, best] of [['T1 Common Standard', 1, 0, 50, false], ['T2 Uncommon Standard', 2, 1, 50, false], ['T3 Rare Standard', 3, 2, 50, false],
  ['T3 Mythic Pristine', 3, 5, 97, false], ['T5 Mythic Pristine', 5, 5, 97, false], ['T5 Mythic Pristine best', 5, 5, 97, true]] as const) {
  const s = workKit(tier, r, q, best); const g = incomeGain(s);
  console.log(`  ${label.padEnd(24)} speed ${g.wb.totals.speed} double ${g.wb.totals.double} find ${g.wb.totals.find} → income +${g.pct.toFixed(1)}%, hours to 70 = ${hoursTo70(s).toFixed(1)}`);
}

// ---- tool payback: shop Uncommon T1 tool (600g) vs no tool, at the T1 mid level (7), each gathering skill
console.log('\nPayback (hours) vs no tool at the tier mid level (7/22/37): shop Common Rough T1 (1,000g) and crafted Common tools (value = 1.3 x inputs)');
for (const skill of ['mining', 'woodcutting', 'herbalism', 'fishing']) {
  const line: string[] = [];
  for (const [tier, lvl] of [[1, 7], [2, 22], [3, 37]]) {
    // (shop tool at T1; crafted Common tools at every tier)
    const s = E.newState(); Object.keys(s.tools).forEach((k) => { s.tools[k] = null; }); s.skills[skill].xp = E.xpForLevel(lvl);
    const best = DATA.actions.filter((a: any) => a.skill === skill && a.level <= lvl).sort((a: any, b: any) => E.incomePerHour(s, b.id) - E.incomePerHour(s, a.id))[0];
    const g0 = E.incomePerHour(s, best.id, { withGear: true });
    const toolId = Object.keys(items).find((id) => items[id].section === 'tool' && items[id].toolSkill === skill && items[id].tier === tier)!;
    for (const shop of tier === 1 ? [true, false] : [false]) {
      s.gear = s.gear.filter((x: any) => x.uid !== 'tt');
      const g = piece(toolId, 0, shop ? 30 : 50); g.uid = 'tt'; s.gear.push(g); s.tools[skill] = 'tt';
      const gain = E.incomePerHour(s, best.id, { withGear: true }) - g0;
      const cost = shop ? (DATA as any).config && 1000 : E.gearValue(g);
      line.push(`T${tier} ${shop ? `shop Common Rough ${cost}g` : `crafted ${cost}g`} → ${(cost / gain).toFixed(1)} h`);
    }
  }
  console.log(`  ${skill.padEnd(12)} ${line.join(' | ')}`);
}
