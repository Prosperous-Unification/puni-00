import { describe, expect, it } from 'vitest';

import type { AttemptView } from '@/lib/wbs-api';

import { attemptEntryText, attemptWhen, zonedMoment } from './attempt-words';

const at = (iso: string): number => Date.parse(iso);

const attempt = (overrides: Partial<AttemptView>): AttemptView => ({
  attemptNumber: 1,
  startedAt: at('2026-10-11T11:02:00Z'),
  endedAt: at('2026-10-11T11:41:00Z'),
  outcome: 'failed',
  executorPersonId: null,
  reference: null,
  note: null,
  ...overrides,
});

describe('attempt instants in the project zone (step-node-attempts D3)', () => {
  it('reads a Kyiv finish as the next day for every reader', () => {
    // 23:30 UTC is 02:30 the next morning in Kyiv (UTC+3 in October). The
    // proof runs this suite under TZ=America/Los_Angeles, where the browser's
    // own day is still 11 Oct.
    expect(zonedMoment(at('2026-10-11T23:30:00Z'), 'Europe/Kyiv')).toEqual({
      day: '12 Oct',
      time: '02:30',
    });
  });

  it('reads UTC as UTC', () => {
    expect(zonedMoment(at('2026-10-11T23:30:00Z'), 'UTC')).toEqual({
      day: '11 Oct',
      time: '23:30',
    });
  });

  it('refuses a zone Intl does not know', () => {
    expect(() => zonedMoment(0, 'Kyiv')).toThrow(RangeError);
  });

  it('says one day once, a night across both days, and a running attempt as running', () => {
    expect(attemptWhen(attempt({}), 'Europe/Kyiv')).toBe('11 Oct 14:02–14:41');
    expect(
      attemptWhen(
        attempt({
          startedAt: at('2026-10-11T13:30:00Z'),
          endedAt: at('2026-10-11T23:10:00Z'),
        }),
        'Europe/Kyiv',
      ),
    ).toBe('11 Oct 16:30 – 12 Oct 02:10');
    expect(attemptWhen(attempt({ endedAt: null, outcome: null }), 'UTC')).toBe(
      '11 Oct 11:02 – now',
    );
  });

  it('prints number, outcome, when, executor and reference, leaving out what is absent', () => {
    expect(
      attemptEntryText(attempt({ attemptNumber: 3, reference: 'PR #12' }), 'Europe/Kyiv', 'Kat'),
    ).toBe('#3 failed · 11 Oct 14:02–14:41 · Kat · PR #12');
    expect(attemptEntryText(attempt({ endedAt: null, outcome: null }), 'UTC', null)).toBe(
      '#1 running · 11 Oct 11:02 – now',
    );
  });
});
