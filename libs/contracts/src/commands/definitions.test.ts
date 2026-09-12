import { expect, test } from 'bun:test';

import { planCommandsBody, type PlanCommandWire } from '../http/plan-command-shapes';

const PINNED_COMMAND_KINDS = [
  'createWorkItem',
  'patchWorkItem',
  'moveWorkItem',
  'duplicateWorkItem',
  'deleteWorkItem',
  'setEstimate',
  'clearEstimate',
  'setActual',
  'clearActual',
  'setProgress',
  'clearProgress',
  'setMeasure',
  'clearMeasure',
  'setAssignee',
  'addDependency',
  'removeDependency',
  'arrangeBySchedule',
  'freezeProject',
  'unfreezeProject',
  'unfreezeWorkItem',
  'setCapacity',
  'setPriorityBands',
  'createTeam',
  'patchTeam',
  'deleteTeam',
  'createPerson',
  'patchPerson',
  'deletePerson',
  'createTag',
  'patchTag',
  'deleteTag',
  'createService',
  'patchService',
  'deleteService',
  'createWorkItemType',
  'patchWorkItemType',
  'deleteWorkItemType',
] as const satisfies readonly PlanCommandWire['kind'][];

interface CommandDescriptor {
  properties?: {
    kind?: { const?: string };
    commands?: { items?: { anyOf?: CommandDescriptor[] } };
  };
}

test('pins every current structural command kind independently of its declaration', () => {
  const descriptor = planCommandsBody.jsonSchema as CommandDescriptor;
  const branches = descriptor.properties?.commands?.items?.anyOf;
  if (branches === undefined) throw new Error('Missing command alternatives');
  const emittedKinds = branches.map((branch) => branch.properties?.kind?.const);

  // Proof: deleting the production clearMeasure arm failed this assertion with the expected
  // set containing "clearMeasure" and the received set omitting it.
  expect(new Set(emittedKinds)).toEqual(new Set(PINNED_COMMAND_KINDS));
  expect(emittedKinds).toHaveLength(PINNED_COMMAND_KINDS.length);
});
