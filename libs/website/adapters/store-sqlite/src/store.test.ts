import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';

import { WebsiteStore } from './store';

test('applies all migrations and preserves a draft across reopen until expiry', () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-website-store-'));
  const databasePath = join(directory, 'website.sqlite');
  try {
    const store = new WebsiteStore(databasePath);
    store.createDraft('draft-1', 'Build a booking app', 'claim-1', 100, 200);
    store.close();

    const reopened = new WebsiteStore(databasePath);
    expect(reopened.findDraft('claim-1', 150)).toMatchObject({
      description: 'Build a booking app',
      expiresAt: 200,
    });
    expect(reopened.findDraft('claim-1', 200)).toBeNull();
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('discarding a draft expires it without deleting content and refuses a consumed one', () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-website-discard-'));
  try {
    const store = new WebsiteStore(join(directory, 'website.sqlite'));
    store.createDraft('draft-1', 'Build a booking app', 'claim-1', 100, 1_000);
    expect(store.discardDraft('claim-1', 150)).toBe('discarded');
    expect(store.findDraft('claim-1', 151)).toBeNull();
    expect(store.discardDraft('claim-1', 160)).toBe('discarded');
    expect(store.discardDraft('claim-unknown', 160)).toBe('missing');
    store.createDraft('draft-2', 'Build a dashboard', 'claim-2', 100, 1_000);
    expect(
      store.submit('claim-2', 'key-12345678', 'hash', 'a@example.test', 'b', 'r', 150),
    ).toEqual({
      kind: 'created',
      receipt: 'r',
    });
    // Proof: dropping the consumed branch in discardDraft made this return 'discarded'.
    expect(store.discardDraft('claim-2', 160)).toBe('consumed');
    store.close();
    const database = new Database(join(directory, 'website.sqlite'));
    expect(
      database
        .query<{ id: string; description: string; expires_at: number }, []>(
          'SELECT id, description, expires_at FROM intake_draft ORDER BY id',
        )
        .all(),
    ).toEqual([
      { id: 'draft-1', description: 'Build a booking app', expires_at: 150 },
      { id: 'draft-2', description: 'Build a dashboard', expires_at: 1_000 },
    ]);
    database.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('reopening marks a paid in-flight chat unknown and keeps its reservation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-chat-operation-'));
  const databasePath = join(directory, 'website.sqlite');
  try {
    const store = new WebsiteStore(databasePath);
    const account = store.createProspect('owner@example.test', 100);
    store.ensureBlankRequest(account.id, 100);
    const request = store.findAccountRequest(account.id);
    if (!request) throw new Error('Missing account request');
    const started = store.admitChatOperation(
      account.id,
      request.id,
      'message-key-1',
      'hash-1',
      'First',
      false,
      100,
      100,
    );
    expect(started.kind).toBe('started');
    store.close();

    const reopened = new WebsiteStore(databasePath);
    // Proof: removing startup recovery makes this operation appear to be a live stream after its process died.
    expect(reopened.findChatOperation(account.id, request.id, 'message-key-1')?.state).toBe(
      'unknown',
    );
    expect(
      reopened.admitChatOperation(
        account.id,
        request.id,
        'message-key-1',
        'hash-1',
        'First',
        false,
        100,
        101,
      ).kind,
    ).toBe('unknown');
    expect(
      reopened.admitChatOperation(
        account.id,
        request.id,
        'message-key-2',
        'hash-2',
        'Second',
        false,
        100,
        101,
      ).kind,
    ).toBe('budget');
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
