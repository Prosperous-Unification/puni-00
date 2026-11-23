import type { SpaceStore } from '@wbs/core';
import type { SpaceRead, SpaceRollUpRead } from '@wbs/core/ports/space-read';

const unused = (): Promise<never> =>
  Promise.reject(new Error('this composition holds no spaces; use the organization harness'));

/** Explicitly unsupported grouped observations in fixtures whose subject is not spaces. */
export const refusingSpaceRead: SpaceRead & SpaceRollUpRead = { read: unused, rollUps: unused };

/** Inert space store for app compositions whose subject is not spaces. */
export const refusingSpaces: SpaceStore = {
  legacyOrganizationId: unused,
  listIn: unused,
  findIn: unused,
  readContents: unused,
  create: unused,
  rename: unused,
  remove: unused,
  membersOf: unused,
  membersIn: unused,
  peopleOf: unused,
  teamsOf: unused,
  addPerson: unused,
  removePerson: unused,
  addTeam: unused,
  removeTeam: unused,
  addProject: unused,
  removeProject: unused,
  moveProject: unused,
};
