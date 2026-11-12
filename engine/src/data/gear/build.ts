// Generates every gear item and its craft recipe from FAMILIES x tiers (gear spec 2026-11-12).
/* eslint-disable */
import { FAMILIES, OVERRIDES } from './families';
import { MATERIALS, INPUTS } from './materials';
import { TIERS_LIVE, TIER_LEVEL, TOOL_EFFECT, OUTFIT_EFFECT, SKILL_GROUP, NAMED_ELEMENT_SHARE, BOW_ELEMENT_BONUS, TOOL_INPUT_TARGET, shareOf, baseStatsRaw } from './model';

export const craftSecs = (level) => 4 + Math.floor(level / 10);
export const craftXp = (level) => Math.round(10 + 1.5 * level + 0.012 * level * level);

/** valueOf(itemId) = Standard value of a material (used to scale tool recipes to TOOL_INPUT_TARGET) */
export function buildGear(tiers = TIERS_LIVE, valueOf?: (id: string) => number) {
  const items: Record<string, any> = {}; const actions: any[] = [];
  for (const tier of tiers) {
    for (const f of FAMILIES as any[]) {
      const m = MATERIALS[f.mat][tier]; if (!m) continue;
      const genId = `${m.key}_${f.type}`; const ov = OVERRIDES[genId] || {};
      const id = ov.id || genId;
      const name = ov.name || `${m.name} ${f.words}`;
      const level = ov.level || TIER_LEVEL[tier] + f.off;
      const it: any = { id, name, kind: 'gear', section: f.section, slot: f.slot, tier, type: f.type, material: m.key,
        sprite: f.sprite, tint: ov.tint || m.tint, value: null, maker: f.maker, level };
      if (f.section === 'fight') {
        Object.assign(it, { role: f.role, primary: f.primary, weights: Object.assign({}, f.weights), share: shareOf(f.slot, f.hands) });
        if (f.slot === 'weapon') it.hands = f.hands;
        if (f.armour) it.armour = f.armour;
        it.element = ov.element || null;
        it.elementShare = ov.element ? NAMED_ELEMENT_SHARE : 0;
        if (f.bowBonus) it.bowBonus = BOW_ELEMENT_BONUS;
        const raw = baseStatsRaw(it); it.stats = {};
        Object.keys(raw).forEach((k) => { it.stats[k] = Math.max(1, Math.round(raw[k])); });
      } else if (f.section === 'tool') {
        const group = SKILL_GROUP[f.toolSkill]; const e = TOOL_EFFECT[group];
        Object.assign(it, { toolSkill: f.toolSkill, toolGroup: group, effects: [{ id: e.id, value: e.v[tier] }] });
      } else {
        it.outfitSet = f.outfitSet;
        it.effects = OUTFIT_EFFECT[f.outfitSet].map((e) => Object.assign({ id: e.id, value: e.v[tier] }, e.group ? { group: e.group } : {}));
      }
      items[id] = it;
      let inputs: Record<string, number> = {};
      if (ov.recipe) inputs = Object.assign({}, ov.recipe);
      else Object.keys(f.recipe).forEach((role) => { const inId = INPUTS[role] && INPUTS[role][tier]; if (inId) inputs[inId] = (inputs[inId] || 0) + f.recipe[role]; });
      if (f.section === 'tool' && valueOf) {
        const base = Object.keys(inputs).reduce((a, k) => a + Number(valueOf(k) || 0) * inputs[k], 0);
        const k = base > 0 ? Math.max(1, Math.round(TOOL_INPUT_TARGET[tier] / base)) : 1;
        Object.keys(inputs).forEach((x) => { inputs[x] *= k; });
      }
      actions.push({ id, skill: f.maker, kind: 'craft', name, level, sec: craftSecs(level), xp: craftXp(level), inputs, outputs: { [id]: 1 } });
    }
  }
  return { items, actions };
}
