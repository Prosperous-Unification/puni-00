import type { Database } from 'bun:sqlite';

/** A preservation observation grants no activation or participant exclusion authority. */
export interface DormantDependencyStore {
  readonly protocol: 'wbs-dependency-preservation';
  readonly version: 1;
  readonly state: 'DISABLED';
  readonly externalRelationships: 0;
}

/** Coordinator-owned, self-contained authority inspection, independent of image application code.
 * Historical stores without both authority migrations refuse; missing authority is never DISABLED.
 * Ledger hashes are identities only: migration capture still compares them to artifact bytes.
 */
export function inspectDormantDependencies(db: Database): DormantDependencyStore {
  const schemas = {
    cross_project_dependency_activation:
      "CREATE TABLE cross_project_dependency_activation (\n id INTEGER PRIMARY KEY NOT NULL CONSTRAINT \"external dependencies precede activation authority\" CHECK (id = 1),\n state TEXT NOT NULL CHECK (state IN ('DISABLED','ENABLED'))\n)",
    cross_project_dependency_activation_receipt:
      'CREATE TABLE cross_project_dependency_activation_receipt (\n id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),\n receipt TEXT NOT NULL CHECK (json_valid(receipt))\n)',
  };
  // Proof: removing the real-table guard admitted ledger-view through the generated command (2026-10-22).
  for (const name of ['__drizzle_migrations', 'external_dependency', ...Object.keys(schemas)]) {
    if (db.query("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name) === null)
      throw new Error(
        `dependency authority requires real table ${name}; historical stores require an explicit compatibility adapter`,
      );
  }
  const ledger = db
    .query<{ name: unknown; hash: unknown }, []>('SELECT name,hash FROM __drizzle_migrations')
    .all();
  const names = new Set<string>();
  // Proof: removing identity validation admitted duplicate-ledger, malformed-hash, blank-name and null-hash fixtures.
  for (const entry of ledger) {
    if (
      typeof entry.name !== 'string' ||
      entry.name.trim() === '' ||
      names.has(entry.name) ||
      typeof entry.hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.hash)
    )
      throw new Error('invalid dependency migration ledger identity');
    names.add(entry.name);
  }
  for (const name of [
    '20261022211000_add_external_dependencies',
    '20261022212000_add_cross_project_dependency_activation',
  ]) {
    // Proof: removing membership admitted independently missing authority and relationship migration identities.
    if (!names.has(name)) throw new Error(`missing dependency migration ${name}`);
  }
  // Proof: removing schema equality admitted marker-schema and receipt-schema through the generated command.
  for (const [name, expected] of Object.entries(schemas)) {
    const schema = db
      .query<{ sql: unknown }, [string]>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get(name);
    if (
      typeof schema?.sql !== 'string' ||
      schema.sql.replace(/\s+/g, ' ').trim() !== expected.replace(/\s+/g, ' ').trim()
    )
      throw new Error(`invalid dependency authority schema ${name}`);
  }
  for (const action of ['insert', 'update', 'delete']) {
    const expected = `CREATE TRIGGER external_dependency_admit_${action}
BEFORE ${action.toUpperCase()} ON external_dependency
WHEN (SELECT count(*) FROM cross_project_dependency_activation) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_project_dependency_activation WHERE id = 1 AND state = 'ENABLED')
 OR (SELECT count(*) FROM cross_project_dependency_activation_receipt) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_project_dependency_activation_receipt WHERE id = 1 AND json_valid(receipt) AND json_extract(receipt,'$.protocol') = 'wbs-dependency-activation' AND json_type(receipt,'$.version') IN ('integer','real') AND json_extract(receipt,'$.version') = 1)
BEGIN
 SELECT RAISE(ABORT, 'external_dependencies_inactive');
END`;
    const trigger = db
      .query<{ sql: unknown }, [string]>(
        "SELECT sql FROM sqlite_master WHERE type='trigger' AND tbl_name='external_dependency' AND name=?",
      )
      .get(`external_dependency_admit_${action}`);
    // Proof: skipping each action independently admitted its missing/altered/numeric-version trigger faults.
    if (typeof trigger?.sql !== 'string' || trigger.sql.trim().replace(/;$/, '') !== expected)
      throw new Error(`invalid dependency admission trigger ${action}`);
  }
  const markers = db
    .query<{ id: unknown; state: unknown }, []>(
      'SELECT id,state FROM cross_project_dependency_activation',
    )
    .all();
  // Proof: removing this guard admitted enabled-empty, absent marker, wrong-id and unknown-state fixtures.
  if (markers.length !== 1 || markers[0]?.id !== 1 || markers[0].state !== 'DISABLED')
    throw new Error(
      'dependency preservation requires exact DISABLED authority; ENABLED requires compatible attended recovery',
    );
  // Proof: removing receipt absence admitted disabled authority retaining a receipt.
  if (db.query('SELECT id FROM cross_project_dependency_activation_receipt').all().length !== 0)
    throw new Error('disabled dependency authority retains activation receipt');
  // Proof: removing edge absence admitted retained relationships with all exact admission triggers restored.
  if (db.query('SELECT id FROM external_dependency LIMIT 1').get() !== null)
    throw new Error('disabled dependency authority retains external relationships');
  return {
    protocol: 'wbs-dependency-preservation',
    version: 1,
    state: 'DISABLED',
    externalRelationships: 0,
  };
}

/** Uses only coordinator code and bun:sqlite, never the image's activation CLI. */
export function buildDependencyInventoryCommand(): string[] {
  return [
    'bun',
    '-e',
    `import { Database } from 'bun:sqlite';
const path = process.env.DB_PATH;
// Proof: removing this guard lost the generated scanner's explicit missing-DB_PATH diagnostic.
if (!path) throw new Error('DB_PATH must be set');
// Proof: replacing this opening policy with readonly:false/create:true admitted the injected authority write.
const db = new Database(path, {readonly:true,create:false});
try { process.stdout.write(JSON.stringify((${inspectDormantDependencies.toString()})(db))); }
finally { db.close(); }`,
  ];
}

/** Closed subprocess boundary; malformed or non-dormant output throws. */
export function decodeDormantDependencies(output: string): DormantDependencyStore {
  const observation: unknown = JSON.parse(output);
  // Proof: removing closed decoding admitted malformed object/key/version/state/count transport fixtures.
  if (
    typeof observation !== 'object' ||
    observation === null ||
    Array.isArray(observation) ||
    Object.keys(observation).sort().join(',') !== 'externalRelationships,protocol,state,version' ||
    !('protocol' in observation) ||
    observation.protocol !== 'wbs-dependency-preservation' ||
    !('version' in observation) ||
    observation.version !== 1 ||
    !('state' in observation) ||
    observation.state !== 'DISABLED' ||
    !('externalRelationships' in observation) ||
    observation.externalRelationships !== 0
  )
    throw new Error('invalid dormant dependency observation');
  return {
    protocol: 'wbs-dependency-preservation',
    version: 1,
    state: 'DISABLED',
    externalRelationships: 0,
  };
}
