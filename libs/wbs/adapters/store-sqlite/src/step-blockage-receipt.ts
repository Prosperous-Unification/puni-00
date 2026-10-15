import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import { readStepBlockageActivation } from './step-blockage-activation';

const MIGRATION = '20261015100000_add_step_blockage_activation_receipt';
const SCHEMA =
  'CREATE TABLE step_blockage_activation_receipt ( id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), receipt TEXT NOT NULL CHECK (json_valid(receipt)) )';
const IMAGE = /^[^\s@]+@sha256:[0-9a-f]{64}$/;
const KEYS = [
  'protocol',
  'version',
  'activationId',
  'candidateImage',
  'rollbackImage',
  'databaseIdentity',
  'activatedAt',
];

/** Exact identity supplied by the fenced host coordinator, never synthesized by application boot. */
export interface StepBlockageReceipt {
  protocol: 'step-blockage-activation';
  version: 1;
  activationId: string;
  candidateImage: string;
  rollbackImage: string;
  databaseIdentity: string;
  activatedAt: number;
}

/** A disabled database has no attributed activation; enabled always carries its exact receipt. */
export type StepBlockageReceiptInspection =
  { state: 'DISABLED'; receipt: null } | { state: 'ENABLED'; receipt: StepBlockageReceipt };

/** Validates the receipt boundary once and returns fields in canonical persistence order. */
export function parseStepBlockageReceipt(receipt: unknown): StepBlockageReceipt {
  // Proof: protocol/version/key-set, empty identities, both digest checks and each time bound were removed separately; their invalid-receipt negatives then accepted the injected field.
  if (
    typeof receipt !== 'object' ||
    receipt === null ||
    Array.isArray(receipt) ||
    Object.keys(receipt).length !== KEYS.length ||
    Object.keys(receipt).some((key) => !KEYS.includes(key)) ||
    !('protocol' in receipt) ||
    receipt.protocol !== 'step-blockage-activation' ||
    !('version' in receipt) ||
    receipt.version !== 1 ||
    !('activationId' in receipt) ||
    typeof receipt.activationId !== 'string' ||
    receipt.activationId.trim() === '' ||
    !('candidateImage' in receipt) ||
    typeof receipt.candidateImage !== 'string' ||
    !IMAGE.test(receipt.candidateImage) ||
    !('rollbackImage' in receipt) ||
    typeof receipt.rollbackImage !== 'string' ||
    !IMAGE.test(receipt.rollbackImage) ||
    !('databaseIdentity' in receipt) ||
    typeof receipt.databaseIdentity !== 'string' ||
    receipt.databaseIdentity.trim() === '' ||
    !('activatedAt' in receipt) ||
    typeof receipt.activatedAt !== 'number' ||
    !Number.isSafeInteger(receipt.activatedAt) ||
    receipt.activatedAt < 0
  )
    throw new Error('invalid step blockage activation receipt');
  return {
    protocol: receipt.protocol,
    version: receipt.version,
    activationId: receipt.activationId,
    candidateImage: receipt.candidateImage,
    rollbackImage: receipt.rollbackImage,
    databaseIdentity: receipt.databaseIdentity,
    activatedAt: receipt.activatedAt,
  };
}

/**
 * Reads validated authority without writes. Legacy ENABLED without a receipt is ambiguous and throws.
 * Checks the exact constrained receipt table before reading even an empty table.
 * Missing/unreadable migration, marker, trigger or receipt authority throws.
 */
export function inspectStepBlockageReceipt(db: Drizzle): StepBlockageReceiptInspection {
  const state = readStepBlockageActivation(db);
  const ledger = db.all(sql`SELECT name FROM __drizzle_migrations WHERE name = ${MIGRATION}`);
  // Proof: omitting the ledger check admitted missing-receipt-ledger authority through inspect.
  if (ledger.length !== 1) throw new Error('missing step blockage receipt migration');
  const schemas = db.all<{ sql: unknown }>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='step_blockage_activation_receipt'",
  );
  const definition = schemas.at(0)?.sql;
  // Proof: removing this check admitted 13 empty-table/view DB and CLI negatives, including activation committing ENABLED with no constraints (2026-10-15).
  if (
    schemas.length !== 1 ||
    typeof definition !== 'string' ||
    definition.replace(/\s+/g, ' ').trim() !== SCHEMA
  )
    throw new Error('invalid step blockage receipt schema');
  const receipts = db.all<{ id: unknown; receipt: unknown }>(
    'SELECT id,receipt FROM step_blockage_activation_receipt',
  );
  if (state === 'DISABLED') {
    // Proof: omitting the receipt count let inspect accept disabled-with-receipt authority.
    if (receipts.length !== 0) throw new Error('disabled step blockage authority has a receipt');
    return { state, receipt: null };
  }
  const stored = receipts.at(0);
  // Proof: count/id/type guards removed separately; duplicate, wrong-id and nonstring row negatives lost their required authority diagnostic.
  if (receipts.length !== 1 || stored?.id !== 1 || typeof stored.receipt !== 'string')
    throw new Error('enabled step blockage authority has no exact receipt');
  const parsed = parseStepBlockageReceipt(JSON.parse(stored.receipt));
  return { state, receipt: parsed };
}

/**
 * Atomically admits writers with their exact receipt under SQLite's write lock.
 * Identical retries return durable authority; conflicting attempts throw. No disable exists.
 * The caller must establish stopped writers and independently admit both immutable images.
 * See docs/runbook-prod-deploy.md#step-blockage-writer-activation.
 */
export function activateStepBlockages(
  db: Drizzle,
  receipt: StepBlockageReceipt,
): StepBlockageReceiptInspection {
  // Proof: removing transaction controls left ENABLED after the injected receipt-insert failure.
  db.run('BEGIN IMMEDIATE');
  try {
    const authority = inspectStepBlockageReceipt(db);
    if (authority.state === 'ENABLED') {
      // Proof: omitting equality admitted a different activationId in the exact-retry negative.
      if (JSON.stringify(authority.receipt) !== JSON.stringify(receipt, KEYS))
        throw new Error('conflicting step blockage activation receipt');
      db.run('COMMIT');
      return authority;
    }
    db.run("UPDATE step_blockage_activation SET state='ENABLED' WHERE id=1 AND state='DISABLED'");
    db.run(
      sql`INSERT INTO step_blockage_activation_receipt (id,receipt) VALUES (1,${JSON.stringify(receipt, KEYS)})`,
    );
    const admitted = inspectStepBlockageReceipt(db);
    // Proof: removing this comparison let change_receipt commit an altered activationId in the persisted-receipt negative.
    if (
      admitted.state !== 'ENABLED' ||
      JSON.stringify(admitted.receipt) !== JSON.stringify(receipt, KEYS)
    )
      throw new Error('activation receipt readback differs');
    db.run('COMMIT');
    return admitted;
  } catch (cause) {
    db.run('ROLLBACK');
    throw cause;
  }
}
