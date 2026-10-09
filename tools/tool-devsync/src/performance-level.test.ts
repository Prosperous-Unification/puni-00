import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';
import { SaxesParser } from 'saxes';

import {
  assertPerformanceFindings,
  assertPreflight,
  decodeCandidateIdentity,
  readVerdict,
  runPerformanceLevel,
  xmlText,
} from './performance-level';

const roots: string[] = [];
const declarationPath = 'apps/wbs/fe-01/playwright.performance.cases.json';
const configPath = 'apps/wbs/fe-01/playwright.performance.config.ts';
const reportPath = 'tmp/junit/wbs-fe-01.performance.xml';
const bindingPath = 'tmp/junit/wbs-fe-01.performance.manifest.json';
const evidencePath = 'tmp/junit/wbs-fe-01.performance.evidence.json';

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

function git(root: string, args: string[]): void {
  const invocation = Bun.spawnSync(['git', '-C', root, ...args], { stderr: 'pipe' });
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
}

async function committedPerformanceFixture(
  value: number | 'hang' = 180,
  fault:
    | 'none'
    | 'dirty-discovery'
    | 'dirty-run'
    | 'commit-run'
    | 'mask-config'
    | 'mask-fixture'
    | 'skip-fixture'
    | 'change-candidate'
    | 'commit-discovery'
    | 'exit-list'
    | 'empty-list'
    | 'version-run'
    | 'missing-result'
    | 'missing-attachment'
    | 'failed-run'
    | 'skipped-run'
    | 'invalid-json-utf8' = 'none',
  title = 'records readiness',
): Promise<{ root: string; policyPath: string; preloadSentinel: string }> {
  const parent = await mkdtemp(join(tmpdir(), 'performance-execution-'));
  roots.push(parent);
  const root = join(parent, 'candidate');
  const preloadSentinel = join(parent, 'candidate-preload-sentinel');
  await mkdir(join(root, 'apps/wbs/fe-01/e2e-performance'), { recursive: true });
  await writeFile(join(root, 'bunfig.toml'), 'preload = ["./preload.ts"]\n');
  await writeFile(
    join(root, 'preload.ts'),
    `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(preloadSentinel)}, 'candidate preload ran');\n`,
  );
  await writeFile(
    join(root, '.gitignore'),
    'tmp/\nnode_modules\ntest-results/\nplaywright-report/\n',
  );
  const discoveryFault =
    fault === 'dirty-discovery'
      ? "if (process.argv.includes('--list')) writeFileSync('discovery-untracked.txt', 'changed');\n"
      : fault === 'commit-discovery'
        ? `if (process.argv.includes('--list')) writeFileSync(${JSON.stringify(join(root, '.git/HEAD'))}, readFileSync(${JSON.stringify(join(parent, 'alternate-head'))}));\n`
        : fault === 'exit-list'
          ? "if (process.argv.includes('--list')) process.on('exit', () => { process.exitCode = 7; });\n"
          : '';
  const reporterFault =
    fault === 'invalid-json-utf8'
      ? "process.on('exit', () => appendFileSync(process.env['PLAYWRIGHT_JSON_OUTPUT_FILE'], Buffer.from([0xff])));\n"
      : fault === 'empty-list'
        ? "if (process.argv.includes('--list')) process.on('exit', () => writeFileSync(process.env['PLAYWRIGHT_JSON_OUTPUT_FILE'], ''));\n"
        : fault === 'version-run'
          ? "if (!process.argv.includes('--list')) process.on('exit', () => { const output = process.env['PLAYWRIGHT_JSON_OUTPUT_FILE']; if (existsSync(output)) { const report = JSON.parse(readFileSync(output, 'utf8')); report.config.version = '0.0.0'; writeFileSync(output, JSON.stringify(report)); } });\n"
          : fault === 'missing-result'
            ? "if (!process.argv.includes('--list')) process.on('exit', () => { const output = process.env['PLAYWRIGHT_JSON_OUTPUT_FILE']; if (existsSync(output)) { const report = JSON.parse(readFileSync(output, 'utf8')); const scrub = (suite) => { for (const spec of suite.specs || []) for (const selected of spec.tests || []) selected.results = []; for (const child of suite.suites || []) scrub(child); }; for (const suite of report.suites) scrub(suite); writeFileSync(output, JSON.stringify(report)); } });\n"
            : '';
  const configSource = `import { writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';\nimport { execFileSync } from 'node:child_process';\nimport { defineConfig } from '@playwright/test';\n${discoveryFault}${reporterFault}export default defineConfig({ testDir: './e2e-performance', testMatch: /.*\\.perf\\.spec\\.ts/, grep: process.env['PLAYWRIGHT_GREP'], projects: [{ name: 'chromium' }], workers: 1, retries: 0 });\n`;
  await writeFile(join(root, configPath), configSource);
  const selectedCase = { ...performanceCase, titlePath: ['Paint', title] };
  await writeDeclaration(root, { ...declaration, cases: [selectedCase] });
  const wait =
    value === 'hang' ? 'await new Promise((resolve) => setTimeout(resolve, 60_000)); ' : '';
  const faultSource =
    fault === 'dirty-run'
      ? "writeFileSync('run-untracked.txt', 'changed'); "
      : fault === 'commit-run'
        ? "execFileSync('git', ['commit', '--allow-empty', '-qm', 'changed checkout']); "
        : fault === 'mask-config'
          ? `appendFileSync(${JSON.stringify(configPath)}, '\\n// changed'); execFileSync('git', ['update-index', '--assume-unchanged', ${JSON.stringify(configPath)}]); `
          : fault === 'mask-fixture'
            ? `appendFileSync(${JSON.stringify(performanceCase.fixture)}, '\\n// changed'); execFileSync('git', ['update-index', '--assume-unchanged', ${JSON.stringify(performanceCase.fixture)}]); `
            : fault === 'skip-fixture'
              ? `appendFileSync(${JSON.stringify(performanceCase.fixture)}, '\\n// changed'); execFileSync('git', ['update-index', '--skip-worktree', ${JSON.stringify(performanceCase.fixture)}]); `
              : fault === 'change-candidate'
                ? `execFileSync('git', ['-C', ${JSON.stringify(root)}, 'commit', '--allow-empty', '-qm', 'new candidate']); `
                : fault === 'failed-run'
                  ? "throw new Error('fixture failed after measurement'); "
                  : fault === 'skipped-run'
                    ? 'test.skip(); '
                    : '';
  const attachmentSource =
    fault === 'missing-attachment'
      ? ''
      : `await testInfo.attach('puni.performance.observation.v1', { body: JSON.stringify({ schemaVersion: 1, caseId: 'paint-ready', measurement: 'paint-ready', unit: 'ms', value: ${value === 'hang' ? '180' : String(value)} }), contentType: 'application/json' }); `;
  await writeFile(
    join(root, performanceCase.fixture),
    `import { writeFileSync, appendFileSync } from 'node:fs';\nimport { execFileSync } from 'node:child_process';\nimport { test } from '@playwright/test';\ntest.describe('Paint', () => { test(${JSON.stringify(title)}, async ({}, testInfo) => { ${wait}${attachmentSource}${faultSource} }); });\n`,
  );
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Performance Proof']);
  git(root, ['config', 'user.email', 'performance@example.invalid']);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'synthetic performance fixture']);
  if (fault === 'commit-discovery') {
    const original = Bun.spawnSync(['git', '-C', root, 'rev-parse', 'HEAD'])
      .stdout.toString()
      .trim();
    git(root, ['commit', '--allow-empty', '-qm', 'alternate discovery revision']);
    const alternate = Bun.spawnSync(['git', '-C', root, 'rev-parse', 'HEAD'])
      .stdout.toString()
      .trim();
    git(root, ['reset', '--hard', original]);
    await writeFile(join(parent, 'alternate-head'), `${alternate}\n`);
  }
  const ruleIds = [
    'F1',
    'F7',
    'INV-CLASSIFY',
    'K2',
    'K3',
    'K4',
    'K5',
    'K6',
    'MOD-DIRECT-ENTRIES',
    'MOD-INDEX',
    'MOD-LAYOUT',
    'PERF-THRESHOLD',
    'REL-EXTRACT',
  ];
  const runnerVersion = (
    JSON.parse(
      await readFile(
        join(import.meta.dir, '../../../node_modules/playwright/package.json'),
        'utf8',
      ),
    ) as { version: string }
  ).version;
  const policyPath = join(parent, 'policy.json');
  await writeFile(
    policyPath,
    JSON.stringify({
      schemaVersion: 1,
      policyId: 'scratch-performance-run',
      ruleModes: ruleIds.map((ruleId) => ({ ruleId, mode: 'enforce' })),
      performance: {
        acceptedDeclarationSchema: 1,
        declarationPath,
        config: configPath,
        configDigest: new Bun.CryptoHasher('sha256').update(configSource).digest('hex'),
        project: 'chromium',
        runnerVersion,
        reviewedCases: [
          {
            caseId: 'paint-ready',
            caseDigest: new Bun.CryptoHasher('sha256')
              .update(
                `${JSON.stringify({ schemaVersion: 1, kind: 'performance-case', record: selectedCase }, (_field, value: unknown) => (value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))) : value))}\n`,
              )
              .digest('hex'),
          },
        ],
      },
    }),
  );
  return { root, policyPath, preloadSentinel };
}

async function expectFailure(operation: Promise<unknown>, phrase: string): Promise<void> {
  const failure: unknown = await operation.then(
    () => new Error('operation unexpectedly succeeded'),
    (error: unknown) => error,
  );
  expect(String(failure)).toContain(phrase);
}

async function withAlteredBurokratVerdict(
  phase: 'preflight' | 'run',
  alter: (verdict: Record<string, unknown>) => Record<string, unknown> | string,
  exercise: () => Promise<void>,
): Promise<void> {
  const originalSpawn = Bun.spawnSync;
  const substitute = (...argumentsList: Parameters<typeof Bun.spawnSync>) => {
    const call = originalSpawn(...argumentsList);
    const argv = argumentsList[0];
    if (!Array.isArray(argv) || !argv.includes('check')) return call;
    const isRun = argv.includes('--performance-evidence');
    if (isRun !== (phase === 'run')) return call;
    const verdict = JSON.parse((call.stdout ?? Buffer.alloc(0)).toString()) as Record<
      string,
      unknown
    >;
    const altered = alter(verdict);
    const source = typeof altered === 'string' ? altered : JSON.stringify(altered);
    return {
      ...call,
      exitCode: typeof altered === 'string' ? call.exitCode : altered['allowed'] === false ? 1 : 0,
      stdout: Buffer.from(source),
    };
  };
  Object.defineProperty(Bun, 'spawnSync', { value: substitute });
  try {
    await exercise();
  } finally {
    Object.defineProperty(Bun, 'spawnSync', { value: originalSpawn });
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Performance level target production boundary', () => {
  it('refuses malformed or unbound Burokrat candidate identities', () => {
    const revision = 'b'.repeat(40);
    const identity = {
      schemaVersion: 1,
      tool: 'twilight-burokrat',
      toolVersion: '0.1.0',
      candidate: 'a'.repeat(64),
      selection: { kind: 'committed', revision },
      certifies: false,
    };
    const decode = (record: unknown, exitCode = 0) =>
      decodeCandidateIdentity(
        { exitCode, stdout: JSON.stringify(record), stderr: 'unavailable' },
        revision,
      );
    expect(decode(identity)).toBe(identity.candidate);
    expect(() => decode(identity, 1)).toThrow('identity unavailable');
    expect(() => decode({ ...identity, candidate: 'short' })).toThrow('selection mismatch');
    expect(() => decode({ ...identity, certifies: true })).toThrow('selection mismatch');
    expect(() =>
      decode({ ...identity, selection: { kind: 'committed', revision: 'c'.repeat(40) } }),
    ).toThrow('selection mismatch');
    expect(() => decode({ ...identity, selection: { kind: 'working', revision } })).toThrow(
      'selection mismatch',
    );
    expect(() => decode({ ...identity, toolVersion: '0.0.0' })).toThrow('tool version mismatch');
    expect(() => decode({ ...identity, schemaVersion: 2 })).toThrow('tool version mismatch');
    expect(() => decode(null)).toThrow('malformed');
  });
  it('refuses malformed or foreign Burokrat PERF verdicts at the production decoder', () => {
    const verdict = {
      schemaVersion: 1,
      candidate: 'a'.repeat(64),
      policy: 'reviewed-policy',
      ruleIds: ['PERF-THRESHOLD'],
      findings: [] as { ruleId: string; path: string; message: string; effect: string }[],
      unevaluated: [] as { ruleId: string; reason: string }[],
      allowed: true,
      certifies: false,
    };
    const decode = (record: unknown, exitCode = 0) =>
      readVerdict({ exitCode, stdout: JSON.stringify(record), stderr: '' }, 'run');
    expect(decode(verdict).allowed).toBe(true);
    expect(() => decode({ ...verdict, schemaVersion: 2 })).toThrow('shape is malformed');
    expect(() => decode({ ...verdict, ruleIds: ['MOD-INDEX'] })).toThrow('shape is malformed');
    expect(() => decode({ ...verdict, candidate: 'short' })).toThrow('shape is malformed');
    expect(() =>
      decode({
        ...verdict,
        findings: [{ ruleId: 'MOD-INDEX', path: '.', message: 'foreign', effect: 'refusal' }],
      }),
    ).toThrow('finding is malformed');
    expect(() =>
      decode({
        ...verdict,
        findings: [{ ruleId: 'PERF-THRESHOLD', path: '.', message: 'failure', effect: 'unknown' }],
      }),
    ).toThrow('finding is malformed');
    expect(() =>
      decode({ ...verdict, unevaluated: [{ ruleId: 'MOD-INDEX', reason: 'foreign' }] }),
    ).toThrow('unevaluated rule is malformed');
    expect(() => decode({ ...verdict, allowed: false }, 0)).toThrow('exit status disagree');
    expect(() => decode(verdict, 1)).toThrow('exit status disagree');
    const debt = {
      ...verdict,
      findings: [
        {
          ruleId: 'PERF-THRESHOLD',
          path: performanceCase.fixture,
          message: 'measured debt',
          effect: 'debt',
        },
      ],
    };
    expect(decode(debt).allowed).toBe(true);
    const refusal = {
      ...verdict,
      findings: [
        {
          ruleId: 'PERF-THRESHOLD',
          path: performanceCase.fixture,
          message: 'measured refusal',
          effect: 'refusal',
        },
      ],
      allowed: false,
    };
    expect(decode(refusal, 1).allowed).toBe(false);
    expect(() =>
      readVerdict({ exitCode: 1, stdout: '', stderr: 'tool unavailable' }, 'preflight'),
    ).toThrow('preflight unavailable');
    expect(() => readVerdict({ exitCode: 0, stdout: '{', stderr: '' }, 'run')).toThrow(
      'malformed Burokrat Performance run JSON',
    );
    expect(() => readVerdict({ exitCode: 0, stdout: '{}', stderr: '' }, 'run')).toThrow(
      'run verdict is malformed',
    );
  });

  it('requires the selected candidate and one exact PERF missing-run preflight record', () => {
    const candidate = 'a'.repeat(64);
    const preflight = {
      candidate,
      findings: [],
      unevaluated: [
        { ruleId: 'PERF-THRESHOLD' as const, reason: 'Performance run evidence is not supplied' },
      ],
      allowed: false,
    };
    expect(() => {
      assertPreflight(preflight, candidate);
    }).not.toThrow();
    expect(() => {
      assertPreflight({ ...preflight, candidate: 'b'.repeat(64) }, candidate);
    }).toThrow('preflight did not select');
    expect(() => {
      assertPreflight({ ...preflight, unevaluated: [] }, candidate);
    }).toThrow('preflight did not select');
    expect(() => {
      assertPreflight(
        { ...preflight, unevaluated: [{ ruleId: 'PERF-THRESHOLD', reason: 'different refusal' }] },
        candidate,
      );
    }).toThrow('preflight did not select');
  });
  it('reconciles only the measured case findings from Burokrat', () => {
    const expected = [
      {
        path: performanceCase.fixture,
        message: 'Performance case paint-ready did not meet its reviewed threshold',
      },
    ];
    const finding = {
      ...expected[0],
      ruleId: 'PERF-THRESHOLD' as const,
      effect: 'refusal' as const,
    };
    expect(() => {
      assertPerformanceFindings([finding], expected);
    }).not.toThrow();
    expect(() => {
      assertPerformanceFindings([], expected);
    }).toThrow('findings differ');
    expect(() => {
      assertPerformanceFindings([{ ...finding, path: 'other.ts' }], expected);
    }).toThrow('findings differ');
    expect(() => {
      assertPerformanceFindings([finding, finding], expected);
    }).toThrow('findings differ');
    const second = {
      path: 'apps/wbs/fe-01/e2e-performance/second.perf.spec.ts',
      message: 'second breach',
    };
    expect(() => {
      assertPerformanceFindings([finding, finding], [expected[0], second]);
    }).toThrow('findings differ');
  });
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

  it('requires a committed candidate before any nonempty Performance run', async () => {
    const root = await candidateRoot();
    await writeDeclaration(root, declaration);
    await expectFailure(runPerformanceLevel(root), 'committed Git candidate');
    await expectFailure(readFile(join(root, reportPath)), 'ENOENT');
    await expectFailure(readFile(join(root, bindingPath)), 'ENOENT');
  });

  it('runs a scratch-only Playwright fixture and writes non-certifying bound evidence', async () => {
    const fixture = await committedPerformanceFixture();
    const oldSelector = process.env['PLAYWRIGHT_GREP'];
    process.env['PLAYWRIGHT_GREP'] = 'this-title-does-not-exist';
    try {
      await runPerformanceLevel(fixture.root, fixture.policyPath);
    } finally {
      if (oldSelector === undefined) delete process.env['PLAYWRIGHT_GREP'];
      else process.env['PLAYWRIGHT_GREP'] = oldSelector;
    }
    const report = await readFile(join(fixture.root, reportPath), 'utf8');
    const evidence = JSON.parse(await readFile(join(fixture.root, evidencePath), 'utf8')) as {
      run: { cases: { observations: { value: number }[] }[] };
    };
    const binding = JSON.parse(await readFile(join(fixture.root, bindingPath), 'utf8')) as {
      certifies: boolean;
      report: { digest: string };
      evidence: { digest: string };
    };
    expect(report).toContain('file="apps/wbs/fe-01/e2e-performance/paint.perf.spec.ts"');
    const parsed = new SaxesParser();
    const seenFiles: string[] = [];
    parsed.on('opentag', (tag) => {
      if (tag.name === 'testcase') seenFiles.push(tag.attributes['file']);
    });
    parsed.write(report).close();
    expect(seenFiles).toEqual([performanceCase.fixture]);
    expect(evidence.run.cases[0]?.observations[0]?.value).toBe(180);
    expect(binding.certifies).toBe(false);
    expect(binding.report.digest).toBe(new Bun.CryptoHasher('sha256').update(report).digest('hex'));
    expect(binding.evidence.digest).toMatch(/^[0-9a-f]{64}$/);
    await expectFailure(readFile(fixture.preloadSentinel), 'ENOENT');
  }, 60_000);

  it('emits an honest failing JUnit for an evaluated threshold breach', async () => {
    const fixture = await committedPerformanceFixture(280);
    await expectFailure(runPerformanceLevel(fixture.root, fixture.policyPath), 'threshold');
    const report = await readFile(join(fixture.root, reportPath), 'utf8');
    expect(report).toContain('failures="1"');
    expect(report).toContain('<failure');
    expect(report).toContain('file="apps/wbs/fe-01/e2e-performance/paint.perf.spec.ts"');
  }, 60_000);

  it('kills a hung Playwright child and leaves no reusable output', async () => {
    const fixture = await committedPerformanceFixture('hang');
    await mkdir(join(fixture.root, 'tmp/junit'), { recursive: true });
    await writeFile(join(fixture.root, reportPath), '<testsuite tests="1" failures="0"/>');
    await expectFailure(runPerformanceLevel(fixture.root, fixture.policyPath), 'timed out');
    await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
    await expectFailure(readFile(join(fixture.root, bindingPath)), 'ENOENT');
    await expectFailure(readFile(join(fixture.root, evidencePath)), 'ENOENT');
  }, 35_000);

  it('refuses persistent checkout changes between discovery and execution', async () => {
    const fixture = await committedPerformanceFixture(180, 'dirty-discovery');
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath),
      'checkout changed after discovery',
    );
    await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
  }, 30_000);

  it('refuses nonzero discovery and a successful discovery without reporter bytes', async () => {
    for (const [fault, phrase] of [
      ['exit-list', 'discovery failed'],
      ['empty-list', 'discovery emitted no JSON'],
    ] as const) {
      const fixture = await committedPerformanceFixture(180, fault);
      await expectFailure(runPerformanceLevel(fixture.root, fixture.policyPath), phrase);
      await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
    }
  }, 40_000);

  it('refuses a candidate HEAD changed by Playwright discovery', async () => {
    const fixture = await committedPerformanceFixture(180, 'commit-discovery');
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath),
      'candidate revision changed after discovery',
    );
    await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
  }, 30_000);

  it('refuses a run whose runner version differs from discovery', async () => {
    const fixture = await committedPerformanceFixture(180, 'version-run');
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath),
      'discovery and execution selection changed',
    );
    await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
  }, 30_000);

  it('refuses missing measured attachments on the actual runner path', async () => {
    const fixture = await committedPerformanceFixture(180, 'missing-attachment');
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath),
      'needs exactly one fresh observation attachment',
    );
    await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
  }, 30_000);

  it('refuses an execution report without a case result on the actual runner path', async () => {
    const fixture = await committedPerformanceFixture(180, 'missing-result');
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath),
      'run needs one result',
    );
    await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
  }, 30_000);

  it('refuses a dirty, committed or content-masked checkout after execution', async () => {
    for (const [fault, phrase] of [
      ['dirty-run', 'checkout changed after execution'],
      ['commit-run', 'checkout HEAD changed after execution'],
      ['mask-config', 'checkout inputs differ after execution'],
      ['mask-fixture', 'tracked input index flags changed after execution'],
      ['skip-fixture', 'tracked input index flags changed after execution'],
    ] as const) {
      const fixture = await committedPerformanceFixture(180, fault);
      await expectFailure(runPerformanceLevel(fixture.root, fixture.policyPath), phrase);
      await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
    }
  }, 40_000);

  it('refuses a candidate revision changed during Playwright execution', async () => {
    const fixture = await committedPerformanceFixture(180, 'change-candidate');
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath),
      'candidate revision changed',
    );
    await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
  }, 30_000);

  it('refuses dirty or nested committed candidate roots before Playwright', async () => {
    const dirty = await committedPerformanceFixture();
    await writeFile(join(dirty.root, 'untracked-candidate.txt'), 'changed');
    await expectFailure(runPerformanceLevel(dirty.root, dirty.policyPath), 'candidate is dirty');
    const nested = await committedPerformanceFixture();
    const nestedRoot = join(nested.root, 'nested');
    await mkdir(join(nestedRoot, 'apps/wbs/fe-01'), { recursive: true });
    await writeFile(join(nestedRoot, declarationPath), JSON.stringify(declaration));
    await writeFile(join(nestedRoot, configPath), 'export default {};');
    await expectFailure(runPerformanceLevel(nestedRoot, nested.policyPath), 'root differs');
  }, 30_000);

  it('requires an externally selected readable policy before Playwright', async () => {
    const fixture = await committedPerformanceFixture();
    const priorPolicy = process.env['PUNI_PERFORMANCE_RULE_POLICY'];
    delete process.env['PUNI_PERFORMANCE_RULE_POLICY'];
    try {
      await expectFailure(runPerformanceLevel(fixture.root), 'externally selected');
      await expectFailure(
        runPerformanceLevel(fixture.root, join(fixture.root, 'missing-policy.json')),
        'ENOENT',
      );
    } finally {
      if (priorPolicy !== undefined) process.env['PUNI_PERFORMANCE_RULE_POLICY'] = priorPolicy;
    }
  }, 30_000);

  it('refuses preflight when the selected policy omits Performance authority', async () => {
    const fixture = await committedPerformanceFixture();
    const policy = JSON.parse(await readFile(fixture.policyPath, 'utf8')) as Record<
      string,
      unknown
    >;
    delete policy['performance'];
    await writeFile(fixture.policyPath, JSON.stringify(policy));
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath),
      'preflight unavailable',
    );
    await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
  }, 30_000);

  it('refuses missing or malformed Burokrat preflight transport before Playwright', async () => {
    for (const [source, phrase] of [
      ['', 'preflight unavailable'],
      ['{', 'malformed Burokrat Performance preflight JSON'],
      ['{}', 'preflight verdict is malformed'],
    ] as const) {
      const fixture = await committedPerformanceFixture();
      await withAlteredBurokratVerdict(
        'preflight',
        () => source,
        async () => {
          await expectFailure(runPerformanceLevel(fixture.root, fixture.policyPath), phrase);
        },
      );
      await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
    }
  }, 30_000);

  it('refuses a foreign candidate or unevaluated obligation in the measured verdict', async () => {
    for (const alter of [
      (verdict: Record<string, unknown>) => ({ ...verdict, candidate: 'b'.repeat(64) }),
      (verdict: Record<string, unknown>) => ({
        ...verdict,
        allowed: false,
        unevaluated: [{ ruleId: 'PERF-THRESHOLD', reason: 'injected missing measurement' }],
      }),
    ]) {
      const fixture = await committedPerformanceFixture();
      await withAlteredBurokratVerdict('run', alter, async () => {
        await expectFailure(
          runPerformanceLevel(fixture.root, fixture.policyPath),
          'judge refused the measured run',
        );
      });
      await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
    }
  }, 35_000);

  it('refuses failed or skipped Playwright cases despite passing measurements', async () => {
    for (const fault of ['failed-run', 'skipped-run'] as const) {
      const fixture = await committedPerformanceFixture(180, fault);
      await expectFailure(runPerformanceLevel(fixture.root, fixture.policyPath), 'Performance');
      const report = await readFile(join(fixture.root, reportPath), 'utf8').catch(() => 'absent');
      expect(report).not.toContain('failures="0"');
    }
  }, 35_000);

  it('rejects XML-forbidden identities and preserves attribute whitespace on round trip', () => {
    expect(() => xmlText('bad\u0001title')).toThrow('XML-forbidden');
    expect(() => xmlText('bad\ud800title')).toThrow('XML-forbidden');
    const escaped = `<testcase name="${xmlText('tab\tline\nreturn\r')}"/>`;
    const parsed = new SaxesParser();
    let parsedName = '';
    parsed.on('opentag', (tag) => {
      parsedName = tag.attributes['name'];
    });
    parsed.write(escaped).close();
    expect(parsedName).toBe('tab\tline\nreturn\r');
    expect(escaped).toContain('&#9;');
    expect(escaped).toContain('&#10;');
    expect(escaped).toContain('&#13;');
  });

  it('refuses a measured case with an XML-forbidden title before emitting JUnit', async () => {
    const fixture = await committedPerformanceFixture(180, 'none', 'bad\u0001title');
    await expectFailure(runPerformanceLevel(fixture.root, fixture.policyPath), 'XML-forbidden');
    await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
  }, 30_000);

  it('round-trips measured title whitespace through parsed JUnit attributes', async () => {
    const title = 'tab\tline\nreturn\r';
    const fixture = await committedPerformanceFixture(180, 'none', title);
    await runPerformanceLevel(fixture.root, fixture.policyPath);
    const report = await readFile(join(fixture.root, reportPath), 'utf8');
    const parsed = new SaxesParser();
    let parsedTitle = '';
    parsed.on('opentag', (tag) => {
      if (tag.name === 'testcase') parsedTitle = tag.attributes['name'];
    });
    parsed.write(report).close();
    expect(parsedTitle).toBe(`Paint › ${title}`);
    expect(report).toContain('&#9;');
    expect(report).toContain('&#10;');
    expect(report).toContain('&#13;');
  }, 30_000);

  it('refuses invalid UTF-8 in the actual Playwright JSON reporter file', async () => {
    const fixture = await committedPerformanceFixture(180, 'invalid-json-utf8');
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath),
      'reporter output is not valid UTF-8',
    );
    await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
  }, 30_000);
});
