// Raid recap view (phase 3 layout pass, 2026-11-11). A read-only selector over a stored recap so the recap
// screen can show turnout pay and contribution pay as separate numbers (with any cap overflow to the
// treasury), the chest loot as item ids + qty, and one plain "what to do next week" hint.
/* eslint-disable */
import { E, arr, num, item, itemName, lcFirst } from './core';
import { ECON } from './data';
import { TIER_NAME, CHECK_LABEL } from './v4-helpers';

const pctText = (x) => { const p = num(x, 0) * 100; return (p === 0 ? '0' : p < 0.1 ? p.toFixed(3) : p < 10 ? p.toFixed(1) : p.toFixed(0)) + '%'; };
const rarityOf = (id) => (item(id) && item(id).rarity) || 'common';
/** [{itemId, grade, qty}] → [{itemId, name, qty, rarity}] summed over grades, list order kept */
function groupItems(list) {
  const out = []; const at = {};
  arr(list).forEach((x) => {
    const id = x && (x.itemId || x.id); if (!id || !(num(x.qty, 0) > 0)) return;
    if (at[id] == null) { at[id] = out.length; out.push({ itemId: id, name: itemName(id), qty: 0, rarity: rarityOf(id) }); }
    out[at[id]].qty += num(x.qty, 0);
  });
  return out;
}

export function recapView(recap) {
  if (!recap) return null;
  const p = recap.payout || {}; const sp = p.split || null;
  const gold = Math.round(num(p.gold, 0));
  // Recaps written before 2026-11-09 have no split: the whole amount was an even share.
  const turnoutPay = sp ? Math.round(num(sp.floor, 0)) : gold;
  const contributionPay = sp ? Math.round(num(sp.byContribution, 0)) : 0;
  const capCut = sp ? Math.round(num(sp.cutToTreasury, 0)) : 0;
  const crewTreasury = Math.round(num(p.crewGold, 0));
  const pay = {
    gold, turnoutPay, contributionPay,
    /** what your income cap cut from turnoutPay + contributionPay; it went to the crew treasury */
    capCut, cap: sp ? Math.round(num(sp.cap, 0)) : null, capped: capCut > 0,
    /** your share of the crew's check points: what contributionPay was split by (NOT payout.yourShare) */
    pointShare: sp ? num(sp.pointShare, 0) : null, pointShareText: sp ? pctText(sp.pointShare) : null,
    evenShare: num(ECON.raidEvenShare, 0.25), contribShare: num(ECON.raidContribShare, 0.75),
    pool: Math.round(num(p.pool, 0)), poolCapped: !!p.capped,
    /** all gold the treasury got from this raid: its pool share + capCut */
    crewTreasury, treasuryShare: Math.max(0, crewTreasury - capCut),
    /** the CREW's fill of what the raid needed (0..1; scales the pool). Different thing from pointShare. */
    crewContribution: num(p.crewContribution != null ? p.crewContribution : p.contribution, 0),
    /** label pair for the two percentages, so they don't read as contradictory */
    crewContributionText: `Crew filled ${pctText(num(p.crewContribution != null ? p.crewContribution : p.contribution, 0))} of what the raid needed`,
    pointShareLabel: sp ? `Your part of the crew's points: ${pctText(sp.pointShare)}` : null,
    hasSplit: !!sp,
  };
  const chests = arr(p.chests).map((c) => ({ at: num(c.at, 0), items: groupItems(c.items) }));
  const chestLoot = groupItems([].concat(...arr(p.chests).map((c) => arr(c.items))));
  const loot = groupItems(p.items);

  // next-week hints, most useful first
  const hints = [];
  const tierList = arr(recap.tiers && recap.tiers.list);
  if (!recap.joined) hints.push({ kind: 'join', text: 'Lock in a loadout before the raid opens so you take part and get paid.' });
  else {
    if (num(recap.faints, 0) > 0) hints.push({ kind: 'survive', text: `You fainted ${recap.faints === 1 ? 'once' : recap.faints + ' times'}. Pack more food or raise your defence.` });
    const share = num(recap.contribution && recap.contribution.weekShare, 0);
    const next = tierList.find((t) => share < num(t.share, 0) - 1e-12);
    if (next) {
      const name = next.label || TIER_NAME[next.tier];
      const way = num(next.share, 0) > 0 ? Math.floor(share / num(next.share, 1) * 100) : 0;
      const text = share <= 0 ? `Take part in more checks next weekend to reach ${name}.`
        : `Help fill more checks next weekend to reach ${name}${way >= 1 ? ` (you got ${way}% of the way there)` : ''}.`;
      hints.push({ kind: 'tier', tier: next.tier, text });
    }
  }
  const gap = arr(recap.debrief && recap.debrief.gaps)[0];
  if (gap) {
    const it = gap.suggestion && gap.suggestion.itemId;
    hints.push({ kind: 'crew', check: gap.check, itemId: it || null, text: `The crew was short: ${lcFirst(gap.text || (CHECK_LABEL[gap.check] || gap.check) + ' fell short')}.${it ? ` Hand in ${itemName(it)} on Contracts.` : ''}` });
  }
  const tier = recap.joined ? (recap.tier || 'none') : 'none';
  const carried = recap.joined && num(recap.contribution && recap.contribution.weekends, 0) > 1;
  const tierLabel = !recap.joined ? 'Sat out' : (tier === 'none' ? 'No tier yet' : TIER_NAME[tier] || tier) + (carried ? ' (carried over)' : '');
  return { id: recap.id, week: recap.week, won: !!recap.won, joined: !!recap.joined, tier, tierLabel, pay, chests, chestLoot, loot, hints, nextWeekHint: hints[0] || null };
}
E.recapView = function (state, recapId) {
  const list = arr(state && state.raid && state.raid.recaps);
  return recapView(recapId ? list.find((r) => r && r.id === recapId) : list[0]);
};
