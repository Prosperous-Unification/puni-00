import { DiBag } from 'di-bag';

import type { BoundedReplaySweepExports, BoundedReplaySweepRequirements } from './contract';
import { boundedReplaySweepModule } from './module';

/**
 * Installs {@link boundedReplaySweepModule} over supplied requirements and
 * returns only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Bounded replay
 * sweep can reach a private binding or a host key through it. The type
 * checker does not enforce that on its own: an object with an extra property
 * returned through a variable still satisfies {@link BoundedReplaySweepExports},
 * so the module's tests enumerate what this function returns.
 */
export function installBoundedReplaySweep(
  requirements: BoundedReplaySweepRequirements,
): BoundedReplaySweepExports {
  const bag = DiBag.createBuilder()
    .installModule(boundedReplaySweepModule)
    .register({
      eventLog: DiBag.fromSyncFactory(() => requirements.eventLog),
      planEvents: DiBag.fromSyncFactory(() => requirements.planEvents),
      intervals: DiBag.fromSyncFactory(() => requirements.intervals),
      now: DiBag.fromSyncFactory(() => requirements.now),
      maxPerSubscription: DiBag.fromSyncFactory(() => requirements.maxPerSubscription),
      planEventRetentionDays: DiBag.fromSyncFactory(() => requirements.planEventRetentionDays),
      intervalMs: DiBag.fromSyncFactory(() => requirements.intervalMs),
      onSweep: DiBag.fromSyncFactory(() => requirements.onSweep),
      onError: DiBag.fromSyncFactory(() => requirements.onError),
    })
    .build();
  // Proof (2026-09-23): returning `{ retention: bag.resolve('retention'), bag }` left
  // `exposes only the contract exports from its installer` failing on its first assertion —
  // `Object.keys(exposed)` reported `["retention", "bag"]` — 0 pass, 1 fail, 5 filtered out.
  // Proof (2026-09-23): keeping the key list correct but hanging `resolve` on the returned
  // service (`Object.assign(bag.resolve('retention'), { resolve: bag.resolve.bind(bag) })`) left
  // the same test failing on its SECOND assertion instead (`Expected: true`, `Received: false`),
  // with `wbs-core:typecheck` still exiting 0 on both mutations.
  return { retention: bag.resolve('retention') };
}
