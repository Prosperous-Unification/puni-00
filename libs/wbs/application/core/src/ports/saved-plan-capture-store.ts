import type { PlanInputReads } from './saved-plan-capture-values';
export type {
  CapturedDependency,
  CapturedNamedValue,
  CapturedPerson,
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
