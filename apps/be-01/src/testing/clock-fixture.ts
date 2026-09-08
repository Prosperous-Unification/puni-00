import { clockOf } from '@wbs/core';

/** Explicit ambient clock for tests whose subject is not time or identity. */
export const testClock = clockOf({
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),
});
