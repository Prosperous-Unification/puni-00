import type { WorkPackageApi } from '@/lib/wbs-api';

/**
 * The routes a plan command or a work-package-scoped read (`exportPlan`,
 * `readClaimHistory`) sends to one work package as a whole, each taking that
 * work package's id first.
 *
 * A value and not only a type, so a test can walk the list and a command that
 * forgot one is named rather than silently absent.
 */
export const WORK_PACKAGE_COMMAND_ROUTES = [
  'undo',
  'redo',
  'exportPlan',
  'readClaimHistory',
  'setEstimateMethod',
  'setEstimateArithmetic',
  'setDepReach',
  'setOptimizationSettings',
  'retryOptimization',
  'setStartDate',
  'setTimezone',
  'setTeamCapacity',
  'setPriorityBands',
  'setStepAllowance',
  'setStepUnit',
  'createWorkItem',
  'arrangeBySchedule',
  'freezeWorkPackage',
  'unfreezeWorkPackage',
  'addTypedDependency',
  'updateTypedDependency',
  'removeTypedDependency',
  'readResources',
  'setDemands',
] as const;

/**
 * The routes a plan command sends about one work item, or one directory entry a
 * picker creates on the way to attaching it, or the server list a settings
 * control picks from — none of them names the work package.
 */
export const WORK_ITEM_COMMAND_ROUTES = [
  'patchWorkItem',
  'setStatus',
  'setProgress',
  'clearProgress',
  'setStepBlocked',
  'startAttempt',
  'endAttempt',
  'removeAttempt',
  'listTimezones',
  'assignPerson',
  'moveWorkItem',
  'duplicateWorkItem',
  'removeWorkItem',
  'setEstimate',
  'clearEstimate',
  'listMeasures',
  'setMeasureEstimate',
  'clearMeasureEstimate',
  'setMeasure',
  'clearMeasure',
  'setBudget',
  'clearBudget',
  'unfreezeWorkItem',
  'claimWorkItem',
  'releaseWorkItem',
  'addDependency',
  'removeDependency',
  'addTeam',
  'addService',
  'addWorkItemType',
  'addTag',
  'addPerson',
] as const;

export type WorkPackageCommandRoute = (typeof WORK_PACKAGE_COMMAND_ROUTES)[number];
export type WorkItemCommandRoute = (typeof WORK_ITEM_COMMAND_ROUTES)[number];

/**
 * The part of the HTTP client the plan's commands write through: this module's
 * private repository port.
 *
 * Narrowed to these routes rather than taken whole, as
 * `modules/calendar-markers/contract.ts`'s `CalendarMarkerRoutes` is, so the
 * module's surface states what it can do to a work package: nothing here lists the
 * work packages, renames one, imports one, or reads the plan. Only the work package
 * composition root (`modules/work-package/composition.ts`) supplies it; delivery
 * never sees it (rule K2).
 */
export type PlanCommandRoutes = Pick<
  WorkPackageApi,
  WorkPackageCommandRoute | WorkItemCommandRoute
>;

/**
 * A work package route with the work package it is about already bound: the same call,
 * less its first argument.
 */
type BoundToWorkPackage<Route> = Route extends (
  workPackageId: string,
  ...rest: infer Rest
) => infer Answer
  ? (...rest: Rest) => Answer
  : never;

/**
 * Every request a plan gesture sends, for one work package.
 *
 * The **feature**-service delivery sees (rule K2) in place of the broad
 * `WorkPackageApi`. The work package is bound when it is built, so a table cannot send a
 * write to a work package it did not open; a work item's route is passed through as
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
  readonly [Route in WorkPackageCommandRoute]: BoundToWorkPackage<WorkPackageApi[Route]>;
} & {
  readonly [Route in WorkItemCommandRoute]: WorkPackageApi[Route];
};

/** What the commands need from whoever built them. */
export interface PlanCommandPorts {
  readonly workPackageId: string;
  readonly routes: PlanCommandRoutes;
}
