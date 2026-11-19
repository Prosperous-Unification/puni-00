import type { CapacityMode } from '@wbs/domain';

import type { ConnectedPlanCapture } from '../service/connected-plan-values';
import type { ExecutionReads } from './execution-read-values';
import type {
  OrganizationPrincipal,
  RefusedOrganizationAccess,
  ResourceAccess,
} from './organization-access';
import type { WorkPackage } from './work-package-values';
import type { PlanExportReader } from './plan-export-reader';
import type { PlanInputReads } from './saved-plan-capture-values';
import type { CapturedScheduler } from './scheduler';
import type {
  ChainAccess,
  LivePlanAggregate,
  LivePlanRead,
  SharedPeopleRead,
} from './shared-people-values';

/** Capabilities borrowed only while one authorized, rank-ordered read snapshot is open. */
export interface ChainSnapshot {
  readonly access: ChainAccess;
  readonly mode: CapacityMode;
  readonly workPackages: readonly {
    readonly workPackage: WorkPackage;
    readonly assignments: PlanInputReads['assignments'];
  }[];
  /** Complete connected evidence, read only within this admitted observation. */
  captureConnected(workPackageId: string): Promise<ConnectedPlanCapture>;
  capturePlan(workPackageId: string): Promise<PlanInputReads>;
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

/** Detached live evidence; SQLite owns the distinction between ordinary and command lifetimes. */
export interface LivePlanStore extends PlanExportReader {
  /** Scheduler-free detached facts; command readers borrow their existing write observation. */
  readExecution(
    workPackageId: string,
    access: ResourceAccess,
    teamId: string | null,
  ): Promise<
    | { readonly kind: 'ready'; readonly reads: ExecutionReads }
    | { readonly kind: 'not_found' }
    | { readonly kind: 'unknown_team' }
    | { readonly kind: 'access_refused'; readonly refusal: RefusedOrganizationAccess['refusal'] }
  >;
  read(workPackageId: string, access: ResourceAccess): Promise<LivePlanRead>;
  /** WorkPackage-owned command/background authority, distinct from human observation. */
  readWorkPackage(
    workPackageId: string,
  ): Promise<Exclude<LivePlanRead, { kind: 'access_refused' }>>;
  /** Captures readable shared or isolated connected aggregates in one authorized observation; ordinary isolated reads retain their uncaptured path. */
  readAggregate(actorId: string, access: ResourceAccess): Promise<LivePlanAggregate>;
}
