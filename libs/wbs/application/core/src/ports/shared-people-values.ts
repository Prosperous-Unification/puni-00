import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

import type { CalendarMarker } from './calendar-marker-store';
import type { DirectoryCatalogRows } from './directory-values';
import type { MembershipRefusal } from './organization-access';
import type { Project } from './project-values';
import type { PlanInputReads } from './saved-plan-capture-values';
import type { EngineUnavailable, ScheduleRead } from './scheduler';
import type { StoredStepBlockage } from './step-blockage-store';
import type { StoredAttempt } from './step-node-attempt-store';
import type { Step } from './step-store';
import type { LabelledWorkItem } from './work-item-values';

/** The entire protected read is refused; this outcome carries no project projection or cache value. */
export interface AccessRefused {
  readonly kind: 'access_refused';
  readonly refusal: MembershipRefusal;
}

export interface InfluencerRead {
  readonly projectId: string;
  readonly name: string;
  readonly engine: 'fast' | 'optimized';
  readonly unavailable: 'cycle' | 'calendar_range' | null;
}

/**
 * A work item in another project that holds a booking a target slice waited for, named as that
 * project's own plan names it (CONTEXT "Elsewhere"), so a reader is told whom a bar waits for
 * without reading the holding project.
 */
export interface ElsewhereHolderLabel {
  readonly projectId: string;
  readonly projectName: string;
  readonly workItemId: string;
  /** The work item's derived number in its own project, as its plan prints it. */
  readonly number: string;
  readonly name: string;
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
      /** One label per holder a target Fast slice names, in first-named order. */
      readonly holders: readonly ElsewhereHolderLabel[];
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
      /**
       * Every attempt in the project, from the same observation as the rows:
       * live metadata the work-item read carries and no saved plan captures.
       */
      readonly attempts: readonly StoredAttempt[];
      readonly blockages: readonly StoredStepBlockage[];
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

/** One detached aggregate observation; entries share authority, rank and schedule evidence. */
export type LivePlanAggregate =
  | AccessRefused
  | { readonly kind: 'isolated' }
  | {
      readonly kind: 'shared';
      readonly entries: readonly {
        readonly rank: number;
        readonly basis: string | null;
        readonly plan: Extract<LivePlanRead, { kind: 'shared' }>;
      }[];
    };
