import { describe, expect, it } from 'vitest';

import { attemptWhen } from './attempt-words';

/**
 * The spec's "a Kyiv finish is the same day for every reader", collected under
 * `TZ=Pacific/Auckland` (`vitest.zoned.config.ts`): a reader whose browser is
 * thirteen hours ahead of UTC still reads the Kyiv day and minute.
 */
describe('attempt instants under a reader in another zone', () => {
  it('reads a Kyiv finish as 12 Oct 02:30 from Auckland', () => {
    expect(
      attemptWhen(
        {
          attemptNumber: 2,
          startedAt: Date.parse('2026-10-11T20:00:00Z'),
          endedAt: Date.parse('2026-10-11T23:30:00Z'),
          outcome: 'succeeded',
          executorPersonId: null,
          reference: null,
          note: null,
        },
        'Europe/Kyiv',
      ),
    ).toBe('11 Oct 23:00 – 12 Oct 02:30');
  });
});
