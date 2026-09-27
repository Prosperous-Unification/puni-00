import { commandDefinitions, defineCommand } from '@wbs/contracts';
import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { type CommandNormalizerRecord, commandNormalizers } from './command-normalizers';

const nodeId = 'sn1.11111111-1111-4111-8111-111111111111.22222222-2222-4222-8222-222222222222';
const stepKinds = [
  ['setEstimate', { days: { optimistic: 1, realistic: 2, pessimistic: 3 } }],
  ['clearEstimate', {}],
  ['setActual', { days: 2 }],
  ['clearActual', {}],
  ['setProgress', { state: 'done' }],
  ['clearProgress', {}],
  ['setMeasure', { metric: 'hours', value: 2 }],
  ['clearMeasure', { metric: 'hours' }],
  ['setAssignee', { personId: null }],
] as const;

test('normalizes all nine step-node commands to the original pair', () => {
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
