import { parseOrThrow, ValidationError } from '@wbs/validation';
import { describe, expect, it } from 'bun:test';

import { Dependency } from './dependency';
import { Estimate } from './estimate';

describe('Estimate schema', () => {
  it('parses a valid estimate', () => {
    const e = parseOrThrow(Estimate, { wbsItemId: 'abc', hours: 3, confidence: 'medium' });
    expect(e.confidence).toBe('medium');
  });

  it('rejects negative hours', () => {
    expect(() =>
      parseOrThrow(Estimate, { wbsItemId: 'abc', hours: -1, confidence: 'low' }),
    ).toThrow(ValidationError);
  });
});

describe('Dependency schema', () => {
  it('parses a valid finish-to-start dependency', () => {
    const d = parseOrThrow(Dependency, { from: 'a', to: 'b', kind: 'finish-to-start' });
    expect(d.kind).toBe('finish-to-start');
  });

  it('rejects unknown kind', () => {
    expect(() => parseOrThrow(Dependency, { from: 'a', to: 'b', kind: 'bogus' })).toThrow(
      ValidationError,
    );
  });
});
