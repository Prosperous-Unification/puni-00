import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { fakeCredential } from '../compute/testing/credential';
import { admitFixture } from './admission.test.fixture';
import { ampleHost, hostPoolFixture } from './host-pool.test.fixture';
import {
  type CreationRequest,
  type HoldScope,
  identifyProcess,
  isForeignLoginSession,
  loadResourceConfiguration,
  outsideScope,
  processGone,
  ResourceRuntime,
} from './runtime';

/**
 * `dash-host-jobs` decision J19, outside any namespace on purpose, as host-job-holds.test.ts is:
 * every enrolled host runs same-user processes whose descriptors are unreadable (`(sd-pam)`,
 * `sshd-session`), and managed-resource cleanup and the unit check at pool init must tell those
 * apart from a holder. Every test here sees this host's real `/proc`.
 */
const NON_DUMPABLE = [
  'import ctypes,os,sys,time',
  // PR_SET_DUMPABLE (4) to 0: /proc/<pid>/fd becomes unreadable to this same user.
  'assert ctypes.CDLL(None).prctl(4,0,0,0,0)==0',
  "open(sys.argv[1]+'.part','w').write('ready')",
  "os.rename(sys.argv[1]+'.part',sys.argv[1])",
  'time.sleep(120)',
].join('\n');

const scopes = Bun.spawnSync(
  ['systemd-run', '--user', '--scope', '--quiet', '--collect', '--', 'true'],
  { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
);
const scopeReason =
  scopes.exitCode === 0
    ? ''
    : ` (skipped: systemd-run --user --scope answered exit ${String(scopes.exitCode)}: ${scopes.stderr.toString().trim().split('\n')[0] ?? ''})`;

const ENTRYPOINT = join(import.meta.dir, '..', 'entrypoint.ts');

/**
 * Whether this test process runs in a logind login session scope, where a plainly spawned holder
 * lands too (J19 amendment, review F1): on a workstation or an ssh login, not on a CI runner.
 */
const ownCgroup =
  readFileSync('/proc/self/cgroup', 'utf8')
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3) ?? '';
const inLogin = /^\/user\.slice\/user-\d+\.slice\/session-[A-Za-z0-9]+\.scope$/.test(ownCgroup);
const loginReason = inLogin
  ? ''
  : ` (skipped: this test runs in ${ownCgroup}, not a login session)`;

// A process the hold scan listed can exit before its cgroup, identity or session is read. The
// race itself cannot be scheduled without a seam, so this hands `outsideScope` the pid of a
// process that has already exited and been reaped, which is what every read then sees
// (verify.md Slice 6c, S6C-A21). Runs outside any namespace.
describe('a vanished uninspectable process (slice 6c, J19)', () => {
  function vanishedScope(sessions: string[]): HoldScope {
    const before = identifyProcess(process.pid);
    if (before === null) throw new Error('this test process has no identity');
    const own = readFileSync('/proc/self/cgroup', 'utf8')
      .split('\n')
      .find((line) => line.startsWith('0::'))
      ?.slice(3);
    if (own === undefined) throw new Error('this test process has no cgroup v2 membership');
    return {
      owns: () => false,
      sessions: new Set(sessions),
      before,
      ownCgroup: own,
      held: 'the fixture',
      remedy: 'none',
      outside: [],
    };
  }

  test('a process that exits after the scan listed it holds nothing', async () => {
    const child = Bun.spawn(['true']);
    await child.exited;
    // Proof: without the ENOENT branch on the cgroup read this threw `cannot read the cgroup of
    // uninspectable PID` (verify.md Slice 6c, 6c-F17).
    expect(outsideScope(String(child.pid), vanishedScope([]))).toBe('gone');
    expect(outsideScope(String(child.pid), vanishedScope([String(process.pid)]))).toBe('gone');
    // A live process is still decided: this one, in its own cgroup, did not start before itself.
    expect(outsideScope(String(process.pid), vanishedScope([]))).toBe('holds');
  });

  /** Spawn `argv`, read the pid it prints first, and wait until that pid's state is `Z`. */
  async function zombieOf(argv: string[]) {
    const parent = Bun.spawn(argv, { stdout: 'pipe' });
    const reader = parent.stdout.getReader();
    const first = await reader.read();
    reader.releaseLock();
    const pid = new TextDecoder().decode(first.value).trim().split('\n')[0] ?? '';
    if (!/^\d+$/.test(pid)) {
      parent.kill();
      throw new Error(`the zombie's parent printed no pid: ${JSON.stringify(pid)}`);
    }
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let state: string;
      try {
        state = readFileSync(`/proc/${pid}/stat`, 'utf8');
      } catch (cause) {
        parent.kill();
        throw new Error(`PID ${pid} never became a zombie: it was reaped or vanished`, { cause });
      }
      if (state.slice(state.lastIndexOf(')') + 2).startsWith('Z ')) return { parent, pid };
      await Bun.sleep(20);
    }
    parent.kill();
    throw new Error(`PID ${pid} never became a zombie`);
  }

  test('an unreaped zombie holds nothing', async () => {
    // Python installs no SIGCHLD handler and this parent never waits, so the forked child stays
    // a zombie; a shell could reap it before `exec` (CI on ee0f13fb1).
    const { parent, pid } = await zombieOf([
      'python3',
      '-c',
      'import os,time\npid = os.fork()\nif pid == 0:\n    os._exit(0)\nprint(pid, flush=True)\ntime.sleep(30)',
    ]);
    try {
      expect(processGone(pid)).toBe(true);
      expect(outsideScope(pid, vanishedScope([]))).toBe('gone');
      // The live parent is not gone.
      expect(processGone(String(parent.pid))).toBe(false);
    } finally {
      parent.kill();
      await parent.exited;
    }
  });

  test('a group leader that exited beside a live thread still holds', async () => {
    const { parent, pid } = await zombieOf([
      'python3',
      '-c',
      [
        'import ctypes,os,threading,time',
        'threading.Thread(target=lambda: time.sleep(30)).start()',
        'print(os.getpid(), flush=True)',
        'ctypes.CDLL(None).pthread_exit(None)',
      ].join('\n'),
    ]);
    try {
      expect(processGone(pid)).toBe(false);
      expect(outsideScope(pid, vanishedScope([]))).toBe('holds');
    } finally {
      parent.kill('SIGKILL');
      await parent.exited;
    }
  });
});

describe('isForeignLoginSession (J19 amendment, reviews F1 and G2)', () => {
  // The predicate alone, so CI runners, which have no login session, still check its shape.
  test('only another login session scope is foreign', () => {
    const login = '/user.slice/user-1000.slice/session-3.scope';
    expect(isForeignLoginSession(login, null)).toBe(true);
    expect(
      isForeignLoginSession(login, '/user.slice/user-1000.slice/user@1000.service/app.slice'),
    ).toBe(true);
    expect(isForeignLoginSession(login, '/user.slice/user-1000.slice/session-4.scope')).toBe(true);
    // Proof: dropping the owner comparison made this `true` (2026-11-02, review G2).
    expect(isForeignLoginSession(login, login)).toBe(false);
    // Proof: matching any `session-*.scope` component made these `true` (2026-11-02, review F1).
    expect(
      isForeignLoginSession(
        '/user.slice/user-1000.slice/user@1000.service/app.slice/session-9.scope',
        null,
      ),
    ).toBe(false);
    expect(isForeignLoginSession('/user.slice/user-1000.slice/session-3.scope/child', null)).toBe(
      false,
    );
    expect(isForeignLoginSession('/system.slice/ssh.service', null)).toBe(false);
    expect(isForeignLoginSession('/', null)).toBe(false);
  });
});

describe('uninspectable processes outside Dash-owned work (J19)', () => {
  const cleanups: (() => void)[] = [];
  const children: ChildProcess[] = [];
  afterEach(async () => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await once(child, 'exit');
      }
    }
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  let now = 1800000000000;
  const clock = { read: () => (now += 1000) };

  function pool(gateTrees: number) {
    const fixture = hostPoolFixture({
      cpuCores: 1,
      memoryGib: 1,
      headroom: { cpuCores: 0, memoryGib: 0 },
      gateTrees,
      credential: fakeCredential(),
    });
    cleanups.push(fixture.remove);
    return fixture;
  }

  /** Start a non-dumpable `python3` (inside user scope `unit` when given); resolve its pid. */
  async function nonDumpable(base: string, unit?: string): Promise<number> {
    const ready = join(base, `ready-${randomUUID()}`);
    const argv = [
      ...(unit === undefined
        ? []
        : ['systemd-run', '--user', '--scope', '--quiet', '--collect', '--unit', unit, '--']),
      'python3',
      '-c',
      NON_DUMPABLE,
      ready,
    ];
    const child = spawn(argv[0] ?? 'python3', argv.slice(1), { detached: true, stdio: 'ignore' });
    children.push(child);
    for (let attempt = 0; !existsSync(ready); attempt++) {
      if (attempt > 3000 || child.exitCode !== null) throw new Error('holder did not start');
      await Bun.sleep(5);
    }
    if (child.pid === undefined) throw new Error('holder has no pid');
    // Under systemd-run the scope's payload is the same process, exec'd in place.
    expect(() => readFileSync(`/proc/${String(child.pid)}/maps`)).toThrow('EACCES');
    return child.pid;
  }

  const request = (kind: CreationRequest['kind']): CreationRequest => ({
    projectId: 'project-one',
    resourceId: 'disk-one',
    workItemId: 'work-one',
    agentRun: 'run-one',
    responsiblePersonId: 'developer',
    units: 1,
    diskUnits: 1,
    kind,
  });

  function runtimeOf(config: string): ResourceRuntime {
    const runtime = ResourceRuntime.initialize(loadResourceConfiguration(config), clock, ampleHost);
    cleanups.unshift(() => {
      runtime.close();
    });
    return runtime;
  }

  /** Request cleanup of `id` and sweep until its state stops changing. */
  function cleanedUp(runtime: ResourceRuntime, id: string) {
    const use = runtime.inspect(id);
    if (use.state !== 'pending' && use.state !== 'blocked' && use.state !== 'released')
      runtime.requestCleanup(id, use.revision, use.incarnation, 'work ended');
    runtime.sweep();
    return runtime.inspect(id);
  }

  test('ops pool init succeeds beside a non-dumpable process that predates it', async () => {
    const fixture = pool(1);
    const pid = await nonDumpable(fixture.base);
    // The production path: the CLI process is the Dash process the holder predates, and this
    // host's own `(sd-pam)` and `sshd-session` processes predate it too.
    const init = Bun.spawnSync(
      [process.execPath, ENTRYPOINT, 'ops', 'pool', 'init', '--config', fixture.config],
      { stdout: 'pipe', stderr: 'pipe', timeout: 60000 },
    );
    // Proof: see `checkHostFacts`; inspecting with no initializer scope made this exit 70,
    // "host pool unit … is held: cannot inspect process PID" (2026-11-02, J19).
    expect(init.stderr.toString()).toBe('');
    expect(init.exitCode).toBe(0);
    expect(JSON.parse(init.stdout.toString())).toMatchObject({ initialized: true });
    expect(pid).toBeGreaterThan(0);
  }, 60000);

  test.skipIf(scopes.exitCode !== 0)(
    `pool init refuses beside a non-dumpable process started after it in the user manager${scopeReason}`,
    async () => {
      const fixture = pool(1);
      // Under `user@<uid>.service`, where a payload's `systemd-run --user` descendants land.
      const pid = await nonDumpable(fixture.base, `holder-${randomUUID()}`);
      // This test process is the initializer here, and it predates the holder.
      // Proof: with `outsideScope` always true this initialized (2026-11-02, J19).
      expect(() =>
        ResourceRuntime.initialize(loadResourceConfiguration(fixture.config), clock, ampleHost),
      ).toThrow(
        `host pool unit ${fixture.trees[0] ?? ''} is held: cannot inspect process PID ${String(pid)} (python3), which may hold unit ${fixture.trees[0] ?? ''}; end it, then initialize again`,
      );
    },
    60000,
  );

  test.skipIf(!inLogin)(
    `pool init refuses beside a non-dumpable process of its own login session started after it${loginReason}`,
    async () => {
      const fixture = pool(1);
      // A detached child of this test, the initializer: a new session id, the same session scope.
      const pid = await nonDumpable(fixture.base);
      // Proof: see `outsideScope`; with the owner's login session exempted too this initialized
      // (2026-11-02, review G2).
      expect(() =>
        ResourceRuntime.initialize(loadResourceConfiguration(fixture.config), clock, ampleHost),
      ).toThrow(`cannot inspect process PID ${String(pid)} (python3)`);
    },
    60000,
  );

  test.skipIf(!inLogin || scopes.exitCode !== 0)(
    `pool init succeeds beside a non-dumpable process of another login session${loginReason}${scopeReason}`,
    async () => {
      const fixture = pool(1);
      // The initializer runs under the user manager, so this test's login session is foreign to it.
      const init = Bun.spawn(
        [
          'systemd-run',
          '--user',
          '--scope',
          '--quiet',
          '--collect',
          '--',
          process.execPath,
          ENTRYPOINT,
          'ops',
          'pool',
          'init',
          '--config',
          fixture.config,
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      // Started after the initializer, which takes seconds to load before it inspects the unit.
      await nonDumpable(fixture.base);
      const stderr = await new Response(init.stderr).text();
      // Proof: see `outsideScope`; without the foreign-session test this exited 70 "cannot inspect
      // process PID" (2026-11-02, reviews F1, G2).
      expect(stderr).toBe('');
      expect(await init.exited).toBe(0);
    },
    60000,
  );

  test.skipIf(scopes.exitCode !== 0)(
    `ops pool init refuses beside a non-dumpable process in a Dash job scope${scopeReason}`,
    async () => {
      const fixture = pool(1);
      const pid = await nonDumpable(fixture.base, `dash-job-other-${randomUUID()}`);
      const init = Bun.spawnSync(
        [process.execPath, ENTRYPOINT, 'ops', 'pool', 'init', '--config', fixture.config],
        { stdout: 'pipe', stderr: 'pipe', timeout: 60000 },
      );
      // Proof: dropping the owned-scope test in `outsideScope` made this exit 0 (2026-11-02, J19).
      expect(init.exitCode).toBe(70);
      expect(init.stderr.toString()).toContain(`cannot inspect process PID ${String(pid)}`);
    },
    60000,
  );

  test('cleanup releases a resource beside a non-dumpable process that predates its leader', async () => {
    const fixture = pool(0);
    const runtime = runtimeOf(fixture.config);
    const pid = await nonDumpable(fixture.base);
    const use = await runtime.create(request('temporary_directory'), admitFixture);
    expect(await runtime.run(use.id, ['/bin/sh', '-c', 'printf finished > output'])).toBe(0);
    const current = cleanedUp(runtime, use.id);
    // Proof: inspecting with no use scope left this `blocked` "cannot inspect process PID"
    // (2026-11-02, J19).
    expect(current.state).toBe('released');
    expect(current.reason).toStartWith(
      'provider absence and file holds verified; uninspectable_outside_scope: ',
    );
    expect(current.reason).toContain(`${String(pid)} (python3)`);
    expect(existsSync(use.locator)).toBe(false);
  }, 60000);

  /** A use whose leader runs while `during` starts a holder; resolves the use's cleanup state. */
  async function cleanupBesideLaterHolder(unit?: string) {
    const fixture = pool(0);
    const runtime = runtimeOf(fixture.config);
    const use = await runtime.create(request('temporary_directory'), admitFixture);
    const started = join(fixture.base, 'leader-started');
    const release = join(fixture.base, 'leader-release');
    const running = runtime.run(use.id, [
      '/bin/sh',
      '-c',
      `: > ${started}; while [ ! -e ${release} ]; do sleep 0.05; done`,
    ]);
    for (let attempt = 0; !existsSync(started); attempt++) {
      if (attempt > 3000) throw new Error('leader did not start');
      await Bun.sleep(5);
    }
    const pid = await nonDumpable(fixture.base, unit);
    mkdirSync(release);
    expect(await running).toBe(0);
    return { use, pid, current: cleanedUp(runtime, use.id) };
  }

  test.skipIf(scopes.exitCode !== 0)(
    `cleanup keeps a resource charged beside a non-dumpable process started after its leader in the user manager${scopeReason}`,
    async () => {
      const { use, pid, current } = await cleanupBesideLaterHolder(`holder-${randomUUID()}`);
      // Proof: with the start comparison dropped from `outsideScope` this was `released`
      // (2026-11-02, J19); with the login-session test matching `user@<uid>.service` too it was
      // `released` (2026-11-02, F1).
      expect(current.state).toBe('blocked');
      expect(current.reason).toContain(
        `cannot inspect process PID ${String(pid)} (python3), which may hold resource ${use.id}; end it, and cleanup retries`,
      );
      expect(existsSync(use.locator)).toBe(true);
    },
    60000,
  );

  test.skipIf(!inLogin)(
    `a setsid descendant in Dash's own login session still holds${loginReason}`,
    async () => {
      // A detached child of this test, which is the Dash process here: a new session id, started
      // after the leader, in the same login session scope (review G2).
      const { use, pid, current } = await cleanupBesideLaterHolder();
      // Proof: see `outsideScope`; with the owner's login session exempted too this was
      // `released` (2026-11-02, review G2).
      expect(current.state).toBe('blocked');
      expect(current.reason).toContain(`cannot inspect process PID ${String(pid)} (python3)`);
      expect(existsSync(use.locator)).toBe(true);
    },
    60000,
  );

  test("a non-dumpable process in another use's process group still holds a resource", async () => {
    const fixture = pool(0);
    const runtime = runtimeOf(fixture.config);
    const other = await runtime.create(request('temporary_directory'), admitFixture);
    const ready = join(fixture.base, `other-ready-${randomUUID()}`);
    // The other use's leader is itself the non-dumpable process: its session is that use's.
    const otherRun = runtime.run(other.id, ['python3', '-c', NON_DUMPABLE, ready]);
    for (let attempt = 0; !existsSync(ready); attempt++) {
      if (attempt > 3000) throw new Error('other leader did not start');
      await Bun.sleep(5);
    }
    const otherPid = runtime.inspect(other.id).process?.pid;
    if (otherPid === undefined) throw new Error('other use recorded no leader');
    const use = await runtime.create(request('temporary_directory'), admitFixture);
    expect(await runtime.run(use.id, ['/bin/sh', '-c', 'printf finished > output'])).toBe(0);
    const current = cleanedUp(runtime, use.id);
    // Proof: see `outsideScope`; without the session test this was `released` (2026-11-02, J19).
    expect(current.state).toBe('blocked');
    expect(current.reason).toContain(`cannot inspect process PID ${String(otherPid)} (python3)`);
    process.kill(otherPid, 'SIGKILL');
    await otherRun;
  }, 60000);

  test.skipIf(scopes.exitCode !== 0)(
    `a non-dumpable process in a Dash job scope that predates the leader still holds${scopeReason}`,
    async () => {
      const fixture = pool(0);
      const runtime = runtimeOf(fixture.config);
      const pid = await nonDumpable(fixture.base, `dash-job-other-${randomUUID()}`);
      const use = await runtime.create(request('temporary_directory'), admitFixture);
      expect(await runtime.run(use.id, ['/bin/sh', '-c', 'printf finished > output'])).toBe(0);
      const current = cleanedUp(runtime, use.id);
      // Proof: dropping the owned-scope test in `outsideScope` made this `released`
      // (2026-11-02, J19).
      expect(current.state).toBe('blocked');
      expect(current.reason).toContain(`cannot inspect process PID ${String(pid)}`);
    },
    60000,
  );
});
