import { describe, expect, test } from 'bun:test';

import {
  buildReturnUrl,
  chatRequestBody,
  countPriorTurns,
  InvalidConversation,
  parseConversation,
  parseEntry,
  parsePendingOperation,
  savedOperationCompleted,
  shouldRegeneratePending,
} from './build-contract';

describe('Build entry', () => {
  test('keeps missing and expired reasons distinct at the fixed Home composer', () => {
    expect(buildReturnUrl('https://dev.puni.dev', 'missing')).toBe(
      'https://dev.puni.dev/?entry=missing#request',
    );
    expect(buildReturnUrl('https://dev.puni.dev', 'expired')).toBe(
      'https://dev.puni.dev/?entry=expired#request',
    );
    expect(parseEntry({ available: true, reason: null })).toEqual({
      available: true,
      reason: null,
    });
    expect(parseEntry({ available: false, reason: 'expired' })).toEqual({
      available: false,
      reason: 'expired',
    });
  });

  test('refuses contradictory or malformed API entry status', () => {
    expect(() => parseEntry({ available: false, reason: null })).toThrow('entry response');
    expect(() => parseEntry({ available: true, reason: 'missing' })).toThrow('entry response');
    expect(() => parseEntry({ available: false, reason: 'foreign' })).toThrow('entry response');
  });
});

describe('lost-response recovery', () => {
  const pending = {
    requestId: 'request-one',
    message: 'Plan a booking flow',
    idempotencyKey: 'operation-one',
    initial: false,
    turnCount: 2,
    createdAt: 1000,
  };

  test('reuses only a validated operation for the current request', () => {
    expect(parsePendingOperation(JSON.stringify(pending), 'request-one', 2000)).toEqual(pending);
    expect(parsePendingOperation(JSON.stringify(pending), 'request-two', 2000)).toBeNull();
    expect(() => parsePendingOperation('{bad', 'request-one', 2000)).toThrow();
    expect(() => parsePendingOperation('{"requestId":"broken"}', 'request-one', 2000)).toThrow(
      'malformed',
    );
    expect(
      parsePendingOperation(JSON.stringify(pending), 'request-one', 1000 + 86400001),
    ).toBeNull();
  });

  test('recognizes saved completion without matching an earlier identical question', () => {
    expect(
      savedOperationCompleted(pending, [
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Earlier answer' },
        { role: 'user', content: pending.message },
        { role: 'assistant', content: 'Saved answer' },
      ]),
    ).toBe(true);
    expect(
      savedOperationCompleted(pending, [
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Earlier answer' },
      ]),
    ).toBe(false);
  });

  test('pre-network reload resends the pending text instead of regenerating an earlier turn', () => {
    const previous = [
      { role: 'user', parts: [{ type: 'text', text: pending.message }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'Earlier answer' }] },
    ];
    expect(shouldRegeneratePending(previous, pending)).toBe(false);
    expect(
      countPriorTurns(
        [...previous, { role: 'user', parts: [{ type: 'text', text: pending.message }] }],
        false,
        0,
      ),
    ).toBe(2);
    expect(
      shouldRegeneratePending(
        [...previous, { role: 'user', parts: [{ type: 'text', text: pending.message }] }],
        pending,
      ),
    ).toBe(true);
    expect(
      shouldRegeneratePending(
        [...previous, { role: 'user', parts: [{ type: 'text', text: 'Different question' }] }],
        pending,
      ),
    ).toBe(false);
  });
});

describe('chat request boundary', () => {
  test('sends only the latest user text and stable operation identity', () => {
    expect(
      chatRequestBody(
        [
          { role: 'user', parts: [{ type: 'text', text: 'Previous request' }] },
          { role: 'assistant', parts: [{ type: 'text', text: 'Previous reply' }] },
          { role: 'user', parts: [{ type: 'text', text: 'A new question' }] },
        ],
        'operation-1',
      ),
    ).toEqual({ message: 'A new question', idempotencyKey: 'operation-1' });
  });

  test('initial turn sends no browser prompt and refuses non-text parts', () => {
    expect(chatRequestBody([], 'server-initial', true)).toEqual({
      message: '',
      idempotencyKey: 'server-initial',
      initial: true,
    });
    expect(() =>
      chatRequestBody([{ role: 'user', parts: [{ type: 'file' }] }], 'operation-2'),
    ).toThrow('text-only');
  });

  test('retry can reuse the last user message after a partial assistant reply', () => {
    expect(
      chatRequestBody(
        [
          { role: 'user', parts: [{ type: 'text', text: 'Keep this question' }] },
          { role: 'assistant', parts: [{ type: 'text', text: 'Partial reply' }] },
        ],
        'same-operation',
      ),
    ).toEqual({ message: 'Keep this question', idempotencyKey: 'same-operation' });
  });
});

describe('conversation provider values', () => {
  const view = {
    stage: 'clarify',
    turns: [],
    visitorTurnsRemaining: 8,
    visitorTurnLimit: 8,
    brief: '',
    description: 'A booking tool',
    csrfToken: 'a'.repeat(64),
    initialOperation: null,
    latestOperation: null,
    exhaustedReason: null,
    challenge: null,
  };

  test('accepts paused and rejects values outside the contract', () => {
    expect(parseConversation({ ...view, provider: 'paused' }).provider).toBe('paused');
    for (const provider of ['suspended', 'PAUSED', null])
      expect(() => parseConversation({ ...view, provider })).toThrow(InvalidConversation);
  });

  test('a conversation without visitorTurnLimit is malformed', () => {
    const { visitorTurnLimit: _limit, ...withoutLimit } = view;
    // Proof: defaulting an absent visitorTurnLimit to 8 in parseConversation made this pass
    // without a throw.
    expect(() => parseConversation({ ...withoutLimit, provider: 'openrouter' })).toThrow(
      InvalidConversation,
    );
    for (const visitorTurnLimit of [0, -1, 2.5, '8', null])
      expect(() =>
        parseConversation({ ...view, provider: 'openrouter', visitorTurnLimit }),
      ).toThrow(InvalidConversation);
    expect(() =>
      parseConversation({ ...view, provider: 'openrouter', visitorTurnsRemaining: 9 }),
    ).toThrow(InvalidConversation);
    expect(parseConversation({ ...view, provider: 'openrouter' }).visitorTurnLimit).toBe(8);
  });

  test('requires the challenge field and validates an offered challenge', () => {
    const { challenge: _challenge, ...withoutChallenge } = view;
    expect(() => parseConversation({ ...withoutChallenge, provider: 'openrouter' })).toThrow(
      InvalidConversation,
    );
    const offered = {
      salt: 'abc',
      challenge: 'e'.repeat(64),
      signature: 'f'.repeat(64),
      maxnumber: 200_000,
      expiresAt: '2026-10-07T12:30:00.000Z',
    };
    expect(
      parseConversation({ ...view, provider: 'openrouter', challenge: offered }).challenge,
    ).toEqual({
      ...offered,
      expiresAt: Date.UTC(2026, 9, 7, 12, 30),
    });
    for (const broken of [
      { ...offered, challenge: 'short' },
      { ...offered, maxnumber: -1 },
      { ...offered, expiresAt: 'tomorrow' },
    ])
      expect(() =>
        parseConversation({ ...view, provider: 'openrouter', challenge: broken }),
      ).toThrow(InvalidConversation);
  });
});
