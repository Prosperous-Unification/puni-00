import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { describe, expect, test } from 'bun:test';

interface WorkflowStep {
  name?: string;
  env?: Record<string, string>;
  run?: string;
}

interface WorkflowJob {
  if?: string;
  needs?: string | string[];
  steps?: WorkflowStep[];
}

interface Workflow {
  jobs?: Record<string, WorkflowJob>;
}

type JobResult = 'success' | 'failure' | 'cancelled' | 'skipped';

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
  backendResult: JobResult | '';
  remoteResult: JobResult | '';
  frontendResult: JobResult | '';
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
      BACKEND_RESULT: needs.backendResult,
      REMOTE_RESULT: needs.remoteResult,
      FRONTEND_RESULT: needs.frontendResult,
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
  backendResult: 'success',
  remoteResult: 'success',
  frontendResult: 'success',
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
      'gate_backend',
      'gate_remote',
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
      BACKEND_RESULT: '${{ needs.gate_backend.result }}',
      REMOTE_RESULT: '${{ needs.gate_remote.result }}',
      FRONTEND_RESULT: '${{ needs.gate_frontend.result }}',
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
        backendResult: 'skipped',
        remoteResult: 'skipped',
        frontendResult: 'skipped',
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
      backendResult: 'skipped',
      remoteResult: 'skipped',
      frontendResult: 'skipped',
      twilightResult: 'skipped',
    };
    for (const docsResult of notSuccess)
      expect(reduceGate({ ...docs, docsResult }), docsResult).not.toBe(0);
    for (const field of [
      'workspaceResult',
      'checksResult',
      'backendResult',
      'remoteResult',
      'frontendResult',
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
      'frontendResult',
      'checksResult',
    ] as const)
      for (const outcome of notSuccess)
        expect(reduceGate({ ...green, [field]: outcome }), `${field}/${outcome}`).not.toBe(0);
    for (const [selected, outcome] of [
      ['backend', 'backendResult'],
      ['remote', 'remoteResult'],
      ['frontend', 'frontendResult'],
    ] as const) {
      expect(reduceGate({ ...green, [selected]: 'skip', [outcome]: 'skipped' })).toBe(0);
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
  partitions: { backend: ['wbs-be-01'], remote: [], frontend: [], workspace: [] },
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
        twilight: 'skip',
        projects: [],
        workspaceProjects: [],
        partitions: { backend: [], remote: [], frontend: [], workspace: [] },
        twilightProjects: [],
        reasons: ['lint-only module requires independent workspace lint'],
      },
      {
        ...affectedPlan,
        mode: 'docs',
        twilight: 'skip',
        projects: [],
        workspaceProjects: [],
        partitions: { backend: [], remote: [], frontend: [], workspace: [] },
        twilightProjects: [],
      },
    ]) {
      const selection = selectGate(plan);
      expect(selection.execution.exitCode, selection.execution.stderr.toString()).toBe(0);
      expect(selection.output).toContain(`mode=${plan.mode}\n`);
      expect(selection.output).toContain(`base=${base}\n`);
      expect(selection.output).toContain(`twilight=${plan.twilight}\n`);
      expect(selection.output).toContain(`projects=${JSON.stringify(plan.projects)}\n`);
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
        partitions: { backend: [], remote: [], frontend: [], workspace: ['--skip-nx-cache'] },
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
        partitions: { backend: [], remote: [], frontend: [], workspace: [] },
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
        'mode=full\ntwilight=run\nbackend=run\nremote=run\nfrontend=run\n',
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
