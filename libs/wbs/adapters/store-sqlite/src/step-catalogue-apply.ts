import {
  classifyStepMigration,
  type MigrationStep,
  type StepMigrationCapture,
  type StepMigrationIssue,
} from '@wbs/domain';
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';

import { type Connection, type Drizzle, openExistingConnection } from './db';
import { readMigrationFolders } from './migrate-down';
import type { AppliedMigrationIdentity } from './migration-set';
import {
  parseStepMergeRules,
  type StepMergeRules,
  validateStepMergeRules,
} from './step-catalogue-report';
import { captureStepMigration } from './step-catalogue-report-capture';
import { assertWindowBackup, type WindowVerificationRequest } from './window-backup';

const CATALOGUE = '20261115130000_add_step_catalogue';

/** Retained inputs to the private persistence writer; window evidence is never process authority. */
export interface StepCatalogueApplyRequest {
  readonly window: WindowVerificationRequest;
  readonly rulesJson: string;
  /** Caller-retained ISO application time for the existing TEXT ledger field, not folder created_at. */
  readonly appliedAt: string;
}

interface ApplyFailure {
  readonly phase: 'operation' | 'rollback' | 'foreign-keys' | 'close';
  readonly cause: unknown;
}

/** A failed control/close retains its actual closure without trusting mutable aggregate diagnostics. */
const uncertainConnections = new WeakMap<object, Connection>();

function readLedger(db: Drizzle): readonly { name: unknown; hash: unknown }[] {
  return db.all<{ name: unknown; hash: unknown }>(
    'SELECT name,hash FROM __drizzle_migrations ORDER BY name COLLATE BINARY',
  );
}

function isSameLedger(
  actual: readonly { name: unknown; hash: unknown }[],
  expected: readonly AppliedMigrationIdentity[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((row, index) => {
      const identity = expected.at(index);
      return identity !== undefined && row.name === identity.name && row.hash === identity.hash;
    })
  );
}

function orderLedger(identities: readonly AppliedMigrationIdentity[]): AppliedMigrationIdentity[] {
  return identities
    .map(({ name, hash }) => ({ name, hash }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

/** Complete direct old-to-survivor decisions from this writer's already validated fresh capture. */
function planStepIdentities(
  capture: StepMigrationCapture,
  rules: StepMergeRules,
  issues: readonly StepMigrationIssue[],
): ReadonlyMap<string, string> {
  const organizations: Partial<StepMergeRules['organizations']> = rules.organizations;
  const identities = new Map(capture.steps.map(({ id }) => [id, id]));
  for (const issue of issues) {
    if (issue.kind === 'shared_code_identical') {
      for (const id of issue.stepIds) identities.set(id, issue.survivorStepId);
    } else if (issue.kind === 'shared_code') {
      const chosen = organizations[issue.organizationId]?.codes[issue.code];
      if (chosen === undefined)
        throw new Error('step catalogue writer has no validated survivor for ' + issue.code);
      for (const step of issue.steps) identities.set(step.id, chosen.survivorStepId);
    } else if (issue.kind !== 'uncoded') {
      throw new Error('step catalogue unresolved apply issue: ' + issue.kind);
    }
  }
  return identities;
}

/** Existing codes stay exact; a NULL code requires its fresh, exact operator confirmation, never derivation here. */
function resolveStepCode(step: MigrationStep, rules: StepMergeRules): string {
  if (step.code !== null) return step.code;
  const organizations: Partial<StepMergeRules['organizations']> = rules.organizations;
  const confirmation = organizations[step.organizationId]?.uncoded[step.id];
  if (confirmation === undefined)
    throw new Error('step catalogue writer has no validated uncoded confirmation for ' + step.id);
  return confirmation.code;
}

/** Reads the participating UPDATE trigger before any temporary suspension; missing trusted schema refuses. */
function readMeasureMirror(db: Drizzle): string {
  const mirror = db.get<{ sql: unknown } | undefined>(
    "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='step_measure_mirrors_token_estimate_update'",
  );
  if (typeof mirror?.sql !== 'string' || mirror.sql.trim().length === 0)
    throw new Error('step catalogue measure UPDATE mirror is absent or malformed');
  return mirror.sql;
}

/**
 * Private ruled-merge and confirmed-code persistence increment, absent from public barrels, CLI and boot.
 * Retains parsed rules and exact migration statements before acquiring one existing-file writer.
 * Existing E37 readonly evidence owners settle first; they establish no E36 session authority.
 * Fresh capture/rule validation, complete identity map, SQL and ledger share one IMMEDIATE transaction.
 * Project bindings retain each scope; package overrides and historical bytes remain source-owned.
 * No report refresh, nested migrator/transaction, prior-step rewrite or public activation is performed.
 * Every successful acquisition gets one close attempt; operation/rollback/FK-restore/close unknowns
 * remain ordered, including a thrown undefined. An uncertain cleanup retains the actual connection.
 * @returns the detached complete post-apply name/hash ledger after commit, FK restoration and close.
 * @throws on failed evidence, stale rules/ledger, unresolved report issues, SQL or cleanup failure.
 */
export function applyStepCatalogue(
  request: StepCatalogueApplyRequest,
): readonly AppliedMigrationIdentity[] {
  const window = { ...request.window };
  const rules = parseStepMergeRules(request.rulesJson);
  const appliedAt = request.appliedAt;
  const mergedAt = Date.parse(appliedAt);
  if (!Number.isSafeInteger(mergedAt))
    throw new Error('step catalogue application instant is not a valid millisecond timestamp');
  const folders = readMigrationFolders(window.migrationsFolder);
  const migration = readMigrationFiles({ migrationsFolder: window.migrationsFolder }).find(
    (folder) => folder.name === CATALOGUE,
  );
  const paired = folders.find((folder) => folder.name === CATALOGUE);
  if (migration === undefined || migration.hash !== paired?.hash)
    throw new Error('step catalogue exact migration/down pair is absent or changed');
  // Retained library statements and folderMillis match the installed Drizzle SQL/hash/ledger contract.
  const statements = [...migration.sql];
  const backup = assertWindowBackup(window);
  const baseline = orderLedger(backup.migrations);
  const complete = orderLedger([...baseline, { name: migration.name, hash: migration.hash }]);
  const connection = openExistingConnection(window.sourcePath);
  const db = connection.db;
  let transactionState:
    | 'none'
    | 'begin-entered'
    | 'active'
    | 'commit-entered'
    | 'committed'
    | 'rolled-back'
    | 'unknown' = 'none';
  const cleanup: ApplyFailure[] = [];
  let outcome: { ok: true; ledger: AppliedMigrationIdentity[] } | { ok: false; cause: unknown };
  try {
    db.run('PRAGMA foreign_keys=OFF');
    if (db.get<{ foreign_keys: unknown } | undefined>('PRAGMA foreign_keys')?.foreign_keys !== 0)
      throw new Error('step catalogue writer requires foreign_keys=OFF before BEGIN');
    transactionState = 'begin-entered';
    db.run(sql.raw('BEGIN IMMEDIATE'));
    transactionState = 'active';
    if (!isSameLedger(readLedger(db), baseline))
      throw new Error('step catalogue writer ledger differs from verified backup');
    const applied = new Set(baseline.map(({ name }) => name));
    const pending = folders.filter(({ name }) => !applied.has(name));
    if (pending.length !== 1 || pending[0]?.name !== CATALOGUE)
      throw new Error('step catalogue writer requires exactly its catalogue migration pending');
    const capture = captureStepMigration(db);
    validateStepMergeRules(capture, rules);
    const identities = planStepIdentities(capture, rules, classifyStepMigration(capture));
    db.run(
      "CREATE TEMP TABLE _catalogue_merge(old_step_id TEXT PRIMARY KEY NOT NULL,survivor_step_id TEXT NOT NULL,resolved_code TEXT NOT NULL CHECK(length(resolved_code)>0),merged_at INTEGER NOT NULL CHECK(typeof(merged_at)='integer'))",
    );
    for (const step of capture.steps) {
      const survivorStepId = identities.get(step.id);
      if (survivorStepId === undefined)
        throw new Error('step catalogue writer lost captured identity ' + step.id);
      const code = resolveStepCode(step, rules);
      db.run(
        sql`INSERT INTO _catalogue_merge(old_step_id,survivor_step_id,resolved_code,merged_at) VALUES(${step.id},${survivorStepId},${code},${mergedAt})`,
      );
    }
    const hasMerges = [...identities].some(
      ([oldStepId, survivorStepId]) => oldStepId !== survivorStepId,
    );
    // Proof: forcing measureMirror to null (skipping both suspension and restoration) made
    // "preserves actual token estimate mirror metadata and exact trigger SQL through ruled catalogue merges"
    // fail at fact-row equality: measure_estimate.updated_at became 11 instead of retained 102.
    // The two-case baseline passed; the same selected case passed on original correct source afterward.
    // This observes the coupled suspension protocol, not independent restoration or general custody.
    const measureMirror = hasMerges ? readMeasureMirror(db) : null;
    if (measureMirror !== null) db.run('DROP TRIGGER step_measure_mirrors_token_estimate_update');
    for (const statement of statements) db.run(sql.raw(statement));
    if (measureMirror !== null) db.run(sql.raw(measureMirror));
    db.run(sql`INSERT INTO __drizzle_migrations(hash,created_at,name,applied_at)
      VALUES(${migration.hash},${migration.folderMillis},${migration.name},${appliedAt})`);
    if (!isSameLedger(readLedger(db), complete))
      throw new Error('step catalogue writer post-ledger differs from expected complete set');
    transactionState = 'commit-entered';
    db.run(sql.raw('COMMIT'));
    transactionState = 'committed';
    outcome = { ok: true, ledger: complete };
  } catch (cause: unknown) {
    outcome = { ok: false, cause };
  }
  if (
    transactionState === 'begin-entered' ||
    transactionState === 'active' ||
    transactionState === 'commit-entered'
  ) {
    try {
      db.run(sql.raw('ROLLBACK'));
      transactionState = 'rolled-back';
    } catch (cause: unknown) {
      cleanup.push({ phase: 'rollback', cause });
    }
  }
  try {
    db.run('PRAGMA foreign_keys=ON');
    if (db.get<{ foreign_keys: unknown } | undefined>('PRAGMA foreign_keys')?.foreign_keys !== 1)
      throw new Error('step catalogue writer failed to restore foreign_keys=ON');
  } catch (cause: unknown) {
    cleanup.push({ phase: 'foreign-keys', cause });
  }
  try {
    connection.close();
  } catch (cause: unknown) {
    cleanup.push({ phase: 'close', cause });
  }
  if (cleanup.length !== 0) {
    const failures: readonly ApplyFailure[] = outcome.ok
      ? cleanup
      : [{ phase: 'operation', cause: outcome.cause }, ...cleanup];
    const failure = new AggregateError(
      failures.map(({ cause }) => cause),
      'step catalogue operation/cleanup failed',
      { cause: failures[0]?.cause },
    );
    Object.defineProperty(failure, 'failures', {
      value: Object.freeze(failures.map((entry) => Object.freeze({ ...entry }))),
      enumerable: true,
    });
    uncertainConnections.set(failure, connection);
    throw failure;
  }
  if (!outcome.ok) throw outcome.cause;
  return outcome.ledger;
}
