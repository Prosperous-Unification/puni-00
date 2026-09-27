import { DiBag } from 'di-bag';

import type { PlanEventExports, PlanEventRequirements } from './contract';
import { planEventModule } from './module';

/** Install retained history over the supplied repository scope. */
export function installPlanEvent(requirements: PlanEventRequirements): PlanEventExports {
  const bag = DiBag.createBuilder()
    .withInstalledModules([planEventModule])
    .withServices({
      planEventStore: DiBag.createProvider(() => requirements.events, {
        factoryReturnKind: 'sync-value',
      }),
    })
    .buildContainer();
  // Proof (2026-09-27): adding `bag` to this return failed `exports only the
  // resource` (4 pass, 1 fail).
  return { planEvents: bag.resolve('planEvents') };
}
