import { DiBag } from 'di-bag';

import type { PlanEventStore } from '../../ports/plan-event-store';
import { PLAN_EVENT_LABEL } from './contract';
import { PlanEventService } from './plan-event.resource';

/** Sealed retained-history resource with its repository store kept private. */
export const planEventModule = DiBag.createBuilder()
  .withServices({
    planEventSettings: DiBag.createProvider(
      ({ planEventStore }: { planEventStore: PlanEventStore }): PlanEventStore => planEventStore,
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    planEvents: DiBag.createProvider(
      ({ planEventSettings }: { planEventSettings: PlanEventStore }): PlanEventService =>
        new PlanEventService(planEventSettings),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof (2026-09-27): exporting planEventSettings made the private-binding,
  // label and missing-requirement tests fail (2 pass, 3 fail). Removing the
  // module label failed the label and missing-requirement tests (3 pass, 2 fail).
  .buildModule({ exportedServiceKeys: ['planEvents'], moduleLabel: PLAN_EVENT_LABEL });
