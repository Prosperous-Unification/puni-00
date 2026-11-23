import { deepStrictEqual, rejects } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalRuntimeRequest } from '@wbs/contracts';
import { parseStoredRuntimeAcceptance2 } from '@wbs/core/ports/runtime-command-records';
import { expect, test } from 'bun:test';

import { openSqliteSource } from './source';
import { migrateEmptyCatalogueFixture } from './testing/catalogue-database';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';

async function openRuntimeFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'runtime-format-'));
  const dbPath = join(directory, 'store.db');
  migrateEmptyCatalogueFixture(
    { path: dbPath, directory, reportedAt: 1 },
    { hasUnknownOwner: false },
  );
  const source = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath,
  });
  const store = source.stores.runtimeCommands;
  const ledger = await store.inspectLedger();
  const scope = { organizationId: 'org', workPackageId: 'package', personId: 'person' };
  const canonicalRequest = canonicalRuntimeRequest(scope, {
    schemaVersion: 1,
    kind: 'authority',
    commandId: 'new',
    expectedLedgerId: ledger.ledgerId,
    ownerId: 'owner',
    expectedGeneration: null,
  });
  const requestDigest = createHash('sha256').update(canonicalRequest).digest('hex');
  // Raw persistence fixture; this does not assert application grant/authority admission.
  const current = parseStoredRuntimeAcceptance2({
    schemaVersion: 2,
    scope,
    commandId: 'new',
    canonicalRequest,
    requestDigest,
    receipt: {
      schemaVersion: 2,
      scope,
      commandId: 'new',
      requestDigest,
      ledgerId: ledger.ledgerId,
      actorId: 'actor',
      acceptance: { kind: 'authority', authority: { ownerId: 'owner', generation: 1 } },
    },
  });
  return {
    source,
    store,
    scope,
    current,
    async close() {
      await source.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
test('SQLite current2 insertion persists exact current record and marker1', async () => {
  const opened = await openRuntimeFixture();
  try {
    await opened.store.insertAcceptance(opened.current);
    deepStrictEqual(await opened.store.readAcceptance(opened.scope, 'new'), opened.current);
    expect(await opened.store.inspectLedger()).toMatchObject({ schemaVersion: 1, receiptCount: 1 });
  } finally {
    await opened.close();
  }
});
test('SQLite current-only insertion refuses old tag around current fields before row and count effects', async () => {
  const opened = await openRuntimeFixture();
  try {
    const ledgerBefore = await opened.store.inspectLedger();
    const invalid = { ...opened.current, schemaVersion: 1 };
    // Deliberately cross the current-only type boundary with a malformed producer value.
    await rejects(opened.store.insertAcceptance(invalid as never), /schemaVersion must be 2/);
    deepStrictEqual(await opened.store.inspectLedger(), ledgerBefore);
    expect(await opened.store.readAcceptance(opened.scope, 'new')).toBeNull();
  } finally {
    await opened.close();
  }
});
