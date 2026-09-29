import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * Shared people (`share-people-across-projects`, slice 6) over be-01's
 * production composition and real SQLite. Organization A ranks Platform above
 * Billing above Search, by creation; Ana and Ben are its people. The mode is
 * switched in SQL: its route is slice 8.
 */
let h: OrganizationHarness;
let platform: string;
let billing: string;
let search: string;

const START = '2026-10-05';

interface SliceBody {
  workItemId: string;
  stepId: string | null;
  personId: string | null;
  earliestStart: number;
  earliestFinish: number;
  boundBy: string;
  elsewhereHolder?: { projectId: string; workItemId: string };
}

async function create(name: string): Promise<string> {
  const answer = await h.call('ada', 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

/**
 * One work item on `projectId`, from {@link START} unless `dated` is false:
 * each entry sets the days and the person of the project's step at `step`.
 */
async function plan(
  projectId: string,
  work: { step: number; days: number; personId: string }[],
  dated = true,
): Promise<void> {
  if (dated) await h.call('ada', 'PATCH', `/api/projects/${projectId}`, { startDate: START });
  const read = await h.call('ada', 'GET', `/api/projects/${projectId}`);
  const steps = (read.body as { steps: { id: string }[] }).steps;
  const applied = await h.call('ada', 'POST', `/api/projects/${projectId}/commands`, {
    commands: [
      { kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Work' },
      ...work.flatMap(({ step, days, personId }) => {
        const stepId = steps.at(step)?.id;
        if (stepId === undefined) throw new Error(`the project has no step ${String(step)}`);
        return [
          {
            kind: 'setEstimate',
            workItemRef: 'w',
            stepId,
            days: { optimistic: days, realistic: days, pessimistic: days },
          },
          { kind: 'setAssignee', workItemRef: 'w', stepId, personId },
        ];
      }),
    ],
  });
  if (applied.status !== 200) throw new Error(`plan refused: ${JSON.stringify(applied)}`);
}

async function slicesOf(projectId: string): Promise<SliceBody[]> {
  const answer = await h.call('ada', 'GET', `/api/projects/${projectId}/work-items`);
  if (answer.status !== 200) throw new Error(`read refused: ${JSON.stringify(answer)}`);
  return (answer.body as { slices: SliceBody[] }).slices;
}

/** Where each slice of `personId` that holds time starts; an empty step's slice holds none. */
async function startOf(projectId: string, personId: string): Promise<number[]> {
  return (await slicesOf(projectId))
    .filter((slice) => slice.personId === personId && slice.earliestFinish > slice.earliestStart)
    .map((slice) => slice.earliestStart);
}

const share = () => h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  await h.register('ada');
  h.organization('org-a');
  h.member('org-a', 'ada', 'admin');
  h.bind('ada', 'org-a');
  h.activate();
  platform = await create('Platform');
  billing = await create('Billing');
  search = await create('Search');
  for (const [id, name] of [
    ['pe-a', 'Ana'],
    ['pe-b', 'Ben'],
  ]) {
    h.sqlite.run(`INSERT INTO person (id, name) VALUES ('${id}', 'root-${name}')`);
    h.sqlite.run(
      `INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('${id}', 'org-a', '${name}')`,
    );
  }
});

afterEach(() => {
  h.close();
});

describe('an isolated organization', () => {
  it("keeps an isolated organization's dates, and the load view reports the overlap", async () => {
    await plan(platform, [{ step: 0, days: 2, personId: 'pe-a' }]);
    await plan(billing, [{ step: 0, days: 2, personId: 'pe-a' }]);

    expect(await startOf(billing, 'pe-a')).toEqual([0]);
    const load = await h.call('ada', 'GET', `/api/people/pe-a/load?from=${START}&to=2026-10-16`);
    expect((load.body as { overlaps: unknown[] }).overlaps).toHaveLength(1);
  });
});

describe('a shared organization', () => {
  it('places a project around the bookings of the one ranked above it', async () => {
    await plan(platform, [{ step: 0, days: 2, personId: 'pe-a' }]);
    await plan(billing, [{ step: 0, days: 2, personId: 'pe-a' }]);
    share();

    const [below] = (await slicesOf(billing)).filter(
      (slice) => slice.earliestFinish > slice.earliestStart,
    );
    expect(below).toMatchObject({
      personId: 'pe-a',
      earliestStart: 2,
      boundBy: 'elsewhere',
      elsewhereHolder: { projectId: platform },
    });
    // An edit below never moves the project above.
    expect(await startOf(platform, 'pe-a')).toEqual([0]);
    const load = await h.call('ada', 'GET', `/api/people/pe-a/load?from=${START}&to=2026-10-16`);
    expect((load.body as { overlaps: unknown[] }).overlaps).toEqual([]);
  });

  it("schedules C around B's bookings as they stand after A's", async () => {
    // A (Platform) and B (Billing) share Ana; B and C (Search) share Ben.
    await plan(platform, [{ step: 0, days: 2, personId: 'pe-a' }]);
    await plan(billing, [
      { step: 0, days: 2, personId: 'pe-a' },
      { step: 1, days: 2, personId: 'pe-b' },
    ]);
    await plan(search, [{ step: 0, days: 5, personId: 'pe-b' }]);
    share();

    // B's Ana waits for A until day 2, so B holds Ben over [4, 6).
    expect(await startOf(billing, 'pe-b')).toEqual([4]);
    // C cannot fit five days of Ben before day 4, so it starts at 6. Read
    // without A, B would hold Ben over [2, 4) and C would start at 4.
    expect(await startOf(search, 'pe-b')).toEqual([6]);
  });

  it('applies a command to a project below once shared', async () => {
    share();
    await plan(platform, [{ step: 0, days: 2, personId: 'pe-a' }]);
    // A command batch reads its own project through a working plan that
    // refuses every other one; the projects above come from the public graph.
    await plan(billing, [{ step: 0, days: 2, personId: 'pe-a' }]);

    expect(await startOf(billing, 'pe-a')).toEqual([2]);
  });

  it('neither books nor sees bookings when undated', async () => {
    await plan(platform, [{ step: 0, days: 2, personId: 'pe-a' }], false);
    await plan(billing, [{ step: 0, days: 2, personId: 'pe-a' }]);
    share();

    expect(await startOf(billing, 'pe-a')).toEqual([0]);
  });

  it('refuses to read below an influencer whose engine is missing', async () => {
    await plan(platform, [{ step: 0, days: 2, personId: 'pe-a' }]);
    await plan(billing, [{ step: 0, days: 2, personId: 'pe-a' }]);
    share();
    h.sqlite.run(
      `UPDATE project SET schedule_engine = 'optimized', optimization_enabled = 1 WHERE id = '${platform}'`,
    );

    const answer = await h.call('ada', 'GET', `/api/projects/${billing}/work-items`);
    expect(answer).toMatchObject({
      status: 409,
      body: { error: 'engine_unavailable', engine: 'optimized', projectId: platform },
    });
  });

  it("saves a shared organization's plan around the bookings above it", async () => {
    await plan(platform, [{ step: 0, days: 2, personId: 'pe-a' }]);
    await plan(billing, [{ step: 0, days: 2, personId: 'pe-a' }]);
    share();

    const saved = await h.call('ada', 'POST', `/api/projects/${billing}/saved-plans`, {
      name: 'Shared',
    });
    expect(saved.status).toBe(201);
    const id = (saved.body as { savedPlan: { id: string } }).savedPlan.id;
    const row = h.sqlite
      .query<{ bytes: string }, [string]>(
        "SELECT bytes FROM saved_plan_body WHERE saved_plan_id = ? AND kind = 'schedule'",
      )
      .get(id);
    if (row === null) throw new Error('the saved plan stored no schedule');
    const body = JSON.parse(row.bytes) as { slices: Record<string, SliceBody> };
    expect(
      Object.values(body.slices)
        .filter((slice) => slice.personId === 'pe-a' && slice.earliestFinish > slice.earliestStart)
        .map((slice) => slice.earliestStart),
    ).toEqual([2]);
  });
});

/** The `elsewhere_changed` events recorded for `projectId`, oldest first. */
function elsewhereChanged(projectId: string): { causeProjectId: string }[] {
  return h.sqlite
    .query<{ message: string }, [string]>(
      'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
    )
    .all(`project:${projectId}`)
    .map((row) => JSON.parse(row.message) as { type: string; causeProjectId: string })
    .filter((event) => event.type === 'elsewhere_changed');
}

async function command(projectId: string, commands: unknown[]): Promise<void> {
  const applied = await h.call('ada', 'POST', `/api/projects/${projectId}/commands`, { commands });
  if (applied.status !== 200) throw new Error(`command refused: ${JSON.stringify(applied)}`);
}

describe('booking changes fan out down the rank', () => {
  it('publishes nothing below for a rename, and tells it of a longer booking', async () => {
    share();
    await plan(platform, [{ step: 0, days: 2, personId: 'pe-a' }]);
    await plan(billing, [{ step: 0, days: 2, personId: 'pe-a' }]);
    await plan(search, [{ step: 0, days: 2, personId: 'pe-b' }]);
    // A fresh process tells every project below once; count from here.
    const told = elsewhereChanged(billing).length;
    const quiet = elsewhereChanged(search).length;
    const held = (await slicesOf(platform)).at(0);
    if (held === undefined) throw new Error('Platform scheduled nothing');
    const read = await h.call('ada', 'GET', `/api/projects/${platform}`);
    const stepId = (read.body as { steps: { id: string }[] }).steps.at(0)?.id;

    await command(platform, [
      { kind: 'patchWorkItem', workItemId: held.workItemId, patch: { name: 'Renamed' } },
    ]);
    expect(elsewhereChanged(billing)).toHaveLength(told);

    await command(platform, [
      {
        kind: 'setEstimate',
        workItemId: held.workItemId,
        stepId,
        days: { optimistic: 3, realistic: 3, pessimistic: 3 },
      },
    ]);
    expect(elsewhereChanged(billing)).toHaveLength(told + 1);
    expect(elsewhereChanged(billing).at(-1)).toMatchObject({ causeProjectId: platform });
    // Search shares nobody with Platform, directly or through Billing.
    expect(elsewhereChanged(search)).toHaveLength(quiet);
    expect(await startOf(billing, 'pe-a')).toEqual([3]);
  });

  it('tells a project the one above stopped sharing with, and its load is fresh', async () => {
    share();
    await plan(platform, [{ step: 0, days: 2, personId: 'pe-a' }]);
    await plan(billing, [{ step: 0, days: 2, personId: 'pe-a' }]);
    const load = async () => {
      const answer = await h.call(
        'ada',
        'GET',
        `/api/people/pe-a/load?from=${START}&to=2026-10-16`,
      );
      const body = answer.body as {
        projects: { projectId: string; bookings: { startsOn: string }[] }[];
      };
      return body.projects.find((each) => each.projectId === billing)?.bookings[0]?.startsOn;
    };
    // Warm the load memo on Billing's booking after Platform's.
    expect(await load()).toBe('2026-10-07');
    const told = elsewhereChanged(billing).length;
    const held = (await slicesOf(platform)).at(0);
    if (held === undefined) throw new Error('Platform scheduled nothing');

    // Platform hands its work to Ben: Billing no longer shares anybody with it.
    await command(platform, [
      { kind: 'setAssignee', workItemId: held.workItemId, stepId: held.stepId, personId: 'pe-b' },
    ]);

    expect(elsewhereChanged(billing)).toHaveLength(told + 1);
    expect(await startOf(billing, 'pe-a')).toEqual([0]);
    expect(await load()).toBe(START);
  });

  it('publishes nothing in an isolated organization', async () => {
    await plan(platform, [{ step: 0, days: 2, personId: 'pe-a' }]);
    await plan(billing, [{ step: 0, days: 2, personId: 'pe-a' }]);
    expect(elsewhereChanged(billing)).toEqual([]);
  });

  it('tells the projects of a shared organization that the rank moved', async () => {
    share();
    const moved = await h.call('ada', 'POST', `/api/organization/projects/${search}/rank`, {
      afterProjectId: null,
    });
    expect(moved.status).toBe(200);
    expect(elsewhereChanged(platform)).toMatchObject([{ causeProjectId: search }]);
    expect(elsewhereChanged(billing)).toHaveLength(1);
    expect(elsewhereChanged(search)).toEqual([]);
  });
});
