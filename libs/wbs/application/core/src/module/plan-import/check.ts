import { DiBag } from 'di-bag';

import type { PlanImportExports, PlanImportRequirements } from './contract';
import { planImportModule } from './module';

/**
 * Installs {@link planImportModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Plan import can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link PlanImportExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installPlanImport(requirements: PlanImportRequirements): PlanImportExports {
  const bag = DiBag.createBuilder()
    .installModule(planImportModule)
    .register({
      clock: DiBag.fromSyncFactory(() => requirements.clock),
      scheduler: DiBag.fromSyncFactory(() => requirements.scheduler),
      uow: DiBag.fromSyncFactory(() => requirements.uow),
      announcements: DiBag.fromSyncFactory(() => requirements.announcements),
      batchServices: DiBag.fromSyncFactory(() => requirements.batchServices),
    })
    .build();
  // Proof (2026-09-23): returning a structurally assignable `exposed` object with `bag` left
  // the installer-surface assertion failing: the received keys included `bag` (5 pass, 1 fail).
  // Proof (2026-09-23): attaching `resolve` to the returned `ImportService` kept the key list
  // correct but made the no-resolver assertion receive false (5 pass, 1 fail).
  return { imports: bag.resolve('imports') };
}
