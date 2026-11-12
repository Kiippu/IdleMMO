// Raid fight simulation (pure).
// Ported from legacy/engine.js lines 1596-1816. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { HP_DIV } from './data/gear/model';
import { ctx } from './context';
import { E, SLOTS, CHECKS, D, arr, num, cfg, item, clamp, lcFirst } from './core';
import { findGear } from './gear';
import { CHECK_LABEL, ROLE_CHECK, OFF_ROLE, ROLE_MIX, mulberry, clone, roleDef, sumInv, invCount, invTake, BEST, WORST } from './v4-helpers';
import { avgPop, curRecord, bossReq } from './server';
import { statsFor, powersOf } from './stats';
import { normRules, lockedNow, healOfAny, makeLock, tierFor } from './raid-rules';
import { bossPhases } from './weekly';
import { cap1 } from './crew-economy';

// ================================================================ v4: fight simulation (pure)
export function crewAttending(state, rng) {
  return arr(state.crew && state.crew.members).filter((m) => rng() < num(m.attend, 0.85)).map((m) => ({ id: m.id, name: m.name, role: m.role, pf: clamp(num(m.pf, 1) * (0.92 + rng() * 0.16), 0.3, 3), food: num(m.food, 5), potions: num(m.potions, 1) }));
}
export function npcAuras(state, rng) {
  const guilds = arr(D().npcGuilds).filter((g) => g && g.name);
  return shuffleWith(guilds, rng).slice(0, Math.min(guilds.length, 3 + Math.floor(rng() * 2))).map((g) => ({ guild: g.name, type: CHECKS.includes(g.aura) ? g.aura : 'damage', tier: 1 + Math.floor(rng() * 3), mine: false }));
}
export function shuffleWith(list, rng) { const l = list.slice(); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; }
export function auraTotals(list) {
  const st = cfg().auraStrength || [0, 0.04, 0.08, 0.12]; const out = { mitigation: 0, healing: 0, damage: 0 };
  CHECKS.forEach((type) => { list.filter((a) => a.type === type && a.tier > 0).map((a) => num(st[a.tier], 0)).sort((a, b) => b - a).forEach((s, i) => { out[type] += s * Math.pow(0.5, i); }); });
  return out;
}
export function crewAuraType(roles) {
  const n = { guardian: 0, mender: 0, striker: 0 }; roles.forEach((r) => { if (n[r] != null) n[r]++; });
  const top = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
  return ROLE_CHECK[top];
}
export const auraTierFor = (n) => arr(cfg().auraTierAttendance).length ? cfg().auraTierAttendance.filter((x) => n >= x).length : (n >= 20 ? 3 : n >= 12 ? 2 : n >= 6 ? 1 : 0);

// ctx: { boss, rec, rng, joined, role, slots, rules, pouch (copy), state }
export function simulateFight(state, ctx) {
  const rng = ctx.rng; const c = cfg();
  const boss = ctx.boss; const rec = ctx.rec; const phases = bossPhases(boss); const P = phases.length;
  const N = Math.max(6, Math.round(num(c.raidChargeHours, 10) * 6));
  const fair = bossReq(boss);
  const participants = Math.max(50, Math.round(num(state.server.pop, avgPop(state)) * num(c.serverTurnout, 0.85) * (0.96 + rng() * 0.08)));
  const nominal = Math.max(4, Math.round(N / (P * 1.25))); const overMax = Math.max(2, Math.round(nominal * 0.4));
  const role = ctx.joined ? ctx.role : null; const rdef = role ? roleDef(role) : null;
  const rules = ctx.rules; const pouch = ctx.pouch;
  const ps = statsFor(state, ctx.slots); const pw = powersOf(ps, boss); const maxHp = ps.maxHp;
  const eaten = {}; const potionsUsed = {}; const events0 = []; const buffs = { atk: 0, def: 0, heal: 0 };
  const takeOne = (id, prefer?) => { const t = invTake(pouch, id, 1, prefer || WORST, 0); return t.length ? t[0].grade : -1; };
  if (role && role !== 'supply') {
    ['atk', 'def', 'heal'].forEach((stat) => {
      let best = null;
      Object.keys(pouch).forEach((id) => { const b = (item(id) || {}).buff; if (b && b.stat === stat && num(b.pct, 0) > 0 && invCount(pouch, id) > 0 && (!best || b.pct > best.pct)) best = { id, pct: b.pct }; });
      if (best) { takeOne(best.id, BEST); potionsUsed[best.id] = (potionsUsed[best.id] || 0) + 1; buffs[stat] = clamp(best.pct, 0, 1); events0.push({ kind: 'eat', value: 0, text: `${item(best.id).name}: +${Math.round(best.pct * 100)}% ${stat}` }); }
    });
  }
  const crew = ctx.crew; const crewDown = crew.map(() => 0);
  // ---- crew vault stock (filled through town contracts). Phase 2.5: the raid draws only what
  // members actually need, one unit at a time, and every unit used on a member counts toward
  // THAT member's contribution (credited to the running check).
  const vstock = ctx.vaultStock || {};
  const vaultConsumed: any = {}; const vaultUse: any = {};
  const isHeal = (id) => { const it = item(id); return !!it && (it.kind === 'food' || (it.kind === 'potion' && num(it.heal, 0) > 0)); };
  const vaultStart = { food: 0, potions: 0 };
  Object.keys(vstock).forEach((id) => { const it = item(id); if (!it) return; if (it.kind === 'food') vaultStart.food += invCount(vstock, id); else if (it.kind === 'potion') vaultStart.potions += invCount(vstock, id); });
  const vaultTake = (whoId, whoName, id, how) => {
    const t = invTake(vstock, id, 1, WORST, 0); if (!t.length) return -1;
    vaultConsumed[id] = (vaultConsumed[id] || 0) + 1;
    const u = vaultUse[whoId] || (vaultUse[whoId] = { who: whoId, name: whoName, items: {}, healed: 0, buffed: 0, credit: 0 });
    u.items[id] = (u.items[id] || 0) + 1; if (how === 'buff') u.buffed++; else u.healed++;
    return t[0].grade;
  };
  // Stock ran out: a member needed food / a healing potion / a role buff, the vault started the fight
  // with some of that kind, and none was left. Counted per member (stockShortfall on the recap).
  const startHad = { food: false, potion: false, buff: {} };
  Object.keys(vstock).forEach((id) => { const it = item(id); if (!it || invCount(vstock, id) <= 0) return;
    if (it.kind === 'food') startHad.food = true; else if (isHeal(id)) startHad.potion = true;
    if (it.buff && it.buff.stat) startHad.buff[it.buff.stat] = true; });
  const shortfall: any = {}; let stockOutFrame = null; let curFrame = 0;
  const vaultMiss = (whoId, whoName, kind) => {
    const had = kind === 'food' ? startHad.food : kind === 'potion' ? startHad.potion : !!startHad.buff[kind];
    if (!had) return;
    const u = shortfall[whoId] || (shortfall[whoId] = { who: whoId, name: whoName, heal: 0, buff: 0 });
    if (kind === 'food' || kind === 'potion') u.heal++; else u.buff++;
    if (stockOutFrame == null) stockOutFrame = curFrame;
  };
  const vaultCreditOf = (id, g) => Math.max(40, healOfAny(id, g) * HP_DIV) * num(c.vaultCreditMult, 1); // points (x10), from heal (x2 HP)
  const vaultFind = (pred, needHp?) => { // smallest heal that covers needHp, else the biggest
    let best = null, biggest = null;
    Object.keys(vstock).forEach((id) => {
      if (!pred(id) || invCount(vstock, id) <= 0) return; const g = vstock[id].findIndex((x) => x > 0); const h = healOfAny(id, g); const cnd = { id, h };
      if (needHp != null && h >= needHp && (!best || h < best.h)) best = cnd; if (!biggest || h > biggest.h) biggest = cnd;
    });
    return (best || biggest || { id: null }).id;
  };
  const vaultBuffFor = (stat) => { let best = null; Object.keys(vstock).forEach((id) => { const b = (item(id) || {}).buff; if (b && b.stat === stat && num(b.pct, 0) > 0 && invCount(vstock, id) > 0 && (!best || b.pct > best.pct)) best = { id, pct: b.pct }; }); return best; };
  const counters = (id) => { const it = item(id) || {}; return !!it.counters && (it.counters === boss.id || arr(it.counters).includes(boss.id)); };
  const CHECK_STAT = { damage: 'atk', mitigation: 'def', healing: 'heal' };
  // buffs: one potion per member for their role's stat, only if they don't already have one
  if (role && role !== 'supply') {
    const stat = CHECK_STAT[ROLE_CHECK[role]];
    if (stat && !(buffs[stat] > 0)) { const b = vaultBuffFor(stat); if (!b) vaultMiss('you', 'You', stat); if (b) { vaultTake('you', 'You', b.id, 'buff'); buffs[stat] = clamp(b.pct * (counters(b.id) ? 1.5 : 1), 0, 1); events0.push({ kind: 'eat', value: 0, text: `Crew stock ${item(b.id).name}: +${Math.round(buffs[stat] * 100)}% ${stat}` }); } }
  }
  const crewBuff = crew.map((m) => {
    const stat = CHECK_STAT[ROLE_CHECK[m.role]]; const b = stat ? vaultBuffFor(stat) : null; if (!b) { if (stat) vaultMiss(m.id, m.name, stat); return 0; }
    vaultTake(m.id, m.name, b.id, 'buff'); return b.pct * (counters(b.id) ? 1.5 : 1);
  });
  let crewFood = crew.reduce((a, m) => a + m.food, 0), crewFoodAcc = 0, foodOutWave = null, foodOutFrame = null, crewFoodShort = 0;
  const crewPotions = crew.reduce((a, m) => a + m.potions, 0) + vaultStart.potions;
  let youCredit = 0;
  const memberPts = crew.map(() => 0); let yourPts = 0; // raid gold split: each attendee's fill of the running checks
  const playerRoleForAura = role && role !== 'supply' ? [role] : [];
  const myAuraType = crewAuraType(crew.map((m) => m.role).concat(playerRoleForAura));
  const attendCount = crew.length + (ctx.joined ? 1 : 0);
  const startTier = auraTierFor(attendCount);
  const npc = ctx.npcAuras;
  const crewName = (state.crew && state.crew.name) || 'Your crew';
  const stance = rules.stance;
  const stDmg = stance === 'aggressive' ? 1.25 : stance === 'defensive' ? 0.8 : 1;
  const stMit = stance === 'defensive' ? 1.2 : stance === 'aggressive' ? 0.9 : 1;
  const stTaken = stance === 'aggressive' ? 1.3 : stance === 'defensive' ? 0.7 : 1;
  const endure = rules.tactic === 'endure' ? 1.2 : 1;
  const pressure = 0.07 * clamp(fair / Math.max(50, pw.guardian * 0.5 + Math.max(pw.striker, pw.mender, pw.guardian) * 0.5), 0.4, 3);
  const mitigFrac = clamp(ps.def / (ps.def + fair * 1.5 + 100) * endure * (stance === 'defensive' ? 1.2 : 1), 0, 0.7);
  const resist = clamp(num(ps.wards && ps.wards[boss.hits], 0) / 100, 0, 0.2); // Warded (gear overhaul)
  // supply line: delivers the pouch evenly across the fight
  const pouchStart = sumInv(pouch); const supplyUnits = role === 'supply' ? pouchStart : 0; let supplyAcc = 0, supplyDelivered = 0;
  let hp = ctx.joined ? clamp(num(ctx.startHp, maxHp), 1 / HP_DIV, maxHp) : 0; let down = 0;
  let bossHp = rec.hpLeft; const bossMax = rec.maxHp; const hpBefore = bossHp;
  const serverBase = participants * fair * ROLE_MIX;
  let waveAuraMin = 99, waveDownMax = 0, waveWeakFrames = 0, waveLossSum = 0;
  let phase = 0, wave = 1, pf = 0, form = 0.9 + rng() * 0.22, momentum = 1;
  let fill = 0, yourFill = 0, crewFill = 0, crewNeedAcc = 0;
  const need = serverBase * nominal;
  const waves = []; const timeline = []; const moments = [];
  let faints = 0, reviveFood = 0, killedAt = -1, pDmg = 0, pHeal = 0, pMit = 0, crewTot = { damage: 0, healing: 0, mitigation: 0 }, auraWeakenedWave = null, maxCrewDown = 0;
  const cpHit = []; const cps = arr(c.checkpoints).filter((x) => !rec.checkpointsPaid.includes(x));
  const chooseHeal = (needHp) => {
    let best = null, biggest = null;
    Object.keys(pouch).forEach((id) => {
      const it = item(id); if (!it || !(num(it.heal, 0) > 0)) return; const g = pouch[id].findIndex((x) => x > 0); if (g < 0) return;
      const h = healOfAny(id, g); const cnd = { id, h };
      if (h >= needHp && (!best || h < best.h)) best = cnd; if (!biggest || h > biggest.h) biggest = cnd;
    });
    return best || biggest;
  };
  let cumYour = 0, cumTot = 0; // contribution points of finished waves (for the live view)
  for (let i = 0; i < N; i++) {
    curFrame = i;
    const check = phases[phase].check; const ev = i === 0 ? events0.slice() : [];
    if (pf === 0) ev.push({ kind: 'phase', text: `Phase ${phase + 1}: ${phases[phase].name}` });
    const over = pf >= nominal; const spike = over && check !== 'damage' ? 1.6 : 1;
    // crew
    let downNow = 0; const crewOut = { damage: 0, healing: 0, mitigation: 0 }; const memFrame = crew.map(() => 0);
    crew.forEach((m, k) => {
      if (crewDown[k] > 0) { crewDown[k]--; downNow++; return; }
      const weak = clamp(1 / m.pf, 0.6, 2.5);
      crewFoodAcc += 0.1 * weak * spike;
      let fed = crewFood > 0, credit = 0;
      while (crewFoodAcc >= 1) {
        crewFoodAcc -= 1;
        if (crewFood > 0) crewFood--;
        else { // own food gone: draw one unit of crew stock for this member
          const fid = vaultFind((id) => (item(id) || {}).kind === 'food');
          const g = fid ? vaultTake(m.id, m.name, fid, 'heal') : -1;
          if (g >= 0) { fed = true; credit += vaultCreditOf(fid, g); }
          else { fed = false; crewFoodShort++; vaultMiss(m.id, m.name, 'food'); if (foodOutWave == null) { foodOutWave = wave; foodOutFrame = i; } }
        }
      }
      const pFaint = 0.015 * weak * weak * spike * (fed ? 1 : 2.5);
      if (rng() < pFaint) {
        const pid = vaultFind((id) => isHeal(id) && (item(id) || {}).kind === 'potion');
        const g = pid ? vaultTake(m.id, m.name, pid, 'heal') : -1;
        if (g < 0) { vaultMiss(m.id, m.name, 'potion'); crewDown[k] = num(c.faintFrames, 3); downNow++; return; }
        credit += vaultCreditOf(pid, g); // a stock potion kept them on their feet
      }
      CHECKS.forEach((ck) => { crewOut[ck] += m.pf * fair * (ROLE_CHECK[m.role] === ck ? 1 + crewBuff[k] : OFF_ROLE); });
      if (credit > 0) { crewOut[check] += credit; vaultUse[m.id].credit += credit; }
      memFrame[k] = m.pf * fair * (ROLE_CHECK[m.role] === check ? 1 + crewBuff[k] : OFF_ROLE) + credit; // this member's fill of the running check
    });
    maxCrewDown = Math.max(maxCrewDown, downNow);
    const myTier = auraTierFor(attendCount - downNow - (down > 0 ? 1 : 0));
    waveAuraMin = Math.min(waveAuraMin, myTier); waveDownMax = Math.max(waveDownMax, downNow + (down > 0 ? 1 : 0)); if (myTier < startTier) { waveWeakFrames++; waveLossSum += num((cfg().auraStrength || [])[startTier], 0) - num((cfg().auraStrength || [])[myTier], 0); }
    const auraList = npc.concat(myAuraType ? [{ guild: crewName, type: myAuraType, tier: myTier, mine: true }] : []);
    const aura = auraTotals(auraList);
    // Crew auras multiply crew output on each check (vault buffs are per member, applied above).
    CHECKS.forEach((ck) => { crewOut[ck] *= 1 + aura[ck]; crewTot[ck] += crewOut[ck]; });
    memFrame.forEach((v, k) => { memberPts[k] += v * (1 + aura[check]); });
    // player
    const out = { damage: 0, healing: 0, mitigation: 0 };
    let taken = 0, crit = false, frameCredit = 0;
    if (ctx.joined && role !== 'supply') {
      if (down > 0) {
        down--;
        if (down === 0) {
          const fid = Object.keys(pouch).find((id) => item(id) && item(id).kind === 'food' && invCount(pouch, id) > 0);
          const vfid = fid ? null : vaultFind((id) => (item(id) || {}).kind === 'food');
          const vg = vfid ? vaultTake('you', 'You', vfid, 'heal') : -1;
          if (fid) { takeOne(fid); eaten[fid] = (eaten[fid] || 0) + 1; reviveFood++; hp = Math.round(maxHp * HP_DIV * 0.6) / HP_DIV; }
          else if (vg >= 0) { reviveFood++; hp = Math.round(maxHp * HP_DIV * 0.6) / HP_DIV; frameCredit += vaultCreditOf(vfid, vg); }
          else { vaultMiss('you', 'You', 'food'); hp = Math.round(maxHp * HP_DIV * 0.35) / HP_DIV; }
          ev.push({ kind: 'heal', value: hp, text: 'Back from camp' });
          moments.push({ frame: i, kind: 'revive', text: 'Back on your feet after camp', value: hp, score: 1 });
        }
      } else {
        if (hp < rules.eatAt * maxHp) {
          const ch = chooseHeal(rules.eatAt * maxHp - hp);
          const vid = ch ? null : vaultFind(isHeal, rules.eatAt * maxHp - hp);
          if (!ch && !vid) vaultMiss('you', 'You', 'potion');
          if (!ch && vid) { const g = vaultTake('you', 'You', vid, 'heal'); const before = hp; hp = Math.min(maxHp, hp + healOfAny(vid, g)); frameCredit += vaultCreditOf(vid, g); ev.push({ kind: 'eat', value: Math.round(hp - before), text: `Crew stock ${lcFirst(item(vid).name)}` }); }
          if (ch) { const g = takeOne(ch.id); const it = item(ch.id); if (it.kind === 'food') eaten[ch.id] = (eaten[ch.id] || 0) + 1; else potionsUsed[ch.id] = (potionsUsed[ch.id] || 0) + 1; const before = hp; hp = Math.min(maxHp, hp + healOfAny(ch.id, g)); ev.push({ kind: 'eat', value: Math.round(hp - before), text: it.name }); if (before < maxHp * 0.2) moments.push({ frame: i, kind: 'clutch', text: `Clutch ${lcFirst(it.name)} at ${Math.round(before / maxHp * 100)}% HP`, value: Math.round(hp - before), score: 2 }); }
        }
        const isR = (r) => (role === r ? 1 : OFF_ROLE);
        let d = pw.striker * isR('striker') * stDmg * (1 + buffs.atk) * (check === 'damage' && rules.tactic === 'focus' ? 1.15 : 1) * (1 + aura.damage) * (0.85 + rng() * 0.3);
        crit = rng() < (stance === 'aggressive' ? 0.15 : 0.1); if (crit) d *= 1.8;
        out.damage = d;
        out.healing = pw.mender * isR('mender') * (1 + buffs.heal) * (1 + aura.healing) * (0.85 + rng() * 0.3);
        out.mitigation = pw.guardian * isR('guardian') * stMit * endure * (1 + buffs.def) * (1 + aura.mitigation) * (0.85 + rng() * 0.3);
        if (d >= 0.5) ev.push({ kind: crit ? 'crit' : 'hit', value: Math.round(d) });
        if (crit) moments.push({ frame: i, kind: 'crit', text: `Critical hit for ${E.fmt(d)}`, value: Math.round(d), score: d / Math.max(1, fair) });
        if (out.healing >= 0.5 && i % 2 === 0) ev.push({ kind: 'heal', value: Math.round(out.healing) });
        const raw = maxHp * pressure * (0.7 + rng() * 0.6) * stTaken * spike * (role === 'guardian' ? 1.25 : 1) * (check === 'healing' && rules.tactic === 'interrupt' ? 0.75 : 1) * (1 - resist) * (1 - buffs.def * 0.5);
        taken = raw * (1 - mitigFrac) * (1 - aura.mitigation);
        hp = Math.min(maxHp, hp - taken + (pw.mender * 0.05 / HP_DIV + maxHp * 0.01) * (1 + aura.healing)); // mender power (x10) → HP (x2)
        if (hp <= 0) { hp = 0; faints++; down = num(c.faintFrames, 3); ev.push({ kind: 'faint', text: 'You faint!' }); moments.push({ frame: i, kind: 'faint', text: 'Fainted and carried to camp', value: 0, score: 0.2 }); }
      }
    } else if (role === 'supply') {
      supplyAcc += supplyUnits / N;
      while (supplyAcc >= 1) {
        supplyAcc -= 1;
        const id = Object.keys(pouch).find((x) => invCount(pouch, x) > 0); if (!id) break;
        const g = takeOne(id, BEST); const h = Math.max(40, healOfAny(id, g) * HP_DIV); // check points (x10)
        out.healing += h; // credited to whatever check is running
        crewFood += item(id).kind === 'food' ? 1 : 0;
        supplyDelivered++;
        ev.push({ kind: 'heal', value: Math.round(h / HP_DIV), text: 'Supplies delivered' });
      }
    }
    pDmg += out.damage; pHeal += out.healing; pMit += out.mitigation;
    const yours = (role === 'supply' ? out.healing : out[check]) + frameCredit;
    youCredit += frameCredit; if (ctx.joined) yourPts += yours;
    // check fill
    const server = serverBase * form * (1 + aura[check]) * (0.93 + rng() * 0.14);
    fill += server + crewOut[check] + yours; yourFill += yours; crewFill += crewOut[check] + yours;
    crewNeedAcc += attendCount * fair * ROLE_MIX;
    // boss damage
    const dmgFrame = (participants * fair * ROLE_MIX * form * (1 + aura.damage) + crewOut.damage) * (check === 'damage' ? 1.3 : 1) * momentum + out.damage;
    if (bossHp > 0) {
      bossHp = Math.max(0, bossHp - dmgFrame);
      const dealt = 1 - bossHp / bossMax;
      cps.forEach((at) => { if (!cpHit.includes(at) && dealt >= at) { cpHit.push(at); ev.push({ kind: 'phase', text: `Checkpoint: ${Math.round(at * 100)}% of ${boss.name} is down. Server chest!` }); moments.push({ frame: i, kind: 'checkpoint', text: `The server broke the ${Math.round(at * 100)}% checkpoint`, value: at, score: 3 }); } });
      if (bossHp <= 0) { killedAt = i; ev.push({ kind: 'phase', text: `${boss.name} falls!` }); moments.push({ frame: i, kind: 'kill', text: `${boss.name} falls!`, value: 0, score: 10 }); }
    }
    pf++;
    let ended = null;
    if (fill >= need) ended = over ? 'late' : 'passed';
    else if (pf >= nominal + overMax) ended = 'missed';
    const lastFrame = i === N - 1 || killedAt >= 0;
    if (!ended && lastFrame) ended = 'unfinished';
    if (ended) {
      const frac = clamp(fill / need, 0, 1);
      const w: any = { wave, phase, phaseName: phases[phase].name, check, label: CHECK_LABEL[check], result: ended, overtime: Math.max(0, pf - nominal), frames: pf,
        your: yourFill, total: fill, need, crewHave: crewFill, crewNeed: crewNeedAcc, points: 100 * frac, yourPoints: 100 * frac * (yourFill / Math.max(1e-9, fill)) };
      w.yourShare = yourFill / Math.max(1e-9, fill);
      const stArr = cfg().auraStrength || [0, 0.04, 0.08, 0.12];
      w.auraTier = startTier; w.auraTierMin = Math.min(startTier, waveAuraMin); w.fainted = waveDownMax; w.auraWeakFrames = waveWeakFrames;
      w.auraWeakened = waveWeakFrames >= Math.ceil(pf / 3); // weakened for at least a third of the wave
      w.auraLoss = Math.round(waveLossSum / Math.max(1, pf) * 1000) / 1000; // average aura strength lost to faints over the wave
      void stArr;
      w.yourText = 'you filled ' + (w.yourShare * 100 < 0.1 ? (w.yourShare * 100).toFixed(3) : (w.yourShare * 100).toFixed(2)) + '%';
      waves.push(w); cumYour += w.yourPoints; cumTot += w.points;
      if (w.auraWeakened && auraWeakenedWave == null) auraWeakenedWave = w.wave;
      if (ended !== 'unfinished') ev.push({ kind: 'phase', text: ended === 'passed' ? `${cap1(check)} check passed: the raid surges.` : ended === 'late' ? `${cap1(check)} check filled late.` : `${cap1(check)} check failed: ${boss.name} rages.` });
      if (yourFill > 0 && ended !== 'missed') moments.push({ frame: i, kind: 'check', text: `Wave ${wave}: ${lcFirst(CHECK_LABEL[check])} check ${ended === 'late' ? 'filled late' : 'passed'} (${w.yourText})`, value: w.yourShare, score: 1.5 + w.yourShare * 1000 });
      momentum = ended === 'passed' ? 1.1 : ended === 'late' ? 1 : 0.9;
      waveAuraMin = 99; waveDownMax = 0; waveWeakFrames = 0; waveLossSum = 0;
      phase = (phase + 1) % P; wave++; pf = 0; fill = 0; yourFill = 0; crewFill = 0; crewNeedAcc = 0; form = 0.9 + rng() * 0.22;
    }
    timeline.push({ t: 0, phase: waves.length && ended ? waves[waves.length - 1].phase : phase, wave: ended ? wave - 1 : wave, check, bossHpPct: bossHp / bossMax, playerHpPct: ctx.joined && role !== 'supply' ? clamp(hp / maxHp, 0, 1) : 1,
      fainted: down > 0 || (ctx.joined && role !== 'supply' && hp <= 0), checkPct: ended ? 1 : clamp(fill / need, 0, 1), yourShare: ended ? waves[waves.length - 1].yourShare : yourFill / Math.max(1e-9, fill),
      checks: { mitigation: check === 'mitigation' ? (ended ? 1 : clamp(fill / need, 0, 1)) : 0, healing: check === 'healing' ? (ended ? 1 : clamp(fill / need, 0, 1)) : 0, damage: check === 'damage' ? (ended ? 1 : clamp(fill / need, 0, 1)) : 0 },
      auras: auraList.filter((a) => a.tier > 0).map((a) => ({ guild: a.guild, aura: a.type, tier: a.tier, mine: a.mine })), crewDown: downNow, auraTier: myTier, events: ev, taken: Math.round(taken),
      // running contribution (finished waves + the open wave's progress) so the live view can show it
      yourPoints: Math.round((cumYour + (ended ? 0 : 100 * clamp(fill / need, 0, 1) * (yourFill / Math.max(1e-9, fill)))) * 1000) / 1000,
      totalPoints: Math.round((cumTot + (ended ? 0 : 100 * clamp(fill / need, 0, 1))) * 1000) / 1000 });
    if (killedAt >= 0) break;
  }
  timeline.forEach((f, k) => { f.t = timeline.length > 1 ? k / (timeline.length - 1) : 1; });
  moments.forEach((m) => { m.t = timeline.length > 1 ? m.frame / (timeline.length - 1) : 1; });
  const weekPoints = waves.reduce((a, w) => a + w.yourPoints, 0), weekTotal = waves.reduce((a, w) => a + w.points, 0);
  return { boss, participants, N, frames: timeline.length, waves, timeline, moments, faints, reviveFood, eaten, potionsUsed, pouchLeft: sumInv(pouch), pouchStart, supplyDelivered, pouch,
    hpBefore, hpAfter: bossHp, killed: bossHp <= 0, killedAt, cpHit, weekPoints, weekTotal, endHp: hp, maxHp, attendCount, crewCount: crew.length,
    crewFoodStart: crew.reduce((a, m) => a + m.food, 0) + vaultStart.food, crewFoodLeft: crewFood, foodOutWave, foodOutFrame, crewFoodShort, crewPotions, auraWeakenedWave, maxCrewDown,
    auras: npc.concat(myAuraType ? [{ guild: crewName, type: myAuraType, tier: startTier, mine: true }] : []), myAuraType, startTier,
    totals: { damage: pDmg, healing: pHeal, mitigation: pMit }, crewTot, powers: pw, role, fair,
    vaultConsumed, vaultUse: Object.keys(vaultUse).map((k) => { const u = vaultUse[k]; return Object.assign({}, u, { credit: Math.round(u.credit) }); }), vaultCredit: { you: youCredit },
    memberPoints: crew.map((m, k) => ({ id: m.id, name: m.name, points: memberPts[k] })), yourPoints: yourPts,
    stockShortfall: Object.keys(shortfall).map((k) => Object.assign({}, shortfall[k])), stockOutFrame };
}
export function fightCtx(state, lock, rng, joined) {
  const rec = curRecord(state);
  const boss = E.currentBoss(state);
  // A working copy of the crew vault's food + potions. The sim draws from it on need; resolveRaid
  // removes exactly sim.vaultConsumed from the real vault and logs it.
  const vault = (state.crew && state.crew.vault && state.crew.vault.inv) || {};
  const vaultStock: any = {};
  Object.keys(vault).forEach((id) => { const it = item(id); if (it && (it.kind === 'food' || it.kind === 'potion') && invCount(vault, id) > 0) vaultStock[id] = vault[id].slice(); });
  return { boss, rec: Object.assign({}, rec, { checkpointsPaid: rec.checkpointsPaid.slice() }), rng, joined: joined !== false, role: lock ? lock.role : 'supply',
    slots: lock ? lock.slots : state.equipped, rules: lock ? lock.rules : normRules(state, state.raid.rules), pouch: clone(state.raid.pouch || {}),
    crew: crewAttending(state, rng), npcAuras: npcAuras(state, rng), vaultStock, startHp: statsFor(state, lock ? lock.slots : state.equipped).maxHp };
}
export let projCache = { key: '', val: null };
E.projectRaid = function (state) {
  const plan = E.raidPlan(state); const lock = lockedNow(state) ? state.raid.lock : Object.assign(makeLock(state, false), { role: plan.role, slots: plan.slots });
  const rec = curRecord(state);
  const key = JSON.stringify([state.week, state.raid.ladder, rec.hpLeft, lock.role, lock.slots, lock.rules, state.raid.pouch, SLOTS.map((s) => { const g = findGear(state, lock.slots[s]); return g ? g.dur > 0 : 0; })]);
  if (projCache.key === key) return projCache.val;
  const sim = simulateFight(state, Object.assign(fightCtx(state, lock, mulberry(state.week * 7919 + 17), true), { rec: Object.assign({}, rec, { hpLeft: rec.maxHp * 10, checkpointsPaid: [0.25, 0.5, 0.75] }) }));
  const perCheck = {}; CHECKS.forEach((ck) => { const ws = sim.waves.filter((w) => w.check === ck); perCheck[ck] = ws.length ? ws.reduce((a, w) => a + w.yourShare, 0) / ws.length : 0; });
  const share = sim.weekPoints / Math.max(1e-9, sim.weekTotal);
  const outputs = {}; CHECKS.forEach((ck) => { outputs[ck] = Math.round(sim.totals[ck] / Math.max(1, sim.frames) * 6); });
  const foodEst = (Object.values(sim.eaten) as number[]).reduce<number>((a, b: any) => a + (num(b, 0) as number), 0) + (Object.values(sim.potionsUsed) as number[]).reduce<number>((a, b: any) => a + (num(b, 0) as number), 0);
  const val = { weekShare: share, tier: tierFor(state, share), perCheck, foodEst, faintsEst: sim.faints, outputs, role: lock.role };
  projCache = { key, val };
  return val;
};
