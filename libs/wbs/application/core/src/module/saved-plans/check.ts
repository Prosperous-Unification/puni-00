import { DiBag } from 'di-bag';

import type { SavedPlansExports, SavedPlansRequirements } from './contract';
import { savedPlansModule } from './module';

/**
 * Installs {@link savedPlansModule} over supplied requirements and returns
 * only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Saved plans can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link SavedPlansExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installSavedPlans(requirements: SavedPlansRequirements): SavedPlansExports {
  const bag = DiBag.createBuilder()
    .installModule(savedPlansModule)
    .register({
      digest: DiBag.fromSyncFactory(() => requirements.digest),
      capture: DiBag.fromSyncFactory(() => requirements.capture),
      plans: DiBag.fromSyncFactory(() => requirements.plans),
      scheduler: DiBag.fromSyncFactory(() => requirements.scheduler),
      newId: DiBag.fromSyncFactory(() => requirements.newId),
      now: DiBag.fromSyncFactory(() => requirements.now),
      quota: DiBag.fromSyncFactory(() => requirements.quota),
    })
    .build();
  // Proof (2026-09-23): returning a structurally assignable `exposed` object with `bag` left
  // the installer-surface assertion failing: the received keys included `bag` (6 pass, 1 fail),
  // with `wbs-core:typecheck` at exit 0.
  // Proof (2026-09-23): attaching `resolve` to the returned `SavedPlanService` kept the key list
  // correct but made the no-resolver assertion receive false (6 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  return { savedPlans: bag.resolve('savedPlans') };
}
