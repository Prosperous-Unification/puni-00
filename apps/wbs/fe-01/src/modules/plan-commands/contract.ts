import type { ProjectApi } from '@/lib/wbs-api';

/**
 * The routes a plan command sends to one project as a whole, each taking that
 * project's id first.
 *
 * A value and not only a type, so a test can walk the list and a command that
 * forgot one is named rather than silently absent.
 */
export const PROJECT_COMMAND_ROUTES = [
  'undo',
  'redo',
  'exportPlan',
  'setEstimateMethod',
  'setEstimateArithmetic',
  'setDepReach',
  'setOptimizationSettings',
  'retryOptimization',
  'setStartDate',
  'setTeamCapacity',
  'setPriorityBands',
  'addStep',
  'renameStep',
  'removeStep',
  'createWorkItem',
  'arrangeBySchedule',
  'freezeProject',
  'unfreezeProject',
] as const;

/**
 * The routes a plan command sends about one work item, or one directory entry a
 * picker creates on the way to attaching it — none of them names the project.
 */
export const WORK_ITEM_COMMAND_ROUTES = [
  'patchWorkItem',
  'setStatus',
  'assignPerson',
  'moveWorkItem',
  'duplicateWorkItem',
  'removeWorkItem',
  'setEstimate',
  'clearEstimate',
  'unfreezeWorkItem',
  'addDependency',
  'removeDependency',
  'addTeam',
  'addService',
  'addWorkItemType',
  'addTag',
  'addPerson',
] as const;

export type ProjectCommandRoute = (typeof PROJECT_COMMAND_ROUTES)[number];
export type WorkItemCommandRoute = (typeof WORK_ITEM_COMMAND_ROUTES)[number];

/**
 * The part of the HTTP client the plan's commands write through: this module's
 * private repository port.
 *
 * Narrowed to these routes rather than taken whole, as
 * `modules/calendar-markers/contract.ts`'s `CalendarMarkerRoutes` is, so the
 * module's surface states what it can do to a project: nothing here lists the
 * projects, renames one, imports one, or reads the plan. Only the project
 * composition root (`modules/project/composition.ts`) supplies it; delivery
 * never sees it (rule K2).
 */
export type PlanCommandRoutes = Pick<ProjectApi, ProjectCommandRoute | WorkItemCommandRoute>;

/**
 * A project route with the project it is about already bound: the same call,
 * less its first argument.
 */
type BoundToProject<Route> = Route extends (projectId: string, ...rest: infer Rest) => infer Answer
  ? (...rest: Rest) => Answer
  : never;

/**
 * Every request a plan gesture sends, for one project.
 *
 * The **feature**-service delivery sees (rule K2) in place of the broad
 * `ProjectApi`. The project is bound when it is built, so a table cannot send a
 * write to a project it did not open; a work item's route is passed through as
 * it is. Every member reaches its route at the moment it is called, never
 * earlier, and hands back the route's own promise — answer or refusal —
 * unchanged, because the plan writer and the gestures classify a refusal by
 * the object thrown.
 *
 * The gesture policy — what each write dirties, which several requests make one
 * gesture — stays with the table's hooks and the plan writer until the command
 * services of the code organization design are extracted one by one.
 */
export type PlanCommands = {
  readonly [Route in ProjectCommandRoute]: BoundToProject<ProjectApi[Route]>;
} & {
  readonly [Route in WorkItemCommandRoute]: ProjectApi[Route];
};

/** What the commands need from whoever built them. */
export interface PlanCommandPorts {
  readonly projectId: string;
  readonly routes: PlanCommandRoutes;
}
