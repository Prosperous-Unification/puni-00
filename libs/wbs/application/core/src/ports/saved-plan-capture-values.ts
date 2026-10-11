// Compatibility export: a Saved plan's capture reads moved to `@wbs/domain` (task 6.1, A12) so
// `planInputRowsOf` can fold them there; the port keeps their names for the stores.
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
} from '@wbs/domain';
