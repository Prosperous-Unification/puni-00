import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  toolWiki: string;
  workspaceResult: JobResult;
  toolWikiResult: JobResult;
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
      TOOL_WIKI: needs.toolWiki,
      WORKSPACE_RESULT: needs.workspaceResult,
      TOOL_WIKI_RESULT: needs.toolWikiResult,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  }).exitCode;
};

const green: GateNeeds = {
  modeResult: 'success',
  toolWiki: 'run',
  workspaceResult: 'success',
  toolWikiResult: 'success',
};

const notSuccess = ['failure', 'cancelled', 'skipped'] as const;

/**
 * `gate` is the one required check over three jobs. It must report on every shard, including
 * one that failed, was cancelled or never ran, and accept a skipped Tool Wiki shard only when
 * the scope job succeeded and said Tool Wiki is out of scope.
 */
describe('the CI gate check', () => {
  test('waits on every shard even when one fails', () => {
    const gate = readWorkflow().jobs?.['gate'];

    expect(gate?.needs).toEqual(['gate_mode', 'gate_workspace', 'gate_tool_wiki']);
    expect(gate?.if).toBe('${{ always() }}');
    expect(requireStep().env).toEqual({
      MODE_RESULT: '${{ needs.gate_mode.result }}',
      TOOL_WIKI: '${{ needs.gate_mode.outputs.tool_wiki }}',
      WORKSPACE_RESULT: '${{ needs.gate_workspace.result }}',
      TOOL_WIKI_RESULT: '${{ needs.gate_tool_wiki.result }}',
    });
  });

  test('passes when every shard in scope succeeded', () => {
    expect(reduceGate(green)).toBe(0);
    expect(reduceGate({ ...green, toolWiki: 'skip', toolWikiResult: 'skipped' })).toBe(0);
  });

  test('refuses a workspace shard that did not succeed', () => {
    // Proof (2026-09-28): with `test "$WORKSPACE_RESULT" = success` deleted from ci.yml, this
    // failed on its first case, `failure`, exiting 0 — 4 passed / 1 failed.
    for (const workspaceResult of notSuccess) {
      expect(reduceGate({ ...green, workspaceResult }), workspaceResult).not.toBe(0);
    }
  });

  test('refuses a Tool Wiki shard that did not succeed while in scope', () => {
    // Proof (2026-09-28): with the `run)` arm's test replaced by
    // `test "$TOOL_WIKI_RESULT" != failure`, this failed on `cancelled` exiting 0 — 4 passed / 1 failed.
    for (const toolWikiResult of notSuccess) {
      expect(reduceGate({ ...green, toolWikiResult }), toolWikiResult).not.toBe(0);
    }
  });

  test('refuses a skip the scope job did not explain', () => {
    // `gate_tool_wiki` is also skipped when `gate_mode` fails or is cancelled, so accepting a
    // skip on its own would pass a gate that decided nothing.
    // Proof (2026-09-28): with `test "$MODE_RESULT" = success` deleted, the failed-scope case
    // exited 0; with the `*)` arm's `exit 1` deleted, the empty-verdict case exited 0.
    for (const modeResult of notSuccess) {
      expect(
        reduceGate({ ...green, modeResult, toolWiki: 'skip', toolWikiResult: 'skipped' }),
        modeResult,
      ).not.toBe(0);
    }
    expect(reduceGate({ ...green, toolWiki: '', toolWikiResult: 'skipped' })).not.toBe(0);
    expect(reduceGate({ ...green, toolWiki: 'skip', toolWikiResult: 'success' })).not.toBe(0);
  });
});
