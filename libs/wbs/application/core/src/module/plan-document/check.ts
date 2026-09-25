import { DiBag } from 'di-bag';

import type { PlanDocumentExports, PlanDocumentRequirements } from './contract';
import { planDocumentModule } from './module';

/**
 * Installs {@link planDocumentModule} over supplied requirements and returns
 * only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Plan document can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link PlanDocumentExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installPlanDocument(requirements: PlanDocumentRequirements): PlanDocumentExports {
  const bag = DiBag.createBuilder()
    .withInstalledModules([planDocumentModule])
    .withServices({
      directory: DiBag.createProvider(() => requirements.directory, {
        factoryReturnKind: 'sync-value',
      }),
      markers: DiBag.createProvider(() => requirements.markers, {
        factoryReturnKind: 'sync-value',
      }),
      clock: DiBag.createProvider(() => requirements.clock, { factoryReturnKind: 'sync-value' }),
    })
    .buildContainer();
  // Proof (2026-09-23): returning a structurally assignable `exposed` object with `bag` left the
  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  // Proof (2026-09-23): attaching `resolve` to the returned `PlanDocumentService` kept the key
  // list correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  return { planDocuments: bag.resolve('planDocuments') };
}
