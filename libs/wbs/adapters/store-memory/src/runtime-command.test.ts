import { assertRuntimeRejection } from '@wbs/conformance/runtime-command-conformance';
import {
  RUNTIME_CLAIM,
  RUNTIME_SCOPE,
  runtimeAcceptanceFixture,
  runtimeCommandConformance,
  runtimeRecordConformance,
} from '@wbs/conformance/runtime-command-conformance';
import { describe } from 'bun:test';

import { openMemorySource } from './source';

describe('memory runtime command persistence', () => {
  const open = () => {
    const source = openMemorySource();
    return Promise.resolve({ source, close: () => source.close() });
  };
  runtimeCommandConformance(open);
  runtimeRecordConformance(open);
});

import { expect, it } from 'bun:test';

import {
  inMemoryRuntimeCommands,
  type MemoryRuntimeTable,
  memoryRuntimeTable,
} from './runtime-command';

it('rejects retained memory history loss before reporting receipt or scope absence', async () => {
  const table = memoryRuntimeTable();
  const store = inMemoryRuntimeCommands(table);
  const scope = { organizationId: 'org', projectId: 'project', personId: 'person' };
  await store.compareAuthority(scope, null, 'owner');
  table.authorities.clear();
  await assertRuntimeRejection(store.readAuthority(scope), 'runtime retained history');
  await assertRuntimeRejection(store.readAcceptance(scope, 'absent'), 'runtime retained history');
  await assertRuntimeRejection(store.assertAbsentHistory(), 'runtime retained history');
});

/** Reads actual source-produced keys; it does not implement the production key encoder. */
function readOnlyEntry<Value>(entries: Map<string, Value>): [string, Value] {
  const entry = entries.entries().next().value;
  if (entry === undefined || entries.size !== 1)
    throw new Error('corruption fixture needs one retained entry');
  return entry;
}

const corruptions: readonly {
  name: string;
  message?: string;
  corrupt(table: MemoryRuntimeTable): void;
}[] = [
  {
    name: 'authority scope key is malformed JSON',
    corrupt(table) {
      const [key, held] = readOnlyEntry(table.authorities);
      table.authorities.delete(key);
      table.authorities.set('not-json', held);
    },
  },
  ...[
    ['scope tuple is an object', '{}'],
    ['scope tuple has missing positions', '["org","project"]'],
    ['scope tuple has extra positions', '["org","project","person","extra"]'],
  ].map(([name, key]) => ({
    name: `authority ${name}`,
    message: 'invalid runtime scope key',
    corrupt(table: MemoryRuntimeTable) {
      const [previous, held] = readOnlyEntry(table.authorities);
      table.authorities.delete(previous);
      table.authorities.set(key, held);
    },
  })),
  {
    name: 'authority scoped IDs are not strings',
    corrupt(table) {
      const [key, held] = readOnlyEntry(table.authorities);
      table.authorities.delete(key);
      table.authorities.set('[42,"project","person"]', held);
    },
  },
  {
    name: 'authority key aliases a canonical scope with whitespace',
    message: 'runtime scope key identity mismatch',
    corrupt(table) {
      const [key, held] = readOnlyEntry(table.authorities);
      table.authorities.delete(key);
      table.authorities.set('[ "org", "project", "person" ]', held);
    },
  },
  {
    name: 'binding key is malformed JSON',
    corrupt(table) {
      const [key, bound] = readOnlyEntry(table.bindings);
      table.bindings.delete(key);
      table.bindings.set('not-json', bound);
    },
  },
  ...[
    ['binding tuple is an object', '{}'],
    ['binding tuple has missing positions', '["[]"]'],
    [
      'binding tuple has extra positions',
      JSON.stringify([JSON.stringify(['org', 'project', 'person']), 'claim', 'extra']),
    ],
    ['binding scope key is not a string', '[42,"claim"]'],
  ].map(([name, key]) => ({
    name,
    message: 'invalid runtime binding key',
    corrupt(table: MemoryRuntimeTable) {
      const [previous, bound] = readOnlyEntry(table.bindings);
      table.bindings.delete(previous);
      table.bindings.set(key, bound);
    },
  })),
  {
    name: 'binding key contains malformed scoped tuple',
    message: 'invalid runtime scope key',
    corrupt(table) {
      const [key, bound] = readOnlyEntry(table.bindings);
      table.bindings.delete(key);
      table.bindings.set('["{}","claim"]', bound);
    },
  },
  {
    name: 'binding outer key aliases canonical lookup with whitespace',
    message: 'runtime binding key identity mismatch',
    corrupt(table) {
      const [key, bound] = readOnlyEntry(table.bindings);
      table.bindings.delete(key);
      table.bindings.set(` ${key} `, bound);
    },
  },
  {
    name: 'binding claim ID differs from its retained key',
    message: 'runtime binding lookup identity mismatch',
    corrupt(table) {
      const [key, bound] = readOnlyEntry(table.bindings);
      table.bindings.set(key, { ...bound, claimId: 'wrong-claim' });
    },
  },
  {
    name: 'binding key names another claim',
    message: 'runtime binding lookup identity mismatch',
    corrupt(table) {
      const [key, bound] = readOnlyEntry(table.bindings);
      table.bindings.delete(key);
      table.bindings.set(
        JSON.stringify([JSON.stringify(['org', 'project', 'person']), 'wrong-claim']),
        bound,
      );
    },
  },
  {
    name: 'acceptance key is malformed',
    message: 'runtime acceptance lookup identity mismatch',
    corrupt(table) {
      const [key, accepted] = readOnlyEntry(table.acceptances);
      table.acceptances.delete(key);
      table.acceptances.set('malformed-key', accepted);
    },
  },
  {
    name: 'acceptance command differs from its retained lookup',
    message: 'runtime acceptance lookup identity mismatch',
    corrupt(table) {
      const [key, accepted] = readOnlyEntry(table.acceptances);
      table.acceptances.set(key, {
        ...accepted,
        commandId: 'other-command',
        receipt: { ...accepted.receipt, commandId: 'other-command' },
      });
    },
  },
  ...(['organizationId', 'projectId', 'personId'] as const).map((field) => ({
    name: `acceptance ${field} differs from its retained lookup`,
    message: 'runtime acceptance lookup identity mismatch',
    corrupt(table: MemoryRuntimeTable) {
      const [key, accepted] = readOnlyEntry(table.acceptances);
      const scope = { ...accepted.scope, [field]: 'other' };
      table.acceptances.set(key, { ...accepted, scope, receipt: { ...accepted.receipt, scope } });
    },
  })),
  {
    name: 'acceptance receipt names another installation',
    message: 'runtime acceptance ledger mismatch',
    corrupt(table) {
      const [key, accepted] = readOnlyEntry(table.acceptances);
      table.acceptances.set(key, {
        ...accepted,
        receipt: { ...accepted.receipt, ledgerId: 'different-ledger' },
      });
    },
  },
];

for (const corruption of corruptions) {
  it(`rejects count-preserving memory corruption: ${corruption.name}`, async () => {
    const table = memoryRuntimeTable();
    const store = inMemoryRuntimeCommands(table);
    await store.compareAuthority(RUNTIME_SCOPE, null, 'owner');
    await store.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM);
    await store.insertAcceptance(runtimeAcceptanceFixture(table.ledger.ledgerId));
    const before = await store.inspectLedger();
    corruption.corrupt(table);
    expect(table.ledger).toEqual(before);
    expect([table.authorities.size, table.bindings.size, table.acceptances.size]).toEqual([
      1, 1, 1,
    ]);
    await assertRuntimeRejection(store.inspectLedger(), corruption.message);
    await assertRuntimeRejection(store.readAuthority(RUNTIME_SCOPE), corruption.message);
    await assertRuntimeRejection(store.readBinding(RUNTIME_SCOPE, 'claim'), corruption.message);
    await assertRuntimeRejection(
      store.readAcceptance(RUNTIME_SCOPE, 'command'),
      corruption.message,
    );
    await assertRuntimeRejection(store.assertAbsentHistory(), corruption.message);
    expect(table.ledger).toEqual(before);
  });
}

it('rejects count-preserving memory duplication of a scoped store-attempt binding', async () => {
  const table = memoryRuntimeTable();
  const store = inMemoryRuntimeCommands(table);
  await store.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM);
  const second = {
    ...RUNTIME_CLAIM,
    claimId: 'second-claim',
    execution: { ...RUNTIME_CLAIM.execution, attemptId: 'second-attempt' },
  };
  await store.insertBinding(RUNTIME_SCOPE, second);
  const before = await store.inspectLedger();
  for (const [key, bound] of table.bindings) {
    if (bound.claimId === 'second-claim')
      table.bindings.set(key, {
        ...bound,
        execution: { ...bound.execution, attemptId: 'attempt' },
      });
  }
  expect(table.bindings.size).toBe(2);
  expect(table.ledger).toEqual(before);
  await assertRuntimeRejection(store.inspectLedger(), 'runtime attempt binding uniqueness');
  await assertRuntimeRejection(
    store.readAttemptBinding(RUNTIME_SCOPE, 'store', 'attempt'),
    'runtime attempt binding uniqueness',
  );
  await assertRuntimeRejection(store.assertAbsentHistory(), 'runtime attempt binding uniqueness');
});
