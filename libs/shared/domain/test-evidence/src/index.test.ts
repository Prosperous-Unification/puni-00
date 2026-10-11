import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'bun:test';

import {
  compareThreshold,
  decodePerformanceCases,
  decodePerformanceMeasurement,
  decodePerformanceRun,
  decodePerformanceSelectionEnvironment,
  digestPerformanceDeclaration,
} from './index';

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

describe('Performance selection environment', () => {
  it('accepts only a canonical non-default shifted CI pair', () => {
    expect(decodePerformanceSelectionEnvironment({ CI: '1', E2E_PORT_SHIFT: '6000' })).toEqual({
      CI: '1',
      E2E_PORT_SHIFT: '6000',
    });
    for (const shift of ['0', '100', '1000', '1100', '06000', '1.0', '10000', '']) {
      expect(() =>
        decodePerformanceSelectionEnvironment({ CI: '1', E2E_PORT_SHIFT: shift }),
      ).toThrow();
    }
    for (const environment of [
      {},
      { CI: '1' },
      { CI: '0', E2E_PORT_SHIFT: '6000' },
      { CI: '1', E2E_PORT_SHIFT: '6000', PLAYWRIGHT_GREP: 'case' },
    ]) {
      expect(() => decodePerformanceSelectionEnvironment(environment)).toThrow();
    }
  });
});

describe('Performance case declaration', () => {
  it('binds the domain-separated declaration with canonical key order', () => {
    const decoded = decodePerformanceCases(declaration);
    const reordered = decodePerformanceCases({
      cases: declaration.cases,
      project: declaration.project,
      config: declaration.config,
      schemaVersion: 1,
    });
    expect(digestPerformanceDeclaration(decoded)).toBe(digestPerformanceDeclaration(reordered));
    expect(digestPerformanceDeclaration(decoded)).toMatch(/^[0-9a-f]{64}$/);
    expect(() =>
      digestPerformanceDeclaration(
        decodePerformanceCases({ ...declaration, cases: [{ ...caseRecord, threshold: -0 }] }),
      ),
    ).toThrow('canonically');
  });
  it('produces the same canonical SHA-256 vector in Bun and emitted Node ESM', async () => {
    const expected = '8c1df4f0bb152a042cad1b463d284d99740391ce7561ad6db969bdb0bf64b670';
    const root = mkdtempSync(join(tmpdir(), 'performance-hash-'));
    try {
      const output = join(root, 'node-result.json');
      // Node consumes emitted JavaScript; raw TypeScript source imports are not the runtime contract.
      const build = await Bun.build({
        entrypoints: [join(import.meta.dir, 'index.ts')],
        target: 'node',
        format: 'esm',
        outdir: root,
        naming: { entry: '[name].mjs' },
      });
      expect(build.success, build.logs.map((log) => log.message).join('\n')).toBe(true);
      expect(build.outputs).toHaveLength(1);
      const bundled = build.outputs[0];
      expect(bundled.path.endsWith('.mjs')).toBe(true);
      const source =
        "import {writeFileSync} from 'node:fs'; const contract=await import(process.argv[1]); let browserError; try { contract.decodeBrowserJson({}, '/tmp', 'browser.config.ts', [], 'list', undefined); } catch (error) { browserError=error.message; } writeFileSync(process.argv[3],JSON.stringify({digest:contract.digestPerformanceDeclaration(contract.decodePerformanceCases(JSON.parse(process.argv[2]))),browserError}));";
      const invocation = Bun.spawnSync(
        [
          'node',
          '--input-type=module',
          '-e',
          source,
          pathToFileURL(bundled.path).href,
          JSON.stringify(declaration),
          output,
        ],
        { stderr: 'pipe' },
      );
      expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
      expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({
        digest: expected,
        browserError: 'Browser config is malformed',
      });
      expect(digestPerformanceDeclaration(decodePerformanceCases(declaration))).toBe(expected);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
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
  it('decodes a strict one-case attachment and refuses schema or nonfinite values', () => {
    const measurement = {
      schemaVersion: 1,
      caseId: 'paint-ready',
      measurement: 'paint-ready',
      unit: 'ms',
      value: 180,
    };
    expect(decodePerformanceMeasurement(measurement).value).toBe(180);
    expect(() => decodePerformanceMeasurement({ ...measurement, extra: true })).toThrow(
      'Invalid Performance measurement',
    );
    expect(() =>
      decodePerformanceMeasurement({ ...measurement, value: Number.POSITIVE_INFINITY }),
    ).toThrow('finite');
  });
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
