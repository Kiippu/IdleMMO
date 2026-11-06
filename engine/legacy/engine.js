/* ==== engine.js ==== */

window.GW = window.GW || {};
/* Guildwright solo prototype — GW.Engine (rules + state changes, no DOM).
   Reads static content only through GW.DATA at call time. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- data access
  const CFG_DEFAULTS = {
    saveKey: 'guildwright-proto-v1', startingGold: 150, xpMult: 4, offlineCapSec: 43200, maxLevel: 99,
    marketTax: 0.05, pityThreshold: 40, supplyRateMult: 0.6,
    supplyDiminish: [{ upTo: 50, mult: 1 }, { upTo: 200, mult: 0.5 }, { upTo: Infinity, mult: 0.2 }],
    baseHp: 60, hpPerCombatLevel: 4
  };
  const RARITY_DEFAULTS = [
    { id: 'common', name: 'Common', baseChance: 0.70, affixSlots: 0, statMult: 1.00, durability: 100, valueMult: 1 },
    { id: 'uncommon', name: 'Uncommon', baseChance: 0.22, affixSlots: 1, statMult: 1.15, durability: 130, valueMult: 2.5 },
    { id: 'rare', name: 'Rare', baseChance: 0.065, affixSlots: 2, statMult: 1.30, durability: 160, valueMult: 8 },
    { id: 'epic', name: 'Epic', baseChance: 0.013, affixSlots: 3, statMult: 1.50, durability: 200, valueMult: 30 },
    { id: 'legendary', name: 'Legendary', baseChance: 0.002, affixSlots: 4, statMult: 1.75, durability: 300, valueMult: 120 },
    { id: 'mythic', name: 'Mythic', baseChance: 0, affixSlots: 5, statMult: 2.10, durability: 400, valueMult: 500 }
  ];
  const GRADE_DEFAULTS = [
    { id: 'rough', name: 'Rough', min: 1, max: 39, mult: 0.85, procMult: 0.9 },
    { id: 'standard', name: 'Standard', min: 40, max: 59, mult: 1.00, procMult: 1.0 },
    { id: 'fine', name: 'Fine', min: 60, max: 79, mult: 1.15, procMult: 1.15 },
    { id: 'superior', name: 'Superior', min: 80, max: 94, mult: 1.30, procMult: 1.3 },
    { id: 'pristine', name: 'Pristine', min: 95, max: 100, mult: 1.50, procMult: 1.45 }
  ];
  const MASTERY_DEFAULTS = [{ crafts: 0, mult: 1.0, name: 'Novice' }, { crafts: 10, mult: 1.1, name: 'Apprentice' },
    { crafts: 100, mult: 1.25, name: 'Journeyman' }, { crafts: 1000, mult: 1.5, name: 'Master' },
    { crafts: 10000, mult: 1.75, name: 'Grandmaster' }];
  const SKILL_DEFAULTS = [
    ['mining', 'gathering'], ['woodcutting', 'gathering'], ['herbalism', 'gathering'], ['fishing', 'gathering'],
    ['smelting', 'refining'], ['carpentry', 'refining'], ['tanning', 'refining'], ['weaving', 'refining'],
    ['smithing', 'crafting'], ['woodworking', 'crafting'], ['leatherworking', 'crafting'], ['tailoring', 'crafting'],
    ['jewelcrafting', 'crafting'], ['alchemy', 'crafting'], ['cooking', 'crafting'],
    ['guardian', 'combat'], ['mender', 'combat'], ['striker', 'combat']
  ].map(([id, tier]) => ({ id, name: id[0].toUpperCase() + id.slice(1), tier, blurb: '' }));
  const ELEMENT_DEFAULTS = ['fire', 'frost', 'venom', 'holy'];
  const SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'ring'];
  const ROLES = ['striker', 'guardian', 'mender'];
  const STANCES = ['aggressive', 'balanced', 'defensive'];
  const TACTICS = ['focus', 'interrupt', 'endure'];
  const CHECKS = ['mitigation', 'healing', 'damage'];
  const LOG_CAP = 80;
  const OFFLINE_MAX_COMPLETIONS = 20000;
  const TICK_MAX_COMPLETIONS = 2000;
  const MARKET_REFRESH_SEC = 120;
  const MAX_PLAYER_LISTINGS = 8;
  const RAID_FRAMES = 60;

  const D = () => (window.GW && GW.DATA) || {};
  const arr = (x) => (Array.isArray(x) ? x : []);
  const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);

  let cfgCache = { src: undefined, val: null };
  function cfg() {
    const src = D().config;
    if (cfgCache.src !== src || !cfgCache.val) {
      const c = Object.assign({}, CFG_DEFAULTS, src || {});
      if (!Array.isArray(c.supplyDiminish) || !c.supplyDiminish.length) c.supplyDiminish = CFG_DEFAULTS.supplyDiminish;
      cfgCache = { src, val: c };
    }
    return cfgCache.val;
  }
  const rarities = () => (arr(D().rarities).length ? D().rarities : RARITY_DEFAULTS);
  const grades = () => (arr(D().grades).length ? D().grades : GRADE_DEFAULTS);
  const masteryTiers = () => (arr(D().masteryTiers).length ? D().masteryTiers : MASTERY_DEFAULTS);
  const skillDefs = () => (arr(D().skills).length ? D().skills : SKILL_DEFAULTS);
  const elements = () => (arr(D().elements).length ? D().elements : ELEMENT_DEFAULTS);
  const itemsMap = () => D().items || {};
  const item = (id) => (id != null ? itemsMap()[id] || null : null);
  const allActions = () => arr(D().actions);
  const bosses = () => arr(D().bosses);
  const affixDefs = () => arr(D().affixes);

  let actCache = { src: undefined, map: null };
  function action(id) {
    const src = D().actions;
    if (actCache.src !== src || !actCache.map) {
      const map = {};
      arr(src).forEach((a) => { if (a && a.id) map[a.id] = a; });
      actCache = { src, map };
    }
    return actCache.map[id] || null;
  }
  const combatSkillIds = () => {
    const ids = skillDefs().filter((s) => s.tier === 'combat').map((s) => s.id);
    return ids.length ? ids : ['guardian', 'mender', 'striker'];
  };

  // ---------------------------------------------------------------- small utils
  const rand = () => Math.random();
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const randInt = (a, b) => { a = Math.ceil(a); b = Math.floor(b); return b <= a ? a : a + Math.floor(rand() * (b - a + 1)); };
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const shuffle = (list) => { const l = list.slice(); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; };
  const lcFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
  const article = (w) => (/^[aeiou]/i.test(w || '') ? 'an' : 'a');
  const itemName = (id) => (item(id) ? item(id).name : id);
  const qtyRange = (q) => (Array.isArray(q) ? randInt(num(q[0], 1), num(q[1], num(q[0], 1))) : Math.max(1, Math.round(num(q, 1))));
  const qtyAvg = (q) => (Array.isArray(q) ? (num(q[0], 1) + num(q[1], num(q[0], 1))) / 2 : num(q, 1));
  const zeros5 = () => [0, 0, 0, 0, 0];
  const isStackable = (it) => !!it && it.kind !== 'gear';
  const nextId = (state, prefix) => { state.seq = num(state.seq, 1) + 1; return prefix + state.seq.toString(36); };
  let quiet = false; // suppress per-event log lines (offline simulation)

  function gradeOf(quality) {
    const g = grades(); const q = clamp(Math.round(num(quality, 50)), 1, 100);
    for (let i = g.length - 1; i >= 0; i--) if (q >= num(g[i].min, 0)) return i;
    return 0;
  }
  function gradeMid(i) { const g = grades()[clamp(i, 0, grades().length - 1)] || GRADE_DEFAULTS[1]; return (num(g.min, 40) + num(g.max, 59)) / 2; }
  const gradeMult = (i) => num((grades()[i] || {}).mult, 1);
  const gradeProcMult = (i) => num((grades()[i] || {}).procMult, 1);
  function rarityIdx(id) { const i = rarities().findIndex((r) => r.id === id); return i < 0 ? 0 : i; }
  const rarityDef = (id) => rarities()[rarityIdx(id)] || RARITY_DEFAULTS[0];

  // ---------------------------------------------------------------- engine object
  const E = {};

  // ---------------------------------------------------------------- log + format
  E.log = function (state, kind, text) {
    if (!state) return;
    if (!Array.isArray(state.log)) state.log = [];
    state.log.unshift({ t: Date.now(), kind: kind || 'info', text: String(text) });
    if (state.log.length > LOG_CAP) state.log.length = LOG_CAP;
  };
  const logq = (state, kind, text) => { if (!quiet) E.log(state, kind, text); };

  E.fmt = function (n) {
    n = Number(n);
    if (!isFinite(n)) return n > 0 ? '∞' : (n < 0 ? '-∞' : '0');
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    const trim = (x, d) => x.toFixed(d).replace(/\.0+$/, '');
    if (a < 1000) return s + (a < 10 && a % 1 ? trim(a, 1) : String(Math.round(a)));
    const units = [['t', 1e12], ['b', 1e9], ['m', 1e6], ['k', 1e3]];
    for (const [u, v] of units) if (a >= v) { const x = a / v; return s + trim(x, x < 10 ? 1 : 0) + u; }
    return s + String(Math.round(a));
  };
  E.fmtTime = function (sec) {
    sec = Number(sec);
    if (!isFinite(sec)) return '∞';
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + 's';
    if (sec < 3600) { const m = Math.floor(sec / 60), s = sec % 60; return s ? `${m}m ${s}s` : `${m}m`; }
    if (sec < 86400) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return m ? `${h}h ${m}m` : `${h}h`; }
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600); return h ? `${d}d ${h}h` : `${d}d`;
  };

  // ---------------------------------------------------------------- skills / XP
  const xpTable = [0, 0];
  E.xpForLevel = function (level) {
    level = Math.floor(num(level, 1));
    if (level <= 1) return 0;
    level = Math.min(level, 200);
    while (xpTable.length <= level) {
      let pts = 0; const L = xpTable.length;
      for (let l = 1; l < L; l++) pts += Math.floor(l + 300 * Math.pow(2, l / 7));
      xpTable.push(Math.floor(pts / 4));
    }
    return xpTable[level];
  };
  E.levelFor = function (xp) {
    xp = num(xp, 0); const max = Math.max(1, num(cfg().maxLevel, 99));
    let lo = 1, hi = max;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (E.xpForLevel(mid) <= xp) lo = mid; else hi = mid - 1; }
    return lo;
  };
  E.skillLevel = function (state, skillId) {
    const s = state && state.skills && state.skills[skillId];
    return E.levelFor(s ? s.xp : 0);
  };
  E.skillProgress = function (state, skillId) {
    const s = state && state.skills && state.skills[skillId];
    const xp = s ? num(s.xp, 0) : 0;
    const level = E.levelFor(xp); const max = num(cfg().maxLevel, 99);
    const cur = E.xpForLevel(level); const next = level >= max ? cur : E.xpForLevel(level + 1);
    const pct = level >= max ? 1 : clamp((xp - cur) / Math.max(1, next - cur), 0, 1);
    return { level, xp, cur, next, pct };
  };
  function addXp(state, skillId, amount, events) {
    if (!skillId || !(amount > 0)) return 0;
    if (!state.skills[skillId]) state.skills[skillId] = { xp: 0 };
    const s = state.skills[skillId];
    const before = E.levelFor(s.xp);
    s.xp = num(s.xp, 0) + amount;
    const after = E.levelFor(s.xp);
    if (after > before) {
      events.push({ type: 'levelup', skill: skillId, level: after });
      const def = skillDefs().find((d) => d.id === skillId);
      logq(state, 'level', `${def ? def.name : skillId} reached level ${after}.`);
    }
    return amount;
  }

  // ---------------------------------------------------------------- inventory
  function addItem(state, itemId, grade, qty) {
    qty = Math.floor(num(qty, 0)); if (qty <= 0 || !itemId) return;
    grade = clamp(Math.floor(num(grade, 1)), 0, 4);
    if (!Array.isArray(state.inv[itemId])) state.inv[itemId] = zeros5();
    state.inv[itemId][grade] += qty;
  }
  function cleanInv(state, itemId) {
    const g = state.inv[itemId];
    if (g && g.every((x) => !(x > 0))) delete state.inv[itemId];
  }
  E.itemCount = function (state, itemId) {
    const g = state && state.inv && state.inv[itemId];
    return Array.isArray(g) ? g.reduce((a, b) => a + (b > 0 ? b : 0), 0) : 0;
  };
  // Takes qty units of itemId by priority ('best' = highest grade first). dry=true doesn't mutate.
  function consume(state, itemId, qty, priority, dry) {
    const g = (state.inv[itemId] || zeros5()).slice();
    const used = zeros5(); let need = qty, qsum = 0;
    const order = priority === 'best' ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4];
    for (const i of order) {
      if (need <= 0) break;
      const take = Math.min(need, Math.max(0, g[i] || 0));
      if (take > 0) { g[i] -= take; used[i] += take; need -= take; qsum += take * gradeMid(i); }
    }
    const taken = qty - need;
    if (!dry && taken > 0) { state.inv[itemId] = g; cleanInv(state, itemId); }
    return { ok: need <= 0, taken, used, qsum };
  }
  function lowestGrade(state, itemId) {
    const g = state.inv[itemId]; if (!g) return -1;
    for (let i = 0; i < 5; i++) if (g[i] > 0) return i;
    return -1;
  }
  function ownedOfKind(state, kind) {
    return Object.keys(state.inv).filter((id) => item(id) && item(id).kind === kind && E.itemCount(state, id) > 0);
  }
  E.inventoryList = function (state) { // helper for the UI: stackables sorted by kind/tier/name
    const order = { material: 0, food: 1, potion: 2, catalyst: 3, core: 4 };
    return Object.keys(state.inv).filter((id) => E.itemCount(state, id) > 0).map((id) => ({ itemId: id, item: item(id), grades: state.inv[id].slice(), total: E.itemCount(state, id) }))
      .sort((a, b) => (num(order[(a.item || {}).kind], 9) - num(order[(b.item || {}).kind], 9)) || (num((a.item || {}).tier, 0) - num((b.item || {}).tier, 0)) || String(itemName(a.itemId)).localeCompare(itemName(b.itemId)));
  };

  // ---------------------------------------------------------------- gear
  function findGear(state, uid) { return arr(state.gear).find((g) => g.uid === uid) || null; }
  function isEquipped(state, uid) { return SLOTS.some((s) => state.equipped[s] === uid); }
  function makeGear(state, itemId, rIdx, quality) {
    const rar = rarities()[clamp(rIdx, 0, rarities().length - 1)];
    const slots = Math.max(0, Math.floor(num(rar.affixSlots, 0)));
    const affixes = shuffle(affixDefs().filter((a) => a && a.id)).slice(0, slots).map((a) => {
      const r = Array.isArray(a.range) ? a.range : [1, 3];
      return { id: a.id, value: randInt(num(r[0], 1), num(r[1], num(r[0], 1))) };
    });
    let durPct = 0;
    affixes.forEach((af) => { const d = affixDefs().find((x) => x.id === af.id); if (d && d.stat === 'dur') durPct += af.value; });
    const maxDur = Math.max(10, Math.round(num(rar.durability, 100) * (1 + durPct / 100)));
    const g = { uid: nextId(state, 'g'), itemId, rarity: rar.id, quality: clamp(Math.round(num(quality, 50)), 1, 100), affixes, dur: maxDur, maxDur };
    state.gear.push(g);
    return g;
  }
  const emptyElements = () => { const o = {}; elements().forEach((e) => { o[e] = 0; }); return o; };
  E.gearStats = function (g) {
    const out = { atk: 0, def: 0, heal: 0, hp: 0, elements: emptyElements(), speed: 0, durPct: 0 };
    const it = g && item(g.itemId);
    if (!it || !(num(g.dur, 0) > 0)) return out;
    const rar = rarityDef(g.rarity);
    const m = num(rar.statMult, 1) * gradeMult(gradeOf(g.quality));
    const st = it.stats || {};
    ['atk', 'def', 'heal', 'hp'].forEach((k) => { const b = num(st[k], 0); if (b > 0) out[k] = Math.max(1, Math.round(b * m)); });
    if (it.element) out.elements[it.element] = num(out.elements[it.element], 0) + Math.max(1, Math.round(Math.max(2, num(st.atk, 0)) * 0.3 * num(rar.statMult, 1)));
    arr(g.affixes).forEach((af) => {
      const d = affixDefs().find((x) => x.id === af.id); if (!d) return;
      const v = num(af.value, 0);
      if (d.stat === 'speed') out.speed += v;
      else if (d.stat === 'dur') out.durPct += v;
      else if (['atk', 'def', 'heal', 'hp'].includes(d.stat)) out[d.stat] += v;
      else if (d.stat) out.elements[d.stat] = num(out.elements[d.stat], 0) + v;
    });
    return out;
  };
  E.playerStats = function (state) { return statsFor(state, state.equipped); };
  E.equip = function (state, uid) {
    const g = findGear(state, uid); if (!g) return { ok: false, reason: 'That item is no longer in your bag.' };
    const it = item(g.itemId); if (!it || !SLOTS.includes(it.slot)) return { ok: false, reason: 'That item cannot be equipped.' };
    state.equipped[it.slot] = uid;
    clampHp(state);
    return { ok: true };
  };
  E.unequip = function (state, slot) {
    if (SLOTS.includes(slot)) state.equipped[slot] = null;
    clampHp(state);
    return { ok: true };
  };
  function clampHp(state) { const max = E.playerStats(state).maxHp; state.hp = clamp(num(state.hp, max), 0, max); }

  E.gearName = function (g) {
    if (!g) return '';
    const it = item(g.itemId); const base = it ? it.name : String(g.itemId);
    let pre = null, suf = null;
    arr(g.affixes).forEach((af) => {
      const d = affixDefs().find((x) => x.id === af.id); if (!d || !d.name) return;
      if (/^of\s/i.test(d.name)) { if (!suf) suf = d.name; } else if (!pre) pre = d.name;
    });
    return [pre, base, suf].filter(Boolean).join(' ');
  };
  E.itemValue = function (itemId, grade) {
    const it = item(itemId); if (!it) return 0;
    return Math.max(1, Math.round(num(it.value, 1) * gradeMult(clamp(Math.floor(num(grade, 1)), 0, 4))));
  };
  E.gearValue = function (g) {
    const it = g && item(g.itemId); if (!it) return 0;
    const durF = 0.5 + 0.5 * clamp(num(g.dur, 0) / Math.max(1, num(g.maxDur, 1)), 0, 1);
    return Math.max(1, Math.round(num(it.value, 1) * num(rarityDef(g.rarity).valueMult, 1) * gradeMult(gradeOf(g.quality)) * durF));
  };
  E.repairCost = function (state, uid) {
    const g = findGear(state, uid); if (!g) return { gold: 0, newMaxDur: 0 };
    const newMaxDur = Math.max(10, Math.round(num(g.maxDur, 100) * 0.8));
    const missing = clamp(1 - num(g.dur, 0) / Math.max(1, g.maxDur), 0, 1);
    const full = Math.max(1, Math.round(num((item(g.itemId) || {}).value, 1) * num(rarityDef(g.rarity).valueMult, 1) * gradeMult(gradeOf(g.quality))));
    const b = state && state.server ? E.weekBuff(state) : null; const disc = b && b.kind === 'repair' ? clamp(num(b.value, 0), 0, 0.9) : 0;
    return { gold: missing > 0 ? Math.max(1, Math.ceil(full * 0.25 * missing * (1 - disc))) : 0, newMaxDur, discount: disc };
  };
  E.repair = function (state, uid) {
    const g = findGear(state, uid); if (!g) return { ok: false, reason: 'That item is no longer in your bag.' };
    const c = E.repairCost(state, uid);
    if (g.dur >= g.maxDur) return { ok: false, reason: 'It is already in perfect condition.' };
    if (g.dur >= c.newMaxDur) return { ok: false, reason: `Still at ${Math.round(g.dur)} durability; repairing now would only lower its maximum to ${c.newMaxDur}.` };
    if (state.gold < c.gold) return { ok: false, reason: `Repairing costs ${c.gold}g and you have ${Math.floor(state.gold)}g.` };
    state.gold -= c.gold; g.dur = c.newMaxDur; g.maxDur = c.newMaxDur;
    E.log(state, 'info', `Repaired your ${E.gearName(g)} for ${c.gold}g (max durability now ${c.newMaxDur}).`);
    return { ok: true, gold: c.gold };
  };
  function recipeFor(itemId) {
    return allActions().find((a) => a && a.kind === 'craft' && a.outputs && a.outputs[itemId]) || null;
  }
  E.salvage = function (state, uid) {
    const g = findGear(state, uid); if (!g) return { ok: false, reason: 'That item is no longer in your bag.', items: [] };
    if (isEquipped(state, uid)) return { ok: false, reason: 'Unequip it before salvaging.', items: [] };
    const rec = recipeFor(g.itemId); const grade = gradeOf(g.quality); const items = [];
    if (rec && rec.inputs) {
      const outQty = Math.max(1, num(rec.outputs[g.itemId], 1));
      Object.keys(rec.inputs).forEach((id) => {
        if (!item(id)) return;
        const exact = num(rec.inputs[id], 0) / outQty * 0.3;
        const q = Math.floor(exact) + (rand() < exact % 1 ? 1 : 0);
        if (q > 0) { addItem(state, id, grade, q); items.push({ itemId: id, grade, qty: q }); }
      });
    }
    state.gear = state.gear.filter((x) => x.uid !== uid);
    E.log(state, 'info', items.length ? `Salvaged ${E.gearName(g)} into ${items.map((i) => `${i.qty} ${itemName(i.itemId)}`).join(', ')}.` : `Salvaged ${E.gearName(g)}; nothing useful was left.`);
    return { ok: true, items };
  };
  E.fuseCandidates = function (state) {
    const by = {};
    arr(state.gear).forEach((g) => { if (g.rarity === rarities()[0].id && !isEquipped(state, g.uid)) (by[g.itemId] = by[g.itemId] || []).push(g); });
    return Object.keys(by).filter((id) => by[id].length >= 5)
      .map((id) => ({ itemId: id, uids: by[id].sort((a, b) => a.quality - b.quality).map((g) => g.uid) }));
  };
  E.fuse = function (state, itemId) {
    const cand = E.fuseCandidates(state).find((c) => c.itemId === itemId);
    if (!cand) return { ok: false, reason: 'You need 5 unequipped Common copies to fuse.' };
    const use = cand.uids.slice(0, 5); // lowest quality first: keeps your best Commons
    const qs = use.map((u) => findGear(state, u).quality);
    state.gear = state.gear.filter((g) => !use.includes(g.uid));
    const rIdx = rand() < 0.15 ? Math.min(2, rarities().length - 1) : Math.min(1, rarities().length - 1);
    const g = makeGear(state, itemId, rIdx, qs.reduce((a, b) => a + b, 0) / 5);
    E.log(state, 'craft', `Fused 5 Commons into ${article(rarities()[rIdx].name)} ${rarities()[rIdx].name} ${itemName(itemId)}.`);
    return { ok: true, gear: g };
  };

  // food
  function healOf(itemId, grade) { const it = item(itemId); return it ? Math.max(1, Math.round(num(it.heal, 0) * gradeMult(Math.max(0, grade)))) : 0; }
  E.eat = function (state, itemId) {
    const it = item(itemId);
    if (!it || !(num(it.heal, 0) > 0)) return { ok: false, reason: 'That is not something you can eat.' };
    if (E.itemCount(state, itemId) <= 0) return { ok: false, reason: `You have no ${lcFirst(it.name)}.` };
    const max = E.playerStats(state).maxHp;
    if (state.hp >= max) return { ok: false, reason: 'You are already at full HP.' };
    const gr = lowestGrade(state, itemId); const h = healOf(itemId, gr);
    consume(state, itemId, 1, 'worst');
    const before = state.hp; state.hp = Math.min(max, state.hp + h);
    return { ok: true, heal: Math.round(state.hp - before) };
  };
  // picks the healing item with the smallest heal that still lifts hp to the target; else the biggest one
  function chooseHealItem(state, need, kinds) {
    let best = null, biggest = null;
    Object.keys(state.inv).forEach((id) => {
      const it = item(id); if (!it || !kinds.includes(it.kind) || !(num(it.heal, 0) > 0)) return;
      const gr = lowestGrade(state, id); if (gr < 0) return;
      const h = healOf(id, gr); const rank = kinds.indexOf(it.kind);
      const c = { id, h, rank };
      if (h >= need && (!best || h < best.h || (h === best.h && rank < best.rank))) best = c;
      if (!biggest || h > biggest.h) biggest = c;
    });
    return best || biggest;
  }
  function autoEat(state, events, threshold, maxHp) {
    let guard = 0;
    while (state.hp < threshold * maxHp && guard++ < 6) {
      const c = chooseHealItem(state, threshold * maxHp - state.hp, ['food', 'potion']);
      if (!c) break;
      consume(state, c.id, 1, 'worst');
      const before = state.hp; state.hp = Math.min(maxHp, state.hp + c.h);
      events.push({ type: 'eat', itemId: c.id, heal: Math.round(state.hp - before) });
    }
  }

  // ---------------------------------------------------------------- actions
  E.actionsFor = function (skillId) {
    return allActions().filter((a) => a && a.skill === skillId).slice().sort((a, b) => num(a.level, 1) - num(b.level, 1));
  };
  function roleStatOf(act, ps) {
    const s = act.skill;
    return s === 'guardian' ? ps.def : s === 'mender' ? ps.heal : ps.atk;
  }
  let bonusCache = { key: '', map: {} };
  function skillBonusCached(state, skillId) {
    const key = SLOTS.map((s) => { const g = findGear(state, state.equipped[s]); return g ? g.uid + (g.dur > 0 ? '+' : '-') : '_'; }).join();
    if (bonusCache.key !== key) bonusCache = { key, map: {} };
    return bonusCache.map[skillId] || (bonusCache.map[skillId] = E.skillBonus(state, skillId));
  }
  function actionTimeWith(state, act, ps) {
    if (!act) return Infinity;
    let t = Math.max(0.5, num(act.sec, 3)) * (1 - skillBonusCached(state, act.skill).speed);
    if (act.kind === 'combat') {
      const power = num((act.enemy || {}).power, 1);
      t *= clamp(power / Math.max(1, roleStatOf(act, ps)), 0.5, 3);
    }
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
  function missingReason(state, act) {
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
  function pouchBlock(state, act) {
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
  function masteryInfo(state, actionId) {
    const count = num(state.mastery[actionId], 0); const tiers = masteryTiers();
    let idx = 0; tiers.forEach((t, i) => { if (count >= num(t.crafts, 0)) idx = i; });
    const next = tiers[idx + 1] ? tiers[idx + 1].crafts : null;
    return { idx, tier: tiers[idx], count, next, bonus: tiers.length > 1 ? 20 * idx / (tiers.length - 1) : 0 };
  }
  function isGearCraft(act) {
    return !!act && act.kind === 'craft' && Object.keys(act.outputs || {}).some((id) => item(id) && item(id).kind === 'gear');
  }
  function bestCatalyst(state) {
    let best = null;
    ownedOfKind(state, 'catalyst').forEach((id) => { const m = num(item(id).procMult, 1.25); if (!best || m > best.m) best = { id, m }; });
    return best;
  }
  function ownedCore(state) { return ownedOfKind(state, 'core')[0] || null; }
  function inputQuality(state, act, dry) { // average grade midpoint of what the next completion consumes
    const ins = act.inputs || {}; let n = 0, q = 0;
    Object.keys(ins).forEach((id) => { const r = consume(state, id, num(ins[id], 0), state.settings.matPriority, dry); n += r.taken; q += r.qsum; });
    return n > 0 ? q / n : gradeMid(1);
  }
  function rarityOdds(total, coreActive) {
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
  function procMods(state, act, dry) {
    const m = masteryInfo(state, act.id);
    const qGrade = gradeOf(inputQuality(state, act, true));
    const cat = state.settings.useCatalyst ? bestCatalyst(state) : null;
    const coreId = state.settings.useCore ? ownedCore(state) : null;
    const mods = {
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

  function rollQualityGather(state, act) {
    const lvl = E.skillLevel(state, act.skill); const m = masteryInfo(state, act.id);
    const base = 35 + 0.6 * (lvl - num(act.level, 1)) + m.bonus + skillBonusCached(state, act.skill).quality;
    return clamp(Math.round(clamp(base, 1, 100) + (rand() * 2 - 1) * 15), 1, 100);
  }

  // one completion of the active action; pushes events; may stop the action
  function completeOnce(state, act, events) {
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
      const coins = Array.isArray(act.coins) ? randInt(num(act.coins[0], 0), num(act.coins[1], num(act.coins[0], 0))) : Math.max(0, Math.round(num(act.coins, 0)));
      state.gold += coins;
      const drops = [];
      arr(act.drops).forEach((d) => {
        if (!d || !item(d.item) || rand() >= num(d.chance, 0) * (1 + skillBonusCached(state, act.skill).drops)) return;
        const g = gradeOf(rollQualityGather(state, act)); const q = qtyRange(d.qty);
        addItem(state, d.item, g, q); drops.push({ itemId: d.item, grade: g, qty: q });
      });
      state.mastery[act.id] = num(state.mastery[act.id], 0) + 1;
      const xp = num(act.xp, 0) * xpMult;
      const role = ROLES.includes(act.skill) ? act.skill : 'striker';
      events.push({ type: 'kill', actionId: act.id, coins, drops, damageTaken: dmg });
      events.push({ type: 'complete', actionId: act.id, kind: act.kind, items: drops, xp });
      addXp(state, role, xp, events);
      autoEat(state, events, 0.5, E.playerStats(state).maxHp);
      return;
    }
    stopWith('This action cannot be repeated.');
  }
  function drainDurability(state, amount, events) {
    SLOTS.forEach((slot) => {
      const g = findGear(state, state.equipped[slot]); if (!g || !(g.dur > 0)) return;
      g.dur = Math.max(0, Math.round((g.dur - amount) * 100) / 100);
      if (g.dur <= 0) { events.push({ type: 'broken', uid: g.uid }); logq(state, 'warn', `Your ${E.gearName(g)} broke. Repair it to restore its stats.`); }
    });
  }

  // ---------------------------------------------------------------- crew assist (v2, SPEC 4.1)
  const STATIONS = {
    mining: 'Copper hill', woodcutting: 'Timber stand', herbalism: 'Herb garden', fishing: 'River dock',
    smelting: 'Smelter', carpentry: 'Sawpit', tanning: 'Tannery', weaving: 'Loom house',
    smithing: 'Forge', woodworking: "Bowyer's bench", leatherworking: 'Leather bench', tailoring: 'Sewing table',
    jewelcrafting: "Jeweller's bench", alchemy: 'Cauldron', cooking: 'Hearth',
    guardian: 'Wilds', mender: 'Wilds', striker: 'Wilds'
  };
  const CREW_MIN_JOBS = 3, CREW_MAX_JOBS = 5;
  E.station = function (skillId) {
    if (STATIONS[skillId]) return STATIONS[skillId];
    const d = skillDefs().find((s) => s.id === skillId);
    if (d && d.tier === 'combat') return 'Wilds';
    return d ? `${d.name} workshop` : 'Workshop';
  };
  const isJobAction = (a) => !!a && (a.kind === 'refine' || a.kind === 'craft') && !!a.outputs && Object.keys(a.outputs).some((id) => item(id));
  const jobActions = (skill) => allActions().filter((a) => isJobAction(a) && a.skill === skill);
  const jobOutput = (act) => Object.keys((act && act.outputs) || {}).find((id) => item(id)) || null;
  const ownerRate = (act) => 1 / Math.max(0.5, num(act.sec, 3) * 1.6);
  const playerRate = (state, act) => 1 / Math.max(0.25, E.actionTime(state, act.id));
  const skillName = (id) => { const d = skillDefs().find((x) => x.id === id); return d ? d.name : id; };
  function makeCrew(state) {
    const names = shuffle(arr(D().npcNames).length ? D().npcNames : ['Wren', 'Ossian', 'Mira', 'Tobin', 'Kestrel', 'Ada']);
    const skills = shuffle(skillDefs().filter((s) => (s.tier === 'refining' || s.tier === 'crafting') && jobActions(s.id).length).map((s) => s.id));
    const members = [];
    const n = randInt(4, 5);
    for (let i = 0; i < n && i < names.length; i++) members.push({ name: names[i], skill: skills.length ? skills[i % skills.length] : null });
    state.crew = { name: 'Copperbell crew', members, jobs: [], nextPostIn: randInt(60, 90) };
    ensureCrewV4(state);
    const k = randInt(3, 4);
    for (let i = 0; i < k; i++) postJob(state);
  }
  // posts one job; ~half within the player's level, ~30% just above it (up to +10)
  function postJob(state, forcedActionId) {
    const crew = state.crew; if (!crew) return null;
    const members = arr(crew.members);
    let act = forcedActionId ? action(forcedActionId) : null, owner;
    if (forcedActionId && !isJobAction(act)) return null;
    if (act) {
      const m = members.find((x) => x.skill === act.skill) || (members.length ? pick(members) : null);
      owner = m ? m.name : 'A crewmate';
    } else {
      const busy = new Set(arr(crew.jobs).map((j) => j.owner));
      const able = members.filter((m) => m.skill && jobActions(m.skill).length);
      const free = able.filter((m) => !busy.has(m.name));
      const m = free.length ? pick(free) : able.length ? pick(able) : null;
      owner = m ? m.name : (members.length ? pick(members).name : 'A crewmate');
      let list = m ? jobActions(m.skill) : [];
      if (!list.length) list = allActions().filter(isJobAction);
      if (!list.length) return null;
      const within = list.filter((a) => num(a.level, 1) <= E.skillLevel(state, a.skill)).sort((a, b) => num(b.level, 1) - num(a.level, 1));
      const above = list.filter((a) => { const d = num(a.level, 1) - E.skillLevel(state, a.skill); return d > 0 && d <= 10; });
      const r = rand();
      act = r < 0.5 && within.length ? pick(within.slice(0, 4)) : r < 0.8 && above.length ? pick(above) : (within.length && r < 0.9 ? pick(within) : pick(list));
    }
    const rarCounts = {}; rarities().forEach((x) => { rarCounts[x.id] = 0; });
    const job = { id: nextId(state, 'j'), owner, actionId: act.id, qty: randInt(5, 20), done: 0, progress: 0, assisted: 0, postedAt: Date.now(), rarities: rarCounts };
    crew.jobs.push(job);
    return job;
  }
  function jobCraft(state, job, act, helping, events) {
    const outId = jobOutput(act); const it = item(outId);
    const q = Math.max(1, Math.round(num(act.outputs[outId], 1)));
    const grade = gradeOf(45 + rand() * 30);
    let rarity = null;
    if (it && it.kind === 'gear') {
      const total = 1.25 * (helping ? 1 + 0.2 * clamp(num(state.focus, 0), 0, 100) / 100 : 1);
      const odds = rarityOdds(total, false);
      let r = rand(), idx = 0;
      for (let i = 0; i < odds.length; i++) { r -= odds[i]; if (r < 0) { idx = i; break; } }
      rarity = rarities()[idx].id;
      job.rarities[rarity] = num(job.rarities[rarity], 0) + 1;
    }
    if (!helping) return;
    job.assisted++;
    state.mastery[act.id] = num(state.mastery[act.id], 0) + 1;
    const xp = num(act.xp, 0) * num(cfg().xpMult, 1) * 0.75;
    events.push({ type: 'assist', jobId: job.id, owner: job.owner, actionId: act.id, xp, items: it ? [{ itemId: outId, grade, qty: q }] : [], rarity });
    addXp(state, act.skill, xp, events);
    if (rarity && rarityIdx(rarity) >= 2) logq(state, 'craft', `${job.owner}'s ${it.name} came out ${rarityDef(rarity).name}. You helped!`);
  }
  function finishJob(state, job, act, events) {
    state.crew.jobs = state.crew.jobs.filter((j) => j !== job);
    const outId = jobOutput(act);
    const tip = job.assisted > 0 ? Math.round(E.itemValue(outId, 1) * 0.15 * job.assisted) : 0;
    if (job.assisted > 0) {
      state.gold += tip;
      events.push({ type: 'jobDone', jobId: job.id, owner: job.owner, actionId: act.id, tip, assisted: job.assisted });
      logq(state, 'info', `${job.owner}'s ${act.name} job is finished. You helped with ${job.assisted} and got a ${tip}g tip.`);
    }
    if (state.active && state.active.jobId === job.id) { state.active = null; events.push({ type: 'stopped', reason: 'Job finished.' }); }
  }
  // advances every open job; playerMult scales the player's contribution (1 live, offlineRate offline)
  function crewStep(state, dt, events, playerMult) {
    if (!state.crew || !Array.isArray(state.crew.jobs)) makeCrew(state);
    const crew = state.crew;
    const a = state.active;
    if (a && a.jobId && !crew.jobs.some((j) => j.id === a.jobId)) { state.active = null; events.push({ type: 'stopped', reason: 'Job finished.' }); }
    crew.nextPostIn = num(crew.nextPostIn, 60) - dt;
    let posts = 0;
    while (posts < CREW_MAX_JOBS && crew.jobs.length < CREW_MAX_JOBS && (crew.jobs.length < CREW_MIN_JOBS || crew.nextPostIn <= 0)) {
      const j = postJob(state); posts++;
      crew.nextPostIn = randInt(60, 90);
      if (!j) break;
      events.push({ type: 'jobPosted', jobId: j.id, owner: j.owner, actionId: j.actionId });
    }
    if (crew.nextPostIn <= 0) crew.nextPostIn = randInt(60, 90); // board full: wait another round
    for (const job of crew.jobs.slice()) {
      const act = action(job.actionId);
      if (!isJobAction(act)) {
        crew.jobs = crew.jobs.filter((j) => j !== job);
        if (state.active && state.active.jobId === job.id) { state.active = null; events.push({ type: 'stopped', reason: 'Job finished.' }); }
        continue;
      }
      const helping = !!(state.active && state.active.jobId === job.id);
      const rate = ownerRate(act) + (helping ? playerRate(state, act) * playerMult : 0);
      job.progress = num(job.progress, 0) + dt * rate;
      let guard = 0;
      while (job.progress >= 1 && job.done < job.qty && guard++ < 1000) { job.progress -= 1; job.done++; jobCraft(state, job, act, helping, events); }
      if (job.done >= job.qty) finishJob(state, job, act, events);
      else if (helping) state.active.progress = job.progress / rate;
    }
  }
  E.postCrewJob = (state, actionId) => postJob(state, actionId); // helper (tests / debugging)
  E.canAssist = function (state, jobId) {
    const job = state && state.crew && arr(state.crew.jobs).find((j) => j.id === jobId);
    if (!job) return { ok: false, reason: 'That job is no longer open.' };
    const act = action(job.actionId);
    if (!isJobAction(act)) return { ok: false, reason: 'That job can no longer be worked.' };
    if (E.skillLevel(state, act.skill) < num(act.level, 1)) return { ok: false, reason: `Requires ${skillName(act.skill)} level ${act.level}.` };
    return { ok: true, reason: '' };
  };
  E.assist = function (state, jobId) {
    const c = E.canAssist(state, jobId); if (!c.ok) return c;
    if (state.active && state.active.jobId === jobId) return { ok: true, reason: '' };
    const job = state.crew.jobs.find((j) => j.id === jobId);
    state.active = { actionId: job.actionId, progress: 0, jobId };
    return { ok: true, reason: '' };
  };
  E.crewJobs = function (state) {
    const crew = state && state.crew; if (!crew) return [];
    const a = state.active;
    return arr(crew.jobs).map((job) => {
      const act = action(job.actionId); if (!isJobAction(act)) return null;
      const assisting = !!(a && a.jobId === job.id);
      const rate = ownerRate(act) + (assisting ? playerRate(state, act) : 0);
      const left = Math.max(0, job.qty - job.done - num(job.progress, 0));
      return Object.assign({}, job, { rarities: Object.assign({}, job.rarities), action: act, skill: act.skill, station: E.station(act.skill),
        canAssist: E.canAssist(state, job.id), assisting, etaSec: left / rate, outputItemId: jobOutput(act) });
    }).filter(Boolean);
  };
  E.activeInfo = function (state) {
    const a = state && state.active; if (!a) return null;
    const act = action(a.actionId); if (!act) return null;
    if (a.jobId) {
      const job = state.crew && arr(state.crew.jobs).find((j) => j.id === a.jobId);
      if (!job) return null;
      const rate = ownerRate(act) + playerRate(state, act);
      const p = clamp(num(job.progress, 0), 0, 1);
      return { kind: 'assist', actionId: act.id, skill: act.skill, station: E.station(act.skill), label: `Helping ${job.owner} · ${act.name} ${job.done}/${job.qty}`,
        owner: job.owner, jobId: job.id, done: job.done, qty: job.qty, pct: p, secLeft: Math.max(0, (1 - p) / rate) };
    }
    const t = E.actionTime(state, act.id);
    return { kind: 'action', actionId: act.id, skill: act.skill, station: E.station(act.skill), label: act.name,
      pct: isFinite(t) && t > 0 ? clamp(num(a.progress, 0) / t, 0, 1) : 0, secLeft: isFinite(t) ? Math.max(0, t - num(a.progress, 0)) : 0 };
  };
  function migrateCrew(out, rc) {
    if (rc && typeof rc === 'object' && Array.isArray(rc.jobs) && Array.isArray(rc.members) && rc.members.some((m) => m && m.name)) {
      out.crew = {
        name: typeof rc.name === 'string' && rc.name ? rc.name : 'Copperbell crew',
        members: rc.members.filter((m) => m && m.name).map((m) => Object.assign({}, m, { name: String(m.name), skill: m.skill || null })),
        jobs: rc.jobs.filter((j) => j && j.id && isJobAction(action(j.actionId))).map((j) => {
          const qty = Math.max(1, Math.floor(num(j.qty, 5)));
          return { id: String(j.id), owner: String(j.owner || 'A crewmate'), actionId: j.actionId, qty, done: clamp(Math.floor(num(j.done, 0)), 0, qty),
            progress: clamp(num(j.progress, 0), 0, 1), assisted: Math.max(0, Math.floor(num(j.assisted, 0))), postedAt: num(j.postedAt, Date.now()),
            rarities: j.rarities && typeof j.rarities === 'object' ? j.rarities : {} };
        }),
        nextPostIn: clamp(num(rc.nextPostIn, 60), 0, 600)
      };
      ['playerRank', 'viewAsMember', 'vault', 'treasury', 'requisitions', 'withdrawRequests', 'feed', 'withdrawn', 'schedule', 'seenReqIds', 'reqSimIn', 'npcReqIn'].forEach((k) => { if (rc[k] !== undefined) out.crew[k] = rc[k]; });
      ensureCrewV4(out);
    } else makeCrew(out);
  }

  // ---------------------------------------------------------------- tick
  function advanceAction(state, dt, events, maxN) {
    const a = state.active; if (!a || a.jobId) return 0;
    const act = action(a.actionId);
    if (!act) { state.active = null; events.push({ type: 'stopped', reason: 'That action no longer exists.' }); return 0; }
    a.progress = num(a.progress, 0) + dt;
    let n = 0;
    while (state.active === a && n < maxN) {
      const t = E.actionTime(state, act.id);
      if (a.progress < t) break;
      a.progress -= t; n++;
      completeOnce(state, act, events);
    }
    if (state.active === a && n >= maxN) a.progress = Math.min(a.progress, E.actionTime(state, act.id) * 0.99);
    return n;
  }
  function marketFills(state, dt, events) {
    const tax = state.server ? E.marketTax(state) : clamp(num(cfg().marketTax, 0.05), 0, 1);
    const mine = arr(state.market.mine);
    for (let i = mine.length - 1; i >= 0; i--) {
      const l = mine[i]; if (!(l.qty > 0)) { mine.splice(i, 1); continue; }
      const fair = E.itemValue(l.itemId, l.grade);
      const chance = clamp(0.08 * Math.pow(clamp(fair / Math.max(1, l.price), 0, 2), 3), 0, 0.95);
      const p = 1 - Math.pow(1 - chance, dt);
      if (rand() >= p) continue;
      const units = Math.min(l.qty, 1 + Math.floor(rand() * Math.max(1, Math.ceil(l.qty / 4))));
      const gold = Math.round(l.price * units * (1 - tax));
      l.qty -= units; state.gold += gold;
      events.push({ type: 'sold', itemId: l.itemId, grade: l.grade, qty: units, gold });
      logq(state, 'market', `Sold ${units} ${itemName(l.itemId)} (${(grades()[l.grade] || {}).name || 'Standard'}) for ${gold}g after tax.`);
      if (l.qty <= 0) mine.splice(i, 1);
    }
  }
  E.tick = function (state, dtSec, opts) {
    const events = [];
    if (!state) return events;
    const dt = clamp(num(dtSec, 0), 0, 86400); if (dt <= 0) return events;
    const visible = !opts || opts.visible !== false;
    state.focus = clamp(num(state.focus, 0) + (visible && state.active ? 2 : -5) * dt, 0, 100);
    const ps = E.playerStats(state);
    const act = state.active && action(state.active.actionId);
    if (!act || act.kind !== 'combat') state.hp = Math.min(ps.maxHp, num(state.hp, 0) + ps.maxHp * 0.01 * dt); // gentle regen out of combat
    state.hp = clamp(state.hp, 0, ps.maxHp);
    if (!(state.active && state.active.jobId)) advanceAction(state, dt, events, TICK_MAX_COMPLETIONS);
    crewStep(state, dt, events, 1);
    crewEconomyStep(state, dt, events);
    processClock(state, events);
    crewLocksStep(state);
    if (state.active && !state.active.jobId) { const pb = pouchBlock(state, action(state.active.actionId)); if (pb) { state.active = null; events.push({ type: 'stopped', reason: pb }); } }
    state.market.age = num(state.market.age, 0) + dt;
    if (state.market.age >= MARKET_REFRESH_SEC) E.refreshMarket(state);
    marketFills(state, dt, events);
    return events;
  };

  // ---------------------------------------------------------------- offline
  E.applyOffline = function (state, nowMs) {
    const now = num(nowMs, Date.now());
    const summary = { items: {}, xp: {}, gold: 0, crafts: {}, kills: 0, stoppedReason: null, assisted: 0, tips: 0, raids: [], weeks: 0 };
    const last = num(state.lastSeen, now);
    const seconds = clamp((now - last) / 1000, 0, num(cfg().offlineCapSec, 43200));
    state.lastSeen = now;
    if (seconds < 1) { const cev = []; processClock(state, cev); summary.raids = cev.filter((e) => e.type === 'raidResolved').map((e) => e.recapId); return { seconds: 0, summary }; }
    const gold0 = state.gold; const xp0 = {};
    Object.keys(state.skills).forEach((k) => { xp0[k] = num(state.skills[k].xp, 0); });
    state.focus = 0;
    quiet = true;
    try {
      const a = state.active; const act = a && action(a.actionId);
      if (a && act && !a.jobId) {
        let remaining = seconds * clamp(num(cfg().offlineRate, 1), 0, 1), done = 0;
        a.progress = num(a.progress, 0);
        while (state.active === a && done < OFFLINE_MAX_COMPLETIONS) {
          const t = E.actionTime(state, act.id);
          const need = Math.max(0, t - a.progress);
          if (need > remaining) { a.progress += remaining; remaining = 0; break; }
          remaining -= need; a.progress = 0; done++;
          const ev = [];
          completeOnce(state, act, ev);
          ev.forEach((e) => {
            if (e.type === 'complete') e.items.forEach((i) => { summary.items[i.itemId] = (summary.items[i.itemId] || 0) + i.qty; });
            else if (e.type === 'craft') summary.crafts[e.rarity] = (summary.crafts[e.rarity] || 0) + 1;
            else if (e.type === 'kill') summary.kills++;
            else if (e.type === 'faint') summary.stoppedReason = 'You fainted.';
            else if (e.type === 'stopped') summary.stoppedReason = e.reason;
          });
        }
        if (state.active === a && done >= OFFLINE_MAX_COMPLETIONS) a.progress = 0;
        // time left over after a stop: rest
        const ps = E.playerStats(state);
        if (!state.active || act.kind !== 'combat') state.hp = Math.min(ps.maxHp, state.hp + ps.maxHp * 0.01 * (state.active ? seconds : remaining));
      } else {
        if (a && !act) state.active = null;
        state.hp = E.playerStats(state).maxHp;
      }
      // crew: owners keep working; an assisting player helps at offlineRate (coarse 5s steps)
      const oRate = clamp(num(cfg().offlineRate, 1), 0, 1);
      for (let t = 0; t < seconds; t += 5) {
        const cev = [];
        crewStep(state, Math.min(5, seconds - t), cev, oRate);
        crewEconomyStep(state, Math.min(5, seconds - t), cev);
        cev.forEach((e) => {
          if (e.type === 'assist') { summary.assisted++; if (e.rarity) summary.crafts[e.rarity] = (summary.crafts[e.rarity] || 0) + 1; }
          else if (e.type === 'jobDone') summary.tips += e.tip;
          else if (e.type === 'stopped') summary.stoppedReason = e.reason;
        });
      }
      // market: coarse 5s steps
      const ev = [];
      for (let t = 0; t < seconds && state.market.mine.length; t += 5) marketFills(state, Math.min(5, seconds - t), ev);
      state.market.age = num(state.market.age, 0) + seconds;
      if (state.market.age >= MARKET_REFRESH_SEC) E.refreshMarket(state);
      const wk0 = state.week; const cev = [];
      processClock(state, cev); crewLocksStep(state);
      summary.raids = cev.filter((e) => e.type === 'raidResolved').map((e) => e.recapId);
      summary.weeks = state.week - wk0;
    } finally { quiet = false; }
    summary.gold = Math.round(state.gold - gold0);
    Object.keys(state.skills).forEach((k) => { const d = num(state.skills[k].xp, 0) - num(xp0[k], 0); if (d > 0) summary.xp[k] = d; });
    const nItems = Object.values(summary.items).reduce((x, y) => x + y, 0);
    const xpTot = Object.values(summary.xp).reduce((x, y) => x + y, 0);
    E.log(state, 'info', `While you were away (${E.fmtTime(seconds)}): ${E.fmt(nItems)} items, ${E.fmt(xpTot)} XP, ${E.fmt(summary.gold)}g${summary.kills ? `, ${summary.kills} kills` : ''}${summary.assisted ? `, helped your crew with ${summary.assisted} crafts` : ''}.${summary.stoppedReason ? ' ' + summary.stoppedReason : ''}`);
    return { seconds: Math.floor(seconds), summary };
  };

  // ---------------------------------------------------------------- market
  function tierCap(state) {
    const top = skillDefs().reduce((m, s) => Math.max(m, E.skillLevel(state, s.id)), 1);
    return clamp(1 + Math.floor(top / 15), 1, 5);
  }
  function usableItemIds(state) { // inputs to actions the player has unlocked (or nearly)
    const set = new Set();
    allActions().forEach((a) => {
      if (!a || E.skillLevel(state, a.skill) + 5 < num(a.level, 1)) return;
      Object.keys(a.inputs || {}).forEach((id) => set.add(id));
    });
    return set;
  }
  E.refreshMarket = function (state) {
    const cap = tierCap(state); const usable = usableItemIds(state);
    const pool = [];
    Object.keys(itemsMap()).forEach((id) => {
      const it = item(id); if (!isStackable(it) || it.kind === 'core') return;
      const tier = num(it.tier, 1);
      if (tier > cap + 1) return;
      let w = usable.has(id) ? 3 : 1;
      if (it.kind === 'food' || it.kind === 'potion') w += 1;
      if (tier > cap) w *= 0.3;
      pool.push({ id, w });
    });
    const names = arr(D().npcNames).length ? D().npcNames : ['Wren', 'Ossian', 'Mira', 'Tobin', 'Kestrel', 'Ada'];
    const listings = [];
    const count = randInt(12, 20);
    const totalW = pool.reduce((a, p) => a + p.w, 0);
    for (let k = 0; k < count && pool.length; k++) {
      let r = rand() * totalW, chosen = pool[0];
      for (const p of pool) { r -= p.w; if (r < 0) { chosen = p; break; } }
      const it = item(chosen.id); const tier = clamp(num(it.tier, 1), 1, 5);
      const gr = (() => { const x = rand(); return x < 0.3 ? 0 : x < 0.7 ? 1 : x < 0.9 ? 2 : x < 0.98 ? 3 : 4; })();
      const qmax = [40, 20, 10, 5, 3][tier - 1]; const qmin = [5, 3, 2, 1, 1][tier - 1];
      listings.push({ id: nextId(state, 'n'), seller: pick(names), itemId: chosen.id, grade: gr, qty: randInt(qmin, qmax),
        price: Math.max(1, Math.round(E.itemValue(chosen.id, gr) * (0.9 + rand() * 0.6))) });
    }
    listings.sort((a, b) => num(item(a.itemId).tier, 1) - num(item(b.itemId).tier, 1) || itemName(a.itemId).localeCompare(itemName(b.itemId)));
    state.market.listings = listings;
    state.market.refreshedAt = Date.now();
    state.market.age = 0;
  };
  E.gatherEstimate = function (state, itemId) {
    const ps = E.playerStats(state); const memo = {};
    const levels = {};
    const lvl = (s) => (levels[s] != null ? levels[s] : (levels[s] = E.skillLevel(state, s)));
    function est(id, depth, stack) {
      if (Object.prototype.hasOwnProperty.call(memo, id)) return memo[id];
      if (depth > 12 || stack.has(id)) return null;
      stack.add(id);
      let best = null;
      allActions().forEach((a) => {
        if (!a || lvl(a.skill) < num(a.level, 1)) return;
        let cost = null;
        if (a.kind === 'gather') {
          if (a.outputs && a.outputs[id] > 0) cost = actionTimeWith(state, a, ps) / a.outputs[id];
          else { const b = arr(a.bonus).find((x) => x && x.item === id && x.chance > 0); if (b) cost = actionTimeWith(state, a, ps) / (b.chance * Math.max(0.1, qtyAvg(b.qty))); }
        } else if ((a.kind === 'refine' || a.kind === 'craft') && a.outputs && a.outputs[id] > 0) {
          let c = actionTimeWith(state, a, ps); let okAll = true;
          Object.keys(a.inputs || {}).forEach((inId) => { if (!okAll) return; const e = est(inId, depth + 1, stack); if (e == null) okAll = false; else c += e * num(a.inputs[inId], 0); });
          if (okAll) cost = c / a.outputs[id];
        } else if (a.kind === 'combat') {
          const d = arr(a.drops).find((x) => x && x.item === id && x.chance > 0);
          if (d) cost = actionTimeWith(state, a, ps) / (d.chance * Math.max(0.1, qtyAvg(d.qty)));
        }
        if (cost != null && isFinite(cost) && (best == null || cost < best)) best = cost;
      });
      stack.delete(id);
      memo[id] = best;
      return best;
    }
    const r = est(itemId, 0, new Set());
    return r == null ? null : Math.max(0.1, Math.round(r * 10) / 10);
  };
  E.buy = function (state, listingId, qty) {
    const l = arr(state.market.listings).find((x) => x.id === listingId);
    if (!l) return { ok: false, reason: 'That listing is gone.' };
    qty = Math.floor(num(qty, 1));
    if (qty < 1) return { ok: false, reason: 'Pick at least 1.' };
    if (qty > l.qty) return { ok: false, reason: `Only ${l.qty} left in that listing.` };
    const cost = l.price * qty;
    if (state.gold < cost) return { ok: false, reason: `That costs ${cost}g and you have ${Math.floor(state.gold)}g.` };
    state.gold -= cost; addItem(state, l.itemId, l.grade, qty); l.qty -= qty;
    if (l.qty <= 0) state.market.listings = state.market.listings.filter((x) => x !== l);
    E.log(state, 'market', `Bought ${qty} ${itemName(l.itemId)} from ${l.seller} for ${cost}g.`);
    return { ok: true, reason: '', gold: cost };
  };
  E.list = function (state, itemId, grade, qty, price) {
    const it = item(itemId);
    if (!it) return { ok: false, reason: 'Unknown item.' };
    if (!isStackable(it)) return { ok: false, reason: 'Gear cannot be listed in this prototype.' };
    grade = Math.floor(num(grade, -1)); qty = Math.floor(num(qty, 0)); price = Math.round(num(price, 0));
    if (grade < 0 || grade > 4) return { ok: false, reason: 'Pick a grade.' };
    if (qty < 1) return { ok: false, reason: 'List at least 1.' };
    if (price < 1) return { ok: false, reason: 'Price must be at least 1g.' };
    const have = (state.inv[itemId] || zeros5())[grade] || 0;
    if (have < qty) return { ok: false, reason: `You only have ${have} ${(grades()[grade] || {}).name || ''} ${lcFirst(it.name)}.`.replace(/\s+/g, ' ') };
    if (state.market.mine.length >= MAX_PLAYER_LISTINGS) return { ok: false, reason: `You can only have ${MAX_PLAYER_LISTINGS} listings at once.` };
    state.inv[itemId][grade] -= qty; cleanInv(state, itemId);
    state.market.mine.push({ id: nextId(state, 'm'), itemId, grade, qty, price });
    E.log(state, 'market', `Listed ${qty} ${it.name} at ${price}g each.`);
    return { ok: true, reason: '' };
  };
  E.cancelListing = function (state, id) {
    const l = arr(state.market.mine).find((x) => x.id === id);
    if (l) { addItem(state, l.itemId, l.grade, l.qty); state.market.mine = state.market.mine.filter((x) => x !== l); }
    return { ok: true };
  };

  // ---------------------------------------------------------------- supply board
  function counterItems(state) {
    const boss = E.currentBoss(state); if (!boss) return [];
    const cap = tierCap(state);
    const cand = Object.keys(itemsMap()).map(item).filter((it) => it && (it.kind === 'potion' || it.kind === 'food'));
    const score = (it) => {
      let s = it.kind === 'potion' ? 3 : 1;
      const txt = (it.id + ' ' + (it.name || '')).toLowerCase();
      if (boss.hits && txt.includes(String(boss.hits).toLowerCase())) s += 3; // e.g. fire-resist tonic
      if (boss.weakTo && txt.includes(String(boss.weakTo).toLowerCase())) s += 2;
      if (it.counters && (it.counters === boss.id || arr(it.counters).includes(boss.id))) s += 5;
      if (num(it.tier, 1) <= cap + 1) s += 1;
      return s + rand();
    };
    return cand.sort((a, b) => score(b) - score(a)).slice(0, 2).map((it) => it.id);
  }
  function generateSupply(state) {
    const c = cfg(); const rateMult = num(c.supplyRateMult, 0.6);
    const n = randInt(6, 8); const reqs = []; const used = new Set();
    const addReq = (id, mult, counter) => {
      if (used.has(id) || !item(id)) return; used.add(id);
      const rate = Math.max(0.5, Math.round(num(item(id).value, 1) * rateMult * mult * 10) / 10);
      reqs.push(counter ? { itemId: id, rate, counter: true } : { itemId: id, rate });
    };
    counterItems(state).forEach((id) => addReq(id, 1.6, true));
    const cap = tierCap(state);
    const stack = Object.keys(itemsMap()).filter((id) => { const it = item(id); return isStackable(it) && it.kind !== 'core'; });
    const doable = shuffle(stack.filter((id) => num(item(id).tier, 1) <= cap + 1 && E.gatherEstimate(state, id) != null));
    const stretch = shuffle(stack.filter((id) => !doable.includes(id) && num(item(id).tier, 1) <= cap + 2));
    for (const id of doable) { if (reqs.length >= n - 1) break; addReq(id, 0.9 + rand() * 0.3, false); }
    for (const id of stretch) { if (reqs.length >= n) break; addReq(id, 1.1, false); }
    for (const id of shuffle(stack)) { if (reqs.length >= n) break; addReq(id, 1, false); }
    state.supply = { week: state.week, requests: reqs, donated: {}, earned: 0 };
  }
  E.supplyQuote = function (state, itemId, qty) {
    const req = arr(state.supply.requests).find((r) => r.itemId === itemId);
    qty = Math.floor(num(qty, 0));
    if (!req || qty <= 0) return { coins: 0, tokens: 0 };
    let done = num(state.supply.donated[itemId], 0), left = qty, coins = 0, lo = 0;
    for (const seg of cfg().supplyDiminish) {
      const upTo = seg.upTo == null ? Infinity : num(seg.upTo, Infinity);
      if (done < upTo && left > 0) { const n = Math.min(left, upTo - Math.max(done, lo)); coins += n * req.rate * num(seg.mult, 1); left -= n; done += n; }
      lo = upTo;
    }
    if (left > 0) coins += left * req.rate * 0.1;
    coins = Math.floor(coins);
    const earned = num(state.supply.earned, 0);
    return { coins, tokens: Math.max(0, Math.floor((earned + coins) / 50) - Math.floor(earned / 50)) };
  };
  E.donate = function (state, itemId, qty) {
    const req = arr(state.supply.requests).find((r) => r.itemId === itemId);
    if (!req) return { ok: false, coins: 0, tokens: 0, reason: `The board is not asking for ${lcFirst(itemName(itemId))} this week.` };
    qty = Math.floor(num(qty, 0));
    if (qty < 1) return { ok: false, coins: 0, tokens: 0, reason: 'Donate at least 1.' };
    const have = E.itemCount(state, itemId);
    if (have < qty) return { ok: false, coins: 0, tokens: 0, reason: `You only have ${have} ${lcFirst(itemName(itemId))}.` };
    const q = E.supplyQuote(state, itemId, qty);
    consume(state, itemId, qty, 'worst');
    state.supply.donated[itemId] = num(state.supply.donated[itemId], 0) + qty;
    state.supply.earned = num(state.supply.earned, 0) + q.coins;
    state.gold += q.coins; state.tokens += q.tokens;
    E.log(state, 'market', `Donated ${qty} ${itemName(itemId)} to the supply board for ${q.coins}g${q.tokens ? ` and ${q.tokens} token${q.tokens > 1 ? 's' : ''}` : ''}.`);
    return { ok: true, coins: q.coins, tokens: q.tokens, reason: '' };
  };

  // ================================================================ v4: helpers
  const DAY_MS = 86400000, WEEK_MS = 7 * DAY_MS;
  const SCHEMA = 4;
  const V3_BOSS_HP = [400000, 650000, 900000, 1200000, 1600000, 2200000];
  const CHECK_LABEL = { mitigation: 'Mitigation', healing: 'Healing', damage: 'Damage', food: 'Food', consumables: 'Consumables' };
  const ROLE_CHECK = { guardian: 'mitigation', mender: 'healing', striker: 'damage' };
  const RAID_ROLE_IDS = ['guardian', 'mender', 'striker', 'supply'];
  const TIERS = ['none', 'bronze', 'silver', 'gold'];
  const TIER_NAME = { none: 'No tier', bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
  const OFF_ROLE = 0.3, ROLE_MIX = (1 + 2 * OFF_ROLE) / 3; // avg output per stat of a player at "fair" power
  const HP_K = 30; // expected server damage per participant-weekend, in units of the boss requirement
  const FEED_CAP = 80;
  function mulberry(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const roleDefs = () => (arr(D().raidRoles).length ? D().raidRoles : RAID_ROLE_IDS.map((id) => ({ id, name: cap1(id), check: ROLE_CHECK[id] || null, takesHits: id !== 'supply' })));
  const roleDef = (id) => roleDefs().find((r) => r.id === id) || roleDefs()[2];
  const tagDefs = () => arr(D().statTags);
  const rankDefs = () => (arr(D().crewRanks).length ? D().crewRanks : [{ id: 'leader', name: 'Leader', perms: {}, withdrawCap: Infinity }, { id: 'officer', name: 'Officer', perms: {}, withdrawCap: 40 }, { id: 'member', name: 'Member', perms: {}, withdrawCap: 0 }]);
  const rankDef = (id) => rankDefs().find((r) => r.id === id) || rankDefs()[rankDefs().length - 1];
  const sumInv = (m) => Object.keys(m || {}).reduce((a, id) => a + arr(m[id]).reduce((x, y) => x + (y > 0 ? y : 0), 0), 0);
  const invCount = (m, id) => arr(m && m[id]).reduce((x, y) => x + (y > 0 ? y : 0), 0);
  function invAdd(m, id, grade, qty) { if (!(qty > 0)) return; if (!Array.isArray(m[id])) m[id] = zeros5(); m[id][clamp(Math.floor(num(grade, 1)), 0, 4)] += qty; }
  function invTake(m, id, qty, order, minGrade) { // returns [{grade, qty}] taken
    const g = m[id]; const out = []; if (!g) return out;
    let need = qty;
    for (const i of order) { if (need <= 0) break; if (i < num(minGrade, 0)) continue; const t = Math.min(need, Math.max(0, g[i] || 0)); if (t > 0) { g[i] -= t; need -= t; out.push({ grade: i, qty: t }); } }
    if (g.every((x) => !(x > 0))) delete m[id];
    return out;
  }
  const BEST = [4, 3, 2, 1, 0], WORST = [0, 1, 2, 3, 4];

  // ================================================================ v4: clock
  function mondayOf(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
  function addDays(ms, n) { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); }
  function dayKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  const nowOf = (state, realMs) => num(realMs, Date.now()) + num(state && state.clock && state.clock.offsetMs, 0);
  function ensureClock(state) {
    if (!state.clock || typeof state.clock !== 'object') state.clock = {};
    const c = state.clock; c.offsetMs = num(c.offsetMs, 0);
    if (!isFinite(c.epoch)) c.epoch = addDays(mondayOf(Date.now() + c.offsetMs), -7 * (Math.max(1, Math.floor(num(state.week, 1))) - 1));
    return c;
  }
  function weekNum(state, ms) { const c = ensureClock(state); return Math.max(1, Math.round((mondayOf(ms) - mondayOf(c.epoch)) / WEEK_MS) + 1); }
  function weekStartOf(state, wk) { const c = ensureClock(state); return addDays(mondayOf(c.epoch), 7 * (wk - 1)); }
  function schedule(state) { return Object.assign({ startDay: 6, startHour: 10, endDay: 0, endHour: 22 }, cfg().raidWindow || {}, (state.crew && state.crew.schedule) || {}); }
  function windowFor(state, ms) {
    const sc = schedule(state); const mon = mondayOf(ms);
    const sd = (num(sc.startDay, 6) + 6) % 7; let ed = (num(sc.endDay, 0) + 6) % 7; if (ed < sd) ed += 7;
    const st = new Date(addDays(mon, sd)); st.setHours(num(sc.startHour, 10), 0, 0, 0);
    const en = new Date(addDays(mon, ed)); en.setHours(num(sc.endHour, 22), 0, 0, 0);
    if (en <= st) en.setDate(en.getDate() + 7);
    return { start: st.getTime(), end: en.getTime() };
  }
  const durTxt = (ms) => E.fmtTime(Math.max(0, ms) / 1000);
  E.now = (state) => nowOf(state);
  E.weekNumber = (state, realMs) => weekNum(state, nowOf(state, realMs));
  E.raidWindow = (state, realMs) => windowFor(state, nowOf(state, realMs));
  E.isRaidWindow = function (state, realMs) { const n = nowOf(state, realMs); const w = windowFor(state, n); return n >= w.start && n < w.end; };
  E.clock = function (state, realMs) {
    ensureClock(state);
    const now = nowOf(state, realMs); const w = windowFor(state, now);
    const live = now >= w.start && now < w.end;
    const week = Math.max(num(state.week, 1), weekNum(state, now));
    const raidDone = num(state.raid && state.raid.resolvedWeek, 0) >= week;
    let ms, short;
    const nextWeekStart = windowFor(state, addDays(mondayOf(now), 7)).start;
    let nextStart;
    if (live) { ms = w.end - now; nextStart = nextWeekStart; short = 'Raid live · ' + durTxt(ms) + ' left'; }
    else if (now < w.start && !raidDone) { ms = w.start - now; nextStart = w.start; short = 'Raid in ' + durTxt(ms); }
    else { nextStart = nextWeekStart; ms = nextStart - now; short = 'Raid done · next in ' + durTxt(ms); }
    const rec = state.raid && state.raid.bosses ? curRecord(state) : null;
    const weekday = (new Date(now).getDay() + 6) % 7;
    return { live, ms, now, week, weekday, isWeekend: weekday >= 5, raidOpen: live, raidStart: w.start, raidEnd: w.end,
      secToRaid: Math.max(0, (w.start - now) / 1000), secLeftInRaid: live ? (w.end - now) / 1000 : 0, raidDone, nextRaidStart: nextStart, state: live ? 'live' : raidDone ? 'done' : 'upcoming',
      revealed: !!(rec && rec.revealedWeek != null), label: 'Week ' + week + ' · ' + short, short, landingTab: live ? 'raid' : 'workshop' };
  };
  E.raidClock = E.clock;
  E.defaultTab = (state) => (E.isRaidWindow(state) ? 'raid' : 'workshop');

  // ================================================================ v4: server + boss ladder
  function avgPop(state) { const h = arr(state.server && state.server.popHistory).filter((x) => x > 0); return h.length ? h.reduce((a, b) => a + b, 0) / h.length : num(cfg().serverPop, 1200); }
  const seasonMult = (state) => 1 + 0.25 * (Math.max(1, num(state.raid.season, 1)) - 1);
  function bossMaxHp(state, b, pop) { return Math.max(1000, Math.round(pop * num(b.reqPower, 30) * HP_K * num(b.weekends, 2) * seasonMult(state))); }
  function ensureRecord(state, idx, week) {
    const b = bosses()[idx]; if (!b) return null;
    const R = state.raid.bosses || (state.raid.bosses = {});
    if (!R[b.id]) {
      const pop = Math.round(avgPop(state)); const hp = bossMaxHp(state, b, pop);
      R[b.id] = { bossId: b.id, index: idx, maxHp: hp, hpLeft: hp, pop, unlockedWeek: num(week, state.week), revealedWeek: null, killedWeek: null,
        weekends: 0, myPoints: 0, totalPoints: 0, tokens: 0, joinedWeekends: 0, checkpointsPaid: [] };
    }
    return R[b.id];
  }
  function curRecord(state) {
    const idx = clamp(Math.floor(num(state.raid.ladder, 0)), 0, Math.max(0, bosses().length - 1));
    const r = ensureRecord(state, idx, state.week);
    if (r) state.raid.bossHp = r.hpLeft;
    return r;
  }
  const bossReq = (b) => Math.max(5, num(b && b.reqPower, 30));
  E.currentBoss = function (state) {
    const b = bosses(); if (!b.length) return null;
    const def = b[clamp(Math.floor(num(state && state.raid && state.raid.ladder, 0)), 0, b.length - 1)];
    if (!state || !state.raid || !state.raid.bosses) return def;
    const r = curRecord(state);
    return Object.assign({}, def, { hp: r ? r.maxHp : def.hp, revealed: !!(r && r.revealedWeek != null) });
  };
  E.bossRecord = function (state, bossId) {
    if (!bossId) return curRecord(state);
    const i = bosses().findIndex((b) => b.id === bossId); if (i < 0) return null;
    return (state.raid.bosses || {})[bossId] || null;
  };
  E.bossIntel = function (state) {
    const boss = E.currentBoss(state); if (!boss) return null;
    const rec = curRecord(state); const rev = rec.revealedWeek != null;
    const dealt = 1 - rec.hpLeft / Math.max(1, rec.maxHp);
    return { boss, record: Object.assign({}, rec), revealed: rev, name: rev ? boss.name : 'Unknown boss', title: boss.title,
      weakTo: rev ? boss.weakTo || null : null, hits: rev ? boss.hits || null : null,
      phases: rev ? bossPhases(boss).map((p) => ({ name: p.name, check: p.check, label: CHECK_LABEL[p.check] })) : [],
      maxHp: rec.maxHp, hpLeft: rec.hpLeft, hpPct: rec.hpLeft / Math.max(1, rec.maxHp), damageDealtPct: dealt,
      checkpoints: arr(cfg().checkpoints).map((at) => ({ at, reached: dealt >= at - 1e-9, paidWeek: rec.checkpointsPaid.includes(at) ? true : null })),
      pop: rec.pop, reqPower: bossReq(boss), cores: num(boss.cores, 20), weekends: rec.weekends, carryOver: rec.weekends > 0 };
  };
  E.ladder = function (state) {
    const idx = num(state.raid.ladder, 0);
    return bosses().map((b, i) => {
      const r = (state.raid.bosses || {})[b.id];
      return { bossId: b.id, name: (i <= idx && (!r || r.revealedWeek != null || i < idx)) ? b.name : '???', index: i,
        status: i < idx ? 'killed' : i === idx ? 'current' : 'locked', hpPct: r ? r.hpLeft / Math.max(1, r.maxHp) : 1, killedWeek: r ? r.killedWeek : null };
    });
  };

  // ================================================================ v4: stats, roles, tags
  function statsFor(state, slots) {
    const c = cfg();
    const out = { atk: 0, def: 0, heal: 0, maxHp: 0, power: 0, elements: emptyElements(), speed: 0 };
    let gearHp = 0;
    SLOTS.forEach((slot) => {
      const g = findGear(state, slots && slots[slot]); if (!g) return;
      const s = E.gearStats(g);
      out.atk += s.atk; out.def += s.def; out.heal += s.heal; gearHp += s.hp; out.speed += s.speed;
      Object.keys(s.elements).forEach((e) => { out.elements[e] = num(out.elements[e], 0) + s.elements[e]; });
    });
    const combatSum = combatSkillIds().reduce((a, id) => a + E.skillLevel(state, id), 0);
    out.maxHp = Math.max(1, Math.round(num(c.baseHp, 60) + num(c.hpPerCombatLevel, 4) * (combatSum - 3) + gearHp));
    const elemSum = Object.values(out.elements).reduce((a, b) => a + b, 0);
    out.power = Math.round(out.atk + out.def + out.heal + out.maxHp / 10 + elemSum * 0.5);
    out.speed = Math.min(50, out.speed);
    return out;
  }
  function powersOf(ps, boss) {
    const weak = boss ? num(ps.elements[boss.weakTo], 0) : 0;
    const other = Object.keys(ps.elements).filter((e) => !boss || e !== boss.weakTo).reduce((a, e) => a + ps.elements[e], 0);
    return { striker: Math.round(ps.atk * 3 + weak * 3 + other), guardian: Math.round(ps.def * 2.5 + ps.maxHp * 0.1), mender: Math.round(ps.heal * 3), supply: 0 };
  }
  function slotsOf(state, ref) {
    if (ref && typeof ref === 'object') return ref;
    if (ref == null || ref === 'equipped') return state.equipped;
    const l = E.loadout(state, ref); return l ? l.slots : state.equipped;
  }
  E.raidRoles = () => roleDefs().slice();
  E.rolePower = function (state, role, slots) { return role === 'supply' ? pouchHealTotal(state) : num(powersOf(statsFor(state, slotsOf(state, slots)), E.currentBoss(state))[role], 0); };
  E.roleRequirement = (state, role) => (role === 'supply' ? 0 : bossReq(E.currentBoss(state)));
  E.roleCheck = function (state, role, ref) {
    const rd = roleDef(role); const slots = slotsOf(state, ref);
    const missing = SLOTS.filter((s) => slots[s] && !findGear(state, slots[s]));
    if (role === 'supply') return { role: 'supply', ok: true, power: pouchHealTotal(state), need: 0, label: rd.powerLabel || 'Supplies', missing, reason: '' };
    const power = E.rolePower(state, role, slots); const need = E.roleRequirement(state, role);
    const ok = power >= need;
    return { role, ok, power, need, label: rd.powerLabel || 'Power', missing,
      reason: ok ? (missing.length ? 'Some pieces are no longer in your bag.' : '') : `${rd.name} needs ${need} ${lcFirst(rd.powerLabel || 'power')} (you have ${power}).` };
  };
  const TAG_PHRASE = { damage: 'damage', defence: 'defence', healing: 'healing', vitality: 'HP', mining: 'mining speed', woodcutting: 'woodcutting speed',
    foraging: 'foraging yield', fishing: 'fishing yield', hunting: 'hunting drops', quality: 'quality', speed: 'action speed' };
  const tagUnit = (id) => { const t = tagDefs().find((x) => x.id === id); return t ? t.unit : (['mining', 'woodcutting', 'foraging', 'fishing', 'hunting', 'speed'].includes(id) ? 'pct' : 'pts'); };
  const tagIds = () => (tagDefs().length ? tagDefs().map((t) => t.id) : Object.keys(TAG_PHRASE));
  E.statTags = () => tagDefs().slice();
  E.gearTags = function (g) {
    const out = {}; tagIds().forEach((t) => { out[t] = 0; });
    const it = g && item(g.itemId); if (!it) return out;
    const st = E.gearStats(g);
    out.damage = st.atk; out.defence = st.def; out.healing = st.heal; out.vitality = st.hp; out.speed = Math.round(st.speed * 10) / 1000;
    if (!(num(g.dur, 0) > 0)) return out;
    const m = num(rarityDef(g.rarity).statMult, 1) * gradeMult(gradeOf(g.quality));
    Object.keys(it.tags || {}).forEach((k) => { const v = num(it.tags[k], 0) * m; out[k] = num(out[k], 0) + (tagUnit(k) === 'pts' ? Math.round(v) : Math.round(v * 1000) / 1000); });
    return out;
  };
  function slotsTags(state, slots) {
    const out = {}; tagIds().forEach((t) => { out[t] = 0; });
    SLOTS.forEach((s) => { const g = findGear(state, slots && slots[s]); if (!g) return; const t = E.gearTags(g); Object.keys(t).forEach((k) => { out[k] = Math.round((num(out[k], 0) + t[k]) * 1000) / 1000; }); });
    return out;
  }
  function tagScore(g, tag, boss) {
    const st = E.gearStats(g);
    if (tag === 'damage') { const w = boss ? num(st.elements[boss.weakTo], 0) : 0; return st.atk * 3 + w * 3 + Object.values(st.elements).reduce((a, b) => a + b, 0) - w; }
    if (tag === 'defence') return st.def * 2.5 + st.hp * 0.1;
    if (tag === 'healing') return st.heal * 3;
    return num(E.gearTags(g)[tag], 0);
  }
  E.tagValue = (g, tag) => tagScore(g, tag, null);
  E.activityTag = function (skillId) {
    const map = { mining: 'mining', woodcutting: 'woodcutting', herbalism: 'foraging', fishing: 'fishing', guardian: 'defence', mender: 'healing', striker: 'damage' };
    return map[skillId] || 'quality';
  };
  E.skillBonus = function (state, skillId, slots) {
    const t = slotsTags(state, slots || state.equipped);
    const def = skillDefs().find((s) => s.id === skillId) || {};
    const out = { speed: 0, yield: 0, quality: 0, drops: 0 };
    tagDefs().forEach((td) => {
      const v = num(t[td.id], 0); if (!v || td.kind !== 'skill' || td.id === 'speed') return;
      const applies = td.skill === skillId || (td.skill === 'combat' && def.tier === 'combat') || (td.skill === 'crafting' && (def.tier === 'crafting' || def.tier === 'refining' || def.tier === 'gathering'));
      if (!applies) return;
      if (td.effect === 'speed') out.speed += v; else if (td.effect === 'yield') out.yield += v; else if (td.effect === 'quality') out.quality += v; else if (td.effect === 'drops') out.drops += v;
    });
    out.speed = clamp(out.speed, 0, 0.6); out.yield = clamp(out.yield, 0, 1);
    return out;
  };
  E.loadoutStats = function (state, ref) {
    const slots = slotsOf(state, ref); const ps = statsFor(state, slots);
    return Object.assign(ps, { tags: slotsTags(state, slots), powers: powersOf(ps, E.currentBoss(state)) });
  };

  // ================================================================ v4: loadouts
  const emptySlots = () => { const o = {}; SLOTS.forEach((s) => { o[s] = null; }); return o; };
  function cleanSlots(state, slots) { const o = emptySlots(); SLOTS.forEach((s) => { const u = slots && slots[s]; if (u && typeof u === 'string') o[s] = u; }); return o; }
  E.loadout = (state, id) => arr(state.loadouts).find((l) => l.id === id) || null;
  E.loadouts = function (state) {
    const plan = state.raid.plan || {}; const lock = state.raid.lock;
    return arr(state.loadouts).map((l) => {
      const missing = SLOTS.filter((s) => l.slots[s] && !findGear(state, l.slots[s]));
      const rc = {}; ['guardian', 'mender', 'striker'].forEach((r) => { rc[r] = E.roleCheck(state, r, l.slots); });
      return Object.assign({}, l, { slots: Object.assign({}, l.slots), missing, complete: missing.length === 0, pieces: SLOTS.filter((s) => l.slots[s]).length,
        tags: slotsTags(state, l.slots), roleChecks: rc, isRaid: plan.loadoutId === l.id, locked: !!(lock && lock.loadoutId === l.id) });
    });
  };
  E.saveLoadout = function (state, spec) {
    spec = spec || {};
    if (!Array.isArray(state.loadouts)) state.loadouts = [];
    let l = spec.id ? E.loadout(state, spec.id) : null;
    const slots = spec.slots ? cleanSlots(state, spec.slots) : (l && !spec.fromEquipped ? l.slots : cleanSlots(state, state.equipped));
    const name = String(spec.name || (l && l.name) || 'Loadout ' + (state.loadouts.length + 1)).slice(0, 24);
    if (!l) {
      if (state.loadouts.length >= 12) return { ok: false, reason: 'You can keep up to 12 loadouts.' };
      l = { id: nextId(state, 'L'), name, slots, goal: spec.goal || null, boundTo: null, createdAt: Date.now() };
      state.loadouts.push(l);
    } else { l.name = name; l.slots = slots; if (spec.goal !== undefined) l.goal = spec.goal || null; }
    return { ok: true, reason: '', loadout: l };
  };
  E.deleteLoadout = function (state, id) {
    const l = E.loadout(state, id); if (!l) return { ok: false, reason: 'That loadout is gone.' };
    if (state.raid.lock && state.raid.lock.loadoutId === id) return { ok: false, reason: 'It is locked in for this week\'s raid.' };
    state.loadouts = state.loadouts.filter((x) => x !== l);
    if (state.raid.plan && state.raid.plan.loadoutId === id) state.raid.plan.loadoutId = null;
    return { ok: true, reason: '' };
  };
  E.equipLoadout = function (state, id) {
    const l = E.loadout(state, id); if (!l) return { ok: false, reason: 'That loadout is gone.', missing: [], equipped: 0 };
    const missing = []; let n = 0;
    SLOTS.forEach((s) => {
      const u = l.slots[s];
      if (!u) return;
      if (findGear(state, u)) { state.equipped[s] = u; n++; } else missing.push(s);
    });
    clampHp(state);
    return { ok: true, reason: missing.length ? `Missing: ${missing.join(', ')}.` : '', missing, equipped: n };
  };
  E.autoBuild = function (state, tag, opts) {
    opts = opts || {}; const boss = E.currentBoss(state);
    const slots = emptySlots(); let score = 0;
    SLOTS.forEach((s) => {
      const cands = arr(state.gear).filter((g) => item(g.itemId) && item(g.itemId).slot === s && num(g.dur, 0) > 0);
      if (!cands.length) return;
      const general = (g) => { const st = E.gearStats(g); return st.atk + st.def + st.heal + st.hp / 10; };
      cands.sort((a, b) => (tagScore(b, tag, boss) - tagScore(a, tag, boss)) || (general(b) - general(a)));
      const best = cands[0];
      if (tagScore(best, tag, boss) > 0) { slots[s] = best.uid; score += tagScore(best, tag, boss); }
      else { const eq = findGear(state, state.equipped[s]); slots[s] = eq ? eq.uid : best.uid; }
    });
    const before = SLOTS.reduce((a, s) => { const g = findGear(state, state.equipped[s]); return a + (g ? tagScore(g, tag, boss) : 0); }, 0);
    const res = { ok: true, reason: '', slots, score: Math.round(score * 1000) / 1000, gain: Math.round((score - before) * 1000) / 1000 };
    if (opts.save) { const sv = E.saveLoadout(state, { id: opts.id, name: opts.name || ('Best ' + lcFirst(TAG_PHRASE[tag] || tag)), slots, goal: tag }); res.loadout = sv.loadout; res.ok = sv.ok; res.reason = sv.reason; }
    return res;
  };
  E.bindLoadout = function (state, id, skillId) {
    const l = E.loadout(state, id); if (!l) return { ok: false, reason: 'That loadout is gone.' };
    if (skillId) arr(state.loadouts).forEach((x) => { if (x !== l && x.boundTo === skillId) x.boundTo = null; });
    l.boundTo = skillId || null;
    return { ok: true, reason: '' };
  };
  E.boundLoadout = (state, skillId) => arr(state.loadouts).find((l) => l.boundTo === skillId) || null;
  function deltasBetween(state, slotsA, slotsB, vsName) {
    const a = slotsTags(state, slotsA), b = slotsTags(state, slotsB); const out = [];
    tagIds().forEach((t) => {
      const d = Math.round((num(a[t], 0) - num(b[t], 0)) * 1000) / 1000; if (!d) return;
      const unit = tagUnit(t);
      const v = unit === 'pct' ? Math.round(d * 1000) / 10 + '%' : String(Math.round(d));
      out.push({ tag: t, label: (tagDefs().find((x) => x.id === t) || {}).name || t, from: b[t], to: a[t], delta: d, unit,
        text: (d > 0 ? '+' : '') + v + ' ' + TAG_PHRASE[t] + ' vs. ' + vsName });
    });
    return out;
  }
  E.compareLoadout = function (state, a, b) {
    const sa = slotsOf(state, a), sb = slotsOf(state, b);
    const vs = b == null || b === 'equipped' ? 'equipped' : (typeof b === 'object' ? 'current' : ((E.loadout(state, b) || {}).name || 'equipped'));
    const boss = E.currentBoss(state); const pa = powersOf(statsFor(state, sa), boss), pb = powersOf(statsFor(state, sb), boss);
    const power = {}; ['guardian', 'mender', 'striker'].forEach((r) => { power[r] = { from: pb[r], to: pa[r], delta: pa[r] - pb[r] }; });
    return { deltas: deltasBetween(state, sa, sb, vs), power };
  };
  E.compareGear = function (state, uid) {
    const g = findGear(state, uid) || findVaultGear(state, uid); if (!g) return { slot: null, vsUid: null, deltas: [] };
    const slot = (item(g.itemId) || {}).slot; const next = Object.assign({}, state.equipped); next[slot] = uid;
    if (!findGear(state, uid)) return { slot, vsUid: state.equipped[slot] || null, deltas: [] };
    return { slot, vsUid: state.equipped[slot] || null, deltas: deltasBetween(state, next, state.equipped, 'equipped') };
  };

  // ================================================================ v4: raid rules, plan, pouch, lock
  function normRules(state, r) {
    const out = Object.assign({ eatAt: 0.5, stance: 'balanced', tactic: 'focus', tokens: 0 }, r || {});
    out.eatAt = Math.round(clamp(num(Number(out.eatAt), 0.5), 0.3, 0.8) * 100) / 100;
    if (!STANCES.includes(out.stance)) out.stance = 'balanced';
    if (!TACTICS.includes(out.tactic)) out.tactic = 'focus';
    out.tokens = clamp(Math.floor(num(Number(out.tokens), 0)), 0, Math.max(0, Math.floor(num(state.tokens, 0))));
    return { eatAt: out.eatAt, stance: out.stance, tactic: out.tactic, tokens: out.tokens };
  }
  function lockedNow(state) { return !!(state.raid.lock && state.raid.lock.week === state.week); }
  function raidDoneThisWeek(state) { return num(state.raid.resolvedWeek, 0) >= state.week; }
  function prepBlocked(state) {
    if (raidDoneThisWeek(state)) return 'This week\'s raid has been fought.';
    if (lockedNow(state)) return 'You are locked in. Unlock to change your plan.';
    return '';
  }
  E.setRaidRules = function (state, rules) {
    const b = prepBlocked(state); if (b && lockedNow(state)) return { ok: false, reason: b, rules: Object.assign({}, state.raid.rules) };
    state.raid.rules = normRules(state, Object.assign({}, state.raid.rules, rules || {}));
    return { ok: true, reason: '', rules: Object.assign({}, state.raid.rules) };
  };
  function bestRole(state, slots) {
    const p = powersOf(statsFor(state, slots), E.currentBoss(state)); const need = bossReq(E.currentBoss(state));
    const r = ['striker', 'guardian', 'mender'].sort((a, b) => p[b] - p[a])[0];
    return p[r] >= need * 0.5 ? r : 'supply';
  }
  E.setRaidPlan = function (state, spec) {
    const b = prepBlocked(state); if (b) return { ok: false, reason: b, plan: Object.assign({}, state.raid.plan) };
    spec = spec || {}; const plan = state.raid.plan || (state.raid.plan = { role: null, loadoutId: null });
    if (spec.role !== undefined) { if (!RAID_ROLE_IDS.includes(spec.role)) return { ok: false, reason: 'Unknown role.', plan: Object.assign({}, plan) }; plan.role = spec.role; }
    if (spec.loadoutId !== undefined) { if (spec.loadoutId && !E.loadout(state, spec.loadoutId)) return { ok: false, reason: 'That loadout is gone.', plan: Object.assign({}, plan) }; plan.loadoutId = spec.loadoutId || null; }
    return { ok: true, reason: '', plan: Object.assign({}, plan) };
  };
  E.raidPlan = function (state) {
    const plan = state.raid.plan || {}; const l = plan.loadoutId ? E.loadout(state, plan.loadoutId) : null;
    const slots = cleanSlots(state, l ? l.slots : state.equipped);
    return { role: RAID_ROLE_IDS.includes(plan.role) ? plan.role : bestRole(state, slots), roleChosen: !!plan.role, loadoutId: l ? l.id : null, slots };
  };
  function healOfAny(id, gr) { const it = item(id); return it ? Math.max(0, Math.round(num(it.heal, 0) * gradeMult(Math.max(0, gr)))) : 0; }
  function pouchHealTotal(state) { const p = state.raid.pouch || {}; let h = 0; Object.keys(p).forEach((id) => p[id].forEach((q, g) => { h += q * healOfAny(id, g); })); return h; }
  E.pouch = function (state) {
    const p = state.raid.pouch || {}; let food = 0, potions = 0;
    const items = Object.keys(p).filter((id) => invCount(p, id) > 0).map((id) => {
      const it = item(id) || {}; const total = invCount(p, id);
      if (it.kind === 'food') food += total; else potions += total;
      return { itemId: id, grades: p[id].slice(), total, heal: healOfAny(id, 1), kind: it.kind, buff: it.buff || null };
    });
    return { items, food, potions, units: food + potions, cap: num(cfg().pouchCap, 60), totalHeal: pouchHealTotal(state), locked: lockedNow(state) || raidDoneThisWeek(state) };
  };
  E.packPouch = function (state, itemId, qty, grade) {
    if (lockedNow(state)) return { ok: false, reason: 'The pouch is sealed once you lock in.', moved: 0 };
    const it = item(itemId); if (!it || (it.kind !== 'food' && it.kind !== 'potion')) return { ok: false, reason: 'Only food and potions go in the raid pouch.', moved: 0 };
    qty = Math.floor(num(qty, 0)); if (qty < 1) return { ok: false, reason: 'Pack at least 1.', moved: 0 };
    const room = num(cfg().pouchCap, 60) - sumInv(state.raid.pouch);
    if (room <= 0) return { ok: false, reason: `The pouch holds ${num(cfg().pouchCap, 60)} items.`, moved: 0 };
    qty = Math.min(qty, room);
    const order = grade != null ? [clamp(Math.floor(grade), 0, 4)] : BEST;
    const taken = invTake(state.inv, itemId, qty, order, 0);
    const moved = taken.reduce((a, t) => a + t.qty, 0);
    if (!moved) return { ok: false, reason: `You have no ${lcFirst(it.name)}${grade != null ? ' of that grade' : ''}.`, moved: 0 };
    taken.forEach((t) => invAdd(state.raid.pouch, itemId, t.grade, t.qty));
    return { ok: true, reason: '', moved };
  };
  E.unpackPouch = function (state, itemId, qty) {
    if (lockedNow(state)) return { ok: false, reason: 'The pouch is sealed once you lock in.', moved: 0 };
    qty = Math.floor(num(qty, invCount(state.raid.pouch, itemId)));
    const taken = invTake(state.raid.pouch, itemId, qty, WORST, 0);
    taken.forEach((t) => addItem(state, itemId, t.grade, t.qty));
    return { ok: true, reason: '', moved: taken.reduce((a, t) => a + t.qty, 0) };
  };
  E.autoPackPouch = function (state) {
    if (lockedNow(state)) return { ok: false, reason: 'The pouch is sealed once you lock in.', moved: 0 };
    let moved = 0;
    ['atk', 'def', 'heal'].forEach((stat) => { // one buff potion per stat
      if (Object.keys(state.raid.pouch).some((id) => item(id) && item(id).buff && item(id).buff.stat === stat)) return;
      const best = ownedOfKind(state, 'potion').filter((id) => item(id).buff && item(id).buff.stat === stat).sort((a, b) => item(b).buff.pct - item(a).buff.pct)[0];
      if (best) moved += E.packPouch(state, best, 1).moved;
    });
    const healers = Object.keys(state.inv).filter((id) => item(id) && (item(id).kind === 'food' || item(id).kind === 'potion') && num(item(id).heal, 0) > 0)
      .sort((a, b) => num(item(b).heal, 0) - num(item(a).heal, 0));
    for (const id of healers) { const room = num(cfg().pouchCap, 60) - sumInv(state.raid.pouch); if (room <= 0 || sumInv(state.raid.pouch) >= 30) break; moved += E.packPouch(state, id, Math.min(room, 30 - sumInv(state.raid.pouch))).moved; }
    return { ok: true, reason: moved ? '' : 'Nothing to pack.', moved };
  };
  function lockWarnings(state, lock) {
    const w = []; const rc = E.roleCheck(state, lock.role, lock.slots);
    if (!rc.ok) w.push(rc.reason);
    if (rc.missing.length) w.push('Uses items you no longer own: ' + rc.missing.join(', ') + '.');
    const pw = E.pouch(state);
    if (lock.role !== 'supply' && pw.food + pw.potions === 0) w.push('Your pouch is empty: you will faint as soon as your HP runs out.');
    else if (lock.role === 'supply' && pw.units === 0) w.push('Supply line carries your pouch. Pack food or potions to contribute.');
    const low = SLOTS.map((s) => findGear(state, lock.slots[s])).filter((g) => g && g.dur / Math.max(1, g.maxDur) < 0.25);
    if (low.length) w.push('Low durability: ' + low.map((g) => E.gearName(g)).join(', ') + '.');
    if (!findGear(state, lock.slots.weapon) && lock.role !== 'supply') w.push('No weapon in this loadout.');
    return w;
  }
  function makeLock(state, auto) {
    const plan = E.raidPlan(state);
    return { week: state.week, lockedAt: nowOf(state), auto: !!auto, role: plan.role, loadoutId: plan.loadoutId, slots: plan.slots,
      rules: normRules(state, state.raid.rules), pouch: clone(state.raid.pouch || {}) };
  }
  E.lockIn = function (state) {
    if (raidDoneThisWeek(state)) return { ok: false, reason: 'This week\'s raid has been fought.', warnings: [] };
    if (lockedNow(state)) return { ok: true, reason: '', lock: state.raid.lock, warnings: lockWarnings(state, state.raid.lock) };
    const lock = makeLock(state, false); state.raid.lock = lock;
    E.log(state, 'raid', `Locked in as ${roleDef(lock.role).name} for week ${state.week}.`);
    return { ok: true, reason: '', lock, warnings: lockWarnings(state, lock) };
  };
  E.unlock = function (state) {
    if (raidDoneThisWeek(state) || E.isRaidWindow(state)) return { ok: false, reason: 'No changes once the raid has started.' };
    state.raid.lock = null; return { ok: true, reason: '' };
  };
  function autoLock(state, events) {
    if (lockedNow(state)) return;
    if (sumInv(state.raid.pouch) === 0) E.autoPackPouch(state);
    state.raid.lock = makeLock(state, true);
    events.push({ type: 'raidLocked', auto: true });
    E.log(state, 'raid', `Auto-locked as ${roleDef(state.raid.lock.role).name} at raid start.`);
  }
  E.tierThresholds = function (state) {
    const rec = curRecord(state); const pop = Math.max(1, num(rec && rec.pop, avgPop(state)));
    const fair = 1 / pop; const ts = cfg().tierShares || { bronze: 0.5, silver: 1, gold: 2 }; const tk = cfg().tierTickets || { floor: 1, bronze: 2, silver: 4, gold: 8 };
    const drops = { bronze: '+1 boss material', silver: '+2 boss materials, a buff potion', gold: '+3 boss materials, a catalyst' };
    const pctText = (x) => { const p = x * 100; return (p < 0.1 ? p.toFixed(3) : p.toFixed(2)) + '%'; };
    return { fairShare: fair, pop, basis: 'Your share of the phase checks you helped fill this weekend',
      floor: { tickets: num(tk.floor, 1), drops: 'Boss materials + 1 core ticket' },
      list: ['bronze', 'silver', 'gold'].map((t) => ({ tier: t, share: num(ts[t], 1) * fair, label: TIER_NAME[t], pctText: pctText(num(ts[t], 1) * fair), tickets: num(tk[t], 0), drops: drops[t] })) };
  };
  function tierFor(state, share) { const th = E.tierThresholds(state).list; let t = 'none'; th.forEach((x) => { if (share >= x.share - 1e-12) t = x.tier; }); return t; }

  // ================================================================ v4: fight simulation (pure)
  function crewAttending(state, rng) {
    return arr(state.crew && state.crew.members).filter((m) => rng() < num(m.attend, 0.85)).map((m) => ({ id: m.id, role: m.role, pf: clamp(num(m.pf, 1) * (0.92 + rng() * 0.16), 0.3, 3), food: num(m.food, 5), potions: num(m.potions, 1) }));
  }
  function npcAuras(state, rng) {
    const guilds = arr(D().npcGuilds).filter((g) => g && g.name);
    return shuffleWith(guilds, rng).slice(0, Math.min(guilds.length, 3 + Math.floor(rng() * 2))).map((g) => ({ guild: g.name, type: CHECKS.includes(g.aura) ? g.aura : 'damage', tier: 1 + Math.floor(rng() * 3), mine: false }));
  }
  function shuffleWith(list, rng) { const l = list.slice(); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; }
  function auraTotals(list) {
    const st = cfg().auraStrength || [0, 0.04, 0.08, 0.12]; const out = { mitigation: 0, healing: 0, damage: 0 };
    CHECKS.forEach((type) => { list.filter((a) => a.type === type && a.tier > 0).map((a) => num(st[a.tier], 0)).sort((a, b) => b - a).forEach((s, i) => { out[type] += s * Math.pow(0.5, i); }); });
    return out;
  }
  function crewAuraType(roles) {
    const n = { guardian: 0, mender: 0, striker: 0 }; roles.forEach((r) => { if (n[r] != null) n[r]++; });
    const top = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
    return ROLE_CHECK[top];
  }
  const auraTierFor = (n) => arr(cfg().auraTierAttendance).length ? cfg().auraTierAttendance.filter((x) => n >= x).length : (n >= 20 ? 3 : n >= 12 ? 2 : n >= 6 ? 1 : 0);

  // ctx: { boss, rec, rng, joined, role, slots, rules, pouch (copy), state }
  function simulateFight(state, ctx) {
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
    const takeOne = (id, prefer) => { const t = invTake(pouch, id, 1, prefer || WORST, 0); return t.length ? t[0].grade : -1; };
    if (role && role !== 'supply') {
      ['atk', 'def', 'heal'].forEach((stat) => {
        let best = null;
        Object.keys(pouch).forEach((id) => { const b = (item(id) || {}).buff; if (b && b.stat === stat && num(b.pct, 0) > 0 && invCount(pouch, id) > 0 && (!best || b.pct > best.pct)) best = { id, pct: b.pct }; });
        if (best) { takeOne(best.id, BEST); potionsUsed[best.id] = (potionsUsed[best.id] || 0) + 1; buffs[stat] = clamp(best.pct, 0, 1); events0.push({ kind: 'eat', value: 0, text: `${item(best.id).name}: +${Math.round(best.pct * 100)}% ${stat}` }); }
      });
    }
    const crew = ctx.crew; const crewDown = crew.map(() => 0);
    let crewFood = crew.reduce((a, m) => a + m.food, 0) + num(ctx.vaultFood, 0), crewFoodAcc = 0, foodOutWave = null, foodOutFrame = null, crewFoodShort = 0;
    const crewPotions = crew.reduce((a, m) => a + m.potions, 0) + num(ctx.vaultPotions, 0);
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
    const pressure = 0.07 * clamp(fair / Math.max(5, pw.guardian * 0.5 + Math.max(pw.striker, pw.mender, pw.guardian) * 0.5), 0.4, 3);
    const mitigFrac = clamp(ps.def / (ps.def + fair * 1.5 + 10) * endure * (stance === 'defensive' ? 1.2 : 1), 0, 0.7);
    const resist = clamp(num(ps.elements[boss.hits], 0) * 0.02, 0, 0.2);
    // supply line: delivers the pouch evenly across the fight
    const pouchStart = sumInv(pouch); const supplyUnits = role === 'supply' ? pouchStart : 0; let supplyAcc = 0, supplyDelivered = 0;
    let hp = ctx.joined ? clamp(num(ctx.startHp, maxHp), 1, maxHp) : 0; let down = 0;
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
    for (let i = 0; i < N; i++) {
      const check = phases[phase].check; const ev = i === 0 ? events0.slice() : [];
      if (pf === 0) ev.push({ kind: 'phase', text: `Phase ${phase + 1}: ${phases[phase].name}` });
      const over = pf >= nominal; const spike = over && check !== 'damage' ? 1.6 : 1;
      // crew
      let downNow = 0; const crewOut = { damage: 0, healing: 0, mitigation: 0 };
      crew.forEach((m, k) => {
        if (crewDown[k] > 0) { crewDown[k]--; downNow++; return; }
        const weak = clamp(1 / m.pf, 0.6, 2.5);
        crewFoodAcc += 0.1 * weak * spike;
        while (crewFoodAcc >= 1) { crewFoodAcc -= 1; if (crewFood > 0) crewFood--; else { crewFoodShort++; if (foodOutWave == null) { foodOutWave = wave; foodOutFrame = i; } } }
        const pFaint = 0.015 * weak * weak * spike * (crewFood > 0 ? 1 : 2.5);
        if (rng() < pFaint) { crewDown[k] = num(c.faintFrames, 3); downNow++; return; }
        CHECKS.forEach((ck) => { crewOut[ck] += m.pf * fair * (ROLE_CHECK[m.role] === ck ? 1 : OFF_ROLE); });
      });
      maxCrewDown = Math.max(maxCrewDown, downNow);
      const myTier = auraTierFor(attendCount - downNow - (down > 0 ? 1 : 0));
      waveAuraMin = Math.min(waveAuraMin, myTier); waveDownMax = Math.max(waveDownMax, downNow + (down > 0 ? 1 : 0)); if (myTier < startTier) { waveWeakFrames++; waveLossSum += num((cfg().auraStrength || [])[startTier], 0) - num((cfg().auraStrength || [])[myTier], 0); }
      const auraList = npc.concat(myAuraType ? [{ guild: crewName, type: myAuraType, tier: myTier, mine: true }] : []);
      const aura = auraTotals(auraList);
      CHECKS.forEach((ck) => { crewOut[ck] *= 1 + aura[ck]; crewTot[ck] += crewOut[ck]; });
      // player
      const out = { damage: 0, healing: 0, mitigation: 0 };
      let taken = 0, crit = false;
      if (ctx.joined && role !== 'supply') {
        if (down > 0) {
          down--;
          if (down === 0) {
            const fid = Object.keys(pouch).find((id) => item(id) && item(id).kind === 'food' && invCount(pouch, id) > 0);
            if (fid) { takeOne(fid); eaten[fid] = (eaten[fid] || 0) + 1; reviveFood++; hp = Math.round(maxHp * 0.6); } else { hp = Math.round(maxHp * 0.35); }
            ev.push({ kind: 'heal', value: hp, text: 'Back from camp' });
            moments.push({ frame: i, kind: 'revive', text: 'Back on your feet after camp', value: hp, score: 1 });
          }
        } else {
          if (hp < rules.eatAt * maxHp) {
            const ch = chooseHeal(rules.eatAt * maxHp - hp);
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
          hp = Math.min(maxHp, hp - taken + (pw.mender * 0.05 + maxHp * 0.01) * (1 + aura.healing));
          if (hp <= 0) { hp = 0; faints++; down = num(c.faintFrames, 3); ev.push({ kind: 'faint', text: 'You faint!' }); moments.push({ frame: i, kind: 'faint', text: 'Fainted and carried to camp', value: 0, score: 0.2 }); }
        }
      } else if (role === 'supply') {
        supplyAcc += supplyUnits / N;
        while (supplyAcc >= 1) {
          supplyAcc -= 1;
          const id = Object.keys(pouch).find((x) => invCount(pouch, x) > 0); if (!id) break;
          const g = takeOne(id, BEST); const h = Math.max(4, healOfAny(id, g));
          out.healing += h; // credited to whatever check is running
          crewFood += item(id).kind === 'food' ? 1 : 0;
          supplyDelivered++;
          ev.push({ kind: 'heal', value: Math.round(h), text: 'Supplies delivered' });
        }
      }
      pDmg += out.damage; pHeal += out.healing; pMit += out.mitigation;
      const yours = role === 'supply' ? out.healing : out[check];
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
        const w = { wave, phase, phaseName: phases[phase].name, check, label: CHECK_LABEL[check], result: ended, overtime: Math.max(0, pf - nominal), frames: pf,
          your: yourFill, total: fill, need, crewHave: crewFill, crewNeed: crewNeedAcc, points: 100 * frac, yourPoints: 100 * frac * (yourFill / Math.max(1e-9, fill)) };
        w.yourShare = yourFill / Math.max(1e-9, fill);
        const stArr = cfg().auraStrength || [0, 0.04, 0.08, 0.12];
        w.auraTier = startTier; w.auraTierMin = Math.min(startTier, waveAuraMin); w.fainted = waveDownMax; w.auraWeakFrames = waveWeakFrames;
        w.auraWeakened = waveWeakFrames >= Math.ceil(pf / 3); // weakened for at least a third of the wave
        w.auraLoss = Math.round(waveLossSum / Math.max(1, pf) * 1000) / 1000; // average aura strength lost to faints over the wave
        void stArr;
        w.yourText = 'you filled ' + (w.yourShare * 100 < 0.1 ? (w.yourShare * 100).toFixed(3) : (w.yourShare * 100).toFixed(2)) + '%';
        waves.push(w);
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
        auras: auraList.filter((a) => a.tier > 0).map((a) => ({ guild: a.guild, aura: a.type, tier: a.tier, mine: a.mine })), crewDown: downNow, auraTier: myTier, events: ev, taken: Math.round(taken) });
      if (killedAt >= 0) break;
    }
    timeline.forEach((f, k) => { f.t = timeline.length > 1 ? k / (timeline.length - 1) : 1; });
    moments.forEach((m) => { m.t = timeline.length > 1 ? m.frame / (timeline.length - 1) : 1; });
    const weekPoints = waves.reduce((a, w) => a + w.yourPoints, 0), weekTotal = waves.reduce((a, w) => a + w.points, 0);
    return { boss, participants, N, frames: timeline.length, waves, timeline, moments, faints, reviveFood, eaten, potionsUsed, pouchLeft: sumInv(pouch), pouchStart, supplyDelivered, pouch,
      hpBefore, hpAfter: bossHp, killed: bossHp <= 0, killedAt, cpHit, weekPoints, weekTotal, endHp: hp, maxHp, attendCount, crewCount: crew.length,
      crewFoodStart: crew.reduce((a, m) => a + m.food, 0) + num(ctx.vaultFood, 0), crewFoodLeft: crewFood, foodOutWave, foodOutFrame, crewFoodShort, crewPotions, auraWeakenedWave, maxCrewDown,
      auras: npc.concat(myAuraType ? [{ guild: crewName, type: myAuraType, tier: startTier, mine: true }] : []), myAuraType, startTier,
      totals: { damage: pDmg, healing: pHeal, mitigation: pMit }, crewTot, powers: pw, role, fair };
  }
  function fightCtx(state, lock, rng, joined) {
    const rec = curRecord(state);
    const vault = (state.crew && state.crew.vault && state.crew.vault.inv) || {};
    let vf = 0, vp = 0; Object.keys(vault).forEach((id) => { const it = item(id); if (!it) return; if (it.kind === 'food') vf += invCount(vault, id); if (it.kind === 'potion') vp += invCount(vault, id); });
    return { boss: E.currentBoss(state), rec: Object.assign({}, rec, { checkpointsPaid: rec.checkpointsPaid.slice() }), rng, joined: joined !== false, role: lock ? lock.role : 'supply',
      slots: lock ? lock.slots : state.equipped, rules: lock ? lock.rules : normRules(state, state.raid.rules), pouch: clone(state.raid.pouch || {}),
      crew: crewAttending(state, rng), npcAuras: npcAuras(state, rng), vaultFood: vf, vaultPotions: vp, startHp: statsFor(state, lock ? lock.slots : state.equipped).maxHp };
  }
  let projCache = { key: '', val: null };
  E.projectRaid = function (state) {
    const plan = E.raidPlan(state); const lock = lockedNow(state) ? state.raid.lock : Object.assign(makeLock(state, false), { role: plan.role, slots: plan.slots });
    const rec = curRecord(state);
    const key = JSON.stringify([state.week, state.raid.ladder, rec.hpLeft, lock.role, lock.slots, lock.rules, state.raid.pouch, SLOTS.map((s) => { const g = findGear(state, lock.slots[s]); return g ? g.dur > 0 : 0; })]);
    if (projCache.key === key) return projCache.val;
    const sim = simulateFight(state, Object.assign(fightCtx(state, lock, mulberry(state.week * 7919 + 17), true), { rec: Object.assign({}, rec, { hpLeft: rec.maxHp * 10, checkpointsPaid: [0.25, 0.5, 0.75] }) }));
    const perCheck = {}; CHECKS.forEach((ck) => { const ws = sim.waves.filter((w) => w.check === ck); perCheck[ck] = ws.length ? ws.reduce((a, w) => a + w.yourShare, 0) / ws.length : 0; });
    const share = sim.weekPoints / Math.max(1e-9, sim.weekTotal);
    const outputs = {}; CHECKS.forEach((ck) => { outputs[ck] = Math.round(sim.totals[ck] / Math.max(1, sim.frames) * 6); });
    const foodEst = Object.values(sim.eaten).reduce((a, b) => a + b, 0) + Object.values(sim.potionsUsed).reduce((a, b) => a + b, 0);
    const val = { weekShare: share, tier: tierFor(state, share), perCheck, foodEst, faintsEst: sim.faints, outputs, role: lock.role };
    projCache = { key, val };
    return val;
  };

  // ================================================================ v4: payouts + resolution
  function pickLootItem(state, b, kind) {
    const tier = clamp(1 + Math.floor(num(b.reqPower, 30) / 30), 1, 5);
    if (kind === 'buff') { const l = Object.keys(itemsMap()).filter((id) => item(id).kind === 'potion' && item(id).buff && num(item(id).tier, 1) <= tier + 1); return l.length ? l[Math.floor(rand() * l.length)] : null; }
    if (kind === 'catalyst') { const l = Object.keys(itemsMap()).filter((id) => item(id).kind === 'catalyst' && num(item(id).tier, 1) <= Math.max(2, tier)); return l.length ? l.sort((a, c) => item(c).tier - item(a).tier)[0] : null; }
    return null;
  }
  function grant(state, list, itemId, grade, qty) { if (!item(itemId) || !(qty > 0)) return; addItem(state, itemId, grade, qty); list.push({ itemId, grade, qty }); }
  function mergeItems(lists) { const m = {}; lists.forEach((l) => l.forEach((x) => { const k = x.itemId + ':' + x.grade; m[k] = m[k] ? Object.assign({}, m[k], { qty: m[k].qty + x.qty }) : Object.assign({}, x); })); return Object.values(m); }
  function guildBoards(state, sim, rng) {
    const fair = sim.fair; const frames = sim.frames;
    const rows = arr(D().npcGuilds).filter((g) => g && g.name).map((g) => {
      const roster = 15 + Math.floor(rng() * 46); const att = Math.max(3, Math.round(roster * (0.55 + rng() * 0.4))); const pf = 0.7 + rng() * 0.6;
      const t = {}; CHECKS.forEach((ck) => { t[ck] = att * fair * ROLE_MIX * frames * pf * (g.aura === ck ? 1.35 : 0.85) * (0.85 + rng() * 0.3); });
      return { guild: g.name, members: att, roster, t, mine: false };
    });
    const mineT = {}; CHECKS.forEach((ck) => { mineT[ck] = sim.crewTot[ck] + sim.totals[ck]; });
    rows.push({ guild: (state.crew && state.crew.name) || 'Your crew', members: sim.attendCount, roster: arr(state.crew && state.crew.members).length + 1, t: mineT, mine: true });
    const board = (val, avg) => ({ totals: rows.map((r) => ({ guild: r.guild, value: Math.round(val(r)), members: r.members, avg: Math.round(avg(r) * 100) / 100, mine: r.mine })).sort((a, b) => b.value - a.value),
      averages: rows.map((r) => ({ guild: r.guild, value: Math.round(avg(r) * 100) / 100, members: r.members, avg: Math.round(avg(r) * 100) / 100, mine: r.mine })).sort((a, b) => b.value - a.value) });
    const out = {};
    CHECKS.forEach((ck) => { out[ck] = board((r) => r.t[ck], (r) => r.t[ck] / Math.max(1, r.members)); });
    out.attendance = board((r) => r.members, (r) => r.members / Math.max(1, r.roster));
    return out;
  }
  function gapItem(state, check) {
    const idx = clamp(Math.floor(num(state.raid.ladder, 0)), 0, 5);
    const pickTier = (list) => list[Math.min(list.length - 1, idx)];
    if (check === 'food') return pickTier(['bread', 'herb_trout', 'bloodmoss_broth', 'salmon_pie', 'frostcap_salmon', 'angler_feast']);
    if (check === 'damage') return 'fury_draught';
    if (check === 'mitigation') return pickTier(['ironskin_draught', 'ironskin_draught', 'ironskin_draught', 'frostward_tonic', 'frostward_tonic', 'rimeheart_draught']);
    return pickTier(['mint_tonic', 'wisplight_salve', 'restoring_elixir', 'restoring_elixir', 'sunpetal_elixir', 'sunpetal_elixir']);
  }
  function gapDraft(state, gap) {
    const itemId = gapItem(state, gap.check); const it = item(itemId) || { name: itemId };
    const qty = clamp(Math.ceil(num(gap.shortUnits, 20)), 10, 40);
    const rewardPer = Math.max(1, Math.round(E.itemValue(itemId, 1) * 0.4));
    const coin = Math.floor(num(state.crew && state.crew.treasury && state.crew.treasury.coin, 0));
    const escrow = qty * rewardPer;
    return { itemId, qty, rewardPer, minGrade: 1, note: `${gap.text}. Saturday raid needs ${qty} ${it.name}.`,
      escrow, freeCoin: coin, affordable: escrow <= coin, maxRewardPer: Math.floor(coin / qty) };
  }
  function buildDebrief(state, sim) {
    const gaps = []; const fine = [];
    CHECKS.forEach((ck) => {
      const ws = sim.waves.filter((w) => w.check === ck && w.result !== 'unfinished');
      const bad = ws.find((w) => w.crewHave < w.crewNeed * 0.9);
      if (bad) {
        const pct = bad.crewHave / Math.max(1, bad.crewNeed);
        const text = ck === 'healing' ? `Healing ran dry by wave ${bad.wave}` : ck === 'mitigation' ? `Mitigation cracked in wave ${bad.wave}` : `Damage fell short in wave ${bad.wave}`;
        gaps.push({ id: 'gap_' + ck, check: ck, label: CHECK_LABEL[ck], text, wave: bad.wave, have: Math.round(bad.crewHave), need: Math.round(bad.crewNeed), pct, shortUnits: 10 + (1 - pct) * 60 });
      } else fine.push(CHECK_LABEL[ck]);
    });
    // food: a gap only if it ran out with at least 15% of the fight still to go; pct = share of the fight the crew stayed fed
    const fedFrac = sim.foodOutFrame == null ? 1 : sim.foodOutFrame / Math.max(1, sim.frames);
    if (fedFrac < 0.85) gaps.push({ id: 'gap_food', check: 'food', label: 'Food', text: `Food ran out in wave ${sim.foodOutWave}`, wave: sim.foodOutWave, have: sim.crewFoodStart, need: sim.crewFoodStart + Math.ceil(sim.crewFoodShort), pct: fedFrac, shortUnits: Math.max(sim.attendCount * 2, sim.crewFoodShort) });
    else fine.push('Food');
    const potNeed = sim.attendCount * 2;
    if (sim.crewPotions < potNeed * 0.85) gaps.push({ id: 'gap_consumables', check: 'consumables', label: 'Consumables', text: `Potions ran short (${sim.crewPotions} of ${potNeed})`, wave: null, have: sim.crewPotions, need: potNeed, pct: sim.crewPotions / Math.max(1, potNeed), shortUnits: potNeed - sim.crewPotions });
    else fine.push('Consumables');
    gaps.forEach((g) => { g.suggestion = gapDraft(state, g); delete g.shortUnits; });
    const gapIds = new Set(gaps.map((g) => g.check));
    const checks = ['mitigation', 'healing', 'damage', 'food', 'consumables'].map((id) => {
      const g = gaps.find((x) => x.check === id);
      return { id, label: CHECK_LABEL[id], state: gapIds.has(id) ? 'gap' : 'held', pct: g ? g.pct : 1, gapId: g ? g.id : null };
    });
    return { gaps, fine: checks.filter((x) => x.state === 'held').map((x) => x.label), checks };
  }
  function resolveRaid(state, opts, events) {
    opts = opts || {}; events = events || [];
    const boss = E.currentBoss(state); if (!boss) return null;
    const rec = curRecord(state); const c = cfg();
    const joined = opts.absent !== true;
    if (joined) autoLock(state, events);
    const lock = joined ? state.raid.lock : null;
    const sim = simulateFight(state, fightCtx(state, lock, rand, joined));
    const win = windowFor(state, weekStartOf(state, state.week)); const chargeMs = num(c.raidChargeHours, 10) * 3600000;
    const startedAt = clamp(num(opts.startedAt, nowOf(state)), win.start, Math.max(win.start, win.end - chargeMs)); // always inside the window
    const frameMs = chargeMs / Math.max(1, Math.round(num(c.raidChargeHours, 10) * 6));
    // apply consumption + wear
    if (joined) {
      state.raid.pouch = sim.pouch;
      const wear = lock.role === 'supply' ? 2 : 6 + num(c.reviveDurability, 2) * sim.faints;
      SLOTS.forEach((s) => { const g = findGear(state, lock.slots[s]); if (g && g.dur > 0) { g.dur = Math.max(0, Math.round((g.dur - wear) * 100) / 100); if (g.dur <= 0) E.log(state, 'warn', `Your ${E.gearName(g)} broke in the raid.`); } });
      const mx = E.playerStats(state).maxHp; state.hp = Math.max(1, Math.round(sim.endHp > 0 ? Math.min(mx, sim.endHp) : mx * 0.3));
    }
    const tokens = joined ? clamp(num(lock.rules.tokens, 0), 0, num(state.tokens, 0)) : 0;
    state.tokens = Math.max(0, num(state.tokens, 0) - tokens);
    const hpBefore = rec.hpLeft;
    rec.hpLeft = Math.max(0, Math.round(sim.hpAfter)); rec.weekends++;
    if (joined) { rec.joinedWeekends++; rec.tokens += tokens; }
    rec.myPoints += joined ? sim.weekPoints : 0; rec.totalPoints += sim.weekTotal;
    const weekShare = joined ? sim.weekPoints / Math.max(1e-9, sim.weekTotal) : 0;
    const share = rec.myPoints / Math.max(1e-9, rec.totalPoints);
    const tierWeek = joined ? tierFor(state, weekShare) : 'none'; const cumTier = rec.joinedWeekends ? tierFor(state, share) : 'none';
    const tier = joined ? cumTier : 'none'; // one rule: tier (drops + core tickets) comes from the share carried over for this boss
    // payouts
    const tiersSnap = E.tierThresholds(state);
    const floorItems = [], tierItems = [], chests = [];
    if (joined) {
      grant(state, floorItems, boss.floorItem || 'coal', 1, randInt(2, 4));
      if (rand() < 0.5) grant(state, floorItems, boss.bossMat, 2, 1);
      const nMat = { none: 0, bronze: 1, silver: 2, gold: 3 }[tier];
      if (nMat) grant(state, tierItems, boss.bossMat, 2, nMat);
      if (tier === 'silver') grant(state, tierItems, pickLootItem(state, boss, 'buff'), 2, 1);
      if (tier === 'gold') grant(state, tierItems, pickLootItem(state, boss, 'catalyst'), 2, 1);
      sim.cpHit.forEach((at) => { const ci = []; grant(state, ci, boss.bossMat, 2, 1); grant(state, ci, boss.floorItem || 'coal', 1, randInt(3, 6)); grant(state, ci, pickLootItem(state, boss, 'buff'), 1, 1); chests.push({ at, items: ci }); });
    }
    sim.cpHit.forEach((at) => { if (!rec.checkpointsPaid.includes(at)) rec.checkpointsPaid.push(at); });
    // crew treasury coin by turnout (never by contribution)
    const btier = num(rec.index, 0) + 1;
    const crewCoin = Math.min(num(c.crewCoinCap, 180) * btier, num(c.crewCoinPerAttendee, 10) * btier * sim.attendCount);
    if (state.crew && state.crew.treasury) {
      state.crew.treasury.coin += crewCoin;
      feedPush(state, 'payout', 'Raid', `Raid payout: ${crewCoin} coin to the treasury (${sim.attendCount} turned out).`);
      econ(state, 'raidCoin', crewCoin);
    }
    // kill: lottery, ladder, buff
    const held = rec.joinedWeekends > 0 ? coreOddsFor(state, rec, boss, cumTier) : null;
    let cores = { drawn: false, tickets: held ? held.tickets : 0, breakdown: held ? held.breakdown : { floor: 0, tier: 0, tokens: 0 }, tier, tokens: rec.tokens, won: 0, coreItemId: boss.coreItem || null, chance: 0, pityBefore: num(state.raid.corePity, 0), pityAfter: num(state.raid.corePity, 0) };
    let weekBuff = null;
    const won = sim.killed;
    if (won) {
      rec.killedWeek = state.week;
      if (rec.joinedWeekends > 0) {
        const odds = coreOddsFor(state, rec, boss, cumTier);
        const win = odds.guaranteed || rand() < odds.chance;
        cores = Object.assign(cores, { drawn: true, tickets: odds.tickets, chance: odds.chance, won: win ? 1 : 0 });
        if (win) { addItem(state, boss.coreItem, 3, 1); state.raid.corePity = 0; state.raid.coresWon = num(state.raid.coresWon, 0) + 1; }
        else state.raid.corePity = num(state.raid.corePity, 0) + 1;
        cores.pityAfter = state.raid.corePity;
      }
      const buffs = arr(c.weekBuffs).length ? c.weekBuffs : [{ kind: 'repair', value: 0.3, label: 'Repairs 30% cheaper' }];
      const bf = buffs[Math.floor(rand() * buffs.length)];
      weekBuff = { kind: bf.kind, value: bf.value, label: bf.label, week: state.week + 1 };
      state.server.pendingBuff = weekBuff;
      // ladder unlock (next boss revealed Monday)
      if (num(state.raid.ladder, 0) + 1 >= bosses().length) {
        state.raid.season = num(state.raid.season, 1) + 1; state.raid.ladder = 0; state.raid.bosses = {};
        E.log(state, 'raid', `The ladder is cleared! Season ${state.raid.season} begins with stronger bosses.`);
      } else state.raid.ladder = num(state.raid.ladder, 0) + 1;
      const nr = ensureRecord(state, state.raid.ladder, state.week); nr.revealedWeek = null; state.raid.bossHp = nr.hpLeft;
    } else state.raid.bossHp = rec.hpLeft;
    const rng2 = mulberry(Math.floor(rand() * 1e9));
    const boards = guildBoards(state, sim, rng2);
    const debrief = buildDebrief(state, sim);
    const moments = sim.moments.slice().sort((a, b) => b.score - a.score).slice(0, 5).sort((a, b) => a.frame - b.frame).map((m) => ({ frame: m.frame, t: m.t, at: startedAt + m.frame * frameMs, kind: m.kind, text: m.text, value: m.value }));
    const best = sim.moments.slice().sort((a, b) => b.score - a.score)[0];
    sim.timeline.forEach((f, k) => { f.at = startedAt + k * frameMs; });
    const foodTotal = Object.values(sim.eaten).reduce((a, b) => a + b, 0);
    const recap = {
      id: nextId(state, 'R'), week: state.week, season: num(state.raid.season, 1), bossId: boss.id, bossName: boss.name, ladderIndex: rec.index, joined, auto: !!(lock && lock.auto),
      role: joined ? lock.role : null, roleName: joined ? roleDef(lock.role).name : null, startedAt, won,
      bossMaxHp: rec.maxHp, hpBefore: Math.round(hpBefore), hpAfter: rec.hpLeft, hpPctBefore: hpBefore / rec.maxHp, hpPctAfter: rec.hpLeft / rec.maxHp, damageDealtPct: (hpBefore - rec.hpLeft) / rec.maxHp,
      tier, tierWeek, tierBasis: rec.joinedWeekends > 1 ? 'carried' : 'weekend', tierLabel: TIER_NAME[tier] + (rec.joinedWeekends > 1 ? ' (carried over)' : ''),
      contribution: { points: rec.myPoints, weekPoints: sim.weekPoints, totalPoints: rec.totalPoints, weekShare, share, fairShare: 1 / Math.max(1, rec.pop), cumulativeTier: cumTier, weekends: rec.joinedWeekends },
      foodEaten: { total: foodTotal, items: sim.eaten }, potionsUsed: sim.potionsUsed, pouchLeft: sim.pouchLeft, pouchStart: sim.pouchStart, supplyDelivered: sim.supplyDelivered, tiers: tiersSnap,
      faints: sim.faints, reviveCost: { food: sim.reviveFood, durability: sim.faints * num(c.reviveDurability, 2) },
      checks: sim.waves.map((w) => ({ wave: w.wave, phase: w.phase, phaseName: w.phaseName, check: w.check, label: w.label, result: w.result, overtime: w.overtime,
        yourShare: w.yourShare, yourText: w.yourText, your: Math.round(w.your), total: Math.round(w.total), need: Math.round(w.need), crewHave: Math.round(w.crewHave), crewNeed: Math.round(w.crewNeed), helped: w.your > 0,
        auraTier: w.auraTier, auraTierMin: w.auraTierMin, auraWeakened: w.auraWeakened, auraLoss: w.auraLoss, auraWeakFrames: w.auraWeakFrames, fainted: w.fainted })),
      payout: { floor: { items: floorItems, tickets: joined ? num((c.tierTickets || {}).floor, 1) : 0 }, tier: { tier, items: tierItems, tickets: joined ? num((c.tierTickets || {})[tier], 0) : 0 }, chests, crewCoin, coin: 0, items: mergeItems([floorItems, tierItems].concat(chests.map((x) => x.items))) },
      cores, weekBuff, auras: sim.auras.map((a) => ({ guild: a.guild, type: a.type, tier: a.tier, strength: num((cfg().auraStrength || [])[a.tier], 0), mine: a.mine })), auraWeakenedWave: sim.auraWeakenedWave,
      moments, bestMoment: best ? { frame: best.frame, t: best.t, at: startedAt + best.frame * frameMs, kind: best.kind, text: best.text, value: best.value } : null,
      windowStart: win.start, windowEnd: win.end, frameMs, instant: !!opts.instant,
      debrief, crew: { name: (state.crew && state.crew.name) || 'Your crew', roster: arr(state.crew && state.crew.members).length + 1, attended: sim.attendCount,
        totals: { damage: Math.round(sim.crewTot.damage + sim.totals.damage), healing: Math.round(sim.crewTot.healing + sim.totals.healing), mitigation: Math.round(sim.crewTot.mitigation + sim.totals.mitigation), food: sim.crewFoodStart, consumables: sim.crewPotions } },
      leaderboards: boards, timeline: sim.timeline, seen: false, frames: sim.frames, participants: sim.participants
    };
    state.raid.recaps = [recap].concat(arr(state.raid.recaps).map((r) => { const o = Object.assign({}, r); delete o.timeline; return o; })).slice(0, 6);
    state.raid.resolvedWeek = state.week;
    state.raid.current = { week: state.week, startedAt, recapId: recap.id, instant: !!opts.instant };
    // v3-shaped result for the old raid screen
    const lb = boards.damage.totals.slice(0, 8).map((r, i) => ({ name: r.guild, guild: r.guild, role: 'striker', value: r.value, rank: i + 1, you: r.mine }));
    if (!lb.some((r) => r.you)) { const mine = boards.damage.totals.findIndex((r) => r.mine); const r = boards.damage.totals[mine]; if (r) lb[7] = { name: r.guild, guild: r.guild, role: 'striker', value: r.value, rank: mine + 1, you: true }; }
    const eatenAll = Object.assign({}, sim.eaten); Object.keys(sim.potionsUsed).forEach((k) => { eatenAll[k] = (eatenAll[k] || 0) + sim.potionsUsed[k]; });
    const result = { won, bossHpBefore: Math.round(hpBefore), bossHpAfter: rec.hpLeft, damage: Math.round(sim.totals.damage), healing: Math.round(sim.totals.healing), mitigated: Math.round(sim.totals.mitigation),
      sharePct: weekShare, eaten: eatenAll, loot: recap.payout.items, gold: 0, tokensEarned: 0, leaderboard: lb, faints: sim.faints, tokensCommitted: tokens,
      checksPassed: sim.waves.filter((w) => w.result !== 'unfinished').map((w) => w.result === 'passed'), bossId: boss.id, bossName: boss.name, week: state.week, rules: joined ? Object.assign({}, lock.rules) : null, recapId: recap.id, tier };
    state.raid.last = clone(result);
    if (joined) E.log(state, 'raid', won ? `${boss.name} defeated! ${recap.tierLabel} (${(share * 100).toFixed(3)}% share). ${cores.won ? 'You won a core!' : `${cores.tickets} core tickets, no core this time.`}`
      : `Raid on ${boss.name}: ${recap.tierLabel} (${(share * 100).toFixed(3)}% share), ${foodTotal} food eaten${sim.faints ? `, fainted ${sim.faints}x` : ''}. Boss left at ${Math.ceil(rec.hpLeft / rec.maxHp * 100)}%.`);
    chests.forEach((ch) => E.log(state, 'raid', `Server chest (${Math.round(ch.at * 100)}% checkpoint): ${ch.items.map((x) => x.qty + ' ' + itemName(x.itemId)).join(', ')}.`));
    events.push({ type: 'raidResolved', recapId: recap.id, won });
    return { recap, result, timeline: sim.timeline };
  }
  function coreOddsFor(state, rec, boss, cumTier) {
    const tk = cfg().tierTickets || { floor: 1, bronze: 2, silver: 4, gold: 8 };
    const breakdown = { floor: rec.joinedWeekends > 0 ? num(tk.floor, 1) : 0, tier: num(tk[cumTier], 0), tokens: num(rec.tokens, 0) };
    const tickets = breakdown.floor + breakdown.tier + breakdown.tokens;
    const pity = num(state.raid.corePity, 0); const pityMax = num(cfg().corePityMax, 3);
    const parts = Math.round(num(state.server.pop, 1200) * num(cfg().serverTurnout, 0.85));
    const serverTickets = parts * (num(tk.floor, 1) + 2.6 + 0.8);
    const cores = num(boss.cores, 20);
    const eff = tickets * (1 + pity);
    const chance = tickets <= 0 ? 0 : pity >= pityMax ? 1 : clamp(1 - Math.pow(1 - eff / (serverTickets + eff), cores), 0, 1);
    return { tickets, breakdown, tier: cumTier, serverTickets: Math.round(serverTickets), cores, chance, pity, pityMax, guaranteed: tickets > 0 && pity >= pityMax, coreItemId: boss.coreItem || null };
  }
  E.coreOdds = function (state) {
    const boss = E.currentBoss(state); const rec = curRecord(state);
    const share = rec.myPoints / Math.max(1e-9, rec.totalPoints);
    const r = coreOddsFor(state, rec.joinedWeekends ? rec : Object.assign({}, rec, { joinedWeekends: 1 }), boss, rec.joinedWeekends ? tierFor(state, share) : 'none');
    return r;
  };
  E.lastRecap = (state) => arr(state.raid.recaps)[0] || null;
  E.recaps = (state) => arr(state.raid.recaps).slice();
  E.markRecapSeen = function (state, id) { const r = arr(state.raid.recaps).find((x) => x.id === (id || (E.lastRecap(state) || {}).id)); if (r) r.seen = true; return { ok: !!r, reason: r ? '' : 'No such recap.' }; };
  E.leaderboards = (state) => { const r = E.lastRecap(state); return r ? r.leaderboards : null; };
  E.weekBuff = (state) => { const b = state.server && state.server.weekBuff; return b && b.week === state.week ? b : null; };
  E.marketTax = function (state) { const b = E.weekBuff(state); const t = clamp(num(cfg().marketTax, 0.05), 0, 1); return b && b.kind === 'tax' ? Math.min(t, num(b.value, t)) : t; };

  // ================================================================ v4: weekly flow
  function weekRollover(state, events) {
    state.week = num(state.week, 1) + 1;
    const sv = state.server; const base = num(cfg().serverPop, 1200);
    sv.pop = Math.round(clamp(num(sv.pop, base) * (0.96 + rand() * 0.08), base * 0.8, base * 1.25));
    sv.popHistory = arr(sv.popHistory).concat([sv.pop]).slice(-4);
    sv.weekBuff = sv.pendingBuff && sv.pendingBuff.week === state.week ? sv.pendingBuff : null;
    if (sv.pendingBuff && sv.pendingBuff.week <= state.week) sv.pendingBuff = null;
    const rec = curRecord(state); const wasHidden = rec.revealedWeek == null; rec.revealedWeek = rec.revealedWeek == null ? state.week : rec.revealedWeek;
    state.raid.lock = null; state.raid.warned = { week: state.week, levels: [] };
    crewWeekly(state, events);
    generateSupply(state); E.refreshMarket(state);
    const boss = E.currentBoss(state);
    events.push({ type: 'weekStart', week: state.week, revealed: wasHidden ? boss.id : null });
    E.log(state, 'info', `Week ${state.week} begins. ${wasHidden ? `New boss revealed: ${boss.name}, weak to ${boss.weakTo}.` : `${boss.name} returns at ${Math.ceil(rec.hpLeft / rec.maxHp * 100)}% HP.`}${sv.weekBuff ? ' Server buff: ' + sv.weekBuff.label + '.' : ''}`);
  }
  function processClock(state, events) {
    ensureClock(state);
    const now = nowOf(state);
    for (let guard = 0; guard < 40; guard++) {
      const wk = weekNum(state, now);
      if (!raidDoneThisWeek(state)) {
        const w = windowFor(state, weekStartOf(state, state.week));
        if (now >= w.start) { resolveRaid(state, { startedAt: w.start, absent: wk - state.week > 2 }, events); continue; }
      }
      if (state.week < wk) { weekRollover(state, events); continue; }
      break;
    }
    // readiness warnings 24h / 2h before start
    const w = windowFor(state, now); const secTo = (w.start - now) / 1000;
    if (!raidDoneThisWeek(state) && secTo > 0 && secTo <= 86400) {
      const level = secTo <= 7200 ? '2h' : '24h';
      if (!state.raid.warned || state.raid.warned.week !== state.week) state.raid.warned = { week: state.week, levels: [] };
      if (!state.raid.warned.levels.includes(level)) {
        state.raid.warned.levels.push(level);
        const rf = E.readinessFlags(state);
        events.push({ type: 'raidWarn', level, reasons: rf.reasons });
        if (rf.reasons.length) E.log(state, 'warn', `Raid in ${level === '2h' ? '2 hours' : 'a day'}: ${rf.reasons.join(' ')}`);
      }
    }
  }
  E.devSetClock = function (state, to) {
    ensureClock(state); const events = []; const now = nowOf(state);
    let target = null;
    if (to === 'raid') { const w = windowFor(state, now); target = now < w.start ? w.start + 60000 : (now < w.end ? now : windowFor(state, addDays(mondayOf(now), 7)).start + 60000); }
    else if (to === 'nextWeek') target = addDays(mondayOf(now), 7) + 60000;
    else if (to === 'friday') { const f = new Date(addDays(mondayOf(now), 4)); f.setHours(12, 0, 0, 0); target = f.getTime() > now ? f.getTime() : addDays(f.getTime(), 7); }
    else if (to === 'reset') {
      const wkBefore = weekNum(state, now); state.clock.offsetMs = 0;
      const wkAfter = weekNum(state, nowOf(state)); state.clock.epoch = addDays(state.clock.epoch, -7 * (wkBefore - wkAfter));
      return { ok: true, reason: '', events };
    } else return { ok: false, reason: 'Unknown clock target.', events };
    state.clock.offsetMs = num(state.clock.offsetMs, 0) + (target - now);
    processClock(state, events);
    return { ok: true, reason: '', events };
  };
  E.startRaidNow = function (state) {
    if (!E.currentBoss(state)) return { ok: false, reason: 'No raid boss is scheduled in this build.' };
    const events = [];
    if (raidDoneThisWeek(state)) { E.devSetClock(state, 'nextWeek').events.forEach((e) => events.push(e)); processClock(state, events); }
    if (raidDoneThisWeek(state)) return { ok: false, reason: 'This week\'s raid already ran.', events };
    state.active = null;
    const r = resolveRaid(state, { startedAt: nowOf(state), instant: true }, events);
    return { ok: true, reason: '', recap: r.recap, timeline: r.timeline, result: r.result, events };
  };
  E.runRaid = function (state) {
    if (!lockedNow(state) && E.raidPlan(state).role !== 'supply' && !findGear(state, E.raidPlan(state).slots.weapon)) return { ok: false, reason: 'Equip a weapon before joining the raid, or choose Supply line.' };
    return E.startRaidNow(state);
  };
  E.raidStatus = function (state) {
    const now = nowOf(state); const w = windowFor(state, now); const live = now >= w.start && now < w.end;
    const resolved = raidDoneThisWeek(state); const cur = state.raid.current && state.raid.current.week === state.week ? state.raid.current : null;
    const phase = live ? 'live' : resolved ? 'done' : lockedNow(state) ? 'locked' : 'prep';
    const chargeMs = num(cfg().raidChargeHours, 10) * 3600000;
    return { week: state.week, phase, locked: lockedNow(state), lock: state.raid.lock, windowStart: w.start, windowEnd: w.end,
      secToStart: Math.max(0, (w.start - now) / 1000), secLeft: live ? (w.end - now) / 1000 : 0, resolved, recapId: cur ? cur.recapId : null,
      fightPct: cur ? (cur.instant && !live ? 1 : clamp((now - cur.startedAt) / chargeMs, 0, 1)) : 0, canStartNow: true };
  };
  E.readinessFlags = function (state) {
    const now = nowOf(state); const w = windowFor(state, now); const secTo = (w.start - now) / 1000;
    const lock = lockedNow(state) ? state.raid.lock : null; const plan = E.raidPlan(state);
    const role = lock ? lock.role : plan.role; const slots = lock ? lock.slots : plan.slots;
    const rc = E.roleCheck(state, role, slots);
    const missingItems = SLOTS.filter((s) => slots[s] && !findGear(state, slots[s])).map((s) => s);
    const missingNames = lock && lock.loadoutId ? missingItems : (plan.loadoutId ? missingItems : []);
    const reasons = [];
    if (!rc.ok) reasons.push(rc.reason);
    if (missingItems.length) reasons.push('Your loadout uses items you no longer own (' + missingItems.join(', ') + ').');
    if (!lock && !raidDoneThisWeek(state)) reasons.push('Not locked in yet: you will be auto-locked at raid start.');
    const level = raidDoneThisWeek(state) || secTo <= 0 ? null : secTo <= 7200 ? '2h' : secTo <= 86400 ? '24h' : null;
    return { badge: !!level && (!rc.ok || missingItems.length > 0 || !lock), level, reasons, notLocked: !lock, failsRole: !rc.ok, missingItems: missingNames };
  };
  E.lockSummary = function (state) {
    const locked = lockedNow(state); const plan = E.raidPlan(state);
    const lock = locked ? state.raid.lock : Object.assign(makeLock(state, false), { role: plan.role, slots: plan.slots });
    const l = lock.loadoutId ? E.loadout(state, lock.loadoutId) : null;
    const pieces = SLOTS.map((s) => findGear(state, lock.slots[s])).filter(Boolean);
    const pcts = pieces.map((g) => g.dur / Math.max(1, g.maxDur));
    const w = windowFor(state, nowOf(state));
    return { locked, lock: locked ? lock : null, role: lock.role, roleCheck: E.roleCheck(state, lock.role, lock.slots),
      loadout: { id: l ? l.id : null, name: l ? l.name : 'Equipped gear', complete: !SLOTS.some((s) => lock.slots[s] && !findGear(state, lock.slots[s])), missing: SLOTS.filter((s) => lock.slots[s] && !findGear(state, lock.slots[s])) },
      durability: { minPct: pcts.length ? Math.min(...pcts) : 0, avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0, low: pieces.filter((g) => g.dur / Math.max(1, g.maxDur) < 0.25).map((g) => ({ uid: g.uid, name: E.gearName(g), pct: g.dur / Math.max(1, g.maxDur) })) },
      pouch: E.pouch(state), rules: Object.assign({}, lock.rules), tiers: E.tierThresholds(state), projected: E.projectRaid(state), warnings: lockWarnings(state, lock),
      canLock: !locked && !raidDoneThisWeek(state), canUnlock: locked && !raidDoneThisWeek(state) && !E.isRaidWindow(state), autoLockAt: w.start };
  };
  E.crewReadiness = function (state) {
    const boss = E.currentBoss(state); const fair = bossReq(boss);
    const members = arr(state.crew && state.crew.members);
    const attending = members.reduce((a, m) => a + num(m.attend, 0.85), 0) + 1;
    const plan = lockedNow(state) ? state.raid.lock : E.raidPlan(state);
    const pw = powersOf(statsFor(state, plan.slots), boss);
    const have = { damage: 0, healing: 0, mitigation: 0 };
    members.forEach((m) => CHECKS.forEach((ck) => { have[ck] += num(m.attend, 0.85) * num(m.pf, 1) * fair * (ROLE_CHECK[m.role] === ck ? 1 : OFF_ROLE); }));
    CHECKS.forEach((ck) => { const r = Object.keys(ROLE_CHECK).find((x) => ROLE_CHECK[x] === ck); have[ck] += plan.role === 'supply' ? 0 : pw[r] * (plan.role === r ? 1 : OFF_ROLE); });
    const vault = (state.crew && state.crew.vault && state.crew.vault.inv) || {};
    let food = members.reduce((a, m) => a + num(m.attend, 0.85) * num(m.food, 5), 0), pots = members.reduce((a, m) => a + num(m.attend, 0.85) * num(m.potions, 1), 0);
    Object.keys(vault).forEach((id) => { const it = item(id); if (it && it.kind === 'food') food += invCount(vault, id); if (it && it.kind === 'potion') pots += invCount(vault, id); });
    const pp = E.pouch(state); food += pp.food; pots += pp.potions;
    const need = attending * fair * ROLE_MIX;
    const rows = [
      { id: 'damage', label: 'Damage', have: have.damage, need }, { id: 'healing', label: 'Healing', have: have.healing, need },
      { id: 'mitigation', label: 'Defence', have: have.mitigation, need }, { id: 'food', label: 'Food', have: food, need: attending * 6 },
      { id: 'consumables', label: 'Consumables', have: pots, need: attending * 2 }
    ].map((r) => Object.assign(r, { have: Math.round(r.have), need: Math.round(r.need), pct: r.have / Math.max(1, r.need), ok: r.have >= r.need * 0.95 }));
    const short = rows.filter((r) => !r.ok).sort((a, b) => a.pct - b.pct).map((r) => r.id);
    const locked = members.filter((m) => num(m.lockedWeek, 0) === state.week).length + (lockedNow(state) ? 1 : 0);
    return { attending: Math.round(attending), roster: members.length + 1, lockedCount: locked, checks: rows, short,
      message: short.length ? 'We need more ' + lcFirst(rows.find((r) => r.id === short[0]).label === 'Defence' ? 'defence' : rows.find((r) => r.id === short[0]).label) : 'Crew is ready' };
  };
  E.badges = function (state) {
    const rf = E.readinessFlags(state); const last = E.lastRecap(state);
    const raidOn = rf.badge || !!(last && !last.seen && last.week === state.week);
    const inc = E.loadouts(state).filter((l) => !l.complete);
    const newReqs = E.requisitions(state).filter((r) => r.status === 'open' && r.isNew && r.canFill.ok);
    const pend = arr(state.crew && state.crew.withdrawRequests).filter((r) => r.status === 'pending' && !r.isYou);
    const canAnswer = E.can(state, 'withdraw').ok;
    const count = newReqs.length + (canAnswer ? pend.length : 0);
    return { raid: { on: raidOn, reason: rf.badge ? rf.reasons[0] : raidOn ? 'Raid recap ready.' : '' },
      kit: { on: inc.length > 0, reason: inc.length ? `${inc[0].name} is incomplete.` : '' },
      crew: { on: count > 0, count, reason: newReqs.length ? 'New requisition you can fill.' : count ? 'A crewmate is asking for a withdrawal.' : '' } };
  };

  // compat preview (v3 raid screen)
  E.raidPreview = function (state) {
    const boss = E.currentBoss(state);
    const pp = E.pouch(state); const fp = foodAndPotions(state);
    if (!boss) return { boss: null, bossHp: 0, bossHpPct: 0, playerPower: E.playerStats(state).power, expectedShare: 0, foodCount: fp.food, potionCount: fp.potion, weakMatch: false, advice: ['No raid boss is scheduled in this build.'] };
    const rec = curRecord(state); const proj = E.projectRaid(state); const plan = E.raidPlan(state);
    const ps = statsFor(state, plan.slots); const rc = E.roleCheck(state, plan.role, plan.slots);
    const advice = [];
    if (!rc.ok) advice.push(rc.reason);
    if (pp.units === 0) advice.push('Pack your raid pouch: the fight only uses food and potions in the pouch.');
    const weakMatch = num(ps.elements[boss.weakTo], 0) > 0;
    if (boss.weakTo && rec.revealedWeek != null) advice.push(weakMatch ? `Your ${boss.weakTo} damage exploits ${boss.name}'s weakness.` : `${boss.name} is weak to ${boss.weakTo}.`);
    if (state.tokens > 0 && !num(state.raid.rules.tokens, 0)) advice.push(`You have ${state.tokens} raid tokens. Commit some for extra core tickets.`);
    return { boss, bossHp: rec.hpLeft, bossHpPct: rec.hpLeft / rec.maxHp, playerPower: ps.power, expectedShare: proj.weekShare, foodCount: pp.food + fp.food, potionCount: pp.potions + fp.potion, weakMatch, advice, tier: proj.tier };
  };
  function foodAndPotions(state) {
    let food = 0, potion = 0;
    Object.keys(state.inv).forEach((id) => { const it = item(id); if (!it) return; if (it.kind === 'food') food += E.itemCount(state, id); if (it.kind === 'potion') potion += E.itemCount(state, id); });
    return { food, potion };
  }
  function bossPhases(boss) {
    const p = arr(boss.phases).filter((x) => x).map((x) => ({ name: x.name || 'Onslaught', check: CHECKS.includes(x.check) ? x.check : 'damage' }));
    return p.length ? p : [{ name: 'Onslaught', check: 'damage' }];
  }

  // ---------------- farm raids (defeated bosses, weekdays, lower loot)
  E.farmRaids = function (state) {
    const per = num(cfg().farmRunsPerDay, 3); const day = dayKey(nowOf(state));
    const used = state.raid.farm && state.raid.farm.day === day ? num(state.raid.farm.runs, 0) : 0;
    const live = E.isRaidWindow(state);
    const list = bosses().slice(0, num(state.raid.ladder, 0)).map((b) => ({ bossId: b.id, name: b.name, lootMult: num(cfg().farmLootMult, 0.35), reqPower: bossReq(b) }));
    return { runsLeft: Math.max(0, per - used), perDay: per, allowed: !live && used < per && list.length > 0, reason: live ? 'Farm raids pause during the weekend raid.' : used >= per ? 'No farm runs left today.' : !list.length ? 'Defeat a boss to farm it on weekdays.' : '', bosses: list };
  };
  E.runFarmRaid = function (state, bossId) {
    const fr = E.farmRaids(state); const b = fr.bosses.find((x) => x.bossId === bossId);
    if (!b) return { ok: false, reason: fr.bosses.length ? 'That boss is not on your farm list.' : fr.reason };
    if (!fr.allowed) return { ok: false, reason: fr.reason };
    if (!findGear(state, state.equipped.weapon)) return { ok: false, reason: 'Equip a weapon first.' };
    if (!(state.hp > 0)) return { ok: false, reason: 'You need some HP to raid.' };
    const def = bosses().find((x) => x.id === bossId); const ps = E.playerStats(state); const pw = powersOf(ps, def);
    const role = ['striker', 'guardian', 'mender'].sort((x, y) => pw[y] - pw[x])[0];
    const ev = []; let faints = 0; const eaten0 = foodAndPotions(state);
    const pressure = 0.06 * clamp(bossReq(def) / Math.max(5, pw[role]), 0.4, 3);
    for (let i = 0; i < 12; i++) {
      autoEat(state, ev, num(state.raid.rules.eatAt, 0.5), ps.maxHp);
      state.hp -= ps.maxHp * pressure * (0.7 + rand() * 0.6);
      if (state.hp <= 0) { faints++; state.hp = Math.round(ps.maxHp * 0.3); }
    }
    const eaten1 = foodAndPotions(state);
    const loot = []; const mult = b.lootMult * clamp(pw[role] / bossReq(def), 0.5, 1.5);
    arr(def.loot).slice(1).forEach((l) => { if (item(l.item) && rand() < clamp(num(l.chance, 0) * mult * 1.5, 0, 0.9)) grant(state, loot, l.item, gradeOf(45 + rand() * 40), Math.max(1, Math.round(qtyRange(l.qty) * 0.5))); });
    if (def.floorItem) grant(state, loot, def.floorItem, 1, randInt(1, 3));
    const xp = Math.round(bossReq(def) * 6 * num(cfg().xpMult, 1)); addXp(state, role, xp, ev);
    drainDurability(state, 3, ev);
    const day = dayKey(nowOf(state));
    state.raid.farm = { day, runs: (state.raid.farm && state.raid.farm.day === day ? num(state.raid.farm.runs, 0) : 0) + 1 };
    E.log(state, 'raid', `Farm raid on ${def.name}: ${loot.length ? loot.map((x) => x.qty + ' ' + itemName(x.itemId)).join(', ') : 'nothing this time'}.`);
    return { ok: true, reason: '', result: { bossId, loot, eaten: (eaten0.food + eaten0.potion) - (eaten1.food + eaten1.potion), faints, xp, role } };
  };

  // ================================================================ v4: crew economy
  function feedPush(state, kind, who, text) {
    const cr = state.crew; if (!cr) return null;
    if (!Array.isArray(cr.feed)) cr.feed = [];
    const e = { t: Date.now(), kind, who: who || 'You', text };
    cr.feed.unshift(e); if (cr.feed.length > FEED_CAP) cr.feed.length = FEED_CAP;
    return e;
  }
  function econ(state, key, v) {
    const ec = state.economy || (state.economy = { raidCoin: 0, reqPaid: 0, weeks: [] });
    ec[key] = num(ec[key], 0) + v;
    let w = ec.weeks.find((x) => x.week === state.week); if (!w) { w = { week: state.week, raidCoin: 0, reqPaid: 0 }; ec.weeks.unshift(w); ec.weeks = ec.weeks.slice(0, 12); }
    w[key] = num(w[key], 0) + v;
  }
  E.economy = (state) => clone(state.economy || { raidCoin: 0, reqPaid: 0, weeks: [] });
  E.crewRanks = () => rankDefs().slice();
  E.playerRank = (state) => (state.crew && state.crew.viewAsMember ? 'member' : (state.crew && state.crew.playerRank) || 'officer');
  const PERM_TEXT = { viewVault: 'view the vault', deposit: 'deposit', withdraw: 'withdraw from the vault', postRequisitions: 'post requisitions', setSchedule: 'set the raid schedule', marketList: 'list on the market for the crew', manageRoles: 'manage roles' };
  E.can = function (state, perm) {
    const rk = rankDef(E.playerRank(state));
    const ok = !!(rk.perms && rk.perms[perm]);
    return { ok, reason: ok ? '' : `${rk.name}s can't ${PERM_TEXT[perm] || perm}. Ask an officer.` };
  };
  E.setViewAsMember = function (state, on) { if (state.crew) state.crew.viewAsMember = !!on; return { ok: true, reason: '' }; };
  E.crewMembers = function (state) {
    const cr = state.crew || {};
    const you = { id: 'you', name: 'You', rank: E.playerRank(state), rankName: rankDef(E.playerRank(state)).name, skill: null, isYou: true };
    // stable order (you first, then the saved roster order) and a stable sprite seed per member, whatever the view
    you.seed = seedOf('you'); you.index = 0;
    return [you].concat(arr(cr.members).map((m, i) => ({ id: m.id, name: m.name, rank: m.rank, rankName: rankDef(m.rank).name, skill: m.skill, isYou: false, seed: num(m.seed, seedOf(m.id + ':' + m.name)), index: i + 1 })));
  };
  function seedOf(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  E.setMemberRank = function (state, memberId, rank) {
    const c = E.can(state, 'manageRoles'); if (!c.ok) return c;
    const m = arr(state.crew.members).find((x) => x.id === memberId); if (!m) return { ok: false, reason: 'That crewmate is gone.' };
    if (!rankDefs().some((r) => r.id === rank)) return { ok: false, reason: 'Unknown rank.' };
    const mine = E.playerRank(state);
    if (mine !== 'leader' && (['leader', 'officer'].includes(m.rank) || ['leader', 'officer'].includes(rank))) return { ok: false, reason: 'Only the leader can change officers.' };
    if (m.rank === rank) return { ok: true, reason: '' };
    const before = m.rank; m.rank = rank;
    feedPush(state, 'role', 'You', `${m.name}: ${rankDef(before).name} → ${rankDef(rank).name}.`);
    return { ok: true, reason: '' };
  };
  function findVaultGear(state, uid) { return arr(state.crew && state.crew.vault && state.crew.vault.gear).find((g) => g.uid === uid) || null; }
  E.vault = function (state) {
    const v = (state.crew && state.crew.vault) || { inv: {}, gear: [] }; const can = E.can(state, 'viewVault').ok;
    return { canView: can, items: Object.keys(v.inv).filter((id) => invCount(v.inv, id) > 0 && item(id)).map((id) => ({ itemId: id, grades: v.inv[id].slice(), total: invCount(v.inv, id) }))
      .sort((a, b) => num(item(a.itemId).tier, 0) - num(item(b.itemId).tier, 0) || itemName(a.itemId).localeCompare(itemName(b.itemId))), gear: v.gear.map((g) => Object.assign({}, g)) };
  };
  E.vaultDeposit = function (state, a, grade, qty) {
    if (a && typeof a === 'object') { if (a.kind === 'gear' || a.uid) return E.vaultDepositGear(state, a.uid); return E.vaultDeposit(state, a.itemId, a.grade, a.qty); }
    const c = E.can(state, 'deposit'); if (!c.ok) return c;
    const it = item(a); if (!it || !isStackable(it)) return { ok: false, reason: 'Unknown item.' };
    qty = Math.floor(num(qty, 1)); if (qty < 1) return { ok: false, reason: 'Deposit at least 1.' };
    const order = grade == null ? WORST : [clamp(Math.floor(grade), 0, 4)];
    const have = order.reduce((s, g) => s + num((state.inv[a] || [])[g], 0), 0);
    if (have < qty) return { ok: false, reason: `You only have ${have} ${lcFirst(it.name)}${grade == null ? '' : ' of that grade'}.` };
    invTake(state.inv, a, qty, order, 0).forEach((t) => invAdd(state.crew.vault.inv, a, t.grade, t.qty));
    feedPush(state, 'vault', 'You', `Deposited ${qty} ${it.name}.`);
    return { ok: true, reason: '' };
  };
  E.vaultDepositGear = function (state, uid) {
    const c = E.can(state, 'deposit'); if (!c.ok) return Object.assign(c, { loadoutsAffected: [] });
    const g = findGear(state, uid); if (!g) return { ok: false, reason: 'That item is no longer in your bag.', loadoutsAffected: [] };
    SLOTS.forEach((s) => { if (state.equipped[s] === uid) state.equipped[s] = null; });
    state.gear = state.gear.filter((x) => x !== g); state.crew.vault.gear.push(g); clampHp(state);
    const affected = arr(state.loadouts).filter((l) => SLOTS.some((s) => l.slots[s] === uid)).map((l) => l.id);
    feedPush(state, 'vault', 'You', `Deposited ${E.gearName(g)}.`);
    return { ok: true, reason: '', loadoutsAffected: affected };
  };
  E.depositToVault = E.vaultDeposit; E.sendToVault = E.vaultDeposit;
  function withdrawUsed(state) { const day = dayKey(nowOf(state)); const w = state.crew.withdrawn; return w && w.day === day ? num(w.units, 0) : 0; }
  E.withdrawCapLeft = function (state) { if (!E.can(state, 'withdraw').ok) return 0; const capN = num(rankDef(E.playerRank(state)).withdrawCap, 0); return capN === Infinity ? Infinity : Math.max(0, capN - withdrawUsed(state)); };
  function noteWithdraw(state, n) { const day = dayKey(nowOf(state)); state.crew.withdrawn = { day, units: withdrawUsed(state) + n }; }
  E.vaultWithdraw = function (state, itemId, grade, qty) {
    if (itemId && typeof itemId === 'object') { if (itemId.uid) return E.vaultWithdrawGear(state, itemId.uid); return E.vaultWithdraw(state, itemId.itemId, itemId.grade, itemId.qty); }
    const c = E.can(state, 'withdraw'); if (!c.ok) return c;
    qty = Math.floor(num(qty, 1)); if (qty < 1) return { ok: false, reason: 'Withdraw at least 1.' };
    const left = E.withdrawCapLeft(state); if (qty > left) return { ok: false, reason: `Daily withdrawal cap: ${left} left today.` };
    const v = state.crew.vault.inv; const order = grade == null ? BEST : [clamp(Math.floor(grade), 0, 4)];
    const have = order.reduce((s, g) => s + num((v[itemId] || [])[g], 0), 0);
    if (have < qty) return { ok: false, reason: `The vault has ${have} ${lcFirst(itemName(itemId))}.` };
    invTake(v, itemId, qty, order, 0).forEach((t) => addItem(state, itemId, t.grade, t.qty));
    noteWithdraw(state, qty);
    feedPush(state, 'vault', 'You', `Withdrew ${qty} ${itemName(itemId)}.`);
    return { ok: true, reason: '' };
  };
  E.vaultWithdrawGear = function (state, uid) {
    const c = E.can(state, 'withdraw'); if (!c.ok) return c;
    if (E.withdrawCapLeft(state) < 1) return { ok: false, reason: 'Daily withdrawal cap reached.' };
    const g = findVaultGear(state, uid); if (!g) return { ok: false, reason: 'That item is not in the vault.' };
    state.crew.vault.gear = state.crew.vault.gear.filter((x) => x !== g); state.gear.push(g); noteWithdraw(state, 1);
    feedPush(state, 'vault', 'You', `Withdrew ${E.gearName(g)}.`);
    return { ok: true, reason: '' };
  };
  E.requestWithdrawal = function (state, spec, note) {
    spec = spec || {}; const cr = state.crew;
    if (spec.uid) { if (!findVaultGear(state, spec.uid)) return { ok: false, reason: 'That item is not in the vault.' }; }
    else { if (!item(spec.itemId)) return { ok: false, reason: 'Unknown item.' }; if (!(num(spec.qty, 0) >= 1)) return { ok: false, reason: 'Ask for at least 1.' }; }
    const req = { id: nextId(state, 'W'), who: 'You', isYou: true, itemId: spec.uid ? null : spec.itemId, grade: spec.grade == null ? null : clamp(Math.floor(spec.grade), 0, 4), qty: spec.uid ? 1 : Math.floor(spec.qty), uid: spec.uid || null,
      note: String(note || '').slice(0, 80), t: Date.now(), status: 'pending', answeredBy: null, answerIn: randInt(45, 100) };
    cr.withdrawRequests.unshift(req); cr.withdrawRequests = cr.withdrawRequests.slice(0, 20);
    feedPush(state, 'request', 'You', `Asked an officer for ${spec.uid ? E.gearName(findVaultGear(state, spec.uid)) : req.qty + ' ' + itemName(req.itemId)}.`);
    return { ok: true, reason: '', request: Object.assign({}, req) };
  };
  function moveFromVault(state, req, toPlayer) {
    const v = state.crew.vault;
    if (req.uid) { const g = findVaultGear(state, req.uid); if (!g) return false; if (toPlayer) { v.gear = v.gear.filter((x) => x !== g); state.gear.push(g); } else v.gear = v.gear.filter((x) => x !== g); return true; }
    const order = req.grade == null ? BEST : [req.grade];
    const have = order.reduce((s, g) => s + num((v.inv[req.itemId] || [])[g], 0), 0); if (have < req.qty) return false;
    invTake(v.inv, req.itemId, req.qty, order, 0).forEach((t) => { if (toPlayer) addItem(state, req.itemId, t.grade, t.qty); });
    return true;
  }
  E.resolveWithdrawal = function (state, id, approve) {
    const c = E.can(state, 'withdraw'); if (!c.ok) return c;
    const r = arr(state.crew.withdrawRequests).find((x) => x.id === id && x.status === 'pending' && !x.isYou); if (!r) return { ok: false, reason: 'That request is already answered.' };
    if (approve && !moveFromVault(state, r, false)) return { ok: false, reason: 'The vault no longer has that.' };
    r.status = approve ? 'approved' : 'denied'; r.answeredBy = 'You';
    feedPush(state, 'request', 'You', `${approve ? 'Approved' : 'Denied'} ${r.who}'s request for ${r.uid ? 'gear' : r.qty + ' ' + itemName(r.itemId)}.`);
    return { ok: true, reason: '' };
  };
  E.treasury = function (state) { const t = state.crew.treasury; return { coin: t.coin, escrow: t.escrow, total: t.coin + t.escrow, history: arr(state.crew.feed).filter((f) => f.kind === 'payout' || f.kind === 'requisition').slice(0, 20) }; };
  function postReq(state, d, who, source) {
    const cr = state.crew; const escrow = Math.max(0, Math.floor(d.qty * d.rewardPer));
    cr.treasury.coin -= escrow; cr.treasury.escrow += escrow;
    const req = { id: nextId(state, 'Q'), itemId: d.itemId, qty: d.qty, rewardPer: d.rewardPer, minGrade: d.minGrade, note: d.note || '', filled: 0, escrow, paid: 0,
      postedBy: who, postedAt: Date.now(), week: state.week, source, status: 'open', submissions: [] };
    cr.requisitions.unshift(req); cr.requisitions = cr.requisitions.slice(0, 24);
    feedPush(state, 'requisition', who, `Posted a requisition: ${d.qty} ${itemName(d.itemId)}${d.rewardPer ? ` at ${d.rewardPer} coin each (${escrow} escrowed)` : ''}.`);
    return req;
  }
  function validDraft(state, d) {
    d = d || {}; const it = item(d.itemId);
    if (!it || !isStackable(it)) return { ok: false, reason: 'Pick an item.' };
    const qty = Math.floor(num(d.qty, 0)); if (qty < 1 || qty > 500) return { ok: false, reason: 'Ask for 1 to 500.' };
    const rewardPer = Math.max(0, Math.floor(num(d.rewardPer, 0))); const minGrade = clamp(Math.floor(num(d.minGrade, 0)), 0, 4);
    return { ok: true, draft: { itemId: d.itemId, qty, rewardPer, minGrade, note: String(d.note || '').slice(0, 120) } };
  }
  E.postRequisition = function (state, draft, opts) {
    const c = E.can(state, 'postRequisitions'); if (!c.ok) return c;
    const v = validDraft(state, draft); if (!v.ok) return v;
    const d = v.draft; const cost = d.qty * d.rewardPer;
    if (cost > state.crew.treasury.coin) return { ok: false, reason: `That needs ${cost} coin in escrow; the treasury has ${Math.floor(state.crew.treasury.coin)} free. Lower the reward or post it coin-free.`, escrow: cost, freeCoin: Math.floor(state.crew.treasury.coin) };
    const req = postReq(state, d, 'You', (opts && opts.source) || 'manual');
    return { ok: true, reason: '', req: Object.assign({}, req) };
  };
  E.cancelRequisition = function (state, id) {
    const c = E.can(state, 'postRequisitions'); if (!c.ok) return c;
    const r = arr(state.crew.requisitions).find((x) => x.id === id); if (!r || r.status !== 'open') return { ok: false, reason: 'That requisition is closed.' };
    const back = r.escrow; state.crew.treasury.escrow -= back; state.crew.treasury.coin += back; r.escrow = 0; r.status = 'cancelled';
    feedPush(state, 'requisition', 'You', `Cancelled the ${itemName(r.itemId)} requisition; ${back} coin back to the treasury.`);
    return { ok: true, reason: '', refunded: back };
  };
  function submitToReq(state, r, who, grades) { // grades: [{grade, qty}] already removed from the submitter
    const cr = state.crew; const qty = grades.reduce((a, g) => a + g.qty, 0);
    const pay = Math.min(r.escrow, qty * r.rewardPer);
    r.escrow -= pay; cr.treasury.escrow -= pay; r.paid += pay; r.filled += qty;
    grades.forEach((g) => invAdd(cr.vault.inv, r.itemId, g.grade, g.qty));
    r.submissions.push({ who, qty, grade: grades[0] ? grades[0].grade : 1, paid: pay, t: Date.now() });
    if (pay > 0) econ(state, 'reqPaid', pay);
    feedPush(state, 'payout', who, `${who} filled ${qty} ${itemName(r.itemId)}${pay ? `, +${pay}g` : ''}`);
    if (r.filled >= r.qty) { r.status = 'filled'; if (r.escrow > 0) { cr.treasury.escrow -= r.escrow; cr.treasury.coin += r.escrow; r.escrow = 0; } feedPush(state, 'requisition', 'Crew', `The ${itemName(r.itemId)} requisition is filled.`); }
    return pay;
  }
  E.fillRequisition = function (state, id, qty) {
    const r = arr(state.crew.requisitions).find((x) => x.id === id); if (!r || r.status !== 'open') return { ok: false, reason: 'That requisition is closed.', accepted: 0, paid: 0 };
    const rem = r.qty - r.filled; qty = Math.min(Math.floor(num(qty, rem)), rem); if (qty < 1) return { ok: false, reason: 'Submit at least 1.', accepted: 0, paid: 0 };
    const have = [0, 1, 2, 3, 4].filter((g) => g >= r.minGrade).reduce((s, g) => s + num((state.inv[r.itemId] || [])[g], 0), 0);
    if (have < 1) return { ok: false, reason: `You have no ${lcFirst(itemName(r.itemId))} at ${(grades()[r.minGrade] || {}).name || 'that'} grade or better.`, accepted: 0, paid: 0 };
    const taken = invTake(state.inv, r.itemId, Math.min(qty, have), WORST, r.minGrade);
    const n = taken.reduce((a, t) => a + t.qty, 0); const pay = submitToReq(state, r, 'You', taken);
    state.gold += pay;
    E.log(state, 'info', `Filled ${n} ${itemName(r.itemId)} for the crew${pay ? ` and earned ${pay}g` : ''}.`);
    return { ok: true, reason: '', accepted: n, paid: pay, grade: taken[0] ? taken[0].grade : null };
  };
  E.requisitions = function (state) {
    const cr = state.crew || {}; const seen = new Set(arr(cr.seenReqIds));
    return arr(cr.requisitions).map((r) => {
      const rem = Math.max(0, r.qty - r.filled);
      const have = [0, 1, 2, 3, 4].filter((g) => g >= r.minGrade).reduce((s, g) => s + num((state.inv[r.itemId] || [])[g], 0), 0);
      const rec = allActions().find((a) => a && a.outputs && a.outputs[r.itemId] && (a.kind === 'craft' || a.kind === 'refine'));
      return Object.assign(clone(r), { remaining: rem, label: `Saturday raid needs ${r.qty} ${itemName(r.itemId)}, ${r.filled} pledged`,
        canFill: r.status !== 'open' ? { ok: false, reason: 'Closed.', have } : have > 0 ? { ok: true, reason: '', have } : { ok: false, reason: `You have none at ${(grades()[r.minGrade] || {}).name || ''} grade or better.`, have },
        links: { recipeActionId: rec ? rec.id : null, vaultHas: invCount(cr.vault && cr.vault.inv, r.itemId), marketListingIds: arr(state.market.listings).filter((l) => l.itemId === r.itemId && l.grade >= r.minGrade).map((l) => l.id) },
        isNew: !seen.has(r.id) });
    }).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.postedAt - a.postedAt);
  };
  E.neededByCrew = (state) => E.requisitions(state).filter((r) => r.status === 'open' && r.remaining > 0).map((r) => ({ itemId: r.itemId, minGrade: r.minGrade, remaining: r.remaining, rewardPer: r.rewardPer, reqId: r.id }));
  E.isNeededByCrew = (state, itemId, grade) => E.requisitions(state).find((r) => r.status === 'open' && r.itemId === itemId && (grade == null || grade >= r.minGrade)) || null;
  E.markRequisitionsSeen = function (state) { state.crew.seenReqIds = arr(state.crew.requisitions).map((r) => r.id); return { ok: true, reason: '' }; };
  // post: true posts the draft as is (fails with a reason if the treasury can't escrow it); opts.coinFree posts with no reward;
  // opts.rewardPer overrides the per-unit reward
  E.requisitionFromGap = function (state, gapId, post, opts) {
    opts = opts || {};
    const recs = arr(state.raid.recaps); let gap = null;
    for (const r of recs) { gap = arr(r.debrief && r.debrief.gaps).find((g) => g.id === gapId); if (gap) break; }
    if (!gap) return { ok: false, reason: 'That gap is no longer in a debrief.' };
    const draft = gapDraft(state, Object.assign({ shortUnits: gap.suggestion ? gap.suggestion.qty : 20 }, gap));
    if (opts.coinFree) draft.rewardPer = 0; else if (opts.rewardPer != null) draft.rewardPer = Math.max(0, Math.floor(num(opts.rewardPer, draft.rewardPer)));
    draft.escrow = draft.qty * draft.rewardPer; draft.affordable = draft.escrow <= draft.freeCoin;
    if (!post) return { ok: true, reason: '', draft };
    const res = E.postRequisition(state, draft, { source: 'debrief' });
    return Object.assign(res, { draft });
  };
  E.crewFeed = (state, kind) => arr(state.crew && state.crew.feed).filter((f) => !kind || f.kind === kind).slice();
  E.setRaidSchedule = function (state, spec) {
    const c = E.can(state, 'setSchedule'); if (!c.ok) return c;
    if (raidDoneThisWeek(state) || E.isRaidWindow(state) || lockedNow(state)) return { ok: false, reason: 'Change the schedule before anyone locks in.' };
    spec = spec || {}; const sd = Math.floor(num(spec.startDay, 6)); const sh = Math.floor(num(spec.startHour, 10));
    if (![5, 6].includes(sd) || sh < 6 || sh > 20) return { ok: false, reason: 'Start Friday or Saturday, 06:00 to 20:00.' };
    const st = new Date(addDays(mondayOf(nowOf(state)), (sd + 6) % 7)); st.setHours(sh, 0, 0, 0); const en = new Date(st.getTime() + 36 * 3600000);
    state.crew.schedule = { startDay: sd, startHour: sh, endDay: en.getDay(), endHour: en.getHours() };
    feedPush(state, 'raid', 'You', `Raid window set: ${sd === 5 ? 'Fri' : 'Sat'} ${String(sh).padStart(2, '0')}:00 for 36 hours.`);
    return { ok: true, reason: '' };
  };
  // crew simulation: crewmates fill requisitions, officers answer requests, members lock in during the week
  function crewEconomyStep(state, dt, events) {
    const cr = state.crew; if (!cr || !cr.treasury) return;
    cr.reqSimIn = num(cr.reqSimIn, 60) - dt;
    if (cr.reqSimIn <= 0) {
      cr.reqSimIn = randInt(40, 90);
      const open = cr.requisitions.filter((r) => r.status === 'open' && r.qty > r.filled && r.source !== 'npc-request');
      if (open.length && cr.members.length) {
        const r = pick(open); const m = pick(cr.members);
        const q = Math.min(r.qty - r.filled, randInt(1, Math.max(1, Math.ceil((r.qty - r.filled) / 4))));
        submitToReq(state, r, m.name, [{ grade: Math.max(r.minGrade, randInt(1, 3)), qty: q }]);
        events.push({ type: r.status === 'filled' ? 'reqFilled' : 'reqPaid', reqId: r.id });
      }
    }
    arr(cr.withdrawRequests).forEach((w) => {
      if (w.status !== 'pending' || !w.isYou) return;
      w.answerIn = num(w.answerIn, 60) - dt; if (w.answerIn > 0) return;
      const officer = (cr.members.find((m) => m.rank === 'leader') || cr.members[0] || { name: 'An officer' }).name;
      const ok = moveFromVault(state, w, true);
      w.status = ok ? 'approved' : 'denied'; w.answeredBy = officer;
      const e = feedPush(state, 'request', officer, `${ok ? 'Approved' : 'Denied'} your request for ${w.uid ? 'gear' : w.qty + ' ' + itemName(w.itemId)}${ok ? '' : ' (the vault was short)'}.`);
      events.push({ type: 'crewFeed', entry: e });
    });
    cr.npcReqIn = num(cr.npcReqIn, 300) - dt;
    if (cr.npcReqIn <= 0) {
      cr.npcReqIn = randInt(300, 600);
      const v = Object.keys(cr.vault.inv).filter((id) => invCount(cr.vault.inv, id) > 0);
      if (v.length && cr.members.length && cr.withdrawRequests.filter((w) => w.status === 'pending' && !w.isYou).length < 2) {
        const id = pick(v); const m = pick(cr.members.filter((x) => x.rank !== 'leader').concat(cr.members.slice(0, 1)));
        cr.withdrawRequests.unshift({ id: nextId(state, 'W'), who: m.name, isYou: false, itemId: id, grade: null, qty: Math.min(invCount(cr.vault.inv, id), randInt(1, 3)), uid: null, note: 'For the raid', t: Date.now(), status: 'pending', answeredBy: null });
        cr.withdrawRequests = cr.withdrawRequests.slice(0, 20);
        events.push({ type: 'crewFeed', entry: feedPush(state, 'request', m.name, `Asked for ${itemName(id)} from the vault.`) });
      }
    }
  }
  function crewWeekly(state, events) {
    const cr = state.crew; if (!cr) return;
    cr.members.forEach((m) => { m.pf = clamp(num(m.basePf, m.pf) * (0.92 + rand() * 0.16), 0.4, 2); m.food = randInt(3, 10); m.potions = randInt(1, 4); m.lockedWeek = 0; });
    const leader = cr.members.find((m) => m.rank === 'leader');
    if (leader && cr.requisitions.filter((r) => r.status === 'open').length < 3 && cr.treasury.coin >= 20) {
      const itemId = gapItem(state, pick(['healing', 'food', 'mitigation'])); const qty = randInt(12, 30);
      const rewardPer = Math.min(Math.max(1, Math.round(E.itemValue(itemId, 1) * 0.3)), Math.floor(cr.treasury.coin * 0.5 / qty));
      const r = postReq(state, { itemId, qty, rewardPer: Math.max(0, rewardPer), minGrade: 1, note: 'Weekly raid stock' }, leader.name, 'leader');
      events.push({ type: 'reqPosted', reqId: r.id });
    }
  }
  function crewLocksStep(state) { // crewmates lock in as the week goes on
    const cr = state.crew; if (!cr) return;
    const clk = E.clock(state); const frac = clamp((clk.weekday + (new Date(clk.now).getHours() / 24)) / 5.4, 0, 1);
    cr.members.forEach((m, i) => { if (num(m.lockedWeek, 0) !== state.week && ((i * 0.6180339) % 1) < frac) m.lockedWeek = state.week; });
  }
  const CREW_ROLES = ['guardian', 'mender', 'striker'];
  function ensureCrewV4(state) {
    const cr = state.crew; if (!cr) return;
    const used = new Set(arr(cr.members).map((m) => m.name));
    // deterministic fill: the same save always grows the same roster, even if it is migrated twice before saving
    const pool = shuffleWith((arr(D().npcNames).length ? D().npcNames : ['Wren', 'Ossian', 'Mira', 'Tobin', 'Kestrel', 'Ada']).filter((n) => !used.has(n)), mulberry(seedOf(Array.from(used).join('|'))));
    while (cr.members.length < 15 && pool.length) cr.members.push({ name: pool.shift(), skill: null });
    cr.members.forEach((m, i) => {
      if (!m.id) m.id = 'c' + (i + 1);
      if (!rankDefs().some((r) => r.id === m.rank)) m.rank = i === 0 ? 'leader' : i === 1 ? 'officer' : i >= cr.members.length - 3 ? 'recruit' : 'member';
      if (!CREW_ROLES.includes(m.role)) m.role = CREW_ROLES[i % 3];
      if (!isFinite(m.seed)) m.seed = seedOf(m.id + ':' + m.name);
      const mr = mulberry(num(m.seed, 1));
      if (!isFinite(m.basePf)) m.basePf = Math.round((0.65 + mr() * 0.7) * 100) / 100;
      if (!isFinite(m.pf)) m.pf = m.basePf;
      if (!isFinite(m.attend)) m.attend = Math.round((0.7 + mr() * 0.27) * 100) / 100;
      if (!isFinite(m.food)) m.food = 3 + Math.floor(mr() * 8);
      if (!isFinite(m.potions)) m.potions = 1 + Math.floor(mr() * 4);
      m.lockedWeek = num(m.lockedWeek, 0);
    });
    if (!rankDefs().some((r) => r.id === cr.playerRank)) cr.playerRank = 'officer';
    cr.viewAsMember = !!cr.viewAsMember;
    if (!cr.vault || typeof cr.vault !== 'object') cr.vault = {};
    if (!cr.vault.inv || typeof cr.vault.inv !== 'object') cr.vault.inv = {};
    Object.keys(cr.vault.inv).forEach((id) => { if (!item(id) || !Array.isArray(cr.vault.inv[id])) delete cr.vault.inv[id]; });
    cr.vault.gear = arr(cr.vault.gear).filter((g) => g && g.uid && item(g.itemId));
    if (!cr.treasury || typeof cr.treasury !== 'object') {
      cr.treasury = { coin: num(cfg().crewStartTreasury, 120), escrow: 0 };
      if (!Array.isArray(cr.feed)) cr.feed = [];
      feedPush(state, 'payout', 'Raid', `Last weekend's raid payout: ${cr.treasury.coin} coin to the treasury.`);
    }
    cr.treasury.coin = Math.max(0, num(cr.treasury.coin, 0)); cr.treasury.escrow = Math.max(0, num(cr.treasury.escrow, 0));
    cr.requisitions = arr(cr.requisitions).filter((r) => r && r.id && item(r.itemId));
    cr.withdrawRequests = arr(cr.withdrawRequests).filter((r) => r && r.id);
    cr.feed = arr(cr.feed).filter((f) => f && f.text).slice(0, FEED_CAP);
    cr.seenReqIds = arr(cr.seenReqIds);
    if (!cr.withdrawn || typeof cr.withdrawn !== 'object') cr.withdrawn = { day: '', units: 0 };
    if (cr.schedule && typeof cr.schedule !== 'object') cr.schedule = null;
  }
  function ensureV4(state) {
    ensureClock(state);
    const base = num(cfg().serverPop, 1200);
    if (!state.server || typeof state.server !== 'object') state.server = {};
    const sv = state.server; sv.name = sv.name || 'Emberfall';
    sv.pop = Math.round(num(sv.pop, base * (0.97 + rand() * 0.06)));
    if (!Array.isArray(sv.popHistory) || !sv.popHistory.length) sv.popHistory = [0, 1, 2, 3].map(() => Math.round(base * (0.96 + rand() * 0.08)));
    sv.weekBuff = sv.weekBuff || null; sv.pendingBuff = sv.pendingBuff || null;
    const r = state.raid || (state.raid = {});
    r.ladder = clamp(Math.floor(num(r.ladder, 0)), 0, Math.max(0, bosses().length - 1));
    r.season = Math.max(1, Math.floor(num(r.season, 1)));
    if (!r.bosses || typeof r.bosses !== 'object') r.bosses = {};
    r.rules = normRules(state, r.rules);
    if (!r.plan || typeof r.plan !== 'object') r.plan = { role: null, loadoutId: null };
    if (!r.pouch || typeof r.pouch !== 'object') r.pouch = {};
    Object.keys(r.pouch).forEach((id) => { if (!item(id) || !Array.isArray(r.pouch[id])) delete r.pouch[id]; });
    if (r.lock && (typeof r.lock !== 'object' || !r.lock.slots)) r.lock = null;
    r.resolvedWeek = Math.floor(num(r.resolvedWeek, num(state.week, 1) - 1));
    r.recaps = arr(r.recaps).filter((x) => x && x.id);
    r.corePity = Math.max(0, Math.floor(num(r.corePity, 0))); r.coresWon = Math.max(0, Math.floor(num(r.coresWon, 0)));
    if (!r.farm || typeof r.farm !== 'object') r.farm = { day: '', runs: 0 };
    if (!r.warned || typeof r.warned !== 'object') r.warned = { week: state.week, levels: [] };
    r.current = r.current || null;
    for (let i = 0; i < r.ladder; i++) { const rec = ensureRecord(state, i, state.week); if (rec.killedWeek == null) { rec.killedWeek = Math.max(0, state.week - 1); rec.hpLeft = 0; rec.revealedWeek = rec.revealedWeek == null ? 0 : rec.revealedWeek; } }
    const curDef = bosses()[r.ladder]; const fresh = !!curDef && !r.bosses[curDef.id];
    const cur = curRecord(state); if (cur && cur.revealedWeek == null && (fresh || cur.unlockedWeek < state.week)) cur.revealedWeek = state.week;
    if (!Array.isArray(state.loadouts)) state.loadouts = [];
    state.loadouts = state.loadouts.filter((l) => l && l.id).map((l) => ({ id: String(l.id), name: String(l.name || 'Loadout'), slots: cleanSlots(state, l.slots), goal: l.goal || null, boundTo: l.boundTo || null, createdAt: num(l.createdAt, Date.now()) }));
    if (!state.economy || typeof state.economy !== 'object') state.economy = { raidCoin: 0, reqPaid: 0, weeks: [] };
    state.economy.weeks = arr(state.economy.weeks);
    ensureCrewV4(state);
    state.v = SCHEMA;
  }

  function cap1(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

  // ---------------------------------------------------------------- state lifecycle
  E.newState = function () {
    const c = cfg(); const now = Date.now();
    const s = {
      v: SCHEMA, createdAt: now, lastSeen: now, gold: num(c.startingGold, 150), tokens: 0, week: 1, hp: 1, focus: 0,
      skills: {}, mastery: {}, pity: {}, inv: {}, gear: [],
      equipped: { weapon: null, offhand: null, head: null, chest: null, legs: null, ring: null },
      active: null, settings: { matPriority: 'best', useCatalyst: false, useCore: false },
      market: { listings: [], mine: [], refreshedAt: now, age: 0 },
      supply: { week: 1, requests: [], donated: {}, earned: 0 },
      raid: { ladder: 0, bossHp: 0, rules: { eatAt: 0.5, stance: 'balanced', tactic: 'focus', tokens: 0 }, last: null },
      log: [], seq: 1
    };
    skillDefs().forEach((d) => { s.skills[d.id] = { xp: 0 }; });
    const st = D().starter || {};
    Object.keys(st.items || {}).forEach((id) => {
      if (!item(id)) return; const v = st.items[id];
      if (Array.isArray(v)) v.slice(0, 5).forEach((q, g) => addItem(s, id, g, q)); else addItem(s, id, 1, v);
    });
    arr(st.gear).forEach((g) => {
      const id = typeof g === 'string' ? g : g && g.itemId; if (!item(id)) return;
      const ge = makeGear(s, id, 0, 50);
      const slot = item(id).slot;
      if ((typeof g === 'string' || g.equip !== false) && SLOTS.includes(slot) && !s.equipped[slot]) s.equipped[slot] = ge.uid;
    });
    s.hp = E.playerStats(s).maxHp;
    const b = E.currentBoss(s); s.raid.bossHp = b ? Math.max(1, num(b.hp, 1)) : 0;
    E.refreshMarket(s);
    generateSupply(s);
    makeCrew(s);
    ensureV4(s);
    curRecord(s).revealedWeek = s.week;
    if (SLOTS.some((sl) => s.equipped[sl])) E.saveLoadout(s, { name: 'Starter kit', fromEquipped: true });
    E.log(s, 'info', 'Welcome to Guildwright. Pick a skill and start gathering.');
    return s;
  };
  function migrate(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.skills !== 'object' || !raw.skills) return null;
    if (raw.v != null && raw.v !== 1 && raw.v !== SCHEMA) return null;
    const legacy = raw.v !== SCHEMA;
    const s = E.newState(); const fresh = s;
    const out = Object.assign({}, fresh, raw, { v: SCHEMA });
    ['gold', 'tokens', 'week', 'hp', 'focus', 'createdAt', 'lastSeen', 'seq'].forEach((k) => { out[k] = num(raw[k], fresh[k]); });
    out.week = Math.max(1, Math.floor(out.week)); out.tokens = Math.max(0, Math.floor(out.tokens)); out.focus = clamp(out.focus, 0, 100);
    out.skills = {}; skillDefs().forEach((d) => { out.skills[d.id] = { xp: Math.max(0, num(raw.skills[d.id] && raw.skills[d.id].xp, 0)) }; });
    out.mastery = raw.mastery && typeof raw.mastery === 'object' ? raw.mastery : {};
    out.pity = raw.pity && typeof raw.pity === 'object' ? raw.pity : {};
    out.inv = {};
    Object.keys(raw.inv || {}).forEach((id) => {
      const g = raw.inv[id]; if (!item(id) || !Array.isArray(g)) return;
      const v = zeros5().map((_, i) => Math.max(0, Math.floor(num(g[i], 0))));
      if (v.some((x) => x > 0)) out.inv[id] = v;
    });
    out.gear = arr(raw.gear).filter((g) => g && g.uid && item(g.itemId)).map((g) => ({
      uid: String(g.uid), itemId: g.itemId, rarity: rarityDef(g.rarity).id, quality: clamp(num(g.quality, 50), 1, 100),
      affixes: arr(g.affixes).filter((a) => a && a.id), maxDur: Math.max(1, num(g.maxDur, 100)), dur: Math.max(0, num(g.dur, num(g.maxDur, 100)))
    }));
    out.equipped = {};
    SLOTS.forEach((sl) => { const u = raw.equipped && raw.equipped[sl]; out.equipped[sl] = u && out.gear.some((g) => g.uid === u) ? u : null; });
    migrateCrew(out, raw.crew);
    out.active = raw.active && action(raw.active.actionId) ? { actionId: raw.active.actionId, progress: Math.max(0, num(raw.active.progress, 0)) } : null;
    if (out.active && raw.active.jobId) {
      if (out.crew.jobs.some((j) => j.id === raw.active.jobId)) out.active.jobId = raw.active.jobId; else out.active = null;
    }
    out.settings = Object.assign({}, fresh.settings, raw.settings || {});
    const rm = raw.market || {};
    out.market = { listings: arr(rm.listings).filter((l) => l && item(l.itemId)), mine: arr(rm.mine).filter((l) => l && item(l.itemId)), refreshedAt: num(rm.refreshedAt, Date.now()), age: num(rm.age, 0) };
    if (!out.market.listings.length) out.market.listings = fresh.market.listings;
    const rr = raw.raid || {};
    if (legacy) {
      // v3 save: weeks advanced per raid; anchor the calendar so this real week is the save's week
      out.clock = { epoch: addDays(mondayOf(Date.now()), -7 * (out.week - 1)), offsetMs: 0 };
      out.server = null; out.economy = null; out.loadouts = [];
      out.raid = { ladder: Math.max(0, Math.floor(num(rr.ladder, 0))), rules: normRules(out, rr.rules), last: rr.last || null, resolvedWeek: out.week - 1 };
    } else {
      out.clock = raw.clock; out.server = raw.server; out.economy = raw.economy; out.loadouts = raw.loadouts;
      out.raid = Object.assign({}, rr, { rules: normRules(out, rr.rules) });
    }
    out.log = arr(raw.log).filter((l) => l && l.text).slice(0, LOG_CAP);
    out.supply = raw.supply && raw.supply.week === out.week && Array.isArray(raw.supply.requests)
      ? { week: out.week, requests: raw.supply.requests.filter((r) => r && item(r.itemId)), donated: raw.supply.donated || {}, earned: num(raw.supply.earned, 0) } : null;
    if (!out.supply) generateSupply(out);
    ensureV4(out);
    if (legacy) {
      const rec = curRecord(out); const v3max = num(V3_BOSS_HP[out.raid.ladder], 0);
      const pctLeft = v3max > 0 && isFinite(rr.bossHp) && rr.bossHp > 0 ? clamp(rr.bossHp / v3max, 0.05, 1) : 1;
      rec.hpLeft = Math.round(rec.maxHp * pctLeft); rec.revealedWeek = out.week; rec.weekends = pctLeft < 1 ? 1 : 0;
      out.raid.bossHp = rec.hpLeft;
      if (SLOTS.some((sl) => out.equipped[sl])) E.saveLoadout(out, { name: 'Current gear', fromEquipped: true });
      E.log(out, 'info', 'Guildwright v4: weekend raids now follow the real calendar. Your current gear was saved as a loadout.');
    } else {
      out.raid.bossHp = curRecord(out).hpLeft;
    }
    clampHp(out);
    return out;
  }
  const hasLS = () => { try { return typeof localStorage !== 'undefined' && localStorage !== null; } catch (e) { return false; } };
  E.load = function () {
    if (!hasLS()) return null;
    try {
      const raw = localStorage.getItem(cfg().saveKey);
      if (!raw) return null;
      return migrate(JSON.parse(raw));
    } catch (e) { return null; }
  };
  E.save = function (state) {
    if (!state) return;
    state.lastSeen = Date.now();
    if (!hasLS()) return;
    try { localStorage.setItem(cfg().saveKey, JSON.stringify(state)); } catch (e) { /* quota or privacy mode */ }
  };
  E.reset = function () {
    if (hasLS()) { try { localStorage.removeItem(cfg().saveKey); } catch (e) { /* ignore */ } }
    return E.newState();
  };
  E.migrate = migrate;

  // ---------------------------------------------------------------- extra helpers for the UI
  E.gradeOf = gradeOf;
  E.item = item;
  E.action = action;
  E.isGearCraft = (actionId) => isGearCraft(action(actionId));
  E.SLOTS = SLOTS.slice();

  // ---------------------------------------------------------------- headless smoke test
  E._test = function (opts) {
    opts = opts || {};
    const say = opts.silent ? () => {} : (m) => console.log('[engine test] ' + m);
    const assert = (c, m) => { if (!c) throw new Error('Engine test failed: ' + m); };
    const finite = (s) => {
      ['gold', 'tokens', 'week', 'hp', 'focus'].forEach((k) => assert(isFinite(s[k]), k + ' not finite: ' + s[k]));
      Object.keys(s.inv).forEach((id) => s.inv[id].forEach((x) => assert(x >= 0 && Number.isInteger(x), 'bad inv count ' + id)));
      s.gear.forEach((g) => assert(isFinite(g.dur) && isFinite(g.maxDur) && g.dur >= 0, 'bad gear dur'));
      Object.keys(s.skills).forEach((k) => assert(isFinite(s.skills[k].xp), 'xp nan ' + k));
      assert(s.log.length <= LOG_CAP, 'log too long');
    };
    const runTicks = (s, until, maxSec) => { let t = 0; const evs = []; while (t < maxSec && !until(evs, s)) { E.tick(s, 0.25, { visible: true }).forEach((e) => evs.push(e)); t += 0.25; } return evs; };
    assert(E.xpForLevel(1) === 0 && E.xpForLevel(2) === 83 && E.xpForLevel(99) === 13034431, 'xp curve');
    assert(E.levelFor(0) === 1 && E.levelFor(83) === 2 && E.levelFor(1e9) === num(cfg().maxLevel, 99), 'levelFor');
    E.save(null); E.load();
    const s = E.newState(); finite(s);
    assert(Object.keys(s.skills).length === skillDefs().length, 'skills missing');
    assert(s.hp === E.playerStats(s).maxHp, 'starting hp');
    assert(s.market.listings.length >= 12, 'market listings');
    assert(s.supply.requests.length >= 6, 'supply requests');
    // gather 20
    const gather = allActions().filter((a) => a.kind === 'gather' && num(a.level, 1) <= 1);
    assert(gather.length, 'no level-1 gather');
    let r = E.start(s, gather[0].id); assert(r.ok, 'start gather: ' + r.reason);
    let ev = runTicks(s, (e) => e.filter((x) => x.type === 'complete').length >= 20, 3600);
    assert(ev.filter((x) => x.type === 'complete').length >= 20, 'gathered 20');
    say(`gathered 20x ${gather[0].id}; ${E.itemCount(s, Object.keys(gather[0].outputs)[0])} in bag`);
    // feed a refine: grant inputs of the first level-1 refine
    const refine = allActions().find((a) => a.kind === 'refine' && num(a.level, 1) <= 1);
    if (refine) {
      Object.keys(refine.inputs || {}).forEach((id) => addItem(s, id, 1, refine.inputs[id] * 10));
      r = E.start(s, refine.id); assert(r.ok, 'start refine: ' + r.reason);
      ev = runTicks(s, (e) => !s.active, 3600);
      assert(ev.filter((x) => x.type === 'complete').length >= 10, 'refined 10');
      assert(ev.some((x) => x.type === 'stopped'), 'refine stops when out');
      say(`refined ${refine.id} until out of inputs`);
    }
    // craft 50 gear
    const craft = allActions().filter((a) => isGearCraft(a)).sort((a, b) => a.level - b.level)[0];
    assert(craft, 'no gear craft');
    Object.keys(craft.inputs || {}).forEach((id) => addItem(s, id, 2, craft.inputs[id] * 50));
    s.skills[craft.skill].xp = Math.max(s.skills[craft.skill].xp, E.xpForLevel(num(craft.level, 1)));
    const po = E.procOdds(s, craft.id);
    assert(po && Math.abs(po.odds.reduce((a, o) => a + o.chance, 0) - 1) < 1e-9, 'odds sum to 1');
    r = E.start(s, craft.id); assert(r.ok, 'start craft: ' + r.reason);
    ev = runTicks(s, (e) => !s.active, 20000);
    const crafts = ev.filter((x) => x.type === 'craft');
    assert(crafts.length === 50, 'crafted 50 (got ' + crafts.length + ')');
    const byR = {}; crafts.forEach((c) => { byR[c.rarity] = (byR[c.rarity] || 0) + 1; });
    assert(crafts.some((c) => rarityIdx(c.rarity) >= 2) || num(cfg().pityThreshold, 40) > 50, 'pity should guarantee a rare+ by 50');
    say(`crafted 50 ${craft.id}: ${JSON.stringify(byR)}`);
    // gear ops
    const loose = s.gear.filter((g) => !isEquipped(s, g.uid));
    assert(E.gearName(loose[0]).length > 0, 'gearName');
    assert(E.equip(s, loose[0].uid).ok, 'equip');
    const fc = E.fuseCandidates(s);
    if (fc.length) { r = E.fuse(s, fc[0].itemId); assert(r.ok && r.gear, 'fuse'); }
    const sv = s.gear.find((g) => !isEquipped(s, g.uid));
    if (sv) { r = E.salvage(s, sv.uid); assert(r.ok, 'salvage'); }
    const eq = s.gear.find((g) => isEquipped(s, g.uid)); eq.dur = 1;
    assert(E.repairCost(s, eq.uid).gold > 0, 'repair cost'); s.gold += 1000; assert(E.repair(s, eq.uid).ok, 'repair');
    // re-equip a weapon
    const weap = s.gear.find((g) => item(g.itemId).slot === 'weapon'); if (weap) E.equip(s, weap.uid);
    // combat
    const combat = allActions().filter((a) => a.kind === 'combat').sort((a, b) => a.level - b.level)[0];
    assert(combat, 'no combat');
    r = E.start(s, combat.id); assert(r.ok, 'start combat: ' + r.reason);
    ev = runTicks(s, (e) => e.filter((x) => x.type === 'kill').length >= 10 || !s.active, 3600);
    assert(ev.some((x) => x.type === 'kill' || x.type === 'faint'), 'combat produced kills');
    say(`combat: ${ev.filter((x) => x.type === 'kill').length} kills, ${ev.filter((x) => x.type === 'eat').length} eats, hp ${Math.round(s.hp)}`);
    E.stop(s);
    // market
    const l = s.market.listings[0]; s.gold += 5000;
    r = E.buy(s, l.id, 1); assert(r.ok, 'buy: ' + r.reason);
    const anyId = Object.keys(s.inv)[0]; const gr = s.inv[anyId].findIndex((x) => x > 0);
    r = E.list(s, anyId, gr, 1, 2); assert(r.ok, 'list: ' + r.reason);
    const before = s.gold; runTicks(s, () => !s.market.mine.length, 600);
    assert(s.market.mine.length === 0 && s.gold > before, 'cheap listing sold');
    assert(E.list(s, anyId, gr, 999999, 1).ok === false, 'list too many fails');
    // estimate
    const est = E.gatherEstimate(s, Object.keys(gather[0].outputs)[0]); assert(est > 0, 'gatherEstimate');
    // donate
    const req = s.supply.requests[0]; addItem(s, req.itemId, 0, 60);
    const q = E.supplyQuote(s, req.itemId, 60); r = E.donate(s, req.itemId, 60);
    assert(r.ok && r.coins === q.coins, 'donate');
    assert(E.supplyQuote(s, req.itemId, 10).coins <= Math.floor(req.rate * 10 * 0.5) + 1, 'diminishing returns');
    // raid
    E.setRaidRules(s, { eatAt: 0.9, stance: 'nonsense', tokens: 9999 });
    assert(s.raid.rules.eatAt === 0.8 && s.raid.rules.stance === 'balanced' && s.raid.rules.tokens === s.tokens, 'rules clamp');
    const pv = E.raidPreview(s); assert(pv.boss && Array.isArray(pv.advice), 'raidPreview');
    const wk = s.week; r = E.runRaid(s);
    assert(r.ok && r.timeline.length >= 6 && r.timeline.length <= RAID_FRAMES && r.result && r.recap && s.week === wk && s.raid.resolvedWeek === wk, 'runRaid: ' + r.reason);
    r.timeline.forEach((f) => assert(isFinite(f.bossHpPct) && isFinite(f.playerHpPct) && f.t >= 0 && f.t <= 1, 'frame finite'));
    assert(r.result.leaderboard.length <= 8 && r.result.leaderboard.some((e) => e.you), 'leaderboard');
    say(`raid: dealt ${r.result.damage}, share ${(r.result.sharePct * 100).toFixed(2)}%, boss ${E.fmt(r.result.bossHpBefore)} -> ${E.fmt(r.result.bossHpAfter)}, ate ${JSON.stringify(r.result.eaten)}`);
    // crew: posting
    assert(s.crew && s.crew.members.length >= 12 && s.crew.members.filter((m) => m.skill).length >= 4, 'crew members');
    s.crew.jobs = [];
    let cev = E.tick(s, 0.25);
    assert(cev.filter((x) => x.type === 'jobPosted').length >= CREW_MIN_JOBS && s.crew.jobs.length >= CREW_MIN_JOBS, 'jobs posted');
    s.crew.nextPostIn = 0.1; const nBefore = s.crew.jobs.length; cev = E.tick(s, 0.25);
    assert(nBefore >= CREW_MAX_JOBS || cev.some((x) => x.type === 'jobPosted'), 'job posted on timer');
    assert(s.crew.jobs.length <= CREW_MAX_JOBS, 'job cap');
    assert(E.crewJobs(s).every((j) => j.action && j.station && j.canAssist && isFinite(j.etaSec) && j.outputItemId), 'crewJobs shape');
    // crew: level lock
    const hard = allActions().filter((a) => isJobAction(a) && E.skillLevel(s, a.skill) < num(a.level, 1)).sort((a, b) => b.level - a.level)[0];
    if (hard) {
      const hj = postJob(s, hard.id);
      assert(!E.canAssist(s, hj.id).ok && !E.assist(s, hj.id).ok && !(s.active && s.active.jobId === hj.id), 'level-locked job refused');
      s.crew.jobs = s.crew.jobs.filter((j) => j !== hj);
    }
    // crew: assist start/stop
    const job = postJob(s, craft.id); job.qty = 6;
    r = E.assist(s, job.id); assert(r.ok && s.active && s.active.jobId === job.id, 'assist start: ' + r.reason);
    assert(E.activeInfo(s).kind === 'assist' && E.activeInfo(s).owner === job.owner, 'activeInfo assist');
    assert(E.crewJobs(s).find((j) => j.id === job.id).assisting, 'crewJobs assisting flag');
    E.stop(s); assert(s.active === null, 'assist stop');
    r = E.assist(s, job.id); assert(r.ok, 'assist again');
    const xpBefore = s.skills[craft.skill].xp, mBefore = num(s.mastery[craft.id], 0), gBefore = s.gold;
    ev = runTicks(s, (e) => e.some((x) => x.type === 'jobDone' && x.jobId === job.id), 600);
    const assists = ev.filter((x) => x.type === 'assist' && x.jobId === job.id);
    const done = ev.find((x) => x.type === 'jobDone' && x.jobId === job.id);
    assert(assists.length > 0 && done, 'assist crafts + jobDone');
    assert(Math.abs(s.skills[craft.skill].xp - xpBefore - assists.reduce((a, x) => a + x.xp, 0)) < 1e-6 && assists[0].xp > 0, 'assist xp');
    assert(num(s.mastery[craft.id], 0) - mBefore === assists.length, 'assist mastery');
    assert(assists.every((x) => x.rarity && x.items.length), 'gear job rolls rarity');
    assert(!ev.some((x) => x.type === 'complete'), 'no complete events for assist crafts');
    assert(done.assisted === assists.length && done.tip > 0 && s.gold >= gBefore + done.tip, 'tip paid');
    assert(s.active === null && ev.some((x) => x.type === 'stopped' && x.reason === 'Job finished.'), 'job finish stops assist');
    assert(!s.crew.jobs.some((j) => j.id === job.id), 'finished job removed');
    say(`assist: ${assists.length} crafts for ${job.owner}, ${assists.reduce((a, x) => a + x.xp, 0)} xp, tip ${done.tip}g`);
    // crew: offline assist (at offlineRate)
    const job2 = postJob(s, craft.id); job2.qty = 20; E.assist(s, job2.id);
    s.lastSeen = Date.now() - 3600 * 1000;
    const offA = E.applyOffline(s, Date.now());
    assert(offA.summary.assisted > 0 && offA.summary.xp[craft.skill] > 0, 'offline assist xp');
    // crew: v1 save migration
    const v1 = JSON.parse(JSON.stringify(s)); delete v1.crew; v1.active = { actionId: gather[0].id, progress: 1 };
    const mv = migrate(v1);
    assert(mv && mv.crew && mv.crew.members.length >= 12 && mv.crew.jobs.length >= CREW_MIN_JOBS && mv.active && !mv.active.jobId, 'v1 save migrates crew');
    const v1b = JSON.parse(JSON.stringify(s)); delete v1b.crew; v1b.active = { actionId: craft.id, progress: 0, jobId: 'gone' };
    assert(migrate(v1b).active === null, 'stale jobId dropped on migrate');
    finite(s);
    // offline
    E.start(s, gather[0].id); s.lastSeen = Date.now() - 13 * 3600 * 1000;
    const t0 = Date.now(); const off = E.applyOffline(s, Date.now());
    assert(off.seconds === num(cfg().offlineCapSec, 43200), 'offline cap');
    assert(Date.now() - t0 < 2000, 'offline fast');
    say(`offline ${E.fmtTime(off.seconds)}: ${JSON.stringify(off.summary.items)}`);
    // save round trip via migrate
    const back = migrate(JSON.parse(JSON.stringify(s))); assert(back && back.gold === s.gold, 'migrate round trip');
    assert(migrate({ junk: true }) === null, 'corrupt save rejected');
    finite(s);
    assert(E.fmt(1234) === '1.2k' && E.fmtTime(252) === '4m 12s' && E.fmtTime(7500) === '2h 5m', 'formatters');
    testV4(assert, say);
    say('all checks passed');
    return true;
  };

  // ---------------------------------------------------------------- v4 checks
  function testV4(assert, say) {
    const kit = (s, ids) => ids.forEach((id) => { const g = makeGear(s, id, 0, 70); E.equip(s, g.uid); });
    const fresh = () => { const s = E.newState(); s.raid.resolvedWeek = s.week - 1; return s; };
    // --- migration from a v3 save (v:1 shape, no v4 fields)
    const s0 = E.newState(); s0.week = 5; s0.tokens = 3;
    const v3 = clone(s0); v3.v = 1;
    ['clock', 'server', 'loadouts', 'economy'].forEach((k) => delete v3[k]);
    v3.raid = { ladder: 1, bossHp: V3_BOSS_HP[1] / 2, rules: { eatAt: 0.6, stance: 'defensive', tactic: 'interrupt', tokens: 2 }, last: { won: false, damage: 10 } };
    v3.crew = { name: 'Old crew', members: s0.crew.members.slice(0, 4).map((m) => ({ name: m.name, skill: m.skill })), jobs: s0.crew.jobs, nextPostIn: 30 };
    const m = migrate(clone(v3));
    assert(m && m.v === SCHEMA && m.week === 5 && E.weekNumber(m) === 5, 'v3 migrate: schema + week anchored');
    const mr = curRecord(m); const mb = E.currentBoss(m);
    assert(m.raid.ladder === 1 && mb.id === bosses()[1].id && Math.abs(mr.hpLeft / mr.maxHp - 0.5) < 0.01 && m.raid.bossHp === mr.hpLeft, 'v3 migrate: boss HP fraction carried');
    assert(m.raid.bosses[bosses()[0].id].killedWeek != null && mr.revealedWeek === 5, 'v3 migrate: ladder history + reveal');
    assert(m.raid.rules.stance === 'defensive' && m.raid.rules.tactic === 'interrupt' && m.raid.last && m.raid.last.damage === 10, 'v3 migrate: rules + last kept');
    assert(m.loadouts.length === 1 && SLOTS.every((sl) => m.loadouts[0].slots[sl] === m.equipped[sl]), 'v3 migrate: loadout seeded from equipped');
    assert(m.crew.name === 'Old crew' && m.crew.members.length >= 12 && m.crew.members[0].rank === 'leader' && m.crew.playerRank === 'officer' && m.crew.treasury.coin >= 0 && m.crew.vault, 'v3 migrate: crew v4 fields');
    assert(m.raid.resolvedWeek === 4 && !m.raid.lock && m.server.popHistory.length === 4, 'v3 migrate: raid pending this week');
    const m2 = migrate(clone(m)); assert(m2 && m2.v === SCHEMA && m2.raid.ladder === 1 && curRecord(m2).hpLeft === mr.hpLeft && m2.loadouts.length === 1, 'v4 round trip');
    say('v3 save migrates to v4');
    // --- clock + auto raid at window start
    const c = fresh(); const w = E.raidWindow(c);
    assert(w.end - w.start === 36 * 3600000 && new Date(w.start).getDay() === 6 && new Date(w.start).getHours() === 10, 'raid window Sat 10:00 +36h');
    const ck = E.clock(c); assert(typeof ck.live === 'boolean' && ck.ms > 0 && /^Week \d+ · /.test(ck.label), 'clock shape');
    let r = E.devSetClock(c, 'raid');
    assert(r.ok && E.isRaidWindow(c) && E.defaultTab(c) === 'raid' && r.events.some((e) => e.type === 'raidLocked' && e.auto) && r.events.some((e) => e.type === 'raidResolved'), 'auto-lock + fight at window start');
    assert(E.raidStatus(c).phase === 'live' && /Raid live/.test(E.clock(c).label) && E.lastRecap(c).auto, 'raid live status');
    const wk = c.week; r = E.devSetClock(c, 'nextWeek');
    assert(c.week === wk + 1 && r.events.some((e) => e.type === 'weekStart') && !c.raid.lock && E.defaultTab(c) === 'workshop', 'monday rollover');
    say('clock: window, auto-lock, rollover');
    // --- loadouts, tags, binding, vault flags incomplete
    const L = fresh(); kit(L, ['bronze_sword', 'leather_cap', 'leather_jerkin', 'leather_breeches']);
    const cow = makeGear(L, 'herbalist_cowl', 0, 60); const sat = makeGear(L, 'foragers_satchel', 0, 60);
    const ab = E.autoBuild(L, 'foraging', { save: true, name: 'Forager' });
    assert(ab.ok && ab.slots.head === cow.uid && ab.slots.offhand === sat.uid && ab.gain > 0 && ab.loadout, 'autoBuild foraging');
    const cmp = E.compareLoadout(L, ab.loadout.id);
    assert(cmp.deltas.some((d) => d.tag === 'foraging' && d.delta > 0 && /^\+\d+(\.\d)?% foraging yield vs\. equipped$/.test(d.text)), 'compare delta text: ' + JSON.stringify(cmp.deltas.map((d) => d.text)));
    E.bindLoadout(L, ab.loadout.id, 'herbalism');
    const herb = allActions().find((a) => a.skill === 'herbalism' && a.level <= 1);
    r = E.start(L, herb.id); assert(r.ok && r.loadoutId === ab.loadout.id && L.equipped.head === cow.uid, 'bound loadout equips on start');
    assert(E.skillBonus(L, 'herbalism').yield > 0.2 && E.skillBonus(L, 'mining').yield === 0, 'skill bonus applies to its skill');
    E.stop(L);
    r = E.vaultDeposit(L, { kind: 'gear', uid: cow.uid });
    assert(r.ok && r.loadoutsAffected.includes(ab.loadout.id) && !L.equipped.head, 'gear to vault');
    const lv = E.loadouts(L).find((x) => x.id === ab.loadout.id); assert(!lv.complete && lv.missing.includes('head') && E.badges(L).kit.on, 'loadout flagged incomplete');
    assert(E.roleCheck(L, 'striker', 'equipped').ok && !E.roleCheck(L, 'mender').ok, 'role pass/fail vs requirement');
    const up = E.saveLoadout(L, { id: ab.loadout.id, name: 'Renamed', goal: 'quality', slots: { weapon: L.equipped.weapon } });
    assert(up.ok && up.loadout.name === 'Renamed' && up.loadout.goal === 'quality' && up.loadout.slots.weapon === L.equipped.weapon && up.loadout.slots.head === null && up.loadout.slots.chest === null, 'saveLoadout update replaces slots/name/goal');
    say('loadouts: auto-build, compare, bind, incomplete flag');
    // --- pouch + lock-in
    const P = fresh(); kit(P, ['bronze_sword', 'leather_cap', 'leather_jerkin', 'leather_breeches']); addItem(P, 'mint_tonic', 1, 5);
    assert(E.packPouch(P, 'bread', 6).moved === 6 && E.itemCount(P, 'bread') === 4 && E.pouch(P).food === 6, 'pack pouch from bag');
    assert(!E.packPouch(P, 'copper_ore', 1).ok, 'pouch refuses materials');
    E.setRaidPlan(P, { role: 'striker' }); r = E.lockIn(P);
    assert(r.ok && P.raid.lock.role === 'striker' && !E.packPouch(P, 'mint_tonic', 1).ok && !E.setRaidPlan(P, { role: 'mender' }).ok && !E.setRaidRules(P, { stance: 'aggressive' }).ok, 'lock freezes plan/rules/pouch');
    const ls = E.lockSummary(P); assert(ls.locked && ls.roleCheck.ok && ls.tiers.list.length === 3 && ls.projected && ls.pouch.food === 6, 'lock summary');
    assert(E.crewReadiness(P).checks.length === 5 && !JSON.stringify(E.crewReadiness(P)).includes(P.crew.members[0].name), 'readiness: totals only, no names');
    assert(E.unlock(P).ok && !P.raid.lock, 'unlock before raid');
    say('pouch + lock-in');
    // --- contribution carry-over + checkpoint chests
    const K = fresh(); kit(K, ['iron_longsword', 'studded_jerkin', 'studded_leggings', 'hardened_hood']); addItem(K, 'herb_trout', 2, 30); E.packPouch(K, 'herb_trout', 30);
    E.setRaidPlan(K, { role: 'striker' });
    const rec = curRecord(K); rec.hpLeft = Math.round(rec.maxHp * 0.99) + 1e6;
    rec.hpLeft = Math.min(rec.maxHp, Math.round(rec.maxHp * 0.99));
    let a1 = E.startRaidNow(K); assert(a1.ok && !a1.recap.won, 'weekend 1 survives');
    const p1 = a1.recap.contribution.points;
    assert(a1.recap.cores.tickets >= 1 && !a1.recap.cores.drawn && a1.recap.pouchStart === 30, 'held tickets without a draw');
    assert(p1 > 0 && a1.recap.contribution.weekShare > 0 && a1.recap.checks.some((x) => x.helped && /you filled/.test(x.yourText)), 'weekend 1 contribution');
    const chest1 = a1.recap.payout.chests.map((x) => x.at);
    assert(chest1.length >= 1 && chest1.every((at) => rec.checkpointsPaid.includes(at)) && a1.recap.payout.crewCoin > 0, 'checkpoint chests paid: ' + chest1);
    const coin1 = K.crew.treasury.coin + K.crew.treasury.escrow;
    let a2 = E.startRaidNow(K);
    assert(K.week === a1.recap.week + 1 && a2.recap.bossId === a1.recap.bossId, 'same boss next weekend');
    assert(Math.abs(a2.recap.contribution.points - (p1 + a2.recap.contribution.weekPoints)) < 1e-6 && Math.abs(a2.recap.contribution.share - a2.recap.contribution.points / a2.recap.contribution.totalPoints) < 1e-9, 'contribution carries over');
    assert(!a2.recap.payout.chests.some((x) => chest1.includes(x.at)), 'checkpoint chests pay once');
    assert(a2.recap.payout.crewCoin <= num(cfg().crewCoinCap, 180) * (a2.recap.ladderIndex + 1) && a2.recap.payout.crewCoin === Math.min(num(cfg().crewCoinCap, 180), num(cfg().crewCoinPerAttendee, 10) * a2.recap.crew.attended) && K.crew.treasury.coin + K.crew.treasury.escrow === coin1 + a2.recap.payout.crewCoin, 'crew coin by turnout, capped');
    assert(a2.recap.moments.length > 0 && a2.recap.bestMoment && a2.recap.debrief && a2.recap.leaderboards.damage.totals.some((x) => x.mine) && a2.recap.leaderboards.attendance.averages.length > 1, 'recap shape');
    say(`carry-over: ${a1.recap.tier}/${a2.recap.tier}, share ${(a2.recap.contribution.share * 100).toFixed(3)}%, chests ${chest1}`);
    // --- lottery pity + kill + week buff
    const W = fresh(); kit(W, ['iron_longsword']); E.packPouch(W, 'bread', 10); E.setRaidPlan(W, { role: 'striker' });
    const wr = curRecord(W); wr.hpLeft = 1; W.raid.corePity = num(cfg().corePityMax, 3);
    assert(E.coreOdds(W).chance === 1, 'pity guarantees odds');
    const bossBefore = E.currentBoss(W); const coreId = bossBefore.coreItem;
    r = E.startRaidNow(W);
    assert(r.recap.won && r.recap.cores.drawn && r.recap.cores.won === 1 && W.raid.corePity === 0 && E.itemCount(W, coreId) === 1, 'pity core awarded');
    assert(W.raid.ladder === 1 && curRecord(W).revealedWeek == null && E.bossIntel(W).weakTo === null, 'ladder unlock, next boss hidden until Monday');
    const pend = W.server.pendingBuff; assert(pend && pend.week === W.week + 1 && !E.weekBuff(W), 'buff pending for next week');
    W.server.pendingBuff = { kind: 'repair', value: 0.3, label: 'Repairs 30% cheaper', week: W.week + 1 };
    const eq = findGear(W, W.equipped.weapon); eq.dur = 10;
    const cost0 = E.repairCost(W, eq.uid).gold;
    E.devSetClock(W, 'nextWeek');
    assert(E.weekBuff(W) && E.weekBuff(W).kind === 'repair' && E.repairCost(W, eq.uid).discount > 0 && curRecord(W).revealedWeek === W.week, 'repair buff applied next week + boss revealed');
    W.server.pendingBuff = { kind: 'tax', value: 0.02, label: 'Market tax 2%', week: W.week + 1 };
    assert(E.marketTax(W) === num(cfg().marketTax, 0.05), 'tax normal before buff');
    E.devSetClock(W, 'nextWeek'); assert(E.marketTax(W) === 0.02 && E.repairCost(W, eq.uid).discount === 0, 'tax buff applied, repair buff expired');
    // pity counter rises on a losing draw
    const W2 = fresh(); kit(W2, ['training_sword']); curRecord(W2).hpLeft = 1; W2.server.pop = 1e6; W2.raid.corePity = 0;
    r = E.startRaidNow(W2); assert(r.recap.won && (r.recap.cores.won === 1 ? W2.raid.corePity === 0 : W2.raid.corePity === 1), 'pity counter increments on a miss');
    assert(r.recap.tiers && r.recap.tiers.list.length === 3 && r.recap.pouchStart >= r.recap.pouchLeft, 'recap tier snapshot + pouch units');
    say('lottery pity, ladder unlock, week buffs');
    // --- requisitions: escrow + first-in-best-dressed
    const Q = fresh(); Q.crew.treasury.coin = 100; Q.crew.treasury.escrow = 0;
    assert(!E.postRequisition(Q, { itemId: 'mint_tonic', qty: 30, rewardPer: 5, minGrade: 1 }).ok, 'cannot promise more than treasury');
    r = E.postRequisition(Q, { itemId: 'mint_tonic', qty: 10, rewardPer: 5, minGrade: 2 });
    assert(r.ok && Q.crew.treasury.coin === 50 && Q.crew.treasury.escrow === 50 && r.req.escrow === 50, 'escrow at posting');
    const id = r.req.id; addItem(Q, 'mint_tonic', 1, 20);
    assert(!E.fillRequisition(Q, id, 5).ok, 'min grade enforced');
    addItem(Q, 'mint_tonic', 3, 6);
    Q.crew.reqSimIn = 0; Q.crew.members.length = Math.max(1, Q.crew.members.length); crewEconomyStep(Q, 0.1, []);
    const rq = () => Q.crew.requisitions.find((x) => x.id === id);
    const npcQty = rq().submissions[0].qty; assert(rq().submissions.length === 1 && rq().submissions[0].who !== 'You' && rq().paid === npcQty * 5, 'crewmate submits first, paid');
    const g0 = Q.gold; r = E.fillRequisition(Q, id, 99);
    const accept = Math.min(6, 10 - npcQty);
    assert(r.ok && r.accepted === accept && r.paid === accept * 5 && Q.gold === g0 + accept * 5 && rq().submissions[1].who === 'You', 'player paid in submission order');
    assert(invCount(Q.crew.vault.inv, 'mint_tonic') === npcQty + accept, 'goods go to the vault');
    if (rq().status === 'open') { Q.crew.reqSimIn = 0; for (let k = 0; k < 40 && rq().status === 'open'; k++) { Q.crew.reqSimIn = 0; crewEconomyStep(Q, 0.1, []); } }
    assert(rq().status === 'filled' && rq().filled === 10 && rq().escrow === 0 && rq().paid === 50 && !E.fillRequisition(Q, id, 1).ok, 'filled closes; later submissions unpaid');
    assert(Q.crew.treasury.escrow === 0 && Q.crew.treasury.coin === 50 && Q.crew.feed.some((f) => f.kind === 'payout'), 'treasury balances + feed');
    r = E.postRequisition(Q, { itemId: 'bread', qty: 4, rewardPer: 5, minGrade: 0 }); const cr2 = E.cancelRequisition(Q, r.req.id);
    assert(cr2.ok && cr2.refunded === 20 && Q.crew.treasury.coin === 50, 'cancel refunds escrow');
    assert(E.neededByCrew(Q).every((n) => n.remaining > 0), 'needed by crew');
    assert(Q.crew.feed.some((f) => f.who !== 'You' && f.kind === 'payout' && new RegExp('^' + f.who + ' filled \\d+ Mint tonic, \\+\\d+g$').test(f.text)), 'feed logs crewmate fills');
    const big = E.postRequisition(Q, { itemId: 'bread', qty: 50, rewardPer: 5 }); assert(!big.ok && /treasury has/.test(big.reason), 'reject beyond free coin');
    say('requisitions: escrow, ordering, payouts');
    // --- permissions + ask an officer
    const M = fresh(); addItem(M, 'bread', 1, 5); E.vaultDeposit(M, 'bread', null, 5);
    E.setViewAsMember(M, true);
    assert(!E.can(M, 'withdraw').ok && /Ask an officer/.test(E.vaultWithdraw(M, 'bread', null, 1).reason) && !E.postRequisition(M, { itemId: 'bread', qty: 1, rewardPer: 0 }).ok, 'member perms greyed');
    r = E.requestWithdrawal(M, { itemId: 'bread', qty: 2 }); assert(r.ok, 'withdrawal request');
    const b0 = E.itemCount(M, 'bread'); crewEconomyStep(M, 200, []);
    assert(E.itemCount(M, 'bread') === b0 + 2 && M.crew.withdrawRequests[0].status === 'approved', 'officer answers request');
    E.setViewAsMember(M, false); assert(E.vaultWithdraw(M, 'bread', null, 1).ok && E.withdrawCapLeft(M) === num(rankDef('officer').withdrawCap, 40) - 1, 'officer withdraw + daily cap');
    const mem = M.crew.members.find((x) => x.rank === 'member'); assert(E.setMemberRank(M, mem.id, 'recruit').ok && !E.setMemberRank(M, M.crew.members[0].id, 'member').ok, 'manage roles');
    say('crew permissions');
    // --- debrief gap -> requisition
    const G = fresh(); G.crew.members.forEach((x) => { x.pf = 0.4; x.basePf = 0.4; x.food = 0; }); G.crew.treasury.coin = 500;
    r = E.startRaidNow(G); const gap = r.recap.debrief.gaps[0];
    assert(gap && gap.suggestion && gap.suggestion.itemId, 'debrief reports a gap');
    const gr = E.requisitionFromGap(G, gap.id, true); assert(gr.ok && gr.req && gr.req.source === 'debrief', 'gap -> requisition');
    // --- offline across a raid window
    const O = fresh(); E.devSetClock(O, 'friday'); O.raid.resolvedWeek = O.week - 1;
    O.clock.offsetMs += (E.raidWindow(O).start - E.now(O)) + 3600000; O.lastSeen = Date.now() - 3600 * 1000;
    const off = E.applyOffline(O, Date.now()); assert(off.summary.raids.length === 1 && O.raid.resolvedWeek === O.week, 'offline progress resolves the weekend raid');
    // --- farm raids
    const F = fresh(); kit(F, ['iron_longsword']); F.raid.ladder = 1; ensureV4(F);
    const fr = E.farmRaids(F); if (fr.allowed) { r = E.runFarmRaid(F, bosses()[0].id); assert(r.ok && E.farmRaids(F).runsLeft === fr.runsLeft - 1, 'farm raid'); }
    say('debrief gap, offline raid, farm raid');
    // --- QA-04: tier, share and tickets agree and use the carried-over share
    const T = fresh(); kit(T, ['iron_longsword', 'studded_jerkin']); addItem(T, 'herb_trout', 2, 20); E.packPouch(T, 'herb_trout', 20); E.setRaidPlan(T, { role: 'striker' });
    const tr = curRecord(T); tr.hpLeft = Math.round(tr.maxHp * 0.95);
    const t1 = E.startRaidNow(T).recap; curRecord(T).hpLeft = 1;
    const t2 = E.startRaidNow(T).recap;
    [t1, t2].forEach((rc) => {
      const exp = rc.tiers.list.filter((x) => rc.contribution.share >= x.share - 1e-12).map((x) => x.tier).pop() || 'none';
      assert(rc.tier === exp, 'tier from carried share');
      const tk = cfg().tierTickets; const bd = rc.cores.breakdown;
      assert(bd.floor === num(tk.floor, 1) && bd.tier === num(tk[rc.tier], 0) && rc.cores.tickets === bd.floor + bd.tier + bd.tokens && rc.payout.tier.tier === rc.tier && rc.cores.tier === rc.tier, 'tickets breakdown matches tier');
    });
    assert(t2.won && t2.bossId === t1.bossId && t2.tierBasis === 'carried' && /carried over/.test(t2.tierLabel) && Math.abs(t2.contribution.share - (t1.contribution.weekPoints + t2.contribution.weekPoints) / t2.contribution.totalPoints) < 1e-9, 'carried basis on weekend 2');
    // --- QA-08: event times fall inside the window, also for Start raid now
    [t1, t2].forEach((rc) => {
      const all = rc.moments.map((x) => x.at).concat(rc.bestMoment ? [rc.bestMoment.at] : []).concat((rc.timeline || []).map((f) => f.at));
      assert(all.length && all.every((x) => x >= rc.windowStart && x <= rc.windowEnd) && rc.startedAt >= rc.windowStart, 'recap times inside the raid window');
      const st = new Date(rc.startedAt); assert(st.getDay() === 6 || st.getDay() === 0, 'fight starts on the weekend');
    });
    // --- QA-07: clock shows the done state after a Start raid now run
    const ckd = E.clock(T); assert(ckd.raidDone && !ckd.live && /^Week \d+ · Raid done · next in /.test(ckd.label) && ckd.nextRaidStart > ckd.now && ckd.ms === ckd.nextRaidStart - ckd.now, 'clock done state: ' + ckd.label);
    assert(E.raidStatus(T).phase === 'done' && E.raidStatus(T).fightPct === 1, 'instant raid status done');
    // --- QA-05: each debrief check has one state
    [t1, t2].forEach((rc) => { assert(rc.debrief.checks.length === 5 && rc.debrief.checks.every((x) => (x.state === 'gap') === rc.debrief.gaps.some((g) => g.check === x.id)) && rc.debrief.gaps.every((g) => g.check !== 'food' || g.pct < 0.85), 'one state per check'); });
    // --- QA-03: coin requisition without free coin fails unless coin-free
    const G2 = fresh(); G2.crew.members.forEach((x) => { x.food = 0; x.potions = 0; }); const gp = E.startRaidNow(G2).recap.debrief.gaps[0];
    assert(gp, 'starved crew shows a gap');
    G2.crew.treasury.coin = 0;
    const no = E.requisitionFromGap(G2, gp.id, true); assert(!no.ok && /coin-free/.test(no.reason) && !no.draft.affordable, 'gap post refused without coin');
    const yes = E.requisitionFromGap(G2, gp.id, true, { coinFree: true }); assert(yes.ok && yes.req.rewardPer === 0 && yes.req.escrow === 0, 'explicit coin-free post');
    // --- QA-26: stable roster across loads and views
    const R1 = fresh(); const ids1 = E.crewMembers(R1).map((x) => x.id + ':' + x.seed).join();
    E.setViewAsMember(R1, true); const ids2 = E.crewMembers(R1).map((x) => x.id + ':' + x.seed).join(); E.setViewAsMember(R1, false);
    assert(ids1 === ids2 && E.crewMembers(migrate(clone(R1))).map((x) => x.id + ':' + x.seed).join() === ids1, 'roster stable');
    const v3r = clone(R1); v3r.v = 1; ['clock', 'server', 'loadouts', 'economy'].forEach((k) => delete v3r[k]);
    v3r.crew = { name: 'C', members: R1.crew.members.slice(0, 4).map((x) => ({ name: x.name, skill: x.skill })), jobs: [], nextPostIn: 30 };
    const sig = (st) => st.crew.members.map((x) => x.name + x.seed + x.basePf).join();
    assert(sig(migrate(clone(v3r))) === sig(migrate(clone(v3r))), 'v3 roster fill deterministic');
    // --- coverage: sealed pouch blocks crafting; aura weakening per wave
    const B = fresh(); addItem(B, 'minnow', 1, 10); addItem(B, 'grilled_minnows', 1, 2); E.packPouch(B, 'grilled_minnows', 2); E.lockIn(B);
    assert(E.canStart(B, 'grill_minnows').ok, 'weekday crafting allowed while locked');
    B.clock.offsetMs += E.raidWindow(B).start - E.now(B) + 60000;
    const pbr = E.canStart(B, 'grill_minnows'); assert(!pbr.ok && pbr.pouchBlocked, 'mid-raid consumable crafting blocked');
    const aw = t2.checks.concat(t1.checks); assert(aw.every((x) => isFinite(x.auraTier) && isFinite(x.auraTierMin) && x.auraTierMin <= x.auraTier && isFinite(x.auraLoss) && typeof x.auraWeakened === 'boolean'), 'aura weakening per wave');
    say('QA-03/04/05/07/08/26 + pouch block + aura weakening');
  }

  GW.Engine = E;
})();
