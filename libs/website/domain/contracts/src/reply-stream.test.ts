import { describe, expect, test } from 'bun:test';

import { readReplyReplacement, replyReplacePart } from './reply-stream';

describe('readReplyReplacement', () => {
  test('returns the text of a reply replacement part', () => {
    expect(readReplyReplacement({ type: replyReplacePart, data: { text: 'Declined.' } })).toBe(
      'Declined.',
    );
  });

  test('ignores text deltas, other data parts and non-objects', () => {
    expect(readReplyReplacement({ type: 'text-delta', id: 'a', delta: 'Hi' })).toBeNull();
    expect(readReplyReplacement({ type: 'data-other', data: { text: 'x' } })).toBeNull();
    expect(readReplyReplacement(null)).toBeNull();
    expect(readReplyReplacement('data-reply-replace')).toBeNull();
  });

  test('throws on a replacement part without text', () => {
    expect(() => readReplyReplacement({ type: replyReplacePart, data: {} })).toThrow(
      'A reply replacement part carries no text',
    );
    expect(() => readReplyReplacement({ type: replyReplacePart })).toThrow();
  });
});
