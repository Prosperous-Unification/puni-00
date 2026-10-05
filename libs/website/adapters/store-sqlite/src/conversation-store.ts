import {
  type ConversationExhaustedReason,
  type ConversationReplyStage,
  type ConversationState,
  conversationTurnLimit,
  deriveReplyStage,
} from '@website/contracts';
import type { Database } from 'bun:sqlite';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type ConversationOperationState = 'inflight' | 'completed' | 'unknown';

export interface ConversationRecord {
  id: string;
  state: ConversationState;
  exhaustedReason: ConversationExhaustedReason | null;
}

export interface ConversationOperationRecord {
  id: string;
  idempotencyKey: string;
  state: ConversationOperationState;
  truncated: boolean;
  message: string;
}

/**
 * Spend and concurrency ceilings in micro-USD and calls. The site-day ceiling and the site-wide
 * unsettled-call count are shared with account reservations in `provider_call`.
 */
export const conversationAllowance = {
  conversationMicroUsd: 150_000,
  sourceDayMicroUsd: 300_000,
  sourceDayConversations: 3,
  siteDayMicroUsd: 10_000_000,
  siteUnsettledCalls: 4,
} as const;

/**
 * How a new operation may start: `closed` admits none (replays and refusals still answer),
 * `free` starts one without a reservation (loopback demo), `paid` prices the exact history and
 * stage inside the admission transaction.
 */
export type ConversationPricing =
  | { kind: 'closed' }
  | { kind: 'free' }
  | { kind: 'paid'; price(history: ConversationTurn[], stage: ConversationReplyStage): number };

export interface ConversationAdmissionRequest {
  claimHash: string;
  sourceHash: string;
  idempotencyKey: string;
  bodyHash: string;
  message: string;
  initial: boolean;
  promptVersion: string;
  pricing: ConversationPricing;
  now: number;
}

export type ConversationAdmission =
  | {
      kind: 'started';
      id: string;
      conversationId: string;
      stage: ConversationReplyStage;
      history: ConversationTurn[];
    }
  | { kind: 'completed'; reply: string }
  | { kind: 'exhausted'; reason: ConversationExhaustedReason }
  | {
      kind:
        | 'draft_unavailable'
        | 'conflict'
        | 'inflight'
        | 'unknown'
        | 'turn_limit'
        | 'initial_required'
        | 'provider_unavailable'
        | 'busy';
    };

interface ConversationRow {
  id: string;
  rowid: number;
  source_hash: string;
  state: ConversationState;
  exhausted_reason: ConversationExhaustedReason | null;
}

interface OperationRow {
  id: string;
  body_hash: string;
  state: ConversationOperationState;
  reply: string | null;
}

const spentMicroUsd = 'COALESCE(SUM(COALESCE(settled_micro_usd, reserved_micro_usd)), 0)';

function utcDayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function single<T>(row: T | null, query: string): T {
  if (row === null) throw new Error(`Conversation ${query} query returned no row`);
  return row;
}

function findConversationRow(database: Database, draftId: string): ConversationRow | null {
  return database
    .query<ConversationRow, [string]>(
      'SELECT id, rowid, source_hash, state, exhausted_reason FROM conversation WHERE draft_id = ?',
    )
    .get(draftId);
}

function exhaust(
  database: Database,
  conversationId: string,
  reason: ConversationExhaustedReason,
): ConversationAdmission {
  const write = database
    .query(
      "UPDATE conversation SET state = 'exhausted', exhausted_reason = ? WHERE id = ? AND state = 'open'",
    )
    .run(reason, conversationId);
  if (write.changes !== 1) throw new Error('Conversation exhaustion was not atomic');
  return { kind: 'exhausted', reason };
}

function countVisitorTurns(database: Database, conversationId: string): number {
  return single(
    database
      .query<{ count: number }, [string]>(
        "SELECT count(*) AS count FROM conversation_turn WHERE conversation_id = ? AND role = 'user'",
      )
      .get(conversationId),
    'visitor turn',
  ).count;
}

/** Saved turns in conversation order. */
export function listConversationTurns(
  database: Database,
  conversationId: string,
): ConversationTurn[] {
  return database
    .query<ConversationTurn, [string]>(
      'SELECT role, content FROM conversation_turn WHERE conversation_id = ? ORDER BY created_at, rowid',
    )
    .all(conversationId);
}

export function findConversation(database: Database, draftId: string): ConversationRecord | null {
  const row = findConversationRow(database, draftId);
  return row ? { id: row.id, state: row.state, exhaustedReason: row.exhausted_reason } : null;
}

function toOperationRecord(row: {
  id: string;
  idempotency_key: string;
  state: ConversationOperationState;
  truncated: number;
  message: string;
}): ConversationOperationRecord {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    state: row.state,
    truncated: row.truncated === 1,
    message: row.message,
  };
}

export function findConversationOperation(
  database: Database,
  conversationId: string,
  idempotencyKey: string,
): ConversationOperationRecord | null {
  const row = database
    .query<
      {
        id: string;
        idempotency_key: string;
        state: ConversationOperationState;
        truncated: number;
        message: string;
      },
      [string, string]
    >(
      'SELECT id, idempotency_key, state, truncated, message FROM conversation_operation WHERE conversation_id = ? AND idempotency_key = ?',
    )
    .get(conversationId, idempotencyKey);
  return row ? toOperationRecord(row) : null;
}

export function findLatestConversationOperation(
  database: Database,
  conversationId: string,
): ConversationOperationRecord | null {
  const row = database
    .query<
      {
        id: string;
        idempotency_key: string;
        state: ConversationOperationState;
        truncated: number;
        message: string;
      },
      [string]
    >(
      'SELECT id, idempotency_key, state, truncated, message FROM conversation_operation WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
    )
    .get(conversationId);
  return row ? toOperationRecord(row) : null;
}

/**
 * Applies the per-source, per-conversation and site-day spend ceilings and the site-wide
 * unsettled-call count to one priced reservation. A spend refusal exhausts the conversation;
 * the concurrency refusal does not, because it clears when another call settles.
 */
function refuseReservation(
  database: Database,
  conversation: ConversationRow,
  reservedMicroUsd: number,
  now: number,
): ConversationAdmission | null {
  const utcDay = utcDayOf(now);
  const dayStart = Date.parse(`${utcDay}T00:00:00.000Z`);
  // Proof: counting every same-day conversation instead of earlier ones refused the first conversation once a fourth existed (source-ceiling test).
  const earlierFromSource = single(
    database
      .query<{ count: number }, [string, number, number]>(
        'SELECT count(*) AS count FROM conversation WHERE source_hash = ? AND created_at >= ? AND rowid < ?',
      )
      .get(conversation.source_hash, dayStart, conversation.rowid),
    'source conversation',
  ).count;
  const sourceSpend = single(
    database
      .query<{ total: number }, [string, string]>(
        `SELECT ${spentMicroUsd} AS total FROM conversation_operation JOIN conversation ON conversation.id = conversation_operation.conversation_id WHERE conversation.source_hash = ? AND conversation_operation.utc_day = ?`,
      )
      .get(conversation.source_hash, utcDay),
    'source spend',
  ).total;
  if (
    earlierFromSource >= conversationAllowance.sourceDayConversations ||
    sourceSpend + reservedMicroUsd > conversationAllowance.sourceDayMicroUsd
  )
    return exhaust(database, conversation.id, 'source_spend');
  const conversationSpend = single(
    database
      .query<{ total: number }, [string]>(
        `SELECT ${spentMicroUsd} AS total FROM conversation_operation WHERE conversation_id = ?`,
      )
      .get(conversation.id),
    'conversation spend',
  ).total;
  if (conversationSpend + reservedMicroUsd > conversationAllowance.conversationMicroUsd)
    return exhaust(database, conversation.id, 'conversation_spend');
  // Proof: summing only conversation_operation made the shared-ceiling test admit a second call.
  const siteSpend = single(
    database
      .query<{ total: number }, [string]>(
        `SELECT (SELECT ${spentMicroUsd} FROM provider_call WHERE utc_day = ?1) + (SELECT ${spentMicroUsd} FROM conversation_operation WHERE utc_day = ?1) AS total`,
      )
      .get(utcDay),
    'site spend',
  ).total;
  if (siteSpend + reservedMicroUsd > conversationAllowance.siteDayMicroUsd)
    return exhaust(database, conversation.id, 'site_spend');
  const unsettled = single(
    database
      .query<{ count: number }, []>(
        'SELECT (SELECT count(*) FROM provider_call WHERE settled_micro_usd IS NULL) + (SELECT count(*) FROM conversation_operation WHERE reserved_micro_usd IS NOT NULL AND settled_micro_usd IS NULL) AS count',
      )
      .get(),
    'unsettled call',
  ).count;
  if (unsettled >= conversationAllowance.siteUnsettledCalls) return { kind: 'busy' };
  return null;
}

/**
 * Admits one claim-bound conversation operation in a single immediate transaction, so a
 * concurrent writer in another process waits for the lock instead of reading stale totals.
 * Order: live draft, conversation state, idempotent lookup (replay, conflict, in-flight,
 * unknown), the initial-once and turn rules, the per-conversation in-flight rule, then the
 * priced ceilings. A turn or spend refusal stores the conversation as `exhausted` with its
 * reason; saved turns never change. The conversation row is created on the first admitted
 * attempt and carries the salted source hash.
 *
 * @throws when stored state contradicts its invariants (an exhausted row without a reason, a
 * completed operation without a reply) or the pricing returns a non-positive amount.
 */
export function admitConversationOperation(
  database: Database,
  request: ConversationAdmissionRequest,
): ConversationAdmission {
  return database
    .transaction((): ConversationAdmission => {
      const draft = database
        .query<{ id: string }, [string, number]>(
          'SELECT id FROM intake_draft WHERE claim_hash = ? AND expires_at > ? AND consumed_at IS NULL',
        )
        .get(request.claimHash, request.now);
      if (!draft) return { kind: 'draft_unavailable' };
      let conversation = findConversationRow(database, draft.id);
      if (!conversation) {
        if (request.pricing.kind === 'closed') return { kind: 'provider_unavailable' };
        database
          .query(
            "INSERT INTO conversation (id, draft_id, source_hash, state, created_at) VALUES (?, ?, ?, 'open', ?)",
          )
          .run(crypto.randomUUID(), draft.id, request.sourceHash, request.now);
        conversation = findConversationRow(database, draft.id);
        if (!conversation) throw new Error('Conversation insert was not visible');
      }
      if (conversation.state === 'handed_off')
        throw new Error('Handed-off conversation has an unconsumed draft');
      if (conversation.state === 'exhausted') {
        if (conversation.exhausted_reason === null)
          throw new Error('Exhausted conversation has no reason');
        return { kind: 'exhausted', reason: conversation.exhausted_reason };
      }
      const visitorTurns = countVisitorTurns(database, conversation.id);
      const existing = database
        .query<OperationRow, [string, string]>(
          'SELECT id, body_hash, state, reply FROM conversation_operation WHERE conversation_id = ? AND idempotency_key = ?',
        )
        .get(conversation.id, request.idempotencyKey);
      if (existing) {
        // Proof: dropping this comparison made the changed-body admission test return `completed` instead of `conflict`.
        if (existing.body_hash !== request.bodyHash) return { kind: 'conflict' };
        if (existing.state === 'completed') {
          if (request.initial && visitorTurns > 1) return { kind: 'turn_limit' };
          if (existing.reply === null)
            throw new Error('Completed conversation operation has no reply');
          return { kind: 'completed', reply: existing.reply };
        }
        return { kind: existing.state };
      }
      if (request.pricing.kind === 'closed') return { kind: 'provider_unavailable' };
      if (request.initial && visitorTurns > 0) return { kind: 'turn_limit' };
      if (!request.initial && visitorTurns === 0) return { kind: 'initial_required' };
      // Proof: removing this cap made the ninth-turn admission test start an operation.
      if (visitorTurns >= conversationTurnLimit) return exhaust(database, conversation.id, 'turns');
      const running = single(
        database
          .query<{ count: number }, [string]>(
            "SELECT count(*) AS count FROM conversation_operation WHERE conversation_id = ? AND state = 'inflight'",
          )
          .get(conversation.id),
        'in-flight operation',
      ).count;
      if (running > 0) return { kind: 'inflight' };
      const stage = deriveReplyStage(visitorTurns);
      const history = listConversationTurns(database, conversation.id);
      let reservedMicroUsd: number | null = null;
      if (request.pricing.kind === 'paid') {
        reservedMicroUsd = request.pricing.price(history, stage);
        if (!Number.isSafeInteger(reservedMicroUsd) || reservedMicroUsd <= 0)
          throw new Error('Conversation reservation must be a positive integer of micro-USD');
        const refusal = refuseReservation(database, conversation, reservedMicroUsd, request.now);
        if (refusal) return refusal;
      }
      const id = crypto.randomUUID();
      database
        .query(
          "INSERT INTO conversation_operation (id, conversation_id, idempotency_key, body_hash, message, initial, stage, prompt_version, state, utc_day, reserved_micro_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'inflight', ?, ?, ?)",
        )
        .run(
          id,
          conversation.id,
          request.idempotencyKey,
          request.bodyHash,
          request.message,
          request.initial ? 1 : 0,
          stage,
          request.promptVersion,
          utcDayOf(request.now),
          reservedMicroUsd,
          request.now,
        );
      return { kind: 'started', id, conversationId: conversation.id, stage, history };
    })
    .immediate();
}

/**
 * Settles usage within the reservation, adds the visitor and assistant turns and marks the
 * operation completed (`truncated` for a length finish) in one transaction. A completed `brief`
 * reply, trimmed to 4,000 characters, becomes the draft brief unless the visitor already saved
 * one. Returns false, changing nothing, when the operation is not in flight or the usage is
 * missing, unexpected or above the reservation.
 */
export function completeConversationOperation(
  database: Database,
  id: string,
  reply: string,
  actualMicroUsd: number | null,
  now: number,
  truncated: boolean,
): boolean {
  return database.transaction(() => {
    const operation = database
      .query<
        {
          conversation_id: string;
          message: string;
          state: ConversationOperationState;
          stage: ConversationReplyStage;
          reserved_micro_usd: number | null;
        },
        [string]
      >(
        'SELECT conversation_id, message, state, stage, reserved_micro_usd FROM conversation_operation WHERE id = ?',
      )
      .get(id);
    if (operation?.state !== 'inflight') return false;
    if (
      operation.reserved_micro_usd === null
        ? actualMicroUsd !== null
        : actualMicroUsd === null || actualMicroUsd > operation.reserved_micro_usd
    )
      return false;
    // Proof: settling before this transaction left settled usage with no turns in the failed-insert test.
    const settled = database
      .query(
        "UPDATE conversation_operation SET state = 'completed', reply = ?, truncated = ?, settled_micro_usd = ? WHERE id = ? AND state = 'inflight'",
      )
      .run(reply, truncated ? 1 : 0, actualMicroUsd, id);
    if (settled.changes !== 1) throw new Error('Conversation completion was not atomic');
    const insertTurn = database.query(
      'INSERT INTO conversation_turn (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    insertTurn.run(crypto.randomUUID(), operation.conversation_id, 'user', operation.message, now);
    insertTurn.run(crypto.randomUUID(), operation.conversation_id, 'assistant', reply, now + 1);
    if (operation.stage === 'brief')
      // Proof: dropping `brief = ''` overwrote the visitor's saved brief in the kept-brief test.
      database
        .query(
          "UPDATE intake_draft SET brief = ? WHERE id = (SELECT draft_id FROM conversation WHERE id = ?) AND consumed_at IS NULL AND brief = ''",
        )
        .run(reply.trim().slice(0, 4_000), operation.conversation_id);
    return true;
  })();
}

/**
 * Marks an in-flight operation `unknown`, keeping its reservation, and holds the conversation as
 * `exhausted` with reason `unsettled` until reconciled. Returns false when it was not in flight.
 */
export function markConversationOperationUnknown(database: Database, id: string): boolean {
  return database.transaction(() => {
    const marked = database
      .query(
        "UPDATE conversation_operation SET state = 'unknown' WHERE id = ? AND state = 'inflight'",
      )
      .run(id);
    if (marked.changes !== 1) return false;
    database
      .query(
        "UPDATE conversation SET state = 'exhausted', exhausted_reason = 'unsettled' WHERE id = (SELECT conversation_id FROM conversation_operation WHERE id = ?) AND state = 'open'",
      )
      .run(id);
    return true;
  })();
}

/**
 * Startup recovery: an interrupted process cannot prove final usage, so every in-flight
 * operation becomes `unknown` and its open conversation is held as `unsettled`.
 */
export function recoverConversationOperations(database: Database): void {
  database.transaction(() => {
    database.run(
      "UPDATE conversation SET state = 'exhausted', exhausted_reason = 'unsettled' WHERE state = 'open' AND id IN (SELECT conversation_id FROM conversation_operation WHERE state = 'inflight')",
    );
    database.run("UPDATE conversation_operation SET state = 'unknown' WHERE state = 'inflight'");
  })();
}

/** Marks the draft's conversation, if any, `handed_off`; call inside the claim-consuming transaction. */
export function handOffConversation(database: Database, draftId: string): void {
  database
    .query(
      "UPDATE conversation SET state = 'handed_off', exhausted_reason = NULL WHERE draft_id = ?",
    )
    .run(draftId);
}

/**
 * Blanks the conversation text owned by a draft (turn content, operation message and reply)
 * and keeps every accounting column: reservations, settlement, UTC day, prompt version, stage
 * and the salted source hash. Shared by the expired-draft purge for retained `unknown`
 * operations and by request-retention erasure.
 */
export function eraseConversationContent(database: Database, draftId: string): void {
  database
    .query(
      "UPDATE conversation_turn SET content = '' WHERE conversation_id IN (SELECT id FROM conversation WHERE draft_id = ?)",
    )
    .run(draftId);
  database
    .query(
      "UPDATE conversation_operation SET message = '', reply = CASE WHEN reply IS NULL THEN NULL ELSE '' END WHERE conversation_id IN (SELECT id FROM conversation WHERE draft_id = ?)",
    )
    .run(draftId);
}
