import { describe, expect, it } from 'bun:test';

import { decodePerformanceCases } from './index';

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
