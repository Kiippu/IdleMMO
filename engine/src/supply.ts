// Supply board donations (dropped in the design, kept for parity).
// Ported from legacy/engine.js lines 1087-1151. Behaviour must stay identical to the
// legacy build (see test/parity.test.ts); design changes come in phase 1.
/* eslint-disable */
import { E, arr, num, cfg, itemsMap, item, rand, randInt, shuffle, lcFirst, itemName, isStackable } from './core';
import { consume } from './inventory';
import { tierCap } from './market';

// ---------------------------------------------------------------- supply board
export function counterItems(state) {
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
export function generateSupply(state) {
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
