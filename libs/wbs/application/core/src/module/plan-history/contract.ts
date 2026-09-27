import type { PlanEventService } from '../plan-event/plan-event.resource';
import type { ProjectService } from '../project/project.resource';
import type { HistoryService } from './plan-history.feature';

/**
 * What a host must supply to install {@link planHistoryModule}.
 *
 * History reads project headers and retained plan events through resource
 * services, preserving the project-before-events query order.
 */
export interface PlanHistoryRequirements {
  readonly projects: ProjectService;
  readonly planEvents: PlanEventService;
}

/** What installing {@link planHistoryModule} adds to a host graph. */
export interface PlanHistoryExports {
  readonly history: HistoryService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching the six existing `module.<ring>.<name>`
 * identifiers in `docs/wiki-policy/modules.json`; the wiki module identifier is
 * `module.application.plan-history` and the label drops the `module.` prefix.
 */
export const PLAN_HISTORY_LABEL = 'application.plan-history';
