import { deepStrictEqual } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { migrateRenamedRuntimeCatalogueFixture } from '../testing/organization-catalogue-fixture';
import { OrganizationHarness } from '../testing/organization-harness';

const fixture = new URL(
  '../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-runtime-database1.sqlite.gz',
  import.meta.url,
);
const compressed = readFileSync(fixture);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
if (hash(compressed) !== '8f8d37a855cca7681b95617233e2f8294dea95505c4612626c0ad741d15c9071')
  throw new Error('published runtime database fixture changed');
const snapshot = gunzipSync(compressed);
if (hash(snapshot) !== 'cb070a4d59e1b8dd464279f97f09e4ca804c21d1b77ff4bdcea1861ddb0e1a77')
  throw new Error('published runtime database bytes changed');
// The fixture is an actual original SQLite snapshot; this cast only describes its captured test API values.
const capture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-runtime-database1.txt',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  scope: { organizationId: string; projectId: string; personId: string };
  authorityRequest: { expectedLedgerId: string; ownerId: string } & Record<string, unknown>;
  claimRequest: Record<string, unknown>;
  writeRequest: Record<string, unknown>;
  receipts: { authority: unknown; claim: unknown; write: unknown };
  state: { basis: string; facts: { projectRevision: number } };
  tables: { runtime_command_receipt: { command_id: string; accepted: string }[] };
};
const workPackageId = capture.scope.projectId;
let opened: OrganizationHarness | undefined;
let renameLedgerCount: number | undefined;
function requireHarness() {
  if (opened === undefined) throw new Error('runtime migration harness not acquired');
  return opened;
}
beforeEach(async () => {
  opened = undefined;
  renameLedgerCount = undefined;
  opened = OrganizationHarness.openComposedWith({
    migrate: (path) => {
      writeFileSync(path, snapshot, { flag: 'wx' });
      migrateRenamedRuntimeCatalogueFixture(path, (database) => {
        renameLedgerCount = database
          .query<{ total: number }, []>('SELECT COUNT(*) AS total FROM __drizzle_migrations')
          .get()?.total;
      });
    },
  });
  await opened.register('current-reader');
  opened.member('org-a', 'current-reader', 'admin', ['org-admin']);
  opened.bind('current-reader', 'org-a');
});
afterEach(async () => {
  if (opened !== undefined) {
    await opened.closeComposed();
    opened = undefined;
  }
});
function readRetainedRows() {
  const h = requireHarness();
  return Object.fromEntries(
    [
      'runtime_ledger',
      'runtime_authority',
      'runtime_claim_binding',
      'runtime_command_receipt',
      'claim',
      'work_item',
      'command_journal',
      'plan_event',
    ].map((table) => [table, h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()]),
  );
}
test('actual rename preserves original runtime1 accepted strings and installation identity', () => {
  const h = requireHarness();
  const rows = h.sqlite
    .query<{ command_id: string; accepted: string }, []>(
      'SELECT command_id,accepted FROM runtime_command_receipt ORDER BY command_id',
    )
    .all();
  deepStrictEqual(
    rows,
    [...capture.tables.runtime_command_receipt]
      .map(({ command_id, accepted }) => ({ command_id, accepted }))
      .sort((left, right) => left.command_id.localeCompare(right.command_id)),
  );
  const ledger = h.sqlite
    .query<{ ledger_id: string; schema_version: number; receipt_count: number }, []>(
      'SELECT ledger_id,schema_version,receipt_count FROM runtime_ledger',
    )
    .get();
  expect(ledger).toMatchObject({
    ledger_id: capture.authorityRequest.expectedLedgerId,
    schema_version: 1,
    receipt_count: 3,
  });
  expect(renameLedgerCount).toBe(111);
});
for (const [name, request, receipt, endpoint] of [
  ['grant', capture.authorityRequest, capture.receipts.authority, 'runtime-authority'],
  ['claim', capture.claimRequest, capture.receipts.claim, 'runtime-commands'],
  ['write', capture.writeRequest, capture.receipts.write, 'runtime-commands'],
] as const) {
  test(
    'mounted migrated runtime1 ' +
      name +
      ' replay and lookup return original receipt without effects',
    async () => {
      const h = requireHarness();
      const before = readRetainedRows();
      const reply = await h.call(
        'current-reader',
        'POST',
        '/api/work-packages/' + workPackageId + '/' + endpoint,
        request,
      );
      expect(reply.status).toBe(200);
      deepStrictEqual(reply.body, receipt);
      const lookup = await h.call(
        'current-reader',
        'GET',
        '/api/work-packages/' +
          workPackageId +
          '/runtime-commands/' +
          name +
          '?personId=person&expectedLedgerId=' +
          capture.authorityRequest.expectedLedgerId,
      );
      expect(lookup.status).toBe(200);
      deepStrictEqual(lookup.body, receipt);
      deepStrictEqual(readRetainedRows(), before);
    },
  );
}
test('mounted migrated runtime1 replay requires current caller package write before returning history', async () => {
  const h = requireHarness();
  h.sqlite
    .query("DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=?")
    .run(h.userId('current-reader'));
  h.grantPermissions('org-a', 'current-reader', ['package.read']);
  const before = readRetainedRows();
  const reply = await h.call(
    'current-reader',
    'POST',
    '/api/work-packages/' + workPackageId + '/runtime-authority',
    capture.authorityRequest,
  );
  expect(reply.status).toBe(403);
  expect(reply.body).toMatchObject({ error: 'forbidden', permission: 'package.write' });
  deepStrictEqual(readRetainedRows(), before);
});
test('mounted migrated runtime1 changed command conflicts without rewriting original identity', async () => {
  const h = requireHarness();
  const before = readRetainedRows();
  const reply = await h.call(
    'current-reader',
    'POST',
    '/api/work-packages/' + workPackageId + '/runtime-authority',
    { ...capture.authorityRequest, ownerId: 'different' },
  );
  expect(reply.status).toBe(409);
  expect(reply.body).toMatchObject({ error: 'runtime_command_conflict' });
  deepStrictEqual(readRetainedRows(), before);
});

test('mounted migrated current state2 preserves the original positional rb1 basis', async () => {
  const h = requireHarness();
  const before = readRetainedRows();
  const reply = await h.call(
    'current-reader',
    'GET',
    '/api/work-packages/' +
      workPackageId +
      '/runtime-state?personId=person&expectedLedgerId=' +
      capture.authorityRequest.expectedLedgerId,
  );
  expect(reply.status).toBe(200);
  expect(reply.body).toMatchObject({
    schemaVersion: 2,
    basis: capture.state.basis,
    facts: { workPackageRevision: capture.state.facts.projectRevision },
  });
  deepStrictEqual(readRetainedRows(), before);
});

for (const [name, request] of [
  ['claim', capture.claimRequest],
  ['write', capture.writeRequest],
] as const) {
  test(
    'mounted migrated runtime1 changed ' + name + ' conflicts without rewriting original identity',
    async () => {
      const h = requireHarness();
      const before = readRetainedRows();
      const reply = await h.call(
        'current-reader',
        'POST',
        '/api/work-packages/' + workPackageId + '/runtime-commands',
        {
          ...request,
          expectedBasis: 'rb1:' + '0'.repeat(64),
        },
      );
      expect(reply.status).toBe(409);
      expect(reply.body).toMatchObject({ error: 'runtime_command_conflict' });
      deepStrictEqual(readRetainedRows(), before);
    },
  );
}
