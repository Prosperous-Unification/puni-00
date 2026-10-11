import type { CapacityModeSwitch, ProjectRankStore } from '@wbs/core';

const unused = (): Promise<never> =>
  Promise.reject(new Error('this composition holds no project rank; use the organization harness'));

/** Inert project rank and capacity-mode store for app compositions whose subject is neither. */
export const refusingProjectRanks: ProjectRankStore & CapacityModeSwitch = {
  orderIn: unused,
  moveAfter: unused,
  capacityModeIn: unused,
  switchCapacityMode: unused,
};
