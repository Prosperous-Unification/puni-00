import { openMemorySource } from '@wbs/store-memory';
import { expect, test } from 'bun:test';

import type { CommandAdmission } from './plan-commands/admitted-scope.resource';
import type { admittedWrites } from './plan-commands/admitted-write';
import { commandTransaction } from './plan-commands/composition';
import type { PlanCommandRunnerOptions } from './plan-commands/plan-commands.feature';
import type { ImportServiceOptions } from './plan-import/plan-import.feature';

type AssertFalse<Predicate extends false> = Predicate;
type RawCommandOption = AssertFalse<
  Extract<keyof PlanCommandRunnerOptions, 'uow' | 'batchServices' | 'graphOf'> extends never
    ? false
    : true
>;
type RawImportOption = AssertFalse<
  Extract<keyof ImportServiceOptions, 'uow' | 'batchServices' | 'graphOf'> extends never
    ? false
    : true
>;
type GenericGraphEscape = AssertFalse<'graphOf' extends keyof CommandAdmission ? true : false>;
type RawAdmittedWriteOption = AssertFalse<
  Extract<keyof Parameters<typeof admittedWrites>[0], 'uow' | 'batch' | 'graphOf'> extends never
    ? false
    : true
>;

test('feature transactions expose only mapped resources', () => {
  const commandSafe: RawCommandOption = false;
  const importSafe: RawImportOption = false;
  const graphSafe: GenericGraphEscape = false;
  const admittedWriteSafe: RawAdmittedWriteOption = false;
  expect([commandSafe, importSafe, graphSafe, admittedWriteSafe]).toEqual([
    false,
    false,
    false,
    false,
  ]);
});

test('composition keeps source capabilities outside feature callbacks', async () => {
  const source = openMemorySource();
  // Proof: injecting `graphOf` into the command resources object made this
  // assertion fail with `true`; watched in the isolated candidate snapshot.
  await commandTransaction(source.uow, () => {
    throw new Error('unused command graph factory');
  }).run((resources) => {
    expect(Object.keys(resources).sort()).toEqual([
      'listCrossReferenceKinds',
      'openCommandGraph',
      'refuseOutsideScope',
    ]);
    expect('graphOf' in resources).toBe(false);
    expect('stores' in resources).toBe(false);
    return Promise.resolve({ commit: false as const, value: null });
  });
});
