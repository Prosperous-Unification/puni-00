import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

import type { CalendarMarker } from './calendar-marker-store';
import type { DirectoryCatalogRows } from './directory-values';
import type { OrganizationAccessRefusal } from './organization-access';
import type { Project } from './project-values';
import type { PlanInputReads } from './saved-plan-capture-values';
import type { EngineUnavailable, ScheduleRead } from './scheduler';
import type { Step } from './step-store';
import type { LabelledWorkItem } from './work-item-values';

/** The entire protected read is refused; this outcome carries no project projection or cache value. */
export interface AccessRefused {
  readonly kind: 'access_refused';
  readonly refusal: OrganizationAccessRefusal;
}

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

/** Live metadata stays separate from saved-input values and shares their captured observation. */
export type LivePlanRead =
  | AccessRefused
  | { readonly kind: 'isolated' }
  | { readonly kind: 'not_found' }
  | {
      readonly kind: 'shared';
      readonly organizationId: string;
      readonly chain: Exclude<SharedPeopleRead, { readonly kind: 'not_found' }>;
      readonly project: Project;
      readonly steps: Step[];
      readonly workItems: LabelledWorkItem[];
      readonly seq: number;
    };

/** Catalog and marker values needed only for a structured export's referenced closure. */
export interface PlanDocumentReads {
  readonly directory: {
    readonly teams: DirectoryCatalogRows['teams'];
    readonly people: DirectoryCatalogRows['people'];
    readonly tags: DirectoryCatalogRows['tags'];
    readonly services: DirectoryCatalogRows['services'];
    readonly types: DirectoryCatalogRows['workItemTypes'];
    readonly externalSystems: DirectoryCatalogRows['externalSystems'];
  };
  readonly markers: readonly CalendarMarker[];
}

/** Export-purpose evidence is private to core callers, never part of the public tree payload. */
export type LivePlanExportRead =
  | Exclude<LivePlanRead, { kind: 'shared' }>
  | (Extract<LivePlanRead, { kind: 'shared' }> & { readonly document: PlanDocumentReads });
