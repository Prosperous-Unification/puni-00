import type { ProjectRankStore, SharedPeopleStore } from '@wbs/core';

const unused = (): Promise<never> =>
  Promise.reject(new Error('this composition holds no project rank; use the organization harness'));

/** Inert rank and mode store for app compositions whose subject is neither. */
export const refusingProjectRanks: ProjectRankStore & SharedPeopleStore = {
  orderIn: unused,
  moveAfter: unused,
  sharedPeopleIn: unused,
  setSharedPeople: unused,
};
