import { describe, expect, it } from 'bun:test';

import { compareThreshold, decodePerformanceCases, decodePerformanceRun } from './index';

const caseRecord = {
  caseId: 'paint-ready',
  fixture: 'apps/wbs/fe-01/e2e-performance/paint.perf.spec.ts',
  titlePath: ['Paint', 'records readiness'],
  measurement: 'paint-ready',
  unit: 'ms',
  operator: 'lte',
  threshold: 200,
};

const declaration = {
  schemaVersion: 1,
  config: 'apps/wbs/fe-01/playwright.performance.config.ts',
  project: 'chromium',
  cases: [caseRecord],
};

describe('Performance case declaration', () => {
  it('accepts several distinct cases in one fixture', () => {
    expect(
      decodePerformanceCases({
        ...declaration,
        cases: [
          caseRecord,
          { ...caseRecord, caseId: 'paint-stable', titlePath: ['Paint', 'stays stable'] },
        ],
      }).cases,
    ).toHaveLength(2);
  });

  it('refuses duplicate case IDs and runner identities', () => {
    expect(() =>
      decodePerformanceCases({ ...declaration, cases: [caseRecord, caseRecord] }),
    ).toThrow('duplicate Performance case ID');
    expect(() =>
      decodePerformanceCases({
        ...declaration,
        cases: [caseRecord, { ...caseRecord, caseId: 'another' }],
      }),
    ).toThrow('duplicate Performance runner identity');
  });

  it('refuses paths that are not normalized workspace paths', () => {
    for (const fixture of [
      '../outside.spec.ts',
      '/absolute.spec.ts',
      'apps//wbs.spec.ts',
      'apps\\wbs.spec.ts',
    ]) {
      expect(() =>
        decodePerformanceCases({ ...declaration, cases: [{ ...caseRecord, fixture }] }),
      ).toThrow('normalized workspace path');
    }
  });

  it('distinguishes missing and malformed thresholds', () => {
    const { threshold: omitted, ...withoutThreshold } = caseRecord;
    expect(omitted).toBe(200);
    expect(() => decodePerformanceCases({ ...declaration, cases: [withoutThreshold] })).toThrow(
      'threshold',
    );
    expect(() =>
      decodePerformanceCases({
        ...declaration,
        cases: [{ ...caseRecord, threshold: Number.POSITIVE_INFINITY }],
      }),
    ).toThrow('finite threshold');
  });

  it('rejects undeclared fields, unknown units and operators', () => {
    expect(() => decodePerformanceCases({ ...declaration, unexpected: true })).toThrow();
    expect(() =>
      decodePerformanceCases({ ...declaration, cases: [{ ...caseRecord, unit: 'seconds' }] }),
    ).toThrow();
    expect(() =>
      decodePerformanceCases({ ...declaration, cases: [{ ...caseRecord, operator: 'equals' }] }),
    ).toThrow();
  });
});

describe('Performance observations', () => {
  const run = {
    schemaVersion: 1,
    exitCode: 0,
    cases: [
      {
        caseId: 'paint-ready',
        status: 'passed',
        observations: [{ measurement: 'paint-ready', unit: 'ms', value: 180 }],
      },
    ],
  };

  it('decodes a strict versioned run with finite observations', () => {
    expect(decodePerformanceRun(run).cases[0]?.observations[0]?.value).toBe(180);
    expect(() =>
      decodePerformanceRun({
        ...run,
        cases: [
          {
            ...run.cases[0],
            observations: [
              { measurement: 'paint-ready', unit: 'ms', value: Number.POSITIVE_INFINITY },
            ],
          },
        ],
      }),
    ).toThrow('finite');
  });

  it('rejects unknown fields, duplicate cases and duplicate observations', () => {
    expect(() => decodePerformanceRun({ ...run, extra: true })).toThrow('extra');
    expect(() => decodePerformanceRun({ ...run, cases: [run.cases[0], run.cases[0]] })).toThrow(
      'duplicate Performance execution case',
    );
    expect(() =>
      decodePerformanceRun({
        ...run,
        cases: [
          {
            ...run.cases[0],
            observations: [run.cases[0]?.observations[0], run.cases[0]?.observations[0]],
          },
        ],
      }),
    ).toThrow('duplicate Performance observation');
  });

  it('recomputes both threshold operators and rejects nonfinite comparisons', () => {
    expect(compareThreshold({ operator: 'lte', threshold: 200, observation: 180 })).toBe(true);
    expect(compareThreshold({ operator: 'lte', threshold: 200, observation: 220 })).toBe(false);
    expect(compareThreshold({ operator: 'gte', threshold: 200, observation: 220 })).toBe(true);
    expect(compareThreshold({ operator: 'gte', threshold: 200, observation: 180 })).toBe(false);
    expect(() =>
      compareThreshold({ operator: 'lte', threshold: 200, observation: Number.NaN }),
    ).toThrow('finite observation');
    expect(() =>
      compareThreshold({ operator: 'lte', threshold: Number.POSITIVE_INFINITY, observation: 180 }),
    ).toThrow('finite threshold');
  });
});
