// The hero's current look, shared by the scene canvas and the job bar (so hit frames match what is drawn).
import { DATA } from '@guildwright/engine';
import { figure, type Equipped, type Gear, type Look } from './sprites';

const actionById = new Map<string, any>(((DATA as any).actions as any[]).map((a) => [a.id, a]));
const items: Record<string, any> = (DATA as any).items;

export const actionOf = (id: string | null | undefined) => (id ? actionById.get(id) ?? null : null);

function gearAt(s: any, slot: string): Gear | null {
  const uid = s?.equipped?.[slot];
  const g = uid ? (s.gear as any[] | undefined)?.find((x) => x.uid === uid) : null;
  const it = g ? items[g.itemId] : null;
  return it ? { itemId: g.itemId, tier: it.tier ?? 1, role: it.role ?? '' } : null;
}

export function heroLook(s: any): { look: Look; action: any; eq: Equipped } {
  const action = s?.active ? actionOf(s.active.actionId) : null;
  const eq: Equipped = { weapon: gearAt(s, 'weapon'), head: gearAt(s, 'head'), chest: gearAt(s, 'chest'), legs: gearAt(s, 'legs'), offhand: gearAt(s, 'offhand') };
  return { look: figure(action?.skill ?? null, !!action, eq, false), action, eq };
}
