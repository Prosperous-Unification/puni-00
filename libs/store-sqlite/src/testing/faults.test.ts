import { describe, expect, it } from 'bun:test';

import { sqliteLateWriteControl } from './faults';

describe('SQLite conformance fault controls', () => {
  it('arms a named transaction write point per run', () => {
    const control = sqliteLateWriteControl('saved-plan-schedule-body');

    // Proof: removing the arm guard failed here on `Expected: false; Received: true`.
    expect(control.reachTransactionWrite('saved-plan-schedule-body')).toBe(false);
    control.arm();

    expect(control.reachTransactionWrite('saved-plan-schedule-body')).toBe(true);
    expect(control.reached()).toBe(true);
  });
});
