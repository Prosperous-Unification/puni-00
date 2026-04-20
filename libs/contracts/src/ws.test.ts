import { parseOrThrow } from '@wbs/validation';
import { describe, expect, it } from 'bun:test';

import { WsControlFrame, WsFrame } from './ws';

describe('WS envelopes', () => {
  it('WsFrame round-trips subscription/seq/message', () => {
    const v = parseOrThrow(WsFrame, { subscription: 'doc:abc', seq: 5, message: { a: 1 } });
    expect(v.seq).toBe(5);
  });

  it('resume_ack control frame parses', () => {
    const v = parseOrThrow(WsControlFrame, {
      type: 'resume_ack',
      replayed: { 'doc:abc': 7 },
    });
    if (v.type !== 'resume_ack') throw new Error('expected resume_ack');
    expect(v.replayed['doc:abc']).toBe(7);
  });

  it('resume_denied control frame parses', () => {
    const v = parseOrThrow(WsControlFrame, {
      type: 'resume_denied',
      subscription: 'doc:abc',
      reason: 'out_of_range',
    });
    expect(v.type).toBe('resume_denied');
  });
});
