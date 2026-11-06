export declare const DEFAULT_START: number;
export declare function mulberry32(seed: number): () => number;
export declare function memoryStorage(): Storage;
export interface LegacyHarness {
  GW: any;
  context: object;
  localStorage: Storage;
  setTime(ms: number): void;
  advance(ms: number): void;
  now(): number;
  snap<T = any>(v: unknown): T;
}
export declare function loadLegacy(opts?: { seed?: number; start?: number; silent?: boolean }): LegacyHarness;
