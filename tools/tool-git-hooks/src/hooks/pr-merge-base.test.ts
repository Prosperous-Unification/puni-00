import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  };
  for (const [name, text] of Object.entries(chain))
    if (!absent.includes(name)) writeFileSync(join(bin, name), text, { mode: 0o755 });
}

function runStep(
  h: ReturnType<typeof history>,
  script: string,
  env: Record<string, string | undefined> = {},
  absent: readonly string[] = [],
) {
  const bin = join(h.root, 'bin');
  mkdirSync(bin, { recursive: true });
  symlinkSync(join(ROOT, 'tools'), join(h.root, 'tools'));
  writeScopeChain(bin, absent);
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
    printf 'runtime environment sentinel=%s\\n' "\${GATE_ENVIRONMENT_SENTINEL:-}" >> "$SCOPE_CALLS"
    exit "\${RUNTIME_STATUS:-0}" ;;
esac
exec '${process.execPath}' "$@"
`,
    { mode: 0o755 },
  );
  const output = join(h.root, 'output');
  const calls = join(h.root, 'calls');
  const scopeCalls = join(h.root, 'scope-calls');
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
      // Matrix values the shared runtime steps read: the remote-model leaf, and for the heavy
      // leaf step (the one that reads PHASE_MINUTES) the tool-fleet leaf with its 75m phase.
      RUNTIME_PARTITION: script.includes('phase_limit="$PHASE_MINUTES"')
        ? 'heavy-tool-fleet'
        : 'remote-model',
      PHASE_MINUTES: '75',
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
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
// scope properties, the probe before the gate, the restored identity and the restored environment.
// Proof (2026-11-21): dropping `-p OOMPolicy=continue` or `-p MemorySwapMax=0`, the setpriv line,
// or `env -i "${gate_environment[@]}"` (the runtime then saw an empty sentinel)
// failed this test; a 137 from the capped phase must reach the phase end record and the step.
test.each(headroomShards)(
  '%s step runs its Nx phase in a MemoryMax=12G scope as this user with its environment',
  async (job, name, partition) => {
    const id = (flag: string) =>
      Bun.spawnSync(['id', flag], { stdout: 'pipe' }).stdout.toString().trim();
    const sentinel = 'spaced value=with\tseparators';
    for (const status of ['0', '137']) {
      const h = history();
      const execution = runStep(h, step(job, name), {
        GATE_MODE: 'affected',
        GATE_BASE: h.base,
        RUNTIME_STATUS: status,
        GATE_ENVIRONMENT_SENTINEL: sentinel,
      });
      expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(
        Number(status),
      );
      const ledger = (await execution.scopeCalls.text()).split('\n').filter(Boolean);
      const unit = /--unit=(ci-gate-\S+-[0-9]+)-probe /.exec(ledger[0] ?? '')?.[1] ?? '';
      expect(unit, ledger.join('\n')).toMatch(new RegExp(`^ci-gate-${partition}-[0-9]+$`));
      const properties = '-p MemoryMax=12G -p MemorySwapMax=0 -p OOMPolicy=continue';
      expect(ledger).toEqual([
        `systemd-run --scope --quiet --collect --unit=${unit}-probe ${properties} -- true`,
        `systemd-run --scope --quiet --collect --unit=${unit} ${properties} -- setpriv`,
        `setpriv --reuid=${id('-u')} --regid=${id('-g')} --groups=${id('-G').replaceAll(' ', ',')} -- env`,
        `runtime environment sentinel=${sentinel}`,
      ]);
      expect(await execution.calls.text()).toContain(
        `ci-run-runtime.ts ${partition} ${h.base} ${h.merge} . affected`,
      );
      const log = await Bun.file(join(h.root, 'nx-gate.log')).text();
      expect(log).toContain(` memoryMax=12G scope=${unit}.scope\n`);
      expect(log).toMatch(
        new RegExp(`runtime phase end partition=${partition} .* exit=${status}\n`),
      );
    }
  },
);

// Proof (2026-11-21): with the probe deleted, an absent systemd-run reached ci-run-runtime.ts
// (the runtime call was recorded) and the step exited with the chain's status, not a refusal.
test.each(headroomShards)(
  '%s step refuses before runtime work when the memory scope cannot be opened',
  async (job, name, partition) => {
    for (const [fault, absent, env] of [
      ['absent systemd-run', ['systemd-run'], {}],
      ['sudo without a password', [], { SUDO_STATUS: '1' }],
    ] as const) {
      const h = history();
      const execution = runStep(
        h,
        step(job, name),
        { GATE_MODE: 'affected', GATE_BASE: h.base, ...env },
        absent,
      );
      expect(execution.invocation.exitCode, fault).toBe(1);
      expect(execution.invocation.stderr.toString(), fault).toContain(
        'A-CI-LEAF-MEMORYMAX-1: cannot open a MemoryMax=12G systemd scope',
      );
      expect(await execution.calls.text(), fault).not.toContain('ci-run-runtime.ts');
      const log = await Bun.file(join(h.root, 'nx-gate.log')).text();
      expect(log, fault).toContain(`runtime headroom start partition=${partition} `);
      expect(log, fault).toContain('refusing to run the gate uncapped');
      expect(log, fault).not.toContain('runtime headroom sampler pid=');
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
          ` imageOS=ubuntu24 imageVersion=20261116\\.376\\.1 os=.+ heapSizeLimit=[1-9][0-9]* memoryMax=12G scope=ci-gate-${partition}-[0-9]+\\.scope$`,
        ),
      );
      expect(
        lines.filter((line) =>
          /^runtime headroom sample utc=\S+ memAvailableKiB=[0-9]+ node=[0-9]+ bun=[0-9]+ topRssKiB=[0-9]+ top=\S+$/.test(
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
