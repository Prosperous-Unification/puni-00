/**
 * The first Compose → k3s move of WBS. The release coordinator cannot do it: it needs a running
 * k3s release to start from. These are the pieces both the local rehearsal
 * (`cutover-rehearsal.ts`) and the production plan (docs/infra/cutover-plan.md) use.
 */

/**
 * The cutover in order. `restore-into-pvc` is the rollback boundary's last reversible step:
 * until `switch-traffic` sends users to k3s, the old Compose writer, stopped but intact, is the
 * system of record and restarting it (plus unfencing its edge) is the whole rollback. After the
 * switch, new writes live only on k3s and recovery is the F8 transaction.
 */
export const CUTOVER_PHASES = [
  'fence-edge-writes',
  'drain-gateway',
  'stop-writer',
  'export-sqlite',
  'verify-export',
  'restore-into-pvc',
  'start-tiers',
  'smoke-host-override',
  'switch-traffic',
] as const;
export type CutoverPhase = (typeof CUTOVER_PHASES)[number];

/** The phases after which rolling back means restarting the old writer and unfencing it. */
export const REVERSIBLE_PHASES: readonly CutoverPhase[] = CUTOVER_PHASES.slice(
  0,
  CUTOVER_PHASES.indexOf('switch-traffic'),
);

const REPORT_MARKER = 'PUNI_SQLITE_REPORT ';

/**
 * Runs inside the backend image (`bun -e`), on either side. With `PUNI_EXPORT` set it first takes
 * the consistent export (`wal_checkpoint(TRUNCATE)`, then `VACUUM INTO`) and reports on the copy;
 * otherwise it reports on `PUNI_DB` itself. It never creates a database: an absent file throws.
 * `PUNI_KNOWN` is a JSON array of project names whose presence is reported; `counts` covers
 * every table, so any row lost in transit shows up as a count difference.
 */
export const SQLITE_REPORT_SCRIPT = String.raw`
const { Database } = require('bun:sqlite');
const fs = require('node:fs');
const crypto = require('node:crypto');
const source = process.env.PUNI_DB;
const exportPath = process.env.PUNI_EXPORT || null;
const known = JSON.parse(process.env.PUNI_KNOWN || '[]');
if (!source || !fs.existsSync(source)) throw new Error('database ' + source + ' does not exist');
let target = source;
if (exportPath !== null) {
  if (fs.existsSync(exportPath)) throw new Error('export ' + exportPath + ' already exists');
  const live = new Database(source, { readwrite: true, create: false });
  live.run('PRAGMA wal_checkpoint(TRUNCATE)');
  live.run("VACUUM INTO '" + exportPath.replaceAll("'", "''") + "'");
  live.close();
  target = exportPath;
}
const db = new Database(target, { readonly: true });
const integrity = db.query('PRAGMA integrity_check').all().map((r) => r.integrity_check);
const foreignKeyViolations = db.query('PRAGMA foreign_key_check').all().length;
const migrations = db.query('SELECT name FROM __drizzle_migrations ORDER BY created_at, name').all().map((r) => r.name);
const tables = db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
const counts = {};
for (const t of tables) counts[t] = db.query('SELECT count(*) AS n FROM "' + t + '"').get().n;
const names = new Set(db.query('SELECT name FROM project').all().map((r) => r.name));
db.close();
const stat = fs.statSync(target);
console.log('${REPORT_MARKER}' + JSON.stringify({
  path: target,
  integrity,
  foreignKeyViolations,
  migrations,
  counts,
  known: Object.fromEntries(known.map((n) => [n, names.has(n)])),
  sha256: crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),
  ownerUid: stat.uid,
}));
`;

export interface SqliteReport {
  path: string;
  integrity: string[];
  foreignKeyViolations: number;
  migrations: string[];
  counts: Record<string, number>;
  known: Record<string, boolean>;
  sha256: string;
  ownerUid: number;
}

/** The one marked line {@link SQLITE_REPORT_SCRIPT} prints; anything else is a failed run. */
export function parseSqliteReport(output: string): SqliteReport {
  const lines = output.split('\n').filter((line) => line.startsWith(REPORT_MARKER));
  if (lines.length !== 1) {
    throw new Error(`expected one ${REPORT_MARKER.trim()} line, got ${String(lines.length)}`);
  }
  const parsed = JSON.parse(lines[0].slice(REPORT_MARKER.length)) as Partial<SqliteReport>;
  if (
    typeof parsed.path !== 'string' ||
    !Array.isArray(parsed.integrity) ||
    typeof parsed.foreignKeyViolations !== 'number' ||
    !Array.isArray(parsed.migrations) ||
    typeof parsed.counts !== 'object' ||
    typeof parsed.known !== 'object' ||
    typeof parsed.sha256 !== 'string' ||
    typeof parsed.ownerUid !== 'number'
  ) {
    throw new Error(`malformed SQLite report: ${lines[0]}`);
  }
  // Boundary: every field was checked above.
  return parsed as SqliteReport;
}

/**
 * The export is sound when SQLite finds no corruption and no dangling foreign key, it records
 * applied migrations, and every known row is present.
 */
export function assertExportSound(report: SqliteReport): void {
  // Proof: cutover.test.ts `refuses an export whose integrity_check is not ok`; with this check
  // removed a report carrying a page-corruption line was accepted.
  if (report.integrity.length !== 1 || report.integrity[0] !== 'ok') {
    throw new Error(`integrity_check on ${report.path}: ${report.integrity.join('; ')}`);
  }
  // Proof: cutover.test.ts `refuses an export with foreign key violations`; with this check
  // removed a work_item pointing at a deleted project passed.
  if (report.foreignKeyViolations !== 0) {
    throw new Error(
      `foreign_key_check on ${report.path} found ${String(report.foreignKeyViolations)} violations`,
    );
  }
  if (report.migrations.length === 0) {
    throw new Error(`${report.path} records no applied migrations; it is not a WBS database`);
  }
  const missing = Object.entries(report.known)
    .filter(([, present]) => !present)
    .map(([name]) => name);
  if (missing.length > 0) throw new Error(`${report.path} lacks known rows: ${missing.join(', ')}`);
}

/** UID every WBS tier runs as on k3s; the restored database must belong to it. */
export const K8S_APP_UID = 10001;

/**
 * The restored database must be the exported bytes, carry the same migration set and row counts,
 * and belong to the backend's UID.
 */
export function assertRestoredMatches(exported: SqliteReport, restored: SqliteReport): void {
  assertExportSound(restored);
  const problems: string[] = [];
  // Proof: cutover.test.ts `… refuses a restore with different bytes`; with this comparison
  // removed only the row-count difference was reported, never the changed bytes.
  if (restored.sha256 !== exported.sha256) {
    problems.push(`sha256 ${restored.sha256} is not the export's ${exported.sha256}`);
  }
  if (JSON.stringify(restored.migrations) !== JSON.stringify(exported.migrations)) {
    problems.push(`migrations [${restored.migrations.join(', ')}] differ from the export's`);
  }
  if (JSON.stringify(restored.counts) !== JSON.stringify(exported.counts)) {
    problems.push(
      `row counts ${JSON.stringify(restored.counts)} differ from ${JSON.stringify(exported.counts)}`,
    );
  }
  // Proof: cutover.test.ts `refuses a restored database the backend UID does not own` passed a
  // root-owned restore with this check removed.
  if (restored.ownerUid !== K8S_APP_UID) {
    problems.push(`owner uid ${String(restored.ownerUid)} is not ${String(K8S_APP_UID)}`);
  }
  if (problems.length > 0) {
    throw new Error(`restored ${restored.path} does not match the export: ${problems.join('; ')}`);
  }
}

/**
 * The restore Job's command (`bun -e`). It waits for the operator to copy the export in, refuses
 * to overwrite an existing database, verifies the copied bytes against `PUNI_EXPORT_SHA256`,
 * renames the file into place, and prints the {@link SQLITE_REPORT_SCRIPT} report.
 */
export const RESTORE_SCRIPT = String.raw`
const fs = require('node:fs');
const crypto = require('node:crypto');
const incoming = '/data/cutover-incoming.sqlite';
const done = '/data/cutover-incoming.done';
const target = process.env.PUNI_DB;
const expected = process.env.PUNI_EXPORT_SHA256;
if (fs.existsSync(target)) throw new Error(target + ' already exists; refusing to overwrite it');
const deadline = Date.now() + Number(process.env.PUNI_WAIT_MS || '600000');
while (!fs.existsSync(done)) {
  if (Date.now() > deadline) throw new Error('no export arrived at ' + incoming);
  Bun.sleepSync(500);
}
const actual = crypto.createHash('sha256').update(fs.readFileSync(incoming)).digest('hex');
if (actual !== expected) throw new Error('copied export is ' + actual + ', not ' + expected);
fs.renameSync(incoming, target);
fs.rmSync(done);
`;

/**
 * The site context for the old Compose edge while the move runs: API reads still reach be-01,
 * every mutating API request and every WebSocket (edits travel over gw-01) gets a 503.
 * `backend` and `frontend` are `container:port` upstreams, as the swap renders them.
 */
export function fencedSiteContext(
  siteAddress: string,
  backend: string,
  frontend: string,
): Record<string, string> {
  return {
    SITE_ADDRESS: siteAddress,
    MCP_ROUTES: '',
    // `respond` sorts before `reverse_proxy` inside a handle block, so writes stop here.
    BE_ROUTE: [
      '@write not method GET HEAD OPTIONS',
      '\t\trespond @write "WBS is moving; writes are closed" 503',
      `\t\treverse_proxy ${backend}`,
    ].join('\n'),
    GW_ROUTE: 'respond "WBS is moving; live editing is closed" 503',
    FE_ROUTE: `reverse_proxy ${frontend}`,
  };
}

/**
 * The old side's consistent export: the release's own backend image, no network, the stopped
 * writer's data directory, and a fresh export directory. Stdout carries the report.
 */
export function exportArgv(
  image: string,
  dataDirectory: string,
  databaseName: string,
  exportDirectory: string,
  known: readonly string[],
): string[] {
  return [
    'docker',
    'run',
    '--rm',
    '--network',
    'none',
    '-v',
    `${dataDirectory}:/data`,
    '-v',
    `${exportDirectory}:/export`,
    '-e',
    `PUNI_DB=/data/${databaseName}`,
    '-e',
    'PUNI_EXPORT=/export/wbs-export.sqlite',
    '-e',
    `PUNI_KNOWN=${JSON.stringify(known)}`,
    '--entrypoint',
    'bun',
    image,
    '-e',
    SQLITE_REPORT_SCRIPT,
  ];
}

/**
 * The new side's restore Job: a writer-labelled backend task (F6 admission, single-writer
 * guard) that waits for the export, verifies its SHA-256, moves it to `/data/wbs.sqlite` and
 * reports on the result. `task` stands in for `backendTaskJob` so this module stays pure.
 */
export function restoreCommand(): string[] {
  return ['bun', '-e', `{${RESTORE_SCRIPT}}\n{${SQLITE_REPORT_SCRIPT}}`];
}

export function restoreEnvironment(
  exportSha256: string,
  known: readonly string[],
): Record<string, string> {
  return {
    PUNI_DB: '/data/wbs.sqlite',
    PUNI_EXPORT_SHA256: exportSha256,
    PUNI_KNOWN: JSON.stringify(known),
  };
}
