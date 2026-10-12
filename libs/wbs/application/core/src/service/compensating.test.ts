import { describe, expect, it } from 'bun:test';

import {
  boundEstimateUnits,
  type CompensatingCommand,
  estimateStepsOf,
  readCommand,
  readPreconditions,
  subjectOf,
  touchedBy,
} from './compensating';

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

describe('journal estimate unit bindings', () => {
  it('collects nested estimate-bearing commands in both directions', () => {
    const subtree = readCommand({
      do: 'restore_subtree',
      estimates: [{ stepId: 'restored' }],
      removedEstimates: [{ stepId: 'removed' }],
    });
    const deleted = readCommand({ do: 'delete_subtree', setEstimates: [{ stepId: 'handed-up' }] });
    expect(
      [
        ...estimateStepsOf([
          { do: 'batch', steps: [estimate, { do: 'batch', steps: [subtree, deleted] }] },
          { do: 'clear_estimate', workItemId: 'w', stepId: 'cleared' },
        ]),
      ].sort(),
    ).toEqual(['cleared', 'handed-up', 'r1', 'removed', 'restored']);
  });
  it('interprets a legacy absent map as workdays and preserves a present map', () => {
    expect(boundEstimateUnits(readPreconditions({ expected: {}, from: {} }), [estimate])).toEqual({
      r1: 'workdays',
    });
    expect(
      boundEstimateUnits(
        readPreconditions({ expected: {}, from: {}, estimateUnits: { r1: 'minutes' } }),
        [estimate],
      ),
    ).toEqual({ r1: 'minutes' });
  });
  it('refuses malformed and incomplete present maps as damaged trusted journal state', () => {
    for (const estimateUnits of [null, [], { r1: 'hours' }, { r1: 3 }])
      expect(() => readPreconditions({ expected: {}, from: {}, estimateUnits })).toThrow(
        'estimate units',
      );
    expect(() =>
      boundEstimateUnits(readPreconditions({ expected: {}, from: {}, estimateUnits: {} }), [
        estimate,
      ]),
    ).toThrow('no binding for step r1');
  });
});
