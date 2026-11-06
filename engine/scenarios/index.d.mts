export interface ScenarioTools {
  E: any;
  now(): number;
  advance(ms: number): void;
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
  step(label: string, payload: { result?: unknown; state?: unknown }): void;
}
export interface Scenario { name: string; seed: number; start?: number; run(t: ScenarioTools): void }
export declare const scenarios: Scenario[];
export declare function give(s: any, id: string, grade: number, qty: number): void;
