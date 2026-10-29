export const SOLVER_BACKEND_CASES = [
  { kind: 'ready', name: 'solver-first backend retains original authority through ready' },
  {
    kind: 'record-monitor',
    name: 'solver-first backend refuses ready record faults and terminal retry',
  },
  { kind: 'released', name: 'solver-first backend refuses released original readiness' },
  { kind: 'solver-before', name: 'solver-first backend refuses solver process drift before start' },
  {
    kind: 'solver-during',
    name: 'solver-first backend refuses solver process drift during readiness',
  },
  { kind: 'dev-opener', name: 'solver-first backend refuses a dev database opener' },
  {
    kind: 'publication-bytes',
    name: 'solver-first backend refuses changed ready publication bytes',
  },
  { kind: 'authority-drift', name: 'solver-first backend refuses restored authority boot drift' },
  { kind: 'late-source', name: 'solver-first backend refuses source drift after final observer' },
] as const;
export type SolverBackendCase = (typeof SOLVER_BACKEND_CASES)[number]['kind'];
