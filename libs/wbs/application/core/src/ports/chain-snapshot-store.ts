import type { CapacityMode } from '@wbs/domain';

import type { OrganizationAccessRefusal, OrganizationPrincipal } from './organization-access';
import type { PlanInputReads } from './saved-plan-capture-values';
import type { Scheduler } from './scheduler';
import type { ChainAccess, SharedPeopleRead } from './shared-people-values';

/** Capabilities borrowed only while one authorized, rank-ordered read snapshot is open. */
export interface ChainSnapshot {
  readonly access: ChainAccess;
  readonly mode: CapacityMode;
  readonly projects: readonly Pick<PlanInputReads, 'project' | 'assignments'>[];
  capturePlan(projectId: string): Promise<PlanInputReads>;
  /** Capture-mode reads select cache entries without admitting solver work. */
  readonly scheduler: Scheduler;
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
