import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { readFunnelCounts } from './funnel-store';
import { WebsiteStore } from './store';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const hour = 60 * 60_000;
const day = Date.UTC(2026, 9, 7, 12);
const yesterday = day - 24 * hour;

function openSeededDatabase(): Database {
  const directory = mkdtempSync(join(tmpdir(), 'puni-funnel-'));
  directories.push(directory);
  const path = join(directory, 'website.sqlite');
  new WebsiteStore(path).close();
  return new Database(path);
}

function seedDraft(database: Database, id: string, createdAt: number): void {
  database
    .query(
      'INSERT INTO intake_draft (id, description, claim_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, `description of ${id}`, `claim-${id}`, createdAt, createdAt + 24 * hour);
}

function seedConversation(
  database: Database,
  draftId: string,
  state: 'open' | 'exhausted' | 'handed_off',
  createdAt: number,
  exhaustedReason: string | null = null,
): string {
  const id = `conversation-${draftId}`;
  database
    .query(
      'INSERT INTO conversation (id, draft_id, source_hash, state, exhausted_reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(id, draftId, 'source', state, exhaustedReason, createdAt);
  return id;
}

function seedOperation(
  database: Database,
  conversationId: string,
  key: string,
  createdAt: number,
  outcome:
    | { state: 'completed'; stage: 'clarify' | 'brief'; capture?: 'marked' | 'fallback' | 'empty' }
    | { state: 'unknown'; reservedMicroUsd: number },
): void {
  const completed = outcome.state === 'completed';
  database
    .query(
      'INSERT INTO conversation_operation (id, conversation_id, idempotency_key, source_hash, body_hash, message, initial, stage, prompt_version, state, utc_day, reserved_micro_usd, settled_micro_usd, settlement, reply, brief_capture, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      crypto.randomUUID(),
      conversationId,
      key,
      'source',
      'hash',
      'message text',
      completed ? outcome.stage : 'clarify',
      'puni-sales-v1',
      outcome.state,
      new Date(createdAt).toISOString().slice(0, 10),
      completed ? 1_000 : outcome.reservedMicroUsd,
      completed ? 900 : outcome.reservedMicroUsd,
      completed ? 'usage' : 'reserved_ceiling',
      completed ? 'reply text' : null,
      completed ? (outcome.capture ?? null) : null,
      createdAt,
    );
}

function seedProposal(database: Database, draftId: string, createdAt: number): void {
  database
    .query(
      "INSERT INTO proposal_submission (id, draft_id, email, brief, receipt, status, created_at, updated_at) VALUES (?, ?, 'owner@example.test', 'brief text', ?, 'submitted', ?, ?)",
    )
    .run(crypto.randomUUID(), draftId, `receipt-${draftId}`, createdAt, createdAt);
}

test('counts drafts, conversations, briefs, exhaustions and proposals per UTC day, split by origin', () => {
  const database = openSeededDatabase();
  // Today: three drafts; two conversations (one exhausted on turns, one handed off with a brief);
  // a manual proposal from draft-c and a from-chat proposal from draft-b.
  for (const id of ['draft-a', 'draft-b', 'draft-c']) seedDraft(database, id, day - hour);
  const exhausted = seedConversation(database, 'draft-a', 'exhausted', day, 'turns');
  seedOperation(database, exhausted, 'initial:a', day, { state: 'completed', stage: 'clarify' });
  seedOperation(database, exhausted, 'turn-2', day + 1, {
    state: 'unknown',
    reservedMicroUsd: 3_000,
  });
  const handedOff = seedConversation(database, 'draft-b', 'handed_off', day);
  seedOperation(database, handedOff, 'initial:b', day, { state: 'completed', stage: 'clarify' });
  seedOperation(database, handedOff, 'turn-3', day + 2, {
    state: 'completed',
    stage: 'brief',
    capture: 'marked',
  });
  seedProposal(database, 'draft-b', day + hour);
  seedProposal(database, 'draft-c', day + hour);
  // A conversation refused at its first admission is exhausted but never started.
  seedDraft(database, 'draft-refused', yesterday);
  seedConversation(database, 'draft-refused', 'exhausted', yesterday, 'source_spend');
  // Yesterday: one draft whose brief came back empty, and one ceiling-settled stop.
  seedDraft(database, 'draft-y', yesterday);
  const empty = seedConversation(database, 'draft-y', 'open', yesterday);
  seedOperation(database, empty, 'turn-3', yesterday, {
    state: 'completed',
    stage: 'brief',
    capture: 'empty',
  });
  seedOperation(database, empty, 'turn-4', yesterday, {
    state: 'unknown',
    reservedMicroUsd: 2_500,
  });
  // Outside the thirty-day window.
  seedDraft(database, 'draft-old', day - 30 * 24 * hour);

  const counts = readFunnelCounts(database, day + 3 * hour);
  expect(counts.days).toHaveLength(30);
  expect(counts.days[0]?.utcDay).toBe('2026-10-07');
  expect(counts.days[29]?.utcDay).toBe('2026-09-08');
  // Proof: counting intake_draft rows as proposals made `proposals.manual` 2 (Expected 1) here.
  expect(counts.days[0]).toEqual({
    utcDay: '2026-10-07',
    drafts: 3,
    conversationsStarted: 2,
    briefsCaptured: 1,
    exhausted: { turns: 1, conversation_spend: 0, source_spend: 0, site_spend: 0 },
    proposals: { manual: 1, fromChat: 1 },
    ceilingSettled: { count: 1, microUsd: 3_000 },
  });
  expect(counts.days[1]).toEqual({
    utcDay: '2026-10-06',
    drafts: 2,
    conversationsStarted: 1,
    briefsCaptured: 0,
    exhausted: { turns: 0, conversation_spend: 0, source_spend: 1, site_spend: 0 },
    proposals: { manual: 0, fromChat: 0 },
    ceilingSettled: { count: 1, microUsd: 2_500 },
  });
  expect(counts.days.slice(2).every((row) => row.drafts === 0)).toBe(true);
  database.close();
});

test('a window that is not a positive whole number of days throws', () => {
  const database = openSeededDatabase();
  expect(() => readFunnelCounts(database, day, 0)).toThrow('positive');
  expect(() => readFunnelCounts(database, day, 1.5)).toThrow('positive');
  expect(readFunnelCounts(database, day, 1).days).toHaveLength(1);
  database.close();
});
