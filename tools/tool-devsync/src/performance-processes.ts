import {
  createPerformanceProcessOwner as createOwner,
  monotonicClock,
  type PerformanceProcessOwner,
} from '@puni/dash/performance-processes';

export type { PerformanceProcessOwner };

/** Composes the process owner for the source tooling fixtures. */
export function createPerformanceProcessOwner(): PerformanceProcessOwner {
  return createOwner(monotonicClock());
}
