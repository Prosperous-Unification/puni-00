import type {
  Assignment,
  AuthoredDependencyGraph,
  Demand,
  ExecutionEligibility,
  ExecutionEvidence,
  OccupancyRow,
  Resource,
  ResourceCapacity,
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
  /** The project's steps in project order. */
  readonly stepIds: readonly string[];
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
  /** The project's stated capacities. */
  readonly capacities: readonly ResourceCapacity[];
  /** Every demand stated on a work item of the project. */
  readonly demands: readonly Demand[];
  /** The project's occupancy rows: one per claim and resource (`ClaimStore.occupancyOf`). */
  readonly occupancy: readonly OccupancyRow[];
  /** Every resource a capacity names, by id, under the caller's names. */
  readonly resources: ReadonlyMap<string, Resource>;
}
