import type { WorkItemService, WorkItemServiceOptions } from './work-item.resource';

/**
 * What a host must supply to install {@link workItemModule}.
 *
 * Exactly {@link WorkItemServiceOptions}, unchanged by the move: the twelve
 * stores of the one scope being installed over, the broadcaster, the
 * scheduler and the clock. `servicesOver` supplies the stores of each admitted
 * scope, so one installation never outlives the scope it was built over.
 *
 * **No K6 debt; K4 support and K2 debt disclosed.** Work item is a resource:
 * it imports the domain library, twelve repository ports — `WorkItemStore`,
 * `ProjectStore`, `EstimateStore`, `ActualStore`, `MeasureStore`,
 * `StepProgressStore`, `DirectoryStore`, `CapacityStore`, `PriorityBandStore`,
 * `DependencyStore`, `SubtreeStore` and `CommandJournalStore` — and no other
 * resource. It still imports five support files from `service/`,
 * `assumed-assignee.ts`, `compensating.ts`, `dependency.ts`,
 * `numbered-work-item.ts` and `roll-up.ts`, which the backend module map moves
 * to the domain library (task 6.1); until then that is a resource reading
 * application-ring support rather than the domain. Its consumers' side is not
 * closed either: `http/project.routes.ts` and `http/work-item.routes.ts` accept
 * `WorkItemService` directly, Plan commands and Plan import name it, and Saved
 * plans' `saved-plan-schedule.ts` imports its `NO_DEADLINES` and `slicesOf`
 * values — the direct resource dependency (K2) the map lists under its
 * composition hazards. Tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type WorkItemRequirements = WorkItemServiceOptions;

/** What installing {@link workItemModule} adds to a host graph. */
export interface WorkItemExports {
  readonly workItems: WorkItemService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.work-item` and the label drops the
 * `module.` prefix.
 */
export const WORK_ITEM_LABEL = 'application.work-item';
