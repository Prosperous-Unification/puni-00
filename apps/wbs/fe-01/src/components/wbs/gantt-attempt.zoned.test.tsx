import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { AttemptCard } from './gantt-attempt';
import type { GanttAttemptMark } from './gantt-geometry';

afterEach(cleanup);
it('shows the original overnight dates in the project zone even when the browser differs', () => {
  const mark: GanttAttemptMark = {
    nodeId: 'node',
    nodeReference: '010.dev',
    sliceId: 'slice',
    rowIndex: 0,
    x: 0.9375,
    width: 0.0625,
    tick: false,
    hitWidthPx: 56,
    running: false,
    clamped: true,
    attempt: {
      attemptNumber: 1,
      startedAt: Date.parse('2026-08-03T13:30:00Z'),
      endedAt: Date.parse('2026-08-03T23:10:00Z'),
      outcome: 'failed',
      executorPersonId: null,
      reference: null,
      note: null,
    },
  };
  render(<AttemptCard mark={mark} timezone="Europe/Kyiv" personNames={new Map()} />);
  expect(
    screen.getByText('2026-08-03 16:30:00 — 2026-08-04 02:10:00 (Europe/Kyiv)'),
  ).toBeInTheDocument();
});
