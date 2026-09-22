import type { PlanEventStore } from '../../ports/plan-event-store';
import type { ProjectStore } from '../../ports/project-store';
import type { HistoryService } from './plan-history.feature';

/**
 * What a host must supply to install {@link planHistoryModule}.
 *
 * **Both are repository ports, and that is existing K3 debt this extraction
 * preserves rather than fixes.** K3 and the import matrix in
 * `docs/superpowers/specs/2026-09-19-code-organization-design.md` say a
 * feature-service depends on resource-services and the domain library, never on
 * a repository port; `HistoryService` has read both stores directly since it was
 * written. Sealing the module makes that dependency declared instead of
 * implicit, which is the whole of the claim here. Closing it needs a Plan
 * resource-service over `PlanEventStore`, which no accepted change supplies, so
 * `adopt-di-composition` records it as open and this module claims no K3
 * compliance.
 */
export interface PlanHistoryRequirements {
  readonly projectStore: ProjectStore;
  readonly planEventStore: PlanEventStore;
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
