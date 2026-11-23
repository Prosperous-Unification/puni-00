/** Protected fact families in their stable response order; issued counters also retain parent allocator reservations. */
export const STEP_FACT_KINDS = [
  'estimate',
  'actual',
  'progress',
  'measure',
  'measure_estimate',
  'attempt',
  'attempt_issued',
  'assignment',
  'claim',
  'blockage',
  'parallel',
  'typed_dependency',
  'external_dependency',
] as const;
export type StepFactKind = (typeof STEP_FACT_KINDS)[number];
