import type { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { digestEvidenceBytes } from '@shared/test-evidence';

import {
  decodeBrowserJson,
  reconcileBrowserJunit,
  reconcileBrowserRuns,
} from './browser-playwright';
import { readIdentity, xmlText } from './performance-level';

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

export function assertClean(root: string, revision?: string): string {
  // Proof: disabling this guard made the dirty-candidate production negative fail its named refusal.
  if (git(root, ['status', '--porcelain', '--untracked-files=all']) !== '')
    throw new Error('Browser candidate or checkout is dirty');
  // Proof: disabling this guard made the assume-unchanged negative accept a hidden index flag.
  if (
    git(root, ['ls-files', '-v', '-z'])
      .split('\0')
      .some((entry) => entry !== '' && !entry.startsWith('H '))
  )
    throw new Error('Browser candidate index has hidden changes');
  const current = git(root, ['rev-parse', 'HEAD']);
  // Proof: disabling this guard made the moved-revision negative accept a foreign SHA.
  if (revision !== undefined && current !== revision)
    throw new Error('Browser candidate revision changed');
  return current;
}

export function decodeBrowserText(bytes: Uint8Array, phase: string): string {
  try {
    // Proof: disabling fatal decoding made the malformed-byte negative fail at JSON parsing.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`Browser ${phase} is not UTF-8`, { cause });
  }
}

export function parseJson(bytes: Uint8Array, phase: string): unknown {
  const source = decodeBrowserText(bytes, `${phase} JSON`);
  try {
    // Proof: disabling JSON parsing made the malformed-JSON negative accept an empty record.
    return JSON.parse(source) as unknown;
  } catch (cause) {
    throw new Error(`Browser ${phase} JSON is malformed`, { cause });
  }
}

export async function run(
  argv: string[],
  cwd: string,
  environment: Record<string, string>,
  timeoutMs: number,
): Promise<Invocation> {
  const child = Bun.spawn(argv, {
    cwd,
    env: environment,
    stdout: 'pipe',
    stderr: 'pipe',
    detached: true,
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      try {
        // Proof: removing the group signal let the descendant write its marker after timeout.
        process.kill(-child.pid, 'SIGKILL');
      } catch (cause) {
        reject(
          new Error(`Browser command group could not be killed: ${argv.join(' ')}`, { cause }),
        );
        return;
      }
      // Proof: disabling deadline rejection made the inherited-pipe negative resolve as success.
      reject(new Error(`Browser command timed out: ${argv.join(' ')}`));
    }, timeoutMs);
  });
  try {
    const [stdout, stderr, exitCode] = await Promise.race([
      Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]),
      deadline,
    ]);
    return { exitCode, stdout, stderr };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

interface ServedFile {
  path: string;
  digest: string;
}

/** Enumerate every regular served file and bind its path and bytes. */
export async function browserServedFiles(
  checkout: string,
  servedRoot: string,
): Promise<ServedFile[]> {
  const absoluteRoot = join(checkout, servedRoot);
  const files: ServedFile[] = [];
  const rootMetadata = await lstat(absoluteRoot);
  // Proof: removing this guard made a symlinked served-root negative follow outside bytes.
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink())
    throw new Error('Browser served root is not a regular directory');
  async function visit(directory: string): Promise<void> {
    for (const name of (await readdir(directory)).sort()) {
      const absolute = join(directory, name);
      const metadata = await lstat(absolute);
      // Proof: removing this guard let the symlinked-asset negative enter the served inventory.
      if (metadata.isSymbolicLink()) throw new Error('Browser served inventory contains a symlink');
      if (metadata.isDirectory()) {
        await visit(absolute);
        continue;
      }
      // Proof: removing this guard let the special-file negative silently omit an unknown asset.
      if (!metadata.isFile()) throw new Error('Browser served inventory contains an unknown file');
      files.push({
        path: relative(checkout, absolute).replaceAll('\\', '/'),
        digest: digestEvidenceBytes(await readFile(absolute)),
      });
    }
  }
  await visit(absoluteRoot);
  // Proof: removing this guard made the empty-served-tree negative accept an absent build.
  if (files.length === 0) throw new Error('Browser served inventory is empty');
  return files;
}

export function validatedPortShift(): string {
  const asked = process.env['E2E_PORT_SHIFT'] ?? '0';
  const shift = Number(asked);
  // Proof: disabling this guard made the malformed-shift negative accept -1.
  if (
    !/^(0|[1-9][0-9]{0,3})$/.test(asked) ||
    !Number.isInteger(shift) ||
    [100, 1000, 1100].includes(shift)
  )
    throw new Error('Browser E2E_PORT_SHIFT must be an allowed integer from 0 to 9999');
  return asked;
}

export function runtimeEnvironment(mode: Mode, root: string): Record<string, string> {
  const environment: Record<string, string> = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: process.env['HOME'] ?? root,
    TMPDIR: tmpdir(),
    LANG: 'C.UTF-8',
    CI: '1',
  };
  if (mode === 'ordinary') {
    environment['E2E_PORT_SHIFT'] = validatedPortShift();
    // Proof: disabling this guard made the arbitrary-regular-value negative accept "yes".
    const regular = process.env['PLAYWRIGHT_CHROMIUM_REGULAR'];
    if (regular !== undefined && regular !== '1')
      throw new Error('Browser PLAYWRIGHT_CHROMIUM_REGULAR must be 1 or absent');
    if (regular === '1') environment['PLAYWRIGHT_CHROMIUM_REGULAR'] = '1';
  }
  return environment;
}

/** Immutable candidate inputs around every runner phase. */
export async function assertBrowserInputs(
  checkout: string,
  revision: string,
  configPath: string,
  configBytes: Buffer,
  artifact?: { path: string; digest: string },
  served?: { root: string; files: ServedFile[] },
): Promise<void> {
  assertClean(checkout, revision);
  // Proof: disabling this comparison made the altered-config negative accept changed bytes.
  if (!configBytes.equals(await readFile(join(checkout, configPath))))
    throw new Error('Browser config bytes changed during collection');
  // Proof: disabling this comparison made the altered-artifact negative accept changed bytes.
  if (
    artifact !== undefined &&
    artifact.digest !== digestEvidenceBytes(await readFile(join(checkout, artifact.path)))
  )
    throw new Error('Browser build artifact changed during collection');
  // Proof: removing this comparison made the changed-JS, changed-CSS and inserted-asset negatives pass.
  if (
    served !== undefined &&
    JSON.stringify(await browserServedFiles(checkout, served.root)) !== JSON.stringify(served.files)
  )
    throw new Error('Browser served inventory changed during collection');
}

interface BrowserBundle {
  discovery: Uint8Array;
  execution: Uint8Array;
  playwright: Uint8Array;
  report: string;
  manifest: object;
}

/** Publish a complete immutable bundle through one atomic current pointer. */
export async function publishBrowserBundle(
  root: string,
  mode: Mode,
  invocationId: string,
  bundle: BrowserBundle,
): Promise<string> {
  const browserRoot = join(root, 'tmp/junit/browser');
  const bundleDirectory = join(browserRoot, invocationId);
  await mkdir(browserRoot, { recursive: true });
  await mkdir(bundleDirectory, { recursive: false });
  await Promise.all([
    writeFile(join(bundleDirectory, 'discovery.json'), bundle.discovery, { flag: 'wx' }),
    writeFile(join(bundleDirectory, 'execution.json'), bundle.execution, { flag: 'wx' }),
    writeFile(join(bundleDirectory, 'playwright.xml'), bundle.playwright, { flag: 'wx' }),
    writeFile(join(bundleDirectory, 'report.xml'), bundle.report, { flag: 'wx' }),
    writeFile(join(bundleDirectory, 'manifest.json'), `${JSON.stringify(bundle.manifest)}\n`, {
      flag: 'wx',
    }),
  ]);
  const pointer = join(browserRoot, `${mode}.current.json`);
  const staging = `${pointer}.${invocationId}.new`;
  await writeFile(
    staging,
    `${JSON.stringify({ schemaVersion: 1, invocationId, mode, bundle: `tmp/junit/browser/${invocationId}` })}\n`,
    { flag: 'wx' },
  );
  // Proof: replacing this rename with a partial pointer write made the concurrent reader reject malformed JSON.
  await rename(staging, pointer);
  return pointer;
}

/** Resolve one pointer snapshot and verify its immutable report/manifest pair. */
export async function readBrowserPublication(
  root: string,
  mode: Mode,
): Promise<{ invocationId: string; report: string; manifest: Record<string, unknown> }> {
  const pointer = join(root, 'tmp/junit/browser', `${mode}.current.json`);
  const publication = parseJson(await readFile(pointer), 'pointer');
  if (typeof publication !== 'object' || publication === null || Array.isArray(publication))
    throw new Error('Browser pointer is malformed');
  const fields = publication as Record<string, unknown>; // Validated external JSON boundary.
  const invocationId = fields['invocationId'];
  // Proof: removing this guard let a foreign-bundle pointer select another invocation.
  if (
    fields['schemaVersion'] !== 1 ||
    fields['mode'] !== mode ||
    typeof invocationId !== 'string' ||
    !/^[0-9a-f-]{36}$/.test(invocationId) ||
    fields['bundle'] !== `tmp/junit/browser/${invocationId}`
  )
    throw new Error('Browser pointer identity is malformed');
  const bundleDirectory = join(root, 'tmp/junit/browser', invocationId);
  const manifestValue = parseJson(
    await readFile(join(bundleDirectory, 'manifest.json')),
    'manifest',
  );
  if (typeof manifestValue !== 'object' || manifestValue === null || Array.isArray(manifestValue))
    throw new Error('Browser manifest is malformed');
  const manifest = manifestValue as Record<string, unknown>; // Validated external JSON boundary.
  const report = decodeBrowserText(await readFile(join(bundleDirectory, 'report.xml')), 'report');
  // Proof: removing this guard let a mixed report/manifest pair pass the pointer-reader negative.
  if (
    manifest['invocationId'] !== invocationId ||
    manifest['report'] !== `tmp/junit/browser/${invocationId}/report.xml` ||
    manifest['reportDigest'] !== digestEvidenceBytes(report)
  )
    throw new Error('Browser report and manifest binding differs');
  return { invocationId, report, manifest };
}

/** A nonzero setup/discovery process cannot produce passing evidence. */
export function assertBrowserCommand(invocation: Invocation, stage: string): void {
  // Proof: disabling this guard made the failed-command negative accept exit 1.
  if (invocation.exitCode !== 0) throw new Error(`Browser ${stage} failed: ${invocation.stderr}`);
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
  await mkdir(join(root, 'tmp/junit'), { recursive: true });
  // Legacy two-file outputs are removed; readers use the single current pointer.
  await Promise.all([rm(report, { force: true }), rm(`${report}.manifest.json`, { force: true })]);
  const revision = assertClean(root);
  const candidate = readIdentity(root, revision);
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
    assertBrowserCommand(build, `${mode} setup`);
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
    const builtArtifact =
      artifact === undefined || artifactDigest === undefined
        ? undefined
        : { path: artifact, digest: artifactDigest };
    const servedRoot =
      mode === 'packaged'
        ? 'dist/apps/wbs/fe-01'
        : mode === 'portable'
          ? 'dist/libs/wbs/application/core'
          : undefined;
    const served =
      servedRoot === undefined
        ? undefined
        : { root: servedRoot, files: await browserServedFiles(checkout, servedRoot) };
    await assertBrowserInputs(
      checkout,
      revision,
      selected.config,
      configBytes,
      builtArtifact,
      served,
    );
    const argumentsBase = ['test', '--config', selected.config];
    const listFile = join(scratch, 'list.json');
    const listedRun = await run(
      ['node', playwrightCli, ...argumentsBase, '--list', '--reporter=json'],
      checkout,
      { ...environment, PLAYWRIGHT_JSON_OUTPUT_FILE: listFile },
      3 * 60_000,
    );
    assertBrowserCommand(listedRun, `${mode} discovery`);
    const listBytes = await readFile(listFile);
    const listed = decodeBrowserJson(
      parseJson(listBytes, 'discovery'),
      checkout,
      selected.config,
      projects,
      'list',
      0,
    );
    await assertBrowserInputs(
      checkout,
      revision,
      selected.config,
      configBytes,
      builtArtifact,
      served,
    );
    // The same checked-revision production helper is fault-injected by the moved-revision negative.
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
    const junit = decodeBrowserText(junitBytes, 'raw JUnit');
    reconcileBrowserJunit(junit, executed);
    await assertBrowserInputs(
      checkout,
      revision,
      selected.config,
      configBytes,
      builtArtifact,
      served,
    );
    assertClean(root, revision);
    const invocationId = randomUUID();
    const reportSource = junitSource(mode, executed.cases);
    const bundlePath = `tmp/junit/browser/${invocationId}`;
    const binding = {
      schemaVersion: 1,
      certifies: false,
      reason: 'raw runner artifacts and invocation are not externally authenticated',
      invocationId,
      mode,
      revision,
      candidate,
      config: selected.config,
      configDigest: digestEvidenceBytes(configBytes),
      artifact: artifact === undefined ? undefined : { path: artifact, digest: artifactDigest },
      served,
      environment: Object.fromEntries(
        Object.entries(environment).filter(([key]) =>
          ['CI', 'E2E_PORT_SHIFT', 'PLAYWRIGHT_CHROMIUM_REGULAR'].includes(key),
        ),
      ),
      runnerVersion: listed.version,
      cases: executed.cases,
      coverage: {
        passingCases: executed.cases.filter((browserCase) => browserCase.status === 'passed')
          .length,
        skippedDebt: executed.cases.filter((browserCase) => browserCase.status === 'skipped')
          .length,
      },
      raw: {
        discovery: {
          path: `${bundlePath}/discovery.json`,
          digest: digestEvidenceBytes(listBytes),
        },
        execution: {
          path: `${bundlePath}/execution.json`,
          digest: digestEvidenceBytes(runBytes),
        },
        junit: {
          path: `${bundlePath}/playwright.xml`,
          digest: digestEvidenceBytes(junitBytes),
        },
      },
      reportDigest: digestEvidenceBytes(reportSource),
      report: `${bundlePath}/report.xml`,
    };
    await publishBrowserBundle(root, mode, invocationId, {
      discovery: listBytes,
      execution: runBytes,
      playwright: junitBytes,
      report: reportSource,
      manifest: binding,
    });
    // Proof: the real portable run exited 1 for a Chromium sandbox failure and wrote failing JUnit.
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
