import type { ProjectRankStore } from '@wbs/core';

const unused = (): Promise<never> =>
  Promise.reject(new Error('this composition holds no project rank; use the organization harness'));

/** Inert project rank store for app compositions whose subject is not the rank. */
export const refusingProjectRanks: ProjectRankStore = {
  orderIn: unused,
  moveAfter: unused,
};
