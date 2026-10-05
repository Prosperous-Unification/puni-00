import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

import type {
  OrganizationAccessRefusal,
  OrganizationPrincipal,
  ResourceAccess,
} from './organization-access';
import type { PlanInputReads } from './saved-plan-capture-store';
import type { EngineUnavailable, Scheduler, ScheduleRead } from './scheduler';

/** Capabilities borrowed only while one authorized, rank-ordered read snapshot is open. */
export interface ChainSnapshot {
  readonly access: ResourceAccess;
  readonly projects: readonly Pick<PlanInputReads, 'project' | 'assignments'>[];
  capturePlan(projectId: string): Promise<PlanInputReads>;
  /** Capture-mode reads select cache entries without admitting solver work. */
  readonly scheduler: Scheduler;
}

/** One coherent read; every returned value must be detached before the connection closes. */
export interface ChainSnapshotStore {
  withSnapshot(
    principal: OrganizationPrincipal,
    read: (snapshot: ChainSnapshot) => SharedPeopleRead | Promise<SharedPeopleRead>,
  ): Promise<
    | { readonly ok: true; readonly value: SharedPeopleRead }
    | { readonly ok: false; readonly refusal: OrganizationAccessRefusal }
  >;
}

export interface InfluencerRead {
  readonly projectId: string;
  readonly name: string;
  readonly engine: 'fast' | 'optimized';
  readonly unavailable: 'cycle' | 'calendar_range' | null;
}

/** Historical display evidence; the target's input alone cannot replay upstream bookings. */
export type SharedPeopleRead =
  | { readonly kind: 'not_found' }
  | (EngineUnavailable & {
      readonly projectId: string;
      readonly name: string;
      readonly reads: PlanInputReads;
    })
  | {
      readonly kind: 'unavailable';
      readonly reason: 'cycle' | 'calendar_range';
      readonly reads: PlanInputReads;
      readonly influencers: readonly InfluencerRead[];
    }
  | {
      readonly kind: 'scheduled';
      readonly reads: PlanInputReads;
      readonly input: ScheduleInput;
      readonly scheduled: ScheduleRead;
      readonly influencers: readonly InfluencerRead[];
    };
