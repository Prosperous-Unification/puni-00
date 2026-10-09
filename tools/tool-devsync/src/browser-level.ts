import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { digestEvidenceBytes } from '@shared/test-evidence';

import {
  decodeBrowserJson,
  reconcileBrowserJunit,
  reconcileBrowserRuns,
} from './browser-playwright';
import { xmlText } from './performance-level';

type Mode = 'ordinary' | 'packaged' | 'portable';

const toolRoot = resolve(import.meta.dir, '../../..');
const playwrightCli = join(toolRoot, 'node_modules/playwright/cli.js');
const modes = {
  ordinary: {
    config: 'apps/wbs/fe-01/playwright.config.ts',
    report: 'tmp/junit/wbs-fe-01.browser.ordinary.xml',
    build: ['bun', 'run', 'tools/dev/setup.ts'],
  },
  packaged: {
    config: 'apps/wbs/fe-01/playwright.packaged.config.ts',
    report: 'tmp/junit/wbs-fe-01.browser.packaged.xml',
    build: ['bunx', 'nx', 'run', 'wbs-fe-01:build'],
  },
  portable: {
    config: 'libs/wbs/application/core/playwright.config.ts',
    report: 'tmp/junit/wbs-core.browser.portable.xml',
    build: [
      'bun',
      'build',
      'libs/wbs/application/core/testing/portable-composition.ts',
      '--target=browser',
      '--format=esm',
      '--outfile=dist/libs/wbs/application/core/portable-composition.js',
    ],
  },
} as const;

interface Invocation {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function invoke(argv: string[], cwd: string): Invocation {
  const call = Bun.spawnSync(argv, { cwd, stdout: 'pipe', stderr: 'pipe' });
  return {
    exitCode: call.exitCode,
    stdout: call.stdout.toString(),
    stderr: call.stderr.toString(),
  };
}

function git(root: string, args: string[]): string {
  const call = invoke(['git', '-C', root, ...args], root);
  if (call.exitCode !== 0) throw new Error(`Browser Git ${args[0]} failed: ${call.stderr.trim()}`);
  return call.stdout.trim();
}

function assertClean(root: string, revision?: string): string {
  // Proof: the dirty-candidate target negative refuses changed tracked inputs before collection.
  if (git(root, ['status', '--porcelain', '--untracked-files=all']) !== '')
    throw new Error('Browser candidate or checkout is dirty');
  // Proof: the index-flag negative refuses assume-unchanged and skip-worktree inputs.
  if (
    git(root, ['ls-files', '-v', '-z'])
      .split('\0')
      .some((entry) => entry !== '' && !entry.startsWith('H '))
  )
    throw new Error('Browser candidate index has hidden changes');
  const current = git(root, ['rev-parse', 'HEAD']);
  if (revision !== undefined && current !== revision)
    throw new Error('Browser candidate revision changed');
  return current;
}

function parseJson(bytes: Uint8Array, phase: string): unknown {
  let source: string;
  try {
    // Proof: invalid UTF-8 reporter bytes fail the parser negative before JSON decoding.
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`Browser ${phase} JSON is not UTF-8`, { cause });
  }
  try {
    return JSON.parse(source) as unknown;
  } catch (cause) {
    throw new Error(`Browser ${phase} JSON is malformed`, { cause });
  }
}

async function run(
  argv: string[],
  cwd: string,
  environment: Record<string, string>,
  timeoutMs: number,
): Promise<Invocation> {
  const child = Bun.spawn(argv, { cwd, env: environment, stdout: 'pipe', stderr: 'pipe' });
  const expired = { value: false };
  const timeout = setTimeout(() => {
    expired.value = true;
    child.kill('SIGKILL');
  }, timeoutMs);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    // Proof: the hung-run target negative ends with a named timeout, never a stale report.
    if (expired.value) throw new Error(`Browser command timed out: ${argv.join(' ')}`);
    return { exitCode, stdout, stderr };
  } finally {
    clearTimeout(timeout);
  }
}

function validatedPortShift(): string {
  const asked = process.env['E2E_PORT_SHIFT'] ?? '0';
  const shift = Number(asked);
  // Proof: the malformed-shift negative refuses a value that config would otherwise coerce.
  if (
    !/^(0|[1-9][0-9]{0,3})$/.test(asked) ||
    !Number.isInteger(shift) ||
    [100, 1000, 1100].includes(shift)
  )
    throw new Error('Browser E2E_PORT_SHIFT must be an allowed integer from 0 to 9999');
  return asked;
}

function runtimeEnvironment(mode: Mode, root: string): Record<string, string> {
  const environment: Record<string, string> = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: process.env['HOME'] ?? root,
    TMPDIR: tmpdir(),
    LANG: 'C.UTF-8',
    CI: '1',
  };
  if (mode === 'ordinary') {
    environment['E2E_PORT_SHIFT'] = validatedPortShift();
    // Regular Chromium is an explicit reviewed choice; an arbitrary value is refused.
    const regular = process.env['PLAYWRIGHT_CHROMIUM_REGULAR'];
    if (regular !== undefined && regular !== '1')
      throw new Error('Browser PLAYWRIGHT_CHROMIUM_REGULAR must be 1 or absent');
    if (regular === '1') environment['PLAYWRIGHT_CHROMIUM_REGULAR'] = '1';
  }
  return environment;
}

function junitSource(
  mode: Mode,
  cases: readonly {
    project: string;
    file: string;
    titlePath: string[];
    status: 'passed' | 'failed' | 'skipped';
  }[],
): string {
  const failed = cases.filter((browserCase) => browserCase.status === 'failed').length;
  const skipped = cases.filter((browserCase) => browserCase.status === 'skipped').length;
  const tests = cases
    .map((browserCase) => {
      const body =
        browserCase.status === 'passed'
          ? ''
          : browserCase.status === 'skipped'
            ? '<skipped/>'
            : '<failure message="Browser execution failed"/>';
      return `<testcase classname="${xmlText(browserCase.project)}" name="${xmlText(browserCase.titlePath.join(' › '))}" file="${xmlText(browserCase.file)}">${body}</testcase>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="browser.${mode}" tests="${String(cases.length)}" failures="${String(failed)}" errors="0" skipped="${String(skipped)}">\n${tests}\n</testsuite>\n`;
}

/** Collects one Browser mode in a detached committed checkout and publishes non-certifying evidence. */
export async function runBrowserLevel(candidateRoot: string, mode: Mode): Promise<void> {
  const selected = modes[mode];
  const root = resolve(candidateRoot);
  const report = join(root, selected.report);
  const manifest = `${report}.manifest.json`;
  await mkdir(join(root, 'tmp/junit'), { recursive: true });
  // Proof: the failed-discovery target negative leaves neither prior report nor prior manifest.
  await Promise.all([rm(report, { force: true }), rm(manifest, { force: true })]);
  const revision = assertClean(root);
  const configBytes = await readFile(join(root, selected.config));
  const environment = runtimeEnvironment(mode, root);
  const projects =
    mode === 'ordinary' && environment['PLAYWRIGHT_CHROMIUM_REGULAR'] === '1'
      ? ['chromium', 'chromium-regular']
      : ['chromium'];
  const scratch = await mkdtemp(join(tmpdir(), `puni-browser-${mode}-`));
  const checkout = join(scratch, 'candidate');
  let checkoutAdded = false;
  try {
    git(root, ['worktree', 'add', '--detach', checkout, revision]);
    checkoutAdded = true;
    await symlink(join(toolRoot, 'node_modules'), join(checkout, 'node_modules'), 'dir');
    const build = await run([...selected.build], checkout, environment, 10 * 60_000);
    if (build.exitCode !== 0) throw new Error(`Browser ${mode} setup failed: ${build.stderr}`);
    assertClean(checkout, revision);
    const artifact =
      mode === 'packaged'
        ? 'dist/apps/wbs/fe-01/index.html'
        : mode === 'portable'
          ? 'dist/libs/wbs/application/core/portable-composition.js'
          : undefined;
    const artifactDigest =
      artifact === undefined
        ? undefined
        : digestEvidenceBytes(await readFile(join(checkout, artifact)));
    const argumentsBase = ['test', '--config', selected.config];
    const listFile = join(scratch, 'list.json');
    const listedRun = await run(
      ['node', playwrightCli, ...argumentsBase, '--list', '--reporter=json'],
      checkout,
      { ...environment, PLAYWRIGHT_JSON_OUTPUT_FILE: listFile },
      3 * 60_000,
    );
    if (listedRun.exitCode !== 0)
      throw new Error(`Browser ${mode} discovery failed: ${listedRun.stderr}`);
    const listBytes = await readFile(listFile);
    const listed = decodeBrowserJson(
      parseJson(listBytes, 'discovery'),
      checkout,
      selected.config,
      projects,
      'list',
      0,
    );
    assertClean(checkout, revision);
    // Proof: the candidate-HEAD-mutation negative rejects a source revision moved during discovery.
    assertClean(root, revision);
    const runFile = join(scratch, 'run.json');
    const junitFile = join(scratch, 'run.xml');
    const executedRun = await run(
      ['node', playwrightCli, ...argumentsBase, '--reporter=json,junit'],
      checkout,
      {
        ...environment,
        PLAYWRIGHT_JSON_OUTPUT_FILE: runFile,
        PLAYWRIGHT_JUNIT_OUTPUT_FILE: junitFile,
      },
      25 * 60_000,
    );
    const [runBytes, junitBytes] = await Promise.all([readFile(runFile), readFile(junitFile)]);
    const executed = decodeBrowserJson(
      parseJson(runBytes, 'execution'),
      checkout,
      selected.config,
      projects,
      'run',
      executedRun.exitCode,
    );
    reconcileBrowserRuns(listed, executed);
    let junit: string;
    try {
      junit = new TextDecoder('utf-8', { fatal: true }).decode(junitBytes);
    } catch (cause) {
      throw new Error('Browser raw JUnit is not UTF-8', { cause });
    }
    reconcileBrowserJunit(junit, executed);
    assertClean(checkout, revision);
    assertClean(root, revision);
    if (!configBytes.equals(await readFile(join(checkout, selected.config))))
      throw new Error('Browser config bytes changed during collection');
    if (
      artifact !== undefined &&
      artifactDigest !== digestEvidenceBytes(await readFile(join(checkout, artifact)))
    )
      throw new Error('Browser build artifact changed during collection');
    const invocationId = randomUUID();
    const reportSource = junitSource(mode, executed.cases);
    const rawDirectory = join(root, 'tmp/junit/browser', invocationId);
    await mkdir(rawDirectory, { recursive: true });
    await Promise.all([
      writeFile(join(rawDirectory, 'discovery.json'), listBytes),
      writeFile(join(rawDirectory, 'execution.json'), runBytes),
      writeFile(join(rawDirectory, 'playwright.xml'), junitBytes),
    ]);
    const binding = {
      schemaVersion: 1,
      certifies: false,
      reason: 'raw runner artifacts and invocation are not externally authenticated',
      invocationId,
      mode,
      revision,
      config: selected.config,
      configDigest: digestEvidenceBytes(configBytes),
      artifact: artifact === undefined ? undefined : { path: artifact, digest: artifactDigest },
      environment: Object.fromEntries(
        Object.entries(environment).filter(([key]) =>
          ['CI', 'E2E_PORT_SHIFT', 'PLAYWRIGHT_CHROMIUM_REGULAR'].includes(key),
        ),
      ),
      runnerVersion: listed.version,
      cases: executed.cases,
      raw: {
        discovery: {
          path: `tmp/junit/browser/${invocationId}/discovery.json`,
          digest: digestEvidenceBytes(listBytes),
        },
        execution: {
          path: `tmp/junit/browser/${invocationId}/execution.json`,
          digest: digestEvidenceBytes(runBytes),
        },
        junit: {
          path: `tmp/junit/browser/${invocationId}/playwright.xml`,
          digest: digestEvidenceBytes(junitBytes),
        },
      },
      reportDigest: digestEvidenceBytes(reportSource),
    };
    const staging = `${report}.${invocationId}.new`;
    await writeFile(staging, reportSource);
    await writeFile(`${staging}.manifest.json`, `${JSON.stringify(binding)}\n`);
    // Publish report and pointer only after all evidence has been reconciled.
    await rename(staging, report);
    await rename(`${staging}.manifest.json`, manifest);
    if (executedRun.exitCode !== 0) throw new Error(`Browser ${mode} cases failed`);
  } finally {
    if (checkoutAdded) git(root, ['worktree', 'remove', '--force', checkout]);
    await rm(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode !== 'ordinary' && mode !== 'packaged' && mode !== 'portable')
    throw new Error('Browser level requires ordinary, packaged or portable mode');
  await runBrowserLevel(process.cwd(), mode);
}
