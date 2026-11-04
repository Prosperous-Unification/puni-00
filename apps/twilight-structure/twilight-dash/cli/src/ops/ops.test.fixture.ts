import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';

import { expect, test } from 'bun:test';

import { fixtureGit } from '../resources/host-pool.test.fixture';
import { linuxScopeTelemetry, type ScopeTelemetry } from './scope';

/**
 * Register `path`'s tests to rerun inside a private user and PID namespace that maps this
 * account to itself. As `insideLinuxNamespace` does for the resource runtime, `/proc` then
 * shows only the suite's processes, so settlement is not blocked by an unrelated process of
 * this account; unlike it, the account is not root inside, so a file mode of 000 really makes a
 * cgroup counter unreadable (a mapped root's CAP_DAC_OVERRIDE would read it anyway).
 * Returns true inside the namespace, where the caller registers its real tests.
 */
export function insideOpsNamespace(path: string): boolean {
  if (process.env['DASH_OPS_TEST_NAMESPACE'] === '1') return true;
  test(`${basename(path)} in a private Linux namespace`, () => {
    const uid = String(process.getuid?.());
    const gid = String(process.getgid?.());
    const execution = Bun.spawnSync(
      [
        'unshare',
        '--user',
        `--map-user=${uid}`,
        `--map-group=${gid}`,
        '--pid',
        '--fork',
        '--mount-proc',
        process.execPath,
        'test',
        path,
        '--timeout=120000',
      ],
      {
        env: { ...process.env, DASH_OPS_TEST_NAMESPACE: '1' },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 420000,
      },
    );
    if (execution.exitCode !== 0)
      throw new Error(execution.stdout.toString() + execution.stderr.toString());
    // The inner results, skips and their reasons included, stay visible in the outer run.
    process.stderr.write(execution.stderr.toString());
    expect(execution.exitCode).toBe(0);
  }, 420000);
  return false;
}

/**
 * Whether this host's user manager creates a scope, the precondition of every real-scope test,
 * and the diagnostic when it does not, so a skipped test names why.
 */
export function probeUserScopes(): { available: true } | { available: false; reason: string } {
  const probe = Bun.spawnSync(
    ['systemd-run', '--user', '--scope', '--quiet', '-p', 'MemoryHigh=100M', '--', 'true'],
    { stdout: 'pipe', stderr: 'pipe', timeout: 30000 },
  );
  if (probe.exitCode === 0) return { available: true };
  return {
    available: false,
    reason: `systemd-run --user --scope answered exit ${String(probe.exitCode)}: ${probe.stderr.toString().trim().split('\n')[0] ?? ''}`,
  };
}

/** The small image the container tests run, when the local daemon already has it. */
export const CONTAINER_IMAGE = 'busybox:1.37.0-musl';

/** Whether a local Docker daemon answers and holds {@link CONTAINER_IMAGE}, else why not. */
export function probeDocker(): { available: true } | { available: false; reason: string } {
  const probe = Bun.spawnSync(['docker', 'image', 'inspect', CONTAINER_IMAGE], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 30000,
  });
  if (probe.exitCode === 0) return { available: true };
  return {
    available: false,
    reason: `docker image inspect ${CONTAINER_IMAGE} answered exit ${String(probe.exitCode)}: ${probe.stderr.toString().trim().split('\n')[0] ?? ''}`,
  };
}

/** One catalogue entry for a fixture checkout; profile `""` unless stated. */
export interface FixtureJobType {
  id: string;
  cpuCores: number;
  memoryGib: number;
  tmpDiskGib?: number;
  exclusive?: string[];
  containers?: 'none' | { memoryGib: number; cpuCores: number };
  enforcement?: 'observe' | 'cap';
  argumentProfile?: string;
}

/** A Git checkout whose HEAD commits `infra/jobs/catalogue.json` with `types`. */
export function catalogueCheckout(path: string, types: readonly FixtureJobType[]): string {
  mkdirSync(join(path, 'infra', 'jobs'), { recursive: true });
  mkdirSync(join(path, 'bin'), { recursive: true });
  fixtureGit(path, 'init', '--quiet');
  writeFileSync(join(path, 'bin', 'payload.sh'), '#!/bin/sh\nexit 0\n');
  writeFileSync(
    join(path, 'infra', 'jobs', 'catalogue.json'),
    `${JSON.stringify(catalogueOf(types), null, 2)}\n`,
  );
  fixtureGit(path, 'add', '.');
  fixtureGit(path, 'commit', '--quiet', '-m', 'catalogue');
  return path;
}

/** The catalogue file a fixture checkout commits. */
export function catalogueOf(types: readonly FixtureJobType[]) {
  return {
    schemaVersion: 1,
    jobs: types.map((jobType) => ({
      id: jobType.id,
      entrypoint: 'bin/payload.sh',
      argumentProfile: jobType.argumentProfile ?? '',
      envelope: {
        cpuCores: jobType.cpuCores,
        memoryGib: jobType.memoryGib,
        tmpDiskGib: jobType.tmpDiskGib ?? 0,
        exclusive: jobType.exclusive ?? [],
      },
      containers: jobType.containers ?? 'none',
      enforcement: jobType.enforcement ?? 'observe',
      provenance: { kind: 'estimated', basis: 'test fixture', until: '2099-12-31' },
    })),
  };
}

/** An executable payload script at `path`: `/bin/sh` running `body`. */
export function payloadScript(path: string, body: string): string {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

/**
 * A directory holding a stub `systemd-run` that prints `diagnostic` on stderr and exits 1, as
 * systemd's client does when no user manager answers, to put first on `PATH`.
 */
export function refusingSystemdRun(directory: string, diagnostic: string): string {
  mkdirSync(directory, { recursive: true });
  payloadScript(join(directory, 'systemd-run'), `printf '%s\\n' '${diagnostic}' >&2\nexit 1`);
  return directory;
}

/**
 * How a fake `systemd-run` on `PATH` treats the launch (the probe, `-- true`, always passes):
 * `exec` runs the command as systemd's scope mode does, without a scope; `exits` lives 300 ms and
 * exits 1, a user manager that never starts the scope; `sleeps` hangs, a user manager that does
 * not answer; `vanishes` deletes itself during the probe, so the launch finds no executable.
 */
export type FakeSystemdRun = 'exec' | 'exits' | 'sleeps' | 'vanishes';

/**
 * A directory holding a fake `systemd-run` (see {@link FakeSystemdRun}), to put first on `PATH`.
 * A launch writes `<directory>/launched` before it behaves.
 */
export function fakeSystemdRun(directory: string, behaviour: FakeSystemdRun): string {
  mkdirSync(directory, { recursive: true });
  const launch = {
    exec: 'exec "$@"',
    exits: 'sleep 0.3\nexit 1',
    sleeps: 'exec sleep 60',
    vanishes: 'exec "$@"',
  }[behaviour];
  payloadScript(
    join(directory, 'systemd-run'),
    [
      'while [ "$#" -gt 0 ] && [ "$1" != -- ]; do shift; done',
      'shift',
      ...(behaviour === 'vanishes' ? ['rm -f -- "$0"'] : []),
      'if [ "$#" -eq 1 ] && [ "$1" = true ]; then exec true; fi',
      `: > ${join(directory, 'launched')}`,
      launch,
    ].join('\n'),
  );
  return directory;
}

/** The counters a fake scope starts with, as the kernel spells them. */
const FAKE_COUNTERS: Readonly<Record<string, string>> = {
  'memory.peak': '4194304\n',
  'memory.current': '2097152\n',
  'cpu.stat': 'usage_usec 1000\nuser_usec 600\nsystem_usec 400\n',
  'pids.current': '2\n',
  'memory.events': 'low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\n',
};

function procText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    // A process that ended or became unreadable is simply not a member of a fake scope.
    return null;
  }
}

/** The job id in a process's environment, or null. */
function jobIdOf(pid: string): string | null {
  const environ = procText(`/proc/${pid}/environ`);
  const entry = environ?.split('\0').find((variable) => variable.startsWith('DASH_JOB_ID='));
  return entry === undefined ? null : entry.slice('DASH_JOB_ID='.length);
}

/**
 * A fake cgroup hierarchy for hosts without a user manager (`dash-host-jobs` slice 3 review F3):
 * a process is in `/fake/dash-job-<id>.scope` once it is the gated shell (its command line holds
 * the gate's `read`, and it is no longer `systemd-run`); counters are files under `root`, read by
 * the production reader; members are the live processes carrying that job's `DASH_JOB_ID`.
 */
export function fakeScopeTelemetry(root: string): ScopeTelemetry & {
  counterPath(cgroup: string, name: string): string;
} {
  const real = linuxScopeTelemetry(root);
  return {
    counterPath: (cgroup, name) => join(root, cgroup, name),
    cgroupOf: (pid) => {
      const command = procText(`/proc/${String(pid)}/cmdline`);
      if (command === null) return null;
      const id = jobIdOf(String(pid));
      if (id === null || !command.includes('read gate <&3') || command.includes('systemd-run'))
        return '/fake/elsewhere';
      const cgroup = `/fake/dash-job-${id}.scope`;
      const directory = join(root, cgroup);
      if (!existsSync(directory)) {
        mkdirSync(directory, { recursive: true });
        for (const [name, content] of Object.entries(FAKE_COUNTERS))
          writeFileSync(join(directory, name), content);
      }
      return cgroup;
    },
    read: (cgroup) => real.read(cgroup),
    members: (cgroup) => {
      const id = /\/dash-job-(.+)\.scope$/.exec(cgroup)?.[1];
      if (id === undefined) return [];
      return readdirSync('/proc')
        .filter((pid) => /^\d+$/.test(pid) && jobIdOf(pid) === id)
        .filter((pid) => !(procText(`/proc/${pid}/stat`) ?? ') Z ').includes(') Z '))
        .map(Number);
    },
  };
}
