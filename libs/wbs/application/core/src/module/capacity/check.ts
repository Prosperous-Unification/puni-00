import { DiBag } from 'di-bag';

import type { CapacityExports, CapacityRequirements } from './contract';
import { capacityModule } from './module';

/**
 * Installs {@link capacityModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Capacity can reach
 * a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link CapacityExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installCapacity(requirements: CapacityRequirements): CapacityExports {
  const bag = DiBag.createBuilder()
    .installModule(capacityModule)
    .register({
      projectStore: DiBag.fromSyncFactory(() => requirements.projects),
      capacityStore: DiBag.fromSyncFactory(() => requirements.capacity),
      broadcast: DiBag.fromSyncFactory(() => requirements.broadcast),
      clock: DiBag.fromSyncFactory(() => requirements.clock),
    })
    .build();
  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  // Proof (2026-09-24): attaching `resolve` to the returned `CapacityService` kept the key list
  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  return { capacity: bag.resolve('capacity') };
}
