import type { CapacityMode } from '@wbs/domain';

import type { CapacityPreview } from '../module/work-item/capacity-preview';
import type { ResourceOccupancyRead } from '../module/work-item/resource-occupancy';
import type { StartableWork } from '../module/work-item/startable';
import type { ConnectedPlanCapture } from '../service/connected-plan-values';
import type { ExecutionReads } from './execution-read-values';
import type {
  MembershipRefusal,
  OrganizationPrincipal,
  RefusedOrganizationAccess,
  ResourceAccess,
} from './organization-access';
import type { PlanExportReader } from './plan-export-reader';
import type { ResolvedPlanInputReads } from './saved-plan-capture-values';
import type { CapturedScheduler } from './scheduler';
import type {
  ChainAccess,
  LivePlanAggregate,
  LivePlanRead,
  SharedPeopleRead,
} from './shared-people-values';
import type { WorkPackageResourceRead } from './work-package-report-store';
import type { WorkPackage } from './work-package-values';

/** Capabilities borrowed only while one authorized, rank-ordered read snapshot is open. */
export interface ChainSnapshot {
  readonly access: ChainAccess;
  readonly mode: CapacityMode;
  readonly workPackages: readonly {
    readonly workPackage: WorkPackage;
    readonly assignments: ResolvedPlanInputReads['assignments'];
  }[];
  /** Complete connected evidence, read only within this admitted observation. */
  captureConnected(workPackageId: string): Promise<ConnectedPlanCapture>;
  capturePlan(workPackageId: string): Promise<ResolvedPlanInputReads>;
  /** Capture-mode reads select cache entries without admitting solver work. */
  readonly scheduler: CapturedScheduler;
}

/** One coherent read; every returned value must be detached before the connection closes. */
export interface ChainSnapshotStore {
  /** Resolves actual work package ownership and activation without fabricating a human principal. */
  withWorkPackageSnapshot(
    workPackageId: string,
    read: (snapshot: ChainSnapshot) => SharedPeopleRead | Promise<SharedPeopleRead>,
  ): Promise<SharedPeopleRead>;
  withSnapshot(
    principal: OrganizationPrincipal,
    workPackageId: string,
    read: (snapshot: ChainSnapshot) => SharedPeopleRead | Promise<SharedPeopleRead>,
  ): Promise<{ readonly ok: true; readonly value: SharedPeopleRead } | RefusedOrganizationAccess>;
}

/** Startable holder evidence and its admitted read outcomes. */
export type StartableRead =
  | { readonly kind: 'ready'; readonly value: StartableWork }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'unknown_team' }
  | { readonly kind: 'access_refused'; readonly refusal: MembershipRefusal };

/** A detached inventory from one admitted organization observation. */
export interface ResourceOccupancyStore {
  readResourceOccupancyWithin(
    resourceId: string,
    actorId: string,
    access: Extract<ResourceAccess, { kind: 'scoped' }>,
  ): Promise<ResourceOccupancyRead>;
}

/** Detached live evidence; SQLite owns the distinction between ordinary and command lifetimes. */
export interface LivePlanStore extends PlanExportReader, ResourceOccupancyStore {
  /** Captures an admitted work package catalogue, plan statements and directory totals. */
  readWorkPackageResources(
    workPackageId: string,
    access: ResourceAccess,
  ): Promise<WorkPackageResourceRead>;
  /** Holder decisions and the first shared shortage are completed inside one read snapshot. */
  readStartableWithin(
    workPackageId: string,
    actorId: string,
    access: ResourceAccess,
    teamId: string | null,
  ): Promise<StartableRead>;
  /** Admits current membership, then projects a capacity preview in the same observation. */
  previewDirectoryCapacityWithin(
    resourceId: string,
    units: number | null,
    actorId: string,
    access: Extract<ResourceAccess, { kind: 'scoped' }>,
  ): Promise<CapacityPreview>;

  /** Scheduler-free detached facts; command readers borrow their existing write observation. */
  readExecution(
    workPackageId: string,
    access: ResourceAccess,
    teamId: string | null,
  ): Promise<
    | { readonly kind: 'ready'; readonly reads: ExecutionReads }
    | { readonly kind: 'not_found' }
    | { readonly kind: 'unknown_team' }
    | { readonly kind: 'access_refused'; readonly refusal: MembershipRefusal }
  >;
  read(workPackageId: string, access: ResourceAccess): Promise<LivePlanRead>;
  /** WorkPackage-owned command/background authority, distinct from human observation. */
  readWorkPackage(
    workPackageId: string,
  ): Promise<Exclude<LivePlanRead, { kind: 'access_refused' }>>;
  /** Captures readable shared or isolated connected aggregates in one authorized observation; ordinary isolated reads retain their uncaptured path. */
  readAggregate(actorId: string, access: ResourceAccess): Promise<LivePlanAggregate>;
}

/** Detached organization capacity preview for a source without a live-plan reader. */
export type CapacityPreviewStore = Pick<LivePlanStore, 'previewDirectoryCapacityWithin'>;
