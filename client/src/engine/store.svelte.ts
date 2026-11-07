// Reactive store for the engine snapshot and most recent events.
// Components read directly; the RPC client in ./client.ts is the only writer.
// Must live in a .svelte.ts module so $state is compiled by the Svelte plugin.
import type { Snapshot, EngineEvent, OfflineSummary, Derived } from './protocol';

export const engine = $state<{
  snapshot: Snapshot | null;
  derived: Derived | null;
  ready: boolean;
  offline: OfflineSummary | null;
  defaultTab: 'workshop' | 'raid';
  lastEvents: EngineEvent[];
  lastError: string | null;
}>({
  snapshot: null,
  derived: null,
  ready: false,
  offline: null,
  defaultTab: 'workshop',
  lastEvents: [],
  lastError: null,
});
