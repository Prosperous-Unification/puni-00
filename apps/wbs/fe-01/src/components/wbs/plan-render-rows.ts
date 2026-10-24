import type {
  ExternalSystemView,
  PriorityBandView,
  ServiceView,
  StepView,
  TagView,
  TeamView,
  WorkItemTypeView,
} from '@/lib/wbs-api';
import type { PlanRead } from '@/lib/wbs-api';

import type { DrawnClaim } from './claim-chip';
import { type PickableEntry, type PickerOption } from './creatable-picker';
import { type PickerEntry } from './dep-picker';
import type { DependsEntry } from './depends-card';
import { type TrioProblem } from './estimate-draft';
import { type ServiceLabel, type ServiceTeamLabel, type TagLabel } from './gantt-geometry';
import { type CardAssignee } from './plan-cards';
import { type PrintedDay } from './short-date';
import type { StepNodeReadings } from './step-reading';
import { type TreeRow } from './wbs-rows';

/** Immutable values rendered by one structurally folded estimate step. */
export interface FoldedEstimateReadings {
  layout: 'folded';
  anyAssignee: boolean;
  /** Whether some drawn row holds a claim on this step, so this cell keeps the claim slot. */
  anyClaim: boolean;
  /** The step claim this cell draws a chip for, or null. */
  claim: DrawnClaim | null;
  combinedProblem: string | null;
  combinedValue: string;
  doing: CardAssignee | null;
  mentionOptions: PickerOption[];
  mentioning: boolean;
  /** The node's reading for its corner glyph and card; null on a parent or an older read. */
  node: StepNodeReadings | null;
}

/** Immutable values rendered by one structurally unfolded estimate step. */
export interface UnfoldedEstimateReadings {
  layout: 'unfolded';
  anyAssignee: boolean;
  /** The step claim the `by` cell draws a chip for, or null. */
  claim: DrawnClaim | null;
  doing: CardAssignee | null;
  estimateValues: Record<'optimistic' | 'realistic' | 'pessimistic', string>;
  trioProblem: TrioProblem | null;
  /** The node's reading for its corner glyph; null on a parent or an older read. */
  node: StepNodeReadings | null;
}

/** One step's render values, narrowed by the column family's structural layout. */
export type EstimateReadings = FoldedEstimateReadings | UnfoldedEstimateReadings;

/** Immutable values a plan cell renders that are not already carried by its row. */
export interface PlanRowReadings {
  actionsOpen: boolean;
  busy: boolean;
  editingDeadline: boolean;
  editingFactEnd: boolean;
  editingFactStart: boolean;
  editingNotBefore: boolean;
  dependencies: DependsEntry[];
  typedDependencies: NonNullable<PlanRead['typedDependencies']>;
  dependencyRows: TreeRow[];
  dependencySteps: StepView[];
  dependencyStepNodes: NonNullable<PlanRead['stepNodes']> | null;
  dependencyStepIdsByRow: ReadonlyMap<string, readonly string[]> | null;
  dependencyEntries: PickerEntry[];
  dependencyPicker: {
    rowId: string;
    typed: string;
    highlightId: string | null;
    stepId?: string;
  } | null;
  externalSystems: ExternalSystemView[];
  assigneeEntries: PickableEntry[];
  estimateReadings: ReadonlyMap<string, EstimateReadings>;
  stepNodes: ReadonlyMap<string, NonNullable<PlanRead['stepNodes']>[number]> | null;
  /** The subtree claim the Name cell draws a chip for, or null. */
  subtreeClaim: DrawnClaim | null;
  hasSchedule: boolean;
  finish: PrintedDay;
  nonOwnerNote: string | null;
  priorityBands: PriorityBandView[];
  serviceLabel: ServiceLabel;
  services: ServiceView[];
  start: PrintedDay;
  startDate: string | null;
  tagLabel: TagLabel;
  tags: TagView[];
  teamLabel: ServiceTeamLabel;
  teams: TeamView[];
  workItemTypes: WorkItemTypeView[];
}

/** A tree row with the immutable values computed for the current React render. */
export type RowWithReadings<TReadings> = Omit<TreeRow, 'subRows'> & {
  /** The plan row this render-only projection was made from. */
  source: TreeRow;
  subRows: RowWithReadings<TReadings>[];
  readings: TReadings;
};

/** The row type owned by the plan table and its stable column components. */
export type PlanRenderRow = RowWithReadings<PlanRowReadings>;

/**
 * Attaches current render values to every row while preserving the tree.
 *
 * The projection is recursive because TanStack asks `subRows` for expansion;
 * leaving children as bare {@link TreeRow}s would make deep cells fall back to
 * mutable table state even though root cells receive explicit readings.
 */
export function attachRowReadings<TReadings>(
  rows: readonly TreeRow[],
  readingsOf: (row: TreeRow) => TReadings,
): RowWithReadings<TReadings>[] {
  return rows.map((row) => ({
    ...row,
    source: row,
    subRows: attachRowReadings(row.subRows, readingsOf),
    readings: readingsOf(row),
  }));
}
