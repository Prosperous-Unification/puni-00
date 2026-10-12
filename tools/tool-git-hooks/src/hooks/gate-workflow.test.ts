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
  modeResult: JobResult;
  twilight: string;
  workspaceResult: JobResult;
  twilightResult: JobResult;
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
      TWILIGHT: needs.twilight,
      WORKSPACE_RESULT: needs.workspaceResult,
      TWILIGHT_RESULT: needs.twilightResult,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  }).exitCode;
};

const green: GateNeeds = {
  modeResult: 'success',
  twilight: 'run',
  workspaceResult: 'success',
  twilightResult: 'success',
};

const notSuccess = ['failure', 'cancelled', 'skipped'] as const;

/**
 * `gate` is the one required check over three jobs. It must report on every shard, including
 * one that failed, was cancelled or never ran, and accept a skipped Twilight shard only when
 * the scope job succeeded and said the Twilight suite is out of scope.
 */
describe('the CI gate check', () => {
  test('waits on every shard even when one fails', () => {
    const gate = readWorkflow().jobs?.['gate'];

    expect(gate?.needs).toEqual(['gate_mode', 'gate_workspace', 'gate_twilight']);
    expect(gate?.if).toBe('${{ always() }}');
    expect(requireStep().env).toEqual({
      MODE_RESULT: '${{ needs.gate_mode.result }}',
      TWILIGHT: '${{ needs.gate_mode.outputs.twilight }}',
      WORKSPACE_RESULT: '${{ needs.gate_workspace.result }}',
      TWILIGHT_RESULT: '${{ needs.gate_twilight.result }}',
    });
  });

  test('passes when every shard in scope succeeded', () => {
    expect(reduceGate(green)).toBe(0);
    expect(reduceGate({ ...green, twilight: 'skip', twilightResult: 'skipped' })).toBe(0);
  });

  test('refuses a workspace shard that did not succeed', () => {
    // Proof (2026-09-28): with `test "$WORKSPACE_RESULT" = success` deleted from ci.yml, this
    // failed on its first case, `failure`, exiting 0 — 4 passed / 1 failed.
    for (const workspaceResult of notSuccess) {
      expect(reduceGate({ ...green, workspaceResult }), workspaceResult).not.toBe(0);
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
    const step = readWorkflow().jobs?.['gate_workspace']?.steps?.find(
      ({ name }) => name === 'Private nesting',
    );
    expect(step, 'job `gate_workspace` has no `Private nesting` step').toBeDefined();
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
