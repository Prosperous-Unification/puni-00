import { describe, expect, it } from 'bun:test';

import { memoryLateWriteControl } from './faults';

describe('memory conformance fault controls', () => {
  it('arms a named staged-state write point per run', () => {
    const control = memoryLateWriteControl('subtree-final-satellite');

    // Proof: removing the arm guard failed here on `Expected: false; Received: true`.
    expect(control.reachStagedWrite('subtree-final-satellite')).toBe(false);
    control.arm();

    expect(control.reachStagedWrite('subtree-final-satellite')).toBe(true);
    expect(control.reached()).toBe(true);
  });
});
