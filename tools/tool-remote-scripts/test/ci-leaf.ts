import { accessSync, constants, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual, stripVTControlCharacters } from 'node:util';

const PROJECT = 'tools/tool-remote-scripts';
const MODEL = 'src/lib/dependency-product-process-model.test.ts';
const CONTINUATION = 'src/lib/dependency-participant-continuation-model.test.ts';
const RESTORATION = 'src/lib/dependency-source-restoration.test.ts';
const SOURCE = [
  'src/lib/source-role-process.test.ts',
  'src/lib/source-inner-command.test.ts',
  'src/lib/source-inner-program.test.ts',
  'src/lib/source-inner-transport.test.ts',
  'src/lib/source-frontend-http.test.ts',
  'src/lib/source-frontend-profile.test.ts',
  // Proof: omitting this parent failed the actual canonical source-union consumer; restored membership passed (2026-10-29).
  'src/lib/source-readiness.test.ts',
];
const DISCOVERY = [
  'src',
  'test/edge-init.test.ts',
  'test/solver-drain-transport.test.ts',
  'test/solver-drain-fixture.test.ts',
  'test/source-exclusion-transport.test.ts',
  'test/source-exclusion-topology.test.ts',
  'test/source-exclusion-native.test.ts',
  'test/fixture-failure.test.ts',
];
const OPTIONS = ['--preload', '../test/scratch/preload.ts', '--timeout=10000'];

type Leaf = 'model' | 'model-continuation' | 'source' | 'source-restoration' | 'rest';

class TestFailure extends Error {
  constructor(readonly status: number) {
    super(`Remote test leaf exited ${String(status)}`);
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Remote execution requires object configuration');
  return value as Record<string, unknown>; // Boundary: the object/null/array guard establishes this JSON record.
}

function readConfiguration(repository: string, path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(join(repository, path), 'utf8'));
  return requireRecord(value);
}

/** Refuses missing, unreadable, nonregular or aliased required files before Bun filter fallback. */
function requireFile(path: string): void {
  // Proof: bypassing presence/alias/readability guards made each-leaf file refusal tests fail.
  const status = lstatSync(path);
  if (!status.isFile() || realpathSync(path) !== path)
    throw new Error('Remote execution requires canonical regular files');
  accessSync(path, constants.R_OK);
}

/** Absence is the only supported optional discovery configuration; permission failures propagate. */
function refuseConfiguration(path: string): void {
  // Proof: omitting configuration refusal let the real Bun bunfig override negative succeed.
  try {
    lstatSync(path);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
    throw cause;
  }
  throw new Error('Remote execution does not support Bun discovery configuration overrides');
}

/**
 * Validates the reviewed canonical contract before changing only its fixed whole-file ownership.
 * Positional `src` remains Bun's substring filter; the literal no-dot ignore is root-relative.
 * Nx executes these noncached leaf targets with explicit canonical inputs/env and its ordinary
 * executor environment (including PATH, FORCE_COLOR, dotenv and task metadata).
 */
function executionArguments(repository: string, leaf: Leaf): string[] {
  const project = readConfiguration(repository, `${PROJECT}/project.json`);
  const targets = requireRecord(project['targets']);
  const canonical = requireRecord(targets['test']);
  const options = requireRecord(canonical['options']);
  const expectedCommand = ['bun', 'test', ...DISCOVERY, ...OPTIONS].join(' ');
  // Proof: omitting command/dependency/target-shape refusals admitted their actual-runner negatives.
  if (
    !isDeepStrictEqual(Object.keys(canonical).sort(), [
      'dependsOn',
      'executor',
      'inputs',
      'options',
    ]) ||
    canonical['executor'] !== 'nx:run-commands' ||
    !isDeepStrictEqual(options, { command: expectedCommand, cwd: PROJECT }) ||
    !isDeepStrictEqual(canonical['dependsOn'], ['test:caddy']) ||
    !Array.isArray(canonical['inputs']) ||
    canonical['inputs'].length < 2 ||
    !canonical['inputs'].every((input: unknown) => typeof input === 'string') ||
    !canonical['inputs'].includes('default') ||
    !canonical['inputs'].includes('^production')
  )
    throw new Error('Unsupported canonical remote test contract');
  const nx = readConfiguration(repository, 'nx.json');
  const targetDefaults = requireRecord(nx['targetDefaults']);
  // Proof: dropping this guard admitted a wildcard leaf default in the actual-runner override test.
  if (
    Object.keys(targetDefaults).some(
      (name) => name === 'nx:run-commands' || name.startsWith('test:ci:') || name.includes('*'),
    )
  )
    throw new Error('Unsupported remote leaf target defaults');
  const defaults = requireRecord(targetDefaults['test']);
  const environment = { CLAUDECODE: '0', AGENT: '0' };
  // Proof: omitting default-env validation admitted changed test defaults in the real child test.
  if (
    !isDeepStrictEqual(defaults, {
      cache: true,
      inputs: ['default', '^production'],
      outputs: ['{projectRoot}/coverage'],
      options: { env: environment },
    })
  )
    throw new Error('Unsupported canonical remote test environment');
  // Proof: omitting continuation target validation let actual malformed-target negatives execute tests (2026-10-29).
  // Proof: excluding source validation admitted the absent-source-target actual-runner negative (2026-10-29).
  // Proof: omitting only the restoration target entry ran the actual model child
  // despite its missing target; the new target-refusal assertion failed, then passed restored.
  for (const name of [
    'model',
    'model-continuation',
    'source',
    'source-restoration',
    'rest',
  ] as const) {
    const target = requireRecord(targets[`test:ci:${name}`]);
    // Proof: removing this check admitted missing inputs and a changed leaf env in actual-runner tests.
    if (
      !isDeepStrictEqual(target, {
        executor: 'nx:run-commands',
        cache: false,
        inputs: canonical['inputs'],
        options: {
          command: `bun run tools/tool-remote-scripts/test/ci-leaf.ts . ${name}`,
          cwd: '.',
          env: environment,
        },
        dependsOn: ['^build', ...(name === 'rest' ? ['test:caddy'] : [])],
      })
    )
      throw new Error('Unsupported remote leaf inputs, environment or dependencies');
  }
  // Proof: omitting this check let a hostile ambient env execute tiny tests before refusal.
  if (process.env['CLAUDECODE'] !== '0' || process.env['AGENT'] !== '0')
    throw new Error('Remote leaf did not receive the canonical test environment');
  // Proof: omitting this boundary admitted BUN_TEST_TIMEOUT in the actual selection-env negative.
  for (const name of Object.keys(process.env))
    if (name === 'BUN_OPTIONS' || name.startsWith('BUN_TEST_'))
      throw new Error('Unsupported Bun test selection environment');
  for (const path of [
    join(repository, 'bunfig.toml'),
    join(repository, PROJECT, 'bunfig.toml'),
    join(homedir(), '.bunfig.toml'),
  ])
    refuseConfiguration(path);
  // Proof: removing the pin check ran actual tiny tests against a substituted 0.0.0 pin.
  if (readFileSync(join(repository, '.bun-version'), 'utf8').trim() !== Bun.version)
    throw new Error('Remote leaf requires the pinned Bun version');
  // Proof: omitting the continuation file requirement made the actual missing-owner refusal fail (2026-10-29).
  // Proof: omitting SOURCE presence admitted an aliased parent in the actual source-owner refusal (2026-10-29).
  // Proof: omitting RESTORATION launched Bun for its missing parent. The actual
  // child marker broke the pre-dispatch assertion, then passed restored; Bun's later refusal is separate.
  for (const path of [MODEL, CONTINUATION, ...SOURCE, RESTORATION, ...DISCOVERY.slice(1)])
    requireFile(join(repository, PROJECT, path));
  requireFile(join(repository, 'tools/test/scratch/preload.ts'));
  // Proof: dotted/widened ignores and a dropped discovery token broke real canonical union/disjointness.
  // Proof: dropping only the continuation ignore duplicated its actual Bun coverage in rest (2026-10-29).
  // Proof: dropping six source ignores duplicated their actual canonical union/disjoint coverage (2026-10-29).
  return leaf === 'model'
    ? ['test', `./${MODEL}`, ...OPTIONS]
    : leaf === 'model-continuation'
      ? ['test', `./${CONTINUATION}`, ...OPTIONS]
      : leaf === 'source'
        ? ['test', ...SOURCE.map((path) => `./${path}`), ...OPTIONS]
        : // Proof: dispatching this singleton to MODEL broke actual tiny-Bun membership;
          // exact restoration passed the same canonical-union consumer.
          leaf === 'source-restoration'
          ? ['test', `./${RESTORATION}`, ...OPTIONS]
          : [
              'test',
              ...DISCOVERY,
              ...OPTIONS,
              `--path-ignore-patterns=${MODEL}`,
              `--path-ignore-patterns=${CONTINUATION}`,
              ...SOURCE.map((path) => `--path-ignore-patterns=${path}`),
              // Proof: omitting this literal duplicated the actual restoration parent
              // in rest; disjointness failed, then passed after exact restoration.
              `--path-ignore-patterns=${RESTORATION}`,
            ];
}

/**
 * Executes one fresh CI leaf, preserving child status and streaming logs with only a bounded
 * summary tail retained in memory. The final contiguous outer summary keeps pass, fail and
 * file counts together after nested parent-child output; its terminal boundary refuses
 * malformed final output rather than falling back to an earlier child. A successful child must have
 * actually run nonempty tests.
 */
export async function runRemoteTests(
  repositoryPath: string,
  leafName: string,
  head: string,
): Promise<void> {
  const repository = resolve(repositoryPath);
  // Proof: omitting the leaf allowlist admitted unknown as the complementary actual Bun execution.
  if (
    leafName !== 'model' &&
    leafName !== 'model-continuation' &&
    leafName !== 'source' &&
    leafName !== 'source-restoration' &&
    leafName !== 'rest'
  )
    throw new Error('Unknown remote test leaf');
  const checkedOut = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {
    cwd: repository,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  // Proof: dropping HEAD equality executed real tiny tests for the wrong immutable head.
  if (
    !/^[a-f0-9]{40}$/.test(head) ||
    checkedOut.exitCode !== 0 ||
    checkedOut.stdout.toString().trim() !== head
  )
    throw new Error('Remote leaf checkout does not match the immutable head');
  const args = executionArguments(repository, leafName);
  const started = performance.now();
  const child = Bun.spawn([process.execPath, ...args], {
    cwd: join(repository, PROJECT),
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let tail = '';
  async function stream(
    source: ReadableStream<Uint8Array>,
    destination: NodeJS.WriteStream,
  ): Promise<void> {
    const decoder = new TextDecoder();
    for await (const frame of source) {
      const chunk = decoder.decode(frame, { stream: true });
      destination.write(chunk);
      if (destination === process.stderr) tail = (tail + chunk).slice(-16384);
    }
    const final = decoder.decode();
    destination.write(final);
    if (destination === process.stderr) tail = (tail + final).slice(-16384);
  }
  const [status] = await Promise.all([
    child.exited,
    stream(child.stdout, process.stdout),
    stream(child.stderr, process.stderr),
  ]);
  // Proof: omitting status propagation changed the actual child's exit 23 to 1.
  if (status !== 0) throw new TestFailure(status);
  const summary = stripVTControlCharacters(tail);
  // Proof: removing the terminal anchor accepted a malformed outer receipt by falling back to a joined nested child (2026-10-29).
  const receipt =
    /(?:^|\n)[ \t]*(\d+) pass\r?\n(?:[ \t]*\d+ (?:skip|todo|filtered out)\r?\n)*[ \t]*(\d+) fail\r?\n(?:[ \t]*\d+ expect\(\) calls\r?\n)?Ran (\d+) tests? across (\d+) files?\.[^\r\n]*\s*$/.exec(
      summary,
    );
  // Proof: bypassing the source file count admitted an actual six-parent receipt transformed exactly once from six to five (2026-10-29).
  // Proof: dropping the positive-pass check accepted an actual empty Bun file as fresh success.
  if (
    receipt === null ||
    Number(receipt[1]) === 0 ||
    Number(receipt[2]) !== 0 ||
    (leafName !== 'rest' && Number(receipt[4]) !== (leafName === 'source' ? SOURCE.length : 1))
  )
    throw new Error('Remote leaf produced no successful nonempty execution receipt');
  process.stdout.write(
    `${JSON.stringify({ head, leaf: leafName, fresh: true, tests: Number(receipt[3]), files: Number(receipt[4]), elapsedMs: Math.round(performance.now() - started), exitCode: status })}\n`,
  );
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const repository = args.at(0);
  const leaf = args.at(1);
  const headFlag = args.at(2);
  if (
    process.argv.length !== 5 ||
    repository === undefined ||
    leaf === undefined ||
    headFlag?.startsWith('--head=') !== true
  )
    throw new Error(
      'Usage: ci-leaf.ts <repository> <model|model-continuation|source|source-restoration|rest> --head=<sha>',
    );
  try {
    await runRemoteTests(repository, leaf, headFlag.slice('--head='.length));
  } catch (cause) {
    if (!(cause instanceof TestFailure)) throw cause;
    process.stderr.write(`${cause.message}\n`);
    process.exitCode = cause.status;
  }
}
