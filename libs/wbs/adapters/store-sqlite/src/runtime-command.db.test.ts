import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  RUNTIME_CLAIM,
  RUNTIME_SCOPE,
  runtimeAcceptanceFixture,
  runtimeCommandConformance,
  runtimeRecordConformance,
} from '@wbs/conformance/runtime-command-conformance';
import { describe, expect, it } from 'bun:test';

import { runMigrations } from './migrate';
import { openSqliteSource } from './source';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';

const migrations = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
describe('SQLite runtime command persistence', () => {
  const open = () => {
    const directory = mkdtempSync(join(tmpdir(), 'runtime-command-'));
    const dbPath = join(directory, 'plan.db');
    runMigrations(dbPath, migrations);
    const source = openSqliteSource({
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      dbPath,
    });
    return Promise.resolve({
      source,
      async close() {
        await source.close();
        rmSync(directory, { recursive: true, force: true });
      },
    });
  };
  runtimeCommandConformance(open);
  runtimeRecordConformance(open);
});

it('retains an exact claim acceptance and its attempt binding after closing and reopening SQLite', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'runtime-claim-reopen-'));
  const dbPath = join(directory, 'plan.db');
  runMigrations(dbPath, migrations);
  const source = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath,
  });
  const ledger = await source.stores.runtimeCommands.inspectLedger();
  const stored = runtimeAcceptanceFixture(ledger.ledgerId, 'claim');
  const acceptance = {
    ...stored,
    receipt: {
      ...stored.receipt,
      acceptance: {
        kind: 'claim' as const,
        authority: { ownerId: 'owner', generation: 1 },
        claim: RUNTIME_CLAIM,
        basisAfter: `rb1:${'a'.repeat(64)}`,
      },
    },
  };
  try {
    await source.uow.run(async (scope) => {
      await scope.stores.runtimeCommands.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM);
      await scope.stores.runtimeCommands.insertAcceptance(acceptance);
      return { commit: true, value: undefined };
    });
  } finally {
    await source.close();
  }
  const reopened = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath,
  });
  try {
    expect(await reopened.stores.runtimeCommands.readAcceptance(RUNTIME_SCOPE, 'claim')).toEqual(
      acceptance,
    );
    expect(
      await reopened.stores.runtimeCommands.readAttemptBinding(RUNTIME_SCOPE, 'store', 'attempt'),
    ).toEqual(RUNTIME_CLAIM);
    expect(await reopened.stores.runtimeCommands.inspectLedger()).toEqual({
      ...ledger,
      bindingCount: 1,
      receiptCount: 1,
    });
  } finally {
    await reopened.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('retains ordered write acceptance and exact bindings after reopening without changing ledger counts on reads', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'runtime-write-reopen-'));
  const dbPath = join(directory, 'plan.db');
  runMigrations(dbPath, migrations);
  const source = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath,
  });
  const ledger = await source.stores.runtimeCommands.inspectLedger();
  const stored = runtimeAcceptanceFixture(ledger.ledgerId, 'write');
  const acceptance = {
    ...stored,
    receipt: {
      ...stored.receipt,
      acceptance: {
        kind: 'write' as const,
        authority: { ownerId: 'owner', generation: 1 },
        claim: RUNTIME_CLAIM,
        basisAfter: 'rb1:' + 'a'.repeat(64),
        applied: [
          { index: 0, kind: 'setMeasure' as const },
          { index: 1, kind: 'releaseWorkItem' as const },
        ],
      },
    },
  };
  try {
    await source.uow.run(async (scope) => {
      await scope.stores.runtimeCommands.insertBinding(RUNTIME_SCOPE, RUNTIME_CLAIM);
      await scope.stores.runtimeCommands.insertAcceptance(acceptance);
      return { commit: true, value: undefined };
    });
  } finally {
    await source.close();
  }
  const reopened = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath,
  });
  try {
    expect(await reopened.stores.runtimeCommands.readAcceptance(RUNTIME_SCOPE, 'write')).toEqual(
      acceptance,
    );
    expect(
      await reopened.stores.runtimeCommands.readBinding(RUNTIME_SCOPE, RUNTIME_CLAIM.claimId),
    ).toEqual(RUNTIME_CLAIM);
    expect(await reopened.stores.runtimeCommands.inspectLedger()).toEqual({
      ...ledger,
      bindingCount: 1,
      receiptCount: 1,
    });
  } finally {
    await reopened.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
