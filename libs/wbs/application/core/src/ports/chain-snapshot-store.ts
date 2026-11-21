import type { CapacityMode, OrganizationScope } from '@wbs/domain';

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
import type { ProjectResourceRead } from './project-report-store';
import type { Project } from './project-values';
import type { PlanInputReads } from './saved-plan-capture-values';
import type { CapturedScheduler } from './scheduler';
import type {
  ChainAccess,
  LivePlanAggregate,
  LivePlanExportRead,
  LivePlanRead,
  SharedPeopleRead,
} from './shared-people-values';

/** Capabilities borrowed only while one authorized, rank-ordered read snapshot is open. */
export interface ChainSnapshot {
  readonly access: ChainAccess;
  readonly mode: CapacityMode;
  readonly projects: readonly {
    readonly project: Project;
    readonly assignments: PlanInputReads['assignments'];
  }[];
  /** Complete connected evidence, read only within this admitted observation. */
  captureConnected(projectId: string): Promise<ConnectedPlanCapture>;
  capturePlan(projectId: string): Promise<PlanInputReads>;
  /** Capture-mode reads select cache entries without admitting solver work. */
  readonly scheduler: CapturedScheduler;
}

/** One coherent read; every returned value must be detached before the connection closes. */
export interface ChainSnapshotStore {
  /** Resolves actual project ownership and activation without fabricating a human principal. */
  withProjectSnapshot(
    projectId: string,
    read: (snapshot: ChainSnapshot) => SharedPeopleRead | Promise<SharedPeopleRead>,
  ): Promise<SharedPeopleRead>;
  withSnapshot(
    principal: OrganizationPrincipal,
    projectId: string,
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
    scope: OrganizationScope,
  ): Promise<ResourceOccupancyRead>;
}

/** Detached live evidence; SQLite owns the distinction between ordinary and command lifetimes. */
export interface LivePlanStore extends ResourceOccupancyStore {
  /** Captures an admitted project catalog, plan statements and directory totals. */
  readProjectResources(projectId: string, access: ResourceAccess): Promise<ProjectResourceRead>;
  /** Holder decisions and the first shared shortage are completed inside one read snapshot. */
  readStartableWithin(
    projectId: string,
    actorId: string,
    access: ResourceAccess,
    teamId: string | null,
  ): Promise<StartableRead>;
  /** Admits current membership, then projects a capacity preview in the same observation. */
  previewDirectoryCapacityWithin(
    resourceId: string,
    units: number | null,
    actorId: string,
    scope: OrganizationScope,
  ): Promise<CapacityPreview>;

  /** Scheduler-free detached facts; command readers borrow their existing write observation. */
  readExecution(
    projectId: string,
    access: ResourceAccess,
    teamId: string | null,
  ): Promise<
    | { readonly kind: 'ready'; readonly reads: ExecutionReads }
    | { readonly kind: 'not_found' }
    | { readonly kind: 'unknown_team' }
    | { readonly kind: 'access_refused'; readonly refusal: MembershipRefusal }
  >;
  read(projectId: string, access: ResourceAccess): Promise<LivePlanRead>;
  /** Adds detached export-only catalogs and markers before the same observation closes. */
  readExport(projectId: string, access: ResourceAccess): Promise<LivePlanExportRead>;
  /** Project-owned command/background authority, distinct from human observation. */
  readProject(projectId: string): Promise<Exclude<LivePlanRead, { kind: 'access_refused' }>>;
  /** Captures readable shared or isolated connected aggregates in one authorized observation; ordinary isolated reads retain their uncaptured path. */
  readAggregate(actorId: string, access: ResourceAccess): Promise<LivePlanAggregate>;
}

/** Detached organization capacity preview for a source without a live-plan reader. */
export type CapacityPreviewStore = Pick<LivePlanStore, 'previewDirectoryCapacityWithin'>;
