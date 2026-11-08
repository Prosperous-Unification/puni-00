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
] as const;
function runtimePartition(job: string): string {
  if (job === 'gate_remote') return 'remote-rest';
  if (job === 'gate_remote_model') return 'remote-model';
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

function runStep(
  h: ReturnType<typeof history>,
  script: string,
  env: Record<string, string | undefined> = {},
) {
  const bin = join(h.root, 'bin');
  mkdirSync(bin, { recursive: true });
  symlinkSync(join(ROOT, 'tools'), join(h.root, 'tools'));
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
    printf '{"schemaVersion":1,"base":"%s","head":"%s","mode":"affected","twilight":"skip","projects":["wbs-fe-01"],"workspaceProjects":["wbs-fe-01"],"partitions":{"backend":[],"remote":[],"frontend":["wbs-fe-01"],"workspace":[]},"twilightProjects":[],"reasons":["test boundary"]}\\n' "$3" "$4"
    exit 0 ;;
  *ci-run-runtime.ts*) printf '%s\\n' "$*" >> "$NX_CALLS"; exit "\${RUNTIME_STATUS:-0}" ;;
esac
exec '${process.execPath}' "$@"
`,
    { mode: 0o755 },
  );
  const output = join(h.root, 'output');
  const calls = join(h.root, 'calls');
  writeFileSync(output, '');
  writeFileSync(calls, '');
  const invocation = Bun.spawnSync(['bash', '-c', script], {
    cwd: h.root,
    env: {
      ...process.env,
      ...h.env,
      GITHUB_OUTPUT: output,
      NX_CALLS: calls,
      RUNTIME_PARTITION: 'remote-model',
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { invocation, output: Bun.file(output), calls: Bun.file(calls) };
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

test.each([
  'remote-model',
  'remote-model-continuation',
  'remote-source',
  'remote-source-restoration',
])(
  'actual model matrix shell dispatches %s with its immutable merge base and status',
  async (partition) => {
    const h = history();
    const execution = runStep(h, step('gate_remote_model', 'Remote isolated leaf — test'), {
      GATE_MODE: 'affected',
      GATE_BASE: h.base,
      RUNTIME_PARTITION: partition,
      RUNTIME_STATUS: '23',
    });
    expect(execution.invocation.exitCode).toBe(23);
    expect(await execution.calls.text()).toContain(
      `ci-run-runtime.ts ${partition} ${h.base} ${h.merge} . affected`,
    );
    const phase = await Bun.file(join(h.root, 'nx-gate.log')).text();
    expect(phase).toContain(`runtime phase start partition=${partition} head=${h.merge}`);
    expect(phase).toContain(`runtime phase end partition=${partition}`);
    expect(phase).toContain('exit=23');
  },
);
