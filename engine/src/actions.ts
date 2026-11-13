// Actions and jobs: start/stop, timing, completion, crafting rolls (rarity, grade, pity).
// Ported from legacy/engine.js lines 406-667. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { E, SLOTS, ROLES, arr, num, cfg, rarities, masteryTiers, skillDefs, item, allActions, action, rand, clamp, randInt, lcFirst, article, itemName, qtyRange, gradeOf, gradeMid, gradeProcMult, logq, plural } from './core';
import { emitGain } from './gains';
import { addXp } from './skills';
import { addItem, consume, ownedOfKind } from './inventory';
import { findGear, makeGear, autoEat, workBonus, wearTool, noToolReason } from './gear';
import { SKILL_GROUP, MASTERY_QUALITY, HP_DIV } from './data/gear/model';
import { invCount } from './v4-helpers';
import { lockedNow } from './raid-rules';
import { lootEvent, goldEvent, pushEvent } from './events';
import { flags } from './core';

// ---------------------------------------------------------------- actions
E.actionsFor = function (skillId) {
  return allActions().filter((a) => a && a.skill === skillId).slice().sort((a, b) => num(a.level, 1) - num(b.level, 1));
};
export function roleStatOf(act, ps) {
  const s = act.skill;
  return s === 'guardian' ? ps.def : s === 'mender' ? ps.heal : ps.atk;
}
/** the work bonus for an action's skill (tools + matching outfit set), or null for combat / non-profession skills */
export function workBonusFor(state, act) { return act && SKILL_GROUP[act.skill] ? workBonus(state, act.skill) : null; }
const ZERO_WB = { totals: { speed: 0, double: 0, save: 0, quality: 0, find: 0, rarity: 0 }, wear: 0 };
export const wbOf = (state, act) => workBonusFor(state, act) || ZERO_WB;
export function actionTimeWith(state, act, ps) {
  if (!act) return Infinity;
  let t = Math.max(0.5, num(act.sec, 3));
  if (act.kind === 'combat') {
    const power = num((act.enemy || {}).power, 1);
    t *= clamp(power / Math.max(1, roleStatOf(act, ps)), 0.5, 3);
  }
  // cfg.speedFactor stretches every action (1 since phase 2.5 = prototype pace). E.actionTime is THE
  // time-per-rep function: the action list, the active card and crew jobs must all read it
  // (E.activeInfo already does) so they never disagree.
  t *= Math.max(1, num(cfg().speedFactor, 1));
  // gear overhaul: tool + work outfit speed (soft-capped, %) less the tool wear penalty (3/5/8%)
  const wb = wbOf(state, act);
  return Math.max(0.25, t / (1 + (num(wb.totals.speed, 0) - num(wb.wear, 0)) / 100));
}
E.actionTime = function (state, actionId) { return actionTimeWith(state, action(actionId), E.playerStats(state)); };
// Gold per hour from repeating an action and selling its main outputs at Standard-grade value
// after market tax (bonus drops ignored). Used for the spec switch price rule and economy tests.
// Gear overhaul 2026-11-12: measured with NO tools or work outfit (H, the raid payout cap and the spec price
// stay gearless); pass opts.withGear to include the player's tools and outfit.
export function gearless(state, fn) {
  if (!state) return fn();
  const t = state.tools, w = state.workOutfit; state.tools = {}; state.workOutfit = {};
  try { return fn(); } finally { state.tools = t; state.workOutfit = w; }
}
E.incomePerHour = function (state, actionId, opts?) {
  const act = action(actionId); if (!act) return 0;
  const t = opts && opts.withGear ? E.actionTime(state, actionId) : gearless(state, () => E.actionTime(state, actionId)); if (!(t > 0) || !isFinite(t)) return 0;
  const val = Object.keys(act.outputs || {}).reduce((a, id) => a + E.itemValue(id, 1) * num(act.outputs[id], 0), 0) + (Array.isArray(act.gold) ? (act.gold[0] + act.gold[1]) / 2 : num(act.gold, 0));
  const tax = state && state.server ? E.marketTax(state) : num(cfg().marketTax, 0.05);
  return 3600 / t * val * (1 - tax);
};
E.maxRepeats = function (state, actionId) {
  const act = action(actionId); if (!act) return 0;
  if (act.kind !== 'refine' && act.kind !== 'craft') return Infinity;
  const ins = act.inputs || {}; let m = Infinity;
  Object.keys(ins).forEach((id) => { const q = num(ins[id], 0); if (q > 0) m = Math.min(m, Math.floor(E.itemCount(state, id) / q)); });
  return m;
};
export function missingReason(state, act) {
  const ins = act.inputs || {};
  for (const id of Object.keys(ins)) {
    const need = num(ins[id], 0), have = E.itemCount(state, id);
    if (have < need) return have === 0 ? `Out of ${lcFirst(itemName(id))}.` : `Need ${need} ${lcFirst(itemName(id))} (you have ${have}).`;
  }
  return 'Out of materials.';
}
E.canStart = function (state, actionId) {
  const act = action(actionId);
  if (!act) return { ok: false, reason: 'That action does not exist.' };
  const lvl = E.skillLevel(state, act.skill);
  if (lvl < num(act.level, 1)) {
    const def = skillDefs().find((d) => d.id === act.skill);
    return { ok: false, reason: `Requires ${def ? def.name : act.skill} level ${act.level}.` };
  }
  const nt = noToolReason(state, act.skill); if (nt) return { ok: false, reason: nt, noTool: true }; // owner 2026-11-14
  if ((act.kind === 'refine' || act.kind === 'craft') && E.maxRepeats(state, actionId) < 1) return { ok: false, reason: missingReason(state, act) };
  const pb = pouchBlock(state, act); if (pb) return { ok: false, reason: pb, pouchBlocked: true };
  if (act.kind === 'combat') {
    if (!findGear(state, state.equipped.weapon)) return { ok: false, reason: 'Equip a weapon before fighting.' };
    if (!(state.hp > 0)) return { ok: false, reason: 'You are too hurt to fight. Eat something first.' };
  }
  return { ok: true, reason: '' };
};
// the sealed raid pouch blocks crafting that would use pouch items, and mid-raid crafting of consumables
export function pouchBlock(state, act) {
  if (!act || (act.kind !== 'refine' && act.kind !== 'craft') || !state.raid || !state.raid.pouch) return '';
  const sealed = lockedNow(state); const live = sealed && E.isRaidWindow(state);
  if (!sealed) return '';
  const usesPouch = Object.keys(act.inputs || {}).find((id) => invCount(state.raid.pouch, id) > 0 && E.itemCount(state, id) < num(act.inputs[id], 0));
  if (usesPouch) return `Your raid pouch is sealed: its ${lcFirst(itemName(usesPouch))} can't be used for crafting.`;
  const makesConsumable = Object.keys(act.outputs || {}).some((id) => item(id) && (item(id).kind === 'food' || item(id).kind === 'potion'));
  if (live && makesConsumable) return 'The raid is live and your pouch is sealed: no mid-raid crafting of food or potions.';
  return '';
}
// Quantity jobs (juice pass 2026-11-12): start(state, actionId, count?) runs `count` reps and then stops
// with { type: 'stopped', reason, done: true }. count null/undefined/<1 = keep going (until stopped or out
// of inputs). state.active gains additive fields: left (reps still to do), count (asked for), got (main
// output made so far, or kills). A save without `left` runs unlimited. When a job ends the slot stays
// empty (owner decision: no auto-resume).
export function normCount(count) {
  const n = Math.floor(Number(count));
  return isFinite(n) && n >= 1 ? Math.min(n, 1e6) : null;
}
E.start = function (state, actionId, count) {
  const c = E.canStart(state, actionId); if (!c.ok) return c;
  const n = normCount(count);
  if (state.active && state.active.actionId === actionId && !state.active.jobId) {
    // same action again: keep its progress, take the new count
    if (n) { state.active.left = n; state.active.count = n; state.active.got = 0; } else { delete state.active.left; delete state.active.count; delete state.active.got; }
    clearHold(state.active); // a verb that changes the job clears the hold
    return { ok: true, reason: '' };
  }
  state.active = n ? { actionId, progress: 0, left: n, count: n, got: 0 } : { actionId, progress: 0 };
  return { ok: true, reason: '' };
};
/** main output of an action (first output item), or null */
export function mainOutput(act) { return Object.keys((act && act.outputs) || {}).find((id) => item(id)) || null; }
/** "Made 10 Copper bars." / "Gathered 40 Copper ore." / "Defeated 10 Mangy wolves." */
export function jobDoneText(act, got) {
  const n = Math.max(0, Math.floor(num(got, 0)));
  if (act.kind === 'combat') return `Defeated ${n} ${plural((act.enemy && act.enemy.name) || act.name, n)}.`;
  const out = mainOutput(act); const name = out ? plural(itemName(out), n) : act.name;
  return `${act.kind === 'gather' ? 'Gathered' : 'Made'} ${n} ${name}.`;
}
/** after one finished rep of the solo action: count it; at 0 left the job ends. Returns true if it ended. */
export function countRep(state, act, events, gotNow) {
  const a = state.active; if (!a || a.jobId || a.actionId !== act.id) return false;
  if (a.left == null) return false;
  a.got = num(a.got, 0) + Math.max(0, num(gotNow, 0));
  a.left = Math.max(0, Math.floor(num(a.left, 0)) - 1);
  if (a.left > 0) return false;
  const reason = jobDoneText(act, a.got);
  state.active = null;
  events.push({ type: 'stopped', reason, done: true, actionId: act.id });
  logq(state, 'info', reason);
  const out = mainOutput(act);
  pushEvent(state, 'loot', reason, act.kind !== 'combat' && out ? { itemId: out, qty: Math.floor(num(a.got, 0)) } : {});
  return true;
}
E.maxMake = function (state) {
  const out = {};
  allActions().forEach((a) => { if (!a || !a.id) return; const m = E.maxRepeats(state, a.id); out[a.id] = isFinite(m) ? Math.max(0, m) : null; });
  return out;
};
E.stop = function (state) { state.active = null; return { ok: true }; };
// Job hold (2026-11-12, craft card pause): state.active.held (+ heldAt engine-clock ms, heldFrac 0..1 while held)
// are additive, in-memory only fields: migrate never copies them, so a load always starts unheld.
export const HOLD_MAX_MS = 10 * 60 * 1000;
export function clearHold(a) { if (a) { delete a.held; delete a.heldAt; delete a.heldFrac; } }
E.setSetting = function (state, key, value) {
  if (key === 'matPriority') { if (value !== 'best' && value !== 'worst') return { ok: false, reason: 'Priority must be best or worst.' }; state.settings.matPriority = value; return { ok: true }; }
  if (key === 'useCatalyst' || key === 'useCore') { state.settings[key] = !!value; return { ok: true }; }
  return { ok: false, reason: 'Unknown setting.' };
};

// mastery / proc
export function masteryInfo(state, actionId) {
  const count = num(state.mastery[actionId], 0); const tiers = masteryTiers();
  let idx = 0; tiers.forEach((t, i) => { if (count >= num(t.crafts, 0)) idx = i; });
  const next = tiers[idx + 1] ? tiers[idx + 1].crafts : null;
  return { idx, tier: tiers[idx], count, next, bonus: tiers.length > 1 ? 20 * idx / (tiers.length - 1) : 0 };
}
export function isGearCraft(act) {
  return !!act && act.kind === 'craft' && Object.keys(act.outputs || {}).some((id) => item(id) && item(id).kind === 'gear');
}
export function bestCatalyst(state) {
  let best = null;
  ownedOfKind(state, 'catalyst').forEach((id) => { const m = num(item(id).procMult, 1.25); if (!best || m > best.m) best = { id, m }; });
  return best;
}
export function ownedCore(state) { return ownedOfKind(state, 'core')[0] || null; }
export function inputQuality(state, act, dry?) { // average grade midpoint of what the next completion consumes
  const ins = act.inputs || {}; let n = 0, q = 0;
  Object.keys(ins).forEach((id) => { const r = consume(state, id, num(ins[id], 0), state.settings.matPriority, dry); n += r.taken; q += r.qsum; });
  return n > 0 ? q / n : gradeMid(1);
}
/**
 * Rarity odds (owner 2026-11-13): base Common 85 / Uncommon 11 / Rare 3.25 / Epic 0.65 / Legendary 0.1% (Mythic 0.4% only with a
 * boss core). The modifier total (mastery x input grade x focus x catalyst x Fortunate) multiplies EVERY non-common chance;
 * Common is the remainder. Non-common is capped at cfg.rarityNonCommonCap (60%), scaled proportionally.
 */
export function rarityOdds(total, coreActive) {
  const R = rarities(); const odds = R.map(() => 0);
  const t = Math.max(0, num(total, 1));
  let nonCommon = 0;
  for (let i = 1; i < R.length; i++) {
    let base = num(R[i].baseChance, 0);
    if (R[i].id === 'mythic' || (i === R.length - 1 && base === 0)) base = coreActive ? 0.004 : 0;
    odds[i] = base * t; nonCommon += odds[i];
  }
  const cap = clamp(num(cfg().rarityNonCommonCap, 0.6), 0, 1);
  if (nonCommon > cap) { const k = cap / nonCommon; for (let i = 1; i < R.length; i++) odds[i] *= k; nonCommon = cap; }
  odds[0] = Math.max(0, 1 - nonCommon);
  return odds;
}
export function procMods(state, act, dry?) {
  const m = masteryInfo(state, act.id);
  const qGrade = gradeOf(inputQuality(state, act, true));
  const cat = state.settings.useCatalyst ? bestCatalyst(state) : null;
  const coreId = state.settings.useCore ? ownedCore(state) : null;
  const mods: any = {
    mastery: num(m.tier.mult, 1), quality: gradeProcMult(qGrade), focus: 1 + 0.2 * clamp(num(state.focus, 0), 0, 100) / 100,
    catalyst: cat ? cat.m : 1, core: 1
  };
  mods.gear = 1 + num(wbOf(state, act).totals.rarity, 0) / 100; // Fortunate (tools + craft outfit), relative
  mods.total = mods.mastery * mods.quality * mods.focus * mods.catalyst * mods.core * mods.gear;
  return { mods, m, cat, coreId };
}
E.procOdds = function (state, actionId) {
  const act = action(actionId); if (!isGearCraft(act)) return null;
  const p = procMods(state, act);
  const odds = rarityOdds(p.mods.total, !!p.coreId);
  p.mods.coreActive = !!p.coreId; p.mods.catalystItem = p.cat ? p.cat.id : null;
  return {
    odds: rarities().map((r, i) => ({ rarity: r.id, chance: odds[i] })),
    mods: p.mods,
    masteryTier: { name: p.m.tier.name, crafts: p.m.count, next: p.m.next },
    pity: { count: num(state.pity[actionId], 0), threshold: num(cfg().pityThreshold, 40) }
  };
};

export function rollQualityGather(state, act) {
  const lvl = E.skillLevel(state, act.skill); const m = masteryInfo(state, act.id);
  const base = 35 + 0.6 * (lvl - num(act.level, 1)) + m.bonus;
  return clamp(Math.round(clamp(base, 1, 100) + (rand() * 2 - 1) * 15), 1, 100);
}

// one completion of the active action; pushes events; may stop the action
export function completeOnce(state, act, events) {
  const c = cfg(); const xpMult = num(c.xpMult, 1);
  const stopWith = (reason) => { state.active = null; events.push({ type: 'stopped', reason }); logq(state, 'warn', `Stopped ${act.name}: ${lcFirst(reason)}`); };
  const wb = wbOf(state, act);
  if (act.kind === 'gather') {
    const items = [];
    Object.keys(act.outputs || {}).forEach((id) => {
      if (!item(id)) return;
      const g = gradeOf(rollQualityGather(state, act)); const q0 = Math.max(1, Math.round(num(act.outputs[id], 1)));
      const q = q0 * (rand() < num(wb.totals.double, 0) / 100 ? 2 : 1); // Double output
      addItem(state, id, g, q); items.push({ itemId: id, grade: g, qty: q });
    });
    arr(act.bonus).forEach((b) => {
      if (!b || !item(b.item) || rand() >= num(b.chance, 0) * (1 + num(wb.totals.find, 0) / 100)) return; // Bonus find
      const g = gradeOf(rollQualityGather(state, act)); const q = qtyRange(b.qty);
      addItem(state, b.item, g, q); items.push({ itemId: b.item, grade: g, qty: q });
    });
    if (!flags.quiet) items.forEach((i) => lootEvent(state, 'gather', i.itemId, i.qty, i.grade));
    emitGain('gather', items);
    toolWear(state, act, events);
    state.mastery[act.id] = num(state.mastery[act.id], 0) + 1;
    const xp = num(act.xp, 0) * xpMult;
    events.push({ type: 'complete', actionId: act.id, kind: act.kind, items, xp });
    addXp(state, act.skill, xp, events);
    const main = mainOutput(act);
    countRep(state, act, events, items.filter((i) => i.itemId === main).reduce((x, i) => x + i.qty, 0));
    return;
  }
  if (act.kind === 'refine' || act.kind === 'craft') {
    if (E.maxRepeats(state, act.id) < 1) { stopWith(missingReason(state, act)); return; }
    const gearCraft = isGearCraft(act);
    const pm = gearCraft ? procMods(state, act) : null; // before consuming (quality of what we're about to use)
    const avg = inputQuality(state, act, false);
    const quality = act.kind === 'craft' ? craftQuality(state, act, avg, true) : clamp(Math.round(avg + rand() * 5), 1, 100); const grade = gradeOf(quality);
    // Save input (Thrifty, refining tools, outfits): one unit of one input comes back
    const ins = Object.keys(act.inputs || {}).filter((id) => item(id) && num(act.inputs[id], 0) > 0);
    if (ins.length && rand() < num(wb.totals.save, 0) / 100) { const back = ins[Math.floor(rand() * ins.length)]; addItem(state, back, gradeOf(avg), 1); }
    const dbl = rand() < num(wb.totals.double, 0) / 100; // Double output (stackable outputs only)
    const items = [];
    Object.keys(act.outputs || {}).forEach((id) => {
      const it = item(id); if (!it) return;
      const q = Math.max(1, Math.round(num(act.outputs[id], 1)));
      if (it.kind === 'gear') {
        for (let k = 0; k < q; k++) {
          const threshold = num(c.pityThreshold, 40);
          const pity = num(state.pity[act.id], 0);
          const odds = rarityOdds(pm.mods.total, !!pm.coreId);
          let rIdx = 0; const forced = pity >= threshold;
          if (forced) {
            let tot = 0; for (let i = 2; i < odds.length; i++) tot += odds[i];
            let r = rand() * tot; rIdx = Math.min(2, odds.length - 1);
            if (tot > 0) for (let i = 2; i < odds.length; i++) { r -= odds[i]; if (r < 0) { rIdx = i; break; } }
          } else {
            let r = rand(); rIdx = 0;
            for (let i = 0; i < odds.length; i++) { r -= odds[i]; if (r < 0) { rIdx = i; break; } }
          }
          if (pm.cat) consume(state, pm.cat.id, 1, 'worst');
          if (pm.coreId) consume(state, pm.coreId, 1, 'worst');
          if (pm.cat && k < q - 1) pm.cat = bestCatalyst(state);
          if (pm.coreId && k < q - 1) pm.coreId = ownedCore(state);
          const g = makeGear(state, id, rIdx, quality);
          state.pity[act.id] = rIdx >= 2 ? 0 : pity + 1;
          const rn = rarities()[rIdx].name;
          items.push({ itemId: id, grade, qty: 1, uid: g.uid, rarity: g.rarity });
          events.push({ type: 'craft', actionId: act.id, gear: JSON.parse(JSON.stringify(g)), rarity: g.rarity, pityTriggered: forced });
          logq(state, 'craft', `Crafted ${article(rn)} ${rn} ${it.name}${forced ? ' (pity guarantee)' : ''}.`);
          if (!flags.quiet) pushEvent(state, 'loot', `Crafted ${article(rn)} ${rn} ${it.name}${forced ? ' (pity guarantee)' : ''}.`, { itemId: id, qty: 1, rarity: g.rarity });
        }
      } else {
        const qq = dbl ? q * 2 : q;
        addItem(state, id, grade, qq); items.push({ itemId: id, grade, qty: qq });
        if (!flags.quiet) lootEvent(state, act.kind, id, qq, grade);
      }
    });
    emitGain(act.kind, items);
    toolWear(state, act, events);
    state.mastery[act.id] = num(state.mastery[act.id], 0) + 1;
    const xp = num(act.xp, 0) * xpMult;
    events.push({ type: 'complete', actionId: act.id, kind: act.kind, items, xp });
    addXp(state, act.skill, xp, events);
    const main = mainOutput(act);
    if (countRep(state, act, events, items.filter((i) => i.itemId === main).reduce((x, i) => x + i.qty, 0))) return;
    if (state.active && E.maxRepeats(state, act.id) < 1) stopWith(missingReason(state, act));
    return;
  }
  if (act.kind === 'combat') {
    const ps = E.playerStats(state); const enemy = act.enemy || {};
    if (!findGear(state, state.equipped.weapon)) { stopWith('No weapon equipped.'); return; }
    autoEat(state, events, 0.5, ps.maxHp);
    // enemy damage is on the x2 HP scale; worked out on the x10 scale against defence (x10), then / 5: same fights as before
    const dmg = Math.max(1, Math.round(num(enemy.dmg, 1) * HP_DIV * (1 + rand() * 0.4) - ps.def * 0.3)) / HP_DIV;
    state.hp -= dmg;
    drainDurability(state, 0.5, events);
    if (state.hp <= 0) {
      state.hp = Math.max(1, Math.round(ps.maxHp * HP_DIV * 0.3)) / HP_DIV;
      state.active = null;
      events.push({ type: 'faint' });
      logq(state, 'warn', `You fainted fighting ${enemy.name || act.name}. Eat and gear up before heading back.`);
      return;
    }
    if (act.skill === 'mender' && ps.heal > 0) state.hp = Math.min(ps.maxHp, state.hp + ps.heal * 0.5 / HP_DIV); // Healing (x10) → HP (x2)
    const gold = Array.isArray(act.gold) ? randInt(num(act.gold[0], 0), num(act.gold[1], num(act.gold[0], 0))) : Math.max(0, Math.round(num(act.gold, 0)));
    state.gold += gold;
    const drops = [];
    arr(act.drops).forEach((d) => {
      if (!d || !item(d.item) || rand() >= num(d.chance, 0)) return;
      const g = gradeOf(rollQualityGather(state, act)); const q = qtyRange(d.qty);
      addItem(state, d.item, g, q); drops.push({ itemId: d.item, grade: g, qty: q });
    });
    if (!flags.quiet) { drops.forEach((d) => lootEvent(state, 'combat', d.itemId, d.qty, d.grade)); goldEvent(state, 'combat:' + act.id, gold, `Gold from ${act.name}`); }
    emitGain('combat', drops);
    state.mastery[act.id] = num(state.mastery[act.id], 0) + 1;
    const xp = num(act.xp, 0) * xpMult;
    const role = ROLES.includes(act.skill) ? act.skill : 'striker';
    events.push({ type: 'kill', actionId: act.id, gold, drops, damageTaken: dmg });
    events.push({ type: 'complete', actionId: act.id, kind: act.kind, items: drops, xp });
    addXp(state, role, xp, events);
    autoEat(state, events, 0.5, E.playerStats(state).maxHp);
    countRep(state, act, events, 1);
    return;
  }
  stopWith('This action cannot be repeated.');
}
export function drainDurability(state, amount, events) {
  SLOTS.forEach((slot) => {
    const g = findGear(state, state.equipped[slot]); if (!g || !(g.dur > 0)) return;
    g.dur = Math.max(0, Math.round((g.dur - amount) * 100) / 100);
    if (g.dur <= 0) { events.push({ type: 'broken', uid: g.uid }); logq(state, 'warn', `Your ${E.gearName(g)} broke. Repair it to restore its stats.`); }
  });
}

/**
 * Crafted quality (gear spec 2026-11-12): 0.5 x avg input quality + 25 + clamp(level - recipe level, -10, +30)
 * - 3 x (tier - 1) + mastery points (0/2/4/7/10) + tool/outfit quality points, +-4 at random. roll=false: the mean.
 */
export function craftQuality(state, act, avg, roll) {
  const lvl = E.skillLevel(state, act.skill); const out = item(mainOutput(act)); const tier = Math.max(1, Math.floor(num(out && out.tier, 1)));
  const m = masteryInfo(state, act.id);
  const base = 0.5 * num(avg, 50) + 25 + clamp(lvl - num(act.level, 1), -10, 30) - 3 * (tier - 1) + num(MASTERY_QUALITY[m.idx], 0) + num(wbOf(state, act).totals.quality, 0);
  return clamp(Math.round(base + (roll ? (rand() * 2 - 1) * 4 : 0)), 1, 100);
}
E.craftQuality = function (state, actionId) {
  const act = action(actionId); if (!act || act.kind !== 'craft') return null;
  const avg = inputQuality(state, act, true); const q = craftQuality(state, act, avg, false);
  return { expected: q, min: clamp(q - 4, 1, 100), max: clamp(q + 4, 1, 100), grade: gradeOf(q) };
};
/** one rep of work wears the skill's tool (seconds of the rep); a drop below 50% logs once */
export function toolWear(state, act, events?) {
  if (!act || !SKILL_GROUP[act.skill]) return;
  const t = E.actionTime(state, act.id);
  if (wearTool(state, act.skill, isFinite(t) ? t : 0)) {
    const g = findGear(state, state.tools[act.skill]);
    logq(state, 'warn', `Your ${E.gearName(g)} is worn (${Math.round(g.cond)}%): −3% speed. Repair it in Stores.`);
    if (events) events.push({ type: 'toolWorn', uid: g.uid, skill: act.skill });
  }
}
