import { DiBag } from 'di-bag';

import type { WorkPackageExports, WorkPackageRequirements } from './contract';
import { workPackageModule } from './module';

/**
 * Installs {@link workPackageModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Work package can reach
 * a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link WorkPackageExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installWorkPackage(requirements: WorkPackageRequirements): WorkPackageExports {
  const bag = DiBag.createBuilder()
    .withInstalledModules([workPackageModule])
    .withServices({
      accessDecisions: DiBag.createProvider(() => requirements.accessDecisions, {
        factoryReturnKind: 'sync-value',
      }),
      workPackageStore: DiBag.createProvider(() => requirements.workPackages, {
        factoryReturnKind: 'sync-value',
      }),
      clock: DiBag.createProvider(() => requirements.clock, { factoryReturnKind: 'sync-value' }),
      broadcast: DiBag.createProvider(() => requirements.broadcast, {
        factoryReturnKind: 'sync-value',
      }),
      optimizerAvailable: DiBag.createProvider(() => requirements.optimizerAvailable, {
        factoryReturnKind: 'sync-value',
      }),
      dependencyContext: DiBag.createProvider(() => requirements.dependencyContext, {
        factoryReturnKind: 'sync-value',
      }),
      beforeUpdate: DiBag.createProvider(() => requirements.beforeUpdate, {
        factoryReturnKind: 'sync-value',
      }),
    })
    .buildContainer();
  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  // Proof (2026-09-24): attaching `resolve` to the returned `WorkPackageService` kept the key list
  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  return { workPackages: bag.resolve('workPackages') };
}
