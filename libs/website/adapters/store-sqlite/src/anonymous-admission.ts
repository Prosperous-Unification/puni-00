import type { Database } from 'bun:sqlite';

export const anonymousAllowance = {
  attempts: 10,
  rollingConversations: 3,
  rollingMicroUsd: 300_000,
  siteHourMicroUsd: 2_000_000,
  siteMonthMicroUsd: 100_000_000,
  siteFreshMinute: 20,
} as const;

/** Content-free totals retain reservations until an authoritative usage settlement replaces them. */
export const ledgerSpend = 'COALESCE(SUM(COALESCE(settled_micro_usd, reserved_micro_usd)), 0)';

/** A required aggregate; missing rows indicate a broken query or database boundary. */
export function readAggregate(
  database: Database,
  expression: string,
  predicate: string,
  bindings: (string | number)[],
): number {
  const row = database
    .query<{ value: number }, (string | number)[]>(
      `SELECT ${expression} AS value FROM paid_attempt WHERE ${predicate}`,
    )
    .get(...bindings);
  if (row === null) throw new Error('Paid accounting aggregate returned no row');
  return row.value;
}

/** Effective completed visitor exchanges since the last authorized preview reset, retaining all history. */
export function effectiveVisitorTurns(database: Database, conversationId: string): number {
  const row = database
    .query<{ value: number }, [string]>(
      "SELECT (SELECT count(*) FROM conversation_turn WHERE conversation_id = ?1 AND role = 'user') - COALESCE((SELECT visitor_turns FROM testing_conversation WHERE conversation_id = ?1), 0) AS value",
    )
    .get(conversationId);
  if (row === null || row.value < 0) throw new Error('Invalid effective conversation turn count');
  return row.value;
}

/** Scoped offsets never participate in site accounting, site bursts or concurrency. */
export function conversationBaseline(database: Database, conversationId: string): number {
  return (
    database
      .query<{ after_sequence: number }, [string]>(
        'SELECT after_sequence FROM testing_conversation WHERE conversation_id = ?',
      )
      .get(conversationId)?.after_sequence ?? 0
  );
}

/**
 * Returns the latest recovery time for the requesting browser and salted source identities.
 * The browser baseline filters only this request's scoped allowance; another browser on the
 * same source continues to count its full rolling usage. A paid conversation is fresh only
 * when no post-baseline paid attempt exists. All callers hold the immediate admission lock.
 */
export function refuseRollingAllowance(
  database: Database,
  conversationId: string,
  browserHash: string,
  sourceHashes: readonly string[],
  reservation: number,
  now: number,
): { kind: 'rate_limited'; retryAfterSeconds: number } | null {
  if (sourceHashes.length === 0) throw new Error('Missing rolling source identities');
  const baseline =
    database
      .query<{ after_sequence: number }, [string]>(
        'SELECT after_sequence FROM testing_allowance WHERE browser_hash = ?',
      )
      .get(browserHash)?.after_sequence ?? 0;
  const conversationSequence = conversationBaseline(database, conversationId);
  const fresh =
    readAggregate(
      database,
      'count(*)',
      "origin = 'conversation' AND conversation_id = ? AND sequence > ?",
      [conversationId, conversationSequence],
    ) === 0;
  const dayStart = now - 86_400_000;
  const minuteStart = now - 60_000;
  const identities: { predicate: string; bindings: (string | number)[] }[] = [
    { predicate: 'browser_hash = ?', bindings: [browserHash] },
    {
      predicate: `source_hash IN (${sourceHashes.map(() => '?').join(', ')})`,
      bindings: [...sourceHashes],
    },
  ];
  let retryAt = now;
  for (const identity of identities) {
    const predicate = `origin = 'conversation' AND ${identity.predicate} AND sequence > ? AND admitted_at > ?`;
    const bindings = [...identity.bindings, baseline, dayStart];
    const spend = readAggregate(database, ledgerSpend, predicate, bindings);
    const conversations = readAggregate(
      database,
      'count(DISTINCT conversation_id)',
      `${predicate} AND conversation_id <> ?`,
      [...bindings, conversationId],
    );
    // Proof: disabling the scoped rolling guard admitted a fourth browser/source conversation and spend beyond thirty cents in anonymous-admission.test.ts.
    if (
      spend + reservation > anonymousAllowance.rollingMicroUsd ||
      conversations >= anonymousAllowance.rollingConversations
    ) {
      retryAt = Math.max(
        retryAt,
        readAggregate(database, `COALESCE(MIN(admitted_at), ${String(now)})`, predicate, bindings) +
          86_400_000,
      );
    }
    // Proof: disabling the scoped minute guard admitted the second fresh conversation after reopening another connection.
    if (
      fresh &&
      readAggregate(
        database,
        'count(*)',
        predicate +
          ' AND sequence IN (SELECT MIN(sequence) FROM paid_attempt WHERE sequence > ? GROUP BY conversation_id)',
        [...identity.bindings, baseline, minuteStart, baseline],
      ) >= 1
    ) {
      retryAt = Math.max(
        retryAt,
        readAggregate(database, `COALESCE(MIN(admitted_at), ${String(now)})`, predicate, [
          ...identity.bindings,
          baseline,
          minuteStart,
        ]) + 60_000,
      );
    }
  }
  const siteFresh =
    "origin = 'conversation' AND admitted_at > ? AND sequence IN (SELECT MIN(sequence) FROM paid_attempt WHERE origin = 'conversation' GROUP BY conversation_id)";
  // Proof: disabling the global minute guard admitted fresh conversation twenty-one from distinct browsers/sources.
  if (
    fresh &&
    readAggregate(database, 'count(*)', siteFresh, [minuteStart]) >=
      anonymousAllowance.siteFreshMinute
  )
    retryAt = Math.max(
      retryAt,
      readAggregate(database, `COALESCE(MIN(admitted_at), ${String(now)})`, siteFresh, [
        minuteStart,
      ]) + 60_000,
    );
  return retryAt > now
    ? { kind: 'rate_limited', retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1000)) }
    : null;
}

/** Site limits deliberately ignore every preview baseline and include retired-provider usage. */
export function refuseSiteWindow(
  database: Database,
  reservation: number,
  now: number,
): { kind: 'rate_limited'; retryAfterSeconds: number } | null {
  const month = new Date(now);
  const monthStart = Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1);
  const nextMonth = Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1);
  const hourStart = now - 3_600_000;
  // Proof: disabling these site guards admitted reservations beyond the retained hourly/monthly ceilings.
  if (
    readAggregate(database, ledgerSpend, 'admitted_at >= ?', [monthStart]) + reservation >
    anonymousAllowance.siteMonthMicroUsd
  )
    return { kind: 'rate_limited', retryAfterSeconds: Math.ceil((nextMonth - now) / 1000) };
  if (
    readAggregate(database, ledgerSpend, 'admitted_at > ?', [hourStart]) + reservation >
    anonymousAllowance.siteHourMicroUsd
  )
    return {
      kind: 'rate_limited',
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (readAggregate(
            database,
            `COALESCE(MIN(admitted_at), ${String(now)})`,
            'admitted_at > ?',
            [hourStart],
          ) +
            3_600_000 -
            now) /
            1000,
        ),
      ),
    };
  return null;
}
