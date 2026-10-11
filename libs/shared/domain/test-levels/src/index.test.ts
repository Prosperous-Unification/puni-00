import { describe, expect, it } from 'bun:test';

import { classifyTestFile, type TestLevel, type TestLevelFacts } from './index';

const facts: TestLevelFacts = {
  frontendSourceRoot: 'apps/wbs/fe-01/src',
  manualProcedures: new Set(['docs/manual/plan.md']),
  conformanceFiles: new Set([
    'libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts',
  ]),
  architectureFixtures: new Set(['tools/tool-devsync/src/negative.test.ts']),
  performanceFiles: new Set(['apps/wbs/fe-01/e2e/performance.spec.ts']),
  browserFiles: new Set([
    'apps/wbs/fe-01/e2e/performance.spec.ts',
    'apps/wbs/fe-01/e2e/plan.spec.ts',
    'libs/wbs/application/core/testing/portable-composition.spec.ts',
  ]),
  frontendNodeSuites: new Set(['apps/wbs/fe-01/src/lib/pure.test.ts']),
};

describe('ordered test level table', () => {
  it('uses the first matching rule across all eight levels', () => {
    const cases: readonly [string, TestLevel][] = [
      ['docs/manual/plan.md', 'manual'],
      ['libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts', 'conformance'],
      ['tools/tool-devsync/src/negative.test.ts', 'architecture'],
      ['apps/wbs/fe-01/e2e/performance.spec.ts', 'performance'],
      ['apps/wbs/fe-01/e2e/plan.spec.ts', 'browser'],
      ['libs/wbs/application/core/testing/portable-composition.spec.ts', 'browser'],
      ['apps/wbs/be-01/src/repository.db.test.ts', 'api'],
      ['apps/wbs/be-01/src/repository.db.test.tsx', 'view'],
      ['apps/wbs/fe-01/src/lib/pure.test.ts', 'unit'],
      ['apps/wbs/fe-01/src/components/board.test.ts', 'view'],
      ['libs/wbs/domain/model/render.test.tsx', 'view'],
      ['libs/wbs/domain/model/aggregate.test.ts', 'unit'],
    ];
    for (const [path, level] of cases) expect(classifyTestFile(path, facts)).toBe(level);
  });

  it('refuses unknown files and performance claims outside a browser suite', () => {
    expect(() => classifyTestFile('elsewhere/check.spec.ts', facts)).toThrow('matches no row');
    expect(() => classifyTestFile('elsewhere/check.db.test.js', facts)).toThrow('matches no row');
    expect(() => classifyTestFile('elsewhere/check.test.jsx', facts)).toThrow('matches no row');
    expect(() =>
      classifyTestFile('elsewhere/check.spec.ts', {
        ...facts,
        performanceFiles: new Set(['elsewhere/check.spec.ts']),
      }),
    ).toThrow('not in a declared Playwright suite');
  });

  it('keeps the first policy row when memberships overlap', () => {
    const path = 'apps/wbs/fe-01/e2e/plan.spec.ts';
    expect(classifyTestFile(path, { ...facts, manualProcedures: new Set([path]) })).toBe('manual');
    expect(
      classifyTestFile('libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts', {
        ...facts,
        conformanceFiles: new Set([
          'libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts',
        ]),
      }),
    ).toBe('conformance');
  });

  it('takes the frontend source root from caller evidence', () => {
    expect(
      classifyTestFile('apps/example/src/board.test.ts', {
        ...facts,
        frontendSourceRoot: 'apps/example/src',
      }),
    ).toBe('view');
    expect(classifyTestFile('apps/example/src/board.test.ts', facts)).toBe('unit');
  });
});
