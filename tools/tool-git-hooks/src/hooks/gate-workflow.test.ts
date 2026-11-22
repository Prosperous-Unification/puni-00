import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { describe, expect, test } from 'bun:test';

import { HEAVY_TEST_PROJECTS } from './ci-runtime-partitions';

interface WorkflowStep {
  name?: string;
  env?: Record<string, string>;
  run?: string;
}

interface WorkflowJob {
  name?: string;
  if?: string;
  needs?: string | string[];
  'timeout-minutes'?: number | string;
  strategy?: unknown;
  steps?: WorkflowStep[];
}

interface Workflow {
  jobs?: Record<string, WorkflowJob>;
}

type JobResult = 'success' | 'failure' | 'cancelled' | 'skipped' | 'unknown';

interface GateNeeds {
  modeResult: JobResult | '';
  mode: string;
  docsResult: JobResult | '';
  twilight: string;
  workspaceResult: JobResult | '';
  checksResult: JobResult | '';
  backend: string;
  remote: string;
  frontend: string;
  heavy: string;
  backendResult: JobResult | '';
  remoteResult: JobResult | '';
  remoteModelResult: JobResult | '';
  frontendResult: JobResult | '';
  heavyResult: JobResult | '';
  twilightResult: JobResult | '';
}

const workflowPath = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'ci.yml',
);

const readWorkflow = (): Workflow => Bun.YAML.parse(readFileSync(workflowPath, 'utf8')) as Workflow;

const requireStep = (): WorkflowStep => {
  const step = readWorkflow().jobs?.['gate']?.steps?.find(
    ({ name }) => name === 'Require every gate shard',
  );
  expect(step, 'job `gate` has no `Require every gate shard` step').toBeDefined();
  return step ?? {};
};

/**
 * Runs the production `gate` reduction in bash with the `needs` values GitHub would inject,
 * so the verdict under test is the shipped script's exit status rather than its text.
 */
const reduceGate = (needs: GateNeeds): number => {
  const run = requireStep().run;
  if (run === undefined) throw new Error('the gate reduction step has no script');
  return Bun.spawnSync(['bash', '-c', run], {
    env: {
      PATH: process.env['PATH'] ?? '',
      MODE_RESULT: needs.modeResult,
      MODE: needs.mode,
      DOCS_RESULT: needs.docsResult,
      TWILIGHT: needs.twilight,
      WORKSPACE_RESULT: needs.workspaceResult,
      CHECKS_RESULT: needs.checksResult,
      BACKEND: needs.backend,
      REMOTE: needs.remote,
      FRONTEND: needs.frontend,
      HEAVY: needs.heavy,
      BACKEND_RESULT: needs.backendResult,
      REMOTE_RESULT: needs.remoteResult,
      REMOTE_MODEL_RESULT: needs.remoteModelResult,
      FRONTEND_RESULT: needs.frontendResult,
      HEAVY_RESULT: needs.heavyResult,
      TWILIGHT_RESULT: needs.twilightResult,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  }).exitCode;
};

const green: GateNeeds = {
  modeResult: 'success',
  mode: 'affected',
  docsResult: 'skipped',
  twilight: 'run',
  workspaceResult: 'success',
  checksResult: 'success',
  backend: 'run',
  remote: 'run',
  frontend: 'run',
  heavy: 'run',
  backendResult: 'success',
  remoteResult: 'success',
  remoteModelResult: 'success',
  frontendResult: 'success',
  heavyResult: 'success',
  twilightResult: 'success',
};

const notSuccess = ['failure', 'cancelled', 'skipped', ''] as const;

/**
 * `gate` reduces selection, docs and runtime jobs. It rejects failed, cancelled or absent
 * selected checks and permits skipped jobs only when the successful plan explains them.
 */
describe('the CI gate check', () => {
  test('waits on every shard even when one fails', () => {
    const gate = readWorkflow().jobs?.['gate'];

    expect(gate?.needs).toEqual([
      'gate_mode',
      'gate_docs',
      'gate_workspace',
      'gate_heavy',
      'gate_backend',
      'gate_remote',
      'gate_remote_model',
      'gate_frontend',
      'gate_checks',
      'gate_twilight',
    ]);
    expect(gate?.if).toBe('${{ always() }}');
    expect(requireStep().env).toEqual({
      MODE_RESULT: '${{ needs.gate_mode.result }}',
      MODE: '${{ needs.gate_mode.outputs.mode }}',
      DOCS_RESULT: '${{ needs.gate_docs.result }}',
      TWILIGHT: '${{ needs.gate_mode.outputs.twilight }}',
      WORKSPACE_RESULT: '${{ needs.gate_workspace.result }}',
      CHECKS_RESULT: '${{ needs.gate_checks.result }}',
      BACKEND: '${{ needs.gate_mode.outputs.backend }}',
      REMOTE: '${{ needs.gate_mode.outputs.remote }}',
      FRONTEND: '${{ needs.gate_mode.outputs.frontend }}',
      HEAVY: '${{ needs.gate_mode.outputs.heavy }}',
      BACKEND_RESULT: '${{ needs.gate_backend.result }}',
      REMOTE_RESULT: '${{ needs.gate_remote.result }}',
      REMOTE_MODEL_RESULT: '${{ needs.gate_remote_model.result }}',
      FRONTEND_RESULT: '${{ needs.gate_frontend.result }}',
      HEAVY_RESULT: '${{ needs.gate_heavy.result }}',
      TWILIGHT_RESULT: '${{ needs.gate_twilight.result }}',
    });
  });

  test('passes when every shard in scope succeeded', () => {
    expect(reduceGate(green)).toBe(0);
    expect(reduceGate({ ...green, mode: 'full' })).toBe(0);
    expect(
      reduceGate({
        ...green,
        mode: 'docs',
        docsResult: 'success',
        twilight: 'skip',
        workspaceResult: 'skipped',
        checksResult: 'skipped',
        backend: 'skip',
        remote: 'skip',
        frontend: 'skip',
        heavy: 'skip',
        backendResult: 'skipped',
        remoteResult: 'skipped',
        remoteModelResult: 'skipped',
        frontendResult: 'skipped',
        heavyResult: 'skipped',
        twilightResult: 'skipped',
      }),
    ).toBe(0);
    expect(reduceGate({ ...green, twilight: 'skip', twilightResult: 'skipped' })).toBe(0);
  });

  test('refuses unknown modes and unexplained docs executions', () => {
    for (const mode of ['', 'unknown']) expect(reduceGate({ ...green, mode })).not.toBe(0);
    for (const docsResult of ['success', 'failure', 'cancelled', ''] as const) {
      expect(reduceGate({ ...green, docsResult }), docsResult).not.toBe(0);
    }
  });

  test('requires docs success and explicitly skipped runtime shards for prose', () => {
    const docs: GateNeeds = {
      ...green,
      mode: 'docs',
      docsResult: 'success',
      twilight: 'skip',
      workspaceResult: 'skipped',
      checksResult: 'skipped',
      backend: 'skip',
      remote: 'skip',
      frontend: 'skip',
      heavy: 'skip',
      backendResult: 'skipped',
      remoteResult: 'skipped',
      remoteModelResult: 'skipped',
      frontendResult: 'skipped',
      heavyResult: 'skipped',
      twilightResult: 'skipped',
    };
    for (const docsResult of notSuccess)
      expect(reduceGate({ ...docs, docsResult }), docsResult).not.toBe(0);
    for (const field of [
      'workspaceResult',
      'checksResult',
      'backendResult',
      'remoteResult',
      'remoteModelResult',
      'frontendResult',
      'heavyResult',
      'twilightResult',
    ] as const) {
      for (const outcome of ['success', 'failure', 'cancelled', ''] as const) {
        expect(reduceGate({ ...docs, [field]: outcome }), `${field}/${outcome}`).not.toBe(0);
      }
    }
    for (const twilight of ['', 'run', 'unknown'])
      expect(reduceGate({ ...docs, twilight })).not.toBe(0);
  });

  test('refuses a workspace shard that did not succeed', () => {
    // Proof (2026-09-28): with `test "$WORKSPACE_RESULT" = success` deleted from ci.yml, this
    // failed on its first case, `failure`, exiting 0 — 4 passed / 1 failed.
    for (const workspaceResult of notSuccess) {
      expect(reduceGate({ ...green, workspaceResult }), workspaceResult).not.toBe(0);
    }
  });

  test('requires each selected dedicated runner and checks job, and proves every skip', () => {
    for (const field of [
      'backendResult',
      'remoteResult',
      'remoteModelResult',
      'frontendResult',
      'heavyResult',
      'checksResult',
    ] as const)
      for (const outcome of notSuccess)
        expect(reduceGate({ ...green, [field]: outcome }), `${field}/${outcome}`).not.toBe(0);
    for (const [selected, outcome] of [
      ['backend', 'backendResult'],
      ['remote', 'remoteResult'],
      ['frontend', 'frontendResult'],
      ['heavy', 'heavyResult'],
    ] as const) {
      expect(
        reduceGate({
          ...green,
          [selected]: 'skip',
          [outcome]: 'skipped',
          ...(selected === 'remote' ? { remoteModelResult: 'skipped' as const } : {}),
        }),
      ).toBe(0);
      expect(reduceGate({ ...green, [selected]: 'skip', [outcome]: 'success' })).not.toBe(0);
      expect(reduceGate({ ...green, [selected]: 'run', [outcome]: 'skipped' })).not.toBe(0);
      expect(reduceGate({ ...green, [selected]: '' })).not.toBe(0);
      expect(reduceGate({ ...green, mode: 'full', [selected]: 'skip' })).not.toBe(0);
    }
  });

  test('refuses a Twilight shard that did not succeed while in scope', () => {
    // Proof (2026-09-28): with the `run)` arm's test replaced by
    // `test "$TOOL_WIKI_RESULT" != failure` (now `TWILIGHT_RESULT`), this failed on `cancelled`
    // exiting 0 — 4 passed / 1 failed.
    for (const twilightResult of notSuccess) {
      expect(reduceGate({ ...green, twilightResult }), twilightResult).not.toBe(0);
    }
  });

  test('refuses a skip the scope job did not explain', () => {
    // `gate_twilight` is also skipped when `gate_mode` fails or is cancelled, so accepting a
    // skip on its own would pass a gate that decided nothing.
    // Proof (2026-09-28): with `test "$MODE_RESULT" = success` deleted, the failed-scope case
    // exited 0; with the `*)` arm's `exit 1` deleted, the empty-verdict case exited 0.
    for (const modeResult of notSuccess) {
      expect(
        reduceGate({ ...green, modeResult, twilight: 'skip', twilightResult: 'skipped' }),
        modeResult,
      ).not.toBe(0);
    }
    expect(reduceGate({ ...green, twilight: '', twilightResult: 'skipped' })).not.toBe(0);
    expect(reduceGate({ ...green, twilight: 'skip', twilightResult: 'success' })).not.toBe(0);
  });
});

/**
 * The CI copy of the private-nesting hook is what catches a `--no-verify` commit, so its step
 * script is run as shipped against scratch repositories rather than matched as text.
 */
describe('the CI private-nesting step', () => {
  const privateNestingStep = (): WorkflowStep => {
    const step = readWorkflow().jobs?.['gate_checks']?.steps?.find(
      ({ name }) => name === 'Private nesting',
    );
    expect(step, 'job `gate_checks` has no `Private nesting` step').toBeDefined();
    return step ?? {};
  };

  const runStep = (prepare: (root: string) => void): number => {
    const run = privateNestingStep().run;
    if (run === undefined) throw new Error('the Private nesting step has no script');
    const root = scratchSync('ci-private-nesting-');
    const git = (...args: string[]) => {
      const spawned = Bun.spawnSync(['git', '-C', root, ...args], { stderr: 'pipe' });
      if (spawned.exitCode !== 0) throw new Error(spawned.stderr.toString());
    };
    git('init', '--quiet');
    const hookPath = 'tools/tool-git-hooks/src/hooks/private-nesting.ts';
    mkdirSync(join(root, 'tools/tool-git-hooks/src/hooks'), { recursive: true });
    cpSync(join(import.meta.dir, 'private-nesting.ts'), join(root, hookPath));
    writeFileSync(join(root, '.gitignore'), '/private/\n');
    git('add', '.gitignore', hookPath);
    prepare(root);
    return Bun.spawnSync(['bash', '-c', run], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
      .exitCode;
  };

  test('passes a clean tree', () => {
    expect(runStep(() => undefined)).toBe(0);
  });

  test('refuses a tracked path under private/ that skipped the pre-commit hook', () => {
    // Proof (2026-10-06): with the step renamed away in ci.yml both cases failed on the missing
    // step (0 passed / 2 failed); with its xargs `bun run` lines replaced by `true`, this case
    // exited 0 (1 passed / 1 failed).
    expect(
      runStep((root) => {
        mkdirSync(join(root, 'private/puni-fleet'), { recursive: true });
        writeFileSync(join(root, 'private/puni-fleet/README.md'), 'private\n');
        Bun.spawnSync(['git', '-C', root, 'add', '-f', 'private/puni-fleet/README.md']);
      }),
    ).not.toBe(0);
  });
});

// A-CI-WORKSPACE-MEMORY-3: one leaf per heavy project with its [job, phase] budget in minutes.
const heavyLeaves = [
  { project: 'tool-fleet', job: 90, phase: 75 },
  { project: 'tool-devsync', job: 60, phase: 45 },
  { project: 'wbs-store-sqlite', job: 60, phase: 45 },
  { project: 'wbs-core', job: 45, phase: 30 },
];

test('Gate mode budgets exactly HEAVY_TEST_PROJECTS, each with a 15-minute reserve', () => {
  expect(heavyLeaves.map(({ project }) => project)).toEqual([...HEAVY_TEST_PROJECTS]);
  for (const { project, job, phase } of heavyLeaves) expect(job - phase, project).toBe(15);
  const heavy = readWorkflow().jobs?.['gate_heavy'];
  expect(heavy?.name).toBe('gate workspace-heavy (${{ matrix.project }})');
  expect(heavy?.['timeout-minutes']).toBe('${{ matrix.job }}');
  expect(heavy?.strategy).toEqual({
    'fail-fast': false,
    matrix: { include: '${{ fromJSON(needs.gate_mode.outputs.heavy_leaves) }}' },
  });
});

const base = '1'.repeat(40);
const head = '2'.repeat(40);
const affectedPlan = {
  schemaVersion: 1,
  base,
  head,
  mode: 'affected',
  twilight: 'run',
  projects: ['twilight-burokrat', 'wbs-be-01'],
  workspaceProjects: ['wbs-be-01'],
  partitions: { backend: ['wbs-be-01'], remote: [], frontend: [], heavy: [], workspace: [] },
  twilightProjects: ['twilight-burokrat'],
  reasons: ['runtime input'],
};

/** Executes the shipped scope step with controlled resolver and planner boundaries. */
const selectGate = (
  plan: unknown,
  event = 'pull_request',
  fault: Record<string, string | undefined> = {},
) => {
  const root = scratchSync('ci-selection-step-');
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'bun'),
    `#!/bin/bash
case "$*" in
  *pr-merge-base.ts*) printf '%s\\n' "$STUB_BASE"; exit "\${RESOLVER_STATUS:-0}" ;;
  *ci-plan.ts*) printf '%s\\n' "$STUB_PLAN"; exit "\${PLANNER_STATUS:-0}" ;;
  *) exit 90 ;;
esac
`,
    { mode: 0o755 },
  );
  const output = join(root, 'output');
  writeFileSync(output, '');
  const script = readWorkflow().jobs?.['gate_mode']?.steps?.find(
    ({ name }) => name === 'Gate mode',
  )?.run;
  if (script === undefined) throw new Error('missing Gate mode script');
  const execution = Bun.spawnSync(['bash', '-c', script], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      GITHUB_OUTPUT: output,
      GITHUB_SHA: head,
      EVENT_NAME: event,
      STUB_BASE: base,
      STUB_PLAN: typeof plan === 'string' ? plan : JSON.stringify(plan),
      ...fault,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { execution, output: readFileSync(output, 'utf8'), root };
};

describe('the validated CI selection step', () => {
  test('extracts affected and docs plans and retains the exact plan artifact', () => {
    for (const plan of [
      affectedPlan,
      {
        ...affectedPlan,
        projects: ['tool-fleet', 'twilight-burokrat', 'wbs-be-01'],
        workspaceProjects: ['tool-fleet', 'wbs-be-01'],
        partitions: { ...affectedPlan.partitions, heavy: ['tool-fleet'] },
      },
      // Proof: dropping wbs-core from either Gate mode heavy clause refused this valid plan.
      {
        ...affectedPlan,
        projects: ['twilight-burokrat', 'wbs-be-01', 'wbs-core'],
        workspaceProjects: ['wbs-be-01', 'wbs-core'],
        partitions: { ...affectedPlan.partitions, heavy: ['wbs-core'] },
      },
      {
        ...affectedPlan,
        twilight: 'skip',
        projects: [],
        workspaceProjects: [],
        partitions: { backend: [], remote: [], frontend: [], heavy: [], workspace: [] },
        twilightProjects: [],
        reasons: ['lint-only module requires independent workspace lint'],
      },
      {
        ...affectedPlan,
        mode: 'docs',
        twilight: 'skip',
        projects: [],
        workspaceProjects: [],
        partitions: { backend: [], remote: [], frontend: [], heavy: [], workspace: [] },
        twilightProjects: [],
      },
    ]) {
      const selection = selectGate(plan);
      expect(selection.execution.exitCode, selection.execution.stderr.toString()).toBe(0);
      expect(selection.output).toContain(`mode=${plan.mode}\n`);
      expect(selection.output).toContain(`base=${base}\n`);
      expect(selection.output).toContain(`twilight=${plan.twilight}\n`);
      expect(selection.output).toContain(`projects=${JSON.stringify(plan.projects)}\n`);
      expect(selection.output).toContain(
        `heavy=${plan.partitions.heavy.length > 0 ? 'run' : 'skip'}\n`,
      );
      // Proof: publishing every leaf regardless of the plan failed this per-project assertion.
      expect(selection.output).toContain(
        `heavy_leaves=${JSON.stringify(heavyLeaves.filter(({ project }) => plan.partitions.heavy.includes(project)))}\n`,
      );
      expect(JSON.parse(readFileSync(join(selection.root, 'ci-selection.json'), 'utf8'))).toEqual(
        plan,
      );
    }
  });

  test('refuses failed dependencies before publishing any scope', () => {
    for (const fault of [{ RESOLVER_STATUS: '9' }, { PLANNER_STATUS: '9' }]) {
      const selection = selectGate(affectedPlan, 'pull_request', fault);
      expect(selection.execution.exitCode).not.toBe(0);
      expect(selection.output).toBe('');
    }
  });

  test('refuses malformed, inconsistent and polluted plans before publishing scope', () => {
    for (const plan of [
      '',
      'not json',
      '{}',
      `${JSON.stringify(affectedPlan)}\n{}`,
      [],
      ...Object.keys(affectedPlan).map((field) => ({ ...affectedPlan, [field]: null })),
      { ...affectedPlan, schemaVersion: 2 },
      { ...affectedPlan, base: head },
      { ...affectedPlan, head: base },
      { ...affectedPlan, mode: 'full' },
      { ...affectedPlan, twilight: 'unknown' },
      { ...affectedPlan, projects: [1] },
      {
        ...affectedPlan,
        projects: ['--skip-nx-cache', 'twilight-burokrat'],
        workspaceProjects: ['--skip-nx-cache'],
        partitions: {
          backend: [],
          remote: [],
          frontend: [],
          heavy: [],
          workspace: ['--skip-nx-cache'],
        },
      },
      { ...affectedPlan, workspaceProjects: [1] },
      { ...affectedPlan, twilightProjects: [1] },
      { ...affectedPlan, reasons: [1] },
      { ...affectedPlan, reasons: [] },
      { ...affectedPlan, projects: [] },
      { ...affectedPlan, twilight: 'skip' },
      { ...affectedPlan, workspaceProjects: [] },
      { ...affectedPlan, partitions: { ...affectedPlan.partitions, backend: [] } },
      { ...affectedPlan, partitions: { ...affectedPlan.partitions, workspace: ['wbs-be-01'] } },
      { ...affectedPlan, partitions: { ...affectedPlan.partitions, remote: ['unknown'] } },
      // Proof: dropping the heavy membership clause from Gate mode admitted a heavy project
      // left in the workspace partition (2026-11-20).
      {
        ...affectedPlan,
        projects: ['tool-fleet', 'twilight-burokrat', 'wbs-be-01'],
        workspaceProjects: ['tool-fleet', 'wbs-be-01'],
        partitions: { ...affectedPlan.partitions, workspace: ['tool-fleet'] },
      },
      {
        ...affectedPlan,
        partitions: { ...affectedPlan.partitions, heavy: ['tool-fleet'] },
      },
      {
        ...affectedPlan,
        projects: ['twilight-burokrat', 'wbs-be-01', 'wbs-core'],
        workspaceProjects: ['wbs-be-01', 'wbs-core'],
        partitions: { ...affectedPlan.partitions, workspace: ['wbs-core'] },
      },
      {
        ...affectedPlan,
        projects: ['twilight-burokrat', 'wbs-be-01', 'wbs-be-01'],
        workspaceProjects: ['wbs-be-01', 'wbs-be-01'],
      },
      {
        ...affectedPlan,
        projects: ['wbs-be-01'],
        workspaceProjects: [],
        twilightProjects: ['wbs-be-01'],
      },
      {
        ...affectedPlan,
        workspaceProjects: ['twilight-burokrat', 'wbs-be-01'],
        twilightProjects: [],
        twilight: 'skip',
      },
      { ...affectedPlan, twilightProjects: ['wbs-be-01'] },
      { ...affectedPlan, projects: ['twilight-burokrat', 'twilight-burokrat', 'wbs-be-01'] },
      { ...affectedPlan, mode: 'docs' },
      {
        ...affectedPlan,
        mode: 'docs',
        projects: [],
        workspaceProjects: [],
        twilightProjects: [],
        partitions: { backend: [], remote: [], frontend: [], heavy: [], workspace: [] },
      },
    ]) {
      const selection = selectGate(plan);
      expect(selection.execution.exitCode, JSON.stringify(plan)).not.toBe(0);
      expect(selection.output, JSON.stringify(plan)).toBe('');
    }
  });

  test('retains full event scope and refuses unknown events', () => {
    for (const event of ['push', 'merge_group', 'workflow_dispatch']) {
      const selection = selectGate({}, event, { RESOLVER_STATUS: '9', PLANNER_STATUS: '9' });
      expect(selection.execution.exitCode).toBe(0);
      expect(selection.output).toBe(
        `mode=full\ntwilight=run\nbackend=run\nremote=run\nfrontend=run\nheavy=run\nheavy_leaves=${JSON.stringify(heavyLeaves)}\n`,
      );
    }
    expect(selectGate(affectedPlan, 'unknown').execution.exitCode).not.toBe(0);
  });

  test('routes prose to focused validation and retains mandatory security checks', () => {
    const workflow = readWorkflow();
    expect(workflow.jobs?.['gate_workspace']?.if).toBe(
      "${{ needs.gate_mode.outputs.mode != 'docs' }}",
    );
    const docs = workflow.jobs?.['gate_docs'];
    expect(docs?.needs).toBe('gate_mode');
    expect(docs?.if).toBe("${{ needs.gate_mode.outputs.mode == 'docs' }}");
    const commands = docs?.steps?.map(({ run }) => run ?? '').join('\n') ?? '';
    expect(commands).toContain('bun install --frozen-lockfile');
    expect(commands).toContain('bunx nx format:check --all');
    expect(commands).toContain('bunx nx run tool-devsync:check:docs --skip-nx-cache');
    for (const name of ['Secrets scan', 'Private nesting', 'Doc caps', 'OpenSpec']) {
      const original = workflow.jobs?.['gate_checks']?.steps?.find((step) => step.name === name);
      expect(docs?.steps?.find((step) => step.name === name)?.run, name).toBe(original?.run);
    }
    expect(commands).not.toMatch(
      /nx (?:affected|run-many)|e2e|test:package|integration|tool-wiki-lint/,
    );
  });
});

test('remote aggregate refuses failed, cancelled, skipped, missing or unknown whole-matrix outcomes', () => {
  for (const field of ['remoteResult', 'remoteModelResult'] as const) {
    for (const outcome of ['failure', 'cancelled', 'skipped', '', 'unknown'] as const) {
      expect(reduceGate({ ...green, [field]: outcome }), `${field}/${outcome}`).not.toBe(0);
      expect(reduceGate({ ...green, mode: 'full', [field]: outcome })).not.toBe(0);
    }
  }
  expect(
    reduceGate({ ...green, remote: 'skip', remoteResult: 'skipped', remoteModelResult: 'skipped' }),
  ).toBe(0);
  expect(reduceGate({ ...green, remote: 'skip', remoteResult: 'skipped' })).not.toBe(0);
  expect(reduceGate({ ...green, remote: 'skip', remoteModelResult: 'skipped' })).not.toBe(0);
});

interface RequeueStep {
  name?: string;
  if?: string;
  uses?: string;
  with?: Record<string, string | number>;
  env?: Record<string, string>;
  run?: string;
}

interface RequeueJob {
  name?: string;
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  'continue-on-error'?: boolean;
  'timeout-minutes'?: number;
  steps?: RequeueStep[];
}

interface RequeueWorkflow {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, RequeueJob>;
}

const parseRequeueWorkflow = (name: string): RequeueWorkflow =>
  Bun.YAML.parse(readFileSync(join(workflowPath, '..', name), 'utf8')) as RequeueWorkflow;

const requeueJob = (workflow: RequeueWorkflow, id: string): RequeueJob => {
  const job = workflow.jobs?.[id];
  if (job === undefined) throw new Error(`no job ${id}`);
  return job;
};

const onlyRun = (job: RequeueJob): string => {
  const run = job.steps?.[0]?.run;
  if (job.steps?.length !== 1 || run === undefined) throw new Error('expected one run step');
  return run;
};

interface RequeueExecution {
  status: number;
  stdout: string;
  stderr: string;
  calls: string[];
  /** The `gh` calls and `sleep` calls in the order they ran, as `gh <argv>` and `sleep <argv>`. */
  trace: string[];
}

/**
 * Runs a requeue script with a fake `gh` that appends each argv line to a ledger, answers an
 * artifacts query with GH_MARKERS, a run query with the next line of GH_STATES (the last line
 * repeats; a `FAIL` line fails as a transient API error does), and a fake `sleep` that records
 * its argument in the trace and returns at once.
 */
const headSha = '3fb17e0af1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6';

const runRequeue = (
  run: string,
  env: Record<string, string>,
  gh: { markers?: string; states?: string[] } = {},
): RequeueExecution => {
  const root = scratchSync('ci-requeue-');
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const ledger = join(root, 'gh-calls');
  const tracePath = join(root, 'trace');
  const states = join(root, 'states');
  writeFileSync(ledger, '');
  writeFileSync(tracePath, '');
  writeFileSync(
    states,
    (gh.states ?? [`completed 2 failure ${headSha}`]).map((line) => `${line}\n`).join(''),
  );
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/bash
printf '%s\\n' "$*" >> "$GH_LEDGER"
printf 'gh %s\\n' "$*" >> "$GH_TRACE"
case "$1 $2" in
  'api '*'/artifacts?name='*) printf '%s\\n' "$GH_MARKERS" ;;
  'api '*)
    n="$(grep -c '^api repos/[^ ]*/actions/runs/[0-9]* --jq' "$GH_LEDGER")"
    line="$(awk -v n="$n" '{ last = $0 } NR == n { print; found = 1; exit } END { if (!found) print last }' "$GH_STATES")"
    if [ "$line" = FAIL ]; then printf 'gh: Server Error (HTTP 502)\n' >&2; exit 1; fi
    printf '%s\n' "$line" ;;
esac
`,
    { mode: 0o755 },
  );
  writeFileSync(join(bin, 'sleep'), '#!/bin/bash\nprintf \'sleep %s\\n\' "$*" >> "$GH_TRACE"\n', {
    mode: 0o755,
  });
  const invocation = Bun.spawnSync(['bash', '-c', run], {
    env: {
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      GH_LEDGER: ledger,
      GH_TRACE: tracePath,
      GH_STATES: states,
      GH_MARKERS: gh.markers ?? '1',
      GH_TOKEN: 'token',
      REPOSITORY: 'owner/repo',
      RUN_ID: '44917747487',
      RUN_ATTEMPT: '2',
      HEAD_SHA: headSha,
      REQUEUE_DELAY_SECONDS: '600',
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const calls = readFileSync(ledger, 'utf8').split('\n').filter(Boolean);
  const trace = readFileSync(tracePath, 'utf8').split('\n').filter(Boolean);
  rmSync(root, { recursive: true, force: true });
  return {
    status: invocation.exitCode,
    stdout: invocation.stdout.toString(),
    stderr: invocation.stderr.toString(),
    calls,
    trace,
  };
};

const markerQuery =
  'api repos/owner/repo/actions/runs/44917747487/artifacts?name=aws-refused-heavy-tool-fleet-attempt-2 --jq .total_count';

// A-CI-LEAF-AWS-1 (R5-32): a refused tool-fleet attempt is requeued up to attempt 6
// (A-CI-LEAF-AWS-3), 10 minutes after the run completes, only when this
// attempt's marker artifact exists, and `gate` still fails the refused attempt.
describe('requeue tool-fleet leaf', () => {
  const ci = parseRequeueWorkflow('ci.yml');
  const requeue = parseRequeueWorkflow('ci-requeue.yml');

  // Proof (2026-11-22): dropping `&& github.run_attempt < 4`, adding `actions: write` to gate_heavy
  // or adding the requeue job to gate's needs each failed this test, and so did dropping `gate`
  // from the requeue job's needs. A-CI-LEAF-AWS-3: the bound put back to `< 4` failed it too.
  test('runs after a failed heavy leaf below attempt 6 with the only actions: write in ci.yml', () => {
    const job = requeueJob(ci, 'requeue_tool_fleet_leaf');
    expect(job.name).toBe('requeue tool-fleet leaf');
    // It fires after `gate`, at the end of the run, so the waiter's wait is short.
    expect(job.needs).toEqual(['gate_heavy', 'gate']);
    expect(job.if).toBe(
      "${{ always() && needs.gate_heavy.result == 'failure' && github.run_attempt < 6 }}",
    );
    expect(job.permissions).toEqual({ actions: 'write', contents: 'read' });
    expect(job['continue-on-error']).toBe(true);
    expect(ci.permissions).toEqual({ contents: 'read' });
    const writers = Object.entries(ci.jobs ?? {})
      .filter(([, owner]) => owner.permissions?.['actions'] !== undefined)
      .map(([id]) => id);
    expect(writers).toEqual(['requeue_tool_fleet_leaf']);
    // The refused attempt stays a failure: `gate` does not wait on or read the requeue.
    const gateNeeds = requeueJob(ci, 'gate').needs;
    expect(gateNeeds).toContain('gate_heavy');
    expect(gateNeeds).not.toContain('requeue_tool_fleet_leaf');
  });

  // Proof (2026-11-22): dropping `always() &&` from the upload condition failed this test.
  test('the heavy leaf uploads the attempt-named marker even though the step failed', () => {
    const upload = requeueJob(ci, 'gate_heavy').steps?.find(
      ({ name }) => name === 'Upload AWS refusal marker',
    );
    expect(upload?.if).toBe("${{ always() && steps.nx_gate.outputs.aws_refused == 'true' }}");
    expect(upload?.uses).toStartWith('actions/upload-artifact@');
    expect(upload?.with?.['name']).toBe(
      'aws-refused-heavy-tool-fleet-attempt-${{ github.run_attempt }}',
    );
    expect(upload?.with?.['path']).toBe('aws-refused.txt');
    expect(upload?.with?.['if-no-files-found']).toBe('error');
  });

  // Proof (2026-11-22): making the zero-marker branch unreachable dispatched an ordinary failure,
  // and disabling the fork guard queried and dispatched from a fork; dropping the head_sha input
  // from the dispatch failed it too.
  test('dispatches ci-requeue only when this attempt was refused, and never for a fork', () => {
    const run = onlyRun(requeueJob(ci, 'requeue_tool_fleet_leaf'));
    const dispatch = `workflow run ci-requeue.yml --repo owner/repo -f run_id=44917747487 -f attempt=2 -f head_sha=${headSha}`;
    const base = { EVENT_NAME: 'push', HEAD_REPOSITORY: '' };

    const refused = runRequeue(run, base);
    expect(refused.status, refused.stderr).toBe(0);
    expect(refused.calls).toEqual([markerQuery, dispatch]);
    expect(refused.stdout).toContain('A-CI-LEAF-AWS-1: requeue of attempt 2 dispatched');

    const samePr = runRequeue(run, {
      ...base,
      EVENT_NAME: 'pull_request',
      HEAD_REPOSITORY: 'owner/repo',
    });
    expect(samePr.calls).toEqual([markerQuery, dispatch]);

    const ordinary = runRequeue(run, base, { markers: '0' });
    expect(ordinary.status, ordinary.stderr).toBe(0);
    expect(ordinary.calls).toEqual([markerQuery]);
    expect(ordinary.stdout).toContain('is not an AWS refusal, no requeue');

    const fork = runRequeue(run, {
      ...base,
      EVENT_NAME: 'pull_request',
      HEAD_REPOSITORY: 'fork/repo',
    });
    expect(fork.status, fork.stderr).toBe(0);
    expect(fork.calls).toEqual([]);
    expect(fork.stdout).toContain('fork pull request from fork/repo');

    for (const markers of ['2', '', 'null']) {
      const unexpected = runRequeue(run, base, { markers });
      expect(unexpected.status, markers).toBe(1);
      expect(unexpected.calls, markers).toEqual([markerQuery]);
    }
  });

  // Proof (2026-11-22): widening the attempt bound to 0-9, admitting any run id or head sha, or
  // skipping the marker check, the completion wait, the moved-attempt check or the poll bound, or
  // dropping `--failed` each failed this test. After the #982 review: dropping the conclusion
  // check reran a cancelled run, dropping the head check reran another head, dropping the polled
  // attempt's [1-4] check read a garbled attempt as moved, exiting on the first failed poll, never
  // resetting the failure count, or a 45-poll bound each failed it too.
  test('ci-requeue waits for the refused attempt to complete, then reruns only a failed one', () => {
    expect(Object.keys(requeue.on ?? {})).toEqual(['workflow_dispatch']);
    expect(requeue.permissions).toEqual({ contents: 'read' });
    const job = requeueJob(requeue, 'requeue');
    expect(job.permissions).toEqual({ actions: 'write', contents: 'read' });
    const run = onlyRun(job);
    const status =
      'api repos/owner/repo/actions/runs/44917747487 --jq "\\(.status) \\(.run_attempt) \\(.conclusion) \\(.head_sha)"';
    const rerun = 'run rerun 44917747487 --repo owner/repo --failed';
    const running = `in_progress 2 null ${headSha}`;
    const failed = `completed 2 failure ${headSha}`;

    const requeued = runRequeue(run, {}, { states: [running, running, failed] });
    expect(requeued.status, requeued.stderr).toBe(0);
    expect(requeued.calls).toEqual([markerQuery, status, status, status, status, rerun]);
    expect(requeued.stdout).toContain('A-CI-LEAF-AWS-1: requeued attempt 3 after an AWS refusal');

    // The last refused attempt in the bound is 5; its rerun is attempt 6.
    const last = runRequeue(
      run,
      { RUN_ATTEMPT: '5' },
      { states: [`completed 5 failure ${headSha}`] },
    );
    expect(last.status, last.stderr).toBe(0);
    expect(last.calls).toEqual([
      markerQuery.replace('attempt-2', 'attempt-5'),
      status,
      status,
      rerun,
    ]);
    expect(last.stdout).toContain('A-CI-LEAF-AWS-1: requeued attempt 6 after an AWS refusal');
    // A polled attempt 6 is well formed: the run has moved, so nothing is rerun.
    const sixth = runRequeue(run, { RUN_ATTEMPT: '5' }, { states: [`queued 6 null ${headSha}`] });
    expect(sixth.status, sixth.stderr).toBe(0);
    expect(sixth.calls).toHaveLength(2);
    expect(sixth.stdout).toContain('is already on attempt 6; no requeue');

    // Up to three consecutive failed or malformed polls are tolerated.
    const transient = runRequeue(
      run,
      {},
      { states: ['FAIL', '', `completed x failure ${headSha}`, failed] },
    );
    expect(transient.status, transient.stderr).toBe(0);
    expect(transient.calls).toEqual([markerQuery, status, status, status, status, status, rerun]);
    // The count is of consecutive failures: a good poll resets it.
    const intermittent = runRequeue(
      run,
      {},
      { states: ['FAIL', 'FAIL', 'FAIL', running, 'FAIL', failed] },
    );
    expect(intermittent.status, intermittent.stderr).toBe(0);
    expect(intermittent.calls.at(-1)).toBe(rerun);
    const broken = runRequeue(run, {}, { states: ['FAIL', 'FAIL', '', 'completed 5 failure sha'] });
    expect(broken.status).toBe(1);
    expect(broken.calls).toEqual([markerQuery, status, status, status, status]);

    // A cancelled (superseded) or passing run, a moved attempt or another head is left alone.
    for (const [label, state] of [
      ['cancelled', `completed 2 cancelled ${headSha}`],
      ['success', `completed 2 success ${headSha}`],
      ['moved', `queued 3 null ${headSha}`],
      ['another head', `completed 2 failure ${'a'.repeat(40)}`],
    ] as const) {
      const left = runRequeue(run, {}, { states: [state] });
      expect(left.status, `${label}: ${left.stderr}`).toBe(0);
      expect(left.calls, label).toEqual([markerQuery, status]);
      expect(left.stdout, label).toContain('no requeue');
    }

    const stuck = runRequeue(run, {}, { states: [running] });
    expect(stuck.status).toBe(1);
    expect(stuck.calls).toHaveLength(151);
    expect(stuck.calls).not.toContain(rerun);

    const unrefused = runRequeue(run, {}, { markers: '0' });
    expect(unrefused.status).toBe(1);
    expect(unrefused.calls).toEqual([markerQuery]);

    for (const [name, value] of [
      ['RUN_ATTEMPT', '6'],
      ['RUN_ATTEMPT', '0'],
      ['RUN_ATTEMPT', ''],
      ['RUN_ATTEMPT', '2 3'],
      ['RUN_ID', ''],
      ['RUN_ID', '12/../1'],
      ['RUN_ID', '0123'],
      ['HEAD_SHA', ''],
      ['HEAD_SHA', 'main'],
      ['HEAD_SHA', headSha.toUpperCase()],
      ['REQUEUE_DELAY_SECONDS', ''],
      ['REQUEUE_DELAY_SECONDS', 'ten'],
      ['REQUEUE_DELAY_SECONDS', '-1'],
    ] as const) {
      const refused = runRequeue(run, { [name]: value });
      expect(refused.status, `${name}=${value}`).toBe(1);
      expect(refused.calls, `${name}=${value}`).toEqual([]);
    }
  });

  const delayJob = requeueJob(requeue, 'requeue');
  const delayRun = onlyRun(delayJob);
  const runQuery =
    'api repos/owner/repo/actions/runs/44917747487 --jq "\\(.status) \\(.run_attempt) \\(.conclusion) \\(.head_sha)"';
  const rerunCall = 'run rerun 44917747487 --repo owner/repo --failed';
  const failedAttempt = `completed 2 failure ${headSha}`;

  // Proof (2026-11-22, A-CI-LEAF-AWS-3): replacing the delay's `sleep` with `:` failed this
  // test's order check, and the next test's traces, which name the delay, failed too.
  test('ci-requeue waits 10 minutes after the run completes and before the rerun', () => {
    expect(delayJob.steps?.[0]?.env?.['REQUEUE_DELAY_SECONDS']).toBe('600');
    // 150 polls of a minute, the delay, and room for the re-read and the rerun.
    expect(delayJob['timeout-minutes']).toBe(175);
    const running = `in_progress 2 null ${headSha}`;

    const requeued = runRequeue(delayRun, {}, { states: [running, failedAttempt] });
    expect(requeued.status, requeued.stderr).toBe(0);
    expect(requeued.trace).toEqual([
      `gh ${markerQuery}`,
      `gh ${runQuery}`,
      'sleep 60',
      `gh ${runQuery}`,
      'sleep 600',
      `gh ${runQuery}`,
      `gh ${rerunCall}`,
    ]);
    expect(requeued.stdout).toContain(
      'A-CI-LEAF-AWS-1: waiting 600 s before the rerun so the next draw is less correlated with this host pool',
    );
  });

  // Proof (2026-11-22, A-CI-LEAF-AWS-3): replacing the read after the delay and its checks with
  // `if false` reran the cancelled attempt, failing this test at its `cancelled` case. Putting the
  // bound back to [1-3], the polled attempt back to [1-4] or dropping the delay's validation each
  // failed the waiter test above.
  test('ci-requeue reads the run again after the delay; a cancellation or new attempt stops it', () => {
    // A cancellation, a new attempt or another head seen after the delay stops the requeue.
    for (const [label, state, line] of [
      ['cancelled', `completed 2 cancelled ${headSha}`, 'is completed cancelled after the delay'],
      ['rerun by hand', `in_progress 3 null ${headSha}`, 'is already on attempt 3'],
      ['another head', `completed 2 failure ${'b'.repeat(40)}`, `records head ${'b'.repeat(40)}`],
    ] as const) {
      const left = runRequeue(delayRun, {}, { states: [failedAttempt, state] });
      expect(left.status, `${label}: ${left.stderr}`).toBe(0);
      expect(left.trace, label).toEqual([
        `gh ${markerQuery}`,
        `gh ${runQuery}`,
        'sleep 600',
        `gh ${runQuery}`,
      ]);
      expect(left.stdout, label).toContain(line);
      expect(left.stdout, label).toContain('no requeue');
    }

    // The read after the delay tolerates three failed polls, like the wait before it.
    const transient = runRequeue(
      delayRun,
      {},
      { states: [failedAttempt, 'FAIL', 'FAIL', failedAttempt] },
    );
    expect(transient.status, transient.stderr).toBe(0);
    expect(transient.trace.at(-1)).toBe(`gh ${rerunCall}`);
    const broken = runRequeue(delayRun, {}, { states: [failedAttempt, 'FAIL'] });
    expect(broken.status).toBe(1);
    expect(broken.calls).not.toContain(rerunCall);
  });
});
