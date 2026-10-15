import type { Database } from 'bun:sqlite';

/**
 * Coordinator-owned read-only authority inventory, embedded in both deployment transports.
 * ENABLED is a durable compatibility obligation even with zero blockage facts.
 * No image application decoder supplies this observation. Pre-receipt DISABLED is compatible.
 * See docs/runbook-prod-deploy.md#step-blockage-writer-activation.
 */
export function inventoryStepBlockageActivation(db: Database): { kind: string; count: number }[] {
  const migration = '20261014140000_add_step_blockage_activation';
  const receiptMigration = '20261015100000_add_step_blockage_activation_receipt';
  // Proof: both generated inventory commands admitted a substituted ledger view before this guard.
  if (
    db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
      .get() === null
  )
    throw new Error('step blockage migration ledger is missing or malformed');
  const ledger = db.query<{ name: unknown }, []>('SELECT name FROM __drizzle_migrations').all();
  // Proof: malformed-ledger production negatives lost their named diagnostic before this validation.
  if (ledger.some((entry) => typeof entry.name !== 'string' || entry.name.trim() === ''))
    throw new Error('step blockage migration ledger is malformed');
  const objects = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE name IN ('step_blockage_activation','step_blockage_activation_receipt','step_blockage_admit_insert','step_blockage_admit_update','step_blockage_admit_delete')",
    )
    .all();
  // Proof: bypassing object absence admitted marker/receipt table/views and all three orphan triggers; bypassing receipt-ledger absence admitted its orphan row in both transports.
  if (ledger.every((entry) => entry.name !== migration)) {
    if (objects.length !== 0 || ledger.some((entry) => entry.name === receiptMigration))
      throw new Error('incoherent pre-marker step blockage authority');
    return [];
  }
  // Proof: before this guard, both production transports admitted missing-ledger authority.
  if (ledger.filter((entry) => entry.name === migration).length !== 1)
    throw new Error('missing step blockage activation migration');
  // Proof: both transports admitted a view substituted for migrated marker authority before this guard.
  if (
    db
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='step_blockage_activation'",
      )
      .get() === null
  )
    throw new Error('invalid step blockage activation table');
  const markers = db
    .query<{ id: unknown; state: unknown }, []>('SELECT id,state FROM step_blockage_activation')
    .all();
  const marker = markers.at(0);
  // Proof: before this guard, both production transports admitted missing-marker and wrong-marker authority.
  if (
    markers.length !== 1 ||
    marker?.id !== 1 ||
    (marker.state !== 'DISABLED' && marker.state !== 'ENABLED')
  )
    throw new Error('invalid step blockage activation marker');
  for (const action of ['insert', 'update', 'delete']) {
    const expected = `CREATE TRIGGER step_blockage_admit_${action}
BEFORE ${action.toUpperCase()} ON step_blockage
WHEN (SELECT count(*) FROM step_blockage_activation) <> 1
  OR NOT EXISTS (SELECT 1 FROM step_blockage_activation WHERE id = 1 AND state = 'ENABLED')
BEGIN
  SELECT RAISE(ABORT, 'step_blockage_inactive');
END`;
    const trigger = db
      .query<{ sql: unknown }, [string]>(
        "SELECT sql FROM sqlite_master WHERE type='trigger' AND tbl_name='step_blockage' AND name=?",
      )
      .get(`step_blockage_admit_${action}`);
    // Proof: before this guard, missing-trigger and altered-trigger production command negatives returned success.
    if (typeof trigger?.sql !== 'string' || trigger.sql.trim().replace(/;$/, '') !== expected)
      throw new Error('invalid step blockage activation triggers');
  }
  const recorded = ledger.filter((entry) => entry.name === receiptMigration).length;
  const schema = db
    .query<{ type: unknown; sql: unknown }, []>(
      "SELECT type,sql FROM sqlite_master WHERE name='step_blockage_activation_receipt'",
    )
    .get();
  if (recorded === 0 && schema === null && marker.state === 'DISABLED') return [];
  // Proof: before this guard, production inventory admitted missing-receipt and weakened-receipt schemas.
  if (
    recorded !== 1 ||
    schema?.type !== 'table' ||
    typeof schema.sql !== 'string' ||
    schema.sql.replace(/\s+/g, ' ').trim() !==
      'CREATE TABLE step_blockage_activation_receipt ( id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), receipt TEXT NOT NULL CHECK (json_valid(receipt)) )'
  )
    throw new Error('invalid step blockage receipt schema or migration');
  const receipts = db
    .query<{ id: unknown; receipt: unknown }, []>(
      'SELECT id,receipt FROM step_blockage_activation_receipt',
    )
    .all();
  if (marker.state === 'DISABLED') {
    // Proof: before this guard, disabled-receipt production inventory returned success.
    if (receipts.length !== 0) throw new Error('disabled step blockage authority has a receipt');
    return [];
  }
  const stored = receipts.at(0);
  // Proof: before this guard, enabled-no-receipt production inventory advertised compatibility without attributable authority.
  if (receipts.length !== 1 || stored?.id !== 1 || typeof stored.receipt !== 'string')
    throw new Error('enabled step blockage authority has no exact receipt');
  const receipt: unknown = JSON.parse(stored.receipt);
  const keys = [
    'protocol',
    'version',
    'activationId',
    'candidateImage',
    'rollbackImage',
    'databaseIdentity',
    'activatedAt',
  ];
  const image = /^[^\s@]+@sha256:[0-9a-f]{64}$/;
  // Proof: before this guard, malformed-receipt production inventory accepted {}.
  if (
    typeof receipt !== 'object' ||
    receipt === null ||
    Array.isArray(receipt) ||
    Object.keys(receipt).length !== keys.length
  )
    throw new Error('invalid step blockage activation receipt');
  // Boundary: object shape above permits unknown field inspection; no receipt fields are trusted yet.
  const fields = receipt as Record<string, unknown>;
  // Proof: protocol/version, identity type/emptiness, digest/type and time bounds removed independently; the named invalid-receipt-field negatives failed in both transports.
  if (
    fields['protocol'] !== 'step-blockage-activation' ||
    fields['version'] !== 1 ||
    typeof fields['activationId'] !== 'string' ||
    fields['activationId'].trim() === '' ||
    typeof fields['databaseIdentity'] !== 'string' ||
    fields['databaseIdentity'].trim() === '' ||
    typeof fields['candidateImage'] !== 'string' ||
    !image.test(fields['candidateImage']) ||
    typeof fields['rollbackImage'] !== 'string' ||
    !image.test(fields['rollbackImage']) ||
    typeof fields['activatedAt'] !== 'number' ||
    !Number.isSafeInteger(fields['activatedAt']) ||
    fields['activatedAt'] < 0
  )
    throw new Error('invalid step blockage activation receipt');
  // Proof: removing each transport's activation contribution lost ENABLED-empty despite valid receipt authority.
  return [{ kind: 'step_blockage_activation_v1', count: 1 }];
}
