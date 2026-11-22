import type { Assignment } from './assignment';
import type { StoredBudget } from './budget';
import type { DependencyReach } from './dependency-reach';
import type { EstimateMethod, EstimateRounding, PertWeights } from './estimate';
import type { LeafStepOrder } from './leaf-step-order';
import type { MeasureDefinition } from './measure-definition';
import type { StoredMeasureEstimate } from './measure-estimate';
import type { PriorityBand } from './priority-band';
import type { Hold, Readiness } from './progress';
import type { Demand, Resource, ResourceCapacity } from './resource';
import type { StoredStepBlockage } from './step-blockage';
import type { StoredStepParallel } from './step-parallel';
import type { StoredActual, StoredEstimate, StoredMeasure, StoredProgress } from './step-values';
import type { EstimateUnit } from './stored-vocabularies';
import type { ScheduleEngine, SolverObjectiveName } from './stored-vocabularies';
import type { TypedDependency } from './typed-dependency';
import type { IsoDate } from './workday';

export interface CapturedWorkPackage {
  readonly id: string;
  readonly name: string;
  readonly projectId: string;
  readonly restricted: boolean;
  readonly estimateMethod: EstimateMethod;
  readonly depReach: DependencyReach;
  readonly pertWeights: PertWeights;
  readonly estimateRounding: EstimateRounding;
  readonly startDate: IsoDate | null;
  readonly scheduleEngine: ScheduleEngine;
  readonly scheduleObjective: SolverObjectiveName;
  readonly optimizationEnabled: boolean;
  readonly solutionRef: { readonly slug: string; readonly url: string } | null;
  /**
   * The IANA zone the work package reads instants as days in (`step-node-attempts`
   * D3). Captured as a setting; no engine reads it.
   */
  readonly timezone: string;
  /** The derived budgets' factor (`wbs-measure-budgets` D38); captured as a setting. */
  readonly budgetFactor: number;
}

export interface CapturedStep {
  readonly id: string;
  /** Captured identity; null is the live step's modeled uncoded state. */
  readonly code: string | null;
  readonly name: string;
  readonly position: number;
  /** The step's allowance at capture: a saved plan's charged figures use it, never the live one. */
  readonly allowancePercent: number;
  readonly estimateUnit: EstimateUnit;
}

export interface CapturedWorkItem {
  readonly id: string;
  readonly workPackageId: string;
  readonly parentId: string | null;
  readonly position: number;
  readonly name: string;
  readonly notes: string;
  readonly frozenNumber: string | null;
  readonly startNoEarlierThan: IsoDate | null;
  readonly startNoEarlierThanReason: string | null;
  readonly deadline: IsoDate | null;
  readonly readiness: Readiness | null;
  readonly hold: Hold | null;
  readonly priority: number | null;
  readonly serviceTeamId: string | null;
  readonly serviceId: string | null;
  readonly maxParallel: number;
  readonly revision: number;
  readonly teamIds: readonly string[];
  readonly tagIds: readonly string[];
  readonly serviceIds: readonly string[];
  readonly typeIds: readonly string[];
  readonly externalRefs: readonly {
    readonly id: string;
    readonly systemId: string;
    readonly url: string;
  }[];
}

export interface CapturedDependency {
  readonly predecessorId: string;
  readonly successorId: string;
}

export interface CapturedNamedValue {
  readonly id: string;
  readonly name: string;
}

export interface CapturedPerson extends CapturedNamedValue {
  readonly teamIds: readonly string[];
}

export interface CapturedTeam extends CapturedNamedValue {
  readonly serviceIds: readonly string[];
}

/** Every detached row used to build one canonical saved-plan input. */
export interface PlanInputReads {
  readonly workPackage: CapturedWorkPackage;
  readonly steps: readonly CapturedStep[];
  readonly workItems: readonly CapturedWorkItem[];
  readonly estimates: readonly StoredEstimate[];
  readonly actuals: readonly StoredActual[];
  readonly progress: readonly StoredProgress[];
  readonly stepBlockages: readonly StoredStepBlockage[];
  readonly stepParallels: readonly StoredStepParallel[];
  readonly measures: readonly StoredMeasure[];
  /** Definitions read on the same snapshot; null models an unowned work package. */
  readonly measureDefinitions: readonly MeasureDefinition[] | null;
  /** Every trio of the work package in measures other than time, read on the snapshot. */
  readonly measureEstimates: readonly StoredMeasureEstimate[];
  /** Every stated budget of the work package, read on the snapshot. */
  readonly budgets: readonly StoredBudget[];
  readonly dependencies: readonly CapturedDependency[];
  /** Detached relationship identities and endpoints from the capture snapshot. */
  readonly typedDependencies: readonly TypedDependency[];
  readonly assignments: readonly Assignment[];
  readonly capacity: ReadonlyMap<string, number>;
  /**
   * Every demand on a work item of the work package and the work package's stated
   * resource capacities, read on the same snapshot (`wbs-resources` R5): the
   * captured schedule levels them exactly as the live one does.
   */
  readonly demands: readonly Demand[];
  readonly resourceCapacities: readonly ResourceCapacity[];
  /** Raw directory capacity statements for the project's schedule on the same snapshot. */
  readonly directoryCapacities: readonly ResourceCapacity[];
  /**
   * The resources the caller's directory holds, under its own names, read on
   * the snapshot so a shared plan read can label the resource a bar waited for.
   */
  readonly resources: readonly Resource[];
  readonly priorityBands: readonly PriorityBand[];
  readonly people: readonly CapturedPerson[];
  readonly teams: readonly CapturedTeam[];
  readonly services: readonly CapturedNamedValue[];
  readonly tags: readonly CapturedNamedValue[];
  readonly workItemTypes: readonly CapturedNamedValue[];
  readonly externalSystems: readonly CapturedNamedValue[];
}

/** Current Source capture requires a complete resolved inventory beside its ordinary stored rows. */
export interface ResolvedPlanInputReads extends PlanInputReads {
  readonly leafSteps: readonly LeafStepOrder[];
}
