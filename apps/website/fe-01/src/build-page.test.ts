import { describe, expect, test } from 'bun:test';

import {
  type Conversation,
  describeExhaustion,
  InvalidConversation,
  offersProposal,
  parseConversation,
  resolveAnonymousHarness,
  selectComposerMode,
  selectStoppedAttempt,
  startOverUrl,
} from './build-contract';

const disabled = {
  stage: 'clarify',
  turns: [],
  visitorTurnsRemaining: 8,
  provider: 'disabled',
  brief: '',
  description: 'A booking tool for a community bicycle workshop.',
  csrfToken: 'a'.repeat(64),
  initialOperation: null,
  latestOperation: null,
  exhaustedReason: null,
};

describe('Build harness states', () => {
  test.each([
    {
      name: 'loading before entry resolves',
      entry: null,
      conversation: undefined,
      expected: { kind: 'loading' },
    },
    {
      name: 'expired claim redirects to Home with its reason',
      entry: { available: false, reason: 'expired' } as const,
      conversation: undefined,
      expected: { kind: 'redirect', url: 'https://dev.puni.dev/?entry=expired#request' },
    },
    {
      name: 'missing claim redirects to Home with its reason',
      entry: { available: false, reason: 'missing' } as const,
      conversation: undefined,
      expected: { kind: 'redirect', url: 'https://dev.puni.dev/?entry=missing#request' },
    },
    {
      name: 'disabled provider shows the disabled harness',
      entry: { available: true, reason: null } as const,
      conversation: disabled,
      expected: { kind: 'disabled', conversation: disabled },
    },
  ])('$name', ({ entry, conversation, expected }) => {
    expect(resolveAnonymousHarness('https://dev.puni.dev', entry, conversation)).toEqual(
      expected as ReturnType<typeof resolveAnonymousHarness>,
    );
  });

  test('a malformed conversation is an error, not a disabled state', () => {
    const { provider: _provider, ...withoutProvider } = disabled;
    expect(() =>
      resolveAnonymousHarness(
        'https://dev.puni.dev',
        { available: true, reason: null },
        withoutProvider,
      ),
    ).toThrow(InvalidConversation);
  });
});

describe('conversation contract', () => {
  test('accepts the disabled contract', () => {
    expect(parseConversation(disabled)).toEqual(disabled as ReturnType<typeof parseConversation>);
  });

  test.each([
    ['missing provider', { ...disabled, provider: undefined }],
    ['unknown provider', { ...disabled, provider: 'gpt' }],
    ['unknown stage', { ...disabled, stage: 'pricing' }],
    ['negative allowance', { ...disabled, visitorTurnsRemaining: -1 }],
    ['turn without role', { ...disabled, turns: [{ content: 'Hi' }] }],
    ['empty CSRF token', { ...disabled, csrfToken: '' }],
    ['exhausted without reason', { ...disabled, stage: 'exhausted' }],
    ['array', [disabled]],
    ['null', null],
  ])('rejects %s', (_name, value) => {
    expect(() => parseConversation(value)).toThrow(InvalidConversation);
  });
});

describe('start over', () => {
  test('lands on the empty Home prompt', () => {
    expect(startOverUrl('https://dev.puni.dev')).toBe('https://dev.puni.dev/#request');
  });
});

const live: Conversation = {
  stage: 'clarify',
  turns: [],
  visitorTurnsRemaining: 8,
  provider: 'demo',
  brief: '',
  description: 'A booking tool for a community bicycle workshop.',
  csrfToken: 'a'.repeat(64),
  initialOperation: { state: 'not-started', idempotencyKey: 'initial:draft-1', truncated: false },
  latestOperation: null,
  exhaustedReason: null,
};

const replied: Conversation = {
  ...live,
  turns: [
    { role: 'user', content: live.description },
    { role: 'assistant', content: 'Who books repairs today?' },
  ],
  visitorTurnsRemaining: 7,
  initialOperation: { state: 'completed', idempotencyKey: 'initial:draft-1', truncated: false },
  latestOperation: {
    state: 'completed',
    idempotencyKey: 'initial:draft-1',
    truncated: false,
    message: live.description,
  },
};

describe('live harness', () => {
  test.each(['openrouter', 'demo'] as const)('%s is the live harness', (provider) => {
    expect(
      resolveAnonymousHarness(
        'https://dev.puni.dev',
        { available: true, reason: null },
        { ...live, provider },
      ),
    ).toEqual({ kind: 'live', conversation: { ...live, provider } });
  });

  test('the Home request waits for Send under the server identity', () => {
    expect(selectComposerMode(live)).toEqual({
      kind: 'initial',
      attempt: { idempotencyKey: 'initial:draft-1', message: live.description, initial: true },
    });
  });

  test('a stopped initial reply keeps the read-only Home request and offers its retry', () => {
    const stopped: Conversation = {
      ...live,
      initialOperation: { state: 'unknown', idempotencyKey: 'initial:draft-1', truncated: false },
      latestOperation: {
        state: 'unknown',
        idempotencyKey: 'initial:draft-1',
        truncated: false,
        message: live.description,
      },
    };
    expect(selectComposerMode(stopped).kind).toBe('initial');
    expect(selectStoppedAttempt(stopped)).toEqual({
      idempotencyKey: 'initial:draft-1',
      message: live.description,
      initial: true,
    });
  });

  test('a stopped later reply leaves the composer open and the message retryable', () => {
    const stopped: Conversation = {
      ...replied,
      latestOperation: {
        state: 'unknown',
        idempotencyKey: 'turn-2',
        truncated: false,
        message: 'Repairs and rentals',
      },
    };
    expect(selectComposerMode(stopped)).toEqual({ kind: 'open' });
    expect(selectStoppedAttempt(stopped)).toEqual({
      idempotencyKey: 'turn-2',
      message: 'Repairs and rentals',
      initial: false,
    });
    expect(selectStoppedAttempt(replied)).toBeNull();
  });

  test('a reply still running elsewhere waits instead of offering another send', () => {
    expect(
      selectComposerMode({
        ...replied,
        latestOperation: {
          state: 'inflight',
          idempotencyKey: 'turn-2',
          truncated: false,
          message: 'Hi',
        },
      }),
    ).toEqual({ kind: 'answering' });
  });

  test.each([
    ['turns', 'This conversation reached its limit. Send your brief to a person.'],
    ['conversation_spend', 'This conversation used its AI allowance. Send your brief to a person.'],
    [
      'source_spend',
      'AI chat reached today’s limit for your connection. Send your brief to a person.',
    ],
    ['site_spend', 'AI chat reached today’s limit. Send your brief to a person.'],
  ] as const)('exhausted by %s closes the composer with its own line', (reason, line) => {
    expect(selectComposerMode({ ...replied, stage: 'exhausted', exhaustedReason: reason })).toEqual(
      { kind: 'closed', reason },
    );
    expect(describeExhaustion(reason)).toBe(line);
  });

  test('no turns left closes the composer even before the next refusal', () => {
    expect(selectComposerMode({ ...replied, stage: 'contact', visitorTurnsRemaining: 0 })).toEqual({
      kind: 'closed',
      reason: 'turns',
    });
  });

  test('a handed-off stage with a live claim is impossible', () => {
    expect(() => selectComposerMode({ ...replied, stage: 'handed_off' })).toThrow('handed-off');
  });
});

describe('inline proposal card', () => {
  test.each([
    ['clarify without a brief', { stage: 'clarify', brief: '' }, false],
    ['brief stage without a stored brief', { stage: 'brief', brief: '' }, false],
    ['a stored brief', { stage: 'brief', brief: 'Users: workshop members' }, true],
    ['contact', { stage: 'contact', brief: '' }, true],
    ['exhausted', { stage: 'exhausted', exhaustedReason: 'turns', brief: '' }, true],
  ] as const)('%s', (_name, change, expected) => {
    expect(offersProposal({ ...replied, ...change })).toBe(expected);
  });
});
