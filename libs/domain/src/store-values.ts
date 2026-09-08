/** The scheduling engines a project may select. */
export const SCHEDULE_ENGINES = ['fast', 'optimized'] as const;
export type ScheduleEngine = (typeof SCHEDULE_ENGINES)[number];

/** The units stored for step measures. */
export const MEASURE_METRICS = ['token_estimate', 'token_actual', 'hours_actual'] as const;
export type MeasureMetric = (typeof MEASURE_METRICS)[number];

/** Whether a directory person is human or automated. */
export const PERSON_KINDS = ['person', 'agent'] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

/** The two independent optimization objectives. */
export const SOLVER_OBJECTIVES = ['pri', 'time'] as const;
export type SolverObjectiveName = (typeof SOLVER_OBJECTIVES)[number];

/** Every modeled failure stored for an optimization attempt. */
export const SOLVER_FAILURE_REASONS = [
  'timeout',
  'invalid-output',
  'no-solution',
  'internal-error',
  'oom',
  'horizon-overflow',
  'objective-overflow',
] as const;
export type SolverFailureReason = (typeof SOLVER_FAILURE_REASONS)[number];
