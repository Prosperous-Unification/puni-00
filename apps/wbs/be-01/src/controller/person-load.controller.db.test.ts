import { encodeOptimizedResult } from '@wbs/contracts/solver/optimized-result';
import { scheduleInputOfCaptured } from '@wbs/core';
import { schedule } from '@wbs/domain';
import { openConnection, openDatabase } from '@wbs/store-sqlite/db';
import { allocateGeneration } from '@wbs/store-sqlite/optimization-generation';
import { SavedPlanCaptureRepository } from '@wbs/store-sqlite/saved-plan-capture';
import { scheduleInputHash } from '@wbs/store-sqlite/schedule-input-hash';
import { optimizedScheduleCache } from '@wbs/store-sqlite/schema';
import { WorkItemRepository } from '@wbs/store-sqlite/work-item';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

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

describe('shared incoming calendars', () => {
  it('does not reuse isolated load or roll-up entries when a shared chain has no basis', async () => {
    const rollUp = async () => {
      const answer = await h.call('ada', 'GET', `/api/spaces/all/roll-ups?projectIds=${billing}`);
      expect(answer.status).toBe(200);
      return (
        answer.body as { rollUps: Record<string, { scheduleError: string | null; dates: unknown }> }
      ).rollUps[billing];
    };
    h.sqlite.run(
      'UPDATE estimate SET optimistic = 40000000, realistic = 40000000, pessimistic = 40000000 WHERE work_item_id IN (SELECT id FROM work_item WHERE project_id IN (?, ?))',
      [platform, billing],
    );
    const isolated = (await personLoad('ada')).body as PersonLoadBody;
    expect(isolated.projects.map((project) => project.projectId)).toContain(billing);
    const isolatedRollUp = await rollUp();
    expect(isolatedRollUp.scheduleError).toBeNull();
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const live = await h.call('ada', 'GET', `/api/projects/${billing}/work-items`);
    expect(live.status).toBe(200);
    expect((live.body as { scheduleError: string }).scheduleError).toBe('calendar_range');
    const shared = (await personLoad('ada')).body as PersonLoadBody;
    expect(shared.projects.find((project) => project.projectId === billing)).toBeUndefined();
    expect(shared.unavailable.find((project) => project.projectId === billing)?.reason).toBe(
      'calendar_range',
    );
    expect((await rollUp()).scheduleError).toBe('calendar_range');
    h.sqlite.run("UPDATE organization SET shared_people = 0 WHERE id = 'org-a'");
    const restored = (await personLoad('ada')).body as PersonLoadBody;
    expect(restored.projects.map((project) => project.projectId)).toContain(billing);
    expect((await rollUp()).scheduleError).toBeNull();
  });

  it('refreshes a warm target booking after only its upstream estimate changes', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const before = (await personLoad('ada')).body as PersonLoadBody;
    const organization = async () =>
      (await h.call('ada', 'GET', `/api/people/load?${WEEK}`)).body as {
        people: { id: string; weeks: { booked: number }[] }[];
      };
    expect((await organization()).people[0]?.weeks.map((week) => week.booked)).toEqual([5, 0]);
    const targetBefore = before.projects.find((project) => project.projectId === billing)
      ?.bookings[0];
    expect(targetBefore?.startsOn).toBe('2026-10-08');
    const targetState = h.sqlite.query('SELECT revision FROM project WHERE id = ?').get(billing);
    const tree = await h.call('ada', 'GET', `/api/projects/${platform}/work-items`);
    const leaf = (tree.body as { workItems: { id: string }[] }).workItems.at(0);
    const project = await h.call('ada', 'GET', `/api/projects/${platform}`);
    const step = (project.body as { steps: { id: string }[] }).steps.at(0);
    if (leaf === undefined || step === undefined) throw new Error('upstream fixture is incomplete');
    await expectOk(
      await h.call('ada', 'POST', `/api/projects/${platform}/commands`, {
        commands: [
          {
            kind: 'setEstimate',
            workItemId: leaf.id,
            stepId: step.id,
            days: { optimistic: 5, realistic: 5, pessimistic: 5 },
          },
        ],
      }),
    );
    const after = (await personLoad('ada')).body as PersonLoadBody;
    expect(
      after.projects.find((project) => project.projectId === billing)?.bookings[0]?.startsOn,
    ).toBe('2026-10-12');
    expect((await organization()).people[0]?.weeks.map((week) => week.booked)).toEqual([5, 2]);
    expect(h.sqlite.query('SELECT revision FROM project WHERE id = ?').get(billing)).toEqual(
      targetState,
    );
  });

  it('refreshes warm space roll-up and in-progress dates after only upstream work changes', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const targetTree = await h.call('ada', 'GET', `/api/projects/${billing}/work-items`);
    const targetLeaf = (targetTree.body as { workItems: { id: string }[] }).workItems.at(0);
    if (targetLeaf === undefined) throw new Error('target fixture has no leaf');
    await expectOk(
      await h.call('ada', 'POST', `/api/projects/${billing}/commands`, {
        commands: [{ kind: 'setStatus', workItemId: targetLeaf.id, status: 'in_progress' }],
      }),
    );
    const rollUp = async () => {
      const answer = await h.call('ada', 'GET', `/api/spaces/all/roll-ups?projectIds=${billing}`);
      expect(answer.status).toBe(200);
      return (answer.body as { rollUps: Record<string, { dates: { startsOn: string } }> }).rollUps[
        billing
      ];
    };
    const progress = async () => {
      const answer = await h.call('ada', 'GET', '/api/spaces/all/in-progress');
      expect(answer.status).toBe(200);
      return (
        answer.body as { items: { projectId: string; dates: { startsOn: string } }[] }
      ).items.find((leaf) => leaf.projectId === billing);
    };
    expect((await rollUp()).dates.startsOn).toBe('2026-10-08');
    expect((await progress())?.dates.startsOn).toBe('2026-10-08');
    const sourceTree = await h.call('ada', 'GET', `/api/projects/${platform}/work-items`);
    const sourceLeaf = (sourceTree.body as { workItems: { id: string }[] }).workItems.at(0);
    const sourceProject = await h.call('ada', 'GET', `/api/projects/${platform}`);
    const sourceStep = (sourceProject.body as { steps: { id: string }[] }).steps.at(0);
    if (sourceLeaf === undefined || sourceStep === undefined)
      throw new Error('source fixture incomplete');
    await expectOk(
      await h.call('ada', 'POST', `/api/projects/${platform}/commands`, {
        commands: [
          {
            kind: 'setEstimate',
            workItemId: sourceLeaf.id,
            stepId: sourceStep.id,
            days: { optimistic: 5, realistic: 5, pessimistic: 5 },
          },
        ],
      }),
    );
    expect((await rollUp()).dates.startsOn).toBe('2026-10-12');
    expect((await progress())?.dates.startsOn).toBe('2026-10-12');
    await expectOk(
      await h.call('ada', 'PATCH', `/api/projects/${platform}`, {
        startDate: '2026-10-12',
      }),
    );
    expect((await rollUp()).dates.startsOn).toBe('2026-10-05');
    expect((await progress())?.dates.startsOn).toBe('2026-10-05');
  });

  it('marks a warm target unavailable when its influencer loses the engine, then recovers', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    expect((await personLoad('ada')).status).toBe(200);
    expect(
      (await h.call('ada', 'GET', `/api/spaces/all/roll-ups?projectIds=${billing}`)).status,
    ).toBe(200);
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [platform],
    );
    const unavailable = (await personLoad('ada')).body as PersonLoadBody;
    expect(unavailable.projects.find((project) => project.projectId === billing)).toBeUndefined();
    expect(unavailable.unavailable.map((project) => project.projectId)).toContain(billing);
    const rollUp = await h.call('ada', 'GET', `/api/spaces/all/roll-ups?projectIds=${billing}`);
    expect(rollUp).toMatchObject({
      status: 200,
      body: { rollUps: { [billing]: { kind: 'unavailable' } } },
    });
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 0, schedule_engine = 'fast' WHERE id = ?",
      [platform],
    );
    const recovered = (await personLoad('ada')).body as PersonLoadBody;
    expect(
      recovered.projects.find((project) => project.projectId === billing)?.bookings[0]?.startsOn,
    ).toBe('2026-10-08');
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [billing],
    );
    const targetUnavailable = (await personLoad('ada')).body as PersonLoadBody;
    expect(targetUnavailable.unavailable.map((project) => project.projectId)).toContain(billing);
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 0, schedule_engine = 'fast' WHERE id = ?",
      [billing],
    );
    expect((await personLoad('ada')).status).toBe(200);
  });

  it('refuses a revoked caller for the whole warm load and space request', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    await personLoad('ada');
    await h.call('ada', 'GET', `/api/spaces/all/roll-ups?projectIds=${billing}`);
    h.sqlite.run(
      "DELETE FROM organization_membership WHERE organization_id = 'org-a' AND user_id = ?",
      [h.userId('ada')],
    );
    expect(await personLoad('ada')).toMatchObject({ status: 403, body: { error: 'not_a_member' } });
    expect(
      await h.call('ada', 'GET', `/api/spaces/all/roll-ups?projectIds=${billing}`),
    ).toMatchObject({ status: 403, body: { error: 'not_a_member' } });
  });

  it('does not reuse a shared booking after the organization returns to isolated mode', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const shared = (await personLoad('ada')).body as PersonLoadBody;
    expect(
      shared.projects.find((project) => project.projectId === billing)?.bookings[0]?.startsOn,
    ).toBe('2026-10-08');
    h.sqlite.run("UPDATE organization SET shared_people = 0 WHERE id = 'org-a'");
    const isolated = (await personLoad('ada')).body as PersonLoadBody;
    expect(
      isolated.projects.find((project) => project.projectId === billing)?.bookings[0]?.startsOn,
    ).toBe('2026-10-05');
  });

  it('refuses membership revoked between route admission and aggregate observation', async () => {
    h.close();
    let revoke = false;
    h = OrganizationHarness.openComposed(false, () => {
      if (!revoke) return;
      revoke = false;
      h.sqlite.run(
        "DELETE FROM organization_membership WHERE organization_id = 'org-a' AND user_id = ?",
        [h.userId('ada')],
      );
    });
    await h.register('ada');
    h.organization('org-a');
    h.member('org-a', 'ada', 'member');
    h.bind('ada', 'org-a');
    h.activate();
    seedPerson('a', 'Ana');
    platform = await plan('ada', 'Platform', 'pe-a', 3);
    billing = await plan('ada', 'Billing', 'pe-a', 2);
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    expect((await personLoad('ada')).status).toBe(200);
    revoke = true;
    expect(await personLoad('ada')).toMatchObject({ status: 403, body: { error: 'not_a_member' } });
  });

  it('refuses activation reset between route admission and aggregate observation', async () => {
    h.close();
    let reset = false;
    h = OrganizationHarness.openComposed(false, () => {
      if (!reset) return;
      reset = false;
      h.sqlite.run('DROP TRIGGER organization_activation_no_revert');
      h.sqlite.run(
        "UPDATE organization_activation SET state = 'pre_activation', activated_at = NULL",
      );
    });
    await h.register('ada');
    h.organization('org-a');
    h.member('org-a', 'ada', 'member');
    h.bind('ada', 'org-a');
    h.activate();
    seedPerson('a', 'Ana');
    platform = await plan('ada', 'Platform', 'pe-a', 3);
    billing = await plan('ada', 'Billing', 'pe-a', 2);
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    expect((await personLoad('ada')).status).toBe(200);
    reset = true;
    expect(await personLoad('ada')).toMatchObject({
      status: 403,
      body: { error: 'no_active_organization' },
    });
  });

  it('refuses activation after legacy route admission before aggregate observation', async () => {
    h.close();
    let activate = false;
    h = OrganizationHarness.openComposed(false, () => {
      if (!activate) return;
      activate = false;
      h.activate();
    });
    await h.register('ada');
    h.organization('org-a');
    seedPerson('a', 'Ana');
    platform = await plan('ada', 'Platform', 'pe-a', 3);
    activate = true;
    expect(await personLoad('ada')).toMatchObject({
      status: 403,
      body: { error: 'no_active_organization' },
    });
  });

  it('refreshes a warm target when an exact-key upstream publication is selected', async () => {
    h.close();
    h = OrganizationHarness.openComposed(true);
    await h.register('ada');
    h.organization('org-a');
    h.member('org-a', 'ada', 'member');
    h.bind('ada', 'org-a');
    h.activate();
    seedPerson('a', 'Ana');
    platform = await plan('ada', 'Platform', 'pe-a', 3);
    billing = await plan('ada', 'Billing', 'pe-a', 2);
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [platform],
    );
    const before = (await personLoad('ada')).body as PersonLoadBody;
    expect(
      before.projects.find((project) => project.projectId === billing)?.bookings[0]?.startsOn,
    ).toBe('2026-10-08');
    const reads = await new SavedPlanCaptureRepository({
      openConnection: () => openConnection(h.databasePath()),
    }).readPlanInput(platform);
    if (reads === null) throw new Error('upstream input is absent');
    const input = scheduleInputOfCaptured(reads);
    const planned = schedule(
      input.rows,
      input.edges,
      input.slices,
      new Map([[input.rows[0]?.id ?? 'missing', 1]]),
      input.poolSizes,
      input.reach,
      input.deadlines,
      input.typed,
    );
    const connection = openConnection(h.databasePath());
    try {
      const inputHash = scheduleInputHash(input);
      const generation = allocateGeneration(connection.db, platform, '15+0.1.0', inputHash, 1);
      connection.db
        .insert(optimizedScheduleCache)
        .values({
          projectId: platform,
          inputHash,
          generation,
          contractVersion: '15+0.1.0',
          budgetMs: 60000,
          objective: 'pri',
          status: 'ok',
          failureReason: null,
          createdAt: 1,
          resultJson: JSON.stringify(
            encodeOptimizedResult({
              publication: 'solver',
              objectiveValues: {
                makespan: { value: 4, stageValue: 4, bound: 4, status: 'optimal' },
                priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
                movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
              },
              schedule: planned,
            }),
          ),
        })
        .run();
    } finally {
      connection.close();
    }
    const after = (await personLoad('ada')).body as PersonLoadBody;
    expect(
      after.projects.find((project) => project.projectId === billing)?.bookings[0]?.startsOn,
    ).toBe('2026-10-09');
  });

  it('keeps overlapping target chains on one side of a concurrent upstream write', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the spy forwards to the repository receiver.
    const original = WorkItemRepository.prototype.listByProject;
    let moved = false;
    const interrupted = spyOn(WorkItemRepository.prototype, 'listByProject').mockImplementation(
      async function (this: WorkItemRepository, projectId) {
        const rows = await original.call(this, projectId);
        if (projectId === platform && !moved) {
          moved = true;
          const writer = openDatabase(h.databasePath());
          try {
            writer.run('BEGIN');
            writer.run(
              "UPDATE project SET start_date = '2026-10-12', revision = revision + 1 WHERE id = ?",
              [platform],
            );
            writer.run(
              "UPDATE project SET start_date = '2026-10-19', revision = revision + 1 WHERE id = ?",
              [billing],
            );
            writer.run('COMMIT');
          } finally {
            writer.close();
          }
        }
        return rows;
      },
    );
    try {
      const captured = (await personLoad('ada', `from=${MONDAY}&to=2026-10-30`))
        .body as PersonLoadBody;
      const dates = (body: PersonLoadBody) =>
        [platform, billing].map(
          (projectId) =>
            body.projects.find((project) => project.projectId === projectId)?.bookings[0]?.startsOn,
        );
      expect(moved).toBe(true);
      expect(dates(captured)).toEqual(['2026-10-05', '2026-10-08']);
      interrupted.mockRestore();
      expect(
        dates((await personLoad('ada', `from=${MONDAY}&to=2026-10-30`)).body as PersonLoadBody),
      ).toEqual(['2026-10-12', '2026-10-19']);
    } finally {
      interrupted.mockRestore();
    }
  });
});
