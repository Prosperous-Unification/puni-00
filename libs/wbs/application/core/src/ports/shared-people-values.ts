import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

import type { PlanInputReads } from './saved-plan-capture-values';
import type { EngineUnavailable, ScheduleRead } from './scheduler';

export interface InfluencerRead {
  readonly projectId: string;
  readonly name: string;
  readonly engine: 'fast' | 'optimized';
  readonly unavailable: 'cycle' | 'calendar_range' | null;
}

/** Organization-only read authority; background scheduling carries no human write role. */
export type ChainAccess =
  | { readonly kind: 'legacy' }
  | { readonly kind: 'scoped'; readonly scope: { readonly organizationId: string } };

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
