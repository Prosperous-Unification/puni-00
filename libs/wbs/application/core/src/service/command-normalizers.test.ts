import { commandDefinitions, defineCommand } from '@wbs/contracts';
import { type } from 'arktype';
import { describe, expect, test } from 'bun:test';

import { type CommandNormalizerRecord, commandNormalizers } from './command-normalizers';

const nodeId = 'sn1.11111111-1111-4111-8111-111111111111.22222222-2222-4222-8222-222222222222';
const stepKinds = [
  ['setEstimate', { days: { optimistic: 1, realistic: 2, pessimistic: 3 } }],
  ['clearEstimate', {}],
  ['setActual', { days: 2 }],
  ['clearActual', {}],
  ['setProgress', { state: 'done' }],
  ['setStepBlocked', { isBlocked: true }],
  ['clearProgress', {}],
  ['setMeasure', { metric: 'hours', value: 2 }],
  ['clearMeasure', { metric: 'hours' }],
  ['setAssignee', { personId: null }],
] as const;

test('normalizes all step-node commands to the original pair', () => {
  for (const [kind, fields] of stepKinds) {
    const normalized = commandNormalizers[kind]({ kind, stepNodeId: nodeId, ...fields } as never);
    expect(normalized).toMatchObject({
      kind,
      workItemId: '11111111-1111-4111-8111-111111111111',
      stepId: '22222222-2222-4222-8222-222222222222',
    });
    expect(normalized).not.toHaveProperty('stepNodeId');
  }
});

test('refuses conflicting, missing and invalid step addresses', () => {
  for (const [kind, fields] of stepKinds) {
    expect(() =>
      commandNormalizers[kind]({
        kind,
        stepNodeId: nodeId,
        workItemId: 'another',
        ...fields,
      } as never),
    ).toThrow('conflicting_step_address');
    expect(() =>
      commandNormalizers[kind]({
        kind,
        stepNodeId: nodeId,
        workItemRef: 'named',
        ...fields,
      } as never),
    ).toThrow('conflicting_step_address');
    expect(() =>
      commandNormalizers[kind]({ kind, stepNodeId: nodeId, stepId: 'another', ...fields } as never),
    ).toThrow('conflicting_step_address');
    expect(() => commandNormalizers[kind]({ kind, ...fields } as never)).toThrow(
      'stepId_must_be_text',
    );
    expect(() =>
      commandNormalizers[kind]({ kind, stepNodeId: 'broken', ...fields } as never),
    ).toThrow('invalid_step_node_id');
    expect(() =>
      commandNormalizers[kind]({
        kind,
        stepNodeId: nodeId.replace('sn1.', 'sn2.'),
        ...fields,
      } as never),
    ).toThrow('unknown_step_node_encoding');
  }
});

export function normalizerTypeCases() {
  const _definitionsWithTemporary = {
    ...commandDefinitions,
    temporaryCommand: defineCommand('temporaryCommand', {
      schema: type({ kind: "'temporaryCommand'" }),
      scope: 'project',
      description: 'Temporary compile-negative command.',
    }),
  } as const;

  // Proof: removing this expected error failed typecheck with TS2741 because
  // `temporaryCommand` was missing from this normalizer record.
  // @ts-expect-error A structural definition without a normalizer makes the record incomplete.
  const incompleteNormalizers: CommandNormalizerRecord<typeof _definitionsWithTemporary> =
    commandNormalizers;

  // Proof: leaving setActual's input as Record<string, unknown> failed core:typecheck here with
  // TS2578 because a clearActual discriminator still satisfied the call.
  // @ts-expect-error A normalizer accepts only the structural command with its own kind.
  commandNormalizers.setActual({ kind: 'clearActual', stepId: 'build', days: 1 });

  const _definitionsWithRenamedDays = {
    ...commandDefinitions,
    setActual: defineCommand('setActual', {
      schema: type({ kind: "'setActual'", elapsedDays: 'number' }),
      scope: 'project',
      description: 'Temporary compile-negative required field rename.',
    }),
  } as const;

  // Proof: leaving every normalizer input as Record<string, unknown> failed core:typecheck here
  // with TS2578 because replacing required days with elapsedDays did not invalidate the record.
  // @ts-expect-error A structural field rename requires its semantic normalizer to change too.
  const staleNormalizers: CommandNormalizerRecord<typeof _definitionsWithRenamedDays> =
    commandNormalizers;
  return { incompleteNormalizers, staleNormalizers };
}

test('preserves priority absence null and number', () => {
  expect(commandNormalizers.createWorkItem({ kind: 'createWorkItem' })).toEqual({
    kind: 'createWorkItem',
    parentId: null,
    afterId: null,
  });
  expect(commandNormalizers.createWorkItem({ kind: 'createWorkItem', priority: null })).toEqual({
    kind: 'createWorkItem',
    parentId: null,
    afterId: null,
    priority: null,
  });
  expect(commandNormalizers.createWorkItem({ kind: 'createWorkItem', priority: 47 })).toEqual({
    kind: 'createWorkItem',
    parentId: null,
    afterId: null,
    priority: 47,
  });
});

test('defaults missing assignee to null', () => {
  expect(commandNormalizers.setAssignee({ kind: 'setAssignee', stepId: 'build' })).toEqual({
    kind: 'setAssignee',
    stepId: 'build',
    personId: null,
  });
});

test('refuses missing and nonboolean blockage intent before dispatch', () => {
  for (const isBlocked of [undefined, null, 'true', 1]) {
    expect(() =>
      commandNormalizers.setStepBlocked({
        kind: 'setStepBlocked',
        workItemId: 'leaf',
        stepId: 'dev',
        isBlocked,
      } as never),
    ).toThrow('isBlocked_must_be_true_or_false');
  }
});

// Proof: with asOptionalRunId's length bound removed, the 257-character run
// normalized; watched 2026-10-19.
test('bounds a claim’s run to 1 to 256 characters and keeps steps and parent as given', () => {
  const claim = (runId: unknown) =>
    commandNormalizers.claimWorkItem({
      kind: 'claimWorkItem',
      workItemId: 'w',
      personId: 'p',
      steps: ['dev'],
      parentClaim: 'c0',
      runId,
    } as never);
  expect(claim('r'.repeat(256))).toEqual({
    kind: 'claimWorkItem',
    workItemId: 'w',
    personId: 'p',
    steps: ['dev'],
    parentClaim: 'c0',
    runId: 'r'.repeat(256),
  });
  for (const runId of ['r'.repeat(257), '', 7])
    expect(() => claim(runId)).toThrow('runId_must_be_1_to_256_characters');
});

test('refuses an empty step list on a claim and a release', () => {
  for (const kind of ['claimWorkItem', 'releaseWorkItem'] as const)
    expect(() =>
      commandNormalizers[kind]({ kind, workItemId: 'w', personId: 'p', steps: [] } as never),
    ).toThrow('steps_must_name_a_step');
});

describe('a claim’s resources (wbs-resources R4)', () => {
  const claim = (resources: unknown) =>
    commandNormalizers.claimWorkItem({
      kind: 'claimWorkItem',
      workItemId: 'w',
      personId: 'p',
      resources,
    } as never);

  test('keeps absent absent and each entry as given', () => {
    expect(claim(undefined)).not.toHaveProperty('resources');
    expect(claim([{ resourceId: 'ram', units: 6 }]).resources).toEqual([
      { resourceId: 'ram', units: 6 },
    ]);
  });

  test('refuses resources naming one resource twice', () => {
    expect(() =>
      claim([
        { resourceId: 'ram', units: 6 },
        { resourceId: 'ram', units: 8 },
      ]),
    ).toThrow('resources_must_name_each_resource_once');
  });

  test('refuses an empty list, a non-list, a malformed entry and units outside 1 to the bound', () => {
    expect(() => claim([])).toThrow('resources_must_name_a_resource');
    expect(() => claim({ resourceId: 'ram', units: 1 })).toThrow('resources_must_be_a_list');
    expect(() => claim(['ram'])).toThrow('resources_must_be_a_list');
    expect(() => claim([{ units: 1 }])).toThrow('resourceId_must_be_an_id');
    expect(() => claim([{ resourceId: 'ram' }])).toThrow('units_required');
    for (const units of [0, 1.5, null, '2'])
      expect(() => claim([{ resourceId: 'ram', units }])).toThrow(
        'units_must_be_a_whole_number_from_1',
      );
    expect(() => claim([{ resourceId: 'ram', units: 1_000_000_001 }])).toThrow(
      'units_must_be_at_most_1000000000',
    );
    expect(() =>
      claim(
        Array.from({ length: 51 }, (_, index) => ({ resourceId: `r${String(index)}`, units: 1 })),
      ),
    ).toThrow('resources_must_be_at_most_50');
  });
});
