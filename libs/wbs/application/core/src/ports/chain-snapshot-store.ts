import type { CapacityMode } from '@wbs/domain';

import type {
  OrganizationAccessRefusal,
  OrganizationPrincipal,
  ResourceAccess,
} from './organization-access';
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
  ): Promise<
    | { readonly ok: true; readonly value: SharedPeopleRead }
    | { readonly ok: false; readonly refusal: OrganizationAccessRefusal }
  >;
}

/** Detached live evidence; SQLite owns the distinction between ordinary and command lifetimes. */
export interface LivePlanStore {
  read(projectId: string, access: ResourceAccess): Promise<LivePlanRead>;
  /** Adds detached export-only catalogs and markers before the same observation closes. */
  readExport(projectId: string, access: ResourceAccess): Promise<LivePlanExportRead>;
  /** Project-owned command/background authority, distinct from human observation. */
  readProject(projectId: string): Promise<Exclude<LivePlanRead, { kind: 'access_refused' }>>;
  /** Captures all readable shared projects in one authorized observation. */
  readAggregate(actorId: string, access: ResourceAccess): Promise<LivePlanAggregate>;
}
