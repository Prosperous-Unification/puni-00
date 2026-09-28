import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
