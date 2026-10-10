import { closeSync, constants, openSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dlopen, ptr } from 'bun:ffi';
import { afterEach, describe, expect, it } from 'bun:test';
import { SaxesParser } from 'saxes';

import {
  assertPerformanceFindings,
  assertPreflight,
  decodeCandidateIdentity,
  readIdentity,
  readVerdict,
  xmlText,
} from './performance-level';
import { awaitPerformanceSupervisor } from './performance-supervisor-test';

const roots: string[] = [];
const declarationPath = 'apps/wbs/fe-01/playwright.performance.cases.json';
const configPath = 'apps/wbs/fe-01/playwright.performance.config.ts';
const reportPath = 'tmp/junit/wbs-fe-01.performance.xml';
const bindingPath = 'tmp/junit/wbs-fe-01.performance.manifest.json';
const evidencePath = 'tmp/junit/wbs-fe-01.performance.evidence.json';
const currentPath = 'tmp/junit/wbs-fe-01.performance.current.json';

async function currentBundle(root: string): Promise<string> {
  const pointer = JSON.parse(await readFile(join(root, currentPath), 'utf8')) as { bundle: string };
  return join(root, pointer.bundle);
}

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

function healthyScratchDescriptors() {
  return (['be-01', 'gw-01', 'fe-01'] as const).map((app, index) => {
    const port = [9100, 9200, 10200][index];
    return {
      command:
        'bun --eval "Bun.serve({port:Number(process.env.PORT),fetch(){return new Response(\'ready\')}})"',
      cwd: `apps/wbs/${app}`,
      url: `http://localhost:${String(port)}${app === 'fe-01' ? '' : '/health'}`,
      env: { PORT: String(port) },
    };
  });
}

async function runPerformanceLevel(
  root: string,
  policyPath?: string,
  descriptors?: ReturnType<typeof healthyScratchDescriptors>,
  fault?:
    | 'first-signal'
    | 'waitpid-echild'
    | 'partial-evidence'
    | 'selection-mutate'
    | 'verdict-preflight-empty'
    | 'verdict-preflight-malformed'
    | 'verdict-preflight-shape'
    | 'verdict-run-foreign'
    | 'verdict-run-unevaluated'
    | 'inventory-after-run'
    | 'malformed-descriptor'
    | 'descriptor-command'
    | 'descriptor-cwd'
    | 'descriptor-url'
    | 'descriptor-env'
    | 'descriptor-env-type'
    | 'descriptor-output-large'
    | 'descriptor-error-large'
    | 'descriptor-output-utf8'
    | 'descriptor-output-shape'
    | 'descriptor-entry-shape'
    | 'descriptor-required-shape'
    | 'descriptor-proto-env'
    | 'descriptor-missing'
    | 'descriptor-nonzero'
    | 'descriptor-inherited-pipe'
    | 'descriptor-cancel-reject'
    | 'descriptor-stderr-open'
    | 'descriptor-output-close'
    | 'descriptor-output-close-rename'
    | 'descriptor-hang',
): Promise<void> {
  const supervisorRoot = await mkdtemp(join(tmpdir(), 'performance-supervisor-'));
  const launchedDescriptors =
    fault === 'malformed-descriptor' || fault?.startsWith('descriptor-')
      ? undefined
      : (descriptors ??
        (root.includes('/performance-execution-') ? healthyScratchDescriptors() : undefined));
  const encodedDescriptors =
    launchedDescriptors === undefined
      ? '-'
      : Buffer.from(JSON.stringify(launchedDescriptors)).toString('base64url');
  const environment: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  if (root.includes('/performance-execution-') && !Object.hasOwn(environment, 'E2E_PORT_SHIFT'))
    environment['E2E_PORT_SHIFT'] = '6000';
  if (fault !== undefined) environment['PUNI_PROCESS_FAULT'] = fault;
  const preloadArguments =
    fault === undefined
      ? []
      : ['--preload', join(import.meta.dir, 'performance-processes.fault.preload.ts')];
  try {
    const supervisor = Bun.spawn(
      [
        process.execPath,
        ...preloadArguments,
        join(import.meta.dir, 'performance-level-fixture-cli.ts'),
        root,
        policyPath ?? '-',
        encodedDescriptors,
      ],
      { cwd: supervisorRoot, env: environment, stdout: 'ignore', stderr: 'pipe' },
    );
    const { exitCode, stderr } = await awaitPerformanceSupervisor(supervisor, 145_000);
    if (exitCode !== 0)
      throw new Error(stderr.trim() || `Performance supervisor exited ${String(exitCode)}`);
  } finally {
    await rm(supervisorRoot, { recursive: true, force: true });
  }
}

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
    | 'orphan-hang'
    | 'observe-env'
    | 'invalid-json-utf8'
    | 'malformed-descriptor'
    | 'descriptor-command'
    | 'descriptor-cwd'
    | 'descriptor-url'
    | 'descriptor-env'
    | 'descriptor-env-type'
    | 'descriptor-output-large'
    | 'descriptor-error-large'
    | 'descriptor-output-utf8'
    | 'descriptor-output-shape'
    | 'descriptor-entry-shape'
    | 'descriptor-required-shape'
    | 'descriptor-proto-env'
    | 'descriptor-missing'
    | 'descriptor-nonzero'
    | 'descriptor-inherited-pipe'
    | 'descriptor-cancel-reject'
    | 'descriptor-stderr-open'
    | 'descriptor-output-close'
    | 'descriptor-output-close-rename'
    | 'descriptor-hang' = 'none',
  title = 'records readiness',
): Promise<{
  root: string;
  policyPath: string;
  preloadSentinel: string;
  orphanMarkers: [string, string];
  observedEnvironment: string;
}> {
  const parent = await mkdtemp(join(tmpdir(), 'performance-execution-'));
  roots.push(parent);
  const root = join(parent, 'candidate');
  const preloadSentinel = join(parent, 'candidate-preload-sentinel');
  const orphanMarkers: [string, string] = [
    join(parent, 'listener.pid'),
    join(parent, 'sleeper.pid'),
  ];
  const observedEnvironment = join(parent, 'observed-env');
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
  const observedConfig =
    fault === 'observe-env'
      ? `writeFileSync(${JSON.stringify(observedEnvironment)} + (process.argv.includes('--list') ? '.discovery' : '.execution'), JSON.stringify({CI:process.env.CI,E2E_PORT_SHIFT:process.env.E2E_PORT_SHIFT}));\n`
      : '';
  const configSource = `import { writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';\nimport { execFileSync } from 'node:child_process';\nimport { defineConfig } from '@playwright/test';\n${discoveryFault}${reporterFault}${observedConfig}export default defineConfig({ testDir: './e2e-performance', testMatch: /.*\\.perf\\.spec\\.ts/, grep: process.env['PLAYWRIGHT_GREP'], projects: [{ name: 'chromium' }], workers: 1, retries: 0, timeout: ${value === 'hang' ? '0' : '30000'} });\n`;
  await writeFile(join(root, configPath), configSource);
  const selectedCase = { ...performanceCase, titlePath: ['Paint', title] };
  await writeDeclaration(root, { ...declaration, cases: [selectedCase] });
  const wait =
    value === 'hang' ? 'await new Promise((resolve) => setTimeout(resolve, 180_000)); ' : '';
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
  await mkdir(join(root, 'tools/dev'), { recursive: true });
  const setupSource =
    fault === 'orphan-hang'
      ? `const environment = { PATH: process.env.PATH ?? '/usr/bin:/bin' };\n` +
        `const listener = Bun.spawn(['setsid', process.execPath, '--eval', 'Bun.serve({port:10302,fetch(){return new Response("ready")}}); await Bun.sleep(180000)'], {env:environment,stdout:'ignore',stderr:'ignore'});\n` +
        `const sleeper = Bun.spawn(['setsid', process.execPath, '--eval', 'process.on("SIGTERM", () => {}); await Bun.sleep(180000)'], {env:environment,stdout:'ignore',stderr:'ignore'});\n` +
        `await Bun.write(${JSON.stringify(orphanMarkers[0])}, String(listener.pid));\n` +
        `await Bun.write(${JSON.stringify(orphanMarkers[1])}, String(sleeper.pid));\n` +
        `process.exit(0);\n`
      : fault === 'observe-env'
        ? `await Bun.write(${JSON.stringify(observedEnvironment)} + '.setup', JSON.stringify({CI:process.env.CI,E2E_PORT_SHIFT:process.env.E2E_PORT_SHIFT}));\n`
        : '// Synthetic committed setup boundary.\n';
  await writeFile(join(root, 'tools/dev/setup.ts'), setupSource);
  const descriptorFaults = {
    'descriptor-command': "services[0].command = 'echo foreign';",
    'descriptor-cwd': "services[0].cwd = '/tmp/foreign';",
    'descriptor-url': "services[0].url = 'http://localhost:9999/health';",
    'descriptor-env': "services[0].env['GW_URL'] = 'http://localhost:9999';",
    'descriptor-env-type': "services[0].env['PORT'] = 9100;",
    'descriptor-proto-env':
      "Object.defineProperty(services[0].env, '__proto__', {value:'foreign', enumerable:true});",
  } as const;
  if (fault in descriptorFaults) {
    await writeFile(
      join(root, 'apps/wbs/fe-01/playwright.ordinary-servers.ts'),
      await readFile(
        join(import.meta.dir, '../../../apps/wbs/fe-01/playwright.ordinary-servers.ts'),
        'utf8',
      ),
    );
  }
  const descriptorMutation =
    fault === 'descriptor-command' ||
    fault === 'descriptor-cwd' ||
    fault === 'descriptor-url' ||
    fault === 'descriptor-env' ||
    fault === 'descriptor-env-type' ||
    fault === 'descriptor-proto-env'
      ? descriptorFaults[fault]
      : '';
  const transportFaults: Record<string, string> = {
    'descriptor-output-large': "process.stdout.write('x'.repeat(65537));",
    'descriptor-output-close': "process.stdout.write('x'.repeat(65537));",
    'descriptor-output-close-rename': "process.stdout.write('x'.repeat(65537));",
    'descriptor-error-large': "process.stderr.write('x'.repeat(65537));",
    'descriptor-output-utf8': 'process.stdout.write(Buffer.from([0xff]));',
    'descriptor-output-shape': "process.stdout.write('{}');",
    'descriptor-entry-shape': "process.stdout.write('[null,null,null]');",
    'descriptor-required-shape': 'process.stdout.write(\'[{"command":1},{},{}]\');',
    'descriptor-nonzero': "process.stderr.write('producer diagnostic'); process.exit(23);",
    'descriptor-inherited-pipe': `const descendant = Bun.spawn(['setsid', 'sleep', '30'], {stdout:1, stderr:2, stdin:'ignore'}); await Bun.write(${JSON.stringify(orphanMarkers[1])}, String(descendant.pid)); process.exit(0);`,
    'descriptor-cancel-reject': `const descendant = Bun.spawn(['setsid', 'sleep', '30'], {stdout:1, stderr:2, stdin:'ignore'}); await Bun.write(${JSON.stringify(orphanMarkers[1])}, String(descendant.pid)); process.exit(0);`,
    'descriptor-hang': 'await Bun.sleep(12000);',
  };
  const transportSource = Object.hasOwn(transportFaults, fault)
    ? transportFaults[fault]
    : undefined;
  if (fault !== 'descriptor-missing')
    await writeFile(
      join(root, 'apps/wbs/fe-01/ordinary-servers-cli.ts'),
      fault === 'malformed-descriptor'
        ? "process.stdout.write('{invalid-json');\n"
        : (transportSource ??
            (descriptorMutation !== ''
              ? `import {ordinaryServerDescriptors} from './playwright.ordinary-servers'; const services = ordinaryServerDescriptors(process.argv[2], Number(process.argv[3]), true, process.argv[4]); ${descriptorMutation} process.stdout.write(JSON.stringify(services) + '\\n');\n`
              : `process.stdout.write(JSON.stringify(${JSON.stringify(healthyScratchDescriptors())}) + '\\n');\n`)),
    );
  for (const app of ['be-01', 'gw-01', 'fe-01']) {
    await mkdir(join(root, 'apps/wbs', app), { recursive: true });
    await writeFile(join(root, 'apps/wbs', app, '.keep'), 'fixture');
  }
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
    'SPEC-SCENARIOS',
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
  return { root, policyPath, preloadSentinel, orphanMarkers, observedEnvironment };
}

async function expectFailure(operation: Promise<unknown>, phrase: string): Promise<void> {
  const failure: unknown = await operation.then(
    () => new Error('operation unexpectedly succeeded'),
    (error: unknown) => error,
  );
  expect(String(failure)).toContain(phrase);
}

async function expectFailureMessage(operation: Promise<unknown>, phrase: string): Promise<void> {
  const failure: unknown = await operation.then(
    () => new Error('operation unexpectedly succeeded'),
    (cause: unknown) => cause,
  );
  if (!(failure instanceof Error)) throw new Error('Expected an Error from the production runner');
  // Proof: disabling the three-service array guard left its source text in Bun's
  // formatted stack, so a substring assertion passed falsely. Only diagnostic
  // lines that begin with error: count as the observed failure.
  const diagnostics = failure.message.split('\n').filter((line) => line.startsWith('error: '));
  expect(diagnostics.some((line) => line.includes(phrase))).toBe(true);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Performance level target production boundary', () => {
  it('refuses an incomplete WBS descriptor producer invocation', () => {
    const producer = join(import.meta.dir, '../../../apps/wbs/fe-01/ordinary-servers-cli.ts');
    const invocation = Bun.spawnSync([process.execPath, producer], {
      cwd: join(import.meta.dir, '../../..'),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(invocation.exitCode).not.toBe(0);
    expect(invocation.stderr.toString()).toContain(
      'Ordinary server descriptors require root, shift and absolute database path',
    );
    const relativeRoot = Bun.spawnSync(
      [process.execPath, producer, '.', '6000', '/tmp/performance.db'],
      { cwd: join(import.meta.dir, '../../..'), stdout: 'pipe', stderr: 'pipe' },
    );
    expect(relativeRoot.exitCode).not.toBe(0);
    expect(relativeRoot.stderr.toString()).toContain(
      'Ordinary server descriptors require root, shift and absolute database path',
    );
  });
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
    const previousShift = process.env['E2E_PORT_SHIFT'];
    process.env['E2E_PORT_SHIFT'] = '6000';
    try {
      await expectFailure(runPerformanceLevel(root), 'committed Git candidate');
    } finally {
      if (previousShift === undefined) delete process.env['E2E_PORT_SHIFT'];
      else process.env['E2E_PORT_SHIFT'] = previousShift;
    }
    await expectFailure(readFile(join(root, reportPath)), 'ENOENT');
    await expectFailure(readFile(join(root, bindingPath)), 'ENOENT');
  });

  it('refuses missing real CLI inputs and alternate service arguments', async () => {
    const root = await candidateRoot();
    const command = join(import.meta.dir, 'performance-level.ts');
    const environment = { ...process.env, E2E_PORT_SHIFT: '6000' };
    const absent = Bun.spawnSync([process.execPath, command], {
      cwd: root,
      env: environment,
      stderr: 'pipe',
    });
    expect(absent.exitCode).not.toBe(0);
    expect(absent.stderr.toString()).toContain('playwright.performance.cases.json');
    const alternate = Bun.spawnSync([process.execPath, command, '--services=synthetic'], {
      cwd: root,
      env: environment,
      stderr: 'pipe',
    });
    expect(alternate.exitCode).not.toBe(0);
    expect(alternate.stderr.toString()).toContain('does not accept alternate service arguments');
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
    const bundle = await currentBundle(fixture.root);
    const report = await readFile(join(bundle, 'report.xml'), 'utf8');
    const evidence = JSON.parse(await readFile(join(bundle, 'evidence.json'), 'utf8')) as {
      run: { cases: { observations: { value: number }[] }[] };
    };
    const binding = JSON.parse(await readFile(join(bundle, 'manifest.json'), 'utf8')) as {
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
    expect(await readFile(fixture.preloadSentinel, 'utf8')).toBe('candidate preload ran');
  }, 60_000);

  it('runs Burokrat identity in an external empty cwd without candidate preload', async () => {
    const fixture = await committedPerformanceFixture();
    const revision = Bun.spawnSync(['git', '-C', fixture.root, 'rev-parse', 'HEAD'])
      .stdout.toString()
      .trim();
    expect(readIdentity(fixture.root, revision)).toMatch(/^[0-9a-f]{64}$/);
    await expectFailure(readFile(fixture.preloadSentinel), 'ENOENT');
  });

  it('isolates the subreaper supervisor from the Bun test process', async () => {
    const fixture = await committedPerformanceFixture();
    const libc = dlopen('libc.so.6', {
      prctl: { args: ['i32', 'ptr', 'i64', 'i64', 'i64'], returns: 'i32' },
    });
    const status = new Int32Array(1);
    try {
      expect(libc.symbols.prctl(37, ptr(status), 0, 0, 0)).toBe(0);
      expect(status[0]).toBe(0);
      await runPerformanceLevel(fixture.root, fixture.policyPath);
      expect(libc.symbols.prctl(37, ptr(status), 0, 0, 0)).toBe(0);
      expect(status[0]).toBe(0);
    } finally {
      libc.close();
    }
  }, 60_000);

  it('publishes distinct immutable passing bundles across sequential invocations', async () => {
    const fixture = await committedPerformanceFixture();
    await runPerformanceLevel(fixture.root, fixture.policyPath);
    const first = JSON.parse(await readFile(join(fixture.root, currentPath), 'utf8')) as {
      invocationId: string;
      bundle: string;
      certifies: boolean;
    };
    expect(first.certifies).toBe(false);
    expect(await Bun.file(join(fixture.root, first.bundle, 'report.xml')).exists()).toBe(true);
    await runPerformanceLevel(fixture.root, fixture.policyPath);
    const second = JSON.parse(await readFile(join(fixture.root, currentPath), 'utf8')) as {
      invocationId: string;
      bundle: string;
      certifies: boolean;
    };
    expect(second.invocationId).not.toBe(first.invocationId);
    expect(second.bundle).not.toBe(first.bundle);
    expect(await Bun.file(join(fixture.root, first.bundle, 'report.xml')).exists()).toBe(true);
    expect(await Bun.file(join(fixture.root, second.bundle, 'report.xml')).exists()).toBe(true);
  }, 90_000);

  it('refuses an occupied shifted port before admission and preserves its listener', async () => {
    const fixture = await committedPerformanceFixture();
    const listener = createServer((_socket) => undefined);
    const shift = process.env['E2E_PORT_SHIFT'];
    await new Promise<void>((resolve, reject) => {
      listener.once('error', reject);
      listener.listen(10200, '127.0.0.1', resolve);
    });
    process.env['E2E_PORT_SHIFT'] = '6000';
    try {
      await expectFailure(runPerformanceLevel(fixture.root, fixture.policyPath), 'occupied');
      expect(listener.listening).toBe(true);
      await expectFailure(readFile(join(fixture.root, currentPath)), 'ENOENT');
    } finally {
      if (shift === undefined) delete process.env['E2E_PORT_SHIFT'];
      else process.env['E2E_PORT_SHIFT'] = shift;
      await new Promise<void>((resolve, reject) =>
        listener.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      );
    }
  }, 60_000);

  it('refuses a busy target lock before admission and preserves the current pointer', async () => {
    const fixture = await committedPerformanceFixture();
    await mkdir(join(fixture.root, 'tmp/junit'), { recursive: true });
    await writeFile(join(fixture.root, currentPath), '{"previous":true}');
    const descriptor = openSync(
      join(fixture.root, 'tmp/junit/performance.lock'),
      constants.O_CREAT | constants.O_RDWR,
      0o600,
    );
    const libc = dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } });
    expect(libc.symbols.flock(descriptor, 2 | 4)).toBe(0);
    try {
      await expectFailure(runPerformanceLevel(fixture.root, fixture.policyPath), 'lock is busy');
      expect(await readFile(join(fixture.root, currentPath), 'utf8')).toBe('{"previous":true}');
    } finally {
      closeSync(descriptor);
      libc.close();
    }
  });

  it('refuses failed service readiness before Playwright execution and leaves no current pointer', async () => {
    const fixture = await committedPerformanceFixture();
    const shift = process.env['E2E_PORT_SHIFT'];
    process.env['E2E_PORT_SHIFT'] = '6000';
    const service = (app: string, port: number) => ({
      command: `bun --eval "Bun.serve({port:Number(process.env.PORT),fetch(){return new Response('ready')}})"`,
      cwd: `apps/wbs/${app}`,
      url: `http://localhost:${String(port)}${app === 'fe-01' ? '' : '/health'}`,
      env: { PORT: String(port) },
    });
    const descriptors = [
      service('be-01', 9100),
      { ...service('gw-01', 9200), command: 'bun --eval "process.exit(23)"' },
      service('fe-01', 10200),
    ];
    try {
      await expectFailure(
        runPerformanceLevel(fixture.root, fixture.policyPath, descriptors),
        'readiness',
      );
      await expectFailure(readFile(join(fixture.root, currentPath)), 'ENOENT');
    } finally {
      if (shift === undefined) delete process.env['E2E_PORT_SHIFT'];
      else process.env['E2E_PORT_SHIFT'] = shift;
    }
  }, 60_000);

  it('creates the detached checkout database directory before ordinary service launch', async () => {
    const fixture = await committedPerformanceFixture();
    const descriptors = healthyScratchDescriptors();
    descriptors[0] = {
      ...descriptors[0],
      command: `bun --eval "const {existsSync}=require('node:fs'); if(!existsSync('../../../tmp')) process.exit(27); Bun.serve({port:Number(process.env.PORT),fetch(){return new Response('ready')}})"`,
    };
    await runPerformanceLevel(fixture.root, fixture.policyPath, descriptors);
    expect(await Bun.file(join(fixture.root, currentPath)).exists()).toBe(true);
  }, 60_000);

  it('refuses malformed WBS service descriptors before launching the stack', async () => {
    const fixture = await committedPerformanceFixture(180, 'malformed-descriptor');
    // Proof: bypassing the WBS descriptor producer made this case reach service launch
    // and fail on readiness instead of refusing the malformed producer output.
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath, undefined, 'malformed-descriptor'),
      'Performance service descriptor output is invalid JSON',
    );
    await expectFailure(readFile(join(fixture.root, currentPath)), 'ENOENT');
  }, 30_000);

  it('refuses foreign WBS commands, directories, URLs and environment before service launch', async () => {
    for (const fault of [
      'descriptor-command',
      'descriptor-cwd',
      'descriptor-url',
      'descriptor-env',
    ] as const) {
      const fixture = await committedPerformanceFixture(180, fault);
      await expectFailure(
        runPerformanceLevel(fixture.root, fixture.policyPath, undefined, fault),
        'Performance service descriptors differ from the approved shifted WBS stack',
      );
      await expectFailure(readFile(join(fixture.root, currentPath)), 'ENOENT');
    }
  }, 60_000);

  it('bounds and validates WBS descriptor producer transport before service launch', async () => {
    for (const [fault, phrase] of [
      ['descriptor-output-large', 'output exceeds 64 KiB'],
      ['descriptor-error-large', 'stderr exceeds 64 KiB'],
      ['descriptor-output-utf8', 'output is invalid UTF-8'],
      ['descriptor-output-shape', 'output must contain three services'],
      ['descriptor-entry-shape', 'descriptor 0 is malformed'],
      ['descriptor-required-shape', 'descriptor 0 is malformed'],
      ['descriptor-env-type', 'descriptor 0 has invalid environment'],
      ['descriptor-proto-env', 'descriptors differ from the approved shifted WBS stack'],
      ['descriptor-missing', 'producer failed'],
      ['descriptor-nonzero', 'producer failed: 23: producer diagnostic'],
      ['descriptor-hang', 'service descriptor producer timed out'],
    ] as const) {
      const fixture = await committedPerformanceFixture(180, fault);
      await expectFailureMessage(
        runPerformanceLevel(fixture.root, fixture.policyPath, undefined, fault),
        phrase,
      );
      await expectFailure(readFile(join(fixture.root, currentPath)), 'ENOENT');
      if (fault === 'descriptor-output-large' || fault === 'descriptor-error-large') {
        const bundles = await readdir(join(fixture.root, 'tmp/junit/performance'));
        expect(bundles).toHaveLength(1);
        const stream =
          fault === 'descriptor-output-large'
            ? 'ordinary-services.json'
            : 'ordinary-services.stderr';
        expect(
          (await stat(join(fixture.root, 'tmp/junit/performance', bundles[0], stream))).size,
        ).toBe(64 * 1024);
        const entries = await readdir(join(fixture.root, 'tmp/junit/performance', bundles[0]));
        expect(entries.some((entry) => entry.endsWith('.tmp'))).toBe(false);
      }
    }
  }, 60_000);

  it('bounds a producer descendant that keeps stdout and stderr open after direct exit', async () => {
    const fixture = await committedPerformanceFixture(180, 'descriptor-inherited-pipe');
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath, undefined, 'descriptor-inherited-pipe'),
      'service descriptor producer timed out',
    );
    await expectFailure(readFile(join(fixture.root, currentPath)), 'ENOENT');
    const descendantPid = Number(await readFile(fixture.orphanMarkers[1], 'utf8'));
    await expectFailure(readFile(`/proc/${String(descendantPid)}/stat`), 'ENOENT');
  }, 30_000);

  it('retains a rejecting reader cancellation after the whole-phase timeout', async () => {
    const fixture = await committedPerformanceFixture(180, 'descriptor-cancel-reject');
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath, undefined, 'descriptor-cancel-reject'),
      'service descriptor producer timed out',
    );
    const bundles = await readdir(join(fixture.root, 'tmp/junit/performance'));
    const diagnostic = JSON.parse(
      await readFile(
        join(fixture.root, 'tmp/junit/performance', bundles[0], 'failure.json'),
        'utf8',
      ),
    ) as { executionFailure: string };
    expect(diagnostic.executionFailure).toContain('injected descriptor cancellation failure');
    await expectFailure(readFile(join(fixture.root, currentPath)), 'ENOENT');
    const descendantPid = Number(await readFile(fixture.orphanMarkers[1], 'utf8'));
    await expectFailure(readFile(`/proc/${String(descendantPid)}/stat`), 'ENOENT');
  }, 30_000);

  it('closes staged handles and retains capture plus close errors', async () => {
    for (const [fault, phrase] of [
      ['descriptor-stderr-open', 'injected descriptor stderr open failure'],
      ['descriptor-output-close', 'injected descriptor stdout close failure'],
      ['descriptor-output-close-rename', 'injected descriptor stderr rename failure'],
    ] as const) {
      const fixture = await committedPerformanceFixture(180, fault);
      const attempt = runPerformanceLevel(fixture.root, fixture.policyPath, undefined, fault);
      const failure: unknown = await attempt.then(
        () => new Error('operation unexpectedly succeeded'),
        (cause: unknown) => cause,
      );
      expect(String(failure)).toContain(phrase);
      if (fault === 'descriptor-output-close')
        expect(String(failure)).toContain('output exceeds 64 KiB');
      await expectFailure(readFile(join(fixture.root, currentPath)), 'ENOENT');
      const bundles = await readdir(join(fixture.root, 'tmp/junit/performance'));
      const entries = await readdir(join(fixture.root, 'tmp/junit/performance', bundles[0]));
      if (fault === 'descriptor-stderr-open') {
        expect(entries.filter((entry) => entry.startsWith('ordinary-services'))).toEqual([]);
        expect(
          await readFile(
            join(fixture.root, 'tmp/junit/performance', bundles[0], 'descriptor-stdout-closed'),
            'utf8',
          ),
        ).toBe('yes');
      } else if (fault === 'descriptor-output-close') {
        expect(
          (
            await stat(
              join(fixture.root, 'tmp/junit/performance', bundles[0], 'ordinary-services.json'),
            )
          ).size,
        ).toBe(64 * 1024);
        expect(entries.some((entry) => entry.endsWith('.tmp'))).toBe(false);
      } else {
        expect(entries.filter((entry) => entry.startsWith('ordinary-services'))).toEqual([]);
        expect(entries.some((entry) => entry.endsWith('.tmp'))).toBe(false);
      }
      if (fault !== 'descriptor-stderr-open') {
        const diagnostic = JSON.parse(
          await readFile(
            join(fixture.root, 'tmp/junit/performance', bundles[0], 'failure.json'),
            'utf8',
          ),
        ) as { executionFailure: string };
        // Proof: flattening the outer AggregateError dropped the real overflow
        // and close causes; a simultaneous rename fault also masked them.
        expect(diagnostic.executionFailure).toContain('output exceeds 64 KiB');
        expect(diagnostic.executionFailure).toContain('injected descriptor stdout close failure');
        if (fault === 'descriptor-output-close-rename')
          expect(diagnostic.executionFailure).toContain(
            'injected descriptor stderr rename failure',
          );
      }
    }
  }, 30_000);

  it('passes one exact selection environment to child setup, services, discovery and execution despite mutation and descriptor overrides', async () => {
    const fixture = await committedPerformanceFixture(180, 'observe-env');
    const descriptors = healthyScratchDescriptors().map((descriptor, index) => {
      const marker = `${fixture.observedEnvironment}.service-${String(index)}`;
      const script = `await Bun.write(${JSON.stringify(marker)}, JSON.stringify({CI:process.env.CI,E2E_PORT_SHIFT:process.env.E2E_PORT_SHIFT})); Bun.serve({port:Number(process.env.PORT),fetch(){return new Response("ready")}});`;
      return {
        ...descriptor,
        command: `bun --eval '${script}'`,
        env: { ...descriptor.env, CI: '0', E2E_PORT_SHIFT: '9999' },
      };
    });
    await runPerformanceLevel(fixture.root, fixture.policyPath, descriptors, 'selection-mutate');
    const expected = { CI: '1', E2E_PORT_SHIFT: '6000' };
    for (const phase of [
      'setup',
      'service-0',
      'service-1',
      'service-2',
      'discovery',
      'execution',
    ]) {
      expect(JSON.parse(await readFile(`${fixture.observedEnvironment}.${phase}`, 'utf8'))).toEqual(
        expected,
      );
    }
    const bundle = await currentBundle(fixture.root);
    const evidence = JSON.parse(await readFile(join(bundle, 'evidence.json'), 'utf8')) as {
      selection: { selectionEnvironment: unknown };
    };
    const manifest = JSON.parse(await readFile(join(bundle, 'manifest.json'), 'utf8')) as {
      selection: { selectionEnvironment: unknown };
    };
    expect(evidence.selection.selectionEnvironment).toEqual(expected);
    expect(manifest.selection.selectionEnvironment).toEqual(expected);
  }, 60_000);

  it('emits an honest failing JUnit for an evaluated threshold breach', async () => {
    const fixture = await committedPerformanceFixture(280);
    await mkdir(join(fixture.root, 'tmp/junit'), { recursive: true });
    await writeFile(join(fixture.root, currentPath), '{"stale":true}');
    await expectFailure(runPerformanceLevel(fixture.root, fixture.policyPath), 'threshold');
    const bundles = await readdir(join(fixture.root, 'tmp/junit/performance'));
    expect(bundles).toHaveLength(1);
    const report = await readFile(
      join(fixture.root, 'tmp/junit/performance', bundles[0], 'report.xml'),
      'utf8',
    );
    expect(report).toContain('failures="1"');
    expect(report).toContain('<failure');
    expect(report).toContain('file="apps/wbs/fe-01/e2e-performance/paint.perf.spec.ts"');
    await expectFailure(readFile(join(fixture.root, currentPath)), 'ENOENT');
    const bundle = join(fixture.root, 'tmp/junit/performance', bundles[0]);
    expect(await readFile(join(bundle, 'report.xml'), 'utf8')).toContain('failures="1"');
    expect(await readFile(join(bundle, 'evidence.json'), 'utf8')).toContain('"value":280');
    expect(await readFile(join(bundle, 'failure.json'), 'utf8')).toContain('threshold failure');
  }, 60_000);

  it('kills a hung Playwright child and leaves no reusable output', async () => {
    const fixture = await committedPerformanceFixture('hang');
    await mkdir(join(fixture.root, 'tmp/junit'), { recursive: true });
    await writeFile(join(fixture.root, reportPath), '<testsuite tests="1" failures="0"/>');
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath),
      'Playwright Performance execution timed out',
    );
    await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
    await expectFailure(readFile(join(fixture.root, bindingPath)), 'ENOENT');
    await expectFailure(readFile(join(fixture.root, evidencePath)), 'ENOENT');
    await expectFailure(readFile(join(fixture.root, currentPath)), 'ENOENT');
    const bundles = await readdir(join(fixture.root, 'tmp/junit/performance'));
    expect(bundles).toHaveLength(1);
    expect(
      await readFile(
        join(fixture.root, 'tmp/junit/performance', bundles[0], 'failure.json'),
        'utf8',
      ),
    ).toContain('timed out');
  }, 140_000);

  it('times out execution and reaps immediate-wrapper separate-session listener and TERM-resistant sleeper', async () => {
    const fixture = await committedPerformanceFixture('hang', 'orphan-hang');
    const foreign = Bun.spawn(['sleep', '180'], { stdout: 'ignore', stderr: 'ignore' });
    try {
      await expectFailure(
        runPerformanceLevel(fixture.root, fixture.policyPath),
        'Playwright Performance execution timed out',
      );
      const [listenerMarker, sleeperMarker] = fixture.orphanMarkers;
      const listenerPid = Number((await readFile(listenerMarker, 'utf8')).trim());
      const sleeperPid = Number((await readFile(sleeperMarker, 'utf8')).trim());
      expect(Number.isSafeInteger(listenerPid) && listenerPid > 0).toBe(true);
      expect(Number.isSafeInteger(sleeperPid) && sleeperPid > 0).toBe(true);
      expect(await Bun.file(`/proc/${String(listenerPid)}/stat`).exists()).toBe(false);
      expect(await Bun.file(`/proc/${String(sleeperPid)}/stat`).exists()).toBe(false);
      expect(await Bun.file(`/proc/${String(foreign.pid)}/stat`).exists()).toBe(true);
      const listener = createServer();
      await new Promise<void>((resolve, reject) => {
        listener.once('error', reject);
        listener.listen(10302, '127.0.0.1', resolve);
      });
      await new Promise<void>((resolve, reject) => {
        listener.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      const bundles = await readdir(join(fixture.root, 'tmp/junit/performance'));
      expect(bundles).toHaveLength(1);
      const bundle = join(fixture.root, 'tmp/junit/performance', bundles[0]);
      expect(await Bun.file(join(bundle, 'discovery.json')).exists()).toBe(true);
      const diagnostic = JSON.parse(await readFile(join(bundle, 'failure.json'), 'utf8')) as {
        executionFailure: string;
        cleanupFailures: string[];
      };
      expect(diagnostic.executionFailure).toContain('Playwright Performance execution timed out');
      expect(diagnostic.cleanupFailures).toEqual([]);
      await expectFailure(readFile(join(fixture.root, currentPath)), 'ENOENT');
      for (const legacy of [reportPath, bindingPath, evidencePath])
        await expectFailure(readFile(join(fixture.root, legacy)), 'ENOENT');
    } finally {
      foreign.kill('SIGKILL');
      await foreign.exited;
    }
  }, 150_000);

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
    for (const [fault, phrase] of [
      ['verdict-preflight-empty', 'preflight unavailable'],
      ['verdict-preflight-malformed', 'malformed Burokrat Performance preflight JSON'],
      ['verdict-preflight-shape', 'preflight verdict is malformed'],
    ] as const) {
      const fixture = await committedPerformanceFixture();
      await expectFailure(
        runPerformanceLevel(fixture.root, fixture.policyPath, undefined, fault),
        phrase,
      );
      await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
    }
  }, 30_000);

  it('refuses a foreign candidate or unevaluated obligation in the measured verdict', async () => {
    for (const fault of ['verdict-run-foreign', 'verdict-run-unevaluated'] as const) {
      const fixture = await committedPerformanceFixture();
      await expectFailure(
        runPerformanceLevel(fixture.root, fixture.policyPath, undefined, fault),
        'judge refused the measured run',
      );
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

  it('retains the threshold failure and cleanup fault together without a current pointer', async () => {
    const fixture = await committedPerformanceFixture(280);
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath, undefined, 'first-signal'),
      'pidfd_send_signal failed',
    );
    const bundles = await readdir(join(fixture.root, 'tmp/junit/performance'));
    expect(bundles).toHaveLength(1);
    const diagnostic = await readFile(
      join(fixture.root, 'tmp/junit/performance', bundles[0], 'failure.json'),
      'utf8',
    );
    expect(diagnostic).toContain('threshold failure');
    expect(diagnostic).toContain('pidfd_send_signal failed');
    await expectFailure(readFile(join(fixture.root, currentPath)), 'ENOENT');
  }, 60_000);

  it('refuses publication after post-run inventory ambiguity while releasing all shifted services', async () => {
    const fixture = await committedPerformanceFixture();
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath, undefined, 'inventory-after-run'),
      'injected post-run inventory ambiguity',
    );
    const bundles = await readdir(join(fixture.root, 'tmp/junit/performance'));
    expect(bundles).toHaveLength(1);
    const bundle = join(fixture.root, 'tmp/junit/performance', bundles[0]);
    const failure = JSON.parse(await readFile(join(bundle, 'failure.json'), 'utf8')) as {
      executionFailure: string | null;
      cleanupFailures: string[];
    };
    expect(failure.executionFailure).toBeNull();
    expect(failure.cleanupFailures.join(' ')).toContain('injected post-run inventory ambiguity');
    expect(await Bun.file(join(bundle, 'manifest.json')).exists()).toBe(true);
    await expectFailure(readFile(join(fixture.root, currentPath)), 'ENOENT');
    for (const port of [9100, 9200, 10200]) {
      const listener = createServer();
      await new Promise<void>((resolve, reject) => {
        listener.once('error', reject);
        listener.listen(port, '127.0.0.1', resolve);
      });
      await new Promise<void>((resolve, reject) => {
        listener.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  }, 60_000);

  it('never exposes a partially written evidence artifact as a final bundle member', async () => {
    const fixture = await committedPerformanceFixture();
    await expectFailure(
      runPerformanceLevel(fixture.root, fixture.policyPath, undefined, 'partial-evidence'),
      'injected partial bundle write',
    );
    const bundles = await readdir(join(fixture.root, 'tmp/junit/performance'));
    expect(bundles).toHaveLength(1);
    const bundle = join(fixture.root, 'tmp/junit/performance', bundles[0]);
    await expectFailure(readFile(join(bundle, 'evidence.json')), 'ENOENT');
    expect(await readFile(join(bundle, 'failure.json'), 'utf8')).toContain(
      'injected partial bundle write',
    );
    await expectFailure(readFile(join(fixture.root, currentPath)), 'ENOENT');
  }, 60_000);

  it('refuses a measured case with an XML-forbidden title before emitting JUnit', async () => {
    const fixture = await committedPerformanceFixture(180, 'none', 'bad\u0001title');
    await expectFailure(runPerformanceLevel(fixture.root, fixture.policyPath), 'XML-forbidden');
    await expectFailure(readFile(join(fixture.root, reportPath)), 'ENOENT');
  }, 30_000);

  it('round-trips measured title whitespace through parsed JUnit attributes', async () => {
    const title = 'tab\tline\nreturn\r';
    const fixture = await committedPerformanceFixture(180, 'none', title);
    await runPerformanceLevel(fixture.root, fixture.policyPath);
    const report = await readFile(join(await currentBundle(fixture.root), 'report.xml'), 'utf8');
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
