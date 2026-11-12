import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { fakeCredential } from '../compute/testing/credential';
import { fixtureGit, gateTree } from '../resources/host-pool.test.fixture';
import { catalogueOf, fakeSystemdRun } from './ops.test.fixture';

/**
 * The real launchers against a real enrolled host (`dash-host-jobs` tasks 6.1, 6.2): `bin/h2puni-gate.sh`
 * and `bin/publish-release.sh` copied byte for byte into a fixture checkout, entering through
 * `run_heavy_job`, which finds the host pool configuration at its fixed path
 * `/home/puni1/.config/dash/host-pool.json`. That path is made a fixture by running this file in
 * a private user, mount and PID namespace whose `/home/puni1` subtrees are tmpfs, so no host
 * file is read or written. The fixture checkout's Dash entrypoint is `ops job run` itself
 * (`runHostJob`) over the fake scope seam, because the namespace has no user manager.
 */
const NAMESPACE_FLAG = 'DASH_LAUNCHER_TEST_NAMESPACE';
const WORKSPACE = join(import.meta.dir, '..', '..', '..', '..', '..', '..');
const DASH_SOURCE = join(import.meta.dir, '..');

/**
 * Inside the new mount namespace: keep every `/home` entry visible, then give `/home/puni1`
 * private `.config`, `.cache` and `.local` (on a gate host, where `/home/puni1` is this account,
 * only those three are overlaid), then run the suite.
 */
const NAMESPACE_SETUP = [
  'set -euo pipefail',
  'keep=$(mktemp -d)',
  'mount --make-rprivate /',
  'mount --rbind /home "$keep"',
  'mount -t tmpfs tmpfs /home',
  'for entry in "$keep"/* "$keep"/.[!.]*; do',
  '  [ -e "$entry" ] || continue',
  '  name=${entry##*/}',
  '  mkdir "/home/$name"',
  '  mount --rbind "$entry" "/home/$name"',
  'done',
  'mkdir -p /home/puni1',
  'for directory in .config .cache .local; do',
  '  mkdir -p "/home/puni1/$directory"',
  '  mount -t tmpfs tmpfs "/home/puni1/$directory"',
  'done',
  'exec "$@"',
].join('\n');

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
        process.execPath,
        'test',
        import.meta.path,
        '--timeout=120000',
      ],
      {
        env: { ...cleanLauncherEnv(process.env), [NAMESPACE_FLAG]: '1' },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 420000,
      },
    );
    if (execution.exitCode !== 0)
      throw new Error(execution.stdout.toString() + execution.stderr.toString());
    process.stderr.write(execution.stderr.toString());
    expect(execution.exitCode).toBe(0);
  }, 420000);
} else {
  const CONFIG = '/home/puni1/.config/dash/host-pool.json';
  const ROOT = '/home/puni1/.local/share/dash/host-pool';
  const LEDGER = join(ROOT, '.dash', 'resources.sqlite');

  /** The fixture checkout's Dash: `ops job run` over the fake scope seam, its argv logged. */
  const FIXTURE_DASH = `
import { appendFileSync } from 'node:fs';
import { monotonicClock, wallClock } from ${JSON.stringify(join(DASH_SOURCE, 'clock'))};
import { ampleHost } from ${JSON.stringify(join(DASH_SOURCE, 'resources', 'host-pool.test.fixture'))};
import { runHostJob } from ${JSON.stringify(join(DASH_SOURCE, 'ops', 'job-run'))};
import { productionLegacyLock } from ${JSON.stringify(join(DASH_SOURCE, 'resources', 'legacy-lock'))};
import { fakeScopeTelemetry } from ${JSON.stringify(join(DASH_SOURCE, 'ops', 'ops.test.fixture'))};
import { OpsRefusal } from ${JSON.stringify(join(DASH_SOURCE, 'ops', 'refusal'))};

const words = process.argv.slice(2);
appendFileSync(process.env['LAUNCHER_TEST_DASH_LOG'] ?? '/dev/null', words.join(' ') + '\\n');
const flag = (name) => words[words.indexOf(name) + 1];
const separator = words.indexOf('--');
if (words[0] !== 'ops' || words[1] !== 'job' || words[2] !== 'run' || separator < 0)
  throw new Error('fixture Dash runs only ops job run');
try {
  process.exitCode = await runHostJob(
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
        '  exit 0',
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

  function writeConfig(): void {
    mkdirSync('/home/puni1/.config/dash', { recursive: true });
    writeFileSync(
      CONFIG,
      JSON.stringify({
        schemaVersion: 3,
        root: ROOT,
        authorityId: 'runtime-one',
        epoch: 'epoch-one',
        providerId: 'provider-one',
        mcpResource: 'http://127.0.0.1:3100/mcp',
        credential: fakeCredential(),
        diskUnitBytes: 1073741824,
        diskBudgetUnits: 16,
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

  /** Start one launcher; resolves with its exit code and stderr. */
  async function launch(
    argv: readonly string[],
    barrier: string,
    parties: number,
    extra: Record<string, string> = {},
  ): Promise<{ exitCode: number; stderr: string }> {
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
      stdout: 'ignore',
      stderr: 'pipe',
    });
    const stderr = await new Response(run.stderr).text();
    return { exitCode: await run.exited, stderr };
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

  describe('the launchers on one host (dash-host-jobs 6.1, 6.2)', () => {
    test('an unenrolled host runs the gate on the legacy lock in the launcher checkout', async () => {
      expect(existsSync(CONFIG)).toBe(false);
      const barrier = barrierDirectory('legacy');
      // A forged verdict changes nothing: no code reads it (slice 6a review G1).
      const result = await launch(gate, barrier, 1, { HEAVY_JOB_ENROLLMENT: 'enrolled' });
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
      writeConfig();
      mkdirSync(ROOT, { recursive: true, mode: 0o700 });
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
