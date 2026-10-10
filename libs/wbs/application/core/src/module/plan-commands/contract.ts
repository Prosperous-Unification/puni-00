import type { CommittedFanoutDelivery } from '../../service/committed-fanout';
import type { PlanCommandsSource } from './composition';
import type { PlanCommandRunner } from './plan-commands.feature';

/**
 * What a host must supply to install {@link planCommandsModule}.
 *
 * Composition takes the per-batch service factory, source unit of work,
 * public graph and direct broadcaster. It binds the first two into a mapped
 * transaction before constructing the runner. A feature callback receives
 * command resources and a repair resource, never the source scope.
 *
 * **No K6 debt; K2 and composition debt disclosed.**
 * The feature imports no other feature. It names the Work item, Directory,
 * Capacity and Priority band resource classes through their `service/`
 * compatibility paths rather than through their modules' contracts, and calls
 * no repository port itself. **No K3 debt:** it receives only the mapped
 * command admission, which opens its Working plan and answers organization admission, and it
 * takes entity values from the neutral `ports/*-values.ts` files. WBS 040.11
 * closed this module's entry in `module-boundaries.test.ts`'s shrink-only debt
 * ledger (task 7.8 of `openspec/changes/adopt-di-composition/tasks.md`).
 * be-01's `mountedEndpoints` uses the mapped composition factory, while `http/work-item.routes.ts`
 * takes `WorkItemService` beside the runner; tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`. The per-batch
 * `AnnouncementCollector` is not this module's: it is an implementation of the
 * neutral `Broadcaster` port shared by the two admitting features; barred from
 * either feature by K6, it lives beside that port in
 * `ports/announcement-collector.ts`, and Plan commands and Plan import both
 * import it. The backend module map's "Plan commands' private collector" did
 * not see Plan import's use; a copy would be a second class definition (task 1.2).
 */
export type PlanCommandsRequirements = PlanCommandsSource & {
  readonly committedFanout: CommittedFanoutDelivery;
};

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
