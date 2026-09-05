import type { OptimizedScheduleReader } from './optimized-schedule-reader';

/**
 * Whether *this deployment* can honour optimized scheduling at all.
 *
 * A predicate rather than a boolean, and never constructed by hand — see
 * {@link optimizerWiring}. The distinction it draws is not about a project: it
 * is about whether an optimized cache is wired into the process the settings
 * PATCH just landed in.
 */
export type OptimizerAvailability = () => boolean;

/**
 * The reader the plan read consults and the availability predicate the settings
 * write is gated on, **derived from one argument**.
 *
 * The two halves go to two different services — `read` to `WorkItemService`,
 * `available` to `ProjectService` — and this type exists so they cannot be
 * given different answers.
 */
export interface OptimizerWiring {
  /**
   * Where a published solver schedule is looked up, or absent when no optimizer
   * is deployed. Handed to {@link WorkItemServiceOptions.optimized} verbatim.
   */
  readonly read: OptimizedScheduleReader | undefined;
  /** True exactly when {@link OptimizerWiring.read} is there. Never anything else. */
  readonly available: OptimizerAvailability;
}

/**
 * One reader in, both halves of the optimizer's wiring out.
 *
 * **The reason this is a factory and not two arguments to `services.ts`.** The
 * defect this closes is a settings PATCH that answers `200` to
 * `scheduleEngine: 'optimized'` in a process where `WorkItemService` was
 * constructed with no reader: the write succeeds, the event goes out, the
 * settings panel says optimized, and every plan read silently serves Fast. Both
 * review seats reached that independently on PR 203.
 *
 * A free `optimizerAvailable: boolean` on `ProjectService` would have closed it
 * only as long as nobody edited `services.ts` — the two arguments sit fourteen
 * lines apart there, and wiring the reader while forgetting the boolean (or the
 * reverse) restores the same lie with no test failing. Deriving the predicate
 * from the reader makes the wrong pair **unspellable**: there is one argument,
 * and `available` is a reading of it rather than a second claim about it.
 *
 * `read` is captured rather than re-read, because the argument is the whole of
 * what this knows; there is nothing else for the predicate to consult.
 */
export function optimizerWiring(read: OptimizedScheduleReader | undefined): OptimizerWiring {
  return { read, available: () => read !== undefined };
}
