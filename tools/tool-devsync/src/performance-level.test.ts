import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { runPerformanceLevel } from './performance-level';

const roots: string[] = [];
const declarationPath = 'apps/wbs/fe-01/playwright.performance.cases.json';
const configPath = 'apps/wbs/fe-01/playwright.performance.config.ts';
const reportPath = 'tmp/junit/wbs-fe-01.performance.xml';
const bindingPath = 'tmp/junit/wbs-fe-01.performance.manifest.json';

const performanceCase = {
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
  cases: [performanceCase],
};

async function candidateRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'performance-level-'));
  roots.push(root);
  await mkdir(join(root, 'apps/wbs/fe-01'), { recursive: true });
  await writeFile(join(root, configPath), 'export default {};');
  await mkdir(join(root, 'tmp/junit'), { recursive: true });
  await writeFile(join(root, reportPath), '<testsuite tests="1" failures="0"/>');
  await writeFile(join(root, bindingPath), '{"status":"passed"}');
  return root;
}

async function writeDeclaration(root: string, candidate: unknown): Promise<void> {
  await writeFile(join(root, declarationPath), JSON.stringify(candidate));
}

async function expectFailure(operation: Promise<unknown>, phrase: string): Promise<void> {
  const failure: unknown = await operation.then(
    () => new Error('operation unexpectedly succeeded'),
    (error: unknown) => error,
  );
  expect(String(failure)).toContain(phrase);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Performance level target production boundary', () => {
  it('clears stale JUnit and refuses a valid empty selection before Playwright', async () => {
    const root = await candidateRoot();
    await writeDeclaration(root, { ...declaration, cases: [] });
    await expectFailure(
      runPerformanceLevel(root),
      'no-cases: no performance fixtures declare thresholds',
    );
    await expectFailure(readFile(join(root, reportPath)), 'ENOENT');
    await expectFailure(readFile(join(root, bindingPath)), 'ENOENT');
  });

  it('distinguishes an absent, unreadable and malformed declaration', async () => {
    const root = await candidateRoot();
    await expectFailure(runPerformanceLevel(root), 'ENOENT');
    await mkdir(join(root, declarationPath));
    await expectFailure(runPerformanceLevel(root), 'EISDIR');
    await rm(join(root, declarationPath), { recursive: true });
    await writeFile(join(root, declarationPath), '{');
    await expectFailure(runPerformanceLevel(root), 'JSON');
  });

  it('refuses invalid declaration UTF-8 before JSON or empty-case handling', async () => {
    const root = await candidateRoot();
    await writeFile(join(root, declarationPath), Buffer.from([0xff]));
    await expectFailure(runPerformanceLevel(root), 'UTF-8');
    await expectFailure(readFile(join(root, reportPath)), 'ENOENT');
  });

  it('distinguishes an absent or unreadable selected config even for empty cases', async () => {
    const root = await candidateRoot();
    await writeDeclaration(root, { ...declaration, cases: [] });
    await rm(join(root, configPath));
    await expectFailure(runPerformanceLevel(root), 'ENOENT');
    await mkdir(join(root, configPath));
    await expectFailure(runPerformanceLevel(root), 'EISDIR');
  });

  it('rejects a traversing fixture and a nonfinite or missing threshold', async () => {
    const root = await candidateRoot();
    for (const fixture of [
      '../outside.perf.spec.ts',
      '/absolute.perf.spec.ts',
      'apps//paint.perf.spec.ts',
      'apps\\paint.perf.spec.ts',
      'apps/\0paint.perf.spec.ts',
    ]) {
      await writeDeclaration(root, { ...declaration, cases: [{ ...performanceCase, fixture }] });
      await expectFailure(runPerformanceLevel(root), 'normalized workspace path');
    }
    await writeDeclaration(root, {
      ...declaration,
      cases: [{ ...performanceCase, threshold: null }],
    });
    await expectFailure(runPerformanceLevel(root), 'threshold');
    const { threshold: omitted, ...withoutThreshold } = performanceCase;
    expect(omitted).toBe(200);
    await writeDeclaration(root, { ...declaration, cases: [withoutThreshold] });
    await expectFailure(runPerformanceLevel(root), 'threshold');
    await writeFile(
      join(root, declarationPath),
      JSON.stringify(declaration).replace('"threshold":200', '"threshold":1e999'),
    );
    await expectFailure(runPerformanceLevel(root), 'finite threshold');
  });

  it('rejects changed config and project authority', async () => {
    const root = await candidateRoot();
    await writeDeclaration(root, { ...declaration, config: '../outside.config.ts' });
    await expectFailure(runPerformanceLevel(root), 'normalized workspace path');
    await writeDeclaration(root, { ...declaration, config: 'apps/wbs/fe-01/playwright.config.ts' });
    await expectFailure(runPerformanceLevel(root), 'config identity mismatch');
    await writeDeclaration(root, { ...declaration, project: 'firefox' });
    await expectFailure(runPerformanceLevel(root), 'project identity mismatch');
  });

  it('rejects missing title and duplicate case or runner identities', async () => {
    const root = await candidateRoot();
    await writeDeclaration(root, {
      ...declaration,
      cases: [{ ...performanceCase, titlePath: [] }],
    });
    await expectFailure(runPerformanceLevel(root), 'no full title path');
    await writeDeclaration(root, { ...declaration, cases: [performanceCase, performanceCase] });
    await expectFailure(runPerformanceLevel(root), 'duplicate Performance case ID');
    await writeDeclaration(root, {
      ...declaration,
      cases: [performanceCase, { ...performanceCase, caseId: 'second' }],
    });
    await expectFailure(runPerformanceLevel(root), 'duplicate Performance runner identity');
  });

  it('rejects undeclared schema fields and unsupported units or operators', async () => {
    const root = await candidateRoot();
    await writeDeclaration(root, { ...declaration, unexpected: true });
    await expectFailure(runPerformanceLevel(root), 'unexpected must be removed');
    await writeDeclaration(root, { ...declaration, schemaVersion: 2 });
    await expectFailure(runPerformanceLevel(root), 'schemaVersion');
    await writeDeclaration(root, {
      ...declaration,
      cases: [{ ...performanceCase, unexpected: true }],
    });
    await expectFailure(runPerformanceLevel(root), 'unexpected');
    await writeDeclaration(root, {
      ...declaration,
      cases: [{ ...performanceCase, unit: 'seconds' }],
    });
    await expectFailure(runPerformanceLevel(root), 'unit');
    await writeDeclaration(root, {
      ...declaration,
      cases: [{ ...performanceCase, operator: 'equals' }],
    });
    await expectFailure(runPerformanceLevel(root), 'operator');
  });
});
