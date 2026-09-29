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
 * **No K6 debt; K2 and composition debt disclosed.**
 * The feature imports no other feature. It names the Work item, Directory,
 * Capacity and Priority band resource classes through their `service/`
 * compatibility paths rather than through their modules' contracts, and calls
 * no repository port itself. **No K3 debt:** it holds each admitted unit of
 * work's scope only as the private `AdmittedScope` resource, which builds its
 * graph, opens its Working plan and answers its organization admission, and it
 * takes entity values from the neutral `ports/*-values.ts` files. WBS 040.11
 * closed this module's entry in `module-boundaries.test.ts`'s shrink-only debt
 * ledger (task 7.8 of `openspec/changes/adopt-di-composition/tasks.md`). Delivery is not closed: be-01's `mountedEndpoints`
 * still constructs `PlanCommandRunner` with `new` — the backend module map's
 * "Move construction to composition" hazard — and `http/work-item.routes.ts`
 * takes `WorkItemService` beside the runner; tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`. The per-batch
 * `AnnouncementCollector` is not this module's: it is an implementation of the
 * neutral `Broadcaster` port shared by the two admitting features; barred from
 * either feature by K6, it lives beside that port in
 * `ports/announcement-collector.ts`, and Plan commands and Plan import both
 * import it. The backend module map's "Plan commands' private collector" did
 * not see Plan import's use; a copy would be a second class definition (task 1.2).
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
