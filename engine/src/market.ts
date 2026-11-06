// Market: NPC listings, buying, player listings, fills, pricing.
// Ported from legacy/engine.js lines 977-1086. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { ctx } from './context';
import { E, MAX_PLAYER_LISTINGS, D, arr, num, grades, skillDefs, itemsMap, item, allActions, rand, clamp, randInt, pick, lcFirst, itemName, qtyAvg, zeros5, isStackable, nextId } from './core';
import { addItem, cleanInv } from './inventory';
import { actionTimeWith } from './actions';

// ---------------------------------------------------------------- market
export function tierCap(state) {
  const top = skillDefs().reduce((m, s) => Math.max(m, E.skillLevel(state, s.id)), 1);
  return clamp(1 + Math.floor(top / 15), 1, 5);
}
export function usableItemIds(state) { // inputs to actions the player has unlocked (or nearly)
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
  state.market.refreshedAt = ctx.now();
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
