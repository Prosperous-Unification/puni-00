import type { WorkPackageService, WorkPackageServiceOptions } from './work-package.resource';

/**
 * What a host must supply to install {@link workPackageModule}.
 *
 * Exactly {@link WorkPackageServiceOptions}, unchanged by the move: the work package
 * store of the one scope being installed over, the clock, the broadcaster,
 * the dependency graph guard and the optional optimizer availability. `servicesOver` supplies the store of
 * each admitted scope, so one installation never outlives the scope it was
 * built over.
 *
 * **No K4 or K6 debt; K2 debt disclosed.** Work package is a resource: it imports
 * the domain library, `@wbs/validation` and repository ports, and no other
 * resource. Legacy ordinary edit admission is the domain's explicit
 * `canEditLegacyWorkPackage`; current scoped grants are admitted by their owner.
 * What this extraction does not close is delivery's and features' side: `http/work-package.routes.ts`,
 * `http/saved-plan.routes.ts`, `http/solution.routes.ts` and Saved plans'
 * `save-plan.ts` still name `WorkPackageService` directly, the direct resource
 * dependency (K2) the backend module map lists under its composition hazards.
 * Tracked under task 7.4 of `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type WorkPackageRequirements = WorkPackageServiceOptions;

/** What installing {@link workPackageModule} adds to a host graph. */
export interface WorkPackageExports {
  readonly workPackages: WorkPackageService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * The label follows the current ring and directory. The stable wiki identity
 * `module.application.project` survives the directory move independently.
 */
export const WORK_PACKAGE_LABEL = 'application.work-package';
