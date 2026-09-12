import type { PlanCommandKind } from './command-normalizers';

export type { PlanCommand, PlanCommandKind } from './command-normalizers';

/**
 * Every normalized kind, retained until all consumers move to the shared
 * structural registry. The exhaustive record still catches drift in this slice.
 */
const EVERY_KIND = {
  createWorkItem: true,
  patchWorkItem: true,
  moveWorkItem: true,
  duplicateWorkItem: true,
  deleteWorkItem: true,
  setEstimate: true,
  clearEstimate: true,
  setActual: true,
  clearActual: true,
  setProgress: true,
  clearProgress: true,
  setMeasure: true,
  clearMeasure: true,
  setAssignee: true,
  addDependency: true,
  removeDependency: true,
  freezeProject: true,
  unfreezeProject: true,
  unfreezeWorkItem: true,
  setCapacity: true,
  setPriorityBands: true,
  createTeam: true,
  patchTeam: true,
  deleteTeam: true,
  createPerson: true,
  patchPerson: true,
  deletePerson: true,
  createTag: true,
  patchTag: true,
  deleteTag: true,
  createWorkItemType: true,
  patchWorkItemType: true,
  deleteWorkItemType: true,
  createService: true,
  patchService: true,
  deleteService: true,
  arrangeBySchedule: true,
} satisfies Record<PlanCommandKind, true>;

/** The normalized kinds in their stable declaration order. */
export const PLAN_COMMAND_KINDS: readonly PlanCommandKind[] = Object.keys(
  EVERY_KIND,
) as PlanCommandKind[];

/** The most commands one batch may carry. */
export const MOST_COMMANDS_IN_A_BATCH = 200;
