import { deepStrictEqual } from 'node:assert';
import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { openExistingConnection } from '../db';
import { runMigrations } from '../migrate';
import { applyStepCatalogue } from '../step-catalogue-apply';
import { reportStepCatalogue, type StepMergeRules } from '../step-catalogue-report';
import { assertWindowBackup, createWindowBackup } from '../window-backup';
import { copyRecoveryPrefix } from './recovery-state';
import { MIGRATIONS_FOLDER } from './space-database';

/** Upgrades a seeded historical fixture through the real report, backup and explicit catalogue writer. */
export function applyHistoricalCatalogueFixture(
  path: string,
  directory: string,
  organizations: StepMergeRules['organizations'],
) {
  const maintenance = join(directory, 'catalogue');
  mkdirSync(maintenance);
  const catalogue = '20261115130000_add_step_catalogue';
  const migrationsFolder = copyRecoveryPrefix(
    maintenance,
    '20261115120000_add_step_migration_report',
  );
  runMigrations(path, migrationsFolder);
  cpSync(join(MIGRATIONS_FOLDER, catalogue), join(migrationsFolder, catalogue), {
    recursive: true,
  });
  const connection = openExistingConnection(path);
  const report = (() => {
    try {
      return reportStepCatalogue(connection.db, 100);
    } finally {
      connection.close();
    }
  })();
  const window = {
    sourcePath: path,
    migrationsFolder,
    snapshotPath: join(maintenance, 'snapshot.db'),
    reportPath: join(maintenance, 'snapshot.json'),
  };
  const backup = createWindowBackup(window);
  deepStrictEqual(assertWindowBackup(window), backup.report);
  applyStepCatalogue({
    window,
    rulesJson: JSON.stringify({ version: 1, fingerprint: report.fingerprint, organizations }),
    appliedAt: '2026-11-18T00:00:00.000Z',
  });
  return report;
}
