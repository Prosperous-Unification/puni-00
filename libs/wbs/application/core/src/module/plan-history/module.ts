import { DiBag } from 'di-bag';

import type { PlanEventStore } from '../../ports/plan-event-store';
import type { ProjectStore } from '../../ports/project-store';
import { PLAN_HISTORY_LABEL } from './contract';
import { HistoryService, type HistoryServiceOptions } from './plan-history.feature';

/**
 * Plan history as a sealed DI Bag module.
 *
 * Only `history` is exported. `historySettings` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is reported
 * against `application.plan-history/historySettings` rather than against an
 * anonymous binding.
 *
 * The module registers no disposer, because nothing it owns has one: the
 * service holds two borrowed store ports and no timer, socket or handle. Its
 * lifetime therefore stays the composition root's, exactly as `bootBe01` owns
 * the source it borrows.
 */
export const planHistoryModule = DiBag.createBuilder()
  .withServices({
    historySettings: DiBag.createProvider(
      ({
        projectStore,
        planEventStore,
      }: {
        projectStore: ProjectStore;
        planEventStore: PlanEventStore;
      }): HistoryServiceOptions => ({ projects: projectStore, events: planEventStore }),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    history: DiBag.createProvider(
      ({ historySettings }: { historySettings: HistoryServiceOptions }): HistoryService =>
        new HistoryService(historySettings),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  // Proof: on 2026-09-22, exporting `historySettings` made the private-binding
  // test report "Received function did not throw" (3 pass, 3 fail).
  // Proof: on 2026-09-22, dropping the label made the graph omit
  // `application.plan-history/historySettings` (4 pass, 2 fail).
  .buildModule({ exportedServiceKeys: ['history'], moduleLabel: PLAN_HISTORY_LABEL });
