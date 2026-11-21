import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NewStepDefinition, NewWorkPackage, WriteStamp } from '@wbs/core';
import { sql } from 'drizzle-orm';
import type { Logger } from 'drizzle-orm/logger';

import { type Drizzle, openExistingConnection } from '../db';
import { runMigrations } from '../migrate';
import { readMigrationFolders } from '../migrate-down';
import { openSqliteSource, type SqliteSource } from '../source';
import { applyStepCatalogue } from '../step-catalogue-apply';
import { reportStepCatalogue } from '../step-catalogue-report';
import { assertWindowBackup, createWindowBackup } from '../window-backup';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './dependency-capability';
import { seedLegacyPackageParent } from './legacy-package-parent';
import { copyRecoveryPrefix } from './recovery-state';
import { MIGRATIONS_FOLDER } from './space-database';

/**
 * Actual116→private117→additive118/119 fixture with one logger-backed Source writer.
 * E37 verifies generated backup bytes; exclusive fixture custody is not operator
 * session/barrier authority and never enables default destructive discovery.
 * The authored legacy organization remains preactivation for legacy-access query
 * scope owners. Definitions/bindings are authored separately, never inferred from
 * a legacy Step DTO. Failed acquisition/close retains the directory.
 */
export function openScopedServiceFixture(prefix: string, logger?: Logger) {
  const directory = mkdtempSync(join(tmpdir(), prefix)),
    path = join(directory, 'source.db');
  let source: SqliteSource | undefined;
  const custody = { hasUnknownOwner: false };
  function withinConnection<T>(use: (db: Drizzle) => T): T {
    let connection: ReturnType<typeof openExistingConnection>;
    try {
      connection = openExistingConnection(path);
    } catch (cause: unknown) {
      custody.hasUnknownOwner = true;
      throw cause;
    }
    let observed: { ok: true; value: T } | { ok: false; cause: unknown };
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
          'scope fixture operation and close failed',
          { cause: cleanup },
        );
      throw cleanup;
    }
    if (!observed.ok) throw observed.cause;
    return observed.value;
  }
  try {
    const predecessor = '20261115120000_add_step_migration_report',
      catalogue = '20261115130000_add_step_catalogue';
    const parents = readMigrationFolders(MIGRATIONS_FOLDER).filter(
      ({ name }) => name <= predecessor,
    );
    if (parents.length !== 116)
      throw new Error('scope fixture requires the complete116 predecessor');
    const migrations = copyRecoveryPrefix(directory, predecessor);
    try {
      runMigrations(path, migrations);
    } catch (cause: unknown) {
      custody.hasUnknownOwner = true;
      throw cause;
    }
    const additions = readMigrationFolders(MIGRATIONS_FOLDER).filter(
      ({ name }) => name === catalogue,
    );
    if (additions.length !== 1)
      throw new Error('scope fixture requires the exact private117 folder');
    cpSync(join(MIGRATIONS_FOLDER, catalogue), join(migrations, catalogue), { recursive: true });
    const report = withinConnection((db) => reportStepCatalogue(db, 1));
    if (report.rows.length !== 0) throw new Error('scope fixture predecessor is not empty');
    const window = {
      sourcePath: path,
      migrationsFolder: migrations,
      snapshotPath: join(directory, 'before-catalogue.db'),
      reportPath: join(directory, 'before-catalogue.json'),
    };
    try {
      const backup = createWindowBackup(window),
        verified = assertWindowBackup(window);
      if (JSON.stringify(verified) !== JSON.stringify(backup.report))
        throw new Error('scope fixture backup evidence differs');
      applyStepCatalogue({
        window,
        rulesJson: JSON.stringify({
          version: 1,
          fingerprint: report.fingerprint,
          organizations: {},
        }),
        appliedAt: '2026-11-18T00:00:00.000Z',
      });
    } catch (cause: unknown) {
      custody.hasUnknownOwner = true;
      throw cause;
    }
    withinConnection((db) => {
      const ledger = db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      );
      const expected = [...parents, ...additions].map(({ name, hash }) => ({ name, hash }));
      if (JSON.stringify(ledger) !== JSON.stringify(expected))
        throw new Error('scope fixture full migration ledger differs');
      if (db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='step'").length !== 0)
        throw new Error('scope fixture retained the old step table');
      if (db.all('PRAGMA foreign_key_check').length !== 0)
        throw new Error('scope fixture migration foreign keys differ');
    });
    for (const name of [
      '20261118180000_add_resource_use_locations',
      '20261118210000_add_step_retirements',
    ]) {
      const selected = readMigrationFolders(MIGRATIONS_FOLDER).filter(
        (folder) => folder.name === name,
      );
      if (selected.length !== 1)
        throw new Error('scope fixture requires exact additive folder: ' + name);
      cpSync(join(MIGRATIONS_FOLDER, name), join(migrations, name), { recursive: true });
      try {
        runMigrations(path, migrations);
      } catch (cause: unknown) {
        custody.hasUnknownOwner = true;
        throw cause;
      }
    }
    withinConnection((db) => {
      const ledger = db.all<{ name: string; hash: string }>(
        'SELECT name,hash FROM __drizzle_migrations ORDER BY name',
      );
      const expected = readMigrationFolders(migrations).map(({ name, hash }) => ({ name, hash }));
      if (JSON.stringify(ledger) !== JSON.stringify(expected))
        throw new Error('scope fixture current full ledger differs');
      if (db.all('PRAGMA foreign_key_check').length !== 0)
        throw new Error('scope fixture current foreign keys differ');
    });
    try {
      seedLegacyPackageParent(path, 'fixture-legacy-org', 'fixture-project');
    } catch (cause: unknown) {
      custody.hasUnknownOwner = true;
      throw cause;
    }
    try {
      source = openSqliteSource({
        dbPath: path,
        dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
        ...(logger === undefined ? {} : { logger }),
      });
    } catch (cause: unknown) {
      custody.hasUnknownOwner = true;
      throw cause;
    }
    const opened = source;
    let closing: Promise<void> | undefined;
    function close(): Promise<void> {
      closing ??= Promise.resolve().then(async () => {
        try {
          await opened.close();
        } catch (cause: unknown) {
          custody.hasUnknownOwner = true;
          throw cause;
        }
        rmSync(directory, { recursive: true });
      });
      return closing;
    }
    return { source: opened, path, directory, close };
  } catch (primary: unknown) {
    if (!custody.hasUnknownOwner) {
      try {
        rmSync(directory, { recursive: true });
      } catch (cleanup: unknown) {
        throw new AggregateError(
          [primary, cleanup],
          'scope fixture setup and directory removal failed',
          { cause: cleanup },
        );
      }
    }
    throw primary;
  }
}

/** Explicit scope-fixture author metadata; every package has its own project binding. */
export async function createScopePackage(
  source: SqliteSource,
  workPackage: NewWorkPackage,
  definition: NewStepDefinition,
  stamp: WriteStamp,
) {
  const projectId = workPackage.id + ':project';
  source.db.run(
    sql`INSERT INTO project(id,organization_id,name,created_at) VALUES(${projectId},'fixture-legacy-org',${projectId},${stamp.at})`,
  );
  const created = await source.stores.workPackages.create({ ...workPackage, projectId }, [], stamp);
  if (typeof created === 'string')
    throw new Error('scope fixture package birth refused: ' + created);
  const defined = await source.stores.stepCatalogue.defineAndBindStep(
    'fixture-legacy-org',
    definition,
    {
      bindingId: definition.id + ':binding',
      scopeKind: 'project',
      scopeId: projectId,
      workItemTypeId: null,
      position: 10,
    },
    stamp,
  );
  if (!defined.ok) throw new Error('scope fixture catalogue definition refused: ' + defined.reason);
  return created;
}
