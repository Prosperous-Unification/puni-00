import type {
  RuntimeAuthority,
  RuntimeClaim,
  RuntimeCommandStore,
  RuntimeLedger,
  RuntimeScope,
  StoredRuntimeAcceptance,
} from '@wbs/core';
import {
  parseRuntimeAuthority,
  parseRuntimeClaim,
  parseRuntimeLedger,
  parseRuntimeScope,
  parseStoredRuntimeAcceptance,
} from '@wbs/core/ports/runtime-command-records';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import type { Gate } from './gate';

const MIGRATION = '20261022121000_add_runtime_commands';
const REQUIRED_SCHEMA: Readonly<Record<string, string>> = {
  runtime_ledger:
    "CREATE TABLE runtime_ledger (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1), schema_version INTEGER NOT NULL CHECK (schema_version = 1), ledger_id TEXT NOT NULL CHECK (length(ledger_id) > 0), authority_count INTEGER NOT NULL CHECK (typeof(authority_count) = 'integer' AND authority_count BETWEEN 0 AND 9007199254740991), binding_count INTEGER NOT NULL CHECK (typeof(binding_count) = 'integer' AND binding_count BETWEEN 0 AND 9007199254740991), receipt_count INTEGER NOT NULL CHECK (typeof(receipt_count) = 'integer' AND receipt_count BETWEEN 0 AND 9007199254740991))",
  runtime_authority:
    "CREATE TABLE runtime_authority (organization_id TEXT NOT NULL CHECK (length(organization_id) > 0), project_id TEXT NOT NULL CHECK (length(project_id) > 0), person_id TEXT NOT NULL CHECK (length(person_id) > 0), owner_id TEXT NOT NULL CHECK (length(owner_id) > 0), generation INTEGER NOT NULL CHECK (typeof(generation) = 'integer' AND generation BETWEEN 1 AND 9007199254740991), PRIMARY KEY (organization_id, project_id, person_id))",
  runtime_claim_binding:
    'CREATE TABLE runtime_claim_binding (organization_id TEXT NOT NULL CHECK (length(organization_id) > 0), project_id TEXT NOT NULL CHECK (length(project_id) > 0), person_id TEXT NOT NULL CHECK (length(person_id) > 0), claim_id TEXT NOT NULL CHECK (length(claim_id) > 0), store_id TEXT NOT NULL CHECK (length(store_id) > 0), attempt_id TEXT NOT NULL CHECK (length(attempt_id) > 0), binding TEXT NOT NULL CHECK (json_valid(binding)), PRIMARY KEY (organization_id, project_id, person_id, claim_id), UNIQUE (organization_id, project_id, person_id, store_id, attempt_id))',
  runtime_command_receipt:
    'CREATE TABLE runtime_command_receipt (organization_id TEXT NOT NULL CHECK (length(organization_id) > 0), project_id TEXT NOT NULL CHECK (length(project_id) > 0), person_id TEXT NOT NULL CHECK (length(person_id) > 0), command_id TEXT NOT NULL CHECK (length(command_id) > 0), accepted TEXT NOT NULL CHECK (json_valid(accepted)), PRIMARY KEY (organization_id, project_id, person_id, command_id))',
  runtime_ledger_no_delete:
    "CREATE TRIGGER runtime_ledger_no_delete BEFORE DELETE ON runtime_ledger BEGIN SELECT RAISE(ABORT, 'runtime history is immutable'); END",
  runtime_authority_no_delete:
    "CREATE TRIGGER runtime_authority_no_delete BEFORE DELETE ON runtime_authority BEGIN SELECT RAISE(ABORT, 'runtime history is immutable'); END",
  runtime_claim_binding_no_delete:
    "CREATE TRIGGER runtime_claim_binding_no_delete BEFORE DELETE ON runtime_claim_binding BEGIN SELECT RAISE(ABORT, 'runtime history is immutable'); END",
  runtime_command_receipt_no_delete:
    "CREATE TRIGGER runtime_command_receipt_no_delete BEFORE DELETE ON runtime_command_receipt BEGIN SELECT RAISE(ABORT, 'runtime history is immutable'); END",
  runtime_claim_binding_no_update:
    "CREATE TRIGGER runtime_claim_binding_no_update BEFORE UPDATE ON runtime_claim_binding BEGIN SELECT RAISE(ABORT, 'runtime history is immutable'); END",
  runtime_command_receipt_no_update:
    "CREATE TRIGGER runtime_command_receipt_no_update BEFORE UPDATE ON runtime_command_receipt BEGIN SELECT RAISE(ABORT, 'runtime history is immutable'); END",
  runtime_ledger_monotonic:
    "CREATE TRIGGER runtime_ledger_monotonic BEFORE UPDATE ON runtime_ledger WHEN NEW.id IS NOT OLD.id OR NEW.schema_version IS NOT OLD.schema_version OR NEW.ledger_id IS NOT OLD.ledger_id OR NEW.authority_count < OLD.authority_count OR NEW.binding_count < OLD.binding_count OR NEW.receipt_count < OLD.receipt_count BEGIN SELECT RAISE(ABORT, 'runtime history is immutable'); END",
  runtime_authority_monotonic:
    "CREATE TRIGGER runtime_authority_monotonic BEFORE UPDATE ON runtime_authority WHEN NEW.organization_id IS NOT OLD.organization_id OR NEW.project_id IS NOT OLD.project_id OR NEW.person_id IS NOT OLD.person_id OR NEW.generation != OLD.generation + 1 BEGIN SELECT RAISE(ABORT, 'runtime authority must advance exactly once'); END",
};
const MIGRATION_HASH = 'ef8f1b818cb1e2d98f6f933f3e7125ac00cd1c428124afd5619c254cccaba00d';

/** Whitespace outside SQL literals is insignificant; bytes inside literals remain authoritative. */
function normalizeSql(definition: string): string {
  // Proof: P48 collapsed literal whitespace; an altered trigger literal passed owned-schema inspection.
  return definition
    .replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\s+/g, (token) => (/^\s/.test(token) ? ' ' : token))
    .trim();
}
const matchScope = (scope: RuntimeScope) => {
  const scoped = parseRuntimeScope(scope);
  return sql`organization_id=${scoped.organizationId} AND project_id=${scoped.projectId} AND person_id=${scoped.personId}`;
};
interface BindingRow {
  organization_id: string;
  project_id: string;
  person_id: string;
  claim_id: string;
  store_id: string;
  attempt_id: string;
  binding: unknown;
}
interface AcceptanceRow {
  organization_id: string;
  project_id: string;
  person_id: string;
  command_id: string;
  accepted: unknown;
}

/**
 * Permanent receiver storage over the existing source turn and borrowed UoW.
 * Construction is deliberately lazy: boot may explicitly migrate after source construction.
 * Every operation audits current schema and retained rows; no schema-cookie cache can survive
 * rolled-back DDL or hide DML loss. Full integrity/absence audits scan all retained history.
 * Exact owned schema acceptance intentionally requires future migrations to update this adapter.
 */
export class RuntimeCommandRepository implements RuntimeCommandStore {
  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
  ) {}

  private inspectState(): RuntimeLedger {
    const migration = this.db.all<{ hash: unknown }>(
      sql`SELECT hash FROM __drizzle_migrations WHERE name=${MIGRATION}`,
    );
    // Proof: P01 omitted this check; absent/changed migration identity returned a ledger.
    if (migration.length !== 1 || migration.at(0)?.hash !== MIGRATION_HASH)
      throw new Error('invalid runtime migration identity');
    for (const [name, expected] of Object.entries(REQUIRED_SCHEMA)) {
      const definitions = this.db.all<{ sql: unknown }>(
        sql`SELECT sql FROM sqlite_master WHERE name=${name} AND type IN ('table','trigger','index')`,
      );
      const definition = definitions.at(0)?.sql;
      // Proof: P02 omitted exact schema validation; the empty weakened-table negative returned a ledger.
      if (
        definitions.length !== 1 ||
        typeof definition !== 'string' ||
        normalizeSql(definition) !== normalizeSql(expected)
      )
        throw new Error(`invalid runtime schema: ${name}`);
    }
    const markers = this.db.all<{
      id: unknown;
      schemaVersion: unknown;
      ledgerId: unknown;
      authorityCount: unknown;
      bindingCount: unknown;
      receiptCount: unknown;
    }>(
      'SELECT id,schema_version AS schemaVersion,ledger_id AS ledgerId,authority_count AS authorityCount,binding_count AS bindingCount,receipt_count AS receiptCount FROM runtime_ledger',
    );
    const marker = markers.at(0);
    // Proof: P03 ignored duplicate markers; the exact-schema singleton negative resolved.
    if (markers.length !== 1 || marker?.id !== 1)
      throw new Error('invalid runtime ledger singleton');
    const { id: _id, ...record } = marker;
    const ledger = parseRuntimeLedger(record);
    const authorities = this.db.all<{
      organization_id: unknown;
      project_id: unknown;
      person_id: unknown;
      ownerId: unknown;
      generation: unknown;
    }>(
      'SELECT organization_id,project_id,person_id,owner_id AS ownerId,generation FROM runtime_authority',
    );
    const bindings = this.db.all<BindingRow>('SELECT * FROM runtime_claim_binding');
    const receipts = this.db.all<AcceptanceRow>('SELECT * FROM runtime_command_receipt');
    // Proof: P04 removed reconciliation; DML-only count damage became authoritative receipt/scope absence.
    if (
      ledger.authorityCount !== authorities.length ||
      ledger.bindingCount !== bindings.length ||
      ledger.receiptCount !== receipts.length
    )
      throw new Error('runtime retained history counts differ');
    for (const held of authorities) {
      // Proof: P35 omitted scope parsing; a BLOB scope with valid counts passed inspection.
      parseRuntimeScope({
        organizationId: held.organization_id,
        projectId: held.project_id,
        personId: held.person_id,
      });
      parseRuntimeAuthority({ ownerId: held.ownerId, generation: held.generation });
    }
    for (const bound of bindings) this.parseBindingRow(bound);
    for (const accepted of receipts) this.parseAcceptanceRow(accepted, ledger.ledgerId);
    return ledger;
  }
  private parseBindingRow(row: BindingRow): RuntimeClaim {
    parseRuntimeScope({
      organizationId: row.organization_id,
      projectId: row.project_id,
      personId: row.person_id,
    });
    // Proof: P33 omitted the byte boundary; BLOB binding reached JSON parsing instead of its named refusal.
    if (typeof row.binding !== 'string') throw new Error('invalid runtime binding bytes');
    const bound = parseRuntimeClaim(JSON.parse(row.binding));
    // Proof: P15 omitted identity matching; three retained-binding lookup disagreements passed inspection.
    if (
      row.claim_id !== bound.claimId ||
      row.store_id !== bound.execution.storeId ||
      row.attempt_id !== bound.execution.attemptId
    )
      throw new Error('runtime binding identity mismatch');
    return bound;
  }
  private parseAcceptanceRow(row: AcceptanceRow, ledgerId: string): StoredRuntimeAcceptance {
    // Proof: P34 omitted the byte boundary; BLOB acceptance reached JSON parsing instead of its named refusal.
    if (typeof row.accepted !== 'string') throw new Error('invalid runtime acceptance bytes');
    const accepted = parseStoredRuntimeAcceptance(JSON.parse(row.accepted));
    // Proof: P16 omitted matching; command/scope/ledger lookup disagreements passed inspection.
    if (
      row.command_id !== accepted.commandId ||
      row.organization_id !== accepted.scope.organizationId ||
      row.project_id !== accepted.scope.projectId ||
      row.person_id !== accepted.scope.personId ||
      accepted.receipt.ledgerId !== ledgerId
    )
      throw new Error('runtime stored acceptance identity mismatch');
    return accepted;
  }
  inspectLedger(): Promise<RuntimeLedger> {
    return Promise.resolve().then(() => this.inspectState());
  }
  assertAbsentHistory(): Promise<void> {
    return Promise.resolve().then(() => {
      this.inspectState();
    });
  }
  readAuthority(scope: RuntimeScope): Promise<RuntimeAuthority | null> {
    return Promise.resolve().then(() => {
      // Proof: P05 omitted admission inspection; missing runtime_ledger became uninitialized scope.
      this.inspectState();
      const held = this.db.get<{ ownerId: unknown; generation: unknown } | undefined>(
        sql`SELECT owner_id AS ownerId,generation FROM runtime_authority WHERE ${matchScope(scope)}`,
      );
      return held === undefined ? null : parseRuntimeAuthority(held);
    });
  }
  compareAuthority(
    scope: RuntimeScope,
    expected: number | null,
    ownerId: string,
  ): Promise<RuntimeAuthority | null> {
    return this.gate.enter(() =>
      Promise.resolve().then(() =>
        this.db.transaction((tx) => {
          this.inspectState();
          const held = tx.get<{ ownerId: string; generation: number } | undefined>(
            sql`SELECT owner_id AS ownerId,generation FROM runtime_authority WHERE ${matchScope(scope)}`,
          );
          if ((held?.generation ?? null) !== expected) return null;
          const grant = parseRuntimeAuthority({ ownerId, generation: (held?.generation ?? 0) + 1 });
          if (held === undefined) {
            tx.run(
              sql`INSERT INTO runtime_authority(organization_id,project_id,person_id,owner_id,generation) VALUES (${scope.organizationId},${scope.projectId},${scope.personId},${grant.ownerId},${grant.generation})`,
            );
            // Proof: P06 omitted this increment; real-source CAS/count inspection failed.
            tx.run('UPDATE runtime_ledger SET authority_count=authority_count+1 WHERE id=1');
          } else
            tx.run(
              sql`UPDATE runtime_authority SET owner_id=${grant.ownerId},generation=${grant.generation} WHERE ${matchScope(scope)}`,
            );
          return grant;
        }),
      ),
    );
  }
  readBinding(scope: RuntimeScope, claimId: string): Promise<RuntimeClaim | null> {
    return Promise.resolve().then(() => {
      this.inspectState();
      const bound = this.db.get<BindingRow | undefined>(
        sql`SELECT * FROM runtime_claim_binding WHERE ${matchScope(scope)} AND claim_id=${claimId}`,
      );
      return bound === undefined ? null : this.parseBindingRow(bound);
    });
  }
  readAttemptBinding(
    scope: RuntimeScope,
    storeId: string,
    attemptId: string,
  ): Promise<RuntimeClaim | null> {
    return Promise.resolve().then(() => {
      this.inspectState();
      const bound = this.db.get<BindingRow | undefined>(
        sql`SELECT * FROM runtime_claim_binding WHERE ${matchScope(scope)} AND store_id=${storeId} AND attempt_id=${attemptId}`,
      );
      return bound === undefined ? null : this.parseBindingRow(bound);
    });
  }
  // Proof: P28 removed the savepoint; a late counter-trigger failure retained its earlier binding row.
  insertBinding(scope: RuntimeScope, binding: RuntimeClaim): Promise<void> {
    return this.gate.enter(() =>
      Promise.resolve().then(() => {
        this.db.transaction((tx) => {
          this.inspectState();
          // Proof: F1-01 omitted scope validation; BLOB IDs and undeclared fields committed instead of rejecting without changes.
          const scoped = parseRuntimeScope(scope);
          const bound = parseRuntimeClaim(binding);
          tx.run(
            sql`INSERT INTO runtime_claim_binding(organization_id,project_id,person_id,claim_id,store_id,attempt_id,binding) VALUES (${scoped.organizationId},${scoped.projectId},${scoped.personId},${bound.claimId},${bound.execution.storeId},${bound.execution.attemptId},${JSON.stringify(bound)})`,
          );
          // Proof: P07 omitted this increment; real-source exact-binding/count inspection failed.
          tx.run('UPDATE runtime_ledger SET binding_count=binding_count+1 WHERE id=1');
        });
      }),
    );
  }
  readAcceptance(scope: RuntimeScope, commandId: string): Promise<StoredRuntimeAcceptance | null> {
    return Promise.resolve().then(() => {
      const ledger = this.inspectState();
      const accepted = this.db.get<AcceptanceRow | undefined>(
        sql`SELECT * FROM runtime_command_receipt WHERE ${matchScope(scope)} AND command_id=${commandId}`,
      );
      return accepted === undefined ? null : this.parseAcceptanceRow(accepted, ledger.ledgerId);
    });
  }
  insertAcceptance(stored: StoredRuntimeAcceptance): Promise<void> {
    return this.gate.enter(() =>
      Promise.resolve().then(() => {
        this.db.transaction((tx) => {
          const ledger = this.inspectState();
          const accepted = parseStoredRuntimeAcceptance(stored);
          // Proof: P17 omitted this check; a wrong-ledger accepted-record insertion resolved.
          if (accepted.receipt.ledgerId !== ledger.ledgerId)
            throw new Error('runtime acceptance ledger mismatch');
          tx.run(
            sql`INSERT INTO runtime_command_receipt(organization_id,project_id,person_id,command_id,accepted) VALUES (${accepted.scope.organizationId},${accepted.scope.projectId},${accepted.scope.personId},${accepted.commandId},${JSON.stringify(accepted)})`,
          );
          // Proof: P08 omitted this increment; real-source immutable-acceptance/count inspection failed.
          tx.run('UPDATE runtime_ledger SET receipt_count=receipt_count+1 WHERE id=1');
        });
      }),
    );
  }
}
