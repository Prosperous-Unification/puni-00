import { DiBag } from 'di-bag';

import type { PlanHistoryExports, PlanHistoryRequirements } from './contract';
import { planHistoryModule } from './module';

/**
 * Installs {@link planHistoryModule} over supplied requirements and returns only
 * what the module exports.
 *
 * The graph is built here and nowhere else, so no caller of Plan history can
 * reach a private binding or a host key through it. The type checker does not
 * enforce that on its own: an object with an extra property returned through a
 * variable still satisfies {@link PlanHistoryExports}, so the module's tests
 * enumerate what this function returns.
 */
export function installPlanHistory(requirements: PlanHistoryRequirements): PlanHistoryExports {
  const bag = DiBag.createBuilder()
    .installModule(planHistoryModule)
    .register({
      projectStore: DiBag.fromSyncFactory(() => requirements.projectStore),
      planEventStore: DiBag.fromSyncFactory(() => requirements.planEventStore),
    })
    .build();
  // Proof: on 2026-09-22, returning `bag` here made the installer-surface test
  // receive the extra `bag` key (5 pass, 1 fail).
  // Proof: on 2026-09-22, attaching `resolve` to `history` made that test
  // receive false for its no-resolver assertion (5 pass, 1 fail).
  return { history: bag.resolve('history') };
}
