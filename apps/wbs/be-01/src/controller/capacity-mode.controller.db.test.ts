import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The capacity mode route (`share-people-across-projects`, slice 8) over
 * be-01's production composition and real SQLite. Organization A holds a
 * super-admin (`sam`), an admin (`ada`), a member (`mel`) and a viewer
 * (`vic`); Platform ranks above Billing, and both give Ana two days.
 *
 * This release supports only isolated people (`SUPPORTED_CAPACITY_MODES`),
 * so the switch to shared is refused on the production composition; the
 * cases that switch build the same composition with the release seam
 * widened, as a release that supports shared people will be built.
 */
let h: OrganizationHarness;
let platform: string;
let billing: string;

const MODE = '/api/organization';

async function create(name: string): Promise<string> {
  const answer = await h.call('ada', 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

async function plan(projectId: string): Promise<void> {
  await h.call('ada', 'PATCH', `/api/projects/${projectId}`, { startDate: '2026-10-05' });
  const read = await h.call('ada', 'GET', `/api/projects/${projectId}`);
  const stepId = (read.body as { steps: { id: string }[] }).steps.at(0)?.id;
  if (stepId === undefined) throw new Error('the project started with no step');
  const applied = await h.call('ada', 'POST', `/api/projects/${projectId}/commands`, {
    commands: [
      { kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Work' },
      {
        kind: 'setEstimate',
        workItemRef: 'w',
        stepId,
        days: { optimistic: 2, realistic: 2, pessimistic: 2 },
      },
      { kind: 'setAssignee', workItemRef: 'w', stepId, personId: 'pe-a' },
    ],
  });
  if (applied.status !== 200) throw new Error(`plan refused: ${JSON.stringify(applied)}`);
}

/** Where Billing's work for Ana starts. */
async function billingStart(): Promise<number | undefined> {
  const answer = await h.call('ada', 'GET', `/api/projects/${billing}/work-items`);
  const slices = (
    answer.body as {
      slices: { personId: string | null; earliestStart: number; earliestFinish: number }[];
    }
  ).slices;
  return slices.find((slice) => slice.personId === 'pe-a' && slice.earliestFinish > 0)
    ?.earliestStart;
}

function switches(): unknown[] {
  return h.sqlite
    .query('SELECT actor_id, shared_people FROM shared_people_audit ORDER BY created_at, id')
    .all();
}

function toldAboutTheMode(projectId: string): number {
  return h.sqlite
    .query<{ message: string }, [string]>('SELECT message FROM event_log WHERE subscription = ?')
    .all(`project:${projectId}`)
    .map((row) => JSON.parse(row.message) as { type: string; causeProjectId?: string | null })
    .filter((event) => event.type === 'elsewhere_changed' && event.causeProjectId === null).length;
}

/** The production composition, with `modes` as the release's supported capacity modes. */
async function open(modes?: readonly ('isolated' | 'shared')[], afterResolve?: () => void) {
  h.close();
  h = OrganizationHarness.openComposedWith({
    ...(afterResolve === undefined ? {} : { afterResolve }),
    ...(modes === undefined ? {} : { supportedCapacityModes: modes }),
  });
  await populate();
}

const SHARED_RELEASE = ['isolated', 'shared'] as const;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  await populate();
});

async function populate(): Promise<void> {
  for (const username of ['sam', 'ada', 'mel', 'vic']) await h.register(username);
  h.organization('org-a');
  h.member('org-a', 'sam', 'super_admin');
  h.member('org-a', 'ada', 'admin');
  h.member('org-a', 'mel', 'member');
  h.member('org-a', 'vic', 'viewer');
  for (const username of ['sam', 'ada', 'mel', 'vic']) h.bind(username, 'org-a');
  h.activate();
  h.sqlite.run("INSERT INTO person (id, name) VALUES ('pe-a', 'root-Ana')");
  h.sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('pe-a', 'org-a', 'Ana')",
  );
  platform = await create('Platform');
  billing = await create('Billing');
  await plan(platform);
  await plan(billing);
}

afterEach(() => {
  h.close();
});

describe('the capacity mode', () => {
  it('reads isolated by default, to any member', async () => {
    for (const username of ['sam', 'ada', 'mel', 'vic']) {
      expect(await h.call(username, 'GET', MODE)).toMatchObject({
        status: 200,
        body: { sharedPeople: false, sharingAvailable: false },
      });
    }
    expect(await billingStart()).toBe(0);
  });

  it('refuses shared people this release cannot run', async () => {
    expect(await h.call('sam', 'PATCH', MODE, { sharedPeople: true })).toEqual({
      status: 409,
      body: { error: 'capacity_mode_unsupported' },
    });
    expect(await h.call('sam', 'GET', MODE)).toMatchObject({ body: { sharedPeople: false } });
    expect(switches()).toEqual([]);
    expect([toldAboutTheMode(platform), toldAboutTheMode(billing)]).toEqual([0, 0]);
    expect(await billingStart()).toBe(0);
    // Switching to the mode it already has is allowed and changes nothing.
    expect(await h.call('sam', 'PATCH', MODE, { sharedPeople: false })).toEqual({
      status: 200,
      body: { sharedPeople: false, sharingAvailable: false, canSwitch: true },
    });
    expect(switches()).toEqual([]);
  });

  it('lets a super-admin switch it, audited, and switch it back to the isolated dates', async () => {
    await open(SHARED_RELEASE);
    expect(await h.call('sam', 'PATCH', MODE, { sharedPeople: true })).toEqual({
      status: 200,
      body: { sharedPeople: true, sharingAvailable: true, canSwitch: true },
    });
    expect(await h.call('vic', 'GET', MODE)).toEqual({
      status: 200,
      body: { sharedPeople: true, sharingAvailable: true, canSwitch: false },
    });
    expect(await billingStart()).toBe(2);

    expect(await h.call('sam', 'PATCH', MODE, { sharedPeople: false })).toMatchObject({
      status: 200,
      body: { sharedPeople: false },
    });
    expect(await billingStart()).toBe(0);
    expect(switches()).toEqual([
      { actor_id: h.userId('sam'), shared_people: 1 },
      { actor_id: h.userId('sam'), shared_people: 0 },
    ]);
  });

  it('refuses an admin the switch, keeping the organization isolated', async () => {
    for (const username of ['ada', 'mel', 'vic']) {
      expect({
        username,
        answer: await h.call(username, 'PATCH', MODE, { sharedPeople: true }),
      }).toEqual({ username, answer: { status: 403, body: { error: 'forbidden' } } });
    }
    expect(await h.call('sam', 'GET', MODE)).toMatchObject({ body: { sharedPeople: false } });
    expect(switches()).toEqual([]);
    expect(await billingStart()).toBe(0);
  });

  it('refuses an admin the switch even in a release that supports shared people', async () => {
    await open(SHARED_RELEASE);
    expect(await h.call('ada', 'PATCH', MODE, { sharedPeople: true })).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(switches()).toEqual([]);
  });

  it('refuses a super-admin demoted after route admission, storing nothing', async () => {
    let demote = false;
    await open(SHARED_RELEASE, () => {
      if (!demote) return;
      h.sqlite.run(
        "UPDATE organization_membership SET role = 'admin' WHERE organization_id = 'org-a' AND user_id = ?",
        [h.userId('sam')],
      );
    });
    demote = true;
    expect(await h.call('sam', 'PATCH', MODE, { sharedPeople: true })).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(
      h.sqlite.query("SELECT shared_people FROM organization WHERE id = 'org-a'").get(),
    ).toEqual({ shared_people: 0 });
    expect(switches()).toEqual([]);
    expect([toldAboutTheMode(platform), toldAboutTheMode(billing)]).toEqual([0, 0]);
  });

  it('tells every project when the organization switches, and nothing for no switch', async () => {
    await open(SHARED_RELEASE);
    await h.call('sam', 'PATCH', MODE, { sharedPeople: false });
    expect([toldAboutTheMode(platform), toldAboutTheMode(billing)]).toEqual([0, 0]);
    await h.call('sam', 'PATCH', MODE, { sharedPeople: true });
    expect([toldAboutTheMode(platform), toldAboutTheMode(billing)]).toEqual([1, 1]);
    expect(switches()).toHaveLength(1);
  });
});

describe('who may switch', () => {
  it('tells only a super-admin acting in person that they may switch', async () => {
    const canSwitch: Record<string, unknown> = {};
    for (const username of ['sam', 'ada', 'mel', 'vic'])
      canSwitch[username] = (
        (await h.call(username, 'GET', MODE)).body as { canSwitch: boolean }
      ).canSwitch;
    expect(canSwitch).toEqual({ sam: true, ada: false, mel: false, vic: false });
  });
});

describe('before activation', () => {
  it('answers organization_required, since no organization has a mode', async () => {
    h.close();
    h = OrganizationHarness.openComposed();
    await h.register('ada');
    expect(await h.call('ada', 'GET', MODE)).toMatchObject({
      status: 409,
      body: { error: 'organization_required' },
    });
    expect(await h.call('ada', 'PATCH', MODE, { sharedPeople: true })).toMatchObject({
      status: 409,
      body: { error: 'organization_required' },
    });
  });
});
