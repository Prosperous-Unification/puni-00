import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseRuntimeClaim } from '@wbs/core/ports/runtime-command-records';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { messagesOf } from '../constraint';
import { type Drizzle, openExistingConnection, openReadOnlyConnection, SQLiteError } from '../db';
import { runMigrations } from '../migrate';
import { readMigrationFolders, rollbackTo } from '../migrate-down';
import { isSqliteCleanupUnknown } from '../sqlite-cleanup';
import { copyRecoveryPrefix } from './recovery-state';

const predecessor = '20261115130000_add_step_catalogue',
  addition = '20261118180000_add_resource_use_locations';
const fixtureDirectory = join(import.meta.dir, 'fixtures', 'resource-use-117');
const FROZEN_PINS = {
  'merged-bound': {
    database: '328193592561074712e3f16db0b9a4d947698517c8a789c125acd6c93a51314a',
    logicalState: '0df92993f422f3d3cd22079962d18b1ffc7da11bc3f941321754d357c3c619ba',
  },
  unassociated: {
    database: 'c00ec1bae2ae70d7968dd896b8cda03d13691d034bcf3f3ee522e5ef386124df',
    logicalState: '465db09ee2da1ada8892416c642018204916bd95690a62b6f5d2a5fe6c33fb3a',
  },
  'bound-moved': {
    database: 'c4bc3418d71a8c46327e2457154773bae32a8a2012a163da916eb23846a2df81',
    logicalState: '9d9cc52aa76785ac17c26e0921f59193df98584ab8cda0ea97bd395b9551f15b',
  },
  'ambiguous-attempt': {
    database: '2e2dd7ddbce1defdfe8a0a5cdce9996a7805c6f1f55ea6df4c6fd9997931b68d',
    logicalState: 'acab0376426e513b423cfd0d89af0ab0b1b1479b1b67509f9832390707d30b3b',
  },
} as const;

type FixtureKind = keyof typeof FROZEN_PINS;
interface Identity {
  readonly name: string;
  readonly hash: string;
}
interface TableState {
  readonly name: string;
  readonly rows: readonly Record<string, unknown>[];
}
interface StoreState {
  readonly schema: readonly Record<string, unknown>[];
  readonly tables: readonly TableState[];
  readonly ledger: readonly Identity[];
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('frozen117 fixture metadata is not an object');
  return Object.fromEntries(Object.keys(value).map((key) => [key, Reflect.get(value, key)]));
}
function readText(value: unknown): string {
  if (typeof value !== 'string' || value === '')
    throw new Error('frozen117 fixture metadata text is absent');
  return value;
}
function readRows(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error('frozen117 fixture metadata rows are absent');
  return value;
}
function digest(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function loadFrozen(kind: FixtureKind) {
  const artifactDirectory =
    kind === 'merged-bound'
      ? join(import.meta.dir, 'fixtures', 'resource-use-117-merged')
      : fixtureDirectory;
  const metadata = readRecord(
    JSON.parse(readFileSync(join(artifactDirectory, 'manifest.json'), 'utf8')),
  );
  expect(metadata['format']).toBe('puni-resource-use-117-fixtures');
  expect(metadata['version']).toBe(1);
  const matches = readRows(metadata['produced'])
    .map(readRecord)
    .filter((record) => record['kind'] === kind);
  expect(matches).toHaveLength(1);
  const selected = matches.at(0);
  if (selected === undefined) throw new Error('frozen117 fixture is absent');
  const database = readRecord(selected['database']),
    logicalState = readRecord(selected['logicalState']);
  expect(database['file']).toBe(kind + '.db');
  expect(logicalState['file']).toBe(kind + '.state.json');
  expect(database['sha256']).toBe(FROZEN_PINS[kind].database);
  expect(logicalState['sha256']).toBe(FROZEN_PINS[kind].logicalState);
  const databasePath = join(artifactDirectory, kind + '.db'),
    stateBytes = readFileSync(join(artifactDirectory, kind + '.state.json'));
  expect(digest(readFileSync(databasePath))).toBe(FROZEN_PINS[kind].database);
  expect(digest(stateBytes)).toBe(FROZEN_PINS[kind].logicalState);
  const expected = readRecord(selected['expected']),
    use = readRecord(expected['use']);
  const ledger = readRows(selected['ledger']).map((value) => {
    const row = readRecord(value);
    return { name: readText(row['name']), hash: readText(row['hash']) };
  });
  expect(ledger).toHaveLength(117);
  expect(ledger.at(-1)?.name).toBe(predecessor);
  const logical: unknown = JSON.parse(stateBytes.toString('utf8'));
  return {
    databasePath,
    logical,
    ledger,
    useId: readText(use['id']),
    workPackageId: readText(use['workPackageId']),
  };
}

function captureStore(db: Drizzle): StoreState {
  const schema = db.all<Record<string, unknown>>(
    sql`SELECT type,name,tbl_name,rootpage,sql FROM sqlite_master ORDER BY type COLLATE BINARY,name COLLATE BINARY`,
  );
  const tables = db
    .all<{ name: unknown }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name COLLATE BINARY`,
    )
    .map(({ name }) => {
      const tableName = readText(name),
        rows = db.all<Record<string, unknown>>(
          sql.raw('SELECT * FROM "' + tableName.replaceAll('"', '""') + '"'),
        );
      rows.sort((left, right) =>
        Buffer.compare(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right))),
      );
      return { name: tableName, rows };
    });
  const ledger = db
    .all<{ name: unknown; hash: unknown }>(
      sql`SELECT name,hash FROM __drizzle_migrations ORDER BY name COLLATE BINARY`,
    )
    .map((row) => ({ name: readText(row.name), hash: readText(row.hash) }));
  return { schema, tables, ledger };
}
function logicalState(state: StoreState) {
  return {
    ...state,
    schema: state.schema.map((row) =>
      Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'rootpage')),
    ),
  };
}
function table(state: StoreState, name: string): TableState {
  const found = state.tables.find((row) => row.name === name);
  if (found === undefined) throw new Error('migration owner table is absent: ' + name);
  return found;
}

async function withinFrozen(
  kind: FixtureKind,
  act: (fixture: {
    path: string;
    frozen: ReturnType<typeof loadFrozen>;
    read: <Value>(read: (db: Drizzle) => Value) => Value;
    mutate: <Value>(write: (db: Drizzle) => Value) => Value;
    apply: () => void;
    down: () => readonly string[];
  }) => Promise<void>,
): Promise<void> {
  const frozen = loadFrozen(kind),
    directory = mkdtempSync(join(tmpdir(), 'wbs-resource-location-migration-')),
    path = join(directory, 'source.db'),
    migrations = join(directory, 'migrations');
  const custody = { unknown: false };
  const hasUnknownOwner = () => custody.unknown;
  let primary: { cause: unknown } | undefined;
  function observe<Value>(
    open: () => ReturnType<typeof openReadOnlyConnection>,
    use: (db: Drizzle) => Value,
  ): Value {
    let connection: ReturnType<typeof openReadOnlyConnection>;
    try {
      connection = open();
    } catch (cause: unknown) {
      custody.unknown = true;
      throw cause;
    }
    let observed: { ok: true; value: Value } | { ok: false; cause: unknown };
    try {
      observed = { ok: true, value: use(connection.db) };
    } catch (cause: unknown) {
      observed = { ok: false, cause };
    }
    try {
      connection.close();
    } catch (cleanup: unknown) {
      custody.unknown = true;
      if (!observed.ok)
        throw new AggregateError(
          [observed.cause, cleanup],
          'migration owner read and close failed; retained ' + directory,
          { cause: cleanup },
        );
      throw cleanup;
    }
    if (!observed.ok) throw observed.cause;
    return observed.value;
  }
  const read = <Value>(use: (db: Drizzle) => Value) =>
    observe(() => openReadOnlyConnection(path), use);
  const mutate = <Value>(use: (db: Drizzle) => Value) =>
    observe(() => openExistingConnection(path), use);
  function apply() {
    try {
      runMigrations(path, migrations);
    } catch (cause: unknown) {
      if (isSqliteCleanupUnknown(cause)) custody.unknown = true;
      throw cause;
    }
  }
  /** The known original rollback Error can survive only after rollbackTo's finally-close returned; a close throw replaces it. */
  function down() {
    try {
      return rollbackTo(path, migrations, predecessor);
    } catch (cause: unknown) {
      const isKnownRefusal =
        cause instanceof Error &&
        cause.constructor === Error &&
        cause.message.startsWith('rolling back ' + addition + ' failed: ') &&
        cause.cause instanceof SQLiteError &&
        cause.cause.code === 'SQLITE_CONSTRAINT_TRIGGER' &&
        cause.cause.message.includes(
          'resource use ' + frozen.useId + ' has moved lifecycle addresses',
        );
      if (!isKnownRefusal) custody.unknown = true;
      throw cause;
    }
  }
  try {
    copyFileSync(frozen.databasePath, path);
    chmodSync(path, 0o600);
    expect(digest(readFileSync(path))).toBe(FROZEN_PINS[kind].database);
    const before = read(captureStore);
    expect(logicalState(before) as unknown).toEqual(frozen.logical);
    expect(before.ledger).toEqual(frozen.ledger);
    read((db) => {
      expect(db.all(sql`PRAGMA integrity_check`)).toEqual([{ integrity_check: 'ok' }]);
      expect(db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    });
    expect(copyRecoveryPrefix(directory, addition)).toBe(migrations);
    const folders = readMigrationFolders(migrations);
    expect(folders.slice(0, 117).map(({ name, hash }) => ({ name, hash })) as unknown).toEqual(
      before.ledger,
    );
    const pending = folders.filter(
      (folder) => !before.ledger.some(({ name }) => name === folder.name),
    );
    // A missing118 folder is scaffolding, never backfill/refusal/rollback proof.
    expect(pending.map(({ name }) => name)).toEqual([addition]);
    expect(pending.at(0)?.downSql.length).toBeGreaterThan(0);
    await act({ path, frozen, read, mutate, apply, down });
  } catch (cause: unknown) {
    primary = { cause };
  }
  if (!hasUnknownOwner()) {
    try {
      rmSync(directory, { recursive: true });
    } catch (cleanup: unknown) {
      if (primary !== undefined)
        throw new AggregateError(
          [primary.cause, cleanup],
          'migration owner and directory cleanup failed',
          { cause: cleanup },
        );
      throw cleanup;
    }
  }
  if (primary !== undefined) throw primary.cause;
  if (hasUnknownOwner())
    throw new Error('resource migration owner has unknown native custody; retained ' + directory);
}

function assertAdditive(before: StoreState, after: StoreState) {
  expect(after.ledger.slice(0, 117) as unknown).toEqual(before.ledger);
  expect(after.ledger).toHaveLength(118);
  expect(after.ledger.at(-1)?.name).toBe(addition);
  const oldNames = new Set(before.schema.map((row) => row['name']));
  expect(after.schema.filter((row) => oldNames.has(row['name'])) as unknown).toEqual(before.schema);
  for (const stored of before.tables)
    if (stored.name !== '__drizzle_migrations') expect(table(after, stored.name)).toEqual(stored);
}

test('resource location118 backfills the actual stable moved claim without rewriting any retained state', async () => {
  await withinFrozen('bound-moved', async (fixture) => {
    const before = fixture.read(captureStore);
    fixture.read((db) => {
      expect(db.all(sql`SELECT id,work_item_id,step_id,run_id FROM claim`)).toEqual([
        {
          id: 'location-point-claim',
          work_item_id: 'location-current-child',
          step_id: 'location-current-dev',
          run_id: 'location-current-run',
        },
      ]);
      expect(
        db.all(
          sql`SELECT json_extract(binding,'$.workItemId') AS original,json_extract(binding,'$.claimId') AS claim_id FROM runtime_claim_binding`,
        ),
      ).toEqual([{ original: 'location-current-parent', claim_id: 'location-point-claim' }]);
    });
    fixture.apply();
    const after = fixture.read(captureStore);
    assertAdditive(before, after);
    expect(table(after, 'resource_use_location').rows).toEqual([
      {
        use_id: fixture.frozen.useId,
        kind: 'claim',
        work_package_id: fixture.frozen.workPackageId,
        work_item_id: 'location-current-child',
      },
    ]);
    fixture.read((db) => {
      expect(db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    });

    return Promise.resolve();
  });
}, 30000);

test('resource location118 marks an actually unassociated report and public down restores complete117 state', async () => {
  await withinFrozen('unassociated', async (fixture) => {
    const before = fixture.read(captureStore);
    expect(table(before, 'claim').rows).toEqual([]);
    expect(table(before, 'step_node_attempt').rows).toEqual([]);
    fixture.apply();
    const after = fixture.read(captureStore);
    assertAdditive(before, after);
    expect(table(after, 'resource_use_location').rows).toEqual([
      {
        use_id: fixture.frozen.useId,
        kind: 'unassociated',
        work_package_id: fixture.frozen.workPackageId,
        work_item_id: null,
      },
    ]);
    expect(fixture.down()).toEqual([addition]);
    expect(fixture.read(captureStore)).toEqual(before);

    return Promise.resolve();
  });
}, 30000);

test('resource location118 refuses genuine ambiguous attempted history by use identity with full rollback', async () => {
  await withinFrozen('ambiguous-attempt', async (fixture) => {
    const before = fixture.read(captureStore);
    expect(table(before, 'runtime_claim_binding').rows).toEqual([]);
    fixture.read((db) => {
      expect(
        db.all(
          sql`SELECT work_item_id,attempt_number FROM step_node_attempt WHERE ended_at IS NULL ORDER BY work_item_id COLLATE BINARY`,
        ),
      ).toEqual([
        { work_item_id: 'location-current-child', attempt_number: 7 },
        { work_item_id: 'location-independent-child', attempt_number: 7 },
      ]);
    });
    let outcome: { ok: true } | { ok: false; cause: unknown };
    try {
      fixture.apply();
      outcome = { ok: true };
    } catch (cause: unknown) {
      outcome = { ok: false, cause };
    }
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('ambiguous118 migration unexpectedly applied');
    expect(
      messagesOf(outcome.cause).some(
        (message) =>
          message.includes(fixture.frozen.useId) &&
          message.includes('unprovable lifecycle continuity'),
      ),
    ).toBe(true);
    expect(fixture.read(captureStore)).toEqual(before);

    return Promise.resolve();
  });
}, 30000);

test('resource location118 down refuses a still-active moved association without dropping any state', async () => {
  await withinFrozen('bound-moved', async (fixture) => {
    fixture.apply();
    const before = fixture.read(captureStore);
    expect(table(before, 'resource_use_location').rows).toEqual([
      {
        use_id: fixture.frozen.useId,
        kind: 'claim',
        work_package_id: fixture.frozen.workPackageId,
        work_item_id: 'location-current-child',
      },
    ]);
    let outcome: { ok: true } | { ok: false; cause: unknown };
    try {
      fixture.down();
      outcome = { ok: true };
    } catch (cause: unknown) {
      outcome = { ok: false, cause };
    }
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('unsafe118 down unexpectedly applied');
    expect(
      messagesOf(outcome.cause).some(
        (message) =>
          message.includes(fixture.frozen.useId) && message.includes('moved lifecycle addresses'),
      ),
    ).toBe(true);
    expect(fixture.read(captureStore)).toEqual(before);

    return Promise.resolve();
  });
}, 30000);

test('resource location118 refuses malformed retained RuntimeClaim bytes instead of using them as continuity proof', async () => {
  await withinFrozen('bound-moved', async (fixture) => {
    const healthy = fixture.read(captureStore);
    const beforeBinding = fixture.read((db) =>
      db.all<{ binding: string }>(sql`SELECT binding FROM runtime_claim_binding`),
    );
    expect(beforeBinding).toHaveLength(1);
    const original = beforeBinding.at(0);
    if (original === undefined) throw new Error('real immutable binding is absent');
    expect(() => parseRuntimeClaim(JSON.parse(original.binding))).not.toThrow();
    fixture.mutate((db) => {
      const trigger = db
        .all<{ sql: unknown }>(
          sql`SELECT sql FROM sqlite_master WHERE type='trigger' AND name='runtime_claim_binding_no_update'`,
        )
        .at(0);
      if (trigger === undefined || typeof trigger.sql !== 'string')
        throw new Error('runtime binding immutability trigger is absent');
      const triggerSql = trigger.sql;
      db.transaction((tx) => {
        // Only this exact participating trigger is bypassed and restored in
        // one fixture transaction. FKs/CHECKs/all other history guards remain.
        tx.run(sql`DROP TRIGGER runtime_claim_binding_no_update`);
        tx.run(
          sql`UPDATE runtime_claim_binding SET binding=json_set(binding,'$.execution.sessionId',17)`,
        );
        tx.run(sql.raw(triggerSql));
      });
    });
    const corrupted = fixture.read(captureStore);
    expect(corrupted.schema).toEqual(healthy.schema);
    expect(corrupted.ledger).toEqual(healthy.ledger);
    const saved = fixture
      .read((db) => db.all<{ binding: string }>(sql`SELECT binding FROM runtime_claim_binding`))
      .at(0);
    if (saved === undefined) throw new Error('corrupted binding disappeared');
    const parsed = readRecord(JSON.parse(original.binding)),
      execution = readRecord(parsed['execution']);
    expect(JSON.parse(saved.binding) as unknown).toEqual({
      ...parsed,
      execution: { ...execution, sessionId: 17 },
    });
    expect(() => parseRuntimeClaim(JSON.parse(saved.binding))).toThrow();
    const withoutBinding = (stored: TableState) =>
      stored.rows.map((row) =>
        Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'binding')),
      );
    expect(withoutBinding(table(corrupted, 'runtime_claim_binding'))).toEqual(
      withoutBinding(table(healthy, 'runtime_claim_binding')),
    );
    for (const stored of healthy.tables)
      if (stored.name !== 'runtime_claim_binding')
        expect(table(corrupted, stored.name)).toEqual(stored);
    let outcome: { ok: true } | { ok: false; cause: unknown };
    try {
      fixture.apply();
      outcome = { ok: true };
    } catch (cause: unknown) {
      outcome = { ok: false, cause };
    }
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('malformed RuntimeClaim was accepted as migration proof');
    expect(
      messagesOf(outcome.cause).some(
        (message) =>
          message.includes(fixture.frozen.useId) &&
          message.includes('unprovable lifecycle continuity'),
      ),
    ).toBe(true);
    expect(fixture.read(captureStore)).toEqual(corrupted);

    return Promise.resolve();
  });
}, 30000);

const SESSION_BOUNDARIES = [
  { name: 'NUL', session: '\0', units: 1, valid: true },
  { name: '128 astral exact256', session: '😀'.repeat(128), units: 256, valid: true },
  {
    name: 'NUL plus astral exact256',
    session: '\0' + '😀'.repeat(126) + 'abc',
    units: 256,
    valid: true,
  },
  {
    name: 'NUL plus astral invalid257',
    session: '\0' + '😀'.repeat(128),
    units: 257,
    valid: false,
  },
] as const;

for (const boundary of SESSION_BOUNDARIES) {
  test(
    'resource location118 agrees with actual RuntimeClaim codec for ' + boundary.name,
    async () => {
      await withinFrozen('bound-moved', async (fixture) => {
        const healthy = fixture.read(captureStore);
        fixture.mutate((db) => {
          const trigger = db
            .all<{ sql: unknown }>(
              sql`SELECT sql FROM sqlite_master WHERE type='trigger' AND name='runtime_claim_binding_no_update'`,
            )
            .at(0);
          if (trigger === undefined || typeof trigger.sql !== 'string')
            throw new Error('actual immutable binding trigger is absent');
          const triggerSql = trigger.sql;
          db.transaction((tx) => {
            // Controlled codec-boundary fixture, not a claim of Source-produced
            // execution authority for these later session values.
            tx.run(sql`DROP TRIGGER runtime_claim_binding_no_update`);
            tx.run(
              sql`UPDATE runtime_claim_binding SET binding=json_set(binding,'$.execution.sessionId',${boundary.session})`,
            );
            tx.run(sql.raw(triggerSql));
          });
        });
        const before = fixture.read(captureStore);
        expect(before.schema).toEqual(healthy.schema);
        expect(before.ledger).toEqual(healthy.ledger);
        const raw = fixture
          .read((db) => db.all<{ binding: string }>(sql`SELECT binding FROM runtime_claim_binding`))
          .at(0);
        if (raw === undefined) throw new Error('actual session fixture binding is absent');
        const decoded = readRecord(JSON.parse(raw.binding)),
          execution = readRecord(decoded['execution']);
        expect(execution['sessionId']).toBe(boundary.session);
        expect(boundary.session.length).toBe(boundary.units);
        for (const stored of healthy.tables)
          if (stored.name !== 'runtime_claim_binding')
            expect(table(before, stored.name)).toEqual(stored);
        if (boundary.valid) {
          expect(() => parseRuntimeClaim(JSON.parse(raw.binding))).not.toThrow();
          fixture.apply();
          const after = fixture.read(captureStore);
          assertAdditive(before, after);
          expect(table(after, 'resource_use_location').rows).toEqual([
            {
              use_id: fixture.frozen.useId,
              kind: 'claim',
              work_package_id: fixture.frozen.workPackageId,
              work_item_id: 'location-current-child',
            },
          ]);
        } else {
          expect(() => parseRuntimeClaim(JSON.parse(raw.binding))).toThrow();
          let observed: { ok: true } | { ok: false; cause: unknown };
          try {
            fixture.apply();
            observed = { ok: true };
          } catch (cause: unknown) {
            observed = { ok: false, cause };
          }
          expect(observed.ok).toBe(false);
          if (observed.ok)
            throw new Error('actual codec-invalid257 session was used as migration proof');
          expect(
            messagesOf(observed.cause).some(
              (message) =>
                message.includes(fixture.frozen.useId) &&
                message.includes('unprovable lifecycle continuity'),
            ),
          ).toBe(true);
          expect(fixture.read(captureStore)).toEqual(before);
        }

        return Promise.resolve();
      });
    },
    30000,
  );
}

for (const boundary of [
  {
    name: 'duplicate nested session invalid then valid',
    kind: 'nested',
    valid: true,
    append: '"sessionId":17,"sessionId":"duplicate-last-valid"',
  },
  {
    name: 'duplicate nested session valid then invalid',
    kind: 'nested',
    valid: false,
    append: '"sessionId":"duplicate-first-valid","sessionId":17',
  },
  {
    name: 'duplicate execution invalid then valid',
    kind: 'execution',
    valid: true,
    firstSession: 17,
    lastSession: 'duplicate-last-valid',
  },
  {
    name: 'duplicate execution valid then invalid',
    kind: 'execution',
    valid: false,
    firstSession: 'duplicate-first-valid',
    lastSession: 17,
  },
  {
    name: 'unknown execution key',
    kind: 'nested',
    valid: false,
    append: '"sessionId":"unknown-key-session","unexpected":true',
  },
] as const) {
  test(
    'resource location118 agrees with actual RuntimeClaim object policy for ' + boundary.name,
    async () => {
      await withinFrozen('bound-moved', async (fixture) => {
        const healthy = fixture.read(captureStore);
        const stored = fixture
          .read((db) => db.all<{ binding: string }>(sql`SELECT binding FROM runtime_claim_binding`))
          .at(0);
        if (stored === undefined) throw new Error('actual frozen runtime binding is absent');
        const parsed = parseRuntimeClaim(JSON.parse(stored.binding));
        const executionPrefix = {
          storeId: parsed.execution.storeId,
          runId: parsed.execution.runId,
          attemptId: parsed.execution.attemptId,
        };
        const envelope = {
          claimId: parsed.claimId,
          workItemId: parsed.workItemId,
          stepId: parsed.stepId,
          parentClaimId: parsed.parentClaimId,
        };
        const modified =
          boundary.kind === 'nested'
            ? JSON.stringify(envelope).slice(0, -1) +
              ',"execution":' +
              JSON.stringify(executionPrefix).slice(0, -1) +
              ',' +
              boundary.append +
              '}}'
            : JSON.stringify(envelope).slice(0, -1) +
              ',"execution":' +
              JSON.stringify({ ...executionPrefix, sessionId: boundary.firstSession }) +
              ',"execution":' +
              JSON.stringify({ ...executionPrefix, sessionId: boundary.lastSession }) +
              '}';
        expect(modified).not.toBe(stored.binding);
        fixture.mutate((db) => {
          const trigger = db
            .all<{ sql: unknown }>(
              sql`SELECT sql FROM sqlite_master WHERE type='trigger' AND name='runtime_claim_binding_no_update'`,
            )
            .at(0);
          if (trigger === undefined || typeof trigger.sql !== 'string')
            throw new Error('actual immutable runtime binding trigger is absent');
          const triggerSql = trigger.sql;
          db.transaction((tx) => {
            // Only a controlled parser-boundary fixture changes immutable bytes;
            // the genuine Source producer is not asserted to emit this encoding.
            tx.run(sql`DROP TRIGGER runtime_claim_binding_no_update`);
            tx.run(sql`UPDATE runtime_claim_binding SET binding=${modified}`);
            tx.run(sql.raw(triggerSql));
          });
        });
        const before = fixture.read(captureStore);
        expect(before.schema).toEqual(healthy.schema);
        expect(before.ledger).toEqual(healthy.ledger);
        expect(
          fixture
            .read((db) =>
              db.all<{ binding: string }>(sql`SELECT binding FROM runtime_claim_binding`),
            )
            .map((row) => row.binding),
        ).toEqual([modified]);
        for (const saved of healthy.tables)
          if (saved.name !== 'runtime_claim_binding')
            expect(table(before, saved.name)).toEqual(saved);
        if (boundary.valid) {
          const accepted = parseRuntimeClaim(JSON.parse(modified));
          expect(accepted).toEqual({
            ...parsed,
            execution: { ...parsed.execution, sessionId: 'duplicate-last-valid' },
          });
          fixture.apply();
          const after = fixture.read(captureStore);
          assertAdditive(before, after);
          expect(table(after, 'resource_use_location').rows).toEqual([
            {
              use_id: fixture.frozen.useId,
              kind: 'claim',
              work_package_id: fixture.frozen.workPackageId,
              work_item_id: 'location-current-child',
            },
          ]);
        } else {
          expect(() => parseRuntimeClaim(JSON.parse(modified))).toThrow();
          let observed: { ok: true } | { ok: false; cause: unknown };
          try {
            fixture.apply();
            observed = { ok: true };
          } catch (cause: unknown) {
            observed = { ok: false, cause };
          }
          expect(observed.ok).toBe(false);
          if (observed.ok)
            throw new Error('actual codec-invalid unknown field was used as lifecycle proof');
          expect(
            messagesOf(observed.cause).some(
              (message) =>
                message.includes(fixture.frozen.useId) &&
                message.includes('unprovable lifecycle continuity'),
            ),
          ).toBe(true);
          expect(fixture.read(captureStore)).toEqual(before);
        }

        return Promise.resolve();
      });
    },
    30000,
  );
}

test('resource location118 projects genuine merged117 loser binding to its current survivor without rewriting immutable bytes', async () => {
  await withinFrozen('merged-bound', async (fixture) => {
    expect(fixture.frozen.useId).toBe('2651934b-46df-4a6b-b065-9e8c4b3fbbf4');
    expect(fixture.frozen.workPackageId).toBe('merged-resource-old-package');
    const before = fixture.read(captureStore);
    fixture.read((db) => {
      expect(db.all(sql`SELECT id,work_item_id,step_id,run_id FROM claim`)).toEqual([
        {
          id: 'merged-resource-claim',
          work_item_id: 'merged-resource-leaf',
          step_id: 'a-resource-dev',
          run_id: 'merged-resource-run',
        },
      ]);
      expect(db.all(sql`SELECT old_step_id,step_id FROM step_identity_history`)).toEqual([
        { old_step_id: 'z-resource-dev', step_id: 'a-resource-dev' },
      ]);
      expect(db.all(sql`SELECT id FROM step_definition ORDER BY id COLLATE BINARY`)).toEqual([
        { id: 'a-resource-dev' },
      ]);
      const bindings = db.all<{
        organization_id: string;
        work_package_id: string;
        person_id: string;
        claim_id: string;
        binding: string;
      }>(
        sql`SELECT organization_id,work_package_id,person_id,claim_id,binding FROM runtime_claim_binding`,
      );
      expect(bindings).toHaveLength(1);
      const binding = bindings.at(0);
      if (binding === undefined)
        throw new Error('actual merged immutable runtime binding is absent');
      expect({
        organizationId: binding.organization_id,
        workPackageId: binding.work_package_id,
        personId: binding.person_id,
        claimId: binding.claim_id,
      }).toEqual({
        organizationId: 'merged-resource-org',
        workPackageId: 'merged-resource-old-package',
        personId: 'merged-resource-person',
        claimId: 'merged-resource-claim',
      });
      expect(parseRuntimeClaim(JSON.parse(binding.binding))).toEqual({
        claimId: 'merged-resource-claim',
        workItemId: 'merged-resource-leaf',
        stepId: 'z-resource-dev',
        parentClaimId: null,
        execution: {
          storeId: 'merged-resource-store',
          runId: 'merged-resource-run',
          attemptId: 'merged-resource-attempt',
          sessionId: 'merged-resource-session',
        },
      });
      expect(db.all(sql`SELECT step_id,attempt_number,state FROM resource_use`)).toEqual([
        { step_id: null, attempt_number: null, state: 'active' },
      ]);
    });
    fixture.apply();
    const after = fixture.read(captureStore);
    assertAdditive(before, after);
    expect(table(after, 'resource_use_location').rows).toEqual([
      {
        use_id: fixture.frozen.useId,
        kind: 'claim',
        work_package_id: fixture.frozen.workPackageId,
        work_item_id: 'merged-resource-leaf',
      },
    ]);

    return Promise.resolve();
  });
}, 30000);
