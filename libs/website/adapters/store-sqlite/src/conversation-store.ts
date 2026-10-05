import {
  captureBrief,
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

/**
 * Spend in micro-USD: settled usage, the full reservation of an operation settled at its ceiling
 * or still in flight. It can only over-count what the provider charged, never under-count.
 */
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

/** The latest attempt under one idempotency key; earlier attempts were settled at their ceiling. */
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
      'SELECT id, idempotency_key, state, truncated, message FROM conversation_operation WHERE conversation_id = ? AND idempotency_key = ? ORDER BY rowid DESC LIMIT 1',
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
  sourceHash: string,
  reservedMicroUsd: number,
  now: number,
): ConversationAdmission | null {
  const utcDay = utcDayOf(now);
  // Each operation carries the source hash and UTC day it was admitted under, so a conversation
  // crossing midnight is charged to the new day's source rather than the old day's.
  // Proof: summing by conversation.source_hash instead admitted the over-ceiling call in the midnight-crossing test.
  const otherConversationsFromSource = single(
    database
      .query<{ count: number }, [string, string, string]>(
        'SELECT count(DISTINCT conversation_id) AS count FROM conversation_operation WHERE source_hash = ? AND utc_day = ? AND conversation_id <> ?',
      )
      .get(sourceHash, utcDay, conversation.id),
    'source conversation',
  ).count;
  const sourceSpend = single(
    database
      .query<{ total: number }, [string, string]>(
        `SELECT ${spentMicroUsd} AS total FROM conversation_operation WHERE source_hash = ? AND utc_day = ?`,
      )
      .get(sourceHash, utcDay),
    'source spend',
  ).total;
  if (
    otherConversationsFromSource >= conversationAllowance.sourceDayConversations ||
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
  // Proof: counting every non-completed operation instead of in-flight ones made four stopped conversations refuse the fifth as busy.
  const running = single(
    database
      .query<{ count: number }, []>(
        `SELECT (SELECT count(*) FROM provider_call WHERE settled_micro_usd IS NULL) + (SELECT count(*) FROM conversation_operation WHERE state = 'inflight' AND reserved_micro_usd IS NOT NULL) AS count`,
      )
      .get(),
    'running call',
  ).count;
  if (running >= conversationAllowance.siteUnsettledCalls) return { kind: 'busy' };
  return null;
}

/**
 * Admits one claim-bound conversation operation in a single immediate transaction, so a
 * concurrent writer in another process waits for the lock instead of reading stale totals.
 * Order: live draft, conversation state, idempotent lookup of the key's latest attempt (replay,
 * conflict, in-flight; an `unknown` attempt was settled at its ceiling and may be retried under
 * the same key as a new attempt), the initial-once and turn rules, the per-conversation in-flight rule, then the
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
          'SELECT id, body_hash, state, reply FROM conversation_operation WHERE conversation_id = ? AND idempotency_key = ? ORDER BY rowid DESC LIMIT 1',
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
        if (existing.state === 'inflight') return { kind: 'inflight' };
        // An `unknown` attempt was settled at its ceiling; the same key may start a new attempt.
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
        const refusal = refuseReservation(
          database,
          conversation,
          request.sourceHash,
          reservedMicroUsd,
          request.now,
        );
        if (refusal) return refusal;
      }
      const id = crypto.randomUUID();
      database
        .query(
          "INSERT INTO conversation_operation (id, conversation_id, idempotency_key, source_hash, body_hash, message, initial, stage, prompt_version, state, utc_day, reserved_micro_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'inflight', ?, ?, ?)",
        )
        .run(
          id,
          conversation.id,
          request.idempotencyKey,
          request.sourceHash,
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
 * Settles final usage, adds the visitor and assistant turns and marks the operation completed
 * (`truncated` for a length finish) in one transaction. Usage above the reservation is recorded
 * as the actual cost with `overrun` set, so every ceiling sees the real spend. A completed
 * `brief` reply is parsed by {@link captureBrief}; its body, cut to 4,000 characters, becomes the
 * draft brief unless the visitor already saved one or nothing was captured, and the capture kind
 * is recorded as the operation's `brief_capture`. Returns false, changing nothing, when the operation is not in flight or the usage is
 * missing for a reserved operation or present for a free one.
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
    if ((operation.reserved_micro_usd === null) !== (actualMicroUsd === null)) return false;
    // Proof: refusing usage above the reservation made the overrun test's completion return false.
    const overrun =
      operation.reserved_micro_usd !== null &&
      actualMicroUsd !== null &&
      actualMicroUsd > operation.reserved_micro_usd;
    // Proof: settling before this transaction left settled usage with no turns in the failed-insert test.
    // Only the assistant reply is parsed, so brief markers in visitor text never reach the draft.
    // Proof: parsing `operation.message` here stored the visitor's injected brief in the markers-in-visitor-text test.
    const capture = operation.stage === 'brief' ? captureBrief(reply) : null;
    const settled = database
      .query(
        "UPDATE conversation_operation SET state = 'completed', reply = ?, truncated = ?, settled_micro_usd = ?, settlement = 'usage', overrun = ?, brief_capture = ? WHERE id = ? AND state = 'inflight'",
      )
      .run(reply, truncated ? 1 : 0, actualMicroUsd, overrun ? 1 : 0, capture?.kind ?? null, id);
    if (settled.changes !== 1) throw new Error('Conversation completion was not atomic');
    const insertTurn = database.query(
      'INSERT INTO conversation_turn (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    insertTurn.run(crypto.randomUUID(), operation.conversation_id, 'user', operation.message, now);
    insertTurn.run(crypto.randomUUID(), operation.conversation_id, 'assistant', reply, now + 1);
    // Proof: storing the raw reply for an `empty` capture failed the empty-marked-body test.
    if (capture && capture.kind !== 'empty')
      // Proof: dropping `brief = ''` overwrote the visitor's saved brief in the kept-brief test.
      database
        .query(
          "UPDATE intake_draft SET brief = ? WHERE id = (SELECT draft_id FROM conversation WHERE id = ?) AND consumed_at IS NULL AND brief = ''",
        )
        .run(capture.body.slice(0, 4_000), operation.conversation_id);
    return true;
  })();
}

/**
 * Records the provider's generation id of an in-flight operation once it is first seen, so a
 * later ceiling settlement can still be reconciled against the provider's own record.
 */
export function recordConversationGeneration(
  database: Database,
  id: string,
  generationId: string,
): void {
  database
    .query(
      "UPDATE conversation_operation SET generation_id = ? WHERE id = ? AND state = 'inflight' AND generation_id IS NULL",
    )
    .run(generationId, id);
}

/**
 * Conservative settlement for an in-flight operation whose final usage is unknown (stop,
 * disconnect, timeout, provider or stream error, refused completion): it becomes `unknown` and
 * is settled at its full reservation with `settlement = 'reserved_ceiling'`. The reservation was
 * priced at the pinned `max_price` with the full output cap, so the recorded spend can only
 * over-count the provider's charge. The conversation stays open; the partial reply is not saved
 * and the visitor's message stays on the operation for a retry. Returns false when it was not in
 * flight.
 */
export function markConversationOperationUnknown(database: Database, id: string): boolean {
  // Proof: settling at 0 (schema CHECK removed too) let the stopped-reply and ceiling-settled tests admit another paid call; with the CHECK present the same fault raises a constraint error.
  return (
    database
      .query(
        "UPDATE conversation_operation SET state = 'unknown', settlement = 'reserved_ceiling', settled_micro_usd = reserved_micro_usd WHERE id = ? AND state = 'inflight'",
      )
      .run(id).changes === 1
  );
}

/**
 * Startup recovery: an interrupted process cannot prove final usage, so every in-flight
 * operation is settled at its reserved ceiling as by {@link markConversationOperationUnknown}.
 */
export function recoverConversationOperations(database: Database): void {
  // Proof: matching no rows here left the restart test's operation `inflight` and unsettled.
  database.run(
    "UPDATE conversation_operation SET state = 'unknown', settlement = 'reserved_ceiling', settled_micro_usd = reserved_micro_usd WHERE state = 'inflight'",
  );
}

/**
 * The random salt of one UTC day, created by the first process to ask and shared through the
 * database by every process on it, so restarts and blue/green pairs agree on a day's sources.
 * Salts older than the previous day are deleted, so an old source hash cannot be recomputed.
 *
 * @throws when the stored salt is absent after creation or is not 32 bytes.
 */
export function readSourceSalt(database: Database, utcDay: string): Uint8Array {
  return database
    .transaction(() => {
      const previousDay = utcDayOf(Date.parse(`${utcDay}T00:00:00.000Z`) - 86_400_000);
      database.query('DELETE FROM source_salt WHERE utc_day < ?').run(previousDay);
      database
        .query('INSERT OR IGNORE INTO source_salt (utc_day, salt) VALUES (?, ?)')
        .run(utcDay, crypto.getRandomValues(new Uint8Array(32)));
      const row = database
        .query<{ salt: unknown }, [string]>('SELECT salt FROM source_salt WHERE utc_day = ?')
        .get(utcDay);
      if (!(row?.salt instanceof Uint8Array) || row.salt.length !== 32)
        throw new Error(`Source salt for ${utcDay} is missing or malformed`);
      return row.salt;
    })
    .immediate();
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
