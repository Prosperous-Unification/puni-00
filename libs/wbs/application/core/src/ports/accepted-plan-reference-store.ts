import type { ActivePlanReference, HistoricalPlanReference } from '@wbs/contracts';

import type {
  AcceptedReferenceScope,
  AcceptedReferenceSelector,
  PlanReferencePolicy,
  RetainedPlanReference,
} from './accepted-plan-reference-values';

export type {
  AcceptedReferenceScope,
  AcceptedReferenceSelector,
  PlanReferencePolicy,
  PlanReferenceSubject,
  RetainedPlanReference,
} from './accepted-plan-reference-values';

/** Protected policy and immutable reference rows borrowed on the live WBS writer. */
export interface AcceptedPlanReferenceStore {
  /** @throws when required policy cannot be read or does not have its trusted shape. */
  readPolicy(): PlanReferencePolicy;
  readActive(scope: AcceptedReferenceScope): ActivePlanReference | null;
  readHistorical(
    scope: AcceptedReferenceScope,
    selector: AcceptedReferenceSelector,
  ): HistoricalPlanReference | null;
  insert(acceptance: RetainedPlanReference): void;
}
