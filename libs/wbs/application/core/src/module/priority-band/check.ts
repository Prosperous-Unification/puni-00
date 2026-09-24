import { DiBag } from 'di-bag';

import type { PriorityBandExports, PriorityBandRequirements } from './contract';
import { priorityBandModule } from './module';

/**
 * Installs {@link priorityBandModule} over supplied requirements and returns
 * only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Priority band can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link PriorityBandExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installPriorityBand(requirements: PriorityBandRequirements): PriorityBandExports {
  const bag = DiBag.createBuilder()
    .installModule(priorityBandModule)
    .register({
      projectStore: DiBag.fromSyncFactory(() => requirements.projects),
      priorityBandStore: DiBag.fromSyncFactory(() => requirements.bands),
      broadcast: DiBag.fromSyncFactory(() => requirements.broadcast),
      clock: DiBag.fromSyncFactory(() => requirements.clock),
    })
    .build();
  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  // Proof (2026-09-24): attaching `resolve` to the returned `PriorityBandService` kept the key list
  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  return { priorityBands: bag.resolve('priorityBands') };
}
