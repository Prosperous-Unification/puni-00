import { createHash } from 'node:crypto';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from 'bun:test';

import { type Drizzle, openExistingConnection } from '../db';
import { runMigrations } from '../migrate';
import { readMigrationFolders } from '../migrate-down';
import { applyStepCatalogue } from '../step-catalogue-apply';
import { reportStepCatalogue } from '../step-catalogue-report';
import { createWindowBackup } from '../window-backup';
import type { CatalogueFixtureCustody } from './catalogue-database';
import provenance from './fixtures/legacy-move.json';
import { copyRecoveryPrefix } from './recovery-state';
import { MIGRATIONS_FOLDER } from './space-database';

export type LegacyMoveCase = keyof typeof provenance.cases;

/** Verifies compressed and original archived bytes before any native database acquisition. */
function readArchivedBytes(archive: {
  readonly file: string;
  readonly sha256: string;
  readonly gzipSha256: string;
}): Uint8Array {
  const compressed = readFileSync(new URL('./fixtures/' + archive.file, import.meta.url));
  // Proof: valid gzip header metadata drift failed before native acquisition (genuine-move-fault-gzip-integrity-v1).
  expect(createHash('sha256').update(compressed).digest('hex')).toBe(archive.gzipSha256);
  const bytes = Bun.gunzipSync(compressed);
  // Proof: breaking only the archived original digest failed independently (genuine-move-fault-original-integrity-v1).
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(archive.sha256);
  return bytes;
}

/**
 * Actual immutable old move records through ordinary110→116, report/backup/private117 and118/119.
 * Complete ledgers and original journal/event strings are compared; no fact, recipe or Source is invented.
 * Caller owns the directory; uncertain acquisition, migration or close latches retained custody.
 */
export function prepareLegacyMoveDatabase(
  directory: string,
  kind: LegacyMoveCase,
  custody: CatalogueFixtureCustody,
) {
  const selected = provenance.cases[kind];
  const bytes = readArchivedBytes(selected.database);
  const producer: unknown = JSON.parse(
    new TextDecoder().decode(readArchivedBytes(selected.producer)),
  );
  const control: unknown = JSON.parse(
    new TextDecoder().decode(readArchivedBytes(selected.control)),
  );
  const script = readFileSync(new URL('./fixtures/' + provenance.producerScript, import.meta.url));
  expect(createHash('sha256').update(script).digest('hex')).toBe(provenance.producerScriptSha256);
  const path = join(directory, 'legacy.db');
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  function withinConnection<Value>(use: (db: Drizzle) => Value): Value {
    let connection: ReturnType<typeof openExistingConnection>;
    try {
      connection = openExistingConnection(path);
    } catch (cause: unknown) {
      custody.hasUnknownOwner = true;
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
      custody.hasUnknownOwner = true;
      if (!observed.ok)
        throw new AggregateError(
          [observed.cause, cleanup],
          'legacy move operation and close failed',
          { cause: cleanup },
        );
      throw cleanup;
    }
    if (!observed.ok) throw observed.cause;
    return observed.value;
  }
  const migrations = copyRecoveryPrefix(directory, '20261115120000_add_step_migration_report');
  const parents = readMigrationFolders(migrations);
  expect(parents).toHaveLength(116);
  const readHistory = (db: Drizzle, identityColumn: 'project_id' | 'work_package_id') => ({
    journal: db.all(
      'SELECT seq,id,' +
        identityColumn +
        ' AS work_package_id,user_id,person_id,kind,payload,inverse,preconditions,created_at,undone FROM command_journal ORDER BY seq',
    ),
    events: db.all(
      'SELECT id,' +
        identityColumn +
        ' AS work_package_id,user_id,kind,label,work_item_id,step_id,before,after,created_at FROM plan_event ORDER BY rowid',
    ),
  });
  const history = withinConnection((db) => {
    expect(db.all('SELECT name,hash FROM __drizzle_migrations ORDER BY name')).toEqual(
      parents.slice(0, 110).map(({ name, hash }) => ({ name, hash })),
    );
    return readHistory(db, 'project_id');
  });
  function migrate() {
    try {
      runMigrations(path, migrations);
    } catch (cause: unknown) {
      custody.hasUnknownOwner = true;
      throw cause;
    }
  }
  migrate();
  withinConnection((db) => {
    expect(readHistory(db, 'work_package_id')).toEqual(history);
  });
  const report = withinConnection((db) => reportStepCatalogue(db, 1));
  expect(report.rows).toEqual([]);
  const catalogue = '20261115130000_add_step_catalogue';
  cpSync(join(MIGRATIONS_FOLDER, catalogue), join(migrations, catalogue), { recursive: true });
  const window = {
    sourcePath: path,
    migrationsFolder: migrations,
    snapshotPath: join(directory, 'before-catalogue.db'),
    reportPath: join(directory, 'before-catalogue.json'),
  };
  try {
    createWindowBackup(window);
    expect(
      applyStepCatalogue({
        window,
        rulesJson: JSON.stringify({
          version: 1,
          fingerprint: report.fingerprint,
          organizations: {},
        }),
        appliedAt: '2026-11-21T00:00:00.000Z',
      }),
    ).toHaveLength(117);
  } catch (cause: unknown) {
    custody.hasUnknownOwner = true;
    throw cause;
  }
  for (const name of [
    '20261118180000_add_resource_use_locations',
    '20261118210000_add_step_retirements',
  ]) {
    cpSync(join(MIGRATIONS_FOLDER, name), join(migrations, name), { recursive: true });
    migrate();
  }
  withinConnection((db) => {
    expect(db.all('SELECT name,hash FROM __drizzle_migrations ORDER BY name')).toEqual(
      readMigrationFolders(migrations).map(({ name, hash }) => ({ name, hash })),
    );
    expect(readHistory(db, 'work_package_id')).toEqual(history);
    expect(db.all('SELECT work_item_id,step_id,state,stated_at FROM step_progress')).toEqual([
      { work_item_id: 'moving', step_id: 'legacy-dev', state: 'in_progress', stated_at: 11 },
    ]);
    expect(db.all('SELECT work_item_id,step_id,blocked_at FROM step_blockage')).toEqual(
      selected.hasBlockage
        ? [{ work_item_id: 'moving', step_id: 'legacy-dev', blocked_at: -10 }]
        : [],
    );
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });
  return { path, producer, control };
}
