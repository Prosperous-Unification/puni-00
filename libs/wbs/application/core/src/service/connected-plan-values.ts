import type { CapacityMode } from '@wbs/domain';

import type { PlanInputReads } from '../ports/saved-plan-capture-values';
import type { StoredTypedDependency } from '../ports/typed-dependency-store';

/** Detached complete component evidence; the requested projection is deliberately separate. */
export interface ConnectedPlanCapture {
  readonly kind: 'connected';
  readonly organizationId: string;
  readonly mode: CapacityMode;
  readonly projects: readonly {
    readonly projectId: string;
    readonly abbreviation: string;
    readonly rank: number;
    readonly reads: PlanInputReads;
  }[];
  readonly relationships: readonly StoredTypedDependency[];
}
