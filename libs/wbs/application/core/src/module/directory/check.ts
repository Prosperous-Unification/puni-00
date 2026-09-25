import { DiBag } from 'di-bag';

import type { DirectoryExports, DirectoryRequirements } from './contract';
import { directoryModule } from './module';

/**
 * Installs {@link directoryModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Directory can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link DirectoryExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installDirectory(requirements: DirectoryRequirements): DirectoryExports {
  const bag = DiBag.createBuilder()
    .withInstalledModules([directoryModule])
    .withServices({
      directoryStore: DiBag.createProvider(() => requirements.directory, {
        factoryReturnKind: 'sync-value',
      }),
      broadcast: DiBag.createProvider(() => requirements.broadcast, {
        factoryReturnKind: 'sync-value',
      }),
      clock: DiBag.createProvider(() => requirements.clock, { factoryReturnKind: 'sync-value' }),
    })
    .buildContainer();
  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  // Proof (2026-09-24): attaching `resolve` to the returned `DirectoryService` kept the key list
  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  return { directory: bag.resolve('directory') };
}
