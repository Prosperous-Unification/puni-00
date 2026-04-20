import { describe, expect, it } from 'bun:test';

import { parseOrThrow, ValidationError } from '@wbs/validation';

import { WbsItem, WbsItemId } from './wbs-item';

describe('WbsItem schema', () => {
  it('parses a valid item with branded id', () => {
    const raw = { id: '01HXYZABC', title: 'Root task', estimateHours: 4 };
    const item = parseOrThrow(WbsItem, raw);
    expect(item.id).toBe('01HXYZABC');
  });

  it('rejects empty title', () => {
    expect(() => parseOrThrow(WbsItem, { id: '01HXYZABC', title: '', estimateHours: 4 })).toThrow(
      ValidationError,
    );
  });

  it('WbsItemId is branded — TypeScript refuses to assign raw strings', () => {
    const raw = parseOrThrow(WbsItemId, '01HXYZABC');
    expect(raw).toBe('01HXYZABC');
  });
});
