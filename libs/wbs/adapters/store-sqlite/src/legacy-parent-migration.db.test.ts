import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { type Drizzle, openExistingConnection } from './db';
import { readMigrationFolders } from './migrate-down';
import { isSqliteCleanupUnknown } from './sqlite-cleanup';
import { applyStepCatalogue } from './step-catalogue-apply';
import { readStepMergeRules, reportStepCatalogue } from './step-catalogue-report';
import provenance from './testing/fixtures/legacy-parent-progress.json';
import { copyRecoveryPrefix, readRecoveryState } from './testing/recovery-state';
import { createWindowBackup } from './window-backup';

const folders = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const catalogue = '20261115130000_add_step_catalogue';
let directory: string | undefined;
let hasUnknownOwner = false;

function withinConnection<Value>(path: string, use: (db: Drizzle) => Value): Value {
  let connection: ReturnType<typeof openExistingConnection>;
  try {
    connection = openExistingConnection(path);
  } catch (cause: unknown) {
    if (isSqliteCleanupUnknown(cause)) hasUnknownOwner = true;
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
    hasUnknownOwner = true;
    if (!observed.ok)
      throw new AggregateError(
        [observed.cause, cleanup],
        'legacy fixture operation and close failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (!observed.ok) throw observed.cause;
  return observed.value;
}

afterEach(() => {
  if (directory === undefined) return;
  if (hasUnknownOwner) throw new Error('Legacy database owner unsettled at ' + directory);
  rmSync(directory, { recursive: true });
  directory = undefined;
});

/** Unpacks actual116 backup bytes; no authoring port or historical row is invented. */
function openLegacyDatabase() {
  if (directory !== undefined) throw new Error('Previous legacy database is unsettled');
  directory = mkdtempSync(join(tmpdir(), 'puni-legacy-parent-'));
  hasUnknownOwner = false;
  const compressed = readFileSync(
    new URL('./testing/fixtures/legacy-parent-progress.sqlite.gz', import.meta.url),
  );
  expect(createHash('sha256').update(compressed).digest('hex')).toBe(provenance.gzipSha256);
  const bytes = Bun.gunzipSync(compressed);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(provenance.databaseSha256);
  const path = join(directory, 'legacy.db');
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  const migrations = copyRecoveryPrefix(directory, '20261115120000_add_step_migration_report');
  withinConnection(path, (db) => {
    expect(db.all('SELECT name,hash FROM __drizzle_migrations ORDER BY name')).toEqual(
      readMigrationFolders(migrations).map(({ name, hash }) => ({ name, hash })),
    );
    expect(db.all('SELECT work_item_id,step_id,state,stated_at FROM step_progress')).toEqual([
      { work_item_id: 'parent', step_id: 'legacy-dev', state: 'done', stated_at: 10 },
    ]);
    expect(db.all("SELECT id FROM work_item WHERE parent_id='parent' ORDER BY id")).toEqual([
      { id: 'incoming' },
      { id: 'moving' },
    ]);
  });
  const rules = { version: 1, fingerprint: provenance.fingerprint, organizations: {} };
  const rulePath = join(directory, 'rules.json');
  writeFileSync(rulePath, JSON.stringify(rules), { flag: 'wx', mode: 0o600 });
  return { path, migrations, rules, rulePath, directory };
}

for (const boundary of ['report', 'rules', 'apply'] as const) {
  test(
    'refuses genuine legacy parent progress at ' + boundary + ' without changing persistence',
    () => {
      const store = openLegacyDatabase();
      cpSync(join(folders, catalogue), join(store.migrations, catalogue), { recursive: true });
      const window = {
        sourcePath: store.path,
        migrationsFolder: store.migrations,
        snapshotPath: join(store.directory, 'before.db'),
        reportPath: join(store.directory, 'backup.json'),
      };
      if (boundary === 'apply') createWindowBackup(window);
      const before = readRecoveryState(store.path);
      const invoke = () => {
        if (boundary === 'report')
          return withinConnection(store.path, (db) => reportStepCatalogue(db, 100));
        if (boundary === 'rules')
          return withinConnection(store.path, (db) => readStepMergeRules(db, store.rulePath));
        return applyStepCatalogue({
          window,
          rulesJson: JSON.stringify(store.rules),
          appliedAt: '2026-11-20T00:00:00.000Z',
        });
      };
      expect(invoke).toThrow('step-report parent point fact: step_progress parent legacy-dev');
      expect(readRecoveryState(store.path)).toEqual(before);
    },
  );
}

test('keeps the allocator exception for genuine legacy parent numbering', () => {
  const store = openLegacyDatabase();
  withinConnection(store.path, (db) => {
    // Storage boundary fixture: only this separate positive replaces the unsupported point.
    db.run("DELETE FROM step_progress WHERE work_item_id='parent'");
    db.run(
      "INSERT INTO step_node_attempt_issued(work_item_id,step_id,issued) VALUES('parent','legacy-dev',11)",
    );
    const before = db.all('SELECT * FROM step_node_attempt_issued');
    expect(reportStepCatalogue(db, 100).rows).toEqual([]);
    expect(db.all('SELECT * FROM step_node_attempt_issued')).toEqual(before);
  });
});
