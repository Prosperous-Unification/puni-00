import { deepStrictEqual } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import type {
  RuntimeAuthorityRequest,
  RuntimeClaimRequest,
  RuntimeReceipt1,
} from '../runtime-command-values';
import { canonicalRuntimeRequest, parseCanonicalRuntimeRequest } from '../runtime-request';
import { clientFromShapes } from './client';
import { fetchTransport } from './client-fetch';
import { runtimeCommandShapes } from './runtime-command-shapes';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const bytes = readFileSync(
  new URL(
    '../../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-runtime-acceptance1.txt',
    import.meta.url,
  ),
  'utf8',
);
if (hash(bytes) !== 'de64834e3ef5e6e09b658c60663a4a9bc5f49d317256206a2e4ff8729481ff44')
  throw new Error('published runtime1 capture changed');
// Exact hash pins the genuine outgoing fixture; real response validators run for every case.
const capture = JSON.parse(bytes) as {
  authorityRequest: RuntimeAuthorityRequest & { personId: string };
  claimRequest: RuntimeClaimRequest & { personId: string };
  writeRequest: Parameters<
    ReturnType<typeof createRuntimeClient>['applyRuntimeCommands']
  >[0]['body'];
  tables: { runtime_command_receipt: { command_id: string; accepted: string }[] };
  state: Record<string, unknown> & { facts: Record<string, unknown> };
};
const headers = { authorization: 'Bearer fixture' };
function createRuntimeClient(receipt: unknown) {
  return clientFromShapes(
    runtimeCommandShapes,
    fetchTransport('http://runtime.test', () => Promise.resolve(Response.json(receipt))),
  );
}
for (const row of capture.tables.runtime_command_receipt) {
  const retained = JSON.parse(row.accepted) as {
    canonicalRequest: string;
    receipt: RuntimeReceipt1;
  };
  const semantic = parseCanonicalRuntimeRequest(retained.canonicalRequest);
  const canonical = canonicalRuntimeRequest(semantic.scope, semantic.operation);
  const current = {
    ...retained.receipt,
    schemaVersion: 2,
    scope: semantic.scope,
    requestDigest: hash(canonical),
  };
  for (const [format, receipt] of [
    [1, retained.receipt],
    [2, current],
  ] as const) {
    test(
      'HTTP lookup preserves runtime' + String(format) + ' ' + row.command_id + ' receipt fields',
      async () => {
        const reply = await createRuntimeClient(receipt).lookupRuntimeReceipt({
          params: { id: semantic.scope.workPackageId, commandId: row.command_id },
          query: { personId: semantic.scope.personId, expectedLedgerId: retained.receipt.ledgerId },
          headers,
        });
        expect(reply.kind).toBe('success');
        if (reply.kind !== 'success') throw new Error('valid versioned receipt refused');
        deepStrictEqual(reply.body, receipt);
      },
    );
    test(
      'HTTP owner response accepts runtime' +
        String(format) +
        ' ' +
        row.command_id +
        ' receipt without changing request body1',
      async () => {
        const caller = createRuntimeClient(receipt);
        const params = { id: semantic.scope.workPackageId };
        const reply =
          row.command_id === 'grant'
            ? await caller.acquireRuntimeAuthority({
                params,
                body: capture.authorityRequest,
                headers,
              })
            : row.command_id === 'claim'
              ? await caller.applyRuntimeCommands({ params, body: capture.claimRequest, headers })
              : await caller.applyRuntimeCommands({ params, body: capture.writeRequest, headers });
        expect(reply.kind).toBe('success');
        if (reply.kind !== 'success') throw new Error('valid versioned owner receipt refused');
        deepStrictEqual(reply.body, receipt);
      },
    );
  }
  test(
    'HTTP refuses runtime2 ' +
      row.command_id +
      ' response relabeled around historical owner fields',
    async () => {
      const reply = await createRuntimeClient({
        ...retained.receipt,
        schemaVersion: 2,
      }).lookupRuntimeReceipt({
        params: { id: semantic.scope.workPackageId, commandId: row.command_id },
        query: { personId: semantic.scope.personId, expectedLedgerId: retained.receipt.ledgerId },
        headers,
      });
      expect(reply.kind).toBe('failure');
    },
  );
  test(
    'HTTP refuses runtime1 ' + row.command_id + ' response relabeled around current owner fields',
    async () => {
      const reply = await createRuntimeClient({
        ...current,
        schemaVersion: 1,
      }).lookupRuntimeReceipt({
        params: { id: semantic.scope.workPackageId, commandId: row.command_id },
        query: { personId: semantic.scope.personId, expectedLedgerId: retained.receipt.ledgerId },
        headers,
      });
      expect(reply.kind).toBe('failure');
    },
  );
}
const first = capture.tables.runtime_command_receipt.at(0);
if (first === undefined) throw new Error('published runtime receipt absent');
const retained = JSON.parse(first.accepted) as { canonicalRequest: string };
const semantic = parseCanonicalRuntimeRequest(retained.canonicalRequest);
const { projectRevision, ...facts } = capture.state.facts;
const state = {
  ...capture.state,
  schemaVersion: 2,
  scope: semantic.scope,
  facts: { ...facts, workPackageRevision: projectRevision },
};
test('HTTP current state2 names current owner facts and preserves rb1', async () => {
  const reply = await createRuntimeClient(state).readRuntimeState({
    params: { id: semantic.scope.workPackageId },
    query: { personId: semantic.scope.personId },
    headers,
  });
  expect(reply.kind).toBe('success');
  if (reply.kind !== 'success') throw new Error('current runtime state refused');
  deepStrictEqual(reply.body, state);
});
test('HTTP refuses current state owner fields under outgoing version1', async () => {
  const reply = await createRuntimeClient({ ...state, schemaVersion: 1 }).readRuntimeState({
    params: { id: semantic.scope.workPackageId },
    query: { personId: semantic.scope.personId },
    headers,
  });
  expect(reply.kind).toBe('failure');
});
