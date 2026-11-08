import type { GrantableMachineSource } from '@wbs/domain';

/**
 * How many distinct runs of one credential get their own `machine_token_issued`
 * row in one UTC day (`wbs-mcp-agent-surface` M3). `wbs_run` is the client's
 * choice, so the 101st run writes one `machine_token_issued_overflow` row for
 * the credential and day instead, and nothing more is written that day.
 */
export const MOST_AUDITED_RUNS_PER_DAY = 100;

/** One machine grant issued: what its audit row names, never a secret. */
export interface MachineTokenIssuance {
  readonly credentialId: string;
  readonly organizationId: string;
  /** The bound account the credential acts as: the audit row's actor. */
  readonly accountId: string;
  readonly personId: string;
  readonly source: GrantableMachineSource;
  /** The opted-in `wbs_run`; null when the client sent none, which is one run. */
  readonly runId: string | null;
}

/**
 * What {@link MachineTokenAudit.record} did: wrote the day's row for this run,
 * wrote the day's one overflow row, or wrote nothing because the run's row or
 * the overflow row already existed.
 */
export type MachineTokenAuditOutcome = 'recorded' | 'overflow_recorded' | 'seen';

/**
 * The bounded issuance audit (`wbs-mcp-agent-surface` M3): at most one row per
 * (credential, run, UTC day) and, after {@link MOST_AUDITED_RUNS_PER_DAY} of
 * them, one overflow row per (credential, UTC day). Issuance is never refused
 * for audit reasons: every outcome lets the grant be issued.
 */
export interface MachineTokenAudit {
  /**
   * Reads the run's row and the overflow row first, outside the write turn,
   * and writes nothing when either exists; otherwise takes the turn, reads
   * `now()` once for the day, the lookups, the count and `created_at`, repeats
   * the lookups and the count, and inserts with `newId()` as the row id.
   *
   * @throws on every store failure, a constraint other than the day's own key
   * included (a row-id collision or a CHECK violation is a fault, never
   * skipped), and when the run looks like a secret.
   */
  record(
    issuance: MachineTokenIssuance,
    now: () => number,
    newId: () => string,
  ): Promise<MachineTokenAuditOutcome>;
}
