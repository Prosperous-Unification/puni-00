import type { ConversationExhaustedReason } from '@website/contracts';
import type { Database } from 'bun:sqlite';

import { type CeilingSettled, readCeilingSettled, utcDayOf } from './guardrail-store';

/**
 * One UTC day of the funnel, counted from stored rows only:
 * - `drafts`: `intake_draft` rows created that day;
 * - `conversationsStarted`: conversations created that day with at least one operation (a
 *   conversation refused at its first admission is stored but never started);
 * - `briefsCaptured`: completed `brief`-stage operations that day whose capture was not `empty`;
 * - `exhausted`: conversations created that day that are now exhausted, by reason;
 * - `proposals`: `proposal_submission` rows created that day, `fromChat` when the draft's
 *   conversation is `handed_off` (the visitor started the AI chat; it does not mean the chat
 *   wrote the brief), otherwise `manual`;
 * - `ceilingSettled`: that day's {@link readCeilingSettled}.
 *
 * Rows erased by draft retention are no longer counted, so a day past the retention cutoff is a
 * lower bound for drafts, conversations and briefs; proposals and ceiling-settled operations are
 * retained.
 */
export interface FunnelDay {
  utcDay: string;
  drafts: number;
  conversationsStarted: number;
  briefsCaptured: number;
  exhausted: Record<ConversationExhaustedReason, number>;
  proposals: { manual: number; fromChat: number };
  ceilingSettled: CeilingSettled;
}

/** `GET /operator/funnel`: counts only, newest UTC day first. */
export interface FunnelCounts {
  days: FunnelDay[];
}

const dayMilliseconds = 24 * 60 * 60_000;
const dayOfCreatedAt = "strftime('%Y-%m-%d', created_at / 1000, 'unixepoch')";

interface DayCount {
  utc_day: string;
  count: number;
}

function emptyDay(utcDay: string): FunnelDay {
  return {
    utcDay,
    drafts: 0,
    conversationsStarted: 0,
    briefsCaptured: 0,
    exhausted: { turns: 0, conversation_spend: 0, source_spend: 0, site_spend: 0 },
    proposals: { manual: 0, fromChat: 0 },
    ceilingSettled: { count: 0, microUsd: 0 },
  };
}

/**
 * The funnel for the `days` UTC days ending with the day of `now`, every day present (zeros
 * included), newest first. Reads stored rows only; writes nothing.
 *
 * @throws when `days` is not a positive safe integer, or a counted row falls outside the window.
 */
export function readFunnelCounts(database: Database, now: number, days = 30): FunnelCounts {
  if (!Number.isSafeInteger(days) || days < 1)
    throw new Error('Funnel window must be a positive whole number of days');
  const dayStart = Date.parse(`${utcDayOf(now)}T00:00:00.000Z`);
  const from = dayStart - (days - 1) * dayMilliseconds;
  const until = dayStart + dayMilliseconds;
  const rows = Array.from({ length: days }, (_, index) =>
    emptyDay(utcDayOf(dayStart - index * dayMilliseconds)),
  );
  const byDay = new Map(rows.map((row) => [row.utcDay, row]));
  function dayRow(utcDay: string): FunnelDay {
    const row = byDay.get(utcDay);
    if (!row) throw new Error(`Funnel row outside the window: ${utcDay}`);
    return row;
  }
  function countByDay(sql: string, apply: (row: FunnelDay, count: number) => void): void {
    for (const counted of database.query<DayCount, [number, number]>(sql).all(from, until))
      apply(dayRow(counted.utc_day), counted.count);
  }

  countByDay(
    `SELECT ${dayOfCreatedAt} AS utc_day, count(*) AS count FROM intake_draft WHERE created_at >= ?1 AND created_at < ?2 GROUP BY utc_day`,
    (row, count) => {
      row.drafts = count;
    },
  );
  countByDay(
    `SELECT ${dayOfCreatedAt} AS utc_day, count(*) AS count FROM conversation WHERE created_at >= ?1 AND created_at < ?2 AND EXISTS (SELECT 1 FROM conversation_operation WHERE conversation_operation.conversation_id = conversation.id) GROUP BY utc_day`,
    (row, count) => {
      row.conversationsStarted = count;
    },
  );
  countByDay(
    `SELECT ${dayOfCreatedAt} AS utc_day, count(*) AS count FROM conversation_operation WHERE created_at >= ?1 AND created_at < ?2 AND state = 'completed' AND stage = 'brief' AND brief_capture IN ('marked', 'fallback') GROUP BY utc_day`,
    (row, count) => {
      row.briefsCaptured = count;
    },
  );
  for (const counted of database
    .query<DayCount & { reason: ConversationExhaustedReason }, [number, number]>(
      `SELECT ${dayOfCreatedAt} AS utc_day, exhausted_reason AS reason, count(*) AS count FROM conversation WHERE created_at >= ?1 AND created_at < ?2 AND state = 'exhausted' GROUP BY utc_day, reason`,
    )
    .all(from, until))
    dayRow(counted.utc_day).exhausted[counted.reason] = counted.count;
  for (const counted of database
    .query<DayCount & { from_chat: 0 | 1 }, [number, number]>(
      `SELECT strftime('%Y-%m-%d', proposal_submission.created_at / 1000, 'unixepoch') AS utc_day, EXISTS (SELECT 1 FROM conversation WHERE conversation.draft_id = proposal_submission.draft_id AND conversation.state = 'handed_off') AS from_chat, count(*) AS count FROM proposal_submission WHERE proposal_submission.created_at >= ?1 AND proposal_submission.created_at < ?2 GROUP BY utc_day, from_chat`,
    )
    .all(from, until)) {
    const proposals = dayRow(counted.utc_day).proposals;
    if (counted.from_chat === 1) proposals.fromChat = counted.count;
    else proposals.manual = counted.count;
  }
  for (const row of rows) row.ceilingSettled = readCeilingSettled(database, row.utcDay);
  return { days: rows };
}
