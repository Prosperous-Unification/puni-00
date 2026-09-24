import { DiBag } from 'di-bag';

import type { OptimizationExports, OptimizationRequirements } from './contract';
import { optimizationModule } from './module';

/**
 * Installs {@link optimizationModule} over supplied requirements and returns
 * only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Optimization can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link OptimizationExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installOptimization(requirements: OptimizationRequirements): OptimizationExports {
  const bag = DiBag.createBuilder()
    .installModule(optimizationModule)
    .register({
      db: DiBag.fromSyncFactory(() => requirements.db),
      contractVersion: DiBag.fromSyncFactory(() => requirements.contractVersion),
      solverVersion: DiBag.fromSyncFactory(() => requirements.solverVersion),
      budgetMs: DiBag.fromSyncFactory(() => requirements.budgetMs),
      ownerId: DiBag.fromSyncFactory(() => requirements.ownerId),
      now: DiBag.fromSyncFactory(() => requirements.now),
      attemptToken: DiBag.fromSyncFactory(() => requirements.attemptToken),
      inputOf: DiBag.fromSyncFactory(() => requirements.inputOf),
      enabledOf: DiBag.fromSyncFactory(() => requirements.enabledOf),
      hashInput: DiBag.fromSyncFactory(() => requirements.hashInput),
      spawn: DiBag.fromSyncFactory(() => requirements.spawn),
      runChild: DiBag.fromSyncFactory(() => requirements.runChild),
      onChildError: DiBag.fromSyncFactory(() => requirements.onChildError),
      eventLog: DiBag.fromSyncFactory(() => requirements.eventLog),
      pushRecorded: DiBag.fromSyncFactory(() => requirements.pushRecorded),
      editDebounceMs: DiBag.fromSyncFactory(() => requirements.editDebounceMs),
      sleep: DiBag.fromSyncFactory(() => requirements.sleep),
      setInterval: DiBag.fromSyncFactory(() => requirements.setInterval),
      clearInterval: DiBag.fromSyncFactory(() => requirements.clearInterval),
    })
    .build();
  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
  // installer-surface assertion failing: the received keys included `bag` (5 pass, 1 fail), with
  // `wbs-be-01:typecheck` at exit 0.
  // Proof (2026-09-24): attaching `resolve` to the returned `OptimizationCoordinator` kept the key
  // list correct but made the no-resolver assertion receive false (5 pass, 1 fail), with
  // `wbs-be-01:typecheck` at exit 0.
  return { optimizer: bag.resolve('optimizer') };
}
