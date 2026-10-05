import { describe, expect, test } from 'bun:test';

import {
  InvalidConversation,
  parseConversation,
  resolveAnonymousHarness,
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
