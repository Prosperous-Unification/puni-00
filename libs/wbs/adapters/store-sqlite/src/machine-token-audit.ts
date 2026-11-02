import {
  type MachineTokenAudit,
  type MachineTokenAuditOutcome,
  type MachineTokenIssuance,
  MOST_AUDITED_RUNS_PER_DAY,
  type OrganizationAuditDetail,
} from '@wbs/core';
import { type SQL, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { Gate } from './gate';
import { type ImmediateTransaction, writeImmediately } from './immediate-write';
import { assertAuditDetailHoldsNoSecret } from './organization-audit-log';

const DAY_MS = 86_400_000;

/**
 * The key expressions of the two partial unique indexes
 * `20261026130000_widen_organization_audit_machine_tokens` creates, spelled
 * exactly as there: the lookups, the count and the `ON CONFLICT` targets all
 * read these, so a lookup, a count and a conflict can never disagree on what
 * one key is. `created_at` is integer milliseconds, so integer division gives
 * the UTC day; the run is coalesced because SQLite keeps NULLs distinct.
 */
const CREDENTIAL_KEY = sql.raw("json_extract(detail, '$.credentialId')");
const RUN_DAY_KEY = sql.raw('created_at / 86400000');
const RUN_KEY = sql.raw("coalesce(json_extract(detail, '$.runId'), '')");
const OVERFLOW_DAY_KEY = sql.raw('created_at / 86400000');

const RUN_ROW = sql`(${CREDENTIAL_KEY}, ${RUN_DAY_KEY}, ${RUN_KEY})`;
const OVERFLOW_ROW = sql`(${CREDENTIAL_KEY}, ${OVERFLOW_DAY_KEY})`;

/** A read connection or the write turn's transaction: both run these statements. */
type Reader = Pick<SQLiteBunDatabase, 'get'> | Pick<ImmediateTransaction, 'get'>;

/**
 * {@link MachineTokenAudit} over the shared database (`wbs-mcp-agent-surface`
 * M3), read first as `touchLastUsed` and `renewLeases` are (#668): the steady
 * state, a run already audited today, takes no write turn at all.
 *
 * Inside the turn (`BEGIN IMMEDIATE`, which also orders the blue and green
 * processes sharing the file mid-swap) one instant serves the day key, both
 * lookups, the count and `created_at`. The insert is a targeted
 * `INSERT … ON CONFLICT (<the index's expressions>) WHERE <its predicate> DO
 * NOTHING`: never `INSERT OR IGNORE` and never an untargeted conflict clause,
 * which would also swallow a CHECK violation or a row-id collision.
 */
export class MachineTokenAuditRepository implements MachineTokenAudit {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  async record(
    issuance: MachineTokenIssuance,
    now: () => number,
    newId: () => string,
  ): Promise<MachineTokenAuditOutcome> {
    const detail = detailOf(issuance);
    assertAuditDetailHoldsNoSecret('machine_token_issued', detail);
    await Promise.resolve();
    const day = Math.floor(now() / DAY_MS);
    // Proof: with this early return removed (every issuance entering the
    // write turn), `answers a seen run without taking the write turn`
    // (machine-token-audit.db.test.ts) answered 'pending'; watched 2026-10-26.
    if (hasRunRow(this.db, issuance, day) || hasOverflowRow(this.db, issuance, day)) return 'seen';
    return writeImmediately(this.db, this.gate, (tx): MachineTokenAuditOutcome => {
      const at = now();
      const today = Math.floor(at / DAY_MS);
      if (hasRunRow(tx, issuance, today) || hasOverflowRow(tx, issuance, today)) return 'seen';
      const row = {
        id: newId(),
        issuance,
        detail: JSON.stringify(detail),
        at,
      };
      // Proof: with this count read outside the turn instead, the model
      // property in machine-token-audit.db.test.ts saw two racers at 99 both
      // write run rows; with the stop removed, 150 runs wrote 150; watched
      // 2026-10-26.
      if (runsOn(tx, issuance, today) >= MOST_AUDITED_RUNS_PER_DAY) {
        insertOverflow(tx, row);
        return 'overflow_recorded';
      }
      insertRun(tx, row);
      return 'recorded';
    });
  }
}

/** The row names the credential, person, source and run; never a secret or a digest. */
function detailOf(issuance: MachineTokenIssuance): OrganizationAuditDetail {
  return {
    credentialId: issuance.credentialId,
    personId: issuance.personId,
    source: issuance.source,
    ...(issuance.runId === null ? {} : { runId: issuance.runId }),
  };
}

function runValue(issuance: MachineTokenIssuance): string {
  return issuance.runId ?? '';
}

function hasRunRow(reader: Reader, issuance: MachineTokenIssuance, day: number): boolean {
  return (
    reader.get<{ found: number } | undefined>(
      sql`SELECT 1 AS found FROM organization_audit
          WHERE action = 'machine_token_issued'
            AND ${RUN_ROW} = (${issuance.credentialId}, ${day}, ${runValue(issuance)})`,
    ) !== undefined
  );
}

function hasOverflowRow(reader: Reader, issuance: MachineTokenIssuance, day: number): boolean {
  return (
    reader.get<{ found: number } | undefined>(
      sql`SELECT 1 AS found FROM organization_audit
          WHERE action = 'machine_token_issued_overflow'
            AND ${OVERFLOW_ROW} = (${issuance.credentialId}, ${day})`,
    ) !== undefined
  );
}

/** The day's run rows of the credential: a range of the run index. */
function runsOn(reader: Reader, issuance: MachineTokenIssuance, day: number): number {
  const counted = reader.get<{ runs: number } | undefined>(
    sql`SELECT count(*) AS runs FROM organization_audit
        WHERE action = 'machine_token_issued'
          AND (${CREDENTIAL_KEY}, ${RUN_DAY_KEY}) = (${issuance.credentialId}, ${day})`,
  );
  if (counted === undefined) throw new Error('a count answered no row');
  return counted.runs;
}

interface AuditRow {
  readonly id: string;
  readonly issuance: MachineTokenIssuance;
  readonly detail: string;
  readonly at: number;
}

function values(row: AuditRow, action: string): SQL {
  return sql`(${row.id}, ${row.issuance.organizationId}, ${row.issuance.accountId}, ${action},
    'machine_credential', ${row.issuance.credentialId}, ${row.detail}, ${row.at})`;
}

/**
 * Proof: written as `INSERT OR IGNORE`, `throws on a CHECK violation instead
 * of skipping the row` and `throws on a row-id collision under a different
 * key` resolved; with an untargeted `ON CONFLICT DO NOTHING`, the collision
 * case resolved; with the coalesce or the day expression changed here and in
 * the index together, issuances of one run and day wrote one row each
 * (machine-token-audit.db.test.ts); watched 2026-10-26.
 */
function insertRun(tx: ImmediateTransaction, row: AuditRow): void {
  tx.run(
    sql`INSERT INTO organization_audit
          (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at)
        VALUES ${values(row, 'machine_token_issued')}
        ON CONFLICT ${RUN_ROW} WHERE action = 'machine_token_issued' DO NOTHING`,
  );
}

function insertOverflow(tx: ImmediateTransaction, row: AuditRow): void {
  tx.run(
    sql`INSERT INTO organization_audit
          (id, organization_id, actor_id, action, subject_kind, subject_id, detail, created_at)
        VALUES ${values(row, 'machine_token_issued_overflow')}
        ON CONFLICT ${OVERFLOW_ROW} WHERE action = 'machine_token_issued_overflow' DO NOTHING`,
  );
}
