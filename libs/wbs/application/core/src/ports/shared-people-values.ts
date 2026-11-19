import type {
  Demand,
  MeasureDefinition,
  Resource,
  ResourceCapacity,
  StoredBudget,
  StoredMeasure,
  StoredMeasureEstimate,
} from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

import type { ConnectedPlanProjection } from '../service/connected-plan-projection';
import type { ConnectedReadiness } from '../service/connected-readiness';
import type { StoredAttempt } from './attempt-values';
import type { CalendarMarker } from './calendar-marker-store';
import type { DirectoryCatalogRows } from './directory-values';
import type { MembershipRefusal } from './organization-access';
import type { WorkPackage } from './work-package-values';
import type { PlanInputReads } from './saved-plan-capture-values';
import type { EngineUnavailable, ScheduleRead } from './scheduler';
import type { StoredStepBlockage } from './step-blockage-store';
import type { StoredStepParallel } from './step-parallel-store';
import type { Step } from './step-values';
import type { LabelledWorkItem } from './work-item-values';

/** The entire protected read is refused; this outcome carries no work package projection or cache value. */
export interface AccessRefused {
  readonly kind: 'access_refused';
  readonly refusal: MembershipRefusal;
}

export interface InfluencerRead {
  readonly workPackageId: string;
  readonly name: string;
  readonly engine: 'fast' | 'optimized';
  readonly unavailable: 'cycle' | 'calendar_range' | null;
}

/**
 * A work item in another work package that holds the person a target slice waited for, named as that
 * work package's own plan names it (CONTEXT "Elsewhere"), so a reader is told whom a bar waits for
 * without reading the holding work package.
 */
export interface ElsewhereHolderLabel {
  readonly workPackageId: string;
  readonly workPackageName: string;
  readonly workItemId: string;
  /** The work item's derived number in its own work package, as its plan prints it. */
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
      readonly workPackageId: string;
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
      readonly kind: 'connected';
      readonly projection: ConnectedPlanProjection;
      readonly readiness: ConnectedReadiness;
      readonly metadataByWorkPackage: ReadonlyMap<
        string,
        {
          readonly workPackage: WorkPackage;
          readonly steps: readonly Step[];
          readonly workItems: readonly LabelledWorkItem[];
          readonly attempts: readonly StoredAttempt[];
          readonly blockages: readonly StoredStepBlockage[];
          readonly seq: number;
        }
      >;
    }
  | {
      readonly kind: 'shared';
      readonly organizationId: string;
      readonly chain: Exclude<SharedPeopleRead, { readonly kind: 'not_found' }>;
      readonly workPackage: WorkPackage;
      readonly steps: Step[];
      readonly workItems: LabelledWorkItem[];
      /**
       * Every attempt in the work package, from the same observation as the rows:
       * live metadata the work-item read carries and no saved plan captures.
       */
      readonly attempts: readonly StoredAttempt[];
      readonly blockages: readonly StoredStepBlockage[];
      readonly seq: number;
    };

/** Detached singleton scheduling in isolated mode, without shared people capacity. */
export type CapturedLocalPlan = Omit<Extract<LivePlanRead, { kind: 'shared' }>, 'kind'> & {
  readonly kind: 'local';
};

/** Private structured-export evidence: directory closure, markers and unsupported sparse facts. */
export interface PlanDocumentReads {
  /** Required parent metadata, captured beside the package and tree in this observation. */
  readonly project: { readonly id: string; readonly name: string };
  readonly stepParallels: readonly StoredStepParallel[];
  readonly directory: {
    readonly teams: DirectoryCatalogRows['teams'];
    readonly people: DirectoryCatalogRows['people'];
    readonly tags: DirectoryCatalogRows['tags'];
    readonly services: DirectoryCatalogRows['services'];
    readonly types: DirectoryCatalogRows['workItemTypes'];
    readonly externalSystems: DirectoryCatalogRows['externalSystems'];
  };
  readonly markers: readonly CalendarMarker[];
  /**
   * The resource facts the document carries (`wbs-resources`): the resources
   * the caller's directory holds, from which the export takes the closure its
   * capacities and demands name, and the work package's capacities and demands.
   */
  readonly resources: {
    readonly resources: readonly Resource[];
    readonly capacities: readonly ResourceCapacity[];
    readonly demands: readonly Demand[];
  };
  /**
   * The work package's measures as stored (`wbs-measure-budgets` design D63): the
   * definitions of its organization (null when none owns it), every stored
   * fact with its basis, every trio and every stated budget. Version 11
   * writes them, every list empty when the plan holds none (design D71).
   */
  readonly measures: MeasureReads;
}

/** The stored measures an export reads; see {@link PlanDocumentReads.measures}. */
export interface MeasureReads {
  readonly definitions: readonly MeasureDefinition[] | null;
  readonly facts: readonly StoredMeasure[];
  readonly estimates: readonly StoredMeasureEstimate[];
  readonly budgets: readonly StoredBudget[];
}

/** Export-purpose evidence is private to core callers, never part of the public tree payload. */
export type LivePlanExportRead =
  | Exclude<LivePlanRead, { kind: 'isolated' | 'shared' | 'connected' }>
  | (CapturedLocalPlan & { readonly document: PlanDocumentReads })
  | (Extract<LivePlanRead, { kind: 'shared' }> & { readonly document: PlanDocumentReads })
  | (Extract<LivePlanRead, { kind: 'connected' }> & {
      readonly workPackageId: string;
      readonly document: PlanDocumentReads;
    });

/**
 * One detached aggregate observation. Component members share one captured read
 * but select their own explicit workPackageId. Connected entries bypass persistent
 * consumer caches with a null basis; reuse lasts only for this observation.
 */
export type LivePlanAggregate =
  | AccessRefused
  | { readonly kind: 'isolated' }
  | {
      readonly kind: 'isolated-connected';
      readonly entries: readonly {
        readonly workPackageId: string;
        readonly rank: number;
        readonly basis: null;
        readonly plan: Extract<LivePlanRead, { kind: 'connected' }> | CapturedLocalPlan;
      }[];
    }
  | {
      readonly kind: 'shared';
      readonly entries: readonly {
        readonly workPackageId: string;
        readonly rank: number;
        readonly basis: string | null;
        readonly plan: Extract<LivePlanRead, { kind: 'shared' | 'connected' }>;
      }[];
    };
