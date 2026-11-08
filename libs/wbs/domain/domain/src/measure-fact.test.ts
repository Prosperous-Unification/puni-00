import { describe, expect, it } from 'bun:test';

import { type MeasureDefinition, SEEDED_MEASURE_DEFINITIONS } from './measure-definition';
import {
  agentMinutesOf,
  decideMeasureFact,
  definitionKeyOf,
  factMetricOf,
  type NodeAttempt,
} from './measure-fact';
import { rollUpMeasures } from './roll-up';

const SEEDED: readonly MeasureDefinition[] = SEEDED_MEASURE_DEFINITIONS.map((fields) => ({
  id: `m-${fields.key}`,
  ...fields,
}));

const GPU: MeasureDefinition = {
  id: 'm-gpu',
  key: 'gpu_minutes',
  name: 'GPU minutes',
  unit: 'min',
  kind: 'duration',
  scale: 'integer',
  threePoint: true,
  showByDefault: false,
  schedulesWork: false,
  derived: false,
  order: 6,
  currency: null,
};

const KWH: MeasureDefinition = { ...GPU, id: 'm-kwh', key: 'kwh', scale: 'real', order: 7 };

describe('factMetricOf and definitionKeyOf', () => {
  it('keeps tokens and hours under their legacy names and every other key as it is', () => {
    expect(factMetricOf('tokens')).toBe('token_actual');
    expect(factMetricOf('hours')).toBe('hours_actual');
    expect(factMetricOf('cost')).toBe('cost');
    expect(definitionKeyOf('token_actual')).toBe('tokens');
    expect(definitionKeyOf('hours_actual')).toBe('hours');
    expect(definitionKeyOf('token_estimate')).toBeNull();
    expect(definitionKeyOf('gpu_minutes')).toBe('gpu_minutes');
  });
});

describe('decideMeasureFact', () => {
  it('accepts a key or its legacy alias and answers the legacy name for tokens and hours', () => {
    const held = [...SEEDED, GPU];
    expect(decideMeasureFact(held, 'tokens', 12)).toEqual({ ok: true, metric: 'token_actual' });
    expect(decideMeasureFact(held, 'token_actual', 12)).toEqual({
      ok: true,
      metric: 'token_actual',
    });
    expect(decideMeasureFact(held, 'hours', 1.5)).toEqual({ ok: true, metric: 'hours_actual' });
    expect(decideMeasureFact(held, 'hours_actual', 1.5)).toEqual({
      ok: true,
      metric: 'hours_actual',
    });
    expect(decideMeasureFact(held, 'gpu_minutes', 3)).toEqual({ ok: true, metric: 'gpu_minutes' });
    expect(decideMeasureFact(held, 'cost', 2_500_000)).toEqual({ ok: true, metric: 'cost' });
    expect(decideMeasureFact(held, 'token_estimate', 1.5)).toEqual({
      ok: true,
      metric: 'token_estimate',
    });
  });

  // Proof: with the definition lookup matching any definition, this case
  // accepted `story_points` (4 pass, 5 fail); watched 2026-10-23.
  it('refuses a key the organization does not define', () => {
    expect(decideMeasureFact(SEEDED, 'story_points', 1)).toEqual({
      ok: false,
      reason: 'unknown_measure',
    });
    expect(decideMeasureFact(SEEDED, 'gpu_minutes', null)).toEqual({
      ok: false,
      reason: 'unknown_measure',
    });
  });

  // Proof: with the derived test removed, this case accepted a typed
  // agent_minutes fact; watched 2026-10-23.
  it('refuses a fact, and a clear, on a derived measure', () => {
    expect(decideMeasureFact(SEEDED, 'agent_minutes', 30)).toEqual({
      ok: false,
      reason: 'derived_measure',
    });
    expect(decideMeasureFact(SEEDED, 'agent_minutes', null)).toEqual({
      ok: false,
      reason: 'derived_measure',
    });
  });

  // Proof: with the scheduling test removed from decideMeasureFact, this case
  // accepted a `time` fact; watched 2026-10-23.
  it('refuses a fact, and a clear, in the scheduling measure', () => {
    for (const held of [SEEDED, null])
      for (const value of [2, null])
        expect(decideMeasureFact(held, 'time', value)).toEqual({
          ok: false,
          reason: 'scheduling_measure_fact',
        });
  });

  // Proof: with the integer test removed, this case accepted 1.5 tokens
  // (7 pass, 2 fail); watched 2026-10-23.
  it('refuses a fraction on an integer-scale measure and accepts one on a real scale', () => {
    const held = [...SEEDED, GPU, KWH];
    expect(decideMeasureFact(held, 'token_actual', 1.5)).toEqual({
      ok: false,
      reason: 'scale_mismatch',
    });
    expect(decideMeasureFact(held, 'gpu_minutes', 0.25)).toEqual({
      ok: false,
      reason: 'scale_mismatch',
    });
    expect(decideMeasureFact(held, 'kwh', 0.25)).toEqual({ ok: true, metric: 'kwh' });
    expect(decideMeasureFact(held, 'gpu_minutes', null)).toEqual({
      ok: true,
      metric: 'gpu_minutes',
    });
  });

  it('answers a project owned by no organization against tokens, hours and agent minutes', () => {
    expect(decideMeasureFact(null, 'token_actual', 3)).toEqual({
      ok: true,
      metric: 'token_actual',
    });
    expect(decideMeasureFact(null, 'hours', 2.5)).toEqual({ ok: true, metric: 'hours_actual' });
    expect(decideMeasureFact(null, 'tokens', 2.5)).toEqual({
      ok: false,
      reason: 'scale_mismatch',
    });
    expect(decideMeasureFact(null, 'cost', 3)).toEqual({ ok: false, reason: 'unknown_measure' });
    expect(decideMeasureFact(null, 'agent_minutes', 3)).toEqual({
      ok: false,
      reason: 'derived_measure',
    });
  });
});

const MINUTE = 60_000;

function ended(
  workItemId: string,
  stepId: string,
  attemptNumber: number,
  startedAt: number,
  endedAt: number,
): NodeAttempt {
  return {
    workItemId,
    stepId,
    attemptNumber,
    startedAt,
    endedAt,
    outcome: 'succeeded',
    executorPersonId: null,
    reference: null,
    note: null,
  };
}

function running(
  workItemId: string,
  stepId: string,
  attemptNumber: number,
  startedAt: number,
): NodeAttempt {
  return {
    workItemId,
    stepId,
    attemptNumber,
    startedAt,
    endedAt: null,
    outcome: null,
    executorPersonId: null,
    reference: null,
    note: null,
  };
}

describe('agentMinutesOf', () => {
  it('sums each node’s ended spans additively, overlaps counted twice, in whole minutes', () => {
    // Hand sum: a/dev 10 + 25 (overlapping 15..40 against 0..10 and 5..30)
    // = 10 + 25 = 35 minutes; a/qa 90 s rounds to 2; b/dev 29 s rounds to 0.
    const minutes = agentMinutesOf([
      ended('a', 'dev', 1, 0, 10 * MINUTE),
      ended('a', 'dev', 2, 5 * MINUTE, 30 * MINUTE),
      ended('a', 'qa', 1, 0, 90_000),
      ended('b', 'dev', 1, 1_000, 30_000),
    ]);
    expect(minutes).toEqual([
      {
        workItemId: 'a',
        stepId: 'dev',
        metric: 'agent_minutes',
        value: 35,
        recordedAt: 30 * MINUTE,
      },
      { workItemId: 'a', stepId: 'qa', metric: 'agent_minutes', value: 2, recordedAt: 90_000 },
      { workItemId: 'b', stepId: 'dev', metric: 'agent_minutes', value: 0, recordedAt: 30_000 },
    ]);
  });

  // Proof: with the running-attempt skip removed from agentMinutesOf, this
  // case failed alone (8 pass, 1 fail); watched 2026-10-23.
  it('counts ended attempts only; a running one adds nothing', () => {
    expect(
      agentMinutesOf([ended('a', 'dev', 1, 0, 30 * MINUTE), running('a', 'dev', 2, 0)]),
    ).toEqual([
      {
        workItemId: 'a',
        stepId: 'dev',
        metric: 'agent_minutes',
        value: 30,
        recordedAt: 30 * MINUTE,
      },
    ]);
    expect(agentMinutesOf([running('a', 'dev', 1, 0)])).toEqual([]);
    expect(agentMinutesOf([])).toEqual([]);
  });

  it('rolls up per subtree with the one-measure fold', () => {
    const rows = [
      { id: 'root', parentId: null },
      { id: 'a', parentId: 'root' },
      { id: 'b', parentId: 'root' },
    ];
    const folded = rollUpMeasures(
      rows,
      agentMinutesOf([ended('a', 'dev', 1, 0, 10 * MINUTE), ended('b', 'dev', 1, 0, 5 * MINUTE)]),
      'agent_minutes',
    );
    expect(folded.get('root')).toEqual(new Map([['dev', 15]]));
  });
});
