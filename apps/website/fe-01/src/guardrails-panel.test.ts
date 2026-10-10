import { expect, test } from 'bun:test';

import {
  describePause,
  InvalidGuardrailOverview,
  parseGuardrailOverview,
} from './guardrails-panel';

const overview = {
  pause: {
    id: 'pause-1',
    reason: 'site_spend',
    pausedBy: 'system',
    pausedAt: Date.UTC(2026, 9, 7, 9, 30),
  },
  siteSpendMicroUsd: 8_010_000,
  siteCeilingMicroUsd: 10_000_000,
  draftsToday: 12,
  proposalsToday: 3,
  accountLockedUntil: null,
  lockedSources: 1,
  alerts: [
    {
      kind: 'inference_paused',
      detail: 'site_spend pause at 8010000 micro-USD on 2026-10-07',
      createdAt: Date.UTC(2026, 9, 7, 9, 30),
      delivery: 'failed',
      deliveredAt: Date.UTC(2026, 9, 7, 9, 30),
    },
  ],
};

test('the overview parses at the boundary and names the pause', () => {
  const parsed = parseGuardrailOverview(overview);
  expect(parsed.pause).toEqual({ reason: 'site_spend', pausedAt: Date.UTC(2026, 9, 7, 9, 30) });
  expect(parsed.alerts[0]?.delivery).toBe('failed');
  expect(describePause(parsed.pause)).toBe(
    'AI chat is paused: today’s spend reached 80% of the ceiling (since 2026-10-07 09:30 UTC).',
  );
  expect(describePause(null)).toBe('AI chat is running.');
});

test('a malformed overview throws instead of rendering defaults', () => {
  expect(() => parseGuardrailOverview({ ...overview, draftsToday: -1 })).toThrow(
    InvalidGuardrailOverview,
  );
  expect(() =>
    parseGuardrailOverview({ ...overview, pause: { reason: 'other', pausedAt: 1 } }),
  ).toThrow(InvalidGuardrailOverview);
  expect(() =>
    parseGuardrailOverview({
      ...overview,
      alerts: [{ ...overview.alerts[0], delivery: 'queued' }],
    }),
  ).toThrow(InvalidGuardrailOverview);
});
