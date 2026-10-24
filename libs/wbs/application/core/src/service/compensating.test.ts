import { describe, expect, it } from 'bun:test';

import { workItemRow } from '../testing/work-item-fixture';
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
  expect(STEP_BLOCKAGE_REPLAY_CAPABILITIES).toEqual([
    'replace_blockage',
    'move_progress_v1',
    'delete_state_v1',
  ]);
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

describe('deletion state boundary', () => {
  const state = {
    blockages: [{ workItemId: 'child', stepId: 'dev', blockedAt: -10 }],
    parentId: 'parent',
    parentBlockages: [],
    restoredParentProgress: [],
  };
  const deleted = {
    do: 'delete_subtree' as const,
    rootId: 'child',
    remove: ['child'],
    expectedSubtree: ['child'],
    reparented: [],
    setEstimates: [],
    setActuals: [],
    setProgress: [],
    setMeasures: [],
    deletionState: state,
  };
  it.each([
    null,
    {},
    { ...state, parentId: '' },
    { ...state, blockages: null },
    { ...state, blockages: [{ ...state.blockages[0], workItemId: 'stray' }] },
    { ...state, blockages: [{ ...state.blockages[0], blockedAt: 1.5 }] },
    { ...state, blockages: [...state.blockages, ...state.blockages] },
    { ...state, parentBlockages: state.blockages },
    { ...state, restoredParentProgress: null },
    {
      ...state,
      parentId: null,
      restoredParentProgress: [{ workItemId: 'parent', stepId: 'dev', state: 'done', statedAt: 1 }],
    },
  ])('refuses malformed deletion state %j', (deletionState) => {
    expect(() => readCommand({ ...deleted, deletionState })).toThrow(/journal/);
  });
  it('validates nested restore owners and includes empty snapshot parent and step references', () => {
    expect(readCommand(deleted)).toEqual(deleted);
    expect(() =>
      readCommand({
        do: 'batch',
        steps: [
          {
            do: 'restore_subtree',
            rows: [{ id: 'other', parentId: 'parent' }],
            deletionState: state,
          },
        ],
      }),
    ).toThrow(/blockage/);
    const command = readCommand({
      ...deleted,
      expectedSubtree: ['child'],
      reparented: [],
      setEstimates: [],
      setActuals: [],
      setProgress: [],
      setMeasures: [],
    });
    expect(referencesOf(command).workItems).toContain('parent');
    expect(referencesOf(command).steps).toContain('dev');
  });
  it('binds restore deletion metadata to the recorded root parent', () => {
    expect(() =>
      readCommand({
        do: 'restore_subtree',
        rows: [{ id: 'child', parentId: 'different' }],
        deletionState: state,
      }),
    ).toThrow(/wrong restoration parent/);
  });
});

describe('claim replay vocabulary', () => {
  const claim = {
    id: 'c1',
    workItemId: 'w1',
    stepId: 'dev',
    personId: 'claire',
    runId: 'agent:main:subagent:7f',
    parentClaimId: 'c0',
    accountId: 'account-f',
  };
  const add: CompensatingCommand = {
    do: 'add_claims',
    claims: [claim],
    stated: [{ workItemId: 'w1', stepId: 'dev' }],
    occupancy: [{ claimId: 'c1', resourceId: 'ram', units: 4 }],
  };
  const remove: CompensatingCommand = { do: 'remove_claims', claims: [claim], cleared: [] };

  it('reads both directions back and names their rows, steps, people and progress', () => {
    expect(readCommand(add)).toEqual(add);
    expect(readCommand(remove)).toEqual(remove);
    expect(touchedBy(add)).toEqual(['w1']);
    expect(progressKeysOf(add)).toEqual([{ workItemId: 'w1', stepId: 'dev' }]);
    expect(progressKeysOf(remove)).toEqual([]);
    expect(referencesOf(add)).toMatchObject({
      workItems: ['w1', 'w1'],
      steps: ['dev', 'dev'],
      people: ['claire'],
      resources: ['ram'],
    });
    expect(subjectOf(add)).toEqual({ workItemId: 'w1', stepId: 'dev' });
  });

  // Proof: with the readClaimReplay call removed from readCommand, every
  // malformed shape below read back without throwing; watched 2026-10-19.
  it('refuses a malformed claim replay', () => {
    for (const malformed of [
      { do: 'add_claims', claims: [], stated: [] },
      { do: 'add_claims', claims: [{ ...claim, accountId: null }], stated: [] },
      { do: 'add_claims', claims: [{ ...claim, runId: 7 }], stated: [] },
      { do: 'add_claims', claims: [claim], occupancy: [] },
      { do: 'remove_claims', claims: [claim], cleared: [{ workItemId: 'w1' }] },
    ])
      expect(() => readCommand(malformed)).toThrow(/claim replay/);
  });

  const move: CompensatingCommand = {
    do: 'move_claims',
    fromWorkItemId: 'w1',
    toWorkItemId: 'w2',
    claims: [claim],
  };

  it('reads a claim move back and names both work items', () => {
    expect(readCommand(move)).toEqual(move);
    expect(touchedBy(move)).toEqual(['w1', 'w2']);
    expect(progressKeysOf(move)).toEqual([]);
    expect(referencesOf(move)).toMatchObject({
      workItems: ['w1', 'w2'],
      steps: ['dev'],
      people: ['claire'],
    });
    expect(subjectOf(move)).toEqual({ workItemId: 'w2', stepId: null });
  });

  // Proof: with the readClaimMove call removed from readCommand, the first
  // malformed shape below read back without throwing; watched 2026-10-20.
  it('refuses a malformed claim move', () => {
    for (const malformed of [
      { do: 'move_claims', fromWorkItemId: 'w1', claims: [claim] },
      { do: 'move_claims', fromWorkItemId: 'w1', toWorkItemId: '', claims: [claim] },
      { do: 'move_claims', fromWorkItemId: 'w1', toWorkItemId: 'w2', claims: [] },
      {
        do: 'move_claims',
        fromWorkItemId: 'w1',
        toWorkItemId: 'w2',
        claims: [{ ...claim, accountId: null }],
      },
      { do: 'move_claims', fromWorkItemId: 'w3', toWorkItemId: 'w2', claims: [claim] },
    ])
      expect(() => readCommand(malformed)).toThrow(/claim (move|replay)/);
  });

  it('reads a claim replay written before occupancy as holding nothing', () => {
    const legacy: CompensatingCommand = { do: 'add_claims', claims: [claim], stated: [] };
    expect(readCommand(legacy)).toEqual(legacy);
    expect(referencesOf(readCommand(legacy))).toMatchObject({ resources: [] });
  });

  it('refuses a claim replay whose occupancy is malformed or names a claim it does not carry', () => {
    for (const malformed of [
      { ...add, occupancy: null },
      { ...add, occupancy: [{ claimId: 'other', resourceId: 'ram', units: 4 }] },
      { ...add, occupancy: [{ claimId: 'c1', resourceId: 'ram', units: 0 }] },
      { ...add, occupancy: [{ claimId: 'c1', resourceId: '', units: 1 }] },
    ])
      expect(() => readCommand(malformed)).toThrow(/claim replay/);
  });

  it('reads a claim replay naming its leased claims back', () => {
    const leased: CompensatingCommand = { ...add, leased: ['c1'] };
    expect(readCommand(leased)).toEqual(leased);
  });

  it('refuses a claim replay whose leased list is malformed or names a claim it does not carry', () => {
    for (const malformed of [
      { ...add, leased: null },
      { ...add, leased: 'c1' },
      { ...add, leased: ['other'] },
    ])
      expect(() => readCommand(malformed)).toThrow(/claim replay/);
  });
});

describe('demand replay vocabulary', () => {
  const set: CompensatingCommand = {
    do: 'set_demand',
    workItemId: 'w1',
    resourceId: 'ram',
    units: 4,
  };
  const clear: CompensatingCommand = { ...set, units: null };

  it('reads both directions back and names their row and resource', () => {
    expect(readCommand(set)).toEqual(set);
    expect(readCommand(clear)).toEqual(clear);
    expect(touchedBy(set)).toEqual(['w1']);
    expect(referencesOf(set)).toMatchObject({ workItems: ['w1'], resources: ['ram'] });
    expect(subjectOf(set)).toEqual({ workItemId: 'w1', stepId: null });
  });

  // Proof: with the set_demand check removed from readCommand, every malformed
  // shape below read back without throwing; watched 2026-10-20.
  it('refuses a malformed demand replay', () => {
    for (const malformed of [
      { do: 'set_demand', workItemId: 'w1', resourceId: 'ram', units: 0 },
      { do: 'set_demand', workItemId: 'w1', resourceId: 'ram', units: 1.5 },
      { do: 'set_demand', workItemId: 'w1', resourceId: 'ram' },
      { do: 'set_demand', workItemId: 'w1', units: 2 },
      { do: 'set_demand', resourceId: 'ram', units: 2 },
    ])
      expect(() => readCommand(malformed)).toThrow(/demand replay/);
  });

  it('refuses a malformed measure estimate replay', () => {
    const trio = {
      workItemId: 'w1',
      stepId: 's1',
      key: 'tokens',
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
      singlePoint: false,
    };
    const subtree = (field: string, value: unknown) => ({
      do: 'restore_subtree',
      rows: [],
      [field]: value,
    });
    expect(readCommand({ do: 'set_measure_estimate', ...trio })).toMatchObject(trio);
    expect(
      readCommand({ do: 'clear_measure_estimate', workItemId: 'w1', stepId: 's1', key: 'kwh' }),
    ).toMatchObject({ key: 'kwh' });
    for (const malformed of [
      { do: 'set_measure_estimate', ...trio, realistic: 5 },
      { do: 'set_measure_estimate', ...trio, optimistic: -1 },
      { do: 'set_measure_estimate', ...trio, singlePoint: 'no' },
      { do: 'set_measure_estimate', ...trio, singlePoint: true },
      {
        do: 'set_measure_estimate',
        ...trio,
        key: 'cost',
        realistic: 1,
        pessimistic: 1,
        singlePoint: true,
      },
      { do: 'set_measure_estimate', ...trio, key: undefined },
      { do: 'clear_measure_estimate', workItemId: 'w1', stepId: 's1' },
      subtree('measureEstimates', 'trios'),
      subtree('measureEstimates', [{ ...trio, pessimistic: 0 }]),
      subtree('removedMeasureEstimates', [{ workItemId: 'w1', stepId: 's1' }]),
      { do: 'delete_subtree', setMeasureEstimates: [{ ...trio, optimistic: Number.NaN }] },
    ])
      expect(() => readCommand(malformed)).toThrow(
        /measure estimate|measureEstimates|MeasureEstimates/,
      );
  });

  it('refuses a budget clear that names no whole budget', () => {
    expect(readCommand({ do: 'clear_budget', workItemId: 'w1', key: 'tokens' })).toMatchObject({
      key: 'tokens',
    });
    for (const malformed of [
      { do: 'clear_budget', workItemId: 'w1' },
      { do: 'clear_budget', workItemId: 7, key: 'tokens' },
    ])
      expect(() => readCommand(malformed)).toThrow('a journal budget clear is malformed');
  });

  it('refuses a measure estimate clear that names no whole step node and key', () => {
    for (const malformed of [
      { do: 'clear_measure_estimate', workItemId: 'w1', stepId: 's1' },
      { do: 'clear_measure_estimate', workItemId: 'w1', key: 'tokens' },
    ])
      expect(() => readCommand(malformed)).toThrow('a journal measure estimate clear is malformed');
  });

  it('refuses a subtree replay whose removed trios name no whole step node and key', () => {
    const removed = (value: unknown) => ({
      do: 'restore_subtree',
      rows: [],
      removedMeasureEstimates: value,
    });
    expect(readCommand(removed([{ workItemId: 'w1', stepId: 's1', key: 'tokens' }]))).toMatchObject(
      { removedMeasureEstimates: [{ key: 'tokens' }] },
    );
    for (const malformed of [removed('trios'), removed([{ workItemId: 'w1', stepId: 's1' }])])
      expect(() => readCommand(malformed)).toThrow(
        'a journal subtree replay holds malformed removedMeasureEstimates',
      );
  });

  it('refuses a malformed budget or basis replay', () => {
    const budget = {
      workItemId: 'w1',
      key: 'tokens',
      cap: 10,
      policy: 'strict',
      holdPerAttempt: null,
    };
    const basis = { currency: 'USD', rateCardDigest: 'card-a' };
    const fact = { workItemId: 'w1', stepId: 's1', metric: 'cost', value: 3 };
    expect(readCommand({ do: 'set_budget', ...budget })).toMatchObject(budget);
    expect(readCommand({ do: 'set_budget', ...budget, holdPerAttempt: 2 })).toMatchObject({
      holdPerAttempt: 2,
    });
    expect(readCommand({ do: 'clear_budget', workItemId: 'w1', key: 'kwh' })).toMatchObject({
      key: 'kwh',
    });
    expect(readCommand({ do: 'set_measure', ...fact, basis })).toMatchObject({ basis });
    expect(readCommand({ do: 'restore_subtree', rows: [], budgets: [budget] })).toMatchObject({
      budgets: [budget],
    });
    for (const malformed of [
      { do: 'set_budget', ...budget, cap: -1 },
      { do: 'set_budget', ...budget, cap: Number.POSITIVE_INFINITY },
      { do: 'set_budget', ...budget, holdPerAttempt: -1 },
      { do: 'set_budget', ...budget, policy: 'firm' },
      { do: 'set_budget', ...budget, key: undefined },
      { do: 'clear_budget', workItemId: 'w1' },
      { do: 'set_measure', ...fact, basis: { currency: 'USD' } },
      { do: 'set_measure', ...fact, basis: { currency: 'USD', rateCardDigest: '' } },
      {
        do: 'set_measure_estimate',
        workItemId: 'w1',
        stepId: 's1',
        key: 'cost',
        optimistic: 1,
        realistic: 2,
        pessimistic: 3,
        singlePoint: false,
        basis: 'card-a',
      },
      { do: 'restore_subtree', rows: [], budgets: 'caps' },
      { do: 'restore_subtree', rows: [], budgets: [{ ...budget, policy: 'firm' }] },
    ])
      expect(() => readCommand(malformed)).toThrow(/budget|basis|measure estimate/);
  });

  const restore: CompensatingCommand = {
    do: 'restore_subtree',
    rows: [workItemRow({ id: 'w1', projectId: 'p', parentId: null, position: 1, name: 'Build' })],
    rootPosition: 1,
    reparented: [],
    estimates: [],
    actuals: [],
    progress: [],
    measures: [],
    assignments: [],
    demands: [{ workItemId: 'w1', resourceId: 'ram', units: 4 }],
    internalDependencies: [],
    externalDependencies: [],
    removedEstimates: [],
    removedActuals: [],
    removedProgress: [],
    removedMeasures: [],
  };

  it('names the resources a restore’s demands name', () => {
    expect(readCommand(restore)).toEqual(restore);
    expect(referencesOf(restore).resources).toEqual(['ram']);
  });

  it('refuses a malformed restored demand', () => {
    const demand = { workItemId: 'w1', resourceId: 'ram', units: 4 };
    for (const demands of [
      null,
      [{ ...demand, units: 0 }],
      [{ ...demand, units: 1.5 }],
      [{ ...demand, resourceId: '' }],
      [{ ...demand, workItemId: 'not-restored' }],
      [{ workItemId: 'w1', resourceId: 'ram' }],
    ])
      expect(() => readCommand({ ...restore, demands })).toThrow(/restore holds/);
  });
});
