import type { ProjectService, ProjectServiceOptions } from './project.resource';

/**
 * What a host must supply to install {@link projectModule}.
 *
 * Exactly {@link ProjectServiceOptions}, unchanged by the move: the project
 * store of the one scope being installed over, the clock, the broadcaster and
 * the optional optimizer availability. `servicesOver` supplies the store of
 * each admitted scope, so one installation never outlives the scope it was
 * built over.
 *
 * **No K4 or K6 debt; K2 debt disclosed.** Project is a resource: it imports
 * the domain library, `@wbs/validation` and repository ports, and no other
 * resource. The `canEdit` it still exports is the compatibility alias of the
 * domain's `canEditProject`, kept for delivery. What this extraction does not
 * close is delivery's and features' side: `http/project.routes.ts`,
 * `http/saved-plan.routes.ts`, `http/solution.routes.ts` and Saved plans'
 * `save-plan.ts` still name `ProjectService` directly, the direct resource
 * dependency (K2) the backend module map lists under its composition hazards.
 * Tracked under task 7.4 of `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type ProjectRequirements = ProjectServiceOptions;

/** What installing {@link projectModule} adds to a host graph. */
export interface ProjectExports {
  readonly projects: ProjectService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.project` and the label drops the
 * `module.` prefix.
 */
export const PROJECT_LABEL = 'application.project';
