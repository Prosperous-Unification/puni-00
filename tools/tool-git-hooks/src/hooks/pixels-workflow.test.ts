import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

interface WorkflowStep {
  id?: string;
  name?: string;
  env?: Record<string, string>;
  run?: string;
  uses?: string;
  with?: { name?: string; path?: string };
}

interface WorkflowJob {
  if?: string;
  name?: string;
  needs?: string | string[];
  outputs?: Record<string, string>;
  steps?: WorkflowStep[];
  strategy?: { matrix?: { shard?: number[] } };
}

interface Workflow {
  jobs?: Record<string, WorkflowJob>;
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

describe('the CI pixels gate', () => {
  test('runs every browser shard and makes the stable pixels check depend on them', () => {
    const workflow = readWorkflow();
    const shardJob = workflow.jobs?.['pixels_shard'];
    const summaryJob = workflow.jobs?.['pixels'];
    const layoutStep = shardJob?.steps?.find(({ name }) => name === 'Layout gate');
    const artifactStep = shardJob?.steps?.find(({ uses }) =>
      uses?.startsWith('actions/upload-artifact@'),
    );

    expect(shardJob?.strategy?.matrix?.shard).toEqual([1, 2, 3, 4]);
    expect(shardJob?.name).toBe('pixels shard ${{ matrix.shard }}/4');
    expect(layoutStep?.run).toBe('bun run e2e -- --shard=${{ matrix.shard }}/4');
    expect(artifactStep?.with?.name).toBe(
      'wbs-table-screenshot-${{ matrix.shard }}-${{ github.run_attempt }}',
    );
    // Proof: restoring only the first upload root to `apps/fe-01/test-results/`
    // failed this production-workflow oracle with the complete legacy path (2026-09-14).
    expect(artifactStep?.with?.path).toBe(
      'apps/wbs/fe-01/test-results/\napps/wbs/fe-01/playwright-report/\n',
    );
    expect(summaryJob?.needs).toEqual(['pixels_mode', 'pixels_shard']);
    expect(summaryJob?.if).toBe('${{ always() }}');
  });
});

/**
 * `on` is the one key YAML 1.1 reads as a boolean, so `workflow.on` is undefined and a
 * suite that read it would pass by checking nothing — see `corpus-lint-workflow.test.ts`.
 */
const subscribedEvents = (workflow: Workflow): string[] => {
  const record = workflow as unknown as Record<string, unknown>;
  // Bracketed because both come from an index signature (TS4111), not style.
  const block = (record['on'] ?? record['true']) as Record<string, unknown> | undefined;
  expect(block, 'the workflow has no `on:` block under either key').toBeDefined();
  return Object.keys(block ?? {});
};

/** The event labels of a `case "$EVENT_NAME" in` script, `*` included, one per alternative. */
const caseArmEvents = (script: string): string[] =>
  [...script.matchAll(/^ {2}([a-z_ |*]+)\)$/gm)].flatMap((match) =>
    match[1].split('|').map((event) => event.trim()),
  );

const jobStep = (workflow: Workflow, job: string, name: string): WorkflowStep => {
  const step = workflow.jobs?.[job]?.steps?.find((candidate) => candidate.name === name);
  expect(step, `job \`${job}\` has no \`${name}\` step`).toBeDefined();
  return step ?? {};
};

/**
 * The browser gate's scope, which follows the Nx gate's switch without going vacuous.
 *
 * The shards are the slowest and flakiest thing in this workflow, and they are also the
 * only check that lays the table out, so narrowing them is the change most able to do
 * quiet damage. Two things keep it honest: the boot set comes from
 * `playwright.config.ts` rather than from the job's name, and `pixels` — the check the
 * ruleset requires — accepts a skip only when the scope job said the stack is
 * unaffected, so a scope job that failed can never read as a pass.
 */
describe('the CI pixels scope', () => {
  test('decides the browser scope from the event, and refuses one it has no rule for', () => {
    // Proof (2026-09-16): with the `*)` arm deleted from `Browser stack scope`, this
    // failed on `expect(received).toContain("*")` — received
    // `["pull_request", "push", "merge_group", "workflow_dispatch"]`.
    const workflow = readWorkflow();
    const script = jobStep(workflow, 'pixels_mode', 'Browser stack scope').run ?? '';
    const arms = caseArmEvents(script);

    expect(arms).toContain('*');
    expect(arms.filter((event) => event !== '*').sort()).toEqual(subscribedEvents(workflow).sort());
    expect(script).toContain(`printf 'no browser-stack rule for event %s\\n' "$EVENT_NAME" >&2`);
  });

  test('asks Nx about every app the browser stack boots, as JSON', () => {
    // Proof (2026-09-16): `bunx nx show projects --affected --files=apps/wbs/be-01/src/main.ts`
    // answers `["wbs-be-01","tool-devsync","tool-wiki","tool-dagger"]` on Nx 23.2.0 — no
    // `wbs-fe-01`. With the production membership narrowed to
    // `jq -e 'index("wbs-fe-01") != null'`, this failed on
    // `Expected to contain: "jq -e 'any(.[]; . == \"wbs-fe-01\" or . == \"wbs-be-01\" or
    // . == \"wbs-gw-01\")'"` — 1 failed / 4 passed. That is the backend change which
    // breaks the rendered table while the frontend project is untouched.
    const step = jobStep(readWorkflow(), 'pixels_mode', 'Browser stack scope');

    expect(step.env).toEqual({
      EVENT_NAME: '${{ github.event_name }}',
      PR_BASE_SHA: '${{ github.event.pull_request.base.sha }}',
    });
    expect(step.run).toContain(
      'bunx nx show projects --affected --base="$PR_BASE_SHA" --head=HEAD --json',
    );
    // One expression naming all three, so narrowing the set moves this assertion. `grep`
    // cannot be used here: `nx show projects` prints a one-line JSON array on a non-TTY.
    expect(step.run).toContain(
      `jq -e 'any(.[]; . == "wbs-fe-01" or . == "wbs-be-01" or . == "wbs-gw-01")'`,
    );
    expect(step.run).not.toContain('grep');
    expect(readWorkflow().jobs?.['pixels_mode']?.outputs).toEqual({
      stack: '${{ steps.stack.outputs.stack }}',
    });
  });

  test('runs the shards only when the browser stack is in scope', () => {
    const shardJob = readWorkflow().jobs?.['pixels_shard'];

    expect(shardJob?.needs).toBe('pixels_mode');
    expect(shardJob?.if).toBe("${{ needs.pixels_mode.outputs.stack == 'affected' }}");
  });

  test('the required check refuses a skip it cannot explain', () => {
    // Proof (2026-09-16): with the aggregate reduced to its previous
    // `test "${{ needs.pixels_shard.result }}" = success`, this failed on the exact
    // environment — expected the three `needs` values, received `undefined` — 1 failed /
    // 4 passed. That one-liner fails the required check on a legitimate skip, and the
    // obvious relaxation of it (accepting `skipped` too) would pass a `pixels_shard`
    // that was skipped because `pixels_mode` FAILED.
    const summary = jobStep(readWorkflow(), 'pixels', 'Require every browser shard');

    expect(summary.env).toEqual({
      STACK: '${{ needs.pixels_mode.outputs.stack }}',
      STACK_RESULT: '${{ needs.pixels_mode.result }}',
      SHARD_RESULT: '${{ needs.pixels_shard.result }}',
    });
    // The scope job's own verdict first: a skip is only ever read as a pass when the job
    // that decided to skip actually succeeded.
    expect(summary.run).toContain('test "$STACK_RESULT" = success');
    expect(summary.run).toContain('test "$SHARD_RESULT" = success');
    expect(summary.run).toContain('test "$SHARD_RESULT" = skipped');
    expect(caseArmEvents(summary.run ?? '')).toContain('*');
  });
});
