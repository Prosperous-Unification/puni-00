import type { ImportService, ImportServiceOptions } from './plan-import.feature';

/**
 * What a host must supply to install {@link planImportModule}.
 *
 * `batchServices` is the per-scope `ImportServices` factory the map's Plan
 * import row names: a callback borrowing the Directory and Work item resource
 * contracts over the admitted scope a running import's own unit of work
 * supplies, the same permitted feature-to-resource edge Plan commands' own
 * `batch` factory already is. It is passed through unresolved rather than
 * built here, because building it needs the per-admission resource graph
 * `servicesOver` composes, which this module does not own and does not
 * duplicate.
 *
 * **`uow` carries existing K3 debt this extraction preserves rather than
 * fixes.** `ImportService.import` calls `scope.stores.projects.create`,
 * `scope.stores.priorityBands.replace`, `scope.stores.capacity.set` and
 * `scope.stores.subtrees.insertSubtree` directly inside its own
 * `UnitOfWork.run(scope)` callback — a feature-service reading and writing
 * repository store ports, not the Project/Priority band/Capacity/Work item
 * resource-services K3 requires it to depend on instead. Closing it needs
 * either those resource-services to expose an admitted-scope write surface
 * `ImportService` could call instead, or an explicit exception the kind
 * rules record, neither of which any accepted change supplies today. Task
 * 7.4 of `openspec/changes/adopt-di-composition/tasks.md` is where this
 * module's own K3 debt is tracked; this module claims no K3 compliance.
 */
export type PlanImportRequirements = ImportServiceOptions;

/** What installing {@link planImportModule} adds to a host graph. */
export interface PlanImportExports {
  readonly imports: ImportService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching `module.application.plan-history`'s,
 * `module.application.bounded-replay-sweep`'s and `module.application.realtime`'s;
 * the wiki module identifier is `module.application.plan-import` and the label
 * drops the `module.` prefix.
 */
export const PLAN_IMPORT_LABEL = 'application.plan-import';
