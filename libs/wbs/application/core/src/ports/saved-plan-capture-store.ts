import type { ResolvedPlanInputReads } from './saved-plan-capture-values';
export type {
  CapturedDependency,
  CapturedNamedValue,
  CapturedPerson,
  CapturedStep,
  CapturedTeam,
  CapturedWorkItem,
  CapturedWorkPackage,
  PlanInputReads,
  ResolvedPlanInputReads,
} from './saved-plan-capture-values';

/** A coherent source snapshot of one work package's saved-plan input. */
export interface SavedPlanCaptureStore {
  readPlanInput(workPackageId: string): Promise<ResolvedPlanInputReads | null>;
}
