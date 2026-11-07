// Reactive store for the engine snapshot and most recent events.
// Components read directly; the RPC client in ./client.ts is the only writer.
// Must live in a .svelte.ts module so $state is compiled by the Svelte plugin.
import type { Snapshot, EngineEvent, OfflineSummary } from './protocol';

export const engine = $state<{
  snapshot: Snapshot | null;
  ready: boolean;
  offline: OfflineSummary | null;
  lastEvents: EngineEvent[];
  lastError: string | null;
}>({
  snapshot: null,
  ready: false,
  offline: null,
  lastEvents: [],
  lastError: null,
});
