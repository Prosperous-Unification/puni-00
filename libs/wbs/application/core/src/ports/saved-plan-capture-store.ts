import type { PlanInputReads } from './saved-plan-capture-values';
export type {
  CapturedActual,
  CapturedAssignment,
  CapturedDependency,
  CapturedEstimate,
  CapturedMeasure,
  CapturedNamedValue,
  CapturedPerson,
  CapturedProgress,
  CapturedProject,
  CapturedStep,
  CapturedTeam,
  CapturedWorkItem,
  PlanInputReads,
} from './saved-plan-capture-values';

/** A coherent source snapshot of one project's saved-plan input. */
export interface SavedPlanCaptureStore {
  readPlanInput(projectId: string): Promise<PlanInputReads | null>;
}
