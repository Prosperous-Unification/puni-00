import type {
  Assignment,
  AuthoredDependencyGraph,
  Demand,
  ExecutionEligibility,
  ExecutionEvidence,
  OccupancyRow,
  Resource,
  ResourceCapacity,
  ResourceUnits,
  StoredProgress,
  WorkItemStatus,
} from '@wbs/domain';

import type { StampedClaim } from './claim-store';
import type { LabelledWorkItem } from './work-item-store';

/** Everything the startable read reads, gathered in one admitted read. */
export interface ExecutionReads {
  readonly rows: readonly LabelledWorkItem[];
  /** Every row's derived status: the folds the table shows (`workItemStatusesOf`). */
  readonly statuses: ReadonlyMap<string, WorkItemStatus>;
  /** Every actual leaf's resolved execution order, including explicit empty lists. */
  readonly leafSteps: ReadonlyMap<string, readonly string[]>;
  readonly stated: readonly Pick<StoredProgress, 'workItemId' | 'stepId' | 'state'>[];
  readonly claims: readonly StampedClaim[];
  readonly assignments: readonly Assignment[];
  readonly dependencies: AuthoredDependencyGraph;
  readonly eligibilityByNode: ReadonlyMap<string, ExecutionEligibility>;
  readonly evidenceByNode: ReadonlyMap<string, ExecutionEvidence>;
  readonly predecessorIdsByLeaf: ReadonlyMap<string, readonly string[]>;
  /** Display names of every person an assignment or a claim names. */
  readonly personNames: ReadonlyMap<string, string>;
  /** Display names of every team a label names. */
  readonly teamNames: ReadonlyMap<string, string>;
  /** The team to filter by, or null for every leaf. */
  readonly teamId: string | null;
  /** The work package's stated capacities. */
  readonly capacities: readonly ResourceCapacity[];
  /** Every demand stated on a work item of the work package. */
  readonly demands: readonly Demand[];
  /** The work package's occupancy rows: one per claim and resource (`ClaimStore.occupancyOf`). */
  readonly occupancy: readonly OccupancyRow[];
  /** Directory capacities for project-stated or leaf-demanded resources. */
  readonly directoryCapacities: readonly ResourceCapacity[];
  /** Organization-wide held units for those directory capacities. */
  readonly organizationOccupied: readonly ResourceUnits[];
  /** Every resource a work package or directory capacity names, by id, under the caller's names. */
  readonly resources: ReadonlyMap<string, Resource>;
}
