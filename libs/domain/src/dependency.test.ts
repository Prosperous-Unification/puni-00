import { parseOrThrow, ValidationError } from '@wbs/validation';
import { describe, expect, it } from 'bun:test';

import { Dependency } from './dependency';

describe('Dependency schema', () => {
  it('parses a valid dependency', () => {
    const parsed = parseOrThrow(Dependency, { from: 'a', to: 'b', kind: 'finish-to-start' });
    expect(parsed.kind).toBe('finish-to-start');
  });

  it('rejects an unknown kind', () => {
    expect(() => parseOrThrow(Dependency, { from: 'a', to: 'b', kind: 'nope' })).toThrow(
      ValidationError,
    );
  });
});
