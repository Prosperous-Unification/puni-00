import { parseOrThrow, ValidationError } from '@wbs/validation';
import { describe, expect, it } from 'bun:test';

import { InternalForwardRequest, InternalPushRequest, InternalResumeRequest } from './internal';

describe('internal contracts', () => {
  it('InternalPushRequest accepts a valid payload', () => {
    const v = parseOrThrow(InternalPushRequest, {
      subscription: 'doc:abc',
      seq: 1,
      message: { type: 'ping' },
    });
    expect(v.seq).toBe(1);
  });

  it('InternalPushRequest rejects non-numeric seq', () => {
    expect(() =>
      parseOrThrow(InternalPushRequest, { subscription: 'doc:abc', seq: 'one', message: {} }),
    ).toThrow(ValidationError);
  });

  it('InternalResumeRequest parses resume_points map', () => {
    const v = parseOrThrow(InternalResumeRequest, {
      resume_points: { 'doc:abc': 42, 'user:xyz': 7 },
      trace_id: 't-1',
    });
    expect(v.resume_points['doc:abc']).toBe(42);
  });

  it('InternalForwardRequest requires trace_id', () => {
    expect(() => parseOrThrow(InternalForwardRequest, { message: { type: 'ping' } })).toThrow(
      ValidationError,
    );
  });
});
