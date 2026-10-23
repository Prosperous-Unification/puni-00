import { describe, expect, test } from 'bun:test';

import { observation, source } from './fixture.test-support';
import { validateDeliveryObservation } from './observation';
import { summarizeDeliveryTiming } from './timing';

describe('delivery timing', () => {
  test('separates parallel summed duration from elapsed execution span', () => {
    const timing = summarizeDeliveryTiming(validateDeliveryObservation(observation()));
    expect(timing.sumExecutionMs).toEqual({ state: 'known', milliseconds: 25000, reasons: [] });
    expect(timing.elapsedMs).toEqual({ state: 'known', milliseconds: 18000, reasons: [] });
    expect(timing.attempts[0].waiting).toEqual({
      state: 'known',
      milliseconds: 2000,
      reasons: [],
      basis: 'attempt-start-to-execution-start',
    });
  });

  test('counts reruns once while carried and not-performed executions remain visible', () => {
    const reading = observation();
    const first = reading.runs[0].attempts[0];
    reading.runs[0].attempts.push({
      source: source('attempt:second'),
      startedAt: '2026-10-23T09:01:00Z',
      completedAt: '2026-10-23T09:01:12Z',
      executionsComplete: true,
      executions: [
        {
          ...first.executions[0],
          source: source('job:carried'),
          kind: 'carried',
          executionId: 'exec:α',
        },
        {
          ...first.executions[1],
          source: source('job:retry'),
          executionId: 'exec:retry',
          kind: 'performed',
          startedAt: '2026-10-23T09:01:02Z',
          completedAt: '2026-10-23T09:01:12Z',
          state: 'passed',
        },
        {
          ...first.executions[0],
          source: source('job:skipped'),
          kind: 'not-performed',
          executionId: null,
          startedAt: null,
          completedAt: null,
          state: 'skipped',
        },
      ],
    });
    const timing = summarizeDeliveryTiming(validateDeliveryObservation(reading));
    expect(timing.sumExecutionMs).toEqual({ state: 'known', milliseconds: 35000, reasons: [] });
    expect(timing.elapsedMs).toEqual({ state: 'known', milliseconds: 70000, reasons: [] });
    expect(timing.attempts[1]).toMatchObject({
      sumExecutionMs: { state: 'known', milliseconds: 10000, reasons: [] },
      elapsedMs: { state: 'known', milliseconds: 10000, reasons: [] },
      waiting: {
        state: 'known',
        milliseconds: 2000,
        reasons: [],
        basis: 'attempt-start-to-execution-start',
      },
    });
  });

  test('marks a known subtotal partial when an active execution has unknown completion', () => {
    const reading = observation();
    reading.runs[0].attempts[0].executions[1].completedAt = null;
    reading.runs[0].attempts[0].executions[1].state = 'running';
    const timing = summarizeDeliveryTiming(validateDeliveryObservation(reading));
    expect(timing.sumExecutionMs).toMatchObject({ state: 'partial', milliseconds: 10000 });
    expect(timing.elapsedMs).toMatchObject({ state: 'partial', milliseconds: 10000 });
  });

  test('keeps entirely unknown duration and waiting unknown instead of zero', () => {
    const reading = observation();
    const attempt = reading.runs[0].attempts[0];
    attempt.startedAt = null;
    for (const execution of attempt.executions) {
      execution.startedAt = null;
      execution.completedAt = null;
    }
    const timing = summarizeDeliveryTiming(validateDeliveryObservation(reading));
    expect(timing.sumExecutionMs).toMatchObject({ state: 'unknown', milliseconds: null });
    expect(timing.elapsedMs).toMatchObject({ state: 'unknown', milliseconds: null });
    expect(timing.attempts[0].waiting).toMatchObject({ state: 'unknown', milliseconds: null });
  });

  test('marks truncated attempts, execution inventory and runs partial', () => {
    for (const truncate of ['attempts', 'executions', 'runs']) {
      const reading = observation();
      if (truncate === 'attempts') reading.runs[0].attemptsComplete = false;
      if (truncate === 'executions') reading.runs[0].attempts[0].executionsComplete = false;
      if (truncate === 'runs') reading.coverage.runs = 'partial';
      expect(
        summarizeDeliveryTiming(validateDeliveryObservation(reading)).sumExecutionMs,
      ).toMatchObject({ state: 'partial', milliseconds: 25000 });
    }
  });

  test('does not infer success or elapsed time from an empty inventory', () => {
    const reading = observation();
    reading.checks = [];
    reading.runs = [];
    const timing = summarizeDeliveryTiming(validateDeliveryObservation(reading));
    expect(timing.sumExecutionMs).toEqual({ state: 'known', milliseconds: 0, reasons: [] });
    expect(timing.elapsedMs).toMatchObject({ state: 'unknown', milliseconds: null });
    reading.coverage.runs = 'partial';
    expect(
      summarizeDeliveryTiming(validateDeliveryObservation(reading)).sumExecutionMs,
    ).toMatchObject({ state: 'unknown', milliseconds: null });
  });
});

test('unknown execution attribution never adds a duration even when timestamps exist', () => {
  const reading = observation();
  reading.runs[0].attempts[0].executions[1].kind = 'unknown';
  const timing = summarizeDeliveryTiming(validateDeliveryObservation(reading));
  expect(timing.sumExecutionMs).toEqual({
    state: 'partial',
    milliseconds: 10000,
    reasons: ['Execution attribution is unknown'],
  });
  expect(timing.attempts[0].waiting).toMatchObject({
    state: 'partial',
    milliseconds: 2000,
    reasons: ['First performed execution start is uncertain'],
  });
});

test('waiting stays unknown if performed work predates the observed attempt basis', () => {
  const reading = observation();
  reading.runs[0].attempts[0].startedAt = '2026-10-23T09:00:10Z';
  expect(
    summarizeDeliveryTiming(validateDeliveryObservation(reading)).attempts[0].waiting,
  ).toMatchObject({
    state: 'unknown',
    milliseconds: null,
    reasons: ['Execution start predates the observed attempt start'],
  });
});

test('partial elapsed span retains a running execution start independently of its missing completion', () => {
  const reading = observation();
  const first = reading.runs[0].attempts[0].executions[0];
  first.completedAt = null;
  first.state = 'running';
  const timing = summarizeDeliveryTiming(validateDeliveryObservation(reading));
  expect(timing.sumExecutionMs).toMatchObject({ state: 'partial', milliseconds: 15000 });
  expect(timing.elapsedMs).toEqual({
    state: 'partial',
    milliseconds: 18000,
    reasons: ['Performed execution timing is incomplete'],
  });
  expect(timing.attempts[0].elapsedMs).toEqual({
    state: 'partial',
    milliseconds: 18000,
    reasons: ['Performed execution timing is incomplete'],
  });
});

test('partial elapsed span preserves independently known endpoints when no execution has a complete pair', () => {
  const reading = observation();
  const executions = reading.runs[0].attempts[0].executions;
  executions[0].completedAt = null;
  executions[0].state = 'running';
  executions[1].startedAt = null;
  const timing = summarizeDeliveryTiming(validateDeliveryObservation(reading));
  expect(timing.sumExecutionMs).toMatchObject({ state: 'unknown', milliseconds: null });
  expect(timing.elapsedMs).toEqual({
    state: 'partial',
    milliseconds: 18000,
    reasons: ['Performed execution timing is incomplete'],
  });
});

test('elapsed span stays unknown when sparse endpoints cannot establish a nonnegative span', () => {
  const reading = observation();
  const executions = reading.runs[0].attempts[0].executions;
  executions[0].startedAt = null;
  executions[1].startedAt = '2026-10-23T09:00:20Z';
  executions[1].completedAt = null;
  executions[1].state = 'running';
  const timing = summarizeDeliveryTiming(validateDeliveryObservation(reading));
  expect(timing.elapsedMs).toMatchObject({ state: 'unknown', milliseconds: null });
});
