import { describe, expect, test } from 'bun:test';

import {
  buildReturnUrl,
  InvalidConversation,
  InvalidDraft,
  parseConversation,
  parseDraft,
  parseEntry,
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

describe('manual draft boundary', () => {
  const draft = {
    description: 'A booking tool',
    brief: '',
    csrfToken: 'a'.repeat(64),
    expiresAt: '2026-10-12T12:00:00.000Z',
    provider: 'disabled' as const,
  };

  test('accepts the draft contract with its provider', () => {
    expect(parseDraft(draft)).toEqual(draft);
    expect(parseDraft({ ...draft, provider: 'paused' }).provider).toBe('paused');
  });

  test('a draft with a malformed expiresAt is invalid', () => {
    // Proof: accepting any expiresAt string made this parse succeed and the manual brief throw
    // inside render instead of showing its load-error state.
    for (const expiresAt of ['tomorrow', '', 42, undefined])
      expect(() => parseDraft({ ...draft, expiresAt })).toThrow(InvalidDraft);
  });

  test('a draft without a known provider or required text is invalid', () => {
    const { provider: _provider, ...withoutProvider } = draft;
    expect(() => parseDraft(withoutProvider)).toThrow(InvalidDraft);
    expect(() => parseDraft({ ...draft, provider: 'enabled' })).toThrow(InvalidDraft);
    expect(() => parseDraft({ ...draft, csrfToken: '' })).toThrow(InvalidDraft);
    expect(() => parseDraft({ ...draft, description: null })).toThrow(InvalidDraft);
    expect(() => parseDraft(null)).toThrow(InvalidDraft);
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
