import { deepStrictEqual, strictEqual } from 'node:assert';
import { createHash, randomBytes } from 'node:crypto';
import {
  cpSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { type Drizzle, openExistingConnection } from '../db';
import { runMigrations } from '../migrate';
import { readMigrationFolders } from '../migrate-down';
import { applyStepCatalogue } from '../step-catalogue-apply';
import { reportStepCatalogue } from '../step-catalogue-report';
import { assertWindowBackup, createWindowBackup, type WindowBackupReport } from '../window-backup';
import { copyRecoveryPrefix } from './recovery-state';
import { MIGRATIONS_FOLDER } from './space-database';

/** Actual lower acquisition/close uncertainty is latched into the enclosing fixture owner. */
export interface CatalogueFixtureCustody {
  hasUnknownOwner: boolean;
}

/** Exclusively owned destination of one catalogue fixture. */
export interface CatalogueFixtureRequest {
  readonly path: string;
  readonly directory: string;
  readonly reportedAt: number;
}

/**
 * Bytes captured from one complete build. `report` is the E37 report as written, whose
 * `sourcePath`/`snapshotPath` name the build's directory and are rewritten per copy.
 */
export interface CatalogueFixtureTemplate {
  readonly database: Buffer;
  readonly databaseSha256: string;
  readonly snapshot: Buffer;
  readonly snapshotSha256: string;
  readonly report: WindowBackupReport;
  /** The build's random `runtime_ledger.ledger_id`; every copy receives its own. */
  readonly ledgerId: string;
}

/** Templates keyed by {@link readTemplateKey}; `null` in place of one always builds. */
export type CatalogueFixtureTemplates = Map<string, CatalogueFixtureTemplate>;

const processTemplates: CatalogueFixtureTemplates = new Map();
let migrationLedgerSha256: string | undefined;

const predecessor = '20261115120000_add_step_migration_report',
  catalogue = '20261115130000_add_step_catalogue',
  locationsName = '20261118180000_add_resource_use_locations',
  retirement = '20261118210000_add_step_retirements';

/**
 * Empty exclusively owned fixture database: normal116, actual report/E37/private117,
 * then ordinary additive118 and119. Exact name/hash ledgers and absent legacy inventory
 * are checked before a Source opens. It supplies no host/session/barrier authority
 * and never grants pending117 to the default migrator.
 *
 * The first call per {@link readTemplateKey} in a process builds in the caller's own
 * `directory` and captures the database, snapshot and report bytes; later calls write
 * those bytes and recreate the same files, stage directories and hard links (#996: the
 * build costs about one second, the copy 10-20 ms). An existing `path` always
 * builds. A copy replaces the build's random `runtime_ledger.ledger_id` (an
 * immutable 32-hex text cell) with a fresh one in both files and re-digests the
 * snapshot, so ledgers stay distinct as built ones are. It carries the template's
 * wall-clock `applied_at`/`access_role.created_at` and report `sourceSha256` (the
 * pre-catalogue bytes, already replaced in a build too). The build closes every
 * connection, so no `-wal`/`-shm` sidecar holds state the captured bytes lack.
 * @throws when a captured template no longer matches its build digests; that template
 * is evicted first, so the next call rebuilds.
 */
export function migrateEmptyCatalogueFixture(
  request: CatalogueFixtureRequest,
  custody: CatalogueFixtureCustody,
  templates: CatalogueFixtureTemplates | null = processTemplates,
): void {
  const existing = lstatSync(request.path, { throwIfNoEntry: false }) !== undefined;
  if (templates === null || existing) {
    buildCatalogueFixture(request, custody);
    return;
  }
  const key = readTemplateKey(request.reportedAt);
  const template = templates.get(key);
  if (template === undefined) {
    const { report, ledgerId } = buildCatalogueFixture(request, custody);
    const database = readFileSync(request.path),
      snapshot = readFileSync(report.snapshotPath);
    templates.set(key, {
      database,
      databaseSha256: readSha256(database),
      snapshot,
      snapshotSha256: readSha256(snapshot),
      report,
      ledgerId,
    });
    return;
  }
  // Proof: removing this digest check let catalogue-database.db.test.ts "refuses a
  // corrupted template and rebuilds on the next call" copy the flipped byte (no throw).
  if (
    readSha256(template.database) !== template.databaseSha256 ||
    readSha256(template.snapshot) !== template.snapshotSha256
  ) {
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- templates is a typed in-memory Map; this boundary cannot issue SQL.
    templates.delete(key);
    throw new Error('catalogue fixture template changed since its build; evicted ' + key);
  }
  copyCatalogueFixture(request, template, custody);
}

/** One process-wide name/hash fingerprint of the drizzle folder plus the report stamp. */
function readTemplateKey(reportedAt: number): string {
  migrationLedgerSha256 ??= readSha256(
    Buffer.from(
      JSON.stringify(readMigrationFolders(MIGRATIONS_FOLDER).map(({ name, hash }) => [name, hash])),
    ),
  );
  return migrationLedgerSha256 + ':' + String(reportedAt);
}

function readSha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The build's exact migrations copy: the recovery prefix plus its three later folders. */
function copyFixtureMigrations(directory: string): void {
  const migrations = copyRecoveryPrefix(directory, predecessor);
  for (const name of [catalogue, locationsName, retirement])
    cpSync(join(MIGRATIONS_FOLDER, name), join(migrations, name), { recursive: true });
}

/**
 * Reproduces a build's files from captured bytes. Like the build, it refuses an existing
 * migrations folder or window artifact; a SQLite or window write failure latches custody
 * as the build's migrator and window failures do.
 */
function copyCatalogueFixture(
  { path, directory }: CatalogueFixtureRequest,
  template: CatalogueFixtureTemplate,
  custody: CatalogueFixtureCustody,
): void {
  copyFixtureMigrations(directory);
  const ledgerId = randomBytes(template.ledgerId.length)
    .toString('hex')
    .slice(0, template.ledgerId.length);
  const database = replaceLedgerId(template.database, template.ledgerId, ledgerId),
    snapshot = replaceLedgerId(template.snapshot, template.ledgerId, ledgerId);
  try {
    writeFileSync(path, database, { flag: 'wx', mode: 0o644 });
    const snapshotPath = join(directory, 'before-catalogue.db');
    const snapshotStage = mkdtempSync(join(directory, '.window-snapshot-'));
    writeFileSync(join(snapshotStage, 'before-catalogue.db'), snapshot, {
      flag: 'wx',
      mode: 0o644,
    });
    linkSync(join(snapshotStage, 'before-catalogue.db'), snapshotPath);
    const report: WindowBackupReport = {
      ...template.report,
      sourcePath: readPhysicalPath(path),
      snapshotPath: readPhysicalPath(snapshotPath),
      snapshotSha256: readSha256(snapshot),
    };
    const reportStage = mkdtempSync(join(directory, '.window-report-'));
    writeFileSync(join(reportStage, 'report.json'), JSON.stringify(report) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    linkSync(join(reportStage, 'report.json'), join(directory, 'before-catalogue.json'));
  } catch (cause: unknown) {
    custody.hasUnknownOwner = true;
    throw cause;
  }
}

/**
 * Copies `bytes` with every occurrence of the ASCII `from` overwritten by the same-length
 * `to`; freed pages may hold stale copies of the cell.
 * @throws when `from` never occurs, since the copy would then share the build's ledger.
 */
function replaceLedgerId(bytes: Buffer, from: string, to: string): Buffer {
  const copy = Buffer.from(bytes),
    needle = Buffer.from(from, 'latin1'),
    replacement = Buffer.from(to, 'latin1');
  let replaced = 0;
  for (let at = copy.indexOf(needle); at !== -1; at = copy.indexOf(needle, at + needle.length)) {
    replacement.copy(copy, at);
    replaced += 1;
  }
  // Proof: dropping this refusal let catalogue-database.db.test.ts "refuses a template
  // whose ledger id is absent from its bytes" copy the build's ledger unchanged.
  if (replaced === 0) throw new Error('catalogue fixture template lacks its ledger id ' + from);
  return copy;
}

/** The window backup's physical spelling of an existing file: real parent, literal leaf. */
function readPhysicalPath(path: string): string {
  const absolute = resolve(path);
  return join(realpathSync(dirname(absolute)), basename(absolute));
}

/** The original uncached fixture; returns the window report it wrote and the ledger id. */
function buildCatalogueFixture(
  { path, directory, reportedAt }: CatalogueFixtureRequest,
  custody: CatalogueFixtureCustody,
): { readonly report: WindowBackupReport; readonly ledgerId: string } {
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
          'catalogue fixture operation and close failed',
          { cause: cleanup },
        );
      throw cleanup;
    }
    if (!observed.ok) throw observed.cause;
    return observed.value;
  }
  const parents = readMigrationFolders(MIGRATIONS_FOLDER).filter(({ name }) => name <= predecessor);
  strictEqual(parents.length, 116);
  const migrations = copyRecoveryPrefix(directory, predecessor);
  try {
    runMigrations(path, migrations);
  } catch (cause: unknown) {
    custody.hasUnknownOwner = true;
    throw cause;
  }
  const addition = readMigrationFolders(MIGRATIONS_FOLDER).filter(({ name }) => name === catalogue);
  strictEqual(addition.length, 1);
  cpSync(join(MIGRATIONS_FOLDER, catalogue), join(migrations, catalogue), { recursive: true });
  const report = withinConnection((db) => reportStepCatalogue(db, reportedAt));
  deepStrictEqual(report.rows, []);
  const window = {
    sourcePath: path,
    migrationsFolder: migrations,
    snapshotPath: join(directory, 'before-catalogue.db'),
    reportPath: join(directory, 'before-catalogue.json'),
  };
  let backup: ReturnType<typeof createWindowBackup>;
  try {
    backup = createWindowBackup(window);
    deepStrictEqual(assertWindowBackup(window), backup.report);
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
    deepStrictEqual(
      db.all('SELECT name,hash FROM __drizzle_migrations ORDER BY name'),
      [...parents, ...addition].map(({ name, hash }) => ({ name, hash })),
    );
  });
  // The real additive118 follows the real explicit117 owner; the ordinary
  // migrator still receives no bypass for pending catalogue storage.
  const locations = readMigrationFolders(MIGRATIONS_FOLDER).filter(
    ({ name }) => name === locationsName,
  );
  strictEqual(locations.length, 1);
  cpSync(join(MIGRATIONS_FOLDER, locationsName), join(migrations, locationsName), {
    recursive: true,
  });
  try {
    runMigrations(path, migrations);
  } catch (cause: unknown) {
    custody.hasUnknownOwner = true;
    throw cause;
  }
  const retirements = readMigrationFolders(MIGRATIONS_FOLDER).filter(
    ({ name }) => name === retirement,
  );
  strictEqual(retirements.length, 1);
  cpSync(join(MIGRATIONS_FOLDER, retirement), join(migrations, retirement), { recursive: true });
  try {
    runMigrations(path, migrations);
  } catch (cause: unknown) {
    custody.hasUnknownOwner = true;
    throw cause;
  }
  return withinConnection((db) => {
    deepStrictEqual(
      db.all('SELECT name,hash FROM __drizzle_migrations ORDER BY name'),
      [...parents, ...addition, ...locations, ...retirements].map(({ name, hash }) => ({
        name,
        hash,
      })),
    );
    deepStrictEqual(
      db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='step'"),
      [],
    );
    deepStrictEqual(db.all('SELECT id FROM step_definition'), []);
    const ledger = db.get<{ ledger_id: string } | undefined>(
      'SELECT ledger_id FROM runtime_ledger WHERE id=1',
    );
    if (ledger === undefined) throw new Error('catalogue fixture has no runtime ledger row');
    return { report: backup.report, ledgerId: ledger.ledger_id };
  });
}
