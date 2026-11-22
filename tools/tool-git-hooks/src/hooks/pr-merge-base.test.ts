import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it, test } from 'bun:test';

const ROOT = resolve(import.meta.dir, '../../../..');
const SCRIPT = join(import.meta.dir, 'pr-merge-base.ts');
const roots: string[] = [];

function git(root: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

function history() {
  const root = scratchSync('pr-merge-base-');
  roots.push(root);
  git(root, 'init');
  git(root, 'config', 'user.name', 'Merge Base Test');
  git(root, 'config', 'user.email', 'merge@example.invalid');
  writeFileSync(join(root, 'first'), 'first');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'first');
  const stale = git(root, 'rev-parse', 'HEAD');
  const tree = git(root, 'rev-parse', 'HEAD^{tree}');
  const base = git(root, 'commit-tree', tree, '-p', stale, '-m', 'base advanced');
  const head = git(root, 'commit-tree', tree, '-p', stale, '-m', 'PR head');
  const merge = git(root, 'commit-tree', tree, '-p', base, '-p', head, '-m', 'synthetic merge');
  git(root, 'checkout', '--detach', merge);
  git(root, 'update-ref', 'refs/remotes/origin/main', stale);
  const env = {
    EVENT_NAME: 'pull_request',
    GITHUB_SHA: merge,
    GITHUB_REF: 'refs/pull/399/merge',
    PR_NUMBER: '399',
    PR_HEAD_SHA: head,
    PR_BASE_SHA: stale,
  };
  return { root, stale, tree, base, head, merge, env };
}

function invoke(root: string, env: Record<string, string>, script = SCRIPT) {
  return Bun.spawnSync([process.execPath, script], {
    cwd: root,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function refuse(invocation: ReturnType<typeof invoke>) {
  expect(invocation.exitCode).not.toBe(0);
  expect(invocation.stdout.toString()).toBe('');
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('validated PR synthetic merge boundary', () => {
  it('uses the first parent despite stale payload base and a moving main ref', () => {
    const h = history();
    for (const revision of [h.stale, h.head, h.merge]) {
      git(h.root, 'update-ref', 'refs/remotes/origin/main', revision);
      const invocation = invoke(h.root, h.env);
      expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
      expect(invocation.stdout.toString()).toBe(`${h.base}\n`);
    }
  });

  it.each(['GITHUB_SHA', 'PR_HEAD_SHA', 'PR_NUMBER', 'GITHUB_REF', 'EVENT_NAME'])(
    'refuses missing %s',
    (name) => {
      const h = history();
      const invocation = invoke(h.root, { ...h.env, [name]: '' });
      refuse(invocation);
      expect(invocation.stderr.toString()).toContain(`Invalid or missing ${name}`);
    },
  );

  it.each([
    ['GITHUB_SHA', 'HEAD'],
    ['PR_HEAD_SHA', 'main'],
    ['PR_NUMBER', '0'],
    ['PR_NUMBER', '399/merge'],
    ['GITHUB_REF', 'refs/pull/400/merge'],
    ['GITHUB_REF', 'refs/pull/399/head'],
    ['EVENT_NAME', 'push'],
  ])('refuses invalid %s=%s', (name, value) => {
    const h = history();
    const invocation = invoke(h.root, { ...h.env, [name]: value });
    refuse(invocation);
    expect(invocation.stderr.toString()).toContain(
      name === 'GITHUB_REF' && value === 'refs/pull/400/merge'
        ? 'GITHUB_REF does not match PR_NUMBER'
        : `Invalid or missing ${name}`,
    );
  });

  it('refuses a checkout different from GITHUB_SHA', () => {
    const h = history();
    git(h.root, 'checkout', '--detach', h.head);
    refuse(invoke(h.root, h.env));
  });

  it('refuses the wrong payload head', () => {
    const h = history();
    refuse(invoke(h.root, { ...h.env, PR_HEAD_SHA: h.base }));
  });

  it.each([0, 1, 3])('refuses a commit with %s parents', (count) => {
    const h = history();
    const parents = [h.base, h.head, h.stale].slice(0, count).flatMap((sha) => ['-p', sha]);
    const merge = git(h.root, 'commit-tree', h.tree, ...parents, '-m', 'wrong topology');
    git(h.root, 'checkout', '--detach', merge);
    refuse(invoke(h.root, { ...h.env, GITHUB_SHA: merge }));
  });

  it.each([
    ['base', 'missing'],
    ['head', 'missing'],
    ['base', 'corrupt'],
    ['head', 'corrupt'],
  ] as const)('refuses a %s parent object that is %s', (parent, fault) => {
    const h = history();
    const sha = h[parent];
    const path = join(h.root, '.git/objects', sha.slice(0, 2), sha.slice(2));
    rmSync(path);
    if (fault === 'corrupt') writeFileSync(path, 'unreadable Git object');
    refuse(invoke(h.root, h.env));
  });

  it('refuses an absent merge object', () => {
    const h = history();
    rmSync(join(h.root, '.git/objects', h.merge.slice(0, 2), h.merge.slice(2)));
    refuse(invoke(h.root, h.env));
  });

  it('reads original commit parents even if local replacement objects exist', () => {
    const h = history();
    const replacement = git(
      h.root,
      'commit-tree',
      h.tree,
      '-p',
      h.stale,
      '-p',
      h.head,
      '-m',
      'replacement',
    );
    git(h.root, 'replace', h.merge, replacement);
    const invocation = invoke(h.root, h.env);
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
    expect(invocation.stdout.toString()).toBe(`${h.base}\n`);
  });

  it('routes the corpus PR selector through the same validated merge', () => {
    const h = history();
    const script = join(import.meta.dir, 'corpus-version-base.ts');
    const invocation = invoke(h.root, h.env, script);
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
    expect(invocation.stdout.toString()).toBe(`${h.base}\n`);
    refuse(invoke(h.root, { ...h.env, PR_HEAD_SHA: h.base }, script));
  });
});

interface Step {
  name: string;
  run?: string;
}
interface Workflow {
  jobs: Record<string, { steps: Step[] } | undefined>;
}
const runtimeSteps = [
  ['gate_workspace', 'Gate — test, lint, typecheck, build'],
  ['gate_backend', 'Backend — test, lint, typecheck, build'],
  ['gate_remote', 'Remote — test, lint, typecheck, build'],
  ['gate_remote_model', 'Remote isolated leaf — test'],
  ['gate_frontend', 'Frontend — test, lint, typecheck, build'],
  ['gate_heavy', 'Heavy leaf — test, lint, typecheck, build'],
] as const;
function runtimePartition(job: string): string {
  if (job === 'gate_remote') return 'remote-rest';
  if (job === 'gate_remote_model') return 'remote-model';
  if (job === 'gate_heavy') return 'heavy-tool-fleet';
  return job.slice(5);
}

const workflow = Bun.YAML.parse(
  await Bun.file(join(ROOT, '.github/workflows/ci.yml')).text(),
) as Workflow;

function step(job: string, name: string): string {
  const script = workflow.jobs[job]?.steps.find((entry) => entry.name === name)?.run;
  if (!script) throw new Error(`Missing production step ${job}/${name}`);
  return script;
}

/**
 * Stand-ins for the memory scope's privileged chain (A-CI-LEAF-MEMORYMAX-1). `sudo` behaves like
 * `sudo -n` under env_reset and secure_path: it resolves its program in `bin` alone and starts it
 * with a reset environment, so the step must restore its own. `systemd-run` and `setpriv` record
 * their options in SCOPE_CALLS and exec the command after `--`, as `--scope` runs it in place.
 * `journalctl` stands in for the kernel log the end record filters for OOM-killer lines.
 */
function writeScopeChain(bin: string, absent: readonly string[]) {
  const chain = {
    sudo: `#!/bin/bash
[ "$1" = -n ] || { printf 'fake sudo: expected -n\\n' >&2; exit 2; }
shift
if [ -n "\${SUDO_STATUS:-}" ]; then printf 'sudo: a password is required\\n' >&2; exit "$SUDO_STATUS"; fi
[ -x '${bin}'/"$1" ] || { printf 'sudo: %s: command not found\\n' "$1" >&2; exit 1; }
exec /usr/bin/env -i PATH='${bin}:/usr/bin:/bin' SCOPE_CALLS="$SCOPE_CALLS" '${bin}'/"$1" "\${@:2}"
`,
    'systemd-run': `#!/bin/bash
options=()
while [ "$#" -gt 0 ] && [ "$1" != -- ]; do options+=("$1"); shift; done
[ "\${1:-}" = -- ] || { printf 'fake systemd-run: missing --\\n' >&2; exit 2; }
shift
printf 'systemd-run %s -- %s\\n' "\${options[*]}" "$1" >> "$SCOPE_CALLS"
exec "$@"
`,
    setpriv: `#!/bin/bash
options=()
while [ "$#" -gt 0 ] && [ "$1" != -- ]; do options+=("$1"); shift; done
[ "\${1:-}" = -- ] || { printf 'fake setpriv: missing --\\n' >&2; exit 2; }
shift
printf 'setpriv %s -- %s\\n' "\${options[*]}" "$1" >> "$SCOPE_CALLS"
exec "$@"
`,
    journalctl: `#!/bin/bash
printf 'journalctl %s\\n' "$*" >> "$SCOPE_CALLS"
printf '2026-11-21T04:40:00+0000 runner kernel: audit: type=1400 apparmor="STATUS"\\n'
printf '2026-11-21T04:41:00+0000 runner kernel: Out of memory: Killed process 4242 (bun) total-vm:9000000kB\\n'
# The whole journal (the recorder's journal section) adds a network line and an unrelated one.
if [ "$1" != -k ]; then
  printf '2026-11-21T04:42:00+0000 runner systemd-networkd[612]: eth0: Lost carrier\\n'
  printf '2026-11-21T04:42:30+0000 runner CRON[1700]: (root) CMD (true)\\n'
fi
`,
  };
  for (const [name, text] of Object.entries(chain))
    if (!absent.includes(name)) writeFileSync(join(bin, name), text, { mode: 0o755 });
}

/**
 * What the scope's kernel files report to the probe and to the events wrapper, and which chain
 * programs are absent. A `null` file is absent, as `cpuset.cpus.effective` is when the cpuset
 * controller is not enabled for the scope.
 */
interface ScopeFixture {
  absent?: readonly string[];
  memoryMax?: string;
  swapMax?: string;
  pidsMax?: string | null;
  cpus?: string | null;
  pidsEventsMax?: string | null;
  oomKills?: string;
  pidsPeak?: string | null;
  /** The recorder's tick in seconds in place of the production 45 (A-CI-LEAF-RECORDER-2). */
  recorderInterval?: number;
  /** `absent` makes the fake `ip` and `ss` fail as missing tools and leaves no interface counters. */
  network?: 'absent';
  /** Scripted free KiB per path over {@link defaultDisk}; `absent` makes every df of it fail. */
  disk?: Record<string, string>;
  /** Docker's data root as `docker info` reports it; `null` is a host without a daemon. */
  dockerRoot?: string | null;
  /**
   * The host's DMI strings under the step's `dmi_root` (A-CI-LEAF-DISK-1); Azure's by default. A
   * `null` file is absent and `unreadable` is mode 000.
   */
  dmi?: { sys_vendor?: string | null; product_name?: string | null };
}

/** What an Azure-hosted runner's start record and #963 header say about its host. */
const azureCloud = 'cloud=azure dmiProduct=Virtual_Machine';

/** Writes the fixture's DMI files under a scratch root and points the step's one `dmi_root=` line at it. */
function bindDmiRoot(root: string, script: string, fixture: ScopeFixture): string {
  const assignment = 'dmi_root=/sys/class/dmi/id\n';
  if (!script.includes(assignment)) return script;
  expect(script.split(assignment)).toHaveLength(2);
  const dmiRoot = join(root, 'dmi');
  mkdirSync(dmiRoot, { recursive: true });
  const files = {
    sys_vendor: 'Microsoft Corporation',
    product_name: 'Virtual Machine',
    ...fixture.dmi,
  };
  for (const [file, value] of Object.entries(files)) {
    if (value === null) continue;
    writeFileSync(join(dmiRoot, file), value === 'unreadable' ? 'hidden\n' : `${value}\n`);
    if (value === 'unreadable') chmodSync(join(dmiRoot, file), 0o000);
  }
  return script.replace(assignment, `dmi_root='${dmiRoot}'\n`);
}

/** The `${TMPDIR:-/tmp}` the step's disk fields read: an empty TMPDIR also means /tmp. */
const inheritedTmp = process.env['TMPDIR'];
const sampleTmp = inheritedTmp === undefined || inheritedTmp === '' ? '/tmp' : inheritedTmp;

/** What the fake df reports for the four sampled paths unless a fixture overrides one. */
function defaultDisk(dockerRoot: string): Record<string, string> {
  return { '/': '52428800', '/mnt': '41943040', [sampleTmp]: '31457280', [dockerRoot]: '20971520' };
}

/**
 * Stand-ins for the disk telemetry (A-CI-LEAF-DISK-1). `df --output=avail -k <path>` prints the
 * count DF_SCRIPT holds for that path; a path scripted `absent` fails every df form, as a missing
 * mount does; any other call runs the real df, so the records' `df -h /` keep their real header.
 * `docker info -f '{{.DockerRootDir}}'` prints FAKE_DOCKER_ROOT, or fails when it is empty, as a
 * runner without a daemon does. Returns the environment that binds them.
 */
function writeDiskFakes(bin: string, root: string, fixture: ScopeFixture): Record<string, string> {
  const dockerRoot = fixture.dockerRoot === undefined ? join(root, 'docker') : fixture.dockerRoot;
  // The default data root exists so the recorder's real `df -h` can read it.
  if (fixture.dockerRoot === undefined) mkdirSync(join(root, 'docker'), { recursive: true });
  const script = join(root, 'df-script');
  const disk = { ...defaultDisk(dockerRoot ?? join(root, 'docker')), ...fixture.disk };
  writeFileSync(
    script,
    Object.entries(disk)
      .map(([path, value]) => `${path}\t${value}\n`)
      .join(''),
  );
  writeFileSync(
    join(bin, 'df'),
    `#!/bin/bash
path="\${!#}"
value="$(awk -F '\\t' -v path="$path" '$1 == path { print $2 }' "$DF_SCRIPT")"
if [ "$value" = absent ]; then printf 'df: %s: No such file or directory\\n' "$path" >&2; exit 1; fi
if [ -n "$value" ] && [ "$#" -eq 3 ] && [ "$1" = --output=avail ] && [ "$2" = -k ]; then
  printf '    Avail\\n%s\\n' "$value"
  exit 0
fi
exec /usr/bin/df "$@"
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, 'docker'),
    `#!/bin/bash
[ "$*" = 'info -f {{.DockerRootDir}}' ] || { printf 'fake docker: unexpected %s\\n' "$*" >&2; exit 2; }
[ -n "\${FAKE_DOCKER_ROOT:-}" ] || { printf 'Cannot connect to the Docker daemon\\n' >&2; exit 1; }
printf '%s\\n' "$FAKE_DOCKER_ROOT"
`,
    { mode: 0o755 },
  );
  return { DF_SCRIPT: script, FAKE_DOCKER_ROOT: dockerRoot ?? '' };
}

/**
 * The capped steps read the probe scope's memory.max, memory.swap.max, pids.max and
 * cpuset.cpus.effective, and the gate wrapper its pids.events and memory.events, under
 * `cgroup_root`. The fake chain opens no cgroup, so both run in this process's own cgroup: the
 * fixture writes those files at that path under a scratch root and points the step's one
 * `cgroup_root=` line at it.
 */
function bindScopeCgroup(root: string, script: string, fixture: ScopeFixture): string {
  const assignment = 'cgroup_root=/sys/fs/cgroup\n';
  if (!script.includes(assignment)) return script;
  expect(script.split(assignment)).toHaveLength(2);
  const own = /^0::(\/.*)$/m.exec(readFileSync('/proc/self/cgroup', 'utf8'))?.[1];
  if (own === undefined)
    throw new Error('The scope fixture requires a cgroup v2 /proc/self/cgroup');
  const cgroupRoot = join(root, 'cgroup');
  mkdirSync(join(cgroupRoot, own), { recursive: true });
  writeFileSync(join(cgroupRoot, own, 'memory.max'), `${fixture.memoryMax ?? '12884901888'}\n`);
  writeFileSync(join(cgroupRoot, own, 'memory.swap.max'), `${fixture.swapMax ?? '0'}\n`);
  const optional = {
    'pids.max': fixture.pidsMax === undefined ? '4096' : fixture.pidsMax,
    'cpuset.cpus.effective': fixture.cpus === undefined ? '0-2' : fixture.cpus,
    'pids.events':
      fixture.pidsEventsMax === undefined
        ? 'max 0'
        : fixture.pidsEventsMax && `max ${fixture.pidsEventsMax}`,
    'pids.peak': fixture.pidsPeak === undefined ? '90' : fixture.pidsPeak,
  };
  for (const [file, value] of Object.entries(optional))
    if (value !== null) writeFileSync(join(cgroupRoot, own, file), `${value}\n`);
  writeFileSync(
    join(cgroupRoot, own, 'memory.events'),
    `low 0\nhigh 0\nmax 0\noom 0\noom_kill ${fixture.oomKills ?? '0'}\noom_group_kill 0\n`,
  );
  return script.replace(assignment, `cgroup_root='${cgroupRoot}'\n`);
}

/** Rewrites the step's one `recorder_interval=45` line so a test sees several ticks. */
function bindRecorderInterval(script: string, seconds: number | undefined): string {
  const assignment = 'recorder_interval=45\n';
  if (seconds === undefined || !script.includes(assignment)) return script;
  expect(script.split(assignment)).toHaveLength(2);
  return script.replace(assignment, `recorder_interval=${String(seconds)}\n`);
}

/** What the fake `/proc/net/dev` holds: the two header lines, lo and the default interface. */
const netDev = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo:     100       2    0    0    0     0          0         0      100       2    0    0    0     0       0          0
  eth0: 123456789    4242    0    1    0     0          0         0 98765432    3131    0    0    0     0       0          0
`;

/**
 * Stand-ins for the recorder's network probes (A-CI-LEAF-RECORDER-2): `ip` and `ss` print a
 * runner's shapes, or with `network: 'absent'` fail as a missing tool does; `iptables`, reached
 * through the fake `sudo`, prints three rules, and `nft` is absent there. The step's one
 * `recorder_net_dev=` line points at a scratch copy of {@link netDev}, or at a missing path.
 */
function bindNetwork(bin: string, root: string, script: string, fixture: ScopeFixture): string {
  const missing = `#!/bin/bash\nprintf '%s: command not found\\n' "$0" >&2\nexit 127\n`;
  const ip = `#!/bin/bash
case "$*" in
  '-br addr') printf 'lo               UNKNOWN        127.0.0.1/8\\neth0             UP             10.1.0.4/16\\n' ;;
  '-br link') printf 'lo               UNKNOWN        00:00:00:00:00:00\\neth0             UP             00:0d:3a:aa:bb:cc\\n' ;;
  route) printf 'default via 10.1.0.1 dev eth0 proto dhcp src 10.1.0.4 metric 100\\n10.1.0.0/16 dev eth0 proto kernel scope link src 10.1.0.4\\n' ;;
  'route show default') printf 'default via 10.1.0.1 dev eth0 proto dhcp src 10.1.0.4 metric 100\\n' ;;
  *) printf 'fake ip: unexpected %s\\n' "$*" >&2; exit 2 ;;
esac
`;
  const ss = `#!/bin/bash
[ "$*" = -s ] || { printf 'fake ss: unexpected %s\\n' "$*" >&2; exit 2; }
printf 'Total: 187\\nTCP:   9 (estab 4, closed 2, orphaned 0, timewait 1)\\n'
`;
  const absent = fixture.network === 'absent';
  writeFileSync(join(bin, 'ip'), absent ? missing : ip, { mode: 0o755 });
  writeFileSync(join(bin, 'ss'), absent ? missing : ss, { mode: 0o755 });
  if (!absent)
    writeFileSync(
      join(bin, 'iptables'),
      `#!/bin/bash\nprintf -- '-P INPUT ACCEPT\\n-P FORWARD DROP\\n-P OUTPUT ACCEPT\\n'\n`,
      {
        mode: 0o755,
      },
    );
  const devices = join(root, 'net-dev');
  if (!absent) writeFileSync(devices, netDev);
  const assignment = 'recorder_net_dev=/proc/net/dev\n';
  if (!script.includes(assignment)) return script;
  expect(script.split(assignment)).toHaveLength(2);
  return script.replace(assignment, `recorder_net_dev='${devices}'\n`);
}

/**
 * A pass-through `sleep` that, with SLEEP_SCALE, divides every duration by it and logs each
 * requested duration under SLEEP_CALLS, so a test can run the production 45 s tick in 1 s.
 */
const fakeSleep = `#!/bin/bash
if [ -n "\${SLEEP_CALLS:-}" ]; then printf '%s\\n' "$1" >> "$SLEEP_CALLS"; fi
if [ -n "\${SLEEP_SCALE:-}" ]; then
  exec /usr/bin/sleep "$(awk -v seconds="$1" -v scale="$SLEEP_SCALE" 'BEGIN { printf "%.3f", seconds / scale }')"
fi
exec /usr/bin/sleep "$@"
`;

/**
 * A stand-in for `gh` (A-CI-LEAF-RECORDER-1): each call leaves its argv, NUL-separated, and the
 * GH_TOKEN it saw under GH_CALLS. A create prints the comment id 4242, or with GH_CREATE_STATUS
 * fails as a fork PR's read-only token does; a PATCH fails with GH_PATCH_STATUS.
 */
const fakeGh = `#!/bin/bash
n="$(find "$GH_CALLS" -name '*.args' | wc -l)"
printf '%s\\0' "$@" > "$GH_CALLS/$n.args"
printf '%s' "\${GH_TOKEN:-}" > "$GH_CALLS/$n.token"
if [ "$2" = -X ]; then
  if [ -n "\${GH_PATCH_STATUS:-}" ]; then printf 'gh: Server Error (HTTP 502)\\n' >&2; exit "$GH_PATCH_STATUS"; fi
  exit 0
fi
if [ -n "\${GH_CREATE_STATUS:-}" ]; then
  printf '{"message":"Resource not accessible by integration","status":"403"}\\n'
  printf 'gh: Resource not accessible by integration (HTTP 403)\\n' >&2
  exit "$GH_CREATE_STATUS"
fi
printf '4242\\n'
`;

interface GhCall {
  args: string[];
  token: string;
}

function readGhCalls(dir: string): GhCall[] {
  const calls: GhCall[] = [];
  for (let n = 0; existsSync(join(dir, `${String(n)}.args`)); n++)
    calls.push({
      args: readFileSync(join(dir, `${String(n)}.args`), 'utf8')
        .split('\0')
        .slice(0, -1),
      token: readFileSync(join(dir, `${String(n)}.token`), 'utf8'),
    });
  return calls;
}

function runStep(
  h: ReturnType<typeof history>,
  production: string,
  env: Record<string, string | undefined> = {},
  fixture: ScopeFixture = {},
) {
  const bin = join(h.root, 'bin');
  mkdirSync(bin, { recursive: true });
  symlinkSync(join(ROOT, 'tools'), join(h.root, 'tools'));
  writeScopeChain(bin, fixture.absent ?? []);
  writeFileSync(join(bin, 'gh'), fakeGh, { mode: 0o755 });
  const disk = writeDiskFakes(bin, h.root, fixture);
  writeFileSync(join(bin, 'sleep'), fakeSleep, { mode: 0o755 });
  const script = bindNetwork(
    bin,
    h.root,
    bindRecorderInterval(
      bindDmiRoot(h.root, bindScopeCgroup(h.root, production, fixture), fixture),
      fixture.recorderInterval,
    ),
    fixture,
  );
  writeFileSync(
    join(bin, 'bunx'),
    `#!/bin/bash\nprintf '%s\\n' "$*" >> "$NX_CALLS"\nprintf '["wbs-fe-01"]\\n'\n`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, 'bun'),
    `#!/bin/bash
case "$*" in
  *pr-merge-base.ts*)
    if [ -n "\${RESOLVER_STATUS:-}" ]; then printf '%s\\n' "$RESOLVER_BASE"; exit "$RESOLVER_STATUS"; fi ;;
  *ci-gate-annotations.ts*) exit "\${ANNOTATION_STATUS:-0}" ;;
  *ci-plan.ts*)
    printf '%s\\n' "$*" >> "$NX_CALLS"
    printf '{"schemaVersion":1,"base":"%s","head":"%s","mode":"affected","twilight":"skip","projects":["wbs-fe-01"],"workspaceProjects":["wbs-fe-01"],"partitions":{"backend":[],"remote":[],"frontend":["wbs-fe-01"],"heavy":[],"workspace":[]},"twilightProjects":[],"reasons":["test boundary"]}\\n' "$3" "$4"
    exit 0 ;;
  *ci-run-runtime.ts*)
    printf '%s\\n' "$*" >> "$NX_CALLS"
    printf 'runtime environment sentinel=%s nodeOptions=%s ghToken=%s\\n' "\${GATE_ENVIRONMENT_SENTINEL:-}" "\${NODE_OPTIONS:-}" "\${GH_TOKEN:-}" >> "$SCOPE_CALLS"
    # Test output for the recorder's log tail, and a phase long enough for several recorder ticks.
    if [ -n "\${RUNTIME_OUTPUT:-}" ]; then cat "$RUNTIME_OUTPUT"; fi
    if [ -n "\${RUNTIME_SLEEP:-}" ]; then sleep "$RUNTIME_SLEEP"; fi
    # A second burst of output, so a later tick shows only what came after the first.
    if [ -n "\${RUNTIME_LATER_OUTPUT:-}" ]; then cat "$RUNTIME_LATER_OUTPUT"; sleep "$RUNTIME_LATER_SLEEP"; fi
    # The scope's wrapper is this process's grandparent (wrapper, timeout, runtime): killing it
    # stands in for the OOM killer or a foreign signal taking the wrapper down with the gate.
    if [ -n "\${KILL_SCOPE_WRAPPER:-}" ]; then kill -9 "$(ps -o ppid= -p "$PPID" | tr -d ' ')"; fi
    exit "\${RUNTIME_STATUS:-0}" ;;
esac
exec '${process.execPath}' "$@"
`,
    { mode: 0o755 },
  );
  const output = join(h.root, 'output');
  const calls = join(h.root, 'calls');
  const scopeCalls = join(h.root, 'scope-calls');
  const ghCalls = join(h.root, 'gh-calls');
  mkdirSync(ghCalls);
  writeFileSync(output, '');
  writeFileSync(calls, '');
  writeFileSync(scopeCalls, '');
  const invocation = Bun.spawnSync(['bash', '-c', script], {
    cwd: h.root,
    env: {
      ...process.env,
      ...h.env,
      GITHUB_OUTPUT: output,
      NX_CALLS: calls,
      SCOPE_CALLS: scopeCalls,
      GH_CALLS: ghCalls,
      // The run identity the recorder heads its comment with; GH_TOKEN is hermetic like NODE_OPTIONS.
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_RUN_ID: '44797660117',
      GITHUB_JOB: 'gate_heavy',
      GITHUB_RUN_ATTEMPT: '2',
      GH_TOKEN: '',
      // Matrix values the shared runtime steps read: the remote-model leaf, and for the heavy
      // leaf step (the one that reads PHASE_MINUTES) the tool-fleet leaf with its 75m phase.
      RUNTIME_PARTITION: script.includes('phase_limit="$PHASE_MINUTES"')
        ? 'heavy-tool-fleet'
        : 'remote-model',
      PHASE_MINUTES: '75',
      // Hermetic: a gate host's own pin (A-NODE-HEAP-1) must not decide the step's NODE_OPTIONS.
      NODE_OPTIONS: '',
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      ...disk,
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    invocation,
    output: Bun.file(output),
    calls: Bun.file(calls),
    scopeCalls: Bun.file(scopeCalls),
    ghCalls: () => readGhCalls(ghCalls),
  };
}

describe('production workflow PR consumers', () => {
  it.each(['push', 'merge_group', 'workflow_dispatch'])(
    'retains full gate and browser scope on %s without PR identity',
    async (event) => {
      for (const [job, name] of [
        ['gate_mode', 'Gate mode'],
        ['pixels_mode', 'Browser stack scope'],
        ...runtimeSteps,
        ['gate_twilight', 'Twilight — test, typecheck, build, lint'],
      ]) {
        const h = history();
        const execution = runStep(h, step(job, name), {
          EVENT_NAME: event,
          PR_HEAD_SHA: '',
          PR_NUMBER: '',
          GITHUB_REF: 'refs/heads/main',
          GATE_MODE: 'full',
          GATE_BASE: '',
        });
        expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(0);
        if (job === 'gate_mode') expect(await execution.output.text()).toContain('mode=full');
        if (job === 'pixels_mode')
          expect(await execution.output.text()).toContain('stack=affected');
        if (runtimeSteps.some(([runtimeJob]) => runtimeJob === job))
          expect(await execution.calls.text()).toContain('ci-run-runtime.ts');
        if (job === 'gate_twilight') expect(await execution.calls.text()).toContain('nx run-many');
      }
    },
  );

  it.each([
    ['gate_mode', 'Gate mode'],
    ['pixels_mode', 'Browser stack scope'],
  ])('%s uses the validated first parent and propagates resolver failure', async (job, name) => {
    const h = history();
    const execution = runStep(h, step(job, name), { GATE_MODE: 'affected', GATE_BASE: h.base });
    expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(0);
    expect(await execution.calls.text()).toContain(
      job === 'gate_mode' ? `ci-plan.ts ${h.base} ${h.merge} .` : `--base=${h.base}`,
    );
    expect(await execution.calls.text()).not.toContain(h.stale);
    const broken = history();
    const failure = runStep(broken, step(job, name), {
      GATE_MODE: 'affected',
      GATE_BASE: broken.base,
      PR_HEAD_SHA: broken.base,
    });
    expect(failure.invocation.exitCode).not.toBe(0);
    expect(await failure.calls.text()).toBe('');
    expect(await failure.output.text()).toBe('');
  });

  it.each([...runtimeSteps, ['gate_twilight', 'Twilight — test, typecheck, build, lint']])(
    '%s propagates resolver failure before runtime work even with a valid GATE_BASE',
    async (job, name) => {
      const h = history();
      const execution = runStep(h, step(job, name), {
        GATE_MODE: 'affected',
        GATE_BASE: h.base,
        PR_HEAD_SHA: h.base,
      });
      expect(execution.invocation.exitCode).not.toBe(0);
      expect(await execution.calls.text()).toBe('');
    },
  );

  it.each([...runtimeSteps, ['gate_twilight', 'Twilight — test, typecheck, build, lint']])(
    '%s refuses a resolver that emits a valid base then fails',
    async (job, name) => {
      const h = history();
      const execution = runStep(h, step(job, name), {
        GATE_MODE: 'affected',
        GATE_BASE: h.base,
        RESOLVER_BASE: h.base,
        RESOLVER_STATUS: '7',
      });
      expect(execution.invocation.exitCode).toBe(7);
      expect(await execution.calls.text()).toBe('');
    },
  );

  it.each([...runtimeSteps, ['gate_twilight', 'Twilight — test, typecheck, build, lint']])(
    '%s validates GATE_BASE against its own checkout before runtime work',
    async (job, name) => {
      for (const valid of [true, false]) {
        const h = history();
        const execution = runStep(h, step(job, name), {
          GATE_MODE: 'affected',
          GATE_BASE: valid ? h.base : h.stale,
        });
        if (valid) {
          expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(0);
          expect(await execution.calls.text()).toContain(
            `ci-run-runtime.ts ${runtimePartition(job)} ${h.base} ${h.merge} .`,
          );
        } else {
          expect(execution.invocation.exitCode).not.toBe(0);
          expect(await execution.calls.text()).toBe('');
        }
      }
    },
  );
  it.each([...runtimeSteps, ['gate_twilight', 'Twilight — test, typecheck, build, lint']])(
    '%s propagates runtime and annotation failures and refuses unknown modes',
    async (job, name) => {
      for (const fault of [{ RUNTIME_STATUS: '7' }, { ANNOTATION_STATUS: '8' }]) {
        const h = history();
        const execution = runStep(h, step(job, name), {
          GATE_MODE: 'affected',
          GATE_BASE: h.base,
          ...fault,
        });
        expect(execution.invocation.exitCode).toBe(fault.RUNTIME_STATUS === '7' ? 7 : 8);
        if (job !== 'gate_twilight') {
          const log = Bun.file(join(h.root, 'nx-gate.log'));
          expect(log.size).toBeGreaterThan(0);
          const phase = await log.text();
          expect(phase).toContain(
            `runtime phase start partition=${runtimePartition(job)} head=${h.merge}`,
          );
          expect(phase).toContain(`runtime phase end partition=${runtimePartition(job)}`);
          expect(phase).toContain(`exit=${fault.RUNTIME_STATUS === '7' ? '7' : '0'}`);
        }
      }
      for (const mode of ['', 'docs', 'unknown']) {
        const h = history();
        const execution = runStep(h, step(job, name), { GATE_MODE: mode, GATE_BASE: h.base });
        expect(execution.invocation.exitCode).not.toBe(0);
        expect(execution.calls.size).toBe(0);
      }
    },
  );
});

// R5-32 (A-CI-WORKSPACE-MEMORY-1): a surviving workspace job ships its image, heap limit,
// memory samples and end headroom. A lost runner uploads no log at all, so this trail can only
// localise a death in a run whose log survives.
const headroomShards = [
  ['gate_workspace', 'Gate — test, lint, typecheck, build', 'workspace'],
  ['gate_heavy', 'Heavy leaf — test, lint, typecheck, build', 'heavy-tool-fleet'],
] as const;

// A-CI-WORKSPACE-MEMORY-3: every heavy leaf runs the workspace step text. Exactly two lines may
// differ, the partition and phase-budget assignments, which the leaf takes from its matrix entry.
// Any other drift, in the headroom sampler or status handling for example, fails this test.
// Proof (2026-11-21): a 60 s sampler interval in gate_heavy alone failed it, and so did a literal
// `135m` budget in place of "${phase_limit}m".
test('the heavy leaf step differs from the workspace step only in partition and phase budget', () => {
  const workspace = step('gate_workspace', 'Gate — test, lint, typecheck, build');
  const heavy = step('gate_heavy', 'Heavy leaf — test, lint, typecheck, build');
  const assignments = [
    ['partition=workspace\n', 'partition="$RUNTIME_PARTITION"\n'],
    ['phase_limit=105\n', 'phase_limit="$PHASE_MINUTES"\n'],
  ] as const;
  for (const [fixed, leaf] of assignments) {
    expect(workspace.split(fixed)).toHaveLength(2);
    expect(heavy.split(leaf)).toHaveLength(2);
  }
  expect(
    workspace.split('timeout --signal=TERM --kill-after=30s "${phase_limit}m" \\'),
  ).toHaveLength(2);
  expect(heavy).toBe(
    assignments.reduce((text, [fixed, leaf]) => text.replace(fixed, leaf), workspace),
  );
});

test('the heavy leaf step refuses a missing, non-numeric or zero phase budget before runtime work', async () => {
  // `0` would make `timeout 0m` run without a limit.
  for (const budget of ['', '75m', 'x', '0', '00', '075']) {
    const h = history();
    const execution = runStep(h, step('gate_heavy', 'Heavy leaf — test, lint, typecheck, build'), {
      GATE_MODE: 'affected',
      GATE_BASE: h.base,
      PHASE_MINUTES: budget,
    });
    expect(execution.invocation.exitCode, budget).not.toBe(0);
    expect(execution.invocation.stderr.toString(), budget).toContain(
      'invalid runtime phase budget',
    );
    expect(await execution.calls.text(), budget).not.toContain('ci-run-runtime.ts');
  }
});

// A-CI-LEAF-MEMORYMAX-1 (R5-32): the Nx phase runs under a hard MemoryMax scope, so a suite that
// outgrows it is OOM-killed with a log instead of losing the runner. The ledger holds the exact
// scope properties, the probe before the gate, the restored identity, the restored environment
// and the A-NODE-HEAP-1 pin inside it. The probe runs a real `node` through the chain, so the start
// record's heap figure is the one Node reports inside the scope (#964's first hosted run lost three
// lints because the outside figure hid a 2240 MB heap inside the cap).
// Proof (2026-11-21): dropping `-p OOMPolicy=continue`, `-p MemorySwapMax=0`,
// `--expand-environment=no`, the setpriv line or `env -i "${gate_environment[@]}"` (the runtime
// then saw an empty sentinel) failed this test, and so did deleting the heap pin (empty
// nodeOptions). A 137 from the capped phase must reach the phase end record and the step.
// A-CI-LEAF-MEMORYMAX-2: the scope also carries TasksMax=4096 and AllowedCPUs=0-2 in the explicit
// system.slice, and a wrapper inside it copies pids.events and memory.events into the end record.
// Proof (2026-11-21): dropping `-p "TasksMax=$tasks_max"`, `-p "AllowedCPUs=$allowed_cpus"` or
// `--slice=system.slice` failed the ledger; running the gate without the events wrapper left
// `runtime headroom scope events unavailable` where the counts were expected.
test.each(headroomShards)(
  '%s step runs its Nx phase in a capped scope as this user with its environment',
  async (job, name, partition) => {
    const id = (flag: string) =>
      Bun.spawnSync(['id', flag], { stdout: 'pipe' }).stdout.toString().trim();
    const sentinel = 'spaced value=with\tseparators';
    for (const [status, inherited, nodeOptions, refused, killed, peak] of [
      ['0', '', '--max-old-space-size=4096', '0', '0', '90'],
      [
        '137',
        '--enable-source-maps',
        '--enable-source-maps --max-old-space-size=4096',
        '3',
        '1',
        '4096',
      ],
      ['0', '--max-old-space-size=4096', '--max-old-space-size=4096', '0', '0', '90'],
    ] as const) {
      const h = history();
      const execution = runStep(
        h,
        step(job, name),
        {
          GATE_MODE: 'affected',
          GATE_BASE: h.base,
          RUNTIME_STATUS: status,
          GATE_ENVIRONMENT_SENTINEL: sentinel,
          NODE_OPTIONS: inherited,
        },
        { pidsEventsMax: refused, oomKills: killed, pidsPeak: peak },
      );
      expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(
        Number(status),
      );
      // The tool-fleet recorder's own kernel and journal reads (A-CI-LEAF-RECORDER-1 and -2) are
      // covered by its tests.
      const ledger = (await execution.scopeCalls.text())
        .split('\n')
        .filter(
          (line) =>
            line !== '' &&
            !line.startsWith('journalctl -k --since -3min ') &&
            line !== 'journalctl --since -3min --no-pager -o short-iso',
        );
      const unit = /--unit=(ci-gate-\S+-[0-9]+)-probe /.exec(ledger[0] ?? '')?.[1] ?? '';
      expect(unit, ledger.join('\n')).toMatch(new RegExp(`^ci-gate-${partition}-[0-9]+$`));
      const scope = (suffix: string) =>
        'systemd-run --scope --quiet --collect --expand-environment=no --slice=system.slice ' +
        `--unit=${unit}${suffix} -p MemoryMax=12G -p MemorySwapMax=0 -p OOMPolicy=continue ` +
        '-p TasksMax=4096 -p AllowedCPUs=0-2 -- setpriv';
      const identity = `setpriv --reuid=${id('-u')} --regid=${id('-g')} --groups=${id('-G').replaceAll(' ', ',')} -- env`;
      expect(ledger.slice(0, 5)).toEqual([
        scope('-probe'),
        identity,
        scope(''),
        identity,
        `runtime environment sentinel=${sentinel} nodeOptions=${nodeOptions} ghToken=`,
      ]);
      expect(ledger[5]).toMatch(/^journalctl -k --no-pager -o short-iso --since @[0-9]+$/);
      expect(ledger).toHaveLength(6);
      expect(await execution.calls.text()).toContain(
        `ci-run-runtime.ts ${partition} ${h.base} ${h.merge} . affected`,
      );
      const log = await Bun.file(join(h.root, 'nx-gate.log')).text();
      const heap =
        / heapSizeLimit=([0-9]+) memoryMax=12G tasksMax=4096 allowedCpus=0-2 scope=(\S+) cloud=azure dmiProduct=Virtual_Machine\n/.exec(
          log,
        );
      expect(heap?.[2]).toBe(`${unit}.scope`);
      // The pinned 4096 MiB old space, measured by Node inside the probe scope.
      expect(Number(heap?.[1])).toBeGreaterThanOrEqual(4294967296);
      expect(log).toMatch(
        new RegExp(`runtime phase end partition=${partition} .* exit=${status}\n`),
      );
      const events = log.indexOf(
        `runtime headroom scope events pidsEventsMax=${refused} memoryEventsOomKill=${killed} pidsPeak=${peak}\n`,
      );
      expect(events, log).toBeGreaterThan(
        log.indexOf(`runtime headroom end partition=${partition}`),
      );
      const kernel = log.indexOf('runtime headroom kernel oom since=@');
      expect(kernel).toBeGreaterThan(events);
      expect(log.slice(kernel)).toContain('Out of memory: Killed process 4242 (bun)');
      expect(log.slice(kernel)).not.toContain('apparmor');
    }
  },
);

// Proof (2026-11-21): with the probe deleted, an absent systemd-run reached ci-run-runtime.ts;
// with the probe's report check deleted, memory.max=max, a 3 GiB swap allowance and a 2240 MB heap
// all reached it; with the heap-figure refusal deleted, a conflicting 2048 pin reached it.
// A-CI-LEAF-MEMORYMAX-2: with pids.max and cpuset.cpus.effective dropped from the probe and its
// report check, pids.max=max, an absent pids.max, cpus 0-3 and an absent cpuset file reached it.
test.each(headroomShards)(
  '%s step refuses before runtime work when the memory scope or heap pin is wrong',
  async (job, name) => {
    const faults: [string, Partial<Record<string, string>>, ScopeFixture, string][] = [
      ['absent systemd-run', {}, { absent: ['systemd-run'] }, 'cannot open a MemoryMax=12G'],
      ['sudo without a password', { SUDO_STATUS: '1' }, {}, 'cannot open a MemoryMax=12G'],
      ['an unlimited memory.max', {}, { memoryMax: 'max' }, "reported 'memoryMax=max swapMax=0"],
      ['a swap allowance', {}, { swapMax: '3221225472' }, 'swapMax=3221225472'],
      ['an unlimited pids.max', {}, { pidsMax: 'max' }, 'swapMax=0 pidsMax=max cpus=0-2'],
      ['an absent pids.max', {}, { pidsMax: null }, 'swapMax=0 pidsMax= cpus=0-2'],
      ['all four vCPUs', {}, { cpus: '0-3' }, 'pidsMax=4096 cpus=0-3 heapSizeLimit='],
      ['no cpuset controller', {}, { cpus: null }, 'pidsMax=4096 cpus= heapSizeLimit='],
      ['a constrained heap', { FAKE_NODE_HEAP: '2348810240' }, {}, 'heap limit 2348810240'],
      [
        'a conflicting heap figure',
        { NODE_OPTIONS: '--max-old-space-size=2048' },
        {},
        'A-NODE-HEAP-1: NODE_OPTIONS already sets --max-old-space-size=2048',
      ],
    ];
    for (const [fault, env, fixture, message] of faults) {
      const h = history();
      if (env['FAKE_NODE_HEAP'] !== undefined) {
        mkdirSync(join(h.root, 'bin'), { recursive: true });
        writeFileSync(join(h.root, 'bin', 'node'), '#!/bin/sh\nprintf %s "$FAKE_NODE_HEAP"\n', {
          mode: 0o755,
        });
      }
      const execution = runStep(
        h,
        step(job, name),
        { GATE_MODE: 'affected', GATE_BASE: h.base, ...env },
        fixture,
      );
      expect(execution.invocation.exitCode, fault).toBe(1);
      const stderr = execution.invocation.stderr.toString();
      expect(stderr, fault).toContain(message);
      expect(await execution.calls.text(), fault).not.toContain('ci-run-runtime.ts');
      if (!message.startsWith('A-NODE-HEAP-1')) {
        expect(stderr, fault).toContain('A-CI-LEAF-MEMORYMAX-2: ');
        const log = await Bun.file(join(h.root, 'nx-gate.log')).text();
        expect(log, fault).toContain('refusing to run the gate uncapped');
        expect(log, fault).not.toContain('runtime headroom start');
        expect(log, fault).not.toContain('runtime headroom sampler pid=');
      }
    }
  },
);

function headroomLog(text: string) {
  const lines = text.split('\n');
  const at = (prefix: string) => lines.findIndex((line) => line.startsWith(prefix));
  return { lines, at };
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}

test.each(headroomShards)(
  '%s step records headroom start, samples and end around its Nx phase',
  async (job, name, partition) => {
    for (const status of ['0', '7']) {
      const h = history();
      const execution = runStep(h, step(job, name), {
        GATE_MODE: 'affected',
        GATE_BASE: h.base,
        RUNTIME_STATUS: status,
        ImageOS: 'ubuntu24',
        ImageVersion: '20261116.376.1',
        // Hosted runners export a colour-capable environment; `node -p` then wrapped the heap
        // limit in ANSI escapes (job on ab1607590). The record must stay plain text.
        FORCE_COLOR: '1',
      });
      expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(
        Number(status),
      );
      const log = await Bun.file(join(h.root, 'nx-gate.log')).text();
      expect(log.includes('\u001b'), status).toBe(false);
      const { lines, at } = headroomLog(log);
      const start = at(`runtime headroom start partition=${partition} utc=`);
      const phaseEnd = at(`runtime phase end partition=${partition}`);
      const end = at(`runtime headroom end partition=${partition} utc=`);
      expect(at(`runtime phase start partition=${partition}`), status).toBe(0);
      expect(start, status).toBe(1);
      expect(lines[start], status).toMatch(
        new RegExp(
          ` imageOS=ubuntu24 imageVersion=20261116\\.376\\.1 os=.+ heapSizeLimit=[1-9][0-9]* memoryMax=12G tasksMax=4096 allowedCpus=0-2 scope=ci-gate-${partition}-[0-9]+\\.scope ${azureCloud}$`,
        ),
      );
      // The first sample precedes the gate scope, and the fixture never creates its cgroup, so the
      // scope fields read `unavailable`; `samples the gate scope's own cgroup` covers live values.
      // The disk fields are the fake df's defaults (A-CI-LEAF-DISK-1).
      expect(
        lines.filter((line) =>
          /^runtime headroom sample utc=\S+ memAvailableKiB=[0-9]+ node=[0-9]+ bun=[0-9]+ topRssKiB=[0-9]+ top=\S+ scopePids=unavailable scopeMemKiB=unavailable scopePeakKiB=unavailable scopeCpuUsec=unavailable rootAvailKiB=52428800 mntAvailKiB=41943040 tmpAvailKiB=31457280 dockerRootAvailKiB=20971520$/.test(
            line,
          ),
        ).length,
        status,
      ).toBeGreaterThanOrEqual(1);
      const sampler = /^runtime headroom sampler pid=([0-9]+)$/.exec(
        lines[at('runtime headroom sampler pid=')] ?? '',
      );
      expect(sampler, status).not.toBeNull();
      expect(isRunning(Number(sampler?.[1])), status).toBe(false);
      expect(lines, status).toContain('runtime headroom sampler stopped status=0');
      expect(phaseEnd, status).toBeGreaterThan(start);
      expect(end, status).toBeGreaterThan(phaseEnd);
      for (const section of [lines.slice(start, phaseEnd), lines.slice(end)]) {
        expect(
          section.filter((line) => line.startsWith('Mem:')),
          status,
        ).toHaveLength(1);
        expect(
          section.filter((line) => line.startsWith('Filesystem')),
          status,
        ).toHaveLength(1);
      }
    }
  },
);

/**
 * The sampler's functions and the scope's cgroup path, cut from the production step text. The fake
 * chain opens no cgroup and the sampler first fires 30 s into the phase, so the full-step tests see
 * the scope fields only as `unavailable`; this runs the same functions against a scratch cgroup.
 */
function samplerShell(production: string): string {
  const definition = (name: string) => {
    const match = new RegExp(`^${name}\\(\\) \\{(?: .*\\}|\\n[\\s\\S]*?\\n\\})\\n`, 'm').exec(
      production,
    );
    if (!match) throw new Error(`Missing ${name} in the production step`);
    return match[0];
  };
  const path = /^scope_cgroup=.*\n/m.exec(production)?.[0];
  if (path === undefined) throw new Error('Missing scope_cgroup in the production step');
  return (
    [
      'headroom_utc',
      'is_count',
      'sample_scope',
      'disk_avail',
      'docker_root',
      'sample_disk',
      'sample_headroom',
    ]
      .map(definition)
      .join('') + path
  );
}

// A-CI-LEAF-MEMORYMAX-2: each sample carries the gate scope's pids, memory, peak and CPU counters,
// read from outside under the explicit system.slice path, or `unavailable` for all four when the
// scope is absent, a file is missing or unreadable, or a value is not a count. A sample never fails.
// Proof (2026-11-21): deleting `"$(sample_scope)"` from sample_headroom, or the is_count check,
// failed this test; so did reading the path under `$cgroup_root/$scope_unit.scope`.
test.each(headroomShards)("%s step samples the gate scope's own cgroup", (job, name) => {
  const h = history();
  const unit = 'ci-gate-test-4242';
  const scope = join(h.root, 'cgroup', 'system.slice', `${unit}.scope`);
  const shell = samplerShell(step(job, name));
  const bin = join(h.root, 'bin');
  mkdirSync(bin);
  const disk = writeDiskFakes(bin, h.root, {});
  const sample = () => {
    const invocation = Bun.spawnSync(['bash', '-c', `set -euo pipefail\n${shell}sample_headroom`], {
      env: {
        ...process.env,
        ...disk,
        PATH: `${bin}:${process.env['PATH'] ?? ''}`,
        cgroup_root: join(h.root, 'cgroup'),
        scope_unit: unit,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
    return invocation.stdout.toString();
  };
  const diskFields =
    ' rootAvailKiB=52428800 mntAvailKiB=41943040 tmpAvailKiB=31457280 dockerRootAvailKiB=20971520\n';
  const unavailable =
    ' scopePids=unavailable scopeMemKiB=unavailable scopePeakKiB=unavailable scopeCpuUsec=unavailable' +
    diskFields;
  expect(sample()).toEndWith(unavailable);
  mkdirSync(scope, { recursive: true });
  const counters = {
    'pids.current': '37',
    'memory.current': String(5 * 1024 * 1024),
    'memory.peak': String(9 * 1024 * 1024 + 512),
    'cpu.stat': 'usage_usec 123456789\nuser_usec 100000000\nsystem_usec 23456789',
  };
  for (const [file, value] of Object.entries(counters))
    writeFileSync(join(scope, file), `${value}\n`);
  expect(sample()).toMatch(
    /^runtime headroom sample utc=\S+ memAvailableKiB=[0-9]+ node=[0-9]+ bun=[0-9]+ topRssKiB=[0-9]+ top=\S+ scopePids=37 scopeMemKiB=5120 scopePeakKiB=9216 scopeCpuUsec=123456789 rootAvailKiB=52428800 mntAvailKiB=41943040 tmpAvailKiB=31457280 dockerRootAvailKiB=20971520\n$/,
  );
  writeFileSync(join(scope, 'pids.current'), 'max\n');
  expect(sample(), 'a non-count').toEndWith(unavailable);
  writeFileSync(join(scope, 'pids.current'), '37\n');
  chmodSync(join(scope, 'memory.peak'), 0o000);
  expect(sample(), 'an unreadable memory.peak').toEndWith(unavailable);
  rmSync(join(scope, 'memory.peak'));
  expect(sample(), 'an absent memory.peak').toEndWith(unavailable);
  writeFileSync(join(scope, 'memory.peak'), '0\n');
  writeFileSync(join(scope, 'cpu.stat'), 'user_usec 1\n');
  expect(sample(), 'a cpu.stat without usage_usec').toEndWith(unavailable);
});

// A-CI-LEAF-DISK-1 (R5-32): the losses follow the hosting cloud, so the start record names it from
// the host's DMI strings: azure, aws, `other:<vendor>`, or `unavailable` when a file is absent or
// unreadable, and the record still succeeds.
// Proof (2026-11-22): dropping `"$(host_cloud)"` from the start record failed this test and the
// heap-limit and start-record patterns; dropping the "Amazon EC2" mapping failed the aws case.
test.each(headroomShards)("%s step's start record names the host's cloud", async (job, name) => {
  const cases: [string, ScopeFixture['dmi'], string][] = [
    ['azure', {}, azureCloud],
    [
      'aws',
      { sys_vendor: 'Amazon EC2', product_name: 'm7a.xlarge' },
      'cloud=aws dmiProduct=m7a.xlarge',
    ],
    [
      'another vendor',
      { sys_vendor: 'QEMU', product_name: 'Standard PC (Q35 + ICH9, 2009)' },
      'cloud=other:QEMU dmiProduct=Standard_PC__Q35___ICH9__2009_',
    ],
    ['an absent vendor', { sys_vendor: null }, 'cloud=unavailable dmiProduct=unavailable'],
    [
      'an unreadable product',
      { product_name: 'unreadable' },
      'cloud=unavailable dmiProduct=unavailable',
    ],
  ];
  for (const [label, dmi, expected] of cases) {
    const h = history();
    const execution = runStep(
      h,
      step(job, name),
      { GATE_MODE: 'affected', GATE_BASE: h.base },
      { dmi },
    );
    expect(
      execution.invocation.exitCode,
      `${label}: ${execution.invocation.stderr.toString()}`,
    ).toBe(0);
    const { lines, at } = headroomLog(await Bun.file(join(h.root, 'nx-gate.log')).text());
    expect(lines[at('runtime headroom start ')], label).toMatch(
      new RegExp(` scope=ci-gate-\\S+\\.scope ${expected.replaceAll('.', '\\.')}$`),
    );
  }
});

// A-CI-LEAF-DISK-1 (R5-32): each sample carries the free KiB on /, /mnt, ${TMPDIR:-/tmp} and
// Docker's data root. A missing mount, a df failure, a non-count answer or a host without a Docker
// daemon reads `unavailable` for that field alone, and the sample still succeeds.
// Proof (2026-11-22): dropping mntAvailKiB or the sample_disk call, disk_avail's is_count check, or
// either `unavailable` fallback (disk_avail's, sample_disk's Docker branch) failed this test; a
// fallback dropped from gate_heavy alone also failed the byte-equality test.
test.each(headroomShards)('%s step samples free disk on four paths', async (job, name) => {
  const shell = samplerShell(step(job, name));
  const cases: [string, ScopeFixture, string][] = [
    [
      'every path a count',
      {},
      'rootAvailKiB=52428800 mntAvailKiB=41943040 tmpAvailKiB=31457280 dockerRootAvailKiB=20971520',
    ],
    [
      'no /mnt and no Docker daemon',
      { disk: { '/mnt': 'absent' }, dockerRoot: null },
      'rootAvailKiB=52428800 mntAvailKiB=unavailable tmpAvailKiB=31457280 dockerRootAvailKiB=unavailable',
    ],
    [
      'a non-count answer and an absent data root',
      { disk: { [sampleTmp]: '12G', '/srv/docker': 'absent' }, dockerRoot: '/srv/docker' },
      'rootAvailKiB=52428800 mntAvailKiB=41943040 tmpAvailKiB=unavailable dockerRootAvailKiB=unavailable',
    ],
    [
      'a low root disk',
      { disk: { '/': '1024' } },
      'rootAvailKiB=1024 mntAvailKiB=41943040 tmpAvailKiB=31457280 dockerRootAvailKiB=20971520',
    ],
  ];
  for (const [label, fixture, fields] of cases) {
    const h = history();
    const bin = join(h.root, 'bin');
    mkdirSync(bin);
    const disk = writeDiskFakes(bin, h.root, fixture);
    const invocation = Bun.spawnSync(['bash', '-c', `set -euo pipefail\n${shell}sample_headroom`], {
      env: {
        ...process.env,
        ...disk,
        PATH: `${bin}:${process.env['PATH'] ?? ''}`,
        cgroup_root: join(h.root, 'cgroup'),
        scope_unit: 'ci-gate-test-4242',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(invocation.exitCode, `${label}: ${invocation.stderr.toString()}`).toBe(0);
    expect(invocation.stdout.toString(), label).toMatch(
      new RegExp(
        `^runtime headroom sample utc=\\S+ memAvailableKiB=[0-9]+ .* scopeCpuUsec=unavailable ${fields}\n$`,
      ),
    );
  }
  // The production step with /mnt and the Docker daemon absent: its samples read `unavailable`
  // there and the gate status stands.
  for (const status of ['0', '7']) {
    const h = history();
    const execution = runStep(
      h,
      step(job, name),
      { GATE_MODE: 'affected', GATE_BASE: h.base, RUNTIME_STATUS: status },
      { disk: { '/mnt': 'absent' }, dockerRoot: null },
    );
    expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(
      Number(status),
    );
    const { lines } = headroomLog(await Bun.file(join(h.root, 'nx-gate.log')).text());
    const samples = lines.filter((line) => line.startsWith('runtime headroom sample utc='));
    expect(samples.length, status).toBeGreaterThanOrEqual(1);
    for (const sample of samples)
      expect(sample, status).toEndWith(
        ' rootAvailKiB=52428800 mntAvailKiB=unavailable tmpAvailKiB=31457280 dockerRootAvailKiB=unavailable',
      );
  }
});

test.each(headroomShards)(
  '%s headroom telemetry failures leave the gate status unchanged',
  async (job, name, partition) => {
    for (const status of ['0', '7']) {
      const h = history();
      mkdirSync(join(h.root, 'bin'), { recursive: true });
      writeFileSync(join(h.root, 'bin', 'ps'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
      const execution = runStep(h, step(job, name), {
        GATE_MODE: 'affected',
        GATE_BASE: h.base,
        RUNTIME_STATUS: status,
      });
      expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(
        Number(status),
      );
      const { lines } = headroomLog(await Bun.file(join(h.root, 'nx-gate.log')).text());
      expect(
        lines.some((line) => line.startsWith('runtime headroom sample unavailable utc=')),
      ).toBe(true);
      expect(lines.some((line) => line.startsWith('runtime headroom end unavailable utc='))).toBe(
        true,
      );
      expect(
        lines.some((line) => line.startsWith(`runtime phase end partition=${partition}`)),
      ).toBe(true);
    }
    // The wrapper's copy, read by the end record without changing the gate status:
    // - an absent pids.events leaves it malformed: `unavailable`;
    // - an absent pids.peak is recorded in it as `pidsPeak=unavailable`, the counts still stand;
    // - a killed wrapper never writes it: `absent`, and the step reports the kill's 137.
    // Proof (2026-11-21): accepting any copy text printed `pidsEventsMax=`; reading pids.peak
    // without its existence check failed the absent-peak case; dropping the empty-copy branch
    // printed `unavailable` for the killed wrapper.
    for (const [status, fixture, env, expected, code] of [
      ['0', { pidsEventsMax: null }, {}, 'runtime headroom scope events unavailable', 0],
      ['7', { pidsEventsMax: null }, {}, 'runtime headroom scope events unavailable', 7],
      [
        '0',
        { pidsPeak: null },
        {},
        'runtime headroom scope events pidsEventsMax=0 memoryEventsOomKill=0 pidsPeak=unavailable',
        0,
      ],
      ['0', {}, { KILL_SCOPE_WRAPPER: '1' }, 'runtime headroom scope events absent', 137],
    ] as const) {
      const h = history();
      const execution = runStep(
        h,
        step(job, name),
        { GATE_MODE: 'affected', GATE_BASE: h.base, RUNTIME_STATUS: status, ...env },
        fixture,
      );
      expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(code);
      const { lines } = headroomLog(await Bun.file(join(h.root, 'nx-gate.log')).text());
      expect(lines, expected).toContain(expected);
      expect(
        lines.some(
          (line) =>
            line.startsWith(`runtime phase end partition=${partition} `) &&
            line.endsWith(` exit=${String(code)}`),
        ),
        expected,
      ).toBe(true);
      expect(lines.some((line) => line.startsWith('runtime headroom kernel oom since=@'))).toBe(
        true,
      );
    }
    // The start record is strict: a missing tool fails before any gate work.
    const h = history();
    mkdirSync(join(h.root, 'bin'), { recursive: true });
    writeFileSync(join(h.root, 'bin', 'free'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const execution = runStep(h, step(job, name), { GATE_MODE: 'affected', GATE_BASE: h.base });
    expect(execution.invocation.exitCode).not.toBe(0);
    expect(await execution.calls.text()).not.toContain('ci-run-runtime.ts');
  },
);

test.each([
  'remote-model',
  'remote-model-continuation',
  'remote-source',
  'remote-source-restoration',
  'remote-participant-policy',
  'remote-complete-activation',
  'remote-storage',
])(
  'actual model matrix shell dispatches %s with its immutable merge base and status',
  async (partition) => {
    for (const mode of ['affected', 'full']) {
      const h = history();
      const execution = runStep(h, step('gate_remote_model', 'Remote isolated leaf — test'), {
        GATE_MODE: mode,
        GATE_BASE: mode === 'affected' ? h.base : '',
        EVENT_NAME: mode === 'affected' ? 'pull_request' : 'workflow_dispatch',
        RUNTIME_PARTITION: partition,
        RUNTIME_STATUS: '23',
      });
      expect(execution.invocation.exitCode).toBe(23);
      expect(await execution.calls.text()).toContain(
        `ci-run-runtime.ts ${partition} ${mode === 'affected' ? h.base + ' ' : ' '}${h.merge} . ${mode}`,
      );
      const phase = await Bun.file(join(h.root, 'nx-gate.log')).text();
      expect(phase).toContain(`runtime phase start partition=${partition} head=${h.merge}`);
      expect(phase).toContain(`runtime phase end partition=${partition}`);
      expect(phase).toContain('exit=23');
    }
  },
);

// A-CI-LEAF-RECORDER-1 (R5-32): a lost tool-fleet runner keeps nothing, so on that leaf alone a
// recorder outside the scope PATCHes one comment on issue #963 every 45 s (A-CI-LEAF-RECORDER-2)
// and once after the phase. These run the production step with a fake `gh` and the tick rewritten
// to one second, or the production tick under a scaled `sleep`.
const heavyStep = () => step('gate_heavy', 'Heavy leaf — test, lint, typecheck, build');
const recorderGate = 'if [ "$partition" = heavy-tool-fleet ]; then\n';

function recorderBodies(calls: readonly GhCall[]) {
  return calls.map(({ args }) => {
    const field = args.find((arg) => arg.startsWith('body='));
    if (field === undefined) throw new Error(`gh call without a body: ${args.join(' ')}`);
    return field.slice('body='.length);
  });
}

function recorderOutput(
  h: ReturnType<typeof history>,
  lines: readonly string[],
  name = 'runtime-output',
): string {
  const path = join(h.root, name);
  writeFileSync(path, lines.map((line) => `${line}\n`).join(''));
  return path;
}

/** One `### title` section's text inside a #963 body, without its fences. */
function recorderSection(body: string, title: string): string {
  const opening = `### ${title}\n\n\`\`\`\`text\n`;
  const start = body.indexOf(opening);
  if (start === -1) throw new Error(`#963 body without section ${title}`);
  const from = start + opening.length;
  return body.slice(from, body.indexOf('\n````', from) + 1);
}

const sinceTitle = 'nx-gate.log lines since the previous tick';
const recentTitle = 'processes started in the last 60 s';

// Proof (2026-11-21): dropping the stored comment id (every tick created a comment) failed the
// single-create and PATCH-id assertions; dropping `unset GH_TOKEN` put the token in the runtime's
// ledger line; dropping the final publish left no `state=final` body. Proof (2026-11-22): dropping
// the disk section or its per-path `unavailable` line failed the disk assertions, and dropping the
// header's cloud field failed the header assertion. Proof (2026-11-22, A-CI-LEAF-RECORDER-2):
// dropping the network section, the previous tick's counters, the recent processes' 60 s filter
// or their own-tree exclusion each failed this test, and so did dropping the journal section,
// its filter, or the 120-character argument cut.
test('the tool-fleet leaf recorder keeps one living comment on #963', async () => {
  const h = history();
  const dockerRoot = join(h.root, 'docker');
  const execution = runStep(
    h,
    heavyStep(),
    {
      GATE_MODE: 'affected',
      GATE_BASE: h.base,
      GH_TOKEN: 'recorder-test-token',
      RUNTIME_SLEEP: '6',
      RUNTIME_OUTPUT: recorderOutput(h, [
        'tool-fleet:test',
        '(pass) registry native source > compiles the pthread fixture [812.00ms]',
        'src/lab-guest-control.test.ts:',
      ]),
    },
    { recorderInterval: 1, disk: { '/mnt': 'absent' } },
  );
  expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(0);
  const calls = execution.ghCalls();
  const bodies = recorderBodies(calls);
  expect(calls[0]?.args.slice(0, 2)).toEqual(['api', 'repos/owner/repo/issues/963/comments']);
  expect(calls[0]?.args.slice(-2)).toEqual(['--jq', '.id']);
  const patches = calls.slice(1);
  expect(patches.length).toBeGreaterThanOrEqual(3);
  for (const patch of patches) {
    expect(patch.args.slice(0, 4)).toEqual([
      'api',
      '-X',
      'PATCH',
      'repos/owner/repo/issues/comments/4242',
    ]);
    expect(patch.args.at(-1)).toBe('--silent');
  }
  expect(calls.every(({ token }) => token === 'recorder-test-token')).toBe(true);
  const ledger = await execution.scopeCalls.text();
  expect(ledger).toContain('nodeOptions=--max-old-space-size=4096 ghToken=\n');
  expect(ledger).toContain('journalctl -k --since -3min --no-pager -o short\n');
  for (const body of bodies) {
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(61440);
    expect(body).toStartWith('## tool-fleet leaf recorder (A-CI-LEAF-RECORDER-2)\n\n');
    expect(body).toContain(
      `\nrun=44797660117 job=gate_heavy attempt=2 head=${h.merge} partition=heavy-tool-fleet ${azureCloud}\n`,
    );
    expect(body).toMatch(/\nstate=(tick [0-9]+|final) utc=\S+ phaseElapsedSeconds=[0-9]+\n/);
    expect(body).toMatch(/### headroom samples, last 3\n\n````text\nruntime headroom sample utc=/);
    // A-CI-LEAF-DISK-1: df -h per path; the absent /mnt reads `unavailable`, the others real df.
    const disk = body.slice(body.indexOf('### disk\n\n````text\n'));
    expect(disk).toStartWith(`### disk\n\n\`\`\`\`text\ndockerRootDir=${dockerRoot}\n/ `);
    expect(disk.split('\n')[4]).toMatch(
      /^\/ +[0-9.]+[KMGTP]? +[0-9.]+[KMGTP]? +[0-9.]+[KMGTP]? +[0-9]+% \/$/,
    );
    expect(disk).toContain('\n/mnt unavailable\n');
    expect(disk).toMatch(new RegExp(`\\n${sampleTmp} +\\S+ +\\S+ +\\S+ +[0-9]+% \\S+\\n`));
    expect(disk).toMatch(
      new RegExp(`\\n${dockerRoot} +\\S+ +\\S+ +\\S+ +[0-9]+% \\S+\\n\`\`\`\`\\n`),
    );
    expect(body).toMatch(/### processes by RSS\n\n````text\n +PID +PPID +ELAPSED +RSS COMMAND\n/);
    expect(body).toMatch(/### task count\n\n````text\n[1-9][0-9]*\n````/);
    expect(body).toContain(
      '### kernel, last 3 minutes\n\n````text\n2026-11-21T04:40:00+0000 runner kernel: audit',
    );
    const since = recorderSection(body, sinceTitle);
    expect(since).toMatch(/^bytes=[0-9]+\.\.[0-9]+ newLines=[0-9]+ shown=[0-9]+\n/);
    const tail = since.split('\n');
    expect(tail.some((line) => line.startsWith('runtime headroom sample '))).toBe(false);
    expect(tail.some((line) => line.startsWith('runtime recorder '))).toBe(false);
    // A-CI-LEAF-RECORDER-2: the network probes, each under its label, from the fakes.
    const network = recorderSection(body, 'network');
    expect(network).toStartWith(
      '$ ip -br addr\nlo               UNKNOWN        127.0.0.1/8\neth0             UP             10.1.0.4/16\n$ ip -br link\n',
    );
    expect(network).toContain('\n$ ip route\ndefault via 10.1.0.1 dev eth0 proto dhcp');
    expect(network).toContain('\n$ ss -s\nTotal: 187\nTCP:   9 (estab 4');
    expect(network).toContain('\n$ resolvectl status (20 lines), else /etc/resolv.conf\n');
    expect(network).toContain('\n$ sudo -n iptables -S, rule lines\n3\n');
    expect(network).toContain('\n$ sudo -n nft list ruleset, lines\nunavailable\n');
    expect(network).toContain(
      '\ndefaultInterface=eth0\neth0 (default) rxBytes=123456789 rxPackets=4242 rxErrs=0 rxDrop=1 txBytes=98765432 txPackets=3131 txErrs=0 txDrop=0\n',
    );
    expect(network).not.toContain('\nlo rxBytes=');
    // The journal keeps the host's network, runner and OOM lines and drops the rest.
    expect(recorderSection(body, 'journal, last 3 minutes')).toBe(
      '2026-11-21T04:41:00+0000 runner kernel: Out of memory: Killed process 4242 (bun) total-vm:9000000kB\n2026-11-21T04:42:00+0000 runner systemd-networkd[612]: eth0: Lost carrier\n',
    );
    const recent = recorderSection(body, recentTitle).trimEnd().split('\n');
    expect(recent[0]).toMatch(/^ +PID +PPID +ELAPSED +COMMAND +COMMAND$/);
    // Arguments are cut at 120 characters from where the header's args column starts; the
    // zero-width space the mention guard adds after each `@` comes after the cut.
    const args = (recent[0] ?? '').lastIndexOf('COMMAND');
    for (const row of recent.slice(1))
      expect(row.replaceAll('\u200b', '').length).toBeLessThanOrEqual(args + 120);
    // Only processes under 60 s old, and none of the recorder's own pipeline.
    // A host process whose arguments carry a secret's shape is replaced whole; the rest show age.
    for (const row of recent.slice(1))
      if (row !== '[line redacted: a secret shape]')
        expect(row).toMatch(/^ *[0-9]+ +[0-9]+ +[0-5]?[0-9] /);
    expect(recent.filter((row) => row.includes('ps -eo pid,ppid,etimes,comm,args'))).toEqual([]);
  }
  // The second and later ticks show the previous tick's counters beside their own.
  expect(
    bodies
      .slice(1)
      .every((body) =>
        recorderSection(body, 'network').includes('\nprevious tick:\neth0 (default) rxBytes='),
      ),
  ).toBe(true);
  expect(recorderSection(bodies[0] ?? '', 'network')).not.toContain('previous tick:');
  // A test's helper started under 60 s ago is named: here the runtime's own `sleep 6`.
  expect(
    bodies.some((body) =>
      /^ *[0-9]+ +[0-9]+ +[0-5]?[0-9] +sleep +\/usr\/bin\/sleep 6$/m.test(
        recorderSection(body, recentTitle),
      ),
    ),
  ).toBe(true);
  expect(bodies.filter((body) => body.includes('\nstate=tick ')).length).toBeGreaterThanOrEqual(3);
  // A mid-phase tick names the running test from the runtime's output.
  expect(
    bodies.some(
      (body) =>
        body.includes('\nstate=tick ') && body.includes('(pass) registry native source > compiles'),
    ),
  ).toBe(true);
  const final = bodies.at(-1) ?? '';
  expect(final).toContain('\nstate=final ');
  expect(final).toMatch(
    /### phase end and scope events\n\n````text\nruntime phase end partition=heavy-tool-fleet utc=\S+ elapsedSeconds=[0-9]+ exit=0\nruntime headroom scope events pidsEventsMax=0 memoryEventsOomKill=0 pidsPeak=90\n````/,
  );
  expect(bodies.filter((body) => body.includes('\nstate=final ')).length).toBe(1);
  const { lines } = headroomLog(await Bun.file(join(h.root, 'nx-gate.log')).text());
  expect(lines).toContain('runtime recorder comment id=4242 issue=963');
  expect(lines).toContain('runtime recorder stopped kill=0 wait=0');
  const recorder = /^runtime recorder pid=([0-9]+) issue=963 interval=1s$/.exec(
    lines.find((line) => line.startsWith('runtime recorder pid=')) ?? '',
  );
  expect(recorder).not.toBeNull();
  expect(isRunning(Number(recorder?.[1]))).toBe(false);
  expect(lines.some((line) => line.startsWith('runtime recorder unavailable'))).toBe(false);
}, 60_000);

// A-CI-LEAF-RECORDER-2. Proof (2026-11-22): `recorder_interval=120` asked for no 45 s nap, and
// with those assertions set aside posted 3 ticks in the 8 s window. At least 4 leaves room for a
// gate host's 2.5–4× slowdown; the sleep log is the deterministic negative.
test('the tool-fleet leaf recorder ticks every 45 s', () => {
  const h = history();
  const sleeps = join(h.root, 'sleep-calls');
  const execution = runStep(h, heavyStep(), {
    GATE_MODE: 'affected',
    GATE_BASE: h.base,
    // Every sleep runs 45 times faster: the 45 s tick takes 1 s and the 360 s phase 8 s.
    SLEEP_SCALE: '45',
    SLEEP_CALLS: sleeps,
    RUNTIME_SLEEP: '360',
  });
  expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(0);
  const requested = readFileSync(sleeps, 'utf8').split('\n');
  expect(requested).toContain('45');
  expect(requested).not.toContain('120');
  const ticks = recorderBodies(execution.ghCalls()).filter((body) =>
    body.includes('\nstate=tick '),
  );
  expect(ticks.length).toBeGreaterThanOrEqual(4);
  expect(ticks.length).toBeLessThanOrEqual(10);
}, 60_000);

// Proof (2026-11-22): without the offset update every tick reposted the log from byte 0, so the
// late tick held the early lines and the byte ranges did not join.
test('each tick posts only the nx-gate.log lines written since the previous tick', () => {
  const h = history();
  const execution = runStep(
    h,
    heavyStep(),
    {
      GATE_MODE: 'affected',
      GATE_BASE: h.base,
      RUNTIME_OUTPUT: recorderOutput(h, [
        'tool-fleet: ✓ early test one [1.00ms]',
        'tool-fleet: ✓ early test two [1.00ms]',
      ]),
      RUNTIME_SLEEP: '3',
      RUNTIME_LATER_OUTPUT: recorderOutput(h, ['tool-fleet: ✓ late test one [1.00ms]'], 'later'),
      RUNTIME_LATER_SLEEP: '3',
    },
    { recorderInterval: 1 },
  );
  expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(0);
  const sections = recorderBodies(execution.ghCalls()).map((body) =>
    recorderSection(body, sinceTitle),
  );
  // The byte ranges join: each tick starts where the previous one stopped.
  const ranges = sections.map((section) => {
    const range = /^bytes=([0-9]+)\.\.([0-9]+) /.exec(section);
    if (range === null) throw new Error(`no byte range in ${section}`);
    return [Number(range[1]), Number(range[2])] as const;
  });
  expect(ranges[0]?.[0]).toBe(0);
  for (const [index, [from]] of ranges.entries())
    if (index > 0) expect(from).toBe(ranges[index - 1]?.[1] ?? -1);
  const fresh = sections.filter((section) => !section.includes(' newLines=0 '));
  const early = fresh.filter((section) => section.includes('early test two'));
  expect(early).toHaveLength(1);
  expect(early[0]).toEndWith('tool-fleet: ✓ early test two [1.00ms]\n');
  expect(early[0]).not.toContain('late test');
  const late = fresh.filter((section) => section.includes('late test one'));
  expect(late).toHaveLength(1);
  expect(late[0]).not.toContain('early test');
  // A tick between the bursts has nothing new and repeats the last earlier line.
  const quiet =
    'newLines=0 shown=0\nno new lines since the previous tick; the last earlier line:\ntool-fleet: ✓ early test two [1.00ms]\n';
  expect(sections.some((section) => section.endsWith(quiet))).toBe(true);
}, 60_000);

// Proof (2026-11-22): without the 200-line cap the tick posted 258 lines, all 250 among them;
// the earlier byte cap (`tail -c 40960` after counting) said `shown=200` while 118 lines were
// posted, the first a fragment (review probe); dropping the byte condition from the whole-line
// trim posted 200 wide lines past the body cap, so no tick showed the last one. Proof
// (2026-11-22): without `LC_ALL=C` on the trim's awk, gawk under the runner's LANG=C.UTF-8
// counted the 3-byte ✓ as one character: hosted run 44991572202 (job 137113719053) posted 41154
// bytes, and locally gawk 5.2.1 first on PATH failed the LANG=C.UTF-8 case with the same 41154.
// mawk counts bytes in every locale, so on a mawk host only the hosted runs exercise it.
test('a tick posts at most the last 200 new lines that fit 40960 bytes, in any locale', () => {
  // A hosted runner sets LANG and leaves LC_ALL unset, so the step's `local LC_ALL=C` is not
  // exported to awk; an exported LC_ALL would be, and would hide the fault.
  for (const [wide, name, locale] of [
    [false, 'cap line', 'LANG=C.UTF-8'],
    [true, 'wide line', 'LANG=C.UTF-8'],
    [true, 'wide line', 'LC_ALL=C.UTF-8'],
    [true, 'wide line', 'LC_ALL=C'],
  ] as const) {
    const [variable, value] = locale.split('=');
    const h = history();
    const execution = runStep(
      h,
      heavyStep(),
      {
        GATE_MODE: 'affected',
        GATE_BASE: h.base,
        RUNTIME_OUTPUT: recorderOutput(
          h,
          Array.from(
            { length: 250 },
            (_, index) =>
              `tool-fleet: ✓ ${name} ${String(index + 1)}${wide ? ` ${'x'.repeat(330)}` : ''}`,
          ),
        ),
        RUNTIME_SLEEP: '2',
        LC_ALL: variable === 'LC_ALL' ? value : undefined,
        LANG: value,
      },
      { recorderInterval: 1 },
    );
    expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(0);
    const capped = recorderBodies(execution.ghCalls())
      .map((body) => recorderSection(body, sinceTitle))
      .filter(
        (section) =>
          !section.includes(' newLines=0 ') && section.includes(`${name} 250${wide ? ' ' : '\n'}`),
      );
    expect(capped, `${name} ${locale}`).toHaveLength(1);
    const [header, ...lines] = (capped[0] ?? '').trimEnd().split('\n');
    const shown = Number(/ newLines=2[5-9][0-9] shown=([0-9]+)$/.exec(header)?.[1]);
    expect(lines, name).toHaveLength(shown);
    // Whole, consecutive lines ending at the last one.
    for (const [index, line] of lines.entries())
      expect(line).toBe(
        `tool-fleet: ✓ ${name} ${String(251 - shown + index)}${wide ? ` ${'x'.repeat(330)}` : ''}`,
      );
    if (wide) {
      expect(shown).toBeLessThan(200);
      expect(
        Buffer.byteLength(lines.map((line) => `${line}\n`).join('')),
        locale,
      ).toBeLessThanOrEqual(40960);
      // One more line would not have fitted.
      expect(Buffer.byteLength(lines.map((line) => `${line}\n`).join('')) + 360).toBeGreaterThan(
        40960,
      );
    } else expect(shown).toBe(200);
  }
}, 60_000);

// Proof (2026-11-22): without recorder_probe's `unavailable` branch the absent tools printed
// nothing under their labels; an absent journalctl reads unavailable in the journal section.
test('an absent network tool reads unavailable and leaves the gate status unchanged', () => {
  for (const status of ['0', '7']) {
    const h = history();
    const execution = runStep(
      h,
      heavyStep(),
      { GATE_MODE: 'affected', GATE_BASE: h.base, RUNTIME_STATUS: status, RUNTIME_SLEEP: '1' },
      { recorderInterval: 1, network: 'absent', absent: ['journalctl'] },
    );
    expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(
      Number(status),
    );
    const bodies = recorderBodies(execution.ghCalls());
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    for (const body of bodies) {
      const network = recorderSection(body, 'network');
      for (const label of [
        'ip -br addr',
        'ip -br link',
        'ip route',
        'ss -s',
        'sudo -n iptables -S, rule lines',
        'sudo -n nft list ruleset, lines',
      ])
        expect(network).toContain(`$ ${label}\nunavailable\n`);
      expect(network).toMatch(/\n\$ \S+net-dev counters\nunavailable\n$/);
      expect(recorderSection(body, 'journal, last 3 minutes')).toBe('unavailable\n');
    }
  }
}, 60_000);

// Proof (2026-11-21): without the cap the final body was 92254 bytes; without the shape guard
// the bearer value was posted; matching the word `token` again redacted a third line; without the
// escape filter ESC bytes were posted, and without the `@` filter the mention.
test('the tool-fleet leaf recorder caps its body and replaces lines that look like secrets', () => {
  const h = history();
  const sample = `runtime headroom sample utc=2026-11-21T00:00:00Z memAvailableKiB=1 ${'x'.repeat(30000)}`;
  const execution = runStep(h, heavyStep(), {
    GATE_MODE: 'affected',
    GATE_BASE: h.base,
    RUNTIME_OUTPUT: recorderOutput(h, [
      sample,
      sample,
      sample,
      'issued wbs_mk_0123456789abcdef',
      '(pass) a test whose last line stays',
    ]),
  });
  expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(0);
  const bodies = recorderBodies(execution.ghCalls());
  const final = bodies.at(-1) ?? '';
  expect(final).toContain('\nstate=final ');
  for (const body of bodies) expect(Buffer.byteLength(body)).toBeLessThanOrEqual(61440);
  expect(final).toEndWith('\n\n[truncated to the 61440-byte cap]');
  const small = history();
  const uncapped = runStep(
    small,
    heavyStep(),
    {
      GATE_MODE: 'affected',
      GATE_BASE: small.base,
      RUNTIME_SLEEP: '1.5',
      RUNTIME_OUTPUT: recorderOutput(small, [
        // The shapes a GitHub token, a bearer header and a WBS machine key take.
        `header Authorization: Bearer ${'a'.repeat(24)}.sig`,
        `issued wbs_mk_0123456789abcdef and ghp_${'B'.repeat(36)}`,
        'custody before readonly server effects: token',
        'owner @someone asked',
        '\u001b[1m\u001b[36mtool-fleet:\u001b[39m\u001b[22m \u001b[32m✓\u001b[39m a test whose last line stays',
      ]),
    },
    { recorderInterval: 1 },
  );
  expect(uncapped.invocation.exitCode, uncapped.invocation.stderr.toString()).toBe(0);
  const plain = recorderBodies(uncapped.ghCalls());
  for (const body of plain) {
    expect(body).not.toContain('a'.repeat(24));
    expect(body).not.toContain('wbs_mk_0123');
    expect(body).not.toContain('B'.repeat(36));
    expect(body).not.toContain('\u001b');
    expect(body).not.toContain('@someone');
    expect(body).not.toContain('[truncated');
  }
  // A mid-phase tick, whose log tail holds the runtime's output with its escapes stripped.
  const tick =
    plain.find((body) => body.includes('tool-fleet: ✓ a test whose last line stays\n')) ?? '';
  expect(tick).toContain('\nstate=tick ');
  expect(tick.split('[line redacted: a secret shape]').length - 1).toBe(2);
  // A word is not a secret: such lines cluster in real tool-fleet output and must stay.
  expect(tick).toContain('custody before readonly server effects: token\n');
  expect(tick).toContain('owner @\u200bsomeone asked\n');
}, 60_000);

// Proof (2026-11-21): without the final publish's `||` fallback a 403 ended the step 1; without
// the `unavailable` marker the final report retried the create; dropping the `patch failed` line
// failed its count.
test('recorder trouble is logged once and leaves the gate status unchanged', async () => {
  for (const status of ['0', '7']) {
    const h = history();
    const execution = runStep(
      h,
      heavyStep(),
      {
        GATE_MODE: 'affected',
        GATE_BASE: h.base,
        RUNTIME_STATUS: status,
        GH_CREATE_STATUS: '1',
        RUNTIME_SLEEP: '4',
      },
      { recorderInterval: 1 },
    );
    expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(
      Number(status),
    );
    expect(execution.ghCalls()).toHaveLength(1);
    const { lines } = headroomLog(await Bun.file(join(h.root, 'nx-gate.log')).text());
    expect(lines.filter((line) => line.startsWith('runtime recorder unavailable'))).toEqual([
      'runtime recorder unavailable: HTTP 403',
    ]);
    expect(lines).toContain('runtime recorder final not posted');
    expect(
      lines.some(
        (line) =>
          line.startsWith(`runtime phase end partition=heavy-tool-fleet `) &&
          line.endsWith(` exit=${status}`),
      ),
    ).toBe(true);
  }
  for (const status of ['0', '7']) {
    const h = history();
    const execution = runStep(
      h,
      heavyStep(),
      {
        GATE_MODE: 'affected',
        GATE_BASE: h.base,
        RUNTIME_STATUS: status,
        GH_PATCH_STATUS: '1',
        RUNTIME_SLEEP: '4',
      },
      { recorderInterval: 1 },
    );
    expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(
      Number(status),
    );
    const calls = execution.ghCalls();
    expect(calls.filter(({ args }) => args[1] !== '-X')).toHaveLength(1);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    const { lines } = headroomLog(await Bun.file(join(h.root, 'nx-gate.log')).text());
    expect(lines.filter((line) => line === 'runtime recorder patch failed: HTTP 502').length).toBe(
      calls.length - 1,
    );
  }
}, 60_000);

// Proof (2026-11-21): with the partition gate replaced by `if :; then`, the workspace step called
// gh.
test('only the tool-fleet leaf runs the recorder', async () => {
  for (const [name, env] of [
    ['the workspace step', {}],
    ['the tool-devsync leaf', { RUNTIME_PARTITION: 'heavy-tool-devsync' }],
    ['the wbs-core leaf', { RUNTIME_PARTITION: 'heavy-wbs-core' }],
  ] as const) {
    const h = history();
    const execution = runStep(
      h,
      name === 'the workspace step'
        ? step('gate_workspace', 'Gate — test, lint, typecheck, build')
        : heavyStep(),
      { GATE_MODE: 'affected', GATE_BASE: h.base, GH_TOKEN: 'recorder-test-token', ...env },
    );
    expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(0);
    expect(execution.ghCalls(), name).toEqual([]);
    const log = await Bun.file(join(h.root, 'nx-gate.log')).text();
    expect(log, name).not.toContain('runtime recorder');
    expect(log, name).toContain('runtime phase end partition=');
    expect(await execution.scopeCalls.text(), name).toContain('ghToken=\n');
  }
  // The gate is one token, held once in each step text.
  for (const shard of ['gate_workspace', 'gate_heavy'] as const) {
    expect(
      step(
        shard,
        shard === 'gate_heavy'
          ? 'Heavy leaf — test, lint, typecheck, build'
          : 'Gate — test, lint, typecheck, build',
      ).split(recorderGate),
    ).toHaveLength(2);
  }
}, 60_000);
