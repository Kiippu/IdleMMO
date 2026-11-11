// Dumps item metadata from the engine to JSON (stdout): used by build.py to check the mapping covers every item.
import { DATA } from '../../engine/src/data.ts';
const out = Object.values(DATA.items).map((i) => ({ id: i.id, name: i.name, kind: i.kind, tier: i.tier, sprite: i.sprite, tint: i.tint || null, slot: i.slot || null, role: i.role || null }));
process.stdout.write(JSON.stringify(out, null, 1));
