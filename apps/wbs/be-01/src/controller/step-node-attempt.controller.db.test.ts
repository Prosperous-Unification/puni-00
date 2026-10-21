import type { ScheduleRead } from '@wbs/core';
import { formatStepNodeId, serializeSchedule } from '@wbs/domain';
import { canonicalScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { activateTestStepBlockages } from '@wbs/store-sqlite/testing/step-blockage-activation';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { SubtreeRepository } from '../repository/work-item';
import { fastScheduler } from '../service/optimizer-wiring';
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
  await populate();
});

async function populate(): Promise<void> {
  activateTestStepBlockages(h.sqlite.filename);
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
}

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

describe('the project timezone on the tree read', () => {
  /**
   * The zone a step card formats attempt instants in arrives with the plan it
   * draws (`step-node-attempts` D7), so a card never reads a second request.
   */
  it('carries UTC by default and the patched zone after a PATCH', async () => {
    const zoneOfTree = async (): Promise<unknown> => {
      const read = await h.call('ada', 'GET', `/api/projects/${project}/work-items`);
      if (read.status !== 200) throw new Error(`read refused: ${JSON.stringify(read)}`);
      return (read.body as { timezone?: unknown }).timezone;
    };
    expect(await zoneOfTree()).toBe('UTC');
    const patched = await h.call('ada', 'PATCH', `/api/projects/${project}`, {
      timezone: 'Europe/Kyiv',
    });
    expect(patched.status).toBe(200);
    expect(await zoneOfTree()).toBe('Europe/Kyiv');
  });
});

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
      body: { done: 'started attempt 1 of 010.s1-dev' },
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

/** The attempt numbers A42 holds: a number once issued at a node is never issued again. */
describe('attempt numbers are never reused', () => {
  const numbersAt = (workItemId: string) =>
    h.sqlite
      .query<{ attempt_number: number }, [string, string]>(
        `SELECT attempt_number FROM step_node_attempt WHERE work_item_id = ? AND step_id = ?
          ORDER BY attempt_number`,
      )
      .all(workItemId, dev)
      .map((row) => row.attempt_number);

  const twoEnded = async () => {
    for (const outcome of ['failed', 'succeeded']) {
      await batch([{ kind: 'startAttempt', workItemId: strip, stepId: dev }]);
      await batch([{ kind: 'endAttempt', workItemId: strip, stepId: dev, outcome }]);
    }
  };

  const removeSecond = async () => {
    const removed = await batch([
      { kind: 'removeAttempt', workItemId: strip, stepId: dev, attemptNumber: 2 },
    ]);
    expect(removed.status).toBe(200);
  };

  const call = (route: 'undo' | 'redo') =>
    h.call('ada', 'POST', `/api/projects/${project}/${route}`);

  it('numbers count up and never reuse: remove 2 of {1, 2}, the next start is 3', async () => {
    await twoEnded();
    await removeSecond();

    expect((await batch([{ kind: 'startAttempt', workItemId: strip, stepId: dev }])).status).toBe(
      200,
    );
    expect(numbersAt(strip)).toEqual([1, 3]);
  });

  it('puts a removed attempt back under its own number on undo, renumbering nothing', async () => {
    await twoEnded();
    const held = stored(dev);
    await removeSecond();

    expect(await call('undo')).toMatchObject({
      status: 200,
      body: { done: 'removed attempt 2 of 010.s1-dev' },
    });
    expect(stored(dev)).toEqual(held);
    await batch([{ kind: 'startAttempt', workItemId: strip, stepId: dev }]);
    expect(numbersAt(strip)).toEqual([1, 2, 3]);
  });

  it('leaves an undone start’s number issued: the next start takes the one after it', async () => {
    await twoEnded();
    await batch([{ kind: 'startAttempt', workItemId: strip, stepId: dev }]);
    expect((await call('undo')).status).toBe(200);
    expect(numbersAt(strip)).toEqual([1, 2]);

    await batch([{ kind: 'startAttempt', workItemId: strip, stepId: dev }]);
    expect(numbersAt(strip)).toEqual([1, 2, 4]);
  });

  it('skips a number removed before the first child, across the create’s undo and redo', async () => {
    await twoEnded();
    await removeSecond();
    const created = await batch([
      { kind: 'createWorkItem', parentId: strip, afterId: null, name: 'Back boxes' },
    ]);
    const child = (created.body as { results?: { id?: string }[] }).results?.[0]?.id;
    if (child === undefined) throw new Error(`no child: ${JSON.stringify(created)}`);
    expect(numbersAt(child)).toEqual([1]);

    expect((await call('undo')).status).toBe(200);
    expect(numbersAt(strip)).toEqual([1]);
    expect((await call('redo')).status).toBe(200);
    expect(numbersAt(child)).toEqual([1]);

    await batch([{ kind: 'startAttempt', workItemId: child, stepId: dev }]);
    expect(numbersAt(child)).toEqual([1, 3]);
  });

  it('gives the parent back its numbers when the first child’s create is undone', async () => {
    await twoEnded();
    await removeSecond();
    await batch([{ kind: 'createWorkItem', parentId: strip, afterId: null, name: 'Back boxes' }]);
    expect((await call('undo')).status).toBe(200);

    await batch([{ kind: 'startAttempt', workItemId: strip, stepId: dev }]);
    expect(numbersAt(strip)).toEqual([1, 3]);
  });

  it('puts a deleted leaf back still skipping its removed highest number', async () => {
    await twoEnded();
    await removeSecond();
    await batch([{ kind: 'deleteWorkItem', workItemId: strip }]);
    expect((await call('undo')).status).toBe(200);
    expect(numbersAt(strip)).toEqual([1]);

    await batch([{ kind: 'startAttempt', workItemId: strip, stepId: dev }]);
    expect(numbersAt(strip)).toEqual([1, 3]);
  });
});

describe('the work-item read', () => {
  interface ReadRow {
    name: string;
    attempts?: Record<string, { attemptNumber: number; endedAt: number | null }[]>;
    spans?: Record<string, { start: number; end: number | null }>;
    span?: { start: number; end: number | null };
  }

  async function readRows(): Promise<Map<string, ReadRow>> {
    const read = await h.call('ada', 'GET', `/api/projects/${project}/work-items`);
    if (read.status !== 200) throw new Error(`read refused: ${JSON.stringify(read)}`);
    return new Map(
      (read.body as { workItems: ReadRow[] }).workItems.map((row) => [row.name, row] as const),
    );
  }

  /**
   * The spec's "a running attempt leaves the span open" and "no attempts, no
   * span", read through both live-plan paths: the isolated read and the shared
   * observation `readLiveProjectIn` captures.
   */
  for (const mode of ['isolated', 'shared'] as const) {
    it(`reads attempts ascending and derived spans per node and leaf (${mode})`, async () => {
      if (mode === 'shared') {
        h.close();
        h = OrganizationHarness.openComposedWith({
          supportedCapacityModes: ['isolated', 'shared'],
        });
        await populate();
        h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      }
      await batch([{ kind: 'createWorkItem', parentId: null, afterId: strip, name: 'Plaster' }]);
      const now = Date.now();
      const first = now - 7_200_000;
      const firstEnd = now - 5_400_000;
      const second = now - 3_600_000;
      const qaStart = now - 6_000_000;
      const qaEnd = now - 4_000_000;
      for (const commands of [
        [{ kind: 'startAttempt', workItemId: strip, stepId: dev, at: first }],
        [{ kind: 'endAttempt', workItemId: strip, stepId: dev, outcome: 'failed', at: firstEnd }],
        [{ kind: 'startAttempt', workItemId: strip, stepId: dev, at: second }],
        [{ kind: 'startAttempt', workItemId: strip, stepId: qa, at: qaStart }],
        [{ kind: 'endAttempt', workItemId: strip, stepId: qa, outcome: 'succeeded', at: qaEnd }],
      ]) {
        const answered = await batch(commands);
        if (answered.status !== 200) throw new Error(`refused: ${JSON.stringify(answered)}`);
      }

      const rows = await readRows();
      const leaf = rows.get('Strip');
      expect(leaf?.attempts?.[dev]).toMatchObject([
        { attemptNumber: 1, startedAt: first, endedAt: firstEnd, outcome: 'failed' },
        { attemptNumber: 2, startedAt: second, endedAt: null, outcome: null },
      ]);
      expect(leaf?.attempts?.[qa]).toMatchObject([
        { attemptNumber: 1, startedAt: qaStart, endedAt: qaEnd, outcome: 'succeeded' },
      ]);
      expect(leaf?.spans).toEqual({
        [dev]: { start: first, end: null },
        [qa]: { start: qaStart, end: qaEnd },
      });
      expect(leaf?.span).toEqual({ start: first, end: null });

      const silent = rows.get('Plaster');
      expect(silent).toBeDefined();
      expect(silent !== undefined && 'attempts' in silent).toBe(false);
      expect(silent !== undefined && 'spans' in silent).toBe(false);
      expect(silent !== undefined && 'span' in silent).toBe(false);
    });
  }
});

describe('node readings on the work-item read', () => {
  type Readings = Record<string, string>;

  /** Every row's readings by name; a parent carries none. */
  async function readingsByName(): Promise<Map<string, Readings | undefined>> {
    const read = await h.call('ada', 'GET', `/api/projects/${project}/work-items`);
    if (read.status !== 200) throw new Error(`read refused: ${JSON.stringify(read)}`);
    const rows = (read.body as { workItems: { name: string; nodeReadings?: Readings }[] })
      .workItems;
    return new Map(rows.map((row) => [row.name, row.nodeReadings] as const));
  }

  async function run(commands: unknown[]): Promise<string[]> {
    const answered = await batch(commands);
    if (answered.status !== 200) throw new Error(`refused: ${JSON.stringify(answered)}`);
    return ((answered.body as { results?: { id?: string }[] }).results ?? []).flatMap((each) =>
      each.id === undefined ? [] : [each.id],
    );
  }

  async function leaf(name: string): Promise<string> {
    const id = (await run([{ kind: 'createWorkItem', parentId: null, afterId: strip, name }])).at(
      0,
    );
    if (id === undefined) throw new Error(`no leaf ${name}`);
    return id;
  }

  /**
   * The spec's "QA waits on a finished Dev" through the workflow edge, and an
   * authored node-scoped edge into a first node, read through both live-plan
   * paths. `Paint`'s Dev has no predecessor node at all and stays unknown.
   *
   * Proof: predecessors taken from step order instead of the graph (the
   * previous step's node in the same leaf) and both cases failed on
   * `Plaster`'s Dev, `- "waiting"` / `+ "unknown"` — the authored edge unseen;
   * watched 2026-10-12.
   */
  for (const mode of ['isolated', 'shared'] as const) {
    it(`reads readings per node from the resolved step graph (${mode})`, async () => {
      if (mode === 'shared') {
        h.close();
        h = OrganizationHarness.openComposedWith({
          supportedCapacityModes: ['isolated', 'shared'],
        });
        await populate();
        h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      }
      const plaster = await leaf('Plaster');
      await leaf('Paint');
      await run([
        { kind: 'setProgress', workItemId: strip, stepId: dev, state: 'done' },
        {
          kind: 'addTypedDependency',
          predecessor: { scope: 'node', workItemId: strip, stepId: dev },
          successor: { scope: 'node', workItemId: plaster, stepId: dev },
          type: 'FS',
        },
      ]);

      const readings = await readingsByName();
      expect(readings.get('Strip')).toMatchObject({ [dev]: 'done', [qa]: 'waiting' });
      expect(readings.get('Plaster')).toMatchObject({ [dev]: 'waiting', [qa]: 'unknown' });
      expect(readings.get('Paint')).toMatchObject({ [dev]: 'unknown', [qa]: 'unknown' });
    });
  }

  it('a running attempt reads in progress, and waiting once it ends failed', async () => {
    await run([{ kind: 'setProgress', workItemId: strip, stepId: dev, state: 'done' }]);
    await run([{ kind: 'startAttempt', workItemId: strip, stepId: qa }]);

    expect((await readingsByName()).get('Strip')).toMatchObject({ [qa]: 'in_progress' });

    await run([{ kind: 'endAttempt', workItemId: strip, stepId: qa, outcome: 'failed' }]);
    expect((await readingsByName()).get('Strip')).toMatchObject({ [qa]: 'waiting' });
  });

  it("the row's hold shows on its nodes, and in progress once it is cleared", async () => {
    await run([{ kind: 'setProgress', workItemId: strip, stepId: dev, state: 'in_progress' }]);
    await run([{ kind: 'setStatus', workItemId: strip, status: 'on_hold' }]);

    expect((await readingsByName()).get('Strip')).toMatchObject({ [dev]: 'on_hold' });

    await run([{ kind: 'setStatus', workItemId: strip, status: 'in_progress' }]);
    expect((await readingsByName()).get('Strip')).toMatchObject({ [dev]: 'in_progress' });
  });

  for (const mode of ['isolated', 'shared'] as const) {
    it(`keeps row proxy independent of an unblocked typed step endpoint (${mode})`, async () => {
      if (mode === 'shared') {
        h.close();
        h = OrganizationHarness.openComposedWith({
          supportedCapacityModes: ['isolated', 'shared'],
        });
        await populate();
        h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      }
      const successor = await leaf('Successor');
      await run([
        { kind: 'setProgress', workItemId: strip, stepId: dev, state: 'done' },
        { kind: 'setProgress', workItemId: strip, stepId: qa, state: 'in_progress' },
        { kind: 'setStatus', workItemId: strip, status: 'on_hold' },
        {
          kind: 'addTypedDependency',
          predecessor: { scope: 'node', workItemId: strip, stepId: dev },
          successor: { scope: 'node', workItemId: successor, stepId: dev },
          type: 'FS',
        },
      ]);
      const read = await h.call('ada', 'GET', `/api/projects/${project}/work-items`);
      expect(read.status).toBe(200);
      const rows = (
        read.body as { workItems: { id: string; status: string; nodeReadings: Readings }[] }
      ).workItems;
      const downstream = rows.find((row) => row.id === successor);
      expect(downstream?.status).toBe('blocked_by_proxy');
      expect(downstream?.nodeReadings).toEqual({ [dev]: 'waiting', [qa]: 'unknown' });
    });
  }

  for (const mode of ['isolated', 'shared'] as const) {
    it(`reads migrated historical parent progress while preserving the row fold (${mode})`, async () => {
      if (mode === 'shared') {
        h.close();
        h = OrganizationHarness.openComposedWith({
          supportedCapacityModes: ['isolated', 'shared'],
        });
        await populate();
        h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      }
      const child = (
        await run([{ kind: 'createWorkItem', parentId: strip, afterId: null, name: 'Child' }])
      ).at(0);
      if (child === undefined) throw new Error('no child');
      await run([{ kind: 'setProgress', workItemId: child, stepId: dev, state: 'in_progress' }]);
      const before = await h.call('ada', 'GET', `/api/projects/${project}/work-items`);
      expect(before.status).toBe(200);
      // Reproduce a pre-fix move's persisted row in the fully migrated database.
      h.sqlite.run(
        "INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (?, ?, 'done', 1)",
        [strip, dev],
      );
      const after = await h.call('ada', 'GET', `/api/projects/${project}/work-items`);
      expect(after.status).toBe(200);
      interface Row {
        id: string;
        status: string;
        progress: Record<string, string>;
        nodeReadings: Readings;
      }
      const projectRows = (answer: Answer) =>
        (answer.body as { workItems: Row[] }).workItems.map(
          ({ id, status, progress, nodeReadings }) => ({ id, status, progress, nodeReadings }),
        );
      expect(projectRows(after)).toEqual(projectRows(before));
      expect(projectRows(after).find((row) => row.id === strip)?.nodeReadings).toBeUndefined();
      expect(
        h.sqlite
          .query<{ state: string }, [string]>(
            'SELECT state FROM step_progress WHERE work_item_id = ?',
          )
          .get(strip),
      ).toEqual({ state: 'done' });
    });
  }

  for (const mode of ['isolated', 'shared'] as const) {
    for (const hasHold of [false, true]) {
      it(`reads a stored dependency cycle with downstream nodes, hold=${String(hasHold)} (${mode})`, async () => {
        if (mode === 'shared') {
          h.close();
          h = OrganizationHarness.openComposedWith({
            supportedCapacityModes: ['isolated', 'shared'],
          });
          await populate();
          h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
        }
        const other = await leaf('Other');
        const downstream = await leaf('Downstream');
        if (hasHold) await run([{ kind: 'setStatus', workItemId: strip, status: 'blocked' }]);
        h.sqlite.run(
          'INSERT INTO dependency (id, project_id, predecessor_id, successor_id) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)',
          [
            crypto.randomUUID(),
            project,
            strip,
            other,
            crypto.randomUUID(),
            project,
            other,
            strip,
            crypto.randomUUID(),
            project,
            other,
            downstream,
          ],
        );
        const read = await h.call('ada', 'GET', `/api/projects/${project}/work-items`);
        expect(read.status).toBe(200);
        const tree = read.body as {
          scheduleError: string;
          workItems: { id: string; nodeReadings: Readings }[];
        };
        expect(tree.scheduleError).toBe('cycle');
        expect(tree.workItems).toHaveLength(3);
        for (const row of tree.workItems) {
          const reading = hasHold ? (row.id === strip ? 'blocked' : 'blocked_by_proxy') : 'unknown';
          expect(row.nodeReadings).toEqual({ [dev]: reading, [qa]: reading });
        }
      });
    }
  }

  it('a first node is unknown', async () => {
    expect((await readingsByName()).get('Strip')).toEqual({ [dev]: 'unknown', [qa]: 'unknown' });
  });

  /**
   * The spec's "skipped is not produced yet", over a plan where every other
   * reading is present, so the absence is not an accident of a small plan.
   */
  it('no node reads skipped', async () => {
    const held = await leaf('Held');
    const blocked = await leaf('Blocked');
    const proxied = await leaf('Proxied');
    const running = await leaf('Running');
    await leaf('Untouched');
    await run([
      { kind: 'setProgress', workItemId: strip, stepId: dev, state: 'done' },
      { kind: 'setStatus', workItemId: held, status: 'on_hold' },
      { kind: 'setStatus', workItemId: blocked, status: 'blocked' },
      {
        kind: 'addTypedDependency',
        predecessor: { scope: 'whole', workItemId: blocked },
        successor: { scope: 'whole', workItemId: proxied },
        type: 'FS',
      },
      { kind: 'startAttempt', workItemId: running, stepId: dev },
    ]);

    const readings = await readingsByName();
    const every = new Set([...readings.values()].flatMap((each) => Object.values(each ?? {})));
    expect([...every].sort()).toEqual(
      [
        'blocked',
        'blocked_by_proxy',
        'done',
        'in_progress',
        'on_hold',
        'unknown',
        'waiting',
      ].sort(),
    );
    expect(every.has('skipped')).toBe(false);
  });
});

describe('persisted step blockage on the live work-item read', () => {
  for (const mode of ['isolated', 'shared'] as const) {
    it(`keeps the actual Fast request, full result and displayed schedule byte-identical (${mode})`, async () => {
      if (mode === 'shared') {
        h.close();
        h = OrganizationHarness.openComposedWith({
          supportedCapacityModes: ['isolated', 'shared'],
        });
        await populate();
        h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      }
      const created = await batch([
        { kind: 'createWorkItem', parentId: null, afterId: strip, name: 'Successor' },
      ]);
      if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
      const successor = (created.body as { results?: { id?: string }[] }).results?.[0]?.id;
      if (successor === undefined) throw new Error('missing successor');
      const estimated = await batch([
        {
          kind: 'setEstimate',
          workItemId: strip,
          stepId: dev,
          days: { optimistic: 1, realistic: 2, pessimistic: 3 },
        },
        {
          kind: 'setEstimate',
          workItemId: successor,
          stepId: dev,
          days: { optimistic: 1, realistic: 2, pessimistic: 3 },
        },
        {
          kind: 'addTypedDependency',
          predecessor: { scope: 'node', workItemId: strip, stepId: dev },
          successor: { scope: 'node', workItemId: successor, stepId: dev },
          type: 'FS',
        },
      ]);
      expect(estimated.status).toBe(200);
      const observed = spyOn(fastScheduler, 'read');
      try {
        const capture = async () => {
          const beforeCalls = observed.mock.calls.length;
          const answer = await h.call('ada', 'GET', `/api/projects/${project}/work-items`);
          if (answer.status !== 200) throw new Error(`read refused: ${JSON.stringify(answer)}`);
          const call = observed.mock.calls
            .slice(beforeCalls)
            .find(([ask]) => ask.projectId === project);
          if (call === undefined) throw new Error('live Fast scheduler request was not captured');
          const index = observed.mock.calls.indexOf(call);
          // Bun spy metadata loses the scheduler overload's return type at this test boundary.
          const returned = (await Promise.resolve(observed.mock.results[index]?.value)) as
            ScheduleRead | undefined;
          if (returned?.kind !== 'scheduled')
            throw new Error('live Fast scheduler did not return a schedule');
          const tree = answer.body as {
            workItems: {
              id: string;
              schedule: unknown;
              dates: unknown;
              nodeReadings: Record<string, string>;
            }[];
            slices: unknown[];
          };
          return {
            input: canonicalScheduleInput(call[0].input),
            fast: JSON.stringify(serializeSchedule(returned.fast)),
            displayed: JSON.stringify({
              rows: tree.workItems.map(({ id, schedule, dates }) => ({ id, schedule, dates })),
              slices: tree.slices,
            }),
            tree,
          };
        };
        const baseline = await capture();
        expect(baseline.tree.slices.length).toBeGreaterThan(1);

        h.sqlite.run(
          'INSERT INTO step_blockage (work_item_id, step_id, blocked_at) VALUES (?, ?, ?)',
          [strip, dev, 123456],
        );
        const blocked = await capture();
        expect(blocked.tree.workItems.find((row) => row.id === strip)?.nodeReadings[dev]).toBe(
          'blocked',
        );
        expect(blocked.tree.workItems.find((row) => row.id === successor)?.nodeReadings[dev]).toBe(
          'blocked_by_proxy',
        );
        h.sqlite.run('DELETE FROM step_blockage WHERE work_item_id = ? AND step_id = ?', [
          strip,
          dev,
        ]);
        const cleared = await capture();
        // Proof: removing the isolated/shared fact read left the blocked reading `unknown`;
        // filtering blocked nodes before Fast or its displayed projection must fail these bytes.
        expect([blocked.input, cleared.input]).toEqual([baseline.input, baseline.input]);
        expect([blocked.fast, cleared.fast]).toEqual([baseline.fast, baseline.fast]);
        expect([blocked.displayed, cleared.displayed]).toEqual([
          baseline.displayed,
          baseline.displayed,
        ]);
      } finally {
        observed.mockRestore();
      }
    });
  }
  for (const mode of ['isolated', 'shared'] as const) {
    it(`reads a direct timestamp and the exact downstream root (${mode})`, async () => {
      if (mode === 'shared') {
        h.close();
        h = OrganizationHarness.openComposedWith({
          supportedCapacityModes: ['isolated', 'shared'],
        });
        await populate();
        h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      }
      const created = await batch([
        { kind: 'createWorkItem', parentId: null, afterId: strip, name: 'Successor' },
      ]);
      if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
      const successor = (created.body as { results?: { id?: string }[] }).results?.[0]?.id;
      if (successor === undefined) throw new Error('missing successor');
      const linked = await batch([
        {
          kind: 'addTypedDependency',
          predecessor: { scope: 'node', workItemId: strip, stepId: qa },
          successor: { scope: 'node', workItemId: successor, stepId: dev },
          type: 'FS',
        },
      ]);
      expect(linked.status).toBe(200);
      const read = async () => {
        const answer = await h.call('ada', 'GET', `/api/projects/${project}/work-items`);
        if (answer.status !== 200) throw new Error(`read refused: ${JSON.stringify(answer)}`);
        return (
          answer.body as {
            workItems: {
              id: string;
              status: string;
              nodeReadings: Record<string, string>;
              blockages?: Record<string, { blockedAt: number }>;
              blockageCauses?: Record<string, { kind: string; nodeId?: string }[]>;
            }[];
          }
        ).workItems;
      };
      const baseline = await read();

      h.sqlite.run(
        'INSERT INTO step_blockage (work_item_id, step_id, blocked_at) VALUES (?, ?, ?)',
        [strip, qa, 123456],
      );
      const blocked = await read();
      expect(blocked.find((row) => row.id === strip)?.blockages).toEqual({
        [qa]: { blockedAt: 123456 },
      });
      expect(blocked.find((row) => row.id === strip)?.nodeReadings[qa]).toBe('blocked');
      expect(blocked.find((row) => row.id === successor)?.nodeReadings[dev]).toBe(
        'blocked_by_proxy',
      );
      expect(blocked.find((row) => row.id === successor)?.blockageCauses?.[dev]).toEqual([
        { kind: 'step', nodeId: formatStepNodeId({ workItemId: strip, stepId: qa }) },
      ]);
      expect(blocked.map((row) => [row.id, row.status])).toEqual(
        baseline.map((row) => [row.id, row.status]),
      );
      h.sqlite.run('DELETE FROM step_blockage WHERE work_item_id = ? AND step_id = ?', [strip, qa]);
      const cleared = await read();
      expect(cleared.find((row) => row.id === strip)?.blockages).toEqual({});
      expect(cleared.find((row) => row.id === successor)?.nodeReadings[dev]).toBe(
        baseline.find((row) => row.id === successor)?.nodeReadings[dev],
      );
    });
  }
  for (const mode of ['isolated', 'shared'] as const) {
    it(`keeps parent metadata absent and done and running nodes ahead of blockage (${mode})`, async () => {
      if (mode === 'shared') {
        h.close();
        h = OrganizationHarness.openComposedWith({
          supportedCapacityModes: ['isolated', 'shared'],
        });
        await populate();
        h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      }
      const created = await batch([
        { kind: 'createWorkItem', parentId: strip, afterId: null, name: 'Child' },
      ]);
      expect(created.status).toBe(200);
      const child = (created.body as { results?: { id?: string }[] }).results?.[0]?.id;
      if (child === undefined) throw new Error('missing child');
      const progressed = await batch([
        { kind: 'setProgress', workItemId: child, stepId: dev, state: 'done' },
      ]);
      expect(progressed.status).toBe(200);

      h.sqlite.run(
        'INSERT INTO step_blockage (work_item_id, step_id, blocked_at) VALUES (?, ?, ?)',
        [child, dev, 111],
      );
      const read = async () => {
        const answer = await h.call('ada', 'GET', `/api/projects/${project}/work-items`);
        if (answer.status !== 200) throw new Error(`read refused: ${JSON.stringify(answer)}`);
        return (
          answer.body as {
            workItems: {
              id: string;
              status: string;
              nodeReadings?: Record<string, string>;
              blockages?: Record<string, { blockedAt: number }>;
              blockageCauses?: Record<string, unknown[]>;
            }[];
          }
        ).workItems;
      };
      const done = await read();
      expect(done.find((row) => row.id === strip)?.blockages).toBeUndefined();
      expect(done.find((row) => row.id === strip)?.blockageCauses).toBeUndefined();
      expect(done.find((row) => row.id === child)?.nodeReadings?.[dev]).toBe('done');
      expect(done.find((row) => row.id === child)?.blockages?.[dev]).toEqual({ blockedAt: 111 });
      h.sqlite.run('DELETE FROM step_blockage WHERE work_item_id = ? AND step_id = ?', [
        child,
        dev,
      ]);
      const reopened = await batch([
        { kind: 'setProgress', workItemId: child, stepId: dev, state: 'in_progress' },
      ]);
      expect(reopened.status).toBe(200);
      const started = await batch([{ kind: 'startAttempt', workItemId: child, stepId: dev }]);
      expect(started.status).toBe(200);
      const siblingCreated = await batch([
        { kind: 'createWorkItem', parentId: null, afterId: strip, name: 'Sibling' },
      ]);
      expect(siblingCreated.status).toBe(200);
      const sibling = (siblingCreated.body as { results?: { id?: string }[] }).results?.[0]?.id;
      if (sibling === undefined) throw new Error('missing sibling');
      const linked = await batch([
        {
          kind: 'addTypedDependency',
          predecessor: { scope: 'node', workItemId: sibling, stepId: qa },
          successor: { scope: 'node', workItemId: child, stepId: dev },
          type: 'FS',
        },
      ]);
      expect(linked.status).toBe(200);
      const unblockedRunning = await read();

      h.sqlite.run(
        'INSERT INTO step_blockage (work_item_id, step_id, blocked_at) VALUES (?, ?, ?)',
        [sibling, qa, 222],
      );
      const running = await read();
      expect(running.find((row) => row.id === child)?.nodeReadings?.[dev]).toBe('in_progress');
      expect(running.find((row) => row.id === child)?.blockageCauses?.[dev]).toEqual([]);
      expect(running.find((row) => row.id === sibling)?.blockages?.[qa]).toEqual({
        blockedAt: 222,
      });
      expect(running.map((row) => [row.id, row.status])).toEqual(
        unblockedRunning.map((row) => [row.id, row.status]),
      );
    });
  }
});

describe('the plan document carries the zone and the attempts', () => {
  interface DocumentRow {
    name: string;
    attempts?: Record<string, Record<string, unknown>[]>;
    spans?: unknown;
  }
  interface Document {
    document: { version: number };
    settings: { timezone: string };
    workItems: DocumentRow[];
    directory: { people: { name: string }[] };
  }

  const began = Date.UTC(2026, 9, 10, 8, 0);
  const failed = Date.UTC(2026, 9, 10, 9, 30);
  const retried = Date.UTC(2026, 9, 10, 10, 0);

  /** `Strip` in a Kyiv project: Dev attempt 1 failed by Ana, attempt 2 running. */
  async function attemptedExport(): Promise<Document> {
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${project}`, { timezone: 'Europe/Kyiv' }))
        .status,
    ).toBe(200);
    h.sqlite.run("INSERT INTO person (id, name) VALUES ('pe-ana', 'root-Ana')");
    h.sqlite.run(
      "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('pe-ana', 'org-a', 'Ana')",
    );
    for (const commands of [
      [
        {
          kind: 'startAttempt',
          workItemId: strip,
          stepId: dev,
          at: began,
          executorPersonId: 'pe-ana',
          reference: 'PR #11',
          note: 'first go',
        },
      ],
      [{ kind: 'endAttempt', workItemId: strip, stepId: dev, outcome: 'failed', at: failed }],
      [{ kind: 'startAttempt', workItemId: strip, stepId: dev, at: retried }],
    ]) {
      const answered = await batch(commands);
      if (answered.status !== 200) throw new Error(`refused: ${JSON.stringify(answered)}`);
    }
    const exported = await h.call('ada', 'GET', `/api/projects/${project}/export?format=json`);
    if (exported.status !== 200) throw new Error(`export refused: ${JSON.stringify(exported)}`);
    return exported.body as Document;
  }

  const projectCount = () =>
    h.sqlite.query<{ n: number }, []>('SELECT count(*) AS n FROM project').get()?.n;

  it('round-trips a Kyiv project whose 010.dev holds attempts 1 failed and 2 running', async () => {
    const document = await attemptedExport();
    expect(document.document.version).toBe(10);
    expect(document.settings.timezone).toBe('Europe/Kyiv');
    const row = document.workItems.find((each) => each.name === 'Strip');
    expect(row?.spans).toBeUndefined();
    expect(row?.attempts).toEqual({
      dev: [
        {
          number: 1,
          startedAt: '2026-10-10T08:00:00.000Z',
          endedAt: '2026-10-10T09:30:00.000Z',
          outcome: 'failed',
          executor: 'Ana',
          reference: 'PR #11',
          note: 'first go',
        },
        {
          number: 2,
          startedAt: '2026-10-10T10:00:00.000Z',
          endedAt: null,
          outcome: null,
          executor: null,
          reference: null,
          note: null,
        },
      ],
    });
    expect(document.directory.people.map(({ name }) => name)).toContain('Ana');

    const imported = await h.call('ada', 'POST', '/api/projects/import', document);
    expect(imported.status).toBe(201);
    const copy = (imported.body as { projectId: string }).projectId;
    const read = await h.call('ada', 'GET', `/api/projects/${copy}`);
    expect((read.body as { project: { timezone: string } }).project.timezone).toBe('Europe/Kyiv');
    const tree = await h.call('ada', 'GET', `/api/projects/${copy}/work-items`);
    const body = tree.body as {
      steps: { id: string; code: string }[];
      workItems: (DocumentRow & { id: string; attempts?: Record<string, unknown[]> })[];
    };
    const copiedDev = body.steps.find((step) => step.code === 'dev')?.id ?? '';
    const copied = body.workItems.find((each) => each.name === 'Strip');
    expect(copied?.attempts?.[copiedDev]).toMatchObject([
      {
        attemptNumber: 1,
        startedAt: began,
        endedAt: failed,
        outcome: 'failed',
        executorPersonId: 'pe-ana',
        reference: 'PR #11',
        note: 'first go',
      },
      { attemptNumber: 2, startedAt: retried, endedAt: null, outcome: null },
    ]);
    // The document carries no removed numbers, so the copy's mark is its
    // highest imported number (A42).
    expect(
      h.sqlite
        .query<{ issued: number }, [string, string]>(
          'SELECT issued FROM step_node_attempt_issued WHERE work_item_id = ? AND step_id = ?',
        )
        .all(copied?.id ?? '', copiedDev),
    ).toEqual([{ issued: 2 }]);
  });

  it('imports a version-6 document as UTC with no attempts', async () => {
    const document = await attemptedExport();
    document.document.version = 6;
    const imported = await h.call('ada', 'POST', '/api/projects/import', document);
    expect(imported.status).toBe(201);
    const copy = (imported.body as { projectId: string }).projectId;
    const read = await h.call('ada', 'GET', `/api/projects/${copy}`);
    expect((read.body as { project: { timezone: string } }).project.timezone).toBe('UTC');
    const rows = h.sqlite
      .query<{ n: number }, [string]>(
        `SELECT count(*) AS n FROM step_node_attempt
          JOIN work_item ON work_item.id = step_node_attempt.work_item_id
          WHERE work_item.project_id = ?`,
      )
      .get(copy);
    expect(rows?.n).toBe(0);
  });

  /**
   * Each refusal answers `400 invalid_body` at its path and creates no
   * project. Proofs, watched 2026-10-12, each check in `classifyPlanDocument`
   * disabled in turn: recorded beside the check.
   */
  it('refuses an unknown zone, an unknown outcome, an end before its start, two running and a running attempt not the highest', async () => {
    const document = await attemptedExport();
    const at = document.workItems.findIndex((each) => each.name === 'Strip');
    const attempts = (edit: (dev: Record<string, unknown>[]) => void): Document => {
      const changed = structuredClone(document);
      const row = changed.workItems[at];
      const dev = row.attempts?.['dev'];
      if (dev === undefined) throw new Error('the export lost the attempts');
      edit(dev);
      return changed;
    };
    const zone = structuredClone(document);
    zone.settings.timezone = 'Kyiv';
    const cases: [string, Document, string][] = [
      ['an unknown zone', zone, 'settings.timezone'],
      [
        'an unknown outcome',
        attempts((dev) => {
          Object.assign(dev[0], { outcome: 'won' });
        }),
        `workItems[${String(at)}].attempts.dev[0]`,
      ],
      [
        'an end before its start',
        attempts((dev) => {
          Object.assign(dev[0], { endedAt: '2026-10-10T07:00:00.000Z' });
        }),
        `workItems[${String(at)}].attempts.dev[0].endedAt`,
      ],
      [
        'two running on one node',
        attempts((dev) => {
          Object.assign(dev[0], { endedAt: null, outcome: null });
        }),
        `workItems[${String(at)}].attempts.dev`,
      ],
      [
        'a running attempt not the highest',
        attempts((dev) => {
          dev.push({
            number: 3,
            startedAt: '2026-10-10T11:00:00.000Z',
            endedAt: '2026-10-10T11:30:00.000Z',
            outcome: 'cancelled',
            executor: null,
            reference: null,
            note: null,
          });
        }),
        `workItems[${String(at)}].attempts.dev`,
      ],
    ];
    const before = projectCount();
    const answers = [];
    for (const [named, file] of cases) {
      const refused = await h.call('ada', 'POST', '/api/projects/import', file);
      answers.push({ named, status: refused.status, body: refused.body });
    }
    expect(answers).toEqual(
      cases.map(([named, , path]) => ({
        named,
        status: 400,
        body: { error: 'invalid_body', path, detail: null },
      })),
    );
    expect(projectCount()).toBe(before);
  });

  it('refuses an attempt executor the directory does not name, creating no project', async () => {
    const document = await attemptedExport();
    const at = document.workItems.findIndex((each) => each.name === 'Strip');
    const first = document.workItems[at]?.attempts?.['dev']?.[0];
    if (first === undefined) throw new Error('the export lost the attempts');
    first['executor'] = 'Nobody';
    const before = projectCount();
    const refused = await h.call('ada', 'POST', '/api/projects/import', document);
    expect(refused).toEqual({
      status: 400,
      body: {
        error: 'unknown_ref',
        path: `workItems[${String(at)}].attempts[0].executor`,
        detail: null,
      },
    });
    expect(projectCount()).toBe(before);
  });
});

describe('first-child blockage preservation', () => {
  const facts = () =>
    h.sqlite
      .query<{ workItemId: string; stepId: string; blockedAt: number }, []>(
        'SELECT work_item_id AS workItemId, step_id AS stepId, blocked_at AS blockedAt FROM step_blockage ORDER BY blocked_at',
      )
      .all();

  it('preserves exact blockage and progress through mounted first-child create undo redo', async () => {
    expect(
      (await batch([{ kind: 'setProgress', workItemId: strip, stepId: dev, state: 'in_progress' }]))
        .status,
    ).toBe(200);

    h.sqlite.run('INSERT INTO step_blockage (work_item_id, step_id, blocked_at) VALUES (?, ?, ?)', [
      strip,
      dev,
      123,
    ]);

    h.sqlite.run('INSERT INTO step_blockage (work_item_id, step_id, blocked_at) VALUES (?, ?, ?)', [
      strip,
      qa,
      789,
    ]);
    const created = await batch([
      { kind: 'createWorkItem', parentId: strip, afterId: null, name: 'Back boxes' },
    ]);
    expect(created.status).toBe(200);
    const child = (created.body as { results: { id: string }[] }).results.at(0)?.id;
    expect(child).toBeDefined();
    if (child === undefined) throw new Error('first child missing');
    expect(facts()).toEqual([
      { workItemId: child, stepId: dev, blockedAt: 123 },
      { workItemId: child, stepId: qa, blockedAt: 789 },
    ]);
    const owners = () =>
      h.sqlite
        .query<{ work_item_id: string; state: string }, []>(
          'SELECT work_item_id, state FROM step_progress',
        )
        .all();
    expect(owners()).toEqual([{ work_item_id: child, state: 'in_progress' }]);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    expect(facts()).toEqual([
      { workItemId: strip, stepId: dev, blockedAt: 123 },
      { workItemId: strip, stepId: qa, blockedAt: 789 },
    ]);
    expect(owners()).toEqual([{ work_item_id: strip, state: 'in_progress' }]);
    expect(
      h.sqlite
        .query<{ count: number }, [string]>(
          'SELECT count(*) AS count FROM work_item WHERE parent_id = ?',
        )
        .get(strip)?.count,
    ).toBe(0);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(200);
    expect(facts()).toEqual([
      { workItemId: child, stepId: dev, blockedAt: 123 },
      { workItemId: child, stepId: qa, blockedAt: 789 },
    ]);
    expect(owners()).toEqual([{ work_item_id: child, state: 'in_progress' }]);
  });

  /**
   * Proof: bypassing exact-fact comparison returned 200 in both directions.
   * Committing a refused UOW lost the first step fact before the second refused.
   * Both faults failed these tests; watched 2026-10-14.
   */
  it.each(['undo', 'redo'] as const)(
    'refuses changed blockage atomically during first-child %s',
    async (direction) => {
      h.sqlite.run(
        'INSERT INTO step_blockage (work_item_id, step_id, blocked_at) VALUES (?, ?, ?)',
        [strip, dev, 123],
      );

      h.sqlite.run(
        'INSERT INTO step_blockage (work_item_id, step_id, blocked_at) VALUES (?, ?, ?)',
        [strip, qa, 789],
      );
      const created = await batch([
        { kind: 'createWorkItem', parentId: strip, afterId: null, name: 'Back boxes' },
      ]);
      expect(created.status).toBe(200);
      const child = (created.body as { results: { id: string }[] }).results.at(0)?.id;
      if (child === undefined) throw new Error('first child missing');
      if (direction === 'redo')
        expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
      const owner = direction === 'undo' ? child : strip;
      // Direct SQL changes no owner revision: the conditional fact comparison must refuse.
      h.sqlite.run(
        'UPDATE step_blockage SET blocked_at = 456 WHERE work_item_id = ? AND step_id = ?',
        [owner, qa],
      );
      const snapshot = () =>
        ['work_item', 'step_progress', 'step_blockage', 'event_log', 'event_sequencer'].map(
          (table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
        );
      const before = snapshot();
      expect((await h.call('ada', 'POST', `/api/projects/${project}/${direction}`)).status).toBe(
        409,
      );
      expect(snapshot()).toEqual(before);
      expect(facts()).toEqual([
        { workItemId: owner, stepId: dev, blockedAt: 123 },
        { workItemId: owner, stepId: qa, blockedAt: 456 },
      ]);
    },
  );

  /** Proof: committing the failed UOW preserved the parent clear and failed the parent-fact assertion; watched 2026-10-14. */
  it('rolls back the cleared parent blockage when the first child insert fails', async () => {
    h.sqlite.run('INSERT INTO step_blockage (work_item_id, step_id, blocked_at) VALUES (?, ?, ?)', [
      strip,
      dev,
      123,
    ]);
    const snapshot = () =>
      [
        'work_item',
        'step_progress',
        'step_blockage',
        'command_journal',
        'event_log',
        'event_sequencer',
      ].map((table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot();
    h.sqlite.run(
      "CREATE TRIGGER refuse_child BEFORE INSERT ON work_item WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM step_blockage WHERE work_item_id = NEW.parent_id) BEGIN SELECT RAISE(ABORT, 'injected child failure'); END",
    );
    const created = await batch([
      { kind: 'createWorkItem', parentId: strip, afterId: null, name: 'Back boxes' },
    ]);
    expect(created.status).toBe(500);
    h.sqlite.run('DROP TRIGGER refuse_child');
    expect(facts()).toEqual([{ workItemId: strip, stepId: dev, blockedAt: 123 }]);
    expect(snapshot()).toEqual(before);
  });
});

describe('move blockage closure', () => {
  const snapshot = (journal = false) =>
    [
      'work_item',
      'step_progress',
      'step_blockage',
      ...(journal ? ['command_journal'] : []),
      'event_log',
      'event_sequencer',
    ].map((table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const facts = () =>
    h.sqlite
      .query(
        'SELECT work_item_id, step_id, blocked_at FROM step_blockage ORDER BY work_item_id, step_id',
      )
      .all();
  const block = (owner: string, step: string, at: number) =>
    h.sqlite.run('INSERT INTO step_blockage (work_item_id, step_id, blocked_at) VALUES (?, ?, ?)', [
      owner,
      step,
      at,
    ]);
  async function create(name: string, parentId: string | null = null): Promise<string> {
    const created = await batch([{ kind: 'createWorkItem', parentId, afterId: null, name }]);
    expect(created.status).toBe(200);
    const id = (created.body as { results?: { id?: string }[] }).results?.[0]?.id;
    if (id === undefined) throw new Error('move fixture row missing');
    return id;
  }
  async function move(owner: string, parentId: string | null) {
    return batch([{ kind: 'moveWorkItem', workItemId: owner, parentId, afterId: null }]);
  }
  async function arranged() {
    const moving = await create('Moving', strip);
    const destination = await create('Destination');
    block(moving, dev, -10);
    block(destination, dev, -20);
    block(destination, qa, -30);
    expect(
      (
        await batch([
          { kind: 'setProgress', workItemId: moving, stepId: dev, state: 'in_progress' },
          { kind: 'setProgress', workItemId: destination, stepId: dev, state: 'done' },
        ])
      ).status,
    ).toBe(200);
    return { moving, destination };
  }

  it('preserves exact mounted move facts and progress through one undo redo', async () => {
    const { moving, destination } = await arranged();
    const before = facts();
    expect((await move(moving, destination)).status).toBe(200);
    const after = facts();
    expect(after).toEqual(
      [
        { work_item_id: moving, step_id: dev, blocked_at: -10 },
        { work_item_id: strip, step_id: dev, blocked_at: -10 },
      ].sort((a, b) => a.work_item_id.localeCompare(b.work_item_id)),
    );
    const states = () =>
      h.sqlite
        .query('SELECT work_item_id, step_id, state FROM step_progress ORDER BY work_item_id')
        .all();
    expect(states()).toEqual([{ work_item_id: moving, step_id: dev, state: 'in_progress' }]);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    expect(facts()).toEqual(before);
    expect(states()).toEqual(
      [
        { work_item_id: moving, step_id: dev, state: 'in_progress' },
        { work_item_id: destination, step_id: dev, state: 'done' },
      ].sort((a, b) => a.work_item_id.localeCompare(b.work_item_id)),
    );
    expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(200);
    expect(facts()).toEqual(after);
    expect(states()).toEqual([{ work_item_id: moving, step_id: dev, state: 'in_progress' }]);
  });

  it('hands up each mounted step only when every former leaf has a direct fact', async () => {
    const moving = await create('Branch', strip);
    const first = await create('First', moving);
    const second = await create('Second', moving);
    block(first, dev, -30);
    block(second, dev, -10);
    block(first, qa, 123);
    expect(
      (await batch([{ kind: 'setProgress', workItemId: first, stepId: dev, state: 'done' }]))
        .status,
    ).toBe(200);
    const incoming = facts();
    expect((await move(moving, null)).status).toBe(200);
    expect(
      h.sqlite
        .query('SELECT step_id, blocked_at FROM step_blockage WHERE work_item_id = ?')
        .all(strip),
    ).toEqual([{ step_id: dev, blocked_at: -10 }]);
    expect(h.sqlite.query('SELECT * FROM step_progress WHERE work_item_id = ?').all(strip)).toEqual(
      [],
    );
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    expect(facts()).toEqual(incoming);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(200);
    expect(
      h.sqlite
        .query('SELECT step_id, blocked_at FROM step_blockage WHERE work_item_id = ?')
        .all(strip),
    ).toEqual([{ step_id: dev, blocked_at: -10 }]);
  });

  async function historicalMove() {
    const moving = await create('Child', strip);
    h.sqlite.run(
      'INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (?, ?, ?, ?)',
      [strip, dev, 'done', 123],
    );
    expect((await move(moving, null)).status).toBe(200);
    return moving;
  }

  it('preserves exact mounted historical progress through last-child move undo redo', async () => {
    const moving = await historicalMove();
    const historical = h.sqlite.query('SELECT * FROM step_progress').all();
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    expect(h.sqlite.query('SELECT * FROM step_progress').all()).toEqual(historical);
    expect(
      h.sqlite
        .query<{ parent_id: string }, [string]>('SELECT parent_id FROM work_item WHERE id = ?')
        .get(moving)?.parent_id,
    ).toBe(strip);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(200);
    expect(h.sqlite.query('SELECT * FROM step_progress').all()).toEqual(historical);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    expect(h.sqlite.query('SELECT * FROM step_progress').all()).toEqual(historical);
  });

  it.each(['state', 'time', 'extra', 'missing'] as const)(
    'refuses %s historical progress during mounted move undo with unchanged revisions',
    async (fault) => {
      await historicalMove();
      if (fault === 'state')
        h.sqlite.run(
          "UPDATE step_progress SET state = 'in_progress' WHERE work_item_id = ? AND step_id = ?",
          [strip, dev],
        );
      if (fault === 'time')
        h.sqlite.run(
          'UPDATE step_progress SET stated_at = 456 WHERE work_item_id = ? AND step_id = ?',
          [strip, dev],
        );
      if (fault === 'extra')
        h.sqlite.run(
          'INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (?, ?, ?, ?)',
          [strip, qa, 'done', 456],
        );
      if (fault === 'missing')
        h.sqlite.run('DELETE FROM step_progress WHERE work_item_id = ? AND step_id = ?', [
          strip,
          dev,
        ]);
      const before = snapshot();
      expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(409);
      expect(snapshot()).toEqual(before);
    },
  );

  it('excludes unrelated owners from historical move replay revisions', async () => {
    const unrelated = await create('Unrelated');
    await historicalMove();
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(200);
    h.sqlite.run('UPDATE work_item SET revision = revision + 1 WHERE id = ?', [unrelated]);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
  });

  it('requires empty leaf progress for a legacy move without a snapshot', async () => {
    const moving = await historicalMove();
    h.sqlite.run('UPDATE command_journal SET inverse = ? WHERE kind = ?', [
      JSON.stringify({ do: 'move', workItemId: moving, parentId: strip, afterId: null }),
      'move',
    ]);
    const before = snapshot();
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(409);
    expect(snapshot()).toEqual(before);
  });

  it('compares historical progress order independently and preserves every stored column', async () => {
    const moving = await create('Child', strip);
    h.sqlite.run(
      'INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (?, ?, ?, ?)',
      [strip, dev, 'done', 123],
    );
    h.sqlite.run(
      'INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (?, ?, ?, ?)',
      [strip, qa, 'in_progress', -30],
    );
    expect((await move(moving, null)).status).toBe(200);
    const historical = h.sqlite.query('SELECT * FROM step_progress ORDER BY step_id').all();
    h.sqlite.run('UPDATE command_journal SET inverse = ? WHERE kind = ?', [
      JSON.stringify({
        do: 'move',
        workItemId: moving,
        parentId: strip,
        afterId: null,
        expectedProgress: [
          { workItemId: strip, stepId: qa, state: 'in_progress', statedAt: -30 },
          { workItemId: strip, stepId: dev, state: 'done', statedAt: 123 },
        ],
      }),
      'move',
    ]);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    expect(h.sqlite.query('SELECT * FROM step_progress ORDER BY step_id').all()).toEqual(
      historical,
    );
  });

  it.each(['owner', 'step', 'state', 'time', 'duplicate'] as const)(
    'refuses malformed persisted historical move progress (%s)',
    async (fault) => {
      const moving = await historicalMove();
      const historical = { workItemId: strip, stepId: dev, state: 'done', statedAt: 123 };
      const malformed =
        fault === 'owner'
          ? { ...historical, workItemId: moving }
          : fault === 'step'
            ? { ...historical, stepId: 7 }
            : fault === 'state'
              ? { ...historical, state: 'unknown' }
              : fault === 'time'
                ? { ...historical, statedAt: 1.5 }
                : historical;
      h.sqlite.run('UPDATE command_journal SET inverse = ? WHERE kind = ?', [
        JSON.stringify({
          do: 'move',
          workItemId: moving,
          parentId: strip,
          afterId: null,
          expectedProgress: fault === 'duplicate' ? [historical, historical] : [malformed],
        }),
        'move',
      ]);
      const before = snapshot(true);
      expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(500);
      expect(snapshot(true)).toEqual(before);
    },
  );

  it('refuses a historical move snapshot naming a step outside the project', async () => {
    const moving = await historicalMove();
    h.sqlite.run('UPDATE command_journal SET inverse = ? WHERE kind = ?', [
      JSON.stringify({
        do: 'move',
        workItemId: moving,
        parentId: strip,
        afterId: null,
        expectedProgress: [
          { workItemId: strip, stepId: 'foreign-step', state: 'done', statedAt: 123 },
        ],
      }),
      'move',
    ]);
    const before = snapshot(true);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(404);
    expect(snapshot(true)).toEqual(before);
  });

  it('rebases neighboring parent edits across historical move undo redo', async () => {
    const moving = await create('Child', strip);
    h.sqlite.run(
      'INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (?, ?, ?, ?)',
      [strip, dev, 'done', 123],
    );
    block(moving, dev, 234);
    expect(
      (await batch([{ kind: 'patchWorkItem', workItemId: strip, patch: { name: 'Renamed' } }]))
        .status,
    ).toBe(200);
    const historical = h.sqlite.query('SELECT * FROM step_progress').all();
    expect((await move(moving, null)).status).toBe(200);
    for (const direction of ['undo', 'undo', 'redo', 'redo', 'undo'] as const) {
      expect((await h.call('ada', 'POST', `/api/projects/${project}/${direction}`)).status).toBe(
        200,
      );
      expect(h.sqlite.query('SELECT * FROM step_progress').all()).toEqual(historical);
    }
  });

  it('refuses a guarded historical move snapshot without a destination', async () => {
    const moving = await historicalMove();
    h.sqlite.run('UPDATE command_journal SET inverse = ? WHERE kind = ?', [
      JSON.stringify({
        do: 'move',
        workItemId: moving,
        parentId: null,
        afterId: null,
        expectedProgress: [],
      }),
      'move',
    ]);
    const before = snapshot(true);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(500);
    expect(snapshot(true)).toEqual(before);
  });

  it('tracks the historical owner revision after redo before the second undo', async () => {
    await historicalMove();
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(200);
    h.sqlite.run('UPDATE work_item SET revision = revision + 1 WHERE id = ?', [strip]);
    const before = snapshot();
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(409);
    expect(snapshot()).toEqual(before);
  });

  it.each(['undo', 'redo'] as const)(
    'refuses residual leaf progress atomically on move %s despite unchanged revisions',
    async (direction) => {
      const { moving, destination } = await arranged();
      expect((await move(moving, destination)).status).toBe(200);
      if (direction === 'redo')
        expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
      const owner = direction === 'undo' ? strip : destination;
      h.sqlite.run(
        'INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (?, ?, ?, ?)',
        [owner, qa, 'done', 456],
      );
      const before = snapshot();
      expect((await h.call('ada', 'POST', `/api/projects/${project}/${direction}`)).status).toBe(
        409,
      );
      expect(snapshot()).toEqual(before);
    },
  );

  it.each(['undo', 'redo'] as const)(
    'refuses other-step residual leaf blockage atomically on move %s despite unchanged revisions',
    async (direction) => {
      const moving = await create('Moving', strip);
      const destination = await create('Destination');
      block(moving, dev, 123);
      block(destination, dev, 234);
      expect((await move(moving, destination)).status).toBe(200);
      if (direction === 'redo')
        expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
      block(direction === 'undo' ? strip : destination, qa, 456);
      const before = snapshot();
      expect((await h.call('ada', 'POST', `/api/projects/${project}/${direction}`)).status).toBe(
        409,
      );
      expect(snapshot()).toEqual(before);
    },
  );

  it.each(['undo', 'redo'] as const)(
    'refuses changed expected blockage atomically on move %s',
    async (direction) => {
      const { moving, destination } = await arranged();
      expect((await move(moving, destination)).status).toBe(200);
      if (direction === 'redo')
        expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
      h.sqlite.run(
        'UPDATE step_blockage SET blocked_at = 456 WHERE work_item_id = ? AND step_id = ?',
        [direction === 'undo' ? strip : destination, dev],
      );
      const before = snapshot();
      expect((await h.call('ada', 'POST', `/api/projects/${project}/${direction}`)).status).toBe(
        409,
      );
      expect(snapshot()).toEqual(before);
    },
  );

  /** Proof: bypassing exact comparison or committing a refused SQLite UOW failed the second-fact refusal and snapshot; watched 2026-10-14. */
  it.each(['state', 'time', 'missing'] as const)(
    'refuses a changed recorded destination progress %s before redo clears it',
    async (fault) => {
      const { moving, destination } = await arranged();
      expect((await move(moving, destination)).status).toBe(200);
      expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
      if (fault === 'state')
        h.sqlite.run(
          "UPDATE step_progress SET state = 'in_progress' WHERE work_item_id = ? AND step_id = ?",
          [destination, dev],
        );
      if (fault === 'time')
        h.sqlite.run(
          'UPDATE step_progress SET stated_at = 456 WHERE work_item_id = ? AND step_id = ?',
          [destination, dev],
        );
      if (fault === 'missing')
        h.sqlite.run('DELETE FROM step_progress WHERE work_item_id = ? AND step_id = ?', [
          destination,
          dev,
        ]);
      const before = snapshot();
      expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(409);
      expect(snapshot()).toEqual(before);
    },
  );

  it('rebases cleared destination progress timestamps through neighboring progress undo redo', async () => {
    const moving = await create('Incoming');
    expect(
      (await batch([{ kind: 'setProgress', workItemId: strip, stepId: dev, state: 'done' }]))
        .status,
    ).toBe(200);
    expect((await move(moving, strip)).status).toBe(200);
    for (const direction of ['undo', 'undo', 'redo', 'redo'] as const) {
      expect((await h.call('ada', 'POST', `/api/projects/${project}/${direction}`)).status).toBe(
        200,
      );
    }
    expect(h.sqlite.query('SELECT * FROM step_progress WHERE work_item_id = ?').all(strip)).toEqual(
      [],
    );
  });

  function replaceMoveProgress(moveProgress: unknown): void {
    const row = h.sqlite
      .query<{ id: string; preconditions: string }, []>(
        "SELECT id, preconditions FROM command_journal WHERE kind = 'move' ORDER BY seq DESC LIMIT 1",
      )
      .get();
    if (row === null) throw new Error('move history missing');
    const preconditions = JSON.parse(row.preconditions) as Record<string, unknown>;
    h.sqlite.run('UPDATE command_journal SET preconditions = ? WHERE id = ?', [
      JSON.stringify({ ...preconditions, moveProgress }),
      row.id,
    ]);
  }

  it.each(['map', 'owner', 'duplicate'] as const)(
    'refuses malformed persisted destination progress preconditions (%s)',
    async (fault) => {
      const { moving, destination } = await arranged();
      expect((await move(moving, destination)).status).toBe(200);
      const fact = { workItemId: destination, stepId: dev, state: 'done', statedAt: 123 };
      replaceMoveProgress(
        fault === 'map'
          ? null
          : { [destination]: fault === 'owner' ? [{ ...fact, workItemId: moving }] : [fact, fact] },
      );
      const before = snapshot(true);
      expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(500);
      expect(snapshot(true)).toEqual(before);
    },
  );

  it('scopes destination progress metadata step references before replay', async () => {
    const { moving, destination } = await arranged();
    expect((await move(moving, destination)).status).toBe(200);
    replaceMoveProgress({
      [destination]: [
        { workItemId: destination, stepId: 'foreign-step', state: 'done', statedAt: 123 },
      ],
    });
    const before = snapshot(true);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(404);
    expect(snapshot(true)).toEqual(before);
  });

  it('preserves stale destination snapshots when neighboring replay revisions do not match', async () => {
    const moving = await create('Incoming');
    expect(
      (await batch([{ kind: 'setProgress', workItemId: strip, stepId: dev, state: 'done' }]))
        .status,
    ).toBe(200);
    expect((await move(moving, strip)).status).toBe(200);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    const path = `$.expected."${strip}"`;
    h.sqlite.run(
      "UPDATE command_journal SET preconditions = json_set(preconditions, ?, json_extract(preconditions, ?) - 1) WHERE kind = 'move'",
      [path, path],
    );
    const guarded = () =>
      h.sqlite
        .query<{ snapshot: string }, []>(
          "SELECT json_extract(preconditions, '$.moveProgress') AS snapshot FROM command_journal WHERE kind = 'move'",
        )
        .get()?.snapshot;
    const expected = guarded();
    expect(expected).toBeDefined();
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(200);
    expect(guarded()).toBe(expected);
    const before = snapshot();
    expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(409);
    expect(snapshot()).toEqual(before);
  });

  it('guards destination progress before a collected move replay batch', async () => {
    const { moving, destination } = await arranged();
    expect(
      (
        await batch([
          { kind: 'moveWorkItem', workItemId: moving, parentId: destination, afterId: null },
          {
            kind: 'patchWorkItem',
            workItemId: destination,
            patch: { name: 'Renamed destination' },
          },
        ])
      ).status,
    ).toBe(200);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    h.sqlite.run(
      "UPDATE step_progress SET state = 'in_progress' WHERE work_item_id = ? AND step_id = ?",
      [destination, dev],
    );
    const before = snapshot();
    expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(409);
    expect(snapshot()).toEqual(before);
  });

  it('scopes empty destination progress metadata owners before replay', async () => {
    const { moving, destination } = await arranged();
    expect((await move(moving, destination)).status).toBe(200);
    const foreignProject = await h.call('ada', 'POST', '/api/projects', { name: 'Other plan' });
    expect(foreignProject.status).toBe(200);
    const foreignId = (foreignProject.body as { project: { id: string } }).project.id;
    const created = await h.call('ada', 'POST', `/api/projects/${foreignId}/commands`, {
      commands: [
        { kind: 'createWorkItem', parentId: null, afterId: null, name: 'Other destination' },
      ],
    });
    expect(created.status).toBe(200);
    const owner = (created.body as { results: { id: string }[] }).results.at(0)?.id;
    if (owner === undefined) throw new Error('foreign metadata fixture missing');
    replaceMoveProgress({ [owner]: [] });
    const before = snapshot(true);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(404);
    expect(snapshot(true)).toEqual(before);
  });

  it('preserves stale move progress through an unrelated rename undo redo', async () => {
    const moving = await create('Incoming');
    expect(
      (await batch([{ kind: 'setProgress', workItemId: strip, stepId: dev, state: 'done' }]))
        .status,
    ).toBe(200);
    expect(
      (await batch([{ kind: 'patchWorkItem', workItemId: strip, patch: { name: 'Renamed' } }]))
        .status,
    ).toBe(200);
    expect((await move(moving, strip)).status).toBe(200);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    h.sqlite.run(
      "UPDATE step_progress SET state = 'in_progress', stated_at = 456 WHERE work_item_id = ? AND step_id = ?",
      [strip, dev],
    );
    const facts = h.sqlite.query('SELECT * FROM step_progress ORDER BY rowid').all();
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(200);
    expect(h.sqlite.query('SELECT * FROM step_progress ORDER BY rowid').all()).toEqual(facts);
    const before = snapshot();
    expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(409);
    expect(snapshot()).toEqual(before);
  });

  it.each(['state', 'time', 'missing', 'extra', 'batch'] as const)(
    'preserves unrelated QA %s through neighboring Dev progress undo redo',
    async (fault) => {
      const moving = await create('Incoming');
      if (fault !== 'extra')
        h.sqlite.run(
          'INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (?, ?, ?, ?)',
          [strip, qa, 'done', 123],
        );
      expect(
        (
          await batch([
            { kind: 'setProgress', workItemId: strip, stepId: dev, state: 'done' },
            ...(fault === 'batch'
              ? [{ kind: 'patchWorkItem', workItemId: strip, patch: { name: 'Renamed' } }]
              : []),
          ])
        ).status,
      ).toBe(200);
      expect((await move(moving, strip)).status).toBe(200);
      expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
      const guarded = () =>
        h.sqlite
          .query<{ snapshot: string }, []>(
            "SELECT json_extract(preconditions, '$.moveProgress') AS snapshot FROM command_journal WHERE kind = 'move'",
          )
          .get()?.snapshot;
      const expected = guarded();
      expect(expected).toBeDefined();
      if (fault === 'state' || fault === 'batch')
        h.sqlite.run(
          "UPDATE step_progress SET state = 'in_progress' WHERE work_item_id = ? AND step_id = ?",
          [strip, qa],
        );
      if (fault === 'time')
        h.sqlite.run(
          'UPDATE step_progress SET stated_at = 456 WHERE work_item_id = ? AND step_id = ?',
          [strip, qa],
        );
      if (fault === 'missing')
        h.sqlite.run('DELETE FROM step_progress WHERE work_item_id = ? AND step_id = ?', [
          strip,
          qa,
        ]);
      if (fault === 'extra')
        h.sqlite.run(
          'INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (?, ?, ?, ?)',
          [strip, qa, 'in_progress', 456],
        );
      expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
      expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(200);
      expect(guarded()).toBe(expected);
      const before = snapshot();
      expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(409);
      expect(snapshot()).toEqual(before);
    },
  );

  it('rebases Dev writes while preserving untouched QA snapshots', async () => {
    const moving = await create('Incoming');
    h.sqlite.run(
      'INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (?, ?, ?, ?)',
      [strip, qa, 'done', 123],
    );
    expect(
      (await batch([{ kind: 'setProgress', workItemId: strip, stepId: dev, state: 'done' }]))
        .status,
    ).toBe(200);
    expect((await move(moving, strip)).status).toBe(200);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    const qaRows = () =>
      h.sqlite
        .query('SELECT * FROM step_progress WHERE work_item_id = ? AND step_id = ?')
        .all(strip, qa);
    const untouched = qaRows();
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    expect(qaRows()).toEqual(untouched);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(200);
    expect(qaRows()).toEqual(untouched);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(200);
    expect(qaRows()).toEqual([]);
  });

  it('rolls back earlier replay steps when a later destination replacement refuses', async () => {
    const { moving, destination } = await arranged();
    expect((await move(moving, destination)).status).toBe(200);
    expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
    h.sqlite.run(
      'UPDATE step_blockage SET blocked_at = 456 WHERE work_item_id = ? AND step_id = ?',
      [destination, qa],
    );
    const before = snapshot();
    expect((await h.call('ada', 'POST', `/api/projects/${project}/redo`)).status).toBe(409);
    expect(snapshot()).toEqual(before);
  });

  /** Proof: committing the exception path left destination facts cleared and failed the exact snapshot; watched 2026-10-14. */
  it('rolls back destination clears when the SQLite parent_id write fails', async () => {
    const { moving, destination } = await arranged();
    const before = snapshot(true);
    h.sqlite.run(
      "CREATE TRIGGER refuse_move BEFORE UPDATE OF parent_id ON work_item WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM step_blockage WHERE work_item_id = NEW.parent_id) AND NOT EXISTS (SELECT 1 FROM step_progress WHERE work_item_id = NEW.parent_id) BEGIN SELECT RAISE(ABORT, 'injected move failure'); END",
    );
    expect((await move(moving, destination)).status).toBe(500);
    h.sqlite.run('DROP TRIGGER refuse_move');
    expect(snapshot(true)).toEqual(before);
  });
});

describe('deletion blockage preservation', () => {
  async function create(name: string, parentId: string | null): Promise<string> {
    const answer = await batch([{ kind: 'createWorkItem', parentId, afterId: null, name }]);
    if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
    const owner = (answer.body as { results: { id: string }[] }).results.at(0)?.id;
    if (owner === undefined) throw new Error('missing created owner');
    return owner;
  }
  function block(owner: string, step: string, at: number): void {
    h.sqlite.run('INSERT INTO step_blockage (work_item_id, step_id, blocked_at) VALUES (?, ?, ?)', [
      owner,
      step,
      at,
    ]);
  }
  const facts = () =>
    h.sqlite
      .query(
        'SELECT work_item_id, step_id, blocked_at FROM step_blockage ORDER BY work_item_id, step_id',
      )
      .all();
  const states = () =>
    h.sqlite
      .query(
        'SELECT work_item_id, step_id, state, stated_at FROM step_progress ORDER BY work_item_id, step_id',
      )
      .all();
  const snapshot = () => ({
    facts: facts(),
    states: states(),
    rows: h.sqlite.query('SELECT * FROM work_item ORDER BY id').all(),
    events: h.sqlite.query('SELECT * FROM event_log ORDER BY seq').all(),
    journal: h.sqlite.query('SELECT * FROM command_journal ORDER BY seq').all(),
  });
  const remove = (owner: string, strategy: 'cascade' | 'promote' | null = null) =>
    batch([
      { kind: 'deleteWorkItem', workItemId: owner, ...(strategy === null ? {} : { strategy }) },
    ]);
  const undo = () => h.call('ada', 'POST', `/api/projects/${project}/undo`);
  const redo = () => h.call('ada', 'POST', `/api/projects/${project}/redo`);

  it('preserves root leaf exact done blockage and time through mounted delete undo redo', async () => {
    expect(
      (await batch([{ kind: 'setProgress', workItemId: strip, stepId: dev, state: 'done' }]))
        .status,
    ).toBe(200);
    block(strip, dev, -30);
    const before = { facts: facts(), states: states() };
    expect((await remove(strip)).status).toBe(200);
    expect(facts()).toEqual([]);
    expect((await undo()).status).toBe(200);
    expect({ facts: facts(), states: states() }).toEqual(before);
    expect((await redo()).status).toBe(200);
    expect(facts()).toEqual([]);
  });

  it('folds deletion progress while handing up only unanimous direct blockage including negative times', async () => {
    const branch = await create('Branch', strip);
    const first = await create('First', branch);
    const second = await create('Second', branch);
    block(first, dev, -30);
    block(second, dev, -10);
    block(first, qa, 123);
    expect(
      (
        await batch([
          { kind: 'setProgress', workItemId: first, stepId: dev, state: 'done' },
          { kind: 'setProgress', workItemId: second, stepId: dev, state: 'done' },
        ])
      ).status,
    ).toBe(200);
    const before = { facts: facts(), states: states() };
    expect((await remove(branch, 'cascade')).status).toBe(200);
    expect(facts()).toEqual([{ work_item_id: strip, step_id: dev, blocked_at: -10 }]);
    expect(states()).toMatchObject([{ work_item_id: strip, step_id: dev, state: 'done' }]);
    expect((await undo()).status).toBe(200);
    expect({ facts: facts(), states: states() }).toEqual(before);
    expect((await redo()).status).toBe(200);
    expect(facts()).toEqual([{ work_item_id: strip, step_id: dev, blocked_at: -10 }]);
  });

  it.each(['state', 'time', 'extra', 'missing'] as const)(
    'refuses parent progress %s before undo removal with unchanged revisions',
    async (fault) => {
      const leaf = await create('Child', strip);
      block(leaf, dev, 10);
      expect(
        (await batch([{ kind: 'setProgress', workItemId: leaf, stepId: dev, state: 'done' }]))
          .status,
      ).toBe(200);
      expect((await remove(leaf)).status).toBe(200);
      if (fault === 'state')
        h.sqlite.run("UPDATE step_progress SET state = 'in_progress' WHERE work_item_id = ?", [
          strip,
        ]);
      if (fault === 'time')
        h.sqlite.run('UPDATE step_progress SET stated_at = -44 WHERE work_item_id = ?', [strip]);
      if (fault === 'extra')
        h.sqlite.run(
          "INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (?, ?, 'done', 44)",
          [strip, qa],
        );
      if (fault === 'missing')
        h.sqlite.run('DELETE FROM step_progress WHERE work_item_id = ?', [strip]);
      const before = snapshot();
      expect((await undo()).status).toBe(409);
      const after = snapshot();
      expect({ ...after, journal: [] }).toEqual({ ...before, journal: [] });
      expect(after.journal).toHaveLength(before.journal.length - 1);
    },
  );

  it.each(['changed', 'missing', 'extra'] as const)(
    'refuses subtree blockage %s on redo without losing facts',
    async (fault) => {
      block(strip, dev, 10);
      expect((await remove(strip)).status).toBe(200);
      expect((await undo()).status).toBe(200);
      if (fault === 'changed')
        h.sqlite.run('UPDATE step_blockage SET blocked_at = 20 WHERE work_item_id = ?', [strip]);
      if (fault === 'missing')
        h.sqlite.run('DELETE FROM step_blockage WHERE work_item_id = ?', [strip]);
      if (fault === 'extra') block(strip, qa, 30);
      const before = snapshot();
      expect((await redo()).status).toBe(409);
      expect({ ...snapshot(), journal: [] }).toEqual({ ...before, journal: [] });
    },
  );

  it('refuses unrecorded parent blockage before undo changes a leaf into a parent', async () => {
    const leaf = await create('Child', strip);
    block(leaf, dev, 10);
    expect((await remove(leaf)).status).toBe(200);
    block(strip, qa, 20);
    const before = snapshot();
    expect((await undo()).status).toBe(409);
    expect({ ...snapshot(), journal: [] }).toEqual({ ...before, journal: [] });
  });

  it('retains historical parent progress through deletion undo redo', async () => {
    const leaf = await create('Child', strip);
    h.sqlite.run(
      "INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES (?, ?, 'in_progress', -123)",
      [strip, dev],
    );
    expect(
      (await batch([{ kind: 'setProgress', workItemId: leaf, stepId: dev, state: 'done' }])).status,
    ).toBe(200);
    const before = states();
    expect((await remove(leaf)).status).toBe(200);
    expect(states()).toMatchObject([{ work_item_id: strip, state: 'done' }]);
    expect((await undo()).status).toBe(200);
    expect(states()).toEqual(before);
    expect((await redo()).status).toBe(200);
    expect(states()).toMatchObject([{ work_item_id: strip, state: 'done' }]);
  });

  it('preserves child blockage while deleting and undoing its parent by promotion', async () => {
    const child = await create('Child', strip);
    block(child, dev, 10);
    const before = facts();
    expect((await remove(strip, 'promote')).status).toBe(200);
    expect(facts()).toEqual(before);
    expect((await undo()).status).toBe(200);
    expect(facts()).toEqual(before);
    expect((await redo()).status).toBe(200);
    expect(facts()).toEqual(before);
  });

  it('rolls back a mixed delete batch after a later refusal', async () => {
    block(strip, dev, 10);
    const before = snapshot();
    expect(
      (
        await batch([
          { kind: 'deleteWorkItem', workItemId: strip },
          { kind: 'patchWorkItem', workItemId: 'missing', patch: { name: 'Lost' } },
        ])
      ).status,
    ).toBe(404);
    expect(snapshot()).toEqual(before);
  });

  it('rolls back all restore writes after a blockage insertion fails midway', async () => {
    block(strip, dev, 10);
    block(strip, qa, 20);
    expect((await remove(strip)).status).toBe(200);
    const before = snapshot();
    h.sqlite.run(
      `CREATE TRIGGER fail_blockage BEFORE INSERT ON step_blockage WHEN NEW.step_id = '${qa}' BEGIN SELECT RAISE(ABORT, 'injected blockage failure'); END`,
    );
    expect((await undo()).status).toBe(500);
    expect(snapshot()).toEqual(before);
  });
  it('rebases parent rename and progress through deletion flip and neighboring replay', async () => {
    const leaf = await create('Child', strip);
    block(leaf, dev, 10);
    expect(
      (
        await batch([
          { kind: 'patchWorkItem', workItemId: strip, patch: { name: 'Before deletion' } },
        ])
      ).status,
    ).toBe(200);
    expect((await remove(leaf)).status).toBe(200);
    for (const direction of ['undo', 'undo', 'redo', 'redo', 'undo'] as const) {
      expect((await h.call('ada', 'POST', `/api/projects/${project}/${direction}`)).status).toBe(
        200,
      );
    }
    expect(facts()).toEqual([{ work_item_id: leaf, step_id: dev, blocked_at: 10 }]);
  });

  it('preserves a collected mounted deletion and parent patch as one undo unit', async () => {
    const leaf = await create('Child', strip);
    block(leaf, dev, 10);
    const before = facts();
    expect(
      (
        await batch([
          { kind: 'deleteWorkItem', workItemId: leaf },
          { kind: 'patchWorkItem', workItemId: strip, patch: { name: 'After deletion' } },
        ])
      ).status,
    ).toBe(200);
    expect((await undo()).status).toBe(200);
    expect(facts()).toEqual(before);
    expect((await redo()).status).toBe(200);
    expect(facts()).toEqual([{ work_item_id: strip, step_id: dev, blocked_at: 10 }]);
  });

  it('refuses deletion replay whose complete parent progress snapshot was removed', async () => {
    const leaf = await create('Child', strip);
    expect((await remove(leaf)).status).toBe(200);
    h.sqlite.run(
      "UPDATE command_journal SET preconditions = json_remove(preconditions, '$.moveProgress') WHERE kind = 'delete'",
    );
    const before = snapshot();
    expect((await undo()).status).toBe(500);
    expect(snapshot()).toEqual(before);
  });
  it.each(['null', 'owner', 'time', 'duplicate', 'parent', 'progress'] as const)(
    'refuses malformed persisted deletion metadata %s without writes',
    async (fault) => {
      block(strip, dev, 10);
      expect((await remove(strip)).status).toBe(200);
      const journal = h.sqlite
        .query<{ id: string; inverse: string }, []>(
          "SELECT id, inverse FROM command_journal WHERE kind = 'delete' ORDER BY seq DESC LIMIT 1",
        )
        .get();
      if (journal === null) throw new Error('missing deletion journal');
      const inverse = JSON.parse(journal.inverse) as {
        deletionState: {
          blockages: { workItemId: string; stepId: string; blockedAt: number }[];
          parentId: string | null;
          restoredParentProgress: unknown;
        } | null;
      };
      const metadata = inverse.deletionState;
      if (metadata === null) throw new Error('missing deletion state');
      const first = metadata.blockages.at(0);
      if (first === undefined) throw new Error('missing recorded blockage');
      if (fault === 'null') inverse.deletionState = null;
      if (fault === 'owner') first.workItemId = 'stray';
      if (fault === 'time') first.blockedAt = 1.5;
      if (fault === 'duplicate') metadata.blockages.push({ ...first });
      if (fault === 'parent') metadata.parentId = '';
      if (fault === 'progress') metadata.restoredParentProgress = null;
      h.sqlite.run('UPDATE command_journal SET inverse = ? WHERE id = ?', [
        JSON.stringify(inverse),
        journal.id,
      ]);
      const before = snapshot();
      const inserting = spyOn(SubtreeRepository.prototype, 'insertSubtree');
      try {
        expect((await undo()).status).toBe(500);
        expect(inserting).not.toHaveBeenCalled();
        expect(snapshot()).toEqual(before);
      } finally {
        inserting.mockRestore();
      }
    },
  );

  it('refuses deletion metadata that names a different removal parent', async () => {
    const other = await create('Other', null);
    expect((await remove(strip)).status).toBe(200);
    expect((await undo()).status).toBe(200);
    const journal = h.sqlite
      .query<{ id: string; payload: string; preconditions: string }, []>(
        "SELECT id, payload, preconditions FROM command_journal WHERE kind = 'delete' ORDER BY seq DESC LIMIT 1",
      )
      .get();
    if (journal === null) throw new Error('missing delete entry');
    const payload = JSON.parse(journal.payload) as {
      forward: { deletionState: { parentId: string | null } };
    };
    const preconditions = JSON.parse(journal.preconditions) as Record<string, unknown>;
    payload.forward.deletionState.parentId = other;
    h.sqlite.run('UPDATE command_journal SET payload = ?, preconditions = ? WHERE id = ?', [
      JSON.stringify(payload),
      JSON.stringify({ ...preconditions, moveProgress: { [other]: [] } }),
      journal.id,
    ]);
    const before = snapshot();
    expect((await redo()).status).toBe(500);
    expect(snapshot()).toEqual(before);
  });
  it('keeps an empty deletion parent revision tracked after flip', async () => {
    const leaf = await create('Child', strip);
    expect((await remove(leaf)).status).toBe(200);
    expect((await undo()).status).toBe(200);
    h.sqlite.run("UPDATE work_item SET name = 'Peer edit', revision = revision + 1 WHERE id = ?", [
      strip,
    ]);
    const before = snapshot();
    expect((await redo()).status).toBe(409);
    expect({ ...snapshot(), journal: [] }).toEqual({ ...before, journal: [] });
  });

  it('rebases deletion parent timestamps only through neighboring progress writes', async () => {
    const leaf = await create('Child', strip);
    expect(
      (await batch([{ kind: 'setProgress', workItemId: leaf, stepId: dev, state: 'done' }])).status,
    ).toBe(200);
    expect((await remove(leaf)).status).toBe(200);
    expect(
      (await batch([{ kind: 'setProgress', workItemId: strip, stepId: dev, state: 'in_progress' }]))
        .status,
    ).toBe(200);
    for (const direction of ['undo', 'undo', 'redo', 'redo'] as const)
      expect((await h.call('ada', 'POST', `/api/projects/${project}/${direction}`)).status).toBe(
        200,
      );
    expect(states()).toMatchObject([{ work_item_id: strip, step_id: dev, state: 'in_progress' }]);
  });
});

describe('project-step blockage deletion', () => {
  const block = () =>
    h.sqlite.run('INSERT INTO step_blockage (work_item_id, step_id, blocked_at) VALUES (?, ?, ?)', [
      strip,
      dev,
      -52,
    ]);
  const snapshot = () =>
    ['work_item', 'step', 'step_progress', 'step_blockage', 'event_log', 'event_sequencer'].map(
      (table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    );

  it.each(['unknown', 'done'])(
    'returns typed 409 with direct blockage count beneath %s progress',
    async (state) => {
      block();
      if (state === 'done')
        expect(
          (await batch([{ kind: 'setProgress', workItemId: strip, stepId: dev, state }])).status,
        ).toBe(200);
      const before = snapshot();
      const refused = await h.call('ada', 'DELETE', `/api/projects/${project}/steps/${dev}`);
      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ error: 'in_use', inUse: { blockages: 1 } });
      expect(snapshot()).toEqual(before);
      expect(
        (await h.call('ada', 'DELETE', `/api/projects/${project}/steps/${dev}?cascade=true`))
          .status,
      ).toBe(204);
      expect(h.sqlite.query('SELECT * FROM step_blockage').all()).toEqual([]);
      expect(h.sqlite.query('SELECT * FROM step WHERE id = ?').all(dev)).toEqual([]);
    },
  );

  it('rolls back the mounted cascade after facts, step and owner revisions have been written', async () => {
    block();
    const before = snapshot();
    const historyBefore = h.sqlite.query('SELECT * FROM command_journal ORDER BY seq').all();
    h.sqlite.run(
      "CREATE TRIGGER refuse_project_bump BEFORE UPDATE ON project BEGIN SELECT RAISE(ABORT, 'injected project bump failure'); END",
    );
    expect(
      (await h.call('ada', 'DELETE', `/api/projects/${project}/steps/${dev}?cascade=true`)).status,
    ).toBe(500);
    expect(snapshot()).toEqual(before);
    expect(h.sqlite.query('SELECT * FROM command_journal ORDER BY seq').all()).toEqual(
      historyBefore,
    );
  });

  it.each(['undo', 'redo'] as const)(
    'refuses deletion %s history after its recorded step is removed',
    async (direction) => {
      block();
      expect((await batch([{ kind: 'deleteWorkItem', workItemId: strip }])).status).toBe(200);
      if (direction === 'redo')
        expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
      expect(
        (await h.call('ada', 'DELETE', `/api/projects/${project}/steps/${dev}?cascade=true`))
          .status,
      ).toBe(204);
      h.sqlite.run(
        "UPDATE command_journal SET preconditions = json_set(preconditions, '$.expected', json('{}'))",
      );
      const before = snapshot();
      expect((await h.call('ada', 'POST', `/api/projects/${project}/${direction}`)).status).toBe(
        404,
      );
      expect(snapshot()).toEqual(before);
    },
  );

  it.each(['undo', 'redo'] as const)(
    'refuses old first-child %s after confirmed project-step deletion',
    async (direction) => {
      block();
      const created = await batch([
        { kind: 'createWorkItem', parentId: strip, afterId: null, name: 'Child' },
      ]);
      expect(created.status).toBe(200);
      if (direction === 'redo')
        expect((await h.call('ada', 'POST', `/api/projects/${project}/undo`)).status).toBe(200);
      expect(
        (await h.call('ada', 'DELETE', `/api/projects/${project}/steps/${dev}?cascade=true`))
          .status,
      ).toBe(204);
      const before = snapshot();
      // Remove revision evidence so step reference validation must itself refuse replay.
      h.sqlite.run(
        "UPDATE command_journal SET preconditions = json_set(preconditions, '$.expected', json('{}'))",
      );
      expect((await h.call('ada', 'POST', `/api/projects/${project}/${direction}`)).status).toBe(
        404,
      );
      expect(snapshot()).toEqual(before);
    },
  );
});

function admissionSnapshot() {
  return Object.fromEntries(
    ['work_item', 'step_blockage', 'command_journal', 'plan_event', 'project'].map((table) => [
      table,
      h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ]),
  );
}

it('refuses mounted deletion with retained facts atomically while writer admission is disabled', async () => {
  h.sqlite.run('INSERT INTO step_blockage (work_item_id,step_id,blocked_at) VALUES (?,?,?)', [
    strip,
    dev,
    17,
  ]);
  h.sqlite.run("UPDATE step_blockage_activation SET state='DISABLED'");
  const before = admissionSnapshot();
  const refused = await batch([
    { kind: 'patchWorkItem', workItemId: strip, patch: { name: 'changed' } },
    { kind: 'deleteWorkItem', workItemId: strip },
  ]);
  expect(refused.status).toBe(409);
  expect(refused.body).toEqual({ error: 'step_blockage_inactive' });
  expect(admissionSnapshot()).toEqual(before);
});

it('refuses mounted undo and redo of empty nested structural snapshots without cursor or revision changes', async () => {
  const deleted = await batch([{ kind: 'deleteWorkItem', workItemId: strip }]);
  expect(deleted.status).toBe(200);
  h.sqlite.run("UPDATE step_blockage_activation SET state='DISABLED'");
  const deletedState = admissionSnapshot();
  const refusedUndo = await h.call('ada', 'POST', `/api/projects/${project}/undo`);
  expect(refusedUndo.status).toBe(409);
  expect(refusedUndo.body).toEqual({ error: 'step_blockage_inactive' });
  expect(admissionSnapshot()).toEqual(deletedState);
  activateTestStepBlockages(h.sqlite.filename);
  const undone = await h.call('ada', 'POST', `/api/projects/${project}/undo`);
  expect(undone.status).toBe(200);
  h.sqlite.run("UPDATE step_blockage_activation SET state='DISABLED'");
  const restoredState = admissionSnapshot();
  const refusedRedo = await h.call('ada', 'POST', `/api/projects/${project}/redo`);
  expect(refusedRedo.status).toBe(409);
  expect(refusedRedo.body).toEqual({ error: 'step_blockage_inactive' });
  expect(admissionSnapshot()).toEqual(restoredState);
});
