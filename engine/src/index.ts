// Public entry: the same API as the prototype's GW.Engine, plus injected context.
// Modules are imported in the legacy file order; each attaches its E.* functions.
import { configure, type EngineContext } from './context';
import { E } from './core';
import './skills';
import './inventory';
import './gear';
import './actions';
import './crew-assist';
import './tick';
import './offline';
import './market';
import './v4-helpers';
import './clock';
import './server';
import './stats';
import './loadouts';
import './raid-rules';
import './raid-sim';
import './raid-payouts';
import './weekly';
import './crew-economy';
import './events';
import './gains';
import './unlocks';
import './readiness';
import './store';
import './codex';
import './recap-view';
import './crew-activity';
import './disabled-reasons';
import './state';

export type { EngineContext, SaveStorage } from './context';
export { mulberry32, memoryStorage, ctx } from './context';
export { DATA, H, ECON } from './data';
// pure display helpers (gear overhaul): the one work-effect format and the one stat wording, main-thread safe
export { fmtEffect, fmtEffectNum, effectShown, statText } from './gear';

/** The engine object (GW.Engine in the prototype). */
export const Engine: any = E;

/**
 * Configure the injected context and return the engine. There is one engine per JS realm:
 * calling this again re-points the same engine at the new rng/clock/storage/data.
 */
export function createEngine(opts: Partial<EngineContext>): any {
  configure(opts);
  return E;
}
export default createEngine;
