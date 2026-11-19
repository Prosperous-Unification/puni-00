import type { PlanInputReads } from './saved-plan-capture-values';
export type {
  CapturedDependency,
  CapturedNamedValue,
  CapturedPerson,
  CapturedWorkPackage,
  CapturedStep,
  CapturedTeam,
  CapturedWorkItem,
  PlanInputReads,
} from './saved-plan-capture-values';

/** A coherent source snapshot of one work package's saved-plan input. */
export interface SavedPlanCaptureStore {
  readPlanInput(workPackageId: string): Promise<PlanInputReads | null>;
}
