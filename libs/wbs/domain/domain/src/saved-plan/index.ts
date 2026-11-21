export * from './canonical-plan-input';
export * from './comparison-input';
export type {
  DependencyMeaning,
  PlanComparison,
  QuestionMeaning,
  ScheduleMeaning,
  StageMeaning,
  VariantMeaning,
} from './comparison-meaning';
export { readScheduleMeaning, renderScheduleMeaning } from './comparison-meaning';
export {
  encodeSavedPlacement,
  readSavedCanonicalStage,
  readSavedConnectedScheduleEvidence,
  type SavedOptimizationStage,
  type SavedOptimizationVariant,
  validateSavedConnectedHistory,
  validateSavedLeafConnectedHistory,
} from './connected-schedule';
export type { SavedConnectedDependencyHistory, SavedDependencyHistory } from './dependency-history';
export { readSavedDependencyHistory } from './dependency-history';
export * from './diff-plans';
export { detachHistory, SavedHistoryError, serializeHistory } from './history-json';
export * from './input13';
export * from './leaf-dependency-history';
export { readLegacySavedPlanInput } from './legacy-input10';
export { readSavedConnectedScheduleBody as readLegacySavedConnectedScheduleBody2 } from './legacy-schedule2';
export * from './normalise-plan-input';
export * from './versioned-plan-input';
export * from './versioned-schedule';
