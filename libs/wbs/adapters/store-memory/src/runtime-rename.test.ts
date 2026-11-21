import { deepStrictEqual, rejects } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { canonicalRuntimeRequest, parseCanonicalRuntimeRequest } from '@wbs/contracts';
import {
  parseStoredRuntimeAcceptance,
  parseStoredRuntimeAcceptance2,
} from '@wbs/core/ports/runtime-command-records';
import { expect, test } from 'bun:test';

import { inMemoryRuntimeCommands, memoryRuntimeTable } from './runtime-command';

const bytes = readFileSync(
  new URL(
    '../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-runtime-acceptance1.txt',
    import.meta.url,
  ),
  'utf8',
);
if (
  createHash('sha256').update(bytes).digest('hex') !==
  'de64834e3ef5e6e09b658c60663a4a9bc5f49d317256206a2e4ff8729481ff44'
)
  throw new Error('published runtime1 capture changed');
// Exact hash and source manifest pin the test fixture; actual record decoders validate every row below.
const capture = JSON.parse(bytes) as {
  tables: { runtime_command_receipt: { command_id: string; accepted: string }[] };
};
function prepareRuntimeFixture(raw: string) {
  const historical = parseStoredRuntimeAcceptance(JSON.parse(raw));
  if (historical.schemaVersion !== 1) throw new Error('fixture must retain published1');
  const semantic = parseCanonicalRuntimeRequest(historical.canonicalRequest);
  const canonicalRequest = canonicalRuntimeRequest(semantic.scope, semantic.operation);
  const requestDigest = createHash('sha256').update(canonicalRequest).digest('hex');
  const current = parseStoredRuntimeAcceptance2({
    ...historical,
    schemaVersion: 2,
    scope: semantic.scope,
    canonicalRequest,
    requestDigest,
    receipt: { ...historical.receipt, schemaVersion: 2, scope: semantic.scope, requestDigest },
  });
  const table = memoryRuntimeTable();
  table.ledger = { ...table.ledger, ledgerId: historical.receipt.ledgerId };
  return {
    historical,
    current,
    scope: semantic.scope,
    table,
    store: inMemoryRuntimeCommands(table),
  };
}
for (const row of capture.tables.runtime_command_receipt) {
  test(
    'memory current-only insertion refuses old tag around current ' +
      row.command_id +
      ' fields before effects',
    async () => {
      const { current, table, store } = prepareRuntimeFixture(row.accepted);
      const before = structuredClone(table);
      // The actual current field shape keeps a removed insertion guard observable, without an unrelated old-scope failure.
      await rejects(
        store.insertAcceptance({ ...current, schemaVersion: 1 } as never),
        /schemaVersion.*2/,
      );
      deepStrictEqual(table, before);
    },
  );

  test(
    'memory reads original runtime1 ' + row.command_id + ' under the current scope key',
    async () => {
      const { historical, current, scope, table, store } = prepareRuntimeFixture(row.accepted);
      await store.insertAcceptance(current);
      deepStrictEqual(await store.readAcceptance(scope, row.command_id), current);
      const entries = [...table.acceptances];
      expect(entries).toHaveLength(1);
      const entry = entries.at(0);
      if (entry === undefined) throw new Error('actual inserted scope key absent');
      // Reuse the production-created key; no test implementation of its tuple encoder.
      table.acceptances.set(entry[0], historical);
      const before = JSON.stringify([...table.acceptances]);
      deepStrictEqual(await store.readAcceptance(scope, row.command_id), historical);
      expect(JSON.stringify([...table.acceptances])).toBe(before);
      expect((await store.inspectLedger()).receiptCount).toBe(1);
    },
  );
  test(
    'memory refuses inserting historical runtime1 ' + row.command_id + ' with no ledger effects',
    async () => {
      const { historical, table, store } = prepareRuntimeFixture(row.accepted);
      const before = structuredClone(table);
      // A hostile runtime value crosses the current-only typed insertion boundary deliberately.
      await rejects(store.insertAcceptance(historical as never), /schemaVersion.*2/);
      deepStrictEqual(table, before);
    },
  );
}
