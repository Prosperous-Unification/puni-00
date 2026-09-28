import { describe, expect, it } from 'bun:test';

import { type CompensatingCommand, readCommand, subjectOf, touchedBy } from './compensating';

const rename: CompensatingCommand = { do: 'patch', workItemId: 'w1', patch: { name: 'Strip' } };
const estimate: CompensatingCommand = {
  do: 'set_estimate',
  workItemId: 'w2',
  stepId: 'r1',
  days: { optimistic: 1, realistic: 2, pessimistic: 3 },
};
const edge: CompensatingCommand = { do: 'add_dependency', successorId: 'w2', predecessorId: 'w1' };

it('reads typed compensating commands and names both touched endpoints and the successor', () => {
  const before = {
    id: 'd',
    projectId: 'p',
    predecessor: { scope: 'whole' as const, workItemId: 'a' },
    successor: { scope: 'whole' as const, workItemId: 'b' },
    type: 'FS' as const,
  };
  const after = { ...before, predecessor: { scope: 'whole' as const, workItemId: 'c' } };
  const commands: CompensatingCommand[] = [
    { do: 'add_typed_dependency', dependency: before },
    { do: 'remove_typed_dependency', dependency: before },
    { do: 'update_typed_dependency', from: before, to: after },
  ];
  for (const command of commands) expect(readCommand(command)).toEqual(command);
  expect(touchedBy(commands[0])).toEqual(['a', 'b']);
  expect(touchedBy(commands[1])).toEqual(['a', 'b']);
  expect(touchedBy(commands[2])).toEqual(['a', 'b', 'c']);
  for (const command of commands)
    expect(subjectOf(command)).toEqual({ workItemId: 'b', stepId: null });
});

describe('a batch as one compensating command', () => {
  it('touches what its steps touch, each once', () => {
    // The batch's preconditions are the revisions of every entity any step
    // wrote to: a step left out here is a row an undo would overwrite unseen.
    // Proof: `steps` left out of `touchedBy`, this failed on `expected [] to
    // equal [ 'w1', 'w2' ]`. Watched, 2026-08-29.
    expect(touchedBy({ do: 'batch', steps: [rename, estimate, edge] })).toEqual(['w1', 'w2']);
  });

  it('takes its first step as its subject', () => {
    // The plan event names one work item and step where it has one; a batch's
    // is the row its first step was aimed at, as `restore_subtree` names its
    // root.
    expect(subjectOf({ do: 'batch', steps: [estimate, rename] })).toEqual({
      workItemId: 'w2',
      stepId: 'r1',
    });
    expect(subjectOf({ do: 'batch', steps: [] })).toEqual({ workItemId: null, stepId: null });
  });

  it('reads back from the journal as a command this release can apply', () => {
    expect(readCommand({ do: 'batch', steps: [rename] })).toEqual({ do: 'batch', steps: [rename] });
    expect(() => readCommand({ do: 'bulk', steps: [] })).toThrow(/cannot apply/);
  });
});
