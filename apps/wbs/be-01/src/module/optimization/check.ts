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
    .withInstalledModules([optimizationModule])
    .withServices({
      db: DiBag.createProvider(() => requirements.db, { factoryReturnKind: 'sync-value' }),
      contractVersion: DiBag.createProvider(() => requirements.contractVersion, {
        factoryReturnKind: 'sync-value',
      }),
      solverVersion: DiBag.createProvider(() => requirements.solverVersion, {
        factoryReturnKind: 'sync-value',
      }),
      budgetMs: DiBag.createProvider(() => requirements.budgetMs, {
        factoryReturnKind: 'sync-value',
      }),
      ownerId: DiBag.createProvider(() => requirements.ownerId, {
        factoryReturnKind: 'sync-value',
      }),
      now: DiBag.createProvider(() => requirements.now, { factoryReturnKind: 'sync-value' }),
      attemptToken: DiBag.createProvider(() => requirements.attemptToken, {
        factoryReturnKind: 'sync-value',
      }),
      inputOf: DiBag.createProvider(() => requirements.inputOf, {
        factoryReturnKind: 'sync-value',
      }),
      enabledOf: DiBag.createProvider(() => requirements.enabledOf, {
        factoryReturnKind: 'sync-value',
      }),
      hashInput: DiBag.createProvider(() => requirements.hashInput, {
        factoryReturnKind: 'sync-value',
      }),
      spawn: DiBag.createProvider(() => requirements.spawn, { factoryReturnKind: 'sync-value' }),
      runChild: DiBag.createProvider(() => requirements.runChild, {
        factoryReturnKind: 'sync-value',
      }),
      onChildError: DiBag.createProvider(() => requirements.onChildError, {
        factoryReturnKind: 'sync-value',
      }),
      eventLog: DiBag.createProvider(() => requirements.eventLog, {
        factoryReturnKind: 'sync-value',
      }),
      pushRecorded: DiBag.createProvider(() => requirements.pushRecorded, {
        factoryReturnKind: 'sync-value',
      }),
      editDebounceMs: DiBag.createProvider(() => requirements.editDebounceMs, {
        factoryReturnKind: 'sync-value',
      }),
      sleep: DiBag.createProvider(() => requirements.sleep, { factoryReturnKind: 'sync-value' }),
      setInterval: DiBag.createProvider(() => requirements.setInterval, {
        factoryReturnKind: 'sync-value',
      }),
      clearInterval: DiBag.createProvider(() => requirements.clearInterval, {
        factoryReturnKind: 'sync-value',
      }),
    })
    .buildContainer();
  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
  // installer-surface assertion failing: the received keys included `bag` (5 pass, 1 fail), with
  // `wbs-be-01:typecheck` at exit 0.
  // Proof (2026-09-24): attaching `resolve` to the returned `OptimizationCoordinator` kept the key
  // list correct but made the no-resolver assertion receive false (5 pass, 1 fail), with
  // `wbs-be-01:typecheck` at exit 0.
  return { optimizer: bag.resolve('optimizer') };
}
