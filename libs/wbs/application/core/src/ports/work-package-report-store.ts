import type { Demand, Resource, ResourceCapacity } from '@wbs/domain';

import type { ActualStore } from './actual-store';
import type { ClaimStore } from './claim-store';
import type { DemandStore } from './demand-store';
import type { DependencyStore } from './dependency-store';
import type { DirectoryStore } from './directory-store';
import type { EstimateStore } from './estimate-store';
import type { MembershipRefusal, ResourceAccess } from './organization-access';
import type { StepProgressStore } from './progress-store';
import type { ResourceCapacityStore } from './resource-capacity-store';
import type { StepBlockageStore } from './step-blockage-store';
import type { StepNodeAttemptStore } from './step-node-attempt-store';
import type { TypedDependencyStore } from './typed-dependency-store';
import type { WorkItemStore } from './work-item-store';
import type { WorkPackageStore } from './work-package-store';

/** The capacity and occupied units of a shared resource, with signed free units. */
export interface DirectoryTotals {
  readonly capacity: number;
  readonly occupied: number;
  readonly free: number;
}

/** A work package and organization verified by the holder observation. */
export interface WorkPackageReadOrigin {
  readonly id: string;
  readonly organizationId: string;
}

/** The current observation's package-read authority for a verified origin. */
export interface WorkPackageReadAccess {
  mayReadWorkPackageWithin(
    origin: WorkPackageReadOrigin,
    actorId: string,
    access: ResourceAccess,
  ): Promise<boolean>;
}

/** Admitted catalogue and plan facts, before the provider reads add their columns. */
export interface WorkPackageResources {
  resources: (Resource &
    (
      | { directoryCapacity: null; directory: null }
      | { directoryCapacity: number; directory: DirectoryTotals }
    ))[];
  capacities: ResourceCapacity[];
  demands: Demand[];
}

/** The catalogue observation can refuse current access before revealing a work package. */
export type WorkPackageResourceRead =
  | { readonly kind: 'ready'; readonly value: WorkPackageResources }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'access_refused'; readonly refusal: MembershipRefusal };

/** Read-only inputs to the work package resource catalogue. */
export interface WorkPackageResourceStores {
  readonly workPackages: Pick<
    WorkPackageStore,
    'findById' | 'findInOrganization' | 'findCrossReferences'
  >;
  readonly directory: Pick<
    DirectoryStore,
    'listResources' | 'listInOrganization' | 'directoryCapacitiesOf'
  >;
  readonly claims: Pick<ClaimStore, 'organizationUnitsOf'>;
  readonly resourceCapacity: Pick<ResourceCapacityStore, 'listFor'>;
  readonly demands: Pick<DemandStore, 'listByWorkPackage'>;
}

/** Read-only inputs needed to derive a work package's execution statuses. */
export interface ExecutionStatusStores {
  readonly workPackages: Pick<WorkPackageStore, 'findById' | 'stepsOf'>;
  readonly progress: Pick<StepProgressStore, 'listByWorkPackage'>;
  readonly attempts: Pick<StepNodeAttemptStore, 'listByWorkPackage'>;
  readonly estimates: Pick<EstimateStore, 'listByWorkPackage'>;
  readonly actuals: Pick<ActualStore, 'listByWorkPackage'>;
  readonly blockages: Pick<StepBlockageStore, 'listByWorkPackage'>;
  readonly dependencies: Pick<DependencyStore, 'listByWorkPackage'>;
  readonly typedDependencies: Pick<TypedDependencyStore, 'listByWorkPackage'>;
}

/** One detached view used by work package reports on a source without a live plan store. */
export interface WorkPackageReportStores extends WorkPackageResourceStores, ExecutionStatusStores {
  readonly workPackages: WorkPackageResourceStores['workPackages'] &
    ExecutionStatusStores['workPackages'];
  readonly access: WorkPackageReadAccess;
  readonly directory: WorkPackageResourceStores['directory'] &
    Pick<DirectoryStore, 'namesOf' | 'assignmentsInWorkPackage' | 'personNamesInOrganization'>;
  readonly claims: WorkPackageResourceStores['claims'] &
    Pick<ClaimStore, 'listStampedByWorkPackage' | 'occupancyOf' | 'organizationOccupancyOf'>;
  readonly workItems: Pick<WorkItemStore, 'listTreeByWorkPackage'>;
}

/** Captures committed state for a public graph without exposing write ports. */
export type WorkPackageReportSnapshot = <T>(
  access: ResourceAccess,
  read: (stores: WorkPackageReportStores) => Promise<T>,
) => Promise<T>;
