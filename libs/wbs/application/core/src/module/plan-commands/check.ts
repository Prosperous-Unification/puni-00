import { DiBag } from 'di-bag';

import type { PlanCommandsExports, PlanCommandsRequirements } from './contract';
import { planCommandsModule } from './module';

/**
 * Installs {@link planCommandsModule} over supplied requirements and returns
 * only what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Plan commands can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link PlanCommandsExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installPlanCommands(requirements: PlanCommandsRequirements): PlanCommandsExports {
  const bag = DiBag.createBuilder()
    .installModule(planCommandsModule)
    .register({
      batchServices: DiBag.fromSyncFactory(() => requirements.batchServices),
      publicServices: DiBag.fromSyncFactory(() => requirements.publicServices),
      uow: DiBag.fromSyncFactory(() => requirements.uow),
      announcements: DiBag.fromSyncFactory(() => requirements.announcements),
    })
    .build();
  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
  // installer-surface assertion failing: the received keys included `bag` (5 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  // Proof (2026-09-24): attaching `resolve` to the returned `PlanCommandRunner` kept the key list
  // correct but made the no-resolver assertion receive false (5 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  return { commands: bag.resolve('commands') };
}
