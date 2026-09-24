import type { PlanCommandRunner, PlanCommandRunnerOptions } from './plan-commands.feature';

/**
 * What a host must supply to install {@link planCommandsModule}.
 *
 * Exactly {@link PlanCommandRunnerOptions}, unchanged by the move: the
 * per-batch service factory, the public graph used after a batch settles, the
 * unit of work and the direct broadcaster a batch's collected announcements
 * drain into. The runner is installed once for the process; what is per
 * admitted batch — its scope, its announcement collector, its Working plan and
 * the graph built over them — it creates inside every `run`, `runDirectory`,
 * `undo` and `redo`, so no installation holds one.
 *
 * **No K6 debt; K2 and composition debt disclosed; the collector is shared.**
 * The feature imports no other feature. It names the Work item, Directory,
 * Capacity and Priority band resource classes through their `service/`
 * compatibility paths rather than through their modules' contracts, and reads
 * no repository port itself: the admitted scope's stores reach it only through
 * its private Working plan. Delivery is not closed: be-01's `mountedEndpoints`
 * still constructs `PlanCommandRunner` with `new` — the backend module map's
 * "Move construction to composition" hazard — and `http/work-item.routes.ts`
 * takes `WorkItemService` beside the runner. The per-batch
 * `AnnouncementCollector` is not private to this module: Plan import builds one
 * per import too, so it stays shared support in `service/broadcast.ts` (task
 * 1.2). Tracked under task 7.4 of `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type PlanCommandsRequirements = PlanCommandRunnerOptions;

/** What installing {@link planCommandsModule} adds to a host graph. */
export interface PlanCommandsExports {
  readonly commands: PlanCommandRunner;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.plan-commands` and the label drops
 * the `module.` prefix.
 */
export const PLAN_COMMANDS_LABEL = 'application.plan-commands';
