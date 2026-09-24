import { DiBag } from 'di-bag';

import type { StepExports, StepRequirements } from './contract';
import { stepModule } from './module';

/**
 * Installs {@link stepModule} over supplied requirements and returns only what
 * the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Step can reach a
 * private binding or a host key through it. The type checker does not enforce
 * that on its own: an object with an extra property returned through a
 * variable still satisfies {@link StepExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installStep(requirements: StepRequirements): StepExports {
  const bag = DiBag.createBuilder()
    .installModule(stepModule)
    .register({
      projectStore: DiBag.fromSyncFactory(() => requirements.projects),
      stepStore: DiBag.fromSyncFactory(() => requirements.steps),
      broadcast: DiBag.fromSyncFactory(() => requirements.broadcast),
      clock: DiBag.fromSyncFactory(() => requirements.clock),
    })
    .build();
  // Proof (2026-09-24): returning a structurally assignable `exposed` object with `bag` left the
  // installer-surface assertion failing: the received keys included `bag` (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  // Proof (2026-09-24): attaching `resolve` to the returned `StepService` kept the key list
  // correct but made the no-resolver assertion receive false (4 pass, 1 fail), with
  // `wbs-core:typecheck` at exit 0.
  return { steps: bag.resolve('steps') };
}
