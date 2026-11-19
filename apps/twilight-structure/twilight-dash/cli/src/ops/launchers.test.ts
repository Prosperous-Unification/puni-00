import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { fakeCredential } from '../compute/testing/credential';
import { fixtureGit, gateTree } from '../resources/host-pool.test.fixture';
import { catalogueOf, fakeSystemdRun } from './ops.test.fixture';
import { HostJobRunRecords } from './run-records';

/**
 * The real launchers against a real enrolled host (`dash-host-jobs` tasks 6.1, 6.2): `bin/h2puni-gate.sh`
 * and `bin/publish-release.sh` copied byte for byte into a fixture checkout, entering through
 * `run_heavy_job`, which finds the host pool configuration at its fixed path
 * `/home/puni1/.config/dash/host-pool.json`. That path is made a fixture by running this file in
 * a private user, mount and PID namespace whose `/home/puni1` subtrees are tmpfs, so no host
 * file is read or written. The fixture checkout uses Dash's real job execution and calibration
 * over the fake scope seam, because the namespace has no user manager.
 */
const NAMESPACE_FLAG = 'DASH_LAUNCHER_TEST_NAMESPACE';
const NAMESPACE_ANCHOR = 'DASH_LAUNCHER_TEST_ANCHOR';
const NAMESPACE_REFUSAL = 'launcher fixture requires invocation-owned private mounts';
const GATE_HOME = '/home/puni1';
const AUTHORITY_DIRECTORIES = ['.config', '.cache', '.local'] as const;
const SCRATCH_WITNESS = 'assigned-scratch-witness';
const WORKSPACE = join(import.meta.dir, '..', '..', '..', '..', '..', '..');
const DASH_SOURCE = join(import.meta.dir, '..');

/**
 * Inside the new mount namespace, create a private gate account. Preserve the real `puni1`
 * home only when the test runs there and needs its checkout or tools. Overlay its existing
 * authority directories without creating paths in that real home.
 */
const NAMESPACE_SETUP = [
  'set -euo pipefail',
  'anchor=$1 scratch=$2',
  'shift 2',
  'mount --make-rprivate /',
  'mkdir "$anchor/home" "$anchor/private" "$anchor/scratch"',
  'mount --rbind /home "$anchor/home"',
  'mount --bind "$scratch" "$anchor/scratch"',
  'mount -t tmpfs tmpfs "$anchor/private"',
  'mount -t tmpfs tmpfs /home',
  'for entry in "$anchor"/home/* "$anchor"/home/.[!.]*; do',
  '  [ -e "$entry" ] || continue',
  '  name=${entry##*/}',
  '  if [ "$name" = puni1 ] && [ "${HOME:-}" != /home/puni1 ]; then continue; fi',
  '  mkdir "/home/$name"',
  '  mount --rbind "$entry" "/home/$name"',
  'done',
  'mkdir -p /home/puni1',
  `for directory in ${AUTHORITY_DIRECTORIES.join(' ')}; do`,
  '  if [ "${HOME:-}" = /home/puni1 ]; then',
  '    test -d "/home/puni1/$directory"',
  '  else',
  '    mkdir -p "/home/puni1/$directory"',
  '  fi',
  '  mkdir "$anchor/private/$directory"',
  '  mount --bind "$anchor/private/$directory" "/home/puni1/$directory"',
  'done',
  `export ${NAMESPACE_ANCHOR}="$anchor" TMPDIR="$anchor/scratch"`,
  'exec "$@"',
].join('\n');

/** Start the inner runner with a reachable home bind and a child of the caller's assigned scratch. */
function runInNamespace(args: string[], environment: NodeJS.ProcessEnv) {
  const anchor = mkdtempSync('/tmp/dash-launcher-namespace-');
  try {
    const assigned = environment['TMPDIR'];
    const scratch = mkdtempSync(
      join(
        assigned === undefined || assigned === '' ? '/tmp' : assigned,
        'dash-launcher-assigned-',
      ),
    );
    try {
      const execution = Bun.spawnSync(
        [
          'unshare',
          '--user',
          '--map-root-user',
          '--mount',
          '--pid',
          '--fork',
          '--mount-proc',
          'setpriv',
          '--bounding-set=-sys_ptrace',
          'bash',
          '-c',
          NAMESPACE_SETUP,
          'launcher-namespace',
          anchor,
          scratch,
          process.execPath,
          'test',
          import.meta.path,
          '--timeout=120000',
          ...args,
        ],
        {
          env: { ...cleanLauncherEnv(environment), [NAMESPACE_FLAG]: '1' },
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 420000,
        },
      );
      return { execution, scratchFiles: readdirSync(scratch) };
    } finally {
      rmSync(scratch, { recursive: true });
    }
  } finally {
    rmSync(anchor, { recursive: true });
  }
}

/** Prove that every fixed authority path is a bind of this invocation's private tmpfs. */
function requirePrivateMounts(): string {
  try {
    const anchor = process.env[NAMESPACE_ANCHOR];
    if (!anchor || !/^\/tmp\/dash-launcher-namespace-[a-zA-Z0-9_]+$/.test(anchor))
      throw new Error('missing private mount anchor');
    const mounts = new Map(
      readFileSync('/proc/self/mountinfo', 'utf8')
        .trim()
        .split('\n')
        .map((entry) => {
          const [mount, filesystem] = entry.split(' - ');
          return [mount.split(' ')[4], filesystem.split(' ')[0]] as const;
        }),
    );
    const storage = join(anchor, 'private');
    const scratch = join(anchor, 'scratch');
    // Proof: keeping the inherited hidden TMPDIR broke the nested assigned-scratch case.
    if (mounts.get(storage) !== 'tmpfs' || !mounts.has(scratch) || tmpdir() !== scratch)
      throw new Error('missing private storage or assigned scratch bind');
    for (const directory of AUTHORITY_DIRECTORIES) {
      const target = join(GATE_HOME, directory);
      const mounted = statSync(target);
      const owned = statSync(join(storage, directory));
      if (mounts.get(target) !== 'tmpfs' || mounted.dev !== owned.dev || mounted.ino !== owned.ino)
        throw new Error(`mismatched private mount for ${target}`);
    }
    return anchor;
  } catch (cause) {
    throw new Error(NAMESPACE_REFUSAL, { cause });
  }
}

/** What an enclosing gate or host job exports that a launcher under test must not inherit. */
const INHERITED_JOB_VARIABLE =
  /^(HEAVY_LOCK_(LABEL|WAIT_SECONDS|POLL_SECONDS|JOB_TYPE)|DASH_JOB_(ID|TYPE|UNIT_.+)|HEAVY_JOB_ENROLLMENT)$/;

/**
 * `environment` without the heavy-lock and Dash job variables: run inside a real gate, this
 * suite inherits `HEAVY_LOCK_LABEL=gate:<sha>` from `bin/h2puni-gate.sh`, and a launcher spawned
 * with it labels its job as the outer gate (h2puni gate on 37ca6254a, verify.md Slice 6c).
 */
function cleanLauncherEnv(environment: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !INHERITED_JOB_VARIABLE.test(entry[0]),
    ),
  );
}

if (process.env[NAMESPACE_FLAG] !== '1') {
  test('launchers.test.ts in a private user, mount and PID namespace', () => {
    const { execution } = runInNamespace([], process.env);
    if (execution.exitCode !== 0)
      throw new Error(execution.stdout.toString() + execution.stderr.toString());
    process.stderr.write(execution.stderr.toString());
    expect(execution.exitCode).toBe(0);
  }, 420000);
} else {
  // Proof: omitting this check lost the early refusal in both disposable sentinel cases.
  const anchor = requirePrivateMounts();
  const CONFIG = '/home/puni1/.config/dash/host-pool.json';
  const ROOT = '/home/puni1/.local/share/dash/host-pool';
  const LEDGER = join(ROOT, '.dash', 'resources.sqlite');

  test.each(['missing anchor', 'unrelated private root'])(
    'an inherited inner flag with %s refuses before touching authority',
    (fault) => {
      mkdirSync(dirname(CONFIG), { recursive: true });
      mkdirSync(dirname(ROOT), { recursive: true });
      mkdirSync(ROOT);
      const ledger = join(ROOT, 'sentinel');
      writeFileSync(CONFIG, 'outer configuration', { flag: 'wx' });
      writeFileSync(ledger, 'outer pool', { flag: 'wx' });
      const local = join(anchor, 'private', '.local');
      const owned = `${local}.original`;
      const mismatch = fault === 'unrelated private root';
      try {
        if (mismatch) {
          renameSync(local, owned);
          mkdirSync(local);
        }
        const execution = Bun.spawnSync(
          [process.execPath, 'test', import.meta.path, '-t', 'submits one enrolled calibration'],
          {
            env: { ...process.env, [NAMESPACE_ANCHOR]: mismatch ? anchor : '' },
            stdout: 'pipe',
            stderr: 'pipe',
            timeout: 15000,
          },
        );
        expect(execution.exitCode).toBe(1);
        expect(execution.stderr.toString()).toContain(NAMESPACE_REFUSAL);
        expect(readFileSync(CONFIG, 'utf8')).toBe('outer configuration');
        expect(readdirSync(ROOT)).toEqual(['sentinel']);
        expect(readFileSync(ledger, 'utf8')).toBe('outer pool');
      } finally {
        if (mismatch) {
          rmdirSync(local);
          renameSync(owned, local);
        }
        rmSync(CONFIG);
        rmSync(ledger);
        rmdirSync(ROOT);
      }
    },
  );

  test('nested launcher retains the assigned job scratch across account overlays', () => {
    mkdirSync(dirname(CONFIG), { recursive: true });
    mkdirSync(dirname(ROOT), { recursive: true });
    mkdirSync(ROOT);
    const jobScratch = mkdtempSync(join(ROOT, 'job-'));
    writeFileSync(CONFIG, 'outer configuration', { flag: 'wx' });
    try {
      writeFileSync(join(jobScratch, 'outer-sentinel'), 'assigned job scratch');
      const { execution, scratchFiles } = runInNamespace(
        ['-t', '^inner launcher writes to the assigned scratch bind$'],
        { ...process.env, HOME: GATE_HOME, TMPDIR: jobScratch },
      );
      expect(execution.exitCode, execution.stderr.toString()).toBe(0);
      expect(execution.stderr.toString()).toContain('1 pass');
      expect(scratchFiles).toEqual([SCRATCH_WITNESS]);
      expect(readFileSync(CONFIG, 'utf8')).toBe('outer configuration');
      expect(readdirSync(ROOT)).toEqual([basename(jobScratch)]);
      expect(readdirSync(jobScratch)).toEqual(['outer-sentinel']);
      expect(readFileSync(join(jobScratch, 'outer-sentinel'), 'utf8')).toBe('assigned job scratch');
    } finally {
      rmSync(CONFIG);
      rmSync(jobScratch, { recursive: true });
      rmdirSync(ROOT);
    }
  });

  test('inner launcher writes to the assigned scratch bind', () => {
    expect(existsSync(CONFIG)).toBe(false);
    expect(existsSync(ROOT)).toBe(false);
    const scratch = mkdtempSync(join(tmpdir(), 'dash-launcher-check-'));
    rmSync(scratch, { recursive: true });
    writeFileSync(join(tmpdir(), SCRATCH_WITNESS), 'private scratch is writable', { flag: 'wx' });
  });

  /** Run each recognized job verb through Dash and record the submitted argv. */
  const FIXTURE_DASH = `
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { monotonicClock, wallClock } from ${JSON.stringify(join(DASH_SOURCE, 'clock'))};
import { ampleHost } from ${JSON.stringify(join(DASH_SOURCE, 'resources', 'host-pool.test.fixture'))};
import { calibrateHostJob, runHostJob } from ${JSON.stringify(join(DASH_SOURCE, 'ops', 'job-run'))};
import { productionLegacyLock } from ${JSON.stringify(join(DASH_SOURCE, 'resources', 'legacy-lock'))};
import { fakeScopeTelemetry } from ${JSON.stringify(join(DASH_SOURCE, 'ops', 'ops.test.fixture'))};
import { OpsRefusal } from ${JSON.stringify(join(DASH_SOURCE, 'ops', 'refusal'))};

const words = process.argv.slice(2);
appendFileSync(process.env['LAUNCHER_TEST_DASH_LOG'] ?? '/dev/null', words.join(' ') + '\\n');
if (process.env['LAUNCHER_TEST_DASH_ARGV'])
  appendFileSync(process.env['LAUNCHER_TEST_DASH_ARGV'], JSON.stringify(words) + '\\n');
const originalVerifier = process.env['LAUNCHER_TEST_REPLACE_VERIFIER'];
if (originalVerifier) {
  const captured = process.env['H2PUNI_GATE_TRUSTED_LAUNCHER'];
  if (!captured || !readFileSync(captured).equals(readFileSync(originalVerifier)))
    throw new Error('verifier copy absent before admission');
  writeFileSync(originalVerifier, 'exit 91\\n');
}
const flag = (name) => words[words.indexOf(name) + 1];
const separator = words.indexOf('--');
if (words[0] !== 'ops' || words[1] !== 'job' ||
    !['run', 'calibrate'].includes(words[2]) || separator < 0)
  throw new Error('fixture Dash requires ops job run or calibrate');
const run = words[2] === 'calibrate' ? calibrateHostJob : runHostJob;
try {
  process.exitCode = await run(
    {
      config: flag('--config'),
      type: flag('--type'),
      label: flag('--label'),
      waitSeconds: Number(flag('--wait-seconds')),
      pollSeconds: Number(flag('--poll-seconds')),
      argv: words.slice(separator + 1),
    },
    {
      clock: wallClock(),
      monotonic: monotonicClock(),
      environment: process.env,
      cwd: process.cwd(),
      report: (line) => process.stderr.write(line + '\\n'),
      telemetry: fakeScopeTelemetry(process.env['LAUNCHER_TEST_CGROUPS']),
      host: ampleHost,
      sampleIntervalMs: 1000,
      settleBudgetMs: 20000,
      user: 'puni1',
      // Inside the namespace /home/puni1/.cache is tmpfs: the canonical lock is a fixture.
      legacyLock: productionLegacyLock(),
    },
  );
} catch (cause) {
  if (!(cause instanceof OpsRefusal)) throw cause;
  process.stderr.write('error: ' + cause.message + '\\n');
  process.exitCode = cause.exitCode;
}
`;

  /**
   * A stage that records `<barrier>/<name>` and waits until `LAUNCHER_TEST_PARTIES` stages have,
   * so a pass proves the runs overlapped; exit 3 after 60 s without them.
   */
  const barrierStage = (name: string): string =>
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `printf '%s\\n' "$PWD" > "$LAUNCHER_TEST_BARRIER/${name}"`,
      'if [[ -n ${LAUNCHER_TEST_STAGE_LOG:-} ]]; then',
      '  test -f "$TMPDIR/.dash-tmp-identity"',
      '  printf "%s\\n" "$PWD" "$(git rev-parse HEAD)" "$TMPDIR" >> "$LAUNCHER_TEST_STAGE_LOG"',
      'fi',
      'if [[ -n ${LAUNCHER_TEST_WIKI_ORDER:-} ]]; then',
      '  printf "stage\\n" >> "$LAUNCHER_TEST_WIKI_ORDER"',
      'fi',
      'for _ in $(seq 1 1200); do',
      '  [ "$(ls "$LAUNCHER_TEST_BARRIER" | wc -l)" -ge "$LAUNCHER_TEST_PARTIES" ] && exit "${LAUNCHER_TEST_STEPS_STATUS:-0}"',
      '  sleep 0.05',
      'done',
      'exit 3',
      '',
    ].join('\n');

  let base = '';
  let checkout = '';
  let units: string[] = [];
  let tools = '';
  let launchedSha = '';
  let testStubs = '';

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'dash-launchers-'));
    checkout = join(base, 'launcher-checkout');
    for (const directory of [
      'bin',
      'infra/jobs',
      'apps/twilight-structure/twilight-dash/cli/src',
      'tools/tool-dagger/src',
    ])
      mkdirSync(join(checkout, directory), { recursive: true });
    for (const script of [
      'heavy-lock-lib.sh',
      'with-heavy-lock.sh',
      'h2puni-gate.sh',
      'h2puni-gate-lib.sh',
      'h2puni-gate-payload.sh',
      'publish-release.sh',
      'publish-release-payload.sh',
      'test-queued.sh',
      'test-queued-payload.sh',
    ])
      copyFileSync(join(WORKSPACE, 'bin', script), join(checkout, 'bin', script));
    writeFileSync(join(checkout, 'bin', 'h2puni-gate-steps.sh'), barrierStage('gate-$$'));
    writeFileSync(
      join(checkout, 'tools/tool-dagger/src/main.ts'),
      [
        "import { readdirSync, writeFileSync } from 'node:fs';",
        "const barrier = process.env['LAUNCHER_TEST_BARRIER'] ?? '';",
        "writeFileSync(`${barrier}/release-${String(process.pid)}`, process.env['WBS_SHA'] ?? 'no sha');",
        'for (let poll = 0; poll < 1200; poll++) {',
        "  if (readdirSync(barrier).length >= Number(process.env['LAUNCHER_TEST_PARTIES'])) process.exit(0);",
        '  await Bun.sleep(50);',
        '}',
        'process.exit(3);',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(checkout, 'apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts'),
      FIXTURE_DASH,
    );
    const fixtureCatalogue = catalogueOf([
      { id: 'gate', cpuCores: 1, memoryGib: 1, exclusive: ['gate_tree'], argumentProfile: '<sha>' },
      { id: 'release-build', cpuCores: 1, memoryGib: 1 },
      {
        id: 'test-queued',
        cpuCores: 1,
        memoryGib: 1,
        exclusive: ['gate_tree'],
        argumentProfile: '<sha>',
      },
    ]);
    // The real launchers as entrypoints, so `switch-mode` verifies they call `run_heavy_job`.
    const entrypoints: Record<string, string> = {
      gate: 'bin/h2puni-gate.sh',
      'release-build': 'bin/publish-release.sh',
      'test-queued': 'bin/test-queued.sh',
    };
    const catalogue = {
      ...fixtureCatalogue,
      jobs: fixtureCatalogue.jobs.map((job) => ({
        ...job,
        entrypoint: entrypoints[job.id] ?? job.entrypoint,
      })),
    };
    writeFileSync(
      join(checkout, 'infra/jobs/catalogue.json'),
      `${JSON.stringify(catalogue, null, 2)}\n`,
    );
    fixtureGit(checkout, 'init', '--quiet', '--initial-branch=main');
    fixtureGit(checkout, 'add', '.');
    fixtureGit(checkout, 'commit', '--quiet', '-m', 'launcher checkout');
    launchedSha = fixtureGit(checkout, 'rev-parse', 'HEAD');
    units = [gateTree(join(base, 'gate-tree-1')), gateTree(join(base, 'gate-tree-2'))];
    tools = fakeSystemdRun(join(base, 'tools'), 'exec');
    // The gate launcher's BuildKit preflight on an enrolled host (task 6.21);
    // `LAUNCHER_TEST_BUILDX=missing` answers as Ubuntu's docker.io does without the plugin.
    writeFileSync(
      join(tools, 'docker'),
      [
        '#!/usr/bin/env bash',
        'if [ "$1 ${2:-}" = "buildx version" ] && [ "${LAUNCHER_TEST_BUILDX:-present}" = present ]; then',
        "  echo 'github.com/docker/buildx 0.30.1'",
        '  exit 0',
        'fi',
        'echo "docker: unknown command: docker $1" >&2',
        'exit 1',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    // The test-queued payload's two commands: `bun install` is logged and every other `bun` is
    // the real one (Dash itself), and `bunx` is a barrier stage recording the tree it ran in.
    testStubs = join(base, 'test-stubs');
    mkdirSync(testStubs);
    writeFileSync(
      join(testStubs, 'bun'),
      [
        '#!/usr/bin/env bash',
        'if [ "${1:-}" = install ]; then',
        '  printf \'%s in %s\\n\' "$*" "$PWD" >> "$LAUNCHER_TEST_BUN_LOG"',
        '  exit "${LAUNCHER_TEST_INSTALL_STATUS:-0}"',
        'fi',
        `exec ${JSON.stringify(process.execPath)} "$@"`,
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    writeFileSync(join(testStubs, 'bunx'), barrierStage('test-$$'), { mode: 0o755 });
  });
  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  function writeConfig(diskBudgetUnits = 16, config: string | number = CONFIG): void {
    mkdirSync('/home/puni1/.config/dash', { recursive: true });
    writeFileSync(
      config,
      JSON.stringify({
        schemaVersion: 3,
        root: ROOT,
        authorityId: 'runtime-one',
        epoch: 'epoch-one',
        providerId: 'provider-one',
        mcpResource: 'http://127.0.0.1:3100/mcp',
        credential: fakeCredential(),
        diskUnitBytes: 1073741824,
        diskBudgetUnits,
        workspaceSlots: 16,
        headroomBytes: 0,
        cpuCores: 4,
        memoryGib: 4,
        headroom: { cpuCores: 0, memoryGib: 0 },
        exclusiveUnits: { gate_tree: units },
        enrollmentId: 'enrollment-one',
        // Slice 6b: the launcher checkout switch-mode verifies, and the types that may overlap.
        launcherCheckouts: [checkout],
        concurrencyEligible: ['gate', 'release-build'],
      }),
      { mode: 0o600 },
    );
  }

  /** Start one launcher and join its terminal and both output streams. */
  async function launch(
    argv: readonly string[],
    barrier: string,
    parties: number,
    extra: Record<string, string> = {},
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const run = Bun.spawn([...argv], {
      cwd: checkout,
      env: {
        ...cleanLauncherEnv(process.env),
        PATH: `${tools}:${process.env['PATH'] ?? ''}`,
        TOOL_WIKI_ACTIVATION_ROOT: '',
        LAUNCHER_TEST_BARRIER: barrier,
        LAUNCHER_TEST_PARTIES: String(parties),
        LAUNCHER_TEST_DASH_LOG: join(base, 'dash.log'),
        LAUNCHER_TEST_CGROUPS: join(base, 'cgroups'),
        ...extra,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      run.exited,
      new Response(run.stdout).text(),
      new Response(run.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
  }

  function barrierDirectory(name: string): string {
    const directory = join(base, name);
    mkdirSync(directory);
    return directory;
  }

  const gate = ['bash', 'bin/h2puni-gate.sh', 'HEAD'];
  const release = ['bash', 'bin/publish-release.sh'];
  const testQueued = ['bash', 'bin/test-queued.sh', 'HEAD'];

  /** The environment a test-queued launch adds: its stubs first on `PATH`, and their log. */
  const testQueuedEnv = (): Record<string, string> => ({
    PATH: `${testStubs}:${tools}:${process.env['PATH'] ?? ''}`,
    LAUNCHER_TEST_BUN_LOG: join(base, 'bun.log'),
  });

  function initializeObservePool(diskBudgetUnits?: number): () => void {
    mkdirSync(dirname(ROOT), { recursive: true });
    mkdirSync(ROOT, { mode: 0o700 });
    let ownsConfig = false;
    const retire = (): void => {
      if (ownsConfig) rmSync(CONFIG);
      const retired = mkdtempSync(join(dirname(ROOT), 'retired-pool-'));
      renameSync(ROOT, join(retired, 'pool'));
    };
    try {
      mkdirSync(dirname(CONFIG), { recursive: true });
      // Proof: opening with 'w' bypassed the config collision and reached pool init.
      const config = openSync(CONFIG, 'wx', 0o600);
      ownsConfig = true;
      try {
        writeConfig(diskBudgetUnits, config);
      } finally {
        closeSync(config);
      }
      const init = Bun.spawnSync(
        [
          process.execPath,
          join(DASH_SOURCE, 'entrypoint.ts'),
          'ops',
          'pool',
          'init',
          '--config',
          CONFIG,
        ],
        { env: cleanLauncherEnv(process.env), stdout: 'pipe', stderr: 'pipe' },
      );
      expect(init.stderr.toString()).toBe('');
      expect(init.exitCode).toBe(0);
      expect(existsSync(LEDGER)).toBe(true);
      return retire;
    } catch (cause) {
      retire();
      throw cause;
    }
  }

  test('failed observe initialization retires only the root it created', () => {
    mkdirSync(dirname(CONFIG), { recursive: true });
    mkdirSync(dirname(ROOT), { recursive: true });
    mkdirSync(ROOT);
    const ledger = join(ROOT, 'sentinel');
    writeFileSync(CONFIG, 'outer configuration', { flag: 'wx' });
    writeFileSync(ledger, 'outer pool', { flag: 'wx' });
    try {
      try {
        expect(() => initializeObservePool(2)).toThrow(/EEXIST/);
        expect(readFileSync(ledger, 'utf8')).toBe('outer pool');
      } finally {
        rmSync(ledger);
        rmdirSync(ROOT);
      }
      expect(() => initializeObservePool(2)).toThrow(/EEXIST/);
      expect(readFileSync(CONFIG, 'utf8')).toBe('outer configuration');
      expect(existsSync(ROOT)).toBe(false);
    } finally {
      rmSync(CONFIG, { force: true });
    }
    expect(() => initializeObservePool(0)).toThrow(/diskBudgetUnits/);
    expect(existsSync(CONFIG)).toBe(false);
    expect(existsSync(ROOT)).toBe(false);
  });

  describe('gate calibration through the outer launcher', () => {
    const calibrate = ['bash', 'bin/h2puni-gate.sh', '--calibrate'];
    let retirePool: (() => void) | undefined;

    beforeAll(() => {
      retirePool = initializeObservePool(2);
    });
    afterAll(() => {
      retirePool?.();
    });

    test('refuses a nested ordinary gate before any second admission', async () => {
      const barrier = barrierDirectory('nested-gate');
      const log = join(barrier, 'dash.jsonl');
      const library = join(checkout, 'bin', 'heavy-lock-lib.sh');
      const original = readFileSync(library);
      const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      // The fake scope does not create a kernel cgroup. Replace only that OS observation.
      writeFileSync(
        library,
        `${original.toString()}\nread_own_cgroup() { printf '%s\\n' '/fake/dash-job-${id}.scope'; }\n`,
      );
      try {
        const invocation = await launch(gate, barrier, 1, {
          DASH_JOB_ID: id,
          LAUNCHER_TEST_DASH_ARGV: log,
          LAUNCHER_TEST_DASH_LOG: log,
        });
        expect(invocation.exitCode, invocation.stderr).toBe(70);
        expect(invocation.stderr).toContain('gate declares the exclusive unit gate_tree');
        expect(readdirSync(barrier)).toEqual([]);
      } finally {
        writeFileSync(library, original);
      }
    }, 20000);

    test('submits one enrolled calibration with the fixed gate payload', async () => {
      const barrier = barrierDirectory('calibration-success');
      const dispatch = join(base, 'calibration-argv.jsonl');
      const stage = join(base, 'calibration-stage');
      const resting = units.map((unit) => fixtureGit(unit, 'rev-parse', 'HEAD'));
      expect(resting).not.toContain(launchedSha);
      const invocation = await launch([...calibrate, 'HEAD'], barrier, 1, {
        HEAVY_LOCK_WAIT_SECONDS: '0',
        LAUNCHER_TEST_DASH_ARGV: dispatch,
        LAUNCHER_TEST_DASH_LOG: '/dev/null',
        LAUNCHER_TEST_STAGE_LOG: stage,
      });
      expect(existsSync(dispatch), invocation.stderr).toBe(true);
      expect(
        readFileSync(dispatch, 'utf8')
          .trim()
          .split('\n')
          .map((line): unknown => JSON.parse(line)),
      ).toEqual([
        [
          'ops',
          'job',
          'calibrate',
          '--type',
          'gate',
          '--config',
          CONFIG,
          '--wait-seconds',
          '0',
          '--poll-seconds',
          '5',
          '--label',
          `gate:${launchedSha.slice(0, 8)}`,
          '--',
          join(checkout, 'bin', 'h2puni-gate-payload.sh'),
          launchedSha,
        ],
      ]);
      expect(invocation.exitCode, invocation.stderr).toBe(0);
      expect(invocation.stderr).toContain(`h2puni gate: running on ${launchedSha}`);
      const [tree, sha, scratch] = readFileSync(stage, 'utf8').trim().split('\n');
      expect(tree).toBe(units[0]);
      expect(sha).toBe(launchedSha);
      expect(scratch).toMatch(new RegExp(`^${ROOT}/[0-9a-f-]{36}$`));
      expect(units.map((unit) => fixtureGit(unit, 'rev-parse', 'HEAD'))).toEqual(resting);
      expect(fixtureGit(checkout, 'rev-parse', 'HEAD')).toBe(launchedSha);
      expect(fixtureGit(checkout, 'status', '--porcelain')).toBe('');
      const records = HostJobRunRecords.openForReading(ROOT);
      try {
        expect(records.list()).toMatchObject([{ calibration: true, exitCode: 0 }]);
      } finally {
        records.close();
      }
    }, 20000);

    test('ordinary explicit and default gates still submit one run', async () => {
      for (const target of [[], [launchedSha]]) {
        const label = `ordinary-${String(target.length)}`;
        const barrier = barrierDirectory(label);
        const dispatch = join(base, `${label}.jsonl`);
        const invocation = await launch(['bash', 'bin/h2puni-gate.sh', ...target], barrier, 1, {
          LAUNCHER_TEST_DASH_ARGV: dispatch,
          LAUNCHER_TEST_DASH_LOG: '/dev/null',
          HEAVY_LOCK_JOB_OPERATION: 'calibrate',
          is_calibration: 'true',
        });
        expect(invocation.exitCode, invocation.stderr).toBe(0);
        expect(
          readFileSync(dispatch, 'utf8')
            .trim()
            .split('\n')
            .map((line): unknown => JSON.parse(line)),
        ).toEqual([
          [
            'ops',
            'job',
            'run',
            '--type',
            'gate',
            '--config',
            CONFIG,
            '--wait-seconds',
            '1800',
            '--poll-seconds',
            '5',
            '--label',
            `gate:${launchedSha.slice(0, 8)}`,
            '--',
            join(checkout, 'bin', 'h2puni-gate-payload.sh'),
            launchedSha,
          ],
        ]);
      }
    }, 20000);

    async function refusesCalibration(
      name: string,
      arguments_: string[],
      status: number,
      diagnostic: string,
      extra: Record<string, string> = {},
    ): Promise<void> {
      const barrier = barrierDirectory(name);
      const dispatch = join(barrier, 'dash.jsonl');
      const invocation = await launch([...calibrate, ...arguments_], barrier, 1, {
        HEAVY_LOCK_WAIT_SECONDS: '0',
        LAUNCHER_TEST_DASH_ARGV: dispatch,
        LAUNCHER_TEST_DASH_LOG: dispatch,
        ...extra,
      });
      expect(invocation.exitCode, invocation.stderr).toBe(status);
      expect(invocation.stderr).toContain(diagnostic);
      expect(invocation.stderr).not.toContain('heavy lock: waited');
      expect(readdirSync(barrier)).toEqual([]);
    }

    test.each([
      ['missing', []],
      ['empty', ['']],
      ['extra', ['HEAD', 'HEAD']],
    ] as const)(
      'calibration refuses the %s target argument before admission',
      async (name, target) => {
        await refusesCalibration(
          `calibration-${name}`,
          [...target],
          64,
          'usage: h2puni-gate.sh --calibrate <sha>',
        );
      },
    );

    test('calibration refuses an unresolvable target before admission', async () => {
      await refusesCalibration(
        'calibration-unresolvable',
        ['not-a-commit'],
        64,
        'not-a-commit is not a commit',
      );
    });

    test.each([
      ['empty', ''],
      ['set', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
    ])('calibration refuses the %s inherited Dash identity', async (name, id) => {
      await refusesCalibration(
        `calibration-identity-${name}`,
        ['HEAD'],
        70,
        'calibration must start outside a Dash job',
        {
          DASH_JOB_ID: id,
        },
      );
    });

    test('calibration refuses with missing config beside the ledger', async () => {
      const saved = `${CONFIG}.saved`;
      renameSync(CONFIG, saved);
      try {
        await refusesCalibration(
          'calibration-config-missing',
          ['HEAD'],
          70,
          'is missing beside the ledger',
        );
      } finally {
        renameSync(saved, CONFIG);
      }
    });

    test('calibration refuses without enrollment or a legacy hold', async () => {
      const savedConfig = `${CONFIG}.saved`;
      const savedRoot = `${ROOT}.saved`;
      renameSync(CONFIG, savedConfig);
      renameSync(ROOT, savedRoot);
      try {
        await refusesCalibration(
          'calibration-unenrolled',
          ['HEAD'],
          70,
          'calibration requires an enrolled host',
        );
      } finally {
        renameSync(savedRoot, ROOT);
        renameSync(savedConfig, CONFIG);
      }
    });

    // The solver smoke, the gate's last step, refuses the legacy builder inside a Dash job.
    test.each([
      ['gate', ['bash', 'bin/h2puni-gate.sh', 'HEAD']],
      ['calibration', [...calibrate, 'HEAD']],
    ] as const)('refuses an enrolled %s without BuildKit before admission', async (name, argv) => {
      const barrier = barrierDirectory(`buildkit-missing-${name}`);
      const dispatch = join(barrier, 'dash.jsonl');
      const invocation = await launch([...argv], barrier, 1, {
        HEAVY_LOCK_WAIT_SECONDS: '0',
        LAUNCHER_TEST_BUILDX: 'missing',
        LAUNCHER_TEST_DASH_ARGV: dispatch,
        LAUNCHER_TEST_DASH_LOG: dispatch,
      });
      expect(invocation.exitCode, invocation.stderr).toBe(70);
      expect(invocation.stderr).toContain('docker buildx version failed on this enrolled host');
      expect(invocation.stderr).toContain('install docker-buildx');
      expect(readdirSync(barrier)).toEqual([]);
    });

    function externalVerifier(name: string): { root: string; verifier: string; modules: string } {
      const root = barrierDirectory(name);
      const modules = join(root, 'trusted-node-modules');
      const verifier = join(root, 'verifier.sh');
      mkdirSync(join(modules, 'typescript'), { recursive: true });
      writeFileSync(join(modules, 'typescript', 'package.json'), '{}');
      writeFileSync(join(root, 'active-v1'), 'tool-wiki-active-v1\n');
      writeFileSync(join(root, 'launcher-path'), 'verifier.sh\n');
      writeFileSync(
        verifier,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'test -f "$0"',
          'printf "%s\\n" "$0" "$@" "$(git -C "$2" rev-parse HEAD)" "$TOOL_WIKI_TRUSTED_NODE_MODULES" "$TOOL_WIKI_REQUIRE_CERTIFIED" > "$LAUNCHER_TEST_WIKI_LOG"',
          'printf "verifier\\n" >> "$LAUNCHER_TEST_WIKI_ORDER"',
          'exit "${LAUNCHER_TEST_WIKI_EXIT:-0}"',
          '',
        ].join('\n'),
      );
      return { root, verifier, modules };
    }

    test('calibration rejects invalid external activation before submission', async () => {
      const wiki = externalVerifier('invalid-calibration-wiki');
      writeFileSync(join(wiki.root, 'active-v1'), 'invalid\n');
      await refusesCalibration(
        'calibration-invalid-wiki',
        ['HEAD'],
        78,
        'active tool-wiki marker is missing, unreadable, or malformed',
        {
          TOOL_WIKI_ACTIVATION_ROOT: wiki.root,
        },
      );
    });

    test('calibration refuses a candidate-contained external verifier', async () => {
      const wiki = externalVerifier('candidate-contained-calibration-wiki');
      const contained = join(checkout, 'wiki-verifier.sh');
      copyFileSync(wiki.verifier, contained);
      writeFileSync(join(wiki.root, 'launcher-path'), contained + '\n');
      try {
        await refusesCalibration(
          'calibration-contained-wiki',
          ['HEAD'],
          78,
          'launcher must be outside the candidate checkout',
          {
            TOOL_WIKI_ACTIVATION_ROOT: wiki.root,
          },
        );
      } finally {
        rmSync(contained);
      }
    });

    test.each([
      ['success', '0', '0', ['verifier', 'stage']],
      ['verifier-rejects', '77', '0', ['verifier']],
      ['stage-fails', '0', '65', ['verifier', 'stage']],
    ] as const)(
      'calibration preserves external verification and restoration when %s',
      async (name, verifierExit, stageExit, order) => {
        const wiki = externalVerifier(`calibration-wiki-${name}`);
        const barrier = barrierDirectory(`calibration-wiki-stage-${name}`);
        const dispatch = join(wiki.root, 'dispatch.jsonl');
        const log = join(wiki.root, 'observed');
        const chronology = join(wiki.root, 'chronology');
        const resting = units.map((unit) => fixtureGit(unit, 'rev-parse', 'HEAD'));
        const invocation = await launch([...calibrate, 'HEAD'], barrier, 1, {
          TOOL_WIKI_ACTIVATION_ROOT: wiki.root,
          TOOL_WIKI_TRUSTED_NODE_MODULES: '',
          HEAVY_LOCK_WAIT_SECONDS: '0',
          LAUNCHER_TEST_DASH_ARGV: dispatch,
          LAUNCHER_TEST_DASH_LOG: '/dev/null',
          LAUNCHER_TEST_REPLACE_VERIFIER: wiki.verifier,
          LAUNCHER_TEST_WIKI_LOG: log,
          LAUNCHER_TEST_WIKI_ORDER: chronology,
          LAUNCHER_TEST_WIKI_EXIT: verifierExit,
          LAUNCHER_TEST_STEPS_STATUS: stageExit,
        });
        expect(invocation.exitCode, invocation.stderr).toBe(
          Number(verifierExit !== '0' ? verifierExit : stageExit),
        );
        expect(readFileSync(dispatch, 'utf8').trim().split('\n')).toHaveLength(1);
        expect(readFileSync(wiki.verifier, 'utf8')).toBe('exit 91\n');
        const [captured, ...observed] = readFileSync(log, 'utf8').trim().split('\n');
        expect(captured).toMatch(/\/tool-wiki-lint\.sh$/);
        expect(captured).not.toBe(wiki.verifier);
        expect(observed).toEqual(['committed', units[0], 'HEAD', launchedSha, wiki.modules, '1']);
        expect(existsSync(captured)).toBe(false);
        expect(readFileSync(chronology, 'utf8').trim().split('\n')).toEqual([...order]);
        expect(readdirSync(barrier)).toHaveLength(order.length - 1);
        expect(units.map((unit) => fixtureGit(unit, 'rev-parse', 'HEAD'))).toEqual(resting);
        for (const unit of units) expect(fixtureGit(unit, 'status', '--porcelain')).toBe('');
      },
      20000,
    );

    test.each([
      ['SIGINT', 130],
      ['SIGTERM', 143],
      ['SIGHUP', 129],
    ] as const)(
      'calibration forwards %s to Dash and removes the verifier copy',
      async (signal, status) => {
        const wiki = externalVerifier(`signal-wiki-${signal}`);
        const bin = barrierDirectory(`signal-bin-${signal}`);
        const ready = join(bin, 'ready');
        const received = join(bin, 'received');
        const cleanup = join(bin, 'cleanup');
        writeFileSync(
          join(bin, 'rm'),
          [
            '#!/usr/bin/env bash',
            'printf "%s\\n" "$3" >> "$LAUNCHER_TEST_SIGNAL_CLEANUP"',
            'exec /usr/bin/rm "$@"',
            '',
          ].join('\n'),
          { mode: 0o755 },
        );
        writeFileSync(
          join(bin, 'bun'),
          [
            '#!/usr/bin/python3',
            'import os, signal, sys',
            'assert sys.argv[2:5] == ["ops", "job", "calibrate"]',
            'def finish(number, _frame):',
            '    with open(os.environ["LAUNCHER_TEST_SIGNAL_RECEIVED"], "x") as stream:',
            '        stream.write(signal.Signals(number).name)',
            '    sys.exit(128 + number)',
            'for number in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):',
            '    signal.signal(number, finish)',
            'signal.alarm(12)',
            'ready = os.environ["LAUNCHER_TEST_SIGNAL_READY"]',
            'with open(ready + ".new", "x") as stream:',
            '    stream.write(os.environ["H2PUNI_GATE_TRUSTED_LAUNCHER"])',
            'os.rename(ready + ".new", ready)',
            'signal.pause()',
            '',
          ].join('\n'),
          { mode: 0o755 },
        );
        const invocation = Bun.spawn([...calibrate, 'HEAD'], {
          cwd: checkout,
          env: {
            ...cleanLauncherEnv(process.env),
            PATH: `${bin}:${process.env['PATH'] ?? ''}`,
            HEAVY_LOCK_WAIT_SECONDS: '0',
            TOOL_WIKI_ACTIVATION_ROOT: wiki.root,
            TOOL_WIKI_TRUSTED_NODE_MODULES: '',
            LAUNCHER_TEST_SIGNAL_READY: ready,
            LAUNCHER_TEST_SIGNAL_RECEIVED: received,
            LAUNCHER_TEST_SIGNAL_CLEANUP: cleanup,
          },
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const terminal = Promise.all([
          invocation.exited,
          new Response(invocation.stdout).text(),
          new Response(invocation.stderr).text(),
        ]);
        try {
          for (let poll = 0; !existsSync(ready); poll++) {
            if (invocation.exitCode !== null || poll >= 400)
              throw new Error(`fake Dash did not reach readiness: ${(await terminal)[2]}`);
            await Bun.sleep(10);
          }
          const captured = readFileSync(ready, 'utf8');
          expect(captured).toMatch(/\/tool-wiki-lint\.sh$/);
          expect(existsSync(captured)).toBe(true);
          invocation.kill(signal);
          const [code, stdout, stderr] = await terminal;
          expect(code, stdout + stderr).toBe(status);
          expect(readFileSync(received, 'utf8')).toBe(signal);
          expect(existsSync(captured)).toBe(false);
          expect(readFileSync(cleanup, 'utf8')).toBe(dirname(captured) + '\n');
        } finally {
          await terminal;
        }
      },
      20000,
    );
  });

  describe('the launchers on one host (dash-host-jobs 6.1, 6.2)', () => {
    test('an unenrolled host runs the gate on the legacy lock in the launcher checkout', async () => {
      expect(existsSync(CONFIG)).toBe(false);
      const barrier = barrierDirectory('legacy');
      // A forged verdict changes nothing: no code reads it (slice 6a review G1).
      const result = await launch(gate.slice(0, 2), barrier, 1, {
        HEAVY_JOB_ENROLLMENT: 'enrolled',
      });
      // The wait is whole seconds of wall time, so a loaded host may print 1s; the queue is what
      // this pins (it failed `waited 1s` once in a full run, 2026-11-02).
      expect(result.stderr).toMatch(/heavy lock: waited \d+s behind 0 tickets/);
      expect(result.stderr).toContain(`h2puni gate: running on ${launchedSha}`);
      expect(result.exitCode).toBe(0);
      expect(
        readdirSync(barrier).map((name) => readFileSync(join(barrier, name), 'utf8').trim()),
      ).toEqual([checkout]);
      expect(existsSync(join(base, 'dash.log'))).toBe(false);
    }, 120000);

    test('an unenrolled host runs test-queued pinned in the launcher checkout (6.12)', async () => {
      expect(existsSync(CONFIG)).toBe(false);
      rmSync(join(base, 'bun.log'), { force: true });
      const barrier = barrierDirectory('test-legacy');
      const result = await launch(testQueued, barrier, 1, testQueuedEnv());
      expect(result.stderr).toMatch(/heavy lock: waited \d+s behind 0 tickets/);
      expect(result.stderr).toContain(`h2puni gate: running on ${launchedSha}`);
      expect(result.exitCode).toBe(0);
      expect(
        readdirSync(barrier).map((name) => readFileSync(join(barrier, name), 'utf8').trim()),
      ).toEqual([checkout]);
      expect(readFileSync(join(base, 'bun.log'), 'utf8')).toBe(
        `install --frozen-lockfile in ${checkout}\n`,
      );
      expect(existsSync(join(base, 'dash.log'))).toBe(false);
    }, 120000);

    test('an unenrolled test-queued payload refuses an inherited DASH_JOB_UNIT_GATE_TREE', async () => {
      expect(existsSync(CONFIG)).toBe(false);
      const barrier = barrierDirectory('test-inherited-unit');
      const result = await launch(['bash', 'bin/test-queued-payload.sh', launchedSha], barrier, 1, {
        ...testQueuedEnv(),
        DASH_JOB_UNIT_GATE_TREE: units[0] ?? '',
      });
      // Proof (observed 2026-11-12): with `resolve_gate_tree` in bin/test-queued-payload.sh
      // replaced by the launcher checkout, this ran the tests and exited 0.
      expect(result.exitCode).toBe(64);
      expect(result.stderr).toContain('on a host that is not enrolled; no admission handed it out');
      expect(readdirSync(barrier)).toEqual([]);
    }, 60000);

    test('a configuration that appears while a gate is queued makes its payload refuse 64', async () => {
      expect(existsSync(CONFIG)).toBe(false);
      const release = join(base, 'holder-release');
      const held = join(base, 'holder-held');
      // A legacy holder of the canonical lock, as a gate host has today.
      const holder = Bun.spawn(
        [
          'bash',
          'bin/with-heavy-lock.sh',
          '--',
          'bash',
          '-c',
          `: > ${held}; until [ -e ${release} ]; do sleep 0.05; done`,
        ],
        { cwd: checkout, env: cleanLauncherEnv(process.env), stdout: 'ignore', stderr: 'ignore' },
      );
      for (let poll = 0; !existsSync(held); poll++) {
        if (poll > 2000) throw new Error('the holder never took the lock');
        await Bun.sleep(5);
      }
      const barrier = barrierDirectory('queued');
      const queued = launch(gate, barrier, 1, { HEAVY_LOCK_WAIT_SECONDS: '60' });
      const queue = '/home/puni1/.cache/wbs-heavy-work.lock.queue';
      const ticketed = (): boolean =>
        existsSync(queue) && readdirSync(queue).some((name) => !name.startsWith('.'));
      for (let poll = 0; !ticketed(); poll++) {
        if (poll > 4000) throw new Error('the gate never queued');
        await Bun.sleep(5);
      }
      // Enrollment arrives while the gate waits under the legacy lock.
      writeConfig();
      writeFileSync(release, '');
      const result = await queued;
      expect(await holder.exited).toBe(0);
      // Enrolling a host with a gate queued is operator error: enrollment drains the queue first
      // (J12, slice 6a assumption S6-A14). The payload judges the host under the lock, finds it
      // enrolled with no admission, and refuses rather than gate a tree nobody reserved.
      expect(result.stderr).toContain('heavy lock: waited ');
      expect(result.stderr).toContain('DASH_JOB_UNIT_GATE_TREE is not set');
      expect(result.exitCode).toBe(64);
      expect(readdirSync(barrier)).toEqual([]);
      rmSync(CONFIG);
    }, 120000);

    test('ops pool init enrolls the host at the fixed path', () => {
      initializeObservePool();
      // A fresh pool is in observe mode, which serialises every job through the shell lock
      // (slice 6b). The overlap cases below need concurrent mode; this suite runs no `watch`,
      // so the singleton guard is released at once. Both steps go through the entrypoint.
      for (const flags of [[], ['--release-guard']]) {
        const switched = Bun.spawnSync(
          [
            process.execPath,
            join(DASH_SOURCE, 'entrypoint.ts'),
            'ops',
            'pool',
            'switch-mode',
            'concurrent',
            '--config',
            CONFIG,
            '--operator',
            'launchers-test',
            ...flags,
          ],
          { env: cleanLauncherEnv(process.env), stdout: 'pipe', stderr: 'pipe' },
        );
        expect(switched.exitCode, switched.stderr.toString()).toBe(0);
      }
    }, 120000);

    test('two gates run at once, each in its own admitted gate tree, and return them', async () => {
      const barrier = barrierDirectory('two-gates');
      const [first, second] = await Promise.all([
        launch(gate, barrier, 2),
        launch(gate, barrier, 2),
      ]);
      expect(first.stderr).not.toContain('heavy lock:');
      expect(first.exitCode).toBe(0);
      expect(second.exitCode).toBe(0);
      const trees = readdirSync(barrier)
        .map((name) => readFileSync(join(barrier, name), 'utf8').trim())
        .sort();
      expect(trees).toEqual([...units].sort());
      const log = readFileSync(join(base, 'dash.log'), 'utf8');
      expect(log).toContain(
        `ops job run --type gate --config ${CONFIG} --wait-seconds 1800 --poll-seconds 5 --label gate:${launchedSha.slice(0, 8)} -- ${checkout}/bin/h2puni-gate-payload.sh ${launchedSha}`,
      );
      for (const unit of units) {
        expect(fixtureGit(unit, 'log', '-1', '--format=%s')).toBe('resting commit');
        expect(fixtureGit(unit, 'status', '--porcelain')).toBe('');
      }
      expect(first.stderr).toMatch(/ops job: \S+ unit gate_tree \S+ released/);
      expect(second.stderr).toMatch(/ops job: \S+ unit gate_tree \S+ released/);
    }, 120000);

    test('a gate runs beside a release build', async () => {
      const barrier = barrierDirectory('gate-and-release');
      // As inside a real gate, which exports its own label: the release launcher must not
      // inherit it.
      // Proof: spawning with `process.env` in place of `cleanLauncherEnv` made the release line
      // read `--label gate:deadbeef` (verify.md Slice 6c, 6c-F21).
      const inherited = process.env['HEAVY_LOCK_LABEL'];
      process.env['HEAVY_LOCK_LABEL'] = 'gate:deadbeef';
      let runs: { exitCode: number; stderr: string }[];
      try {
        runs = await Promise.all([launch(gate, barrier, 2), launch(release, barrier, 2)]);
      } finally {
        if (inherited === undefined) delete process.env['HEAVY_LOCK_LABEL'];
        else process.env['HEAVY_LOCK_LABEL'] = inherited;
      }
      const [gateRun, releaseRun] = runs;
      expect(gateRun.exitCode).toBe(0);
      expect(releaseRun.exitCode).toBe(0);
      const names = readdirSync(barrier);
      expect(names.some((name) => name.startsWith('gate-'))).toBe(true);
      const built = names.find((name) => name.startsWith('release-'));
      expect(built === undefined ? '' : readFileSync(join(barrier, built), 'utf8')).toBe(
        launchedSha,
      );
      expect(readFileSync(join(base, 'dash.log'), 'utf8')).toContain(
        `ops job run --type release-build --config ${CONFIG} --wait-seconds 0 --poll-seconds 5 --label unlabeled -- ${checkout}/bin/publish-release-payload.sh`,
      );
    }, 120000);

    test("a failing enrolled gate's status is the caller's and its cleanup runs", async () => {
      const barrier = barrierDirectory('failing');
      const before = new Set(readdirSync(tmpdir()));
      const result = await launch(gate, barrier, 1, { LAUNCHER_TEST_STEPS_STATUS: '65' });
      expect(result.exitCode).toBe(65);
      // The launcher's trusted-launcher directory (mktemp -d, removed by its EXIT trap).
      expect(
        readdirSync(tmpdir()).filter((name) => !before.has(name) && name.startsWith('tmp.')),
      ).toEqual([]);
      for (const unit of units)
        expect(fixtureGit(unit, 'log', '-1', '--format=%s')).toBe('resting commit');
    }, 120000);

    test('the enrolled payload ignores an inherited verdict', async () => {
      const result = await launch(
        ['bash', 'bin/h2puni-gate-payload.sh', launchedSha],
        barrierDirectory('forged'),
        1,
        { HEAVY_JOB_ENROLLMENT: 'unenrolled' },
      );
      // Proof: see bin/h2puni-gate-payload.sh; reading the variable made this exit 0, gating the
      // launcher checkout with no admission (2026-11-02, review G1).
      expect(result.exitCode).toBe(64);
      expect(result.stderr).toContain('DASH_JOB_UNIT_GATE_TREE is not set');
    }, 60000);

    test('the enrolled payload run without an admission refuses 64', async () => {
      const result = await launch(
        ['bash', 'bin/h2puni-gate-payload.sh', launchedSha],
        barrierDirectory('bare'),
        1,
      );
      // Proof: with the enrolled refusal removed from `resolve_gate_tree` this gated the launcher
      // checkout and exited 0 (2026-11-02, slice 6a).
      expect(result.exitCode).toBe(64);
      expect(result.stderr).toContain('DASH_JOB_UNIT_GATE_TREE is not set');
    }, 60000);

    test('test-queued runs pinned in an admitted gate tree and returns it (6.12)', async () => {
      rmSync(join(base, 'bun.log'), { force: true });
      const barrier = barrierDirectory('test-enrolled');
      const result = await launch(testQueued, barrier, 1, testQueuedEnv());
      expect(result.stderr).not.toContain('heavy lock:');
      expect(result.exitCode).toBe(0);
      const trees = readdirSync(barrier).map((name) =>
        readFileSync(join(barrier, name), 'utf8').trim(),
      );
      // Proof (observed 2026-11-12): with `resolve_gate_tree` in bin/test-queued-payload.sh
      // replaced by the launcher checkout, the barrier recorded that checkout, in neither unit.
      expect(trees).toHaveLength(1);
      expect(units).toContain(trees[0]);
      expect(readFileSync(join(base, 'bun.log'), 'utf8')).toBe(
        `install --frozen-lockfile in ${trees[0] ?? ''}\n`,
      );
      expect(readFileSync(join(base, 'dash.log'), 'utf8')).toContain(
        `ops job run --type test-queued --config ${CONFIG} --wait-seconds 0 --poll-seconds 5 --label test-queued:${launchedSha.slice(0, 8)} -- ${checkout}/bin/test-queued-payload.sh ${launchedSha}`,
      );
      for (const unit of units)
        expect(fixtureGit(unit, 'log', '-1', '--format=%s')).toBe('resting commit');
      expect(result.stderr).toMatch(/ops job: \S+ unit gate_tree \S+ released/);
    }, 120000);

    test('a failed frozen install refuses test-queued before the tests', async () => {
      rmSync(join(base, 'bun.log'), { force: true });
      const barrier = barrierDirectory('test-install-fails');
      const result = await launch(testQueued, barrier, 1, {
        ...testQueuedEnv(),
        LAUNCHER_TEST_INSTALL_STATUS: '1',
      });
      // Proof: see bin/test-queued-payload.sh; with the install's status ignored this exited 0
      // and the barrier recorded the tests (2026-11-12).
      expect(result.exitCode).not.toBe(0);
      expect(readFileSync(join(base, 'bun.log'), 'utf8')).toContain('install --frozen-lockfile');
      expect(readdirSync(barrier)).toEqual([]);
      for (const unit of units)
        expect(fixtureGit(unit, 'log', '-1', '--format=%s')).toBe('resting commit');
    }, 120000);

    test('the enrolled test-queued payload run without an admission refuses 64', async () => {
      const barrier = barrierDirectory('test-bare');
      const result = await launch(
        ['bash', 'bin/test-queued-payload.sh', launchedSha],
        barrier,
        1,
        testQueuedEnv(),
      );
      // Proof (observed 2026-11-12): with `resolve_gate_tree` in bin/test-queued-payload.sh
      // replaced by the launcher checkout, this ran the tests there and exited 0.
      expect(result.exitCode).toBe(64);
      expect(result.stderr).toContain(
        'DASH_JOB_UNIT_GATE_TREE is not set; the payload runs only in the gate tree its admission hands it, so launch bin/test-queued.sh <sha>',
      );
      expect(readdirSync(barrier)).toEqual([]);
    }, 60000);

    test("the shim's exact argv gets past the real Dash parser", async () => {
      // The real checkout's library and entrypoint, not the fixture's: a renamed or removed flag
      // in cli-parser.ts would refuse here with a usage error (review F11).
      const outside = mkdtempSync(join(tmpdir(), 'dash-not-a-checkout-'));
      const run = Bun.spawn(
        [
          'bash',
          '-c',
          'source "$1"; HEAVY_LOCK_JOB_TYPE=gate HEAVY_LOCK_LABEL=gate:argv run_heavy_job -- true',
          'shim-argv',
          join(WORKSPACE, 'bin', 'heavy-lock-lib.sh'),
        ],
        { cwd: outside, env: cleanLauncherEnv(process.env), stdout: 'ignore', stderr: 'pipe' },
      );
      const stderr = await new Response(run.stderr).text();
      // Proof: renaming `--wait-seconds` to `--wait` in the shim made this exit 64 with a usage
      // error naming the flag instead (2026-11-02, review F11).
      expect(stderr).toContain(
        `error: ops job run: ${outside} is not inside a Git checkout with a job catalogue`,
      );
      expect(await run.exited).toBe(64);
    }, 60000);

    test('a configuration missing beside the ledger refuses the gate with 70', async () => {
      rmSync(CONFIG);
      const barrier = barrierDirectory('vanished');
      const result = await launch(gate, barrier, 1);
      expect(result.exitCode).toBe(70);
      expect(result.stderr).toContain(
        `host pool configuration ${CONFIG} is missing beside the ledger ${LEDGER}`,
      );
      expect(readdirSync(barrier)).toEqual([]);
      writeConfig();
    }, 60000);
  });
}
