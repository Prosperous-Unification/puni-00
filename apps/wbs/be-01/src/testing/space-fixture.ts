import type { SpaceStore } from '@wbs/core';

const unused = (): Promise<never> =>
  Promise.reject(new Error('this composition holds no spaces; use the organization harness'));

/** Inert space store for app compositions whose subject is not spaces. */
export const refusingSpaces: SpaceStore = {
  legacyOrganizationId: unused,
  listIn: unused,
  findIn: unused,
  create: unused,
  rename: unused,
  remove: unused,
  membersOf: unused,
  membersIn: unused,
  addProject: unused,
  removeProject: unused,
  moveProject: unused,
};
