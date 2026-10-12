import { formatStepNodeId } from '@wbs/domain';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * The three attempt commands (`step-node-attempts` D2) through the commands
 * route, over real SQLite and the composed services: the refusals at their
 * command index, the batch's roll-back, and the undo — each decided by rows,
 * the partial index and the order `CHECK` included.
 */
let h: OrganizationHarness;
let project: string;
let dev: string;
let qa: string;
let strip: string;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  await h.register('ada');
  h.organization('org-a');
  h.member('org-a', 'ada', 'member');
  h.bind('ada', 'org-a');
  h.activate();
  const created = await h.call('ada', 'POST', '/api/projects', { name: 'Rewire the shed' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  const body = created.body as { project: { id: string }; steps: { id: string; name: string }[] };
  project = body.project.id;
  dev = stepNamed(body.steps, 'Dev');
  qa = stepNamed(body.steps, 'QA');
  const leaf = await batch([
    { kind: 'createWorkItem', ref: 'strip', parentId: null, afterId: null, name: 'Strip' },
  ]);
  const id = (leaf.body as { results?: { id?: string }[] }).results?.[0]?.id;
  if (id === undefined) throw new Error(`no leaf: ${JSON.stringify(leaf)}`);
  strip = id;
});

afterEach(() => {
  h.close();
});

function stepNamed(steps: readonly { id: string; name: string }[], name: string): string {
  const step = steps.find((each) => each.name === name);
  if (step === undefined) throw new Error(`a project without its seed step ${name}`);
  return step.id;
}

const batch = (commands: unknown[]): Promise<Answer> =>
  h.call('ada', 'POST', `/api/projects/${project}/commands`, { commands });

/** One node's stored attempts, ascending, as the table holds them. */
function stored(stepId: string) {
  return h.sqlite
    .query<
      {
        attempt_number: number;
        ended_at: number | null;
        outcome: string | null;
        reference: string | null;
      },
      [string, string]
    >(
      `SELECT attempt_number, ended_at, outcome, reference FROM step_node_attempt
        WHERE work_item_id = ? AND step_id = ? ORDER BY attempt_number`,
    )
    .all(strip, stepId);
}

describe('the attempt commands', () => {
  /**
   * Proof, watched 2026-10-12: the service's `node_done` refusal removed made
   * the first start answer 200; its `attempt_running` refusal removed still
   * answered 409 from the store's own (the partial index's face, as D1
   * intends), and with the store's removed too it answered 500, never 200;
   * the `attempt_in_future` check removed made the third answer 200.
   */
  it('refuses node_done, attempt_running and attempt_in_future at their command index', async () => {
    await batch([{ kind: 'setProgress', workItemId: strip, stepId: dev, state: 'done' }]);

    expect(await batch([{ kind: 'startAttempt', workItemId: strip, stepId: dev }])).toEqual({
      status: 409,
      body: { error: 'node_done', at: 0, kind: 'startAttempt' },
    });
    await batch([{ kind: 'setProgress', workItemId: strip, stepId: dev, state: 'in_progress' }]);
    expect((await batch([{ kind: 'startAttempt', workItemId: strip, stepId: dev }])).status).toBe(
      200,
    );

    expect(await batch([{ kind: 'startAttempt', workItemId: strip, stepId: dev }])).toEqual({
      status: 409,
      body: { error: 'attempt_running', at: 0, kind: 'startAttempt' },
    });
    expect(stored(dev)).toHaveLength(1);

    const later = Date.now() + 3_600_000;
    expect(
      await batch([{ kind: 'startAttempt', workItemId: strip, stepId: qa, at: later }]),
    ).toEqual({
      status: 422,
      body: { error: 'attempt_in_future', at: 0, kind: 'startAttempt' },
    });
    expect(stored(qa)).toEqual([]);
  });

  /**
   * Proof, watched 2026-10-12: the service's `no_running_attempt` refusal
   * removed made the first end answer 500 (a null running attempt read); its
   * `attempt_ends_before_start` refusal removed made the second answer 500,
   * `CHECK constraint failed: step_node_attempt_order`.
   */
  it('refuses no_running_attempt and attempt_ends_before_start, and stores the end given', async () => {
    expect(
      await batch([{ kind: 'endAttempt', workItemId: strip, stepId: qa, outcome: 'failed' }]),
    ).toEqual({ status: 409, body: { error: 'no_running_attempt', at: 0, kind: 'endAttempt' } });

    const began = Date.now() - 60_000;
    await batch([{ kind: 'startAttempt', workItemId: strip, stepId: qa, at: began }]);
    expect(
      await batch([
        { kind: 'endAttempt', workItemId: strip, stepId: qa, outcome: 'failed', at: began - 1 },
      ]),
    ).toEqual({
      status: 422,
      body: { error: 'attempt_ends_before_start', at: 0, kind: 'endAttempt' },
    });
    expect(
      (
        await batch([
          {
            kind: 'endAttempt',
            workItemId: strip,
            stepId: qa,
            outcome: 'failed',
            reference: 'PR #12',
          },
        ])
      ).status,
    ).toBe(200);
    expect(stored(qa)).toMatchObject([
      { attempt_number: 1, outcome: 'failed', reference: 'PR #12' },
    ]);
  });

  /** Proof: the service answering `ok` for a missing number made this answer 200; watched 2026-10-12. */
  it('refuses unknown_attempt', async () => {
    expect(
      await batch([{ kind: 'removeAttempt', workItemId: strip, stepId: dev, attemptNumber: 4 }]),
    ).toEqual({ status: 404, body: { error: 'unknown_attempt', at: 0, kind: 'removeAttempt' } });
  });

  it('refuses at the index and rolls the batch back: the rename is absent', async () => {
    expect(
      await batch([
        { kind: 'patchWorkItem', workItemId: strip, patch: { name: 'Strip the walls' } },
        { kind: 'endAttempt', workItemId: strip, stepId: dev, outcome: 'failed' },
      ]),
    ).toEqual({ status: 409, body: { error: 'no_running_attempt', at: 1, kind: 'endAttempt' } });
    const row = h.sqlite
      .query<{ name: string }, [string]>('SELECT name FROM work_item WHERE id = ?')
      .get(strip);
    expect(row?.name).toBe('Strip');
  });

  it('starts an attempt by step node ID with a reference, as an MCP client sends it, and one undo removes it', async () => {
    // The body the derived `postApiProjectsByIdCommands` tool forwards.
    const started = await batch([
      {
        kind: 'startAttempt',
        stepNodeId: formatStepNodeId({ workItemId: strip, stepId: dev }),
        reference: 'https://ci.example/run/7',
      },
    ]);
    expect(started.status).toBe(200);
    expect(stored(dev)).toEqual([
      { attempt_number: 1, ended_at: null, outcome: null, reference: 'https://ci.example/run/7' },
    ]);

    expect(await h.call('ada', 'POST', `/api/projects/${project}/undo`)).toMatchObject({
      status: 200,
      body: { done: 'started attempt 1 of 010.dev' },
    });
    expect(stored(dev)).toEqual([]);
  });

  it("hands a leaf's attempts to its first child, and one undo gives them back verbatim", async () => {
    await batch([{ kind: 'startAttempt', workItemId: strip, stepId: dev, reference: 'PR #1' }]);
    await batch([{ kind: 'endAttempt', workItemId: strip, stepId: dev, outcome: 'failed' }]);
    await batch([{ kind: 'startAttempt', workItemId: strip, stepId: dev }]);
    const held = stored(dev);
    const created = await batch([
      { kind: 'createWorkItem', parentId: strip, afterId: null, name: 'Back boxes' },
    ]);
    expect(created.status).toBe(200);
    expect(stored(dev)).toEqual([]);

    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    expect(stored(dev)).toEqual(held);
  });

  /**
   * Proof: `attempts` left out of the delete's inverse `restore_subtree` made
   * this case read `[]` after the undo (`- Expected - 8 / + Received + 1`);
   * watched 2026-10-12.
   */
  it('puts a deleted leaf back with its attempts, verbatim', async () => {
    await batch([{ kind: 'startAttempt', workItemId: strip, stepId: dev, reference: 'PR #1' }]);
    await batch([{ kind: 'endAttempt', workItemId: strip, stepId: dev, outcome: 'cancelled' }]);
    const held = stored(dev);
    await batch([{ kind: 'deleteWorkItem', workItemId: strip }]);
    expect(stored(dev)).toEqual([]);

    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    expect(stored(dev)).toEqual(held);
  });
});
