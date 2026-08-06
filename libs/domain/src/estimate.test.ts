import { parseOrThrow, ValidationError } from '@wbs/validation';
import { describe, expect, it } from 'bun:test';

import { ThreePointEstimate } from './estimate';

const days = (optimistic: number, realistic: number, pessimistic: number) => ({
  optimistic,
  realistic,
  pessimistic,
});

describe('ThreePointEstimate', () => {
  it('parses an ordered estimate', () => {
    expect(parseOrThrow(ThreePointEstimate, days(1, 2, 3)).realistic).toBe(2);
  });

  it('accepts fractional days', () => {
    expect(parseOrThrow(ThreePointEstimate, days(0.5, 0.5, 1.5)).optimistic).toBe(0.5);
  });

  it('accepts three equal values, which is a confident estimate not an error', () => {
    expect(parseOrThrow(ThreePointEstimate, days(2, 2, 2)).pessimistic).toBe(2);
  });

  it('rejects a negative duration', () => {
    expect(() => parseOrThrow(ThreePointEstimate, days(-1, 2, 3))).toThrow(ValidationError);
  });

  it('rejects realistic above pessimistic', () => {
    expect(() => parseOrThrow(ThreePointEstimate, days(1, 5, 3))).toThrow(ValidationError);
  });

  it('rejects optimistic above realistic', () => {
    expect(() => parseOrThrow(ThreePointEstimate, days(4, 2, 6))).toThrow(ValidationError);
  });
});
