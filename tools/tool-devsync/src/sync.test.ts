import { describe, expect, it } from 'bun:test';

import { needsRestart } from './sync';

describe('needsRestart', () => {
  it('does not restart when the lockfile is unchanged', () => {
    expect(needsRestart('abc123', 'abc123')).toBe(false);
  });

  it('restarts when the lockfile moved, because bun install must run', () => {
    expect(needsRestart('abc123', 'def456')).toBe(true);
  });

  // An unreadable hash on either side is missing evidence, not evidence of
  // absence. Guessing "no restart needed" from it is how a dev environment
  // silently keeps serving against stale dependencies.
  it('restarts when the hash could not be read before the pull', () => {
    expect(needsRestart('', 'def456')).toBe(true);
  });

  it('restarts when the hash could not be read after the pull', () => {
    expect(needsRestart('abc123', '')).toBe(true);
  });

  it('restarts when neither hash could be read', () => {
    expect(needsRestart('', '')).toBe(true);
  });
});
