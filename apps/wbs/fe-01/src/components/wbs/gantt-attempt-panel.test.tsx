import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AttemptView } from '@/lib/wbs-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

import { GanttFaultBoundary } from './gantt-fault';
import { MONDAY_START, planOf, pointedAtRow, rowAt, sliceAt } from './gantt-fixtures';
import type { GanttPlan } from './gantt-geometry';
import { GanttPanel } from './gantt-panel';

publishApplicationRuntimeForEachTest();
afterEach(cleanup);
const attempts: AttemptView[] = [
  {
    attemptNumber: 1,
    startedAt: Date.parse('2026-08-03T06:10:00Z'),
    endedAt: Date.parse('2026-08-03T06:40:00Z'),
    outcome: 'failed',
    executorPersonId: 'alice',
    reference: 'run/1',
    note: null,
  },
  {
    attemptNumber: 2,
    startedAt: Date.parse('2026-08-03T07:00:00Z'),
    endedAt: Date.parse('2026-08-03T07:02:00Z'),
    outcome: 'cancelled',
    executorPersonId: 'alice',
    reference: 'run/2',
    note: null,
  },
  {
    attemptNumber: 3,
    startedAt: Date.parse('2026-08-03T07:30:00Z'),
    endedAt: Date.parse('2026-08-03T09:00:00Z'),
    outcome: 'succeeded',
    executorPersonId: 'alice',
    reference: 'run/3',
    note: null,
  },
  {
    attemptNumber: 4,
    startedAt: Date.parse('2026-08-03T10:00:00Z'),
    endedAt: null,
    outcome: null,
    executorPersonId: 'alice',
    reference: 'run/4',
    note: null,
  },
];
const attemptPlan = (): GanttPlan =>
  planOf({
    startDate: MONDAY_START,
    timezone: 'Europe/Kyiv',
    rows: [
      rowAt('010', 0, 0.5, {
        attemptNodes: [{ id: 'node', stepId: 'dev', reference: '010.dev', attempts }],
      }),
    ],
    slices: [sliceAt('slice', '010', 0, 0.5)],
    personNames: new Map([['alice', 'Alice']]),
  });
const draw = (plan: GanttPlan, startDate: string | null = MONDAY_START, dayPx: 28 | 896 = 896) => (
  <GanttPanel
    plan={plan}
    startDate={startDate}
    scheduleError={null}
    generation={0}
    heightPx={null}
    dayPx={dayPx}
    onPickRow={() => undefined}
    onPointRow={() => undefined}
    pointed={pointedAtRow(null)}
  />
);

describe('attempt marks in the panel', () => {
  it('paints all four outcomes with hatch strokes, dots, solid fill and an open right edge', () => {
    const plan = attemptPlan();
    plan.rows = [
      {
        ...plan.rows[0],
        attemptNodes: [
          {
            ...plan.rows[0].attemptNodes![0],
            attempts: attempts.map((attempt) =>
              attempt.attemptNumber === 2
                ? { ...attempt, endedAt: attempt.startedAt + 20 * 60000 }
                : attempt,
            ),
          },
        ],
      },
    ];
    render(draw(plan));
    const failed = document.querySelector('[data-attempt="failed"]');
    const cancelled = document.querySelector('[data-attempt="cancelled"]');
    const succeeded = document.querySelector('[data-attempt="succeeded"]');
    const running = document.querySelector('[data-attempt="running"]');
    expect(failed).not.toBeNull();
    expect(cancelled).not.toBeNull();
    expect(succeeded).not.toBeNull();
    expect(running).not.toBeNull();
    for (const [mark, shape] of [
      [failed, 'path'],
      [cancelled, 'ellipse'],
    ] as const) {
      const fill = mark?.querySelector('[data-attempt-paint]')?.getAttribute('fill');
      expect(fill).toMatch(/^url\(#.+\)$/);
      const id = fill?.slice(5, -1);
      expect(document.getElementById(id ?? '')?.querySelector(shape)).not.toBeNull();
    }
    expect(succeeded?.querySelector('[data-attempt-paint]')?.getAttribute('fill')).not.toContain(
      'url(',
    );
    expect(running?.querySelector('[data-attempt-open-edge]')).not.toBeNull();
    expect(document.querySelector('[data-gantt-bar="slice"]')).not.toBeNull();
  });
  it('opens original attempt facts from a tick', () => {
    render(draw(attemptPlan()));
    const tick = document.querySelector('[data-attempt="cancelled"] [data-attempt-hit]');
    expect(tick).not.toBeNull();
    fireEvent.focus(tick!);
    expect(screen.getByText('Attempt 2 — cancelled')).toBeInTheDocument();
    expect(screen.getByText(/2026-08-03 10:00:00.*2026-08-03 10:02:00/)).toBeInTheDocument();
    expect(screen.getByText('Executor: Alice')).toBeInTheDocument();
    expect(screen.getByText('Reference: run/2')).toBeInTheDocument();
    expect(screen.getByText('Node: 010.dev')).toBeInTheDocument();
  });
  it.each([
    { start: null, zone: 'Europe/Kyiv' },
    { start: MONDAY_START, zone: null },
    { start: null, zone: null },
  ])('shows missing calendar inputs %j with the forecast', ({ start, zone }) => {
    const plan = attemptPlan();
    plan.timezone = zone;
    render(draw(plan, start));
    if (start === null)
      expect(
        screen.getByText('Attempt marks unavailable: set a project start date'),
      ).toBeInTheDocument();
    if (zone === null)
      expect(
        screen.getByText('Attempt marks unavailable: project timezone is unavailable'),
      ).toBeInTheDocument();
    expect(document.querySelector('[data-attempt]')).toBeNull();
    expect(document.querySelector('[data-gantt-bar="slice"]')).not.toBeNull();
  });
  it('keeps day rungs unchanged with attempts present', () => {
    render(draw(attemptPlan(), MONDAY_START, 28));
    expect(document.querySelector('[data-attempt]')).toBeNull();
    expect(screen.queryByText(/Attempt marks unavailable/)).not.toBeInTheDocument();
    expect(document.querySelector('[data-gantt-bar="slice"]')).not.toBeNull();
  });
  it('uses the supplied clock and repaints a new clock through memoization', () => {
    const plan = attemptPlan();
    const pointed = pointedAtRow(null);
    const drawNow = (now: number) => (
      <GanttPanel
        plan={plan}
        startDate={MONDAY_START}
        scheduleError={null}
        generation={0}
        heightPx={null}
        dayPx={896}
        now={now}
        onPickRow={() => undefined}
        onPointRow={() => undefined}
        pointed={pointed}
      />
    );
    const { rerender } = render(drawNow(Date.parse('2026-08-03T10:30:00Z')));
    const width = () =>
      Number(
        document
          .querySelector('[data-attempt="running"] [data-attempt-paint]')
          ?.getAttribute('width'),
      );
    expect(width()).toBeCloseTo(0.0625);
    rerender(drawNow(Date.parse('2026-08-03T11:00:00Z')));
    expect(width()).toBeCloseTo(0.125);
  });
  it('aligns translated headers, forecast and attempt hit surfaces', () => {
    render(draw(attemptPlan()));
    expect(document.querySelector('[data-axis-day="0"]')).toHaveAttribute(
      'data-axis-date',
      '2026-08-03',
    );
    expect(Number(document.querySelector('[data-gantt-bar="slice"]')?.getAttribute('x'))).toBe(7);
    const attempt = document.querySelector('[data-attempt="failed"] [data-attempt-paint]');
    const hit = document.querySelector('[data-attempt="failed"] [data-attempt-hit]');
    const center = Number(hit?.getAttribute('x')) + Number(hit?.getAttribute('width')) / 2;
    expect(center).toBeCloseTo(
      Number(attempt?.getAttribute('x')) + Number(attempt?.getAttribute('width')) / 2,
    );
  });
  it.each(['timezone', 'instant', 'start'])(
    'contains malformed supplied %s in the chart Error Boundary',
    (fault) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const plan = attemptPlan();
        if (fault === 'timezone') plan.timezone = 'broken-zone';
        else if (fault === 'instant')
          plan.rows = [
            {
              ...plan.rows[0],
              attemptNodes: [
                {
                  ...plan.rows[0].attemptNodes![0],
                  attempts: [{ ...attempts[0], startedAt: NaN }],
                },
              ],
            },
          ];
        render(
          <GanttFaultBoundary generation={0}>
            {draw(plan, fault === 'start' ? 'invalid-date' : MONDAY_START)}
          </GanttFaultBoundary>,
        );
        expect(document.querySelector('[data-gantt-fault]')).not.toBeNull();
        expect(document.querySelector('[data-attempt]')).toBeNull();
      } finally {
        vi.restoreAllMocks();
      }
    },
  );
  it('exports the translated range and the same attempt paint', async () => {
    const blobs: Blob[] = [];
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: (blob: Blob) => {
          blobs.push(blob);
          return 'blob:attempt';
        },
        revokeObjectURL: () => undefined,
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      render(draw(attemptPlan()));
      fireEvent.click(
        screen.getByRole('button', { name: 'Download this chart as a standalone SVG' }),
      );
      expect(blobs).toHaveLength(1);
      const xml = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('non-text SVG'));
        };
        reader.onerror = () => {
          reject(new Error('unreadable SVG'));
        };
        reader.readAsText(blobs[0]);
      });
      const svg = new DOMParser().parseFromString(xml, 'image/svg+xml');
      expect(svg.querySelectorAll('[data-attempt]')).toHaveLength(4);
      expect(
        svg.querySelector('[data-attempt="failed"] [data-attempt-paint]')?.getAttribute('fill'),
      ).toMatch(/^url\(#.+-failed\)$/);
      expect(Number(svg.querySelector('[data-gantt-bar="slice"]')?.getAttribute('x'))).toBe(7);
      expect(svg.documentElement.textContent).toContain('3');
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });
  it('switches from forecast facts to attempt facts without clearing the new card', () => {
    render(draw(attemptPlan()));
    fireEvent.focus(document.querySelector('[data-gantt-hit="slice"]')!);
    fireEvent.focus(document.querySelector('[data-attempt="cancelled"] [data-attempt-hit]')!);
    expect(screen.getByText('Reference: run/2')).toBeInTheDocument();
  });
  it('gives a two-minute attempt an 18px pointer surface in both dimensions', () => {
    render(draw(attemptPlan()));
    const tick = document.querySelector('[data-attempt="cancelled"] [data-attempt-hit]');
    expect(tick).toHaveAttribute('pointer-events', 'fill');
    expect(Number(tick?.getAttribute('width')) * 896).toBeGreaterThanOrEqual(18);
    expect(Number(tick?.getAttribute('height')) * 28).toBeGreaterThanOrEqual(18);
  });
  it('includes a tick and its forecast in the shared collision chooser', () => {
    vi.useFakeTimers();
    try {
      render(draw(attemptPlan()));
      for (const hit of document.querySelectorAll<SVGRectElement>(
        '[data-gantt-hit], [data-attempt-hit]',
      )) {
        vi.spyOn(hit, 'getBoundingClientRect').mockReturnValue({
          left: 0,
          right: 18,
          top: 0,
          bottom: 18,
          width: 18,
          height: 18,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        });
      }
      const pointer = new MouseEvent('pointerover', { bubbles: true, clientX: 9, clientY: 9 });
      Object.defineProperty(pointer, 'pointerType', { value: 'mouse' });
      fireEvent(document.querySelector('[data-attempt="cancelled"] [data-attempt-hit]')!, pointer);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByRole('button', { name: /010 · Dev/ })).toBeInTheDocument();
      fireEvent.click(
        within(screen.getByRole('tooltip', { name: 'Choose a mark' })).getByRole('button', {
          name: /Attempt 2 — cancelled/,
        }),
      );
      expect(screen.getByText('Reference: run/2')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Close mark list' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
  it('retains individual planned slices underneath attempts on completed leaves', () => {
    const plan = attemptPlan();
    plan.steps = [
      { id: 'dev', name: 'Dev' },
      { id: 'qa', name: 'QA' },
    ];
    plan.rows = [{ ...plan.rows[0], status: 'done', factStartOffset: 0, factEndStop: 1 }];
    plan.slices = [sliceAt('slice', '010', 0, 0.5), sliceAt('qa', '010', 0.5, 1, { stepId: 'qa' })];
    const { rerender } = render(draw(plan));
    expect(document.querySelectorAll('[data-gantt-bar]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-attempt]')).toHaveLength(4);
    expect(document.querySelector('[data-done]')).toBeNull();
    rerender(draw(plan, MONDAY_START, 28));
    expect(document.querySelectorAll('[data-gantt-bar]')).toHaveLength(1);
    expect(document.querySelector('[data-done]')).not.toBeNull();
    expect(document.querySelector('[data-attempt]')).toBeNull();
  });
  it('repaints changed attempt history through panel memoization', () => {
    const plan = attemptPlan();
    const pointed = pointedAtRow(null);
    const drawStable = (next: GanttPlan) => (
      <GanttPanel
        plan={next}
        startDate={MONDAY_START}
        scheduleError={null}
        generation={0}
        heightPx={null}
        dayPx={896}
        pointed={pointed}
        onPickRow={() => undefined}
        onPointRow={() => undefined}
      />
    );
    const { rerender } = render(drawStable(plan));
    const next = {
      ...plan,
      rows: [
        {
          ...plan.rows[0],
          attemptNodes: [{ ...plan.rows[0].attemptNodes![0], attempts: [attempts[2]] }],
        },
      ],
    };
    rerender(drawStable(next));
    expect(document.querySelectorAll('[data-attempt]')).toHaveLength(1);
    expect(document.querySelector('[data-attempt="succeeded"]')).not.toBeNull();
  });
  it('keeps visible outcome paint on every tiny clamped tick', () => {
    const plan = attemptPlan();
    const startedAt = Date.parse('2026-08-03T04:00:00Z');
    const endedAt = startedAt + 2 * 60000;
    const histories = ['failed', 'cancelled', 'succeeded', null].map((outcome, index) => ({
      ...attempts[0],
      attemptNumber: index + 1,
      startedAt,
      endedAt: outcome === null ? null : endedAt,
      outcome,
    }));
    plan.rows = [
      {
        ...plan.rows[0],
        attemptNodes: [{ ...plan.rows[0].attemptNodes![0], attempts: histories as AttemptView[] }],
      },
    ];
    render(
      <GanttPanel
        plan={plan}
        startDate={MONDAY_START}
        now={endedAt}
        scheduleError={null}
        generation={0}
        heightPx={null}
        dayPx={896}
        pointed={pointedAtRow(null)}
        onPickRow={() => undefined}
        onPointRow={() => undefined}
      />,
    );
    for (const outcome of ['failed', 'cancelled', 'succeeded', 'running']) {
      const mark = document.querySelector(`[data-attempt="${outcome}"]`)!;
      expect(mark).toHaveAttribute('data-clamped');
      expect(mark).toHaveAttribute('data-attempt-tick');
      const paint = mark.querySelector('[data-attempt-paint]')!;
      expect(Number(paint.getAttribute('width')) * 896).toBeCloseTo(4);
      expect(Number(paint.getAttribute('height'))).toBeGreaterThan(0);
      const fill = paint.getAttribute('fill')!;
      if (outcome === 'failed' || outcome === 'cancelled') {
        expect(fill).toMatch(/^url\(#.+\)$/);
        const pattern = document.getElementById(fill.slice(5, -1))!;
        if (outcome === 'failed') {
          expect(pattern.querySelector('path')).toHaveAttribute('stroke', '#991b1b');
          expect(pattern.querySelector('ellipse')).toBeNull();
        } else expect(pattern.querySelector('ellipse')).toHaveAttribute('fill', '#92400e');
      } else expect(fill).toBe('#166534');
      if (outcome === 'running') {
        expect(paint).toHaveAttribute('stroke', 'none');
        expect(mark.querySelector('[data-attempt-open-edge]')?.getAttribute('d')).toMatch(
          /^M .+ H .+ V .+ H .+$/,
        );
      }
    }
  });
  it('dismisses attempt facts when keyboard focus leaves the mark', () => {
    render(draw(attemptPlan()));
    const hit = document.querySelector('[data-attempt="cancelled"] [data-attempt-hit]')!;
    fireEvent.focus(hit);
    expect(screen.getByText('Reference: run/2')).toBeInTheDocument();
    fireEvent.blur(hit, { relatedTarget: document.querySelector('[data-gantt-day-scale]') });
    expect(screen.queryByText('Reference: run/2')).not.toBeInTheDocument();
  });
});
