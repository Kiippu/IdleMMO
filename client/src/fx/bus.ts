// Lets other components (the return reveal) ask the Fountain for a celebration.
import type { Gain } from './gains';
export type Celebration = { gains: Gain[]; coins: number; big?: boolean };
export const fxBus: { handler: ((c: Celebration) => void) | null } = { handler: null };
export const celebrate = (c: Celebration) => fxBus.handler?.(c);
