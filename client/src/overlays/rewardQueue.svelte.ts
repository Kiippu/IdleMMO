// Queue of quality (above common) gear crafted live, shown one at a time by CraftReward.svelte.
export type Reward = { uid: string; itemId: string; rarity: string; grade?: number };
export const craftReward = $state<{ queue: Reward[]; total: number }>({ queue: [], total: 0 });
export function enqueueRewards(r: Reward[]) {
  if (!r.length) return;
  if (!craftReward.queue.length) craftReward.total = 0;
  craftReward.queue.push(...r); craftReward.total += r.length;
}
export const nextReward = () => { craftReward.queue.shift(); if (!craftReward.queue.length) craftReward.total = 0; };
export const skipRewards = () => { craftReward.queue.length = 0; craftReward.total = 0; };
