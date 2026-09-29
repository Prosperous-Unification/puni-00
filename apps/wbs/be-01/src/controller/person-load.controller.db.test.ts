import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * The load reads (`openspec/changes/share-people-across-projects`, slice 1)
 * over be-01's production composition, real SQLite and the production
 * organization access. Organization A holds Ana (`pe-a`) and two plans that
 * both book her from Monday 2026-10-05; organization B holds a plan whose row
 * names her id through a seeded crossing assignment.
 */
let h: OrganizationHarness;
let platform: string;
let billing: string;
let foreign: string;

const MONDAY = '2026-10-05';
const WEEK = `from=${MONDAY}&to=2026-10-16`;

interface PersonLoadBody {
  person: { id: string; name: string };
  projects: {
    projectId: string;
    name: string;
    engine: string;
    bookings: { workItemId: string; name: string; startsOn: string; endsOn: string }[];
  }[];
  overlaps: { startsOn: string; endsOn: string; bookings: { projectId: string }[] }[];
  undated: { projectId: string; name: string }[];
  unavailable: { projectId: string; reason: string }[];
}

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['ada', 'grace', 'vic', 'nell']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('vic', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
  seedPerson('a', 'Ana');
  seedPerson('b', 'Bea');
  platform = await plan('ada', 'Platform', 'pe-a', 3);
  billing = await plan('ada', 'Billing', 'pe-a', 2);
  foreign = await plan('grace', 'Hidden', 'pe-b', 4);
  // A crossing row: B's plan names A's person. Scoped reads of B fail closed
  // on it; A's reads must never reach B at all.
  h.sqlite.run(
    `UPDATE assignment SET person_id = 'pe-a'
       WHERE work_item_id IN (SELECT id FROM work_item WHERE project_id = ?)`,
    [foreign],
  );
});

afterEach(() => {
  h.close();
});

function seedPerson(org: 'a' | 'b', name: string): void {
  h.sqlite.run('INSERT INTO person (id, name) VALUES (?, ?)', [`pe-${org}`, `root-${name}`]);
  h.sqlite.run(
    'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
    [`pe-${org}`, `org-${org}`, name],
  );
}

async function expectOk(answer: Answer): Promise<Answer> {
  if (answer.status !== 200) throw new Error(`refused: ${JSON.stringify(answer)}`);
  return Promise.resolve(answer);
}

/** A dated plan holding one leaf whose first step, `days` long, is assigned to `personId`. */
async function plan(
  username: string,
  name: string,
  personId: string,
  days: number,
): Promise<string> {
  const created = await expectOk(await h.call(username, 'POST', '/api/projects', { name }));
  const id = (created.body as { project: { id: string } }).project.id;
  await expectOk(await h.call(username, 'PATCH', `/api/projects/${id}`, { startDate: MONDAY }));
  const read = await h.call(username, 'GET', `/api/projects/${id}`);
  const step = (read.body as { steps: { id: string }[] }).steps.at(0);
  if (step === undefined) throw new Error('the project started with no step');
  await expectOk(
    await h.call(username, 'POST', `/api/projects/${id}/commands`, {
      commands: [
        { kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: `${name} work` },
        {
          kind: 'setEstimate',
          workItemRef: 'w',
          stepId: step.id,
          days: { optimistic: days, realistic: days, pessimistic: days },
        },
        { kind: 'setAssignee', workItemRef: 'w', stepId: step.id, personId },
      ],
    }),
  );
  return id;
}

async function rowDates(projectId: string): Promise<{ startsOn: string; endsOn: string }> {
  const tree = await h.call('ada', 'GET', `/api/projects/${projectId}/work-items`);
  const row = (
    tree.body as { workItems: { dates: { startsOn: string; endsOn: string } | null }[] }
  ).workItems.at(0);
  if (row?.dates == null) throw new Error('the plan row has no dates');
  return row.dates;
}

async function personLoad(username: string, query = WEEK): Promise<Answer> {
  return h.call(username, 'GET', `/api/people/pe-a/load?${query}`);
}

describe('one person', () => {
  it('lists both plans with the plan rows’ own dates, and their overlap', async () => {
    const answer = await personLoad('ada');
    expect(answer.status).toBe(200);
    const body = answer.body as PersonLoadBody;
    expect(body.person).toEqual({ id: 'pe-a', name: 'Ana' });
    expect(body.projects.map((project) => project.name)).toEqual(['Platform', 'Billing']);
    expect(body.projects.map((project) => project.engine)).toEqual(['fast', 'fast']);
    for (const [index, id] of [platform, billing].entries()) {
      const booking = body.projects[index]?.bookings.at(0);
      const { startsOn, endsOn } = await rowDates(id);
      expect({ startsOn: booking?.startsOn, endsOn: booking?.endsOn }).toEqual({
        startsOn,
        endsOn,
      });
    }
    expect(body.overlaps).toHaveLength(1);
    expect(body.overlaps[0]?.startsOn).toBe(MONDAY);
    expect(body.overlaps[0]?.bookings.map((booking) => booking.projectId).sort()).toEqual(
      [platform, billing].sort(),
    );
    expect(body.undated).toEqual([]);
    expect(body.unavailable).toEqual([]);
  });

  it('does not report touching bookings as an overlap', async () => {
    const { endsOn } = await rowDates(platform);
    const next = new Date(`${endsOn}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    await expectOk(
      await h.call('ada', 'PATCH', `/api/projects/${billing}`, {
        startDate: next.toISOString().slice(0, 10),
      }),
    );
    const body = (await personLoad('ada')).body as PersonLoadBody;
    expect(body.projects).toHaveLength(2);
    expect(body.overlaps).toEqual([]);
  });

  it('omits a foreign project that assigns the same person id', async () => {
    const body = (await personLoad('ada')).body as PersonLoadBody;
    const named = JSON.stringify(body);
    expect(named).not.toContain(foreign);
    expect(named).not.toContain('Hidden');
  });

  it('answers a foreign person as an absent one', async () => {
    const foreignPerson = await h.call('ada', 'GET', `/api/people/pe-b/load?${WEEK}`);
    const absent = await h.call('ada', 'GET', `/api/people/pe-nobody/load?${WEEK}`);
    expect(foreignPerson).toEqual(absent);
    expect(absent.status).toBe(404);
  });

  it('lists a restricted plan, which restricts writes only', async () => {
    await expectOk(await h.call('ada', 'PATCH', `/api/projects/${billing}`, { restricted: true }));
    const body = (await personLoad('vic')).body as PersonLoadBody;
    expect(body.projects.map((project) => project.projectId)).toContain(billing);
  });

  it('lists an undated plan that assigns the person, and books nothing from it', async () => {
    await expectOk(await h.call('ada', 'PATCH', `/api/projects/${billing}`, { startDate: null }));
    const body = (await personLoad('ada')).body as PersonLoadBody;
    expect(body.undated).toEqual([{ projectId: billing, name: 'Billing' }]);
    expect(body.projects.map((project) => project.projectId)).toEqual([platform]);
    expect(body.overlaps).toEqual([]);
  });

  it('shows a lengthened booking after a command', async () => {
    const before = (await personLoad('ada')).body as PersonLoadBody;
    const tree = await h.call('ada', 'GET', `/api/projects/${platform}/work-items`);
    const leaf = (tree.body as { workItems: { id: string }[] }).workItems.at(0);
    const read = await h.call('ada', 'GET', `/api/projects/${platform}`);
    const step = (read.body as { steps: { id: string }[] }).steps.at(0);
    if (leaf === undefined || step === undefined) throw new Error('the plan lost its leaf');
    await expectOk(
      await h.call('ada', 'POST', `/api/projects/${platform}/commands`, {
        commands: [
          {
            kind: 'setEstimate',
            workItemId: leaf.id,
            stepId: step.id,
            days: { optimistic: 6, realistic: 6, pessimistic: 6 },
          },
        ],
      }),
    );
    const after = (await personLoad('ada')).body as PersonLoadBody;
    const endOf = (body: PersonLoadBody) => body.projects.at(0)?.bookings.at(0)?.endsOn;
    expect(endOf(after)).toBe((await rowDates(platform)).endsOn);
    expect(endOf(after)).not.toBe(endOf(before));
  });

  it('follows a start date moved after a warm read', async () => {
    await personLoad('ada');
    await expectOk(
      await h.call('ada', 'PATCH', `/api/projects/${platform}`, { startDate: '2026-10-12' }),
    );
    const body = (await personLoad('ada')).body as PersonLoadBody;
    const booking = body.projects.find((project) => project.projectId === platform)?.bookings.at(0);
    expect({ startsOn: booking?.startsOn, endsOn: booking?.endsOn }).toEqual(
      await rowDates(platform),
    );
    expect(booking?.startsOn).toBe('2026-10-12');
  });

  it('follows a start date cleared after a warm read', async () => {
    await personLoad('ada');
    await expectOk(await h.call('ada', 'PATCH', `/api/projects/${platform}`, { startDate: null }));
    const body = (await personLoad('ada')).body as PersonLoadBody;
    expect(body.projects.map((project) => project.projectId)).toEqual([billing]);
    expect(body.undated).toEqual([{ projectId: platform, name: 'Platform' }]);
  });

  it('follows an estimate rule changed after a warm read', async () => {
    // An uneven triple first, so switching the method changes the slice's length.
    const tree = await h.call('ada', 'GET', `/api/projects/${platform}/work-items`);
    const leaf = (tree.body as { workItems: { id: string }[] }).workItems.at(0);
    const read = await h.call('ada', 'GET', `/api/projects/${platform}`);
    const step = (read.body as { steps: { id: string }[] }).steps.at(0);
    if (leaf === undefined || step === undefined) throw new Error('the plan lost its leaf');
    await expectOk(
      await h.call('ada', 'POST', `/api/projects/${platform}/commands`, {
        commands: [
          {
            kind: 'setEstimate',
            workItemId: leaf.id,
            stepId: step.id,
            days: { optimistic: 1, realistic: 3, pessimistic: 11 },
          },
        ],
      }),
    );
    const before = (await personLoad('ada')).body as PersonLoadBody;
    await expectOk(
      await h.call('ada', 'PATCH', `/api/projects/${platform}`, {
        estimateMethod: 'pessimistic',
      }),
    );
    const after = (await personLoad('ada')).body as PersonLoadBody;
    const endOf = (body: PersonLoadBody) =>
      body.projects.find((project) => project.projectId === platform)?.bookings.at(0)?.endsOn;
    expect(endOf(after)).toBe((await rowDates(platform)).endsOn);
    expect(endOf(after)).not.toBe(endOf(before));
  });

  it('refuses a year-long window, an inverted one and an impossible date', async () => {
    for (const query of [
      'from=2026-01-01&to=2026-12-31',
      'from=2026-10-16&to=2026-10-05',
      'from=2026-02-31&to=2026-03-02',
      `from=${MONDAY}`,
    ]) {
      const answer = await personLoad('ada', query);
      expect({ query, status: answer.status, body: answer.body }).toEqual({
        query,
        status: 400,
        body: { error: 'invalid_query' },
      });
    }
  });

  it('lets a viewer read, and refuses a caller with no organization before the window', async () => {
    expect((await personLoad('vic')).status).toBe(200);
    for (const query of [WEEK, 'from=2026-01-01&to=2026-12-31']) {
      const unbound = await personLoad('nell', query);
      expect({ status: unbound.status, body: unbound.body }).toEqual({
        status: 403,
        body: { error: 'no_active_organization' },
      });
    }
  });
});

describe('the organization', () => {
  it('reports booked and overlapping workdays per week for its own people only', async () => {
    const answer = await h.call('ada', 'GET', `/api/people/load?${WEEK}`);
    expect(answer.status).toBe(200);
    const body = answer.body as {
      people: { id: string; weeks: { weekOf: string; booked: number; overlapping: number }[] }[];
      undated: unknown[];
      unavailable: unknown[];
    };
    expect(body.people.map((person) => person.id)).toEqual(['pe-a']);
    // Platform books three days and Billing two, both from Monday.
    expect(body.people[0]?.weeks).toEqual([
      { weekOf: MONDAY, booked: 3, overlapping: 2 },
      { weekOf: '2026-10-12', booked: 0, overlapping: 0 },
    ]);
    expect(JSON.stringify(body)).not.toContain(foreign);
  });
});
