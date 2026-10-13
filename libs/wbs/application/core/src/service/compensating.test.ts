import { describe, expect, it } from 'bun:test';

import {
  boundEstimateUnits,
  type CompensatingCommand,
  estimateStepsOf,
  expectedProgressOwnersOf,
  progressKeysOf,
  readCommand,
  readPreconditions,
  referencesOf,
  STEP_BLOCKAGE_REPLAY_CAPABILITIES,
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

describe('conditional blockage replay vocabulary', () => {
  const replace = {
    do: 'replace_blockage',
    workItemId: 'leaf',
    stepId: 'dev',
    expectedBlockedAt: 123,
    replacementBlockedAt: null,
  } as const;

  it('decodes nested commands and carries their owner and step through every index', () => {
    const nested = readCommand({ do: 'batch', steps: [{ do: 'batch', steps: [replace] }] });
    expect(touchedBy(nested)).toEqual(['leaf']);
    expect(referencesOf(nested).workItems).toEqual(['leaf']);
    expect(referencesOf(nested).steps).toEqual(['dev']);
    expect(subjectOf(nested)).toEqual({ workItemId: 'leaf', stepId: 'dev' });
    expect(readCommand(replace)).toEqual(replace);
  });

  it('refuses unknown nested commands and malformed blockage times', () => {
    // Proof: skipping recursive batch decoding returned the unknown nested command unchanged.
    expect(() => readCommand({ do: 'batch', steps: [{ do: 'newer_command' }] })).toThrow(
      /cannot apply/,
    );
    // Proof: bypassing blockage field validation admitted an undefined expected time.
    for (const expectedBlockedAt of [undefined, 1.5, Number.MAX_SAFE_INTEGER + 1, '123']) {
      expect(() => readCommand({ ...replace, expectedBlockedAt })).toThrow(/blockage/);
    }
  });
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

describe('move historical progress snapshots', () => {
  const legacy = { do: 'move' as const, workItemId: 'child', parentId: 'parent', afterId: null };
  const historical = { workItemId: 'parent', stepId: 'dev', state: 'done' as const, statedAt: 123 };
  const move = { ...legacy, expectedProgress: [historical] };

  it('reads exact move snapshots through nested journal commands and keeps legacy moves absent', () => {
    expect(readCommand({ do: 'batch', steps: [move] })).toEqual({ do: 'batch', steps: [move] });
    expect(readCommand(legacy)).toEqual(legacy);
    expect(touchedBy(move)).toEqual(['child', 'parent']);
    expect(referencesOf(move).steps).toEqual(['dev']);
  });

  it('tracks only explicit snapshot owners across nested directions', () => {
    const plain = { ...legacy, parentId: 'unrelated-parent', afterId: 'unrelated-sibling' };
    expect(touchedBy(plain)).toEqual(['child']);
    expect(expectedProgressOwnersOf(plain)).toEqual([]);
    expect(
      expectedProgressOwnersOf({
        do: 'batch',
        steps: [plain, rename, { do: 'batch', steps: [move, move] }],
      }),
    ).toEqual(['parent']);
  });

  it('refuses malformed present snapshots instead of treating them as empty history', () => {
    for (const expectedProgress of [
      null,
      {},
      undefined,
      [null],
      [{ ...historical, workItemId: 'foreign' }],
      [{ ...historical, stepId: 1 }],
      [{ ...historical, state: 'unknown' }],
      [{ ...historical, statedAt: 1.5 }],
      [historical, historical],
    ]) {
      expect(() => readCommand({ ...legacy, expectedProgress })).toThrow(/move progress/);
    }
  });
});

describe('move destination progress preconditions', () => {
  const fact = { workItemId: 'destination', stepId: 'dev', state: 'done' as const, statedAt: 123 };
  const base = { expected: {}, from: {} };
  it('reads empty and populated destination snapshots without defaulting malformed metadata', () => {
    expect(
      readPreconditions({ ...base, moveProgress: { destination: [fact], empty: [] } }),
    ).toEqual({ ...base, moveProgress: { destination: [fact], empty: [] } });
    for (const moveProgress of [
      null,
      [],
      { destination: null },
      { destination: [{ ...fact, workItemId: 'foreign' }] },
      { destination: [fact, fact] },
      { '': [] },
    ]) {
      expect(() => readPreconditions({ ...base, moveProgress })).toThrow(/move progress/);
    }
  });
});

it('advertises move safety metadata without accepting its capability as a command', () => {
  expect(STEP_BLOCKAGE_REPLAY_CAPABILITIES).toEqual(['replace_blockage', 'move_progress_v1']);
  expect(() => readCommand({ do: 'move_progress_v1' })).toThrow(/cannot apply/);
});

it('attributes exact progress writes to the selected command through nested and structural replay', () => {
  const progress = { workItemId: 'parent', stepId: 'dev', state: 'done', statedAt: 123 };
  const restore = readCommand({
    do: 'restore_subtree',
    progress: [progress],
    removedProgress: [{ workItemId: 'child', stepId: 'qa' }],
  });
  const deleted = readCommand({
    do: 'delete_subtree',
    setProgress: [{ ...progress, stepId: 'qa' }],
  });
  expect(
    progressKeysOf({
      do: 'batch',
      steps: [
        rename,
        {
          do: 'batch',
          steps: [restore, deleted, { do: 'clear_progress', workItemId: 'leaf', stepId: 'ops' }],
        },
      ],
    }),
  ).toEqual([
    { workItemId: 'parent', stepId: 'dev' },
    { workItemId: 'child', stepId: 'qa' },
    { workItemId: 'parent', stepId: 'qa' },
    { workItemId: 'leaf', stepId: 'ops' },
  ]);
  expect(progressKeysOf(rename)).toEqual([]);
  expect(
    progressKeysOf({ do: 'set_progress', workItemId: 'parent', stepId: 'dev', state: 'done' }),
  ).toEqual([{ workItemId: 'parent', stepId: 'dev' }]);
});
