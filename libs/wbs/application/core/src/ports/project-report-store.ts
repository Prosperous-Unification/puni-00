import type { Demand, Resource, ResourceCapacity } from '@wbs/domain';

import type { ActualStore } from './actual-store';
import type { ClaimStore } from './claim-store';
import type { DemandStore } from './demand-store';
import type { DependencyStore } from './dependency-store';
import type { DirectoryStore } from './directory-store';
import type { EstimateStore } from './estimate-store';
import type { MembershipRefusal } from './organization-access';
import type { StepProgressStore } from './progress-store';
import type { ProjectStore } from './project-store';
import type { ResourceCapacityStore } from './resource-capacity-store';
import type { StepBlockageStore } from './step-blockage-store';
import type { StepNodeAttemptStore } from './step-node-attempt-store';
import type { TypedDependencyStore } from './typed-dependency-store';
import type { WorkItemStore } from './work-item-store';

/** The capacity and occupied units of a shared resource, with signed free units. */
export interface DirectoryTotals {
  readonly capacity: number;
  readonly occupied: number;
  readonly free: number;
}

/** Admitted catalog and plan facts, before the provider reads add their columns. */
export interface ProjectResources {
  resources: (Resource &
    (
      | { directoryCapacity: null; directory: null }
      | { directoryCapacity: number; directory: DirectoryTotals }
    ))[];
  capacities: ResourceCapacity[];
  demands: Demand[];
}

/** The catalog observation can refuse current access before revealing a project. */
export type ProjectResourceRead =
  | { readonly kind: 'ready'; readonly value: ProjectResources }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'access_refused'; readonly refusal: MembershipRefusal };

/** Read-only inputs to the project resource catalog. */
export interface ProjectResourceStores {
  readonly projects: Pick<ProjectStore, 'findById' | 'findInOrganization' | 'findCrossReferences'>;
  readonly directory: Pick<
    DirectoryStore,
    'listResources' | 'listInOrganization' | 'directoryCapacitiesOf'
  >;
  readonly claims: Pick<ClaimStore, 'organizationUnitsOf'>;
  readonly resourceCapacity: Pick<ResourceCapacityStore, 'listFor'>;
  readonly demands: Pick<DemandStore, 'listByProject'>;
}

/** Read-only inputs needed to derive a project's execution statuses. */
export interface ExecutionStatusStores {
  readonly projects: Pick<ProjectStore, 'findById' | 'stepsOf'>;
  readonly progress: Pick<StepProgressStore, 'listByProject'>;
  readonly attempts: Pick<StepNodeAttemptStore, 'listByProject'>;
  readonly estimates: Pick<EstimateStore, 'listByProject'>;
  readonly actuals: Pick<ActualStore, 'listByProject'>;
  readonly blockages: Pick<StepBlockageStore, 'listByProject'>;
  readonly dependencies: Pick<DependencyStore, 'listByProject'>;
  readonly typedDependencies: Pick<TypedDependencyStore, 'listByProject'>;
}

/** One detached view used by project reports on a source without a live plan store. */
export interface ProjectReportStores extends ProjectResourceStores, ExecutionStatusStores {
  readonly projects: ProjectResourceStores['projects'] &
    ExecutionStatusStores['projects'] &
    Pick<ProjectStore, 'mayReadProjectWithin'>;
  readonly directory: ProjectResourceStores['directory'] &
    Pick<DirectoryStore, 'namesOf' | 'assignmentsInProject' | 'personNamesInOrganization'>;
  readonly claims: ProjectResourceStores['claims'] &
    Pick<ClaimStore, 'listStampedByProject' | 'occupancyOf' | 'organizationOccupancyOf'>;
  readonly workItems: Pick<WorkItemStore, 'listByProject'>;
}

/** Captures committed state for a public graph without exposing write ports. */
export type ProjectReportSnapshot = <T>(
  read: (stores: ProjectReportStores) => Promise<T>,
) => Promise<T>;
