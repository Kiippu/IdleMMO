// Public type boundary for @guildwright/engine consumers.
//
// The implementation source is strict-lax on purpose (see engine/PORTING.md and
// engine/tsconfig.json) because it is a near-mechanical port of a dynamic JS
// file. Consumers with strict tsconfigs must not walk into that source, so
// package.json points the `types` export condition at this file. The runtime
// still resolves to src/index.ts.
//
// Keep the surface here in sync with src/index.ts.

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface EngineContext {
  rng: () => number;
  now: () => number;
  storage: SaveStorage | null;
  data: any;
}

/** The engine object (GW.Engine in the prototype). Methods are called dynamically. */
export const Engine: any;

/** Configure the injected context and return the engine. One engine per JS realm. */
export function createEngine(opts: Partial<EngineContext>): any;

/** mulberry32: the seeded RNG used by the fixtures and tests. */
export function mulberry32(seed: number): () => number;

/** In-memory SaveStorage for tests. */
export function memoryStorage(): SaveStorage & { clear(): void };

/** Live engine context (rng/now/storage/data). */
export const ctx: EngineContext;

/** Static game content. */
export const DATA: any;

declare const _default: typeof createEngine;
export default _default;
