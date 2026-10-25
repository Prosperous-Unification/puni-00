import { describe, expect, it } from 'bun:test';

import { SELECT_CLASS } from './control';

describe('SELECT_CLASS', () => {
  // Proof (2026-10-24): with `border-control-edge` put back to `border-input` in
  // `control.ts`, this failed on `expect(received).toContain(expected)` with
  // `Expected to contain: "border-control-edge"`; fe-01's `chrome-frames.spec.ts`
  // was the only guard before (ui-review-chrome-edges F-152).
  it('draws a native select on the one control edge', () => {
    const classes = SELECT_CLASS.split(' ');
    expect(classes).toContain('border');
    expect(classes).toContain('border-control-edge');
    expect(classes).not.toContain('border-input');
  });
});
