// Dumps skills, enemies and fight actions from the engine (stdout JSON).
import { DATA } from '../../engine/src/data.ts';
console.log(JSON.stringify({ skills: DATA.skills.map((s) => ({ id: s.id, name: s.name, tier: s.tier })), enemies: Object.keys(DATA.enemies || {}), fight: DATA.actions.filter((a) => a.enemy).map((a) => [a.id, a.skill, a.enemy, a.name]) }));
