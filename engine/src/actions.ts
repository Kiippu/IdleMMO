// Actions and jobs: start/stop, timing, completion, crafting rolls (rarity, grade, pity).
// Ported from legacy/engine.js lines 406-667. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { E, SLOTS, ROLES, arr, num, cfg, rarities, masteryTiers, skillDefs, item, allActions, action, rand, clamp, randInt, lcFirst, article, itemName, qtyRange, gradeOf, gradeMid, gradeProcMult, logq } from './core';
import { addXp } from './skills';
import { addItem, consume, ownedOfKind } from './inventory';
import { findGear, makeGear, autoEat } from './gear';
import { invCount } from './v4-helpers';
import { lockedNow } from './raid-rules';

// ---------------------------------------------------------------- actions
E.actionsFor = function (skillId) {
  return allActions().filter((a) => a && a.skill === skillId).slice().sort((a, b) => num(a.level, 1) - num(b.level, 1));
};
export function roleStatOf(act, ps) {
  const s = act.skill;
  return s === 'guardian' ? ps.def : s === 'mender' ? ps.heal : ps.atk;
}
export let bonusCache = { key: '', map: {} };
export function skillBonusCached(state, skillId) {
  const key = SLOTS.map((s) => { const g = findGear(state, state.equipped[s]); return g ? g.uid + (g.dur > 0 ? '+' : '-') : '_'; }).join();
  if (bonusCache.key !== key) bonusCache = { key, map: {} };
  return bonusCache.map[skillId] || (bonusCache.map[skillId] = E.skillBonus(state, skillId));
}
export function actionTimeWith(state, act, ps) {
  if (!act) return Infinity;
  let t = Math.max(0.5, num(act.sec, 3)) * (1 - skillBonusCached(state, act.skill).speed);
  if (act.kind === 'combat') {
    const power = num((act.enemy || {}).power, 1);
    t *= clamp(power / Math.max(1, roleStatOf(act, ps)), 0.5, 3);
  }
  // cfg.speedFactor stretches every action (1 since phase 2.5 = prototype pace). E.actionTime is THE
  // time-per-rep function: the action list, the active card and crew jobs must all read it
  // (E.activeInfo already does) so they never disagree.
  t *= Math.max(1, num(cfg().speedFactor, 1));
  return Math.max(0.25, t * (1 - clamp(num(ps.speed, 0), 0, 50) / 100));
}
E.actionTime = function (state, actionId) { return actionTimeWith(state, action(actionId), E.playerStats(state)); };
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
E.start = function (state, actionId) {
  const act = action(actionId); let loadoutId = null;
  const bound = act && E.boundLoadout(state, act.skill);
  if (bound && E.skillLevel(state, act.skill) >= num(act.level, 1) && SLOTS.some((s) => bound.slots[s] && bound.slots[s] !== state.equipped[s] && findGear(state, bound.slots[s]))) {
    E.equipLoadout(state, bound.id); loadoutId = bound.id;
  }
  const c = E.canStart(state, actionId); if (!c.ok) return Object.assign(c, { loadoutId });
  if (state.active && state.active.actionId === actionId && !state.active.jobId) return { ok: true, reason: '', loadoutId };
  state.active = { actionId, progress: 0 };
  if (loadoutId) E.log(state, 'info', `Equipped your ${bound.name} loadout for ${act.name}.`);
  return { ok: true, reason: '', loadoutId };
};
E.stop = function (state) { state.active = null; return { ok: true }; };
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
export function rarityOdds(total, coreActive) {
  const R = rarities(); const odds = R.map(() => 0);
  let rarePlus = 0;
  for (let i = 2; i < R.length; i++) {
    let base = num(R[i].baseChance, 0);
    if (R[i].id === 'mythic' || (i === R.length - 1 && base === 0)) base = coreActive ? 0.004 : 0;
    odds[i] = base * total; rarePlus += odds[i];
  }
  if (rarePlus > 1) { for (let i = 2; i < R.length; i++) odds[i] /= rarePlus; rarePlus = 1; }
  const commonBase = num(R[0].baseChance, 0.7);
  if (R.length < 2) { odds[0] = 1 - rarePlus; return odds; }
  if (rarePlus <= 1 - commonBase) { odds[0] = commonBase; odds[1] = 1 - commonBase - rarePlus; }
  else { odds[0] = Math.max(0, 1 - rarePlus); odds[1] = 0; }
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
  mods.total = mods.mastery * mods.quality * mods.focus * mods.catalyst * mods.core;
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
  const base = 35 + 0.6 * (lvl - num(act.level, 1)) + m.bonus + skillBonusCached(state, act.skill).quality;
  return clamp(Math.round(clamp(base, 1, 100) + (rand() * 2 - 1) * 15), 1, 100);
}

// one completion of the active action; pushes events; may stop the action
export function completeOnce(state, act, events) {
  const c = cfg(); const xpMult = num(c.xpMult, 1);
  const stopWith = (reason) => { state.active = null; events.push({ type: 'stopped', reason }); logq(state, 'warn', `Stopped ${act.name}: ${lcFirst(reason)}`); };
  if (act.kind === 'gather') {
    const items = [];
    Object.keys(act.outputs || {}).forEach((id) => {
      if (!item(id)) return;
      const g = gradeOf(rollQualityGather(state, act)); const q = Math.max(1, Math.round(num(act.outputs[id], 1))) + (rand() < skillBonusCached(state, act.skill).yield ? 1 : 0);
      addItem(state, id, g, q); items.push({ itemId: id, grade: g, qty: q });
    });
    arr(act.bonus).forEach((b) => {
      if (!b || !item(b.item) || rand() >= num(b.chance, 0)) return;
      const g = gradeOf(rollQualityGather(state, act)); const q = qtyRange(b.qty);
      addItem(state, b.item, g, q); items.push({ itemId: b.item, grade: g, qty: q });
    });
    state.mastery[act.id] = num(state.mastery[act.id], 0) + 1;
    const xp = num(act.xp, 0) * xpMult;
    events.push({ type: 'complete', actionId: act.id, kind: act.kind, items, xp });
    addXp(state, act.skill, xp, events);
    return;
  }
  if (act.kind === 'refine' || act.kind === 'craft') {
    if (E.maxRepeats(state, act.id) < 1) { stopWith(missingReason(state, act)); return; }
    const gearCraft = isGearCraft(act);
    const pm = gearCraft ? procMods(state, act) : null; // before consuming (quality of what we're about to use)
    const avg = inputQuality(state, act, false);
    const quality = clamp(Math.round(avg + rand() * 5 + skillBonusCached(state, act.skill).quality), 1, 100); const grade = gradeOf(quality);
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
          items.push({ itemId: id, grade, qty: 1, uid: g.uid });
          events.push({ type: 'craft', actionId: act.id, gear: JSON.parse(JSON.stringify(g)), rarity: g.rarity, pityTriggered: forced });
          logq(state, 'craft', `Crafted ${article(rn)} ${rn} ${it.name}${forced ? ' (pity guarantee)' : ''}.`);
        }
      } else {
        addItem(state, id, grade, q); items.push({ itemId: id, grade, qty: q });
      }
    });
    state.mastery[act.id] = num(state.mastery[act.id], 0) + 1;
    const xp = num(act.xp, 0) * xpMult;
    events.push({ type: 'complete', actionId: act.id, kind: act.kind, items, xp });
    addXp(state, act.skill, xp, events);
    if (state.active && E.maxRepeats(state, act.id) < 1) stopWith(missingReason(state, act));
    return;
  }
  if (act.kind === 'combat') {
    const ps = E.playerStats(state); const enemy = act.enemy || {};
    if (!findGear(state, state.equipped.weapon)) { stopWith('No weapon equipped.'); return; }
    autoEat(state, events, 0.5, ps.maxHp);
    const dmg = Math.max(1, Math.round(num(enemy.dmg, 1) * (1 + rand() * 0.4) - ps.def * 0.3));
    state.hp -= dmg;
    drainDurability(state, 0.5, events);
    if (state.hp <= 0) {
      state.hp = Math.max(1, Math.round(ps.maxHp * 0.3));
      state.active = null;
      events.push({ type: 'faint' });
      logq(state, 'warn', `You fainted fighting ${enemy.name || act.name}. Eat and gear up before heading back.`);
      return;
    }
    if (act.skill === 'mender' && ps.heal > 0) state.hp = Math.min(ps.maxHp, state.hp + ps.heal * 0.5);
    const gold = Array.isArray(act.gold) ? randInt(num(act.gold[0], 0), num(act.gold[1], num(act.gold[0], 0))) : Math.max(0, Math.round(num(act.gold, 0)));
    state.gold += gold;
    const drops = [];
    arr(act.drops).forEach((d) => {
      if (!d || !item(d.item) || rand() >= num(d.chance, 0) * (1 + skillBonusCached(state, act.skill).drops)) return;
      const g = gradeOf(rollQualityGather(state, act)); const q = qtyRange(d.qty);
      addItem(state, d.item, g, q); drops.push({ itemId: d.item, grade: g, qty: q });
    });
    state.mastery[act.id] = num(state.mastery[act.id], 0) + 1;
    const xp = num(act.xp, 0) * xpMult;
    const role = ROLES.includes(act.skill) ? act.skill : 'striker';
    events.push({ type: 'kill', actionId: act.id, gold, drops, damageTaken: dmg });
    events.push({ type: 'complete', actionId: act.id, kind: act.kind, items: drops, xp });
    addXp(state, role, xp, events);
    autoEat(state, events, 0.5, E.playerStats(state).maxHp);
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
