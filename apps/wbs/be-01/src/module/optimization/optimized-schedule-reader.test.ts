import { describe, expect, it } from 'bun:test';

import { applyVariantLiveness } from './optimized-schedule-reader';

describe('applyVariantLiveness', () => {
  it('marks idle work pending only when a slot or queue entry is live', () => {
    expect(applyVariantLiveness({ state: 'idle' }, false)).toEqual({ state: 'idle' });
    expect(applyVariantLiveness({ state: 'idle' }, true)).toEqual({ state: 'pending' });
  });
  it('marks a live failed or corrupt marker retrying while preserving terminal states', () => {
    expect(applyVariantLiveness({ state: 'failed', reason: 'timeout' }, true)).toEqual({
      state: 'retrying',
    });
    expect(applyVariantLiveness({ state: 'corrupt', message: 'bad payload' }, true)).toEqual({
      state: 'retrying',
    });
    expect(applyVariantLiveness({ state: 'ready', proof: 'proven' }, true)).toEqual({
      state: 'ready',
      proof: 'proven',
    });
    expect(applyVariantLiveness({ state: 'plan-infeasible', items: [] }, true)).toEqual({
      state: 'plan-infeasible',
      items: [],
    });
  });
});
