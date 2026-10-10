import type { CapturedFanout } from '@wbs/core/ports/fanout-capture-store';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * The project rank routes (`share-people-across-projects`, slice 3) over
 * be-01's production composition and real SQLite. Organization A holds an
 * admin (`ada`), a member (`mel`) and a viewer (`vic`), and three plans;
 * organization B holds one plan of its own.
 */
let h: OrganizationHarness;
let platform: string;
let billing: string;
let search: string;
let foreign: string;
let changeAfterResolution: (() => void) | null;
let captureActive: boolean;
let captureCalls: number;
let stalePreflight: CapturedFanout | null;
let pushDuringTest: (() => Promise<Response>) | null;

const RANK = '/api/organization/project-rank';
const move = (id: string) => `/api/organization/projects/${id}/rank`;

interface RankBody {
  projects: { projectId: string; name: string; rank: number; ranked: boolean }[];
}
const names = (answer: Answer) => (answer.body as RankBody).projects.map((each) => each.name);

async function create(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

async function seedSharedAna(projectIds: readonly string[]): Promise<void> {
  h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  h.sqlite.run("INSERT INTO person (id, name) VALUES ('rank-ana', 'Ana')");
  h.sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('rank-ana', 'org-a', 'Ana')",
  );
  for (const [index, projectId] of projectIds.entries()) {
    const read = await h.call('ada', 'GET', `/api/projects/${projectId}`);
    const step = (read.body as { steps: { id: string }[] }).steps.at(0);
    if (step === undefined) throw new Error('rank fixture project has no step');
    const workItemId = `rank-row-${String(index)}`;
    h.sqlite.run(
      "UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
      [projectId],
    );
    h.sqlite.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)', [
      workItemId,
      projectId,
      workItemId,
    ]);
    h.sqlite.run(
      'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
      [workItemId, step.id],
    );
    h.sqlite.run('INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)', [
      workItemId,
      step.id,
      'rank-ana',
    ]);
  }
}

beforeEach(async () => {
  changeAfterResolution = null;
  captureActive = false;
  captureCalls = 0;
  stalePreflight = null;
  pushDuringTest = null;
  h = OrganizationHarness.openComposed(
    false,
    () => {
      const change = changeAfterResolution;
      changeAfterResolution = null;
      change?.();
    },
    undefined,
    undefined,
    undefined,
    () => pushDuringTest?.() ?? Promise.resolve(Response.json({ delivered_to_sockets: 0 })),
    () => {
      if (stalePreflight !== null) return stalePreflight;
      if (!captureActive) return;
      captureCalls += 1;
      throw new Error('injected rank capture must not run after demotion');
    },
  );
  for (const username of ['ada', 'mel', 'vic', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'admin');
  h.member('org-a', 'mel', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'grace', 'admin');
  h.bind('ada', 'org-a');
  h.bind('mel', 'org-a');
  h.bind('vic', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
  platform = await create('ada', 'Platform');
  billing = await create('ada', 'Billing');
  search = await create('mel', 'Search');
  foreign = await create('grace', 'Hidden');
});

afterEach(() => {
  h.close();
});

describe('the project rank', () => {
  it('reads every project of the organization, unranked in creation order, to any member', async () => {
    for (const username of ['ada', 'mel', 'vic']) {
      const answer = await h.call(username, 'GET', RANK);
      expect(answer.status).toBe(200);
      expect(answer.body).toEqual({
        projects: [
          { projectId: platform, name: 'Platform', rank: 1, ranked: false },
          { projectId: billing, name: 'Billing', rank: 2, ranked: false },
          { projectId: search, name: 'Search', rank: 3, ranked: false },
        ],
      });
    }
  });

  it('lets an admin move a project, ranking the organization in the order left', async () => {
    const moved = await h.call('ada', 'POST', move(search), { afterProjectId: null });
    expect(moved.status).toBe(200);
    expect(names(moved)).toEqual(['Search', 'Platform', 'Billing']);
    expect((moved.body as RankBody).projects.every((each) => each.ranked)).toBe(true);
    const after = await h.call('ada', 'POST', move(search), { afterProjectId: billing });
    expect(names(after)).toEqual(['Platform', 'Billing', 'Search']);
    expect(names(await h.call('vic', 'GET', RANK))).toEqual(['Platform', 'Billing', 'Search']);
  });

  it('records downstream displacement when an admin reverses two shared-person projects', async () => {
    await seedSharedAna([platform, billing]);
    const events = () =>
      h.sqlite
        .query<{ message: string }, [string]>(
          'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
        )
        .all(`project:${platform}`)
        .map(({ message }) => JSON.parse(message) as unknown);
    const before = events().length;
    expect((await h.call('ada', 'POST', move(billing), { afterProjectId: null })).status).toBe(200);
    expect(events().slice(before)).toEqual([
      { type: 'elsewhere_changed', projectId: platform, causeProjectId: billing },
    ]);
    const billingEvents = h.sqlite
      .query<{ message: string }, [string]>(
        'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
      )
      .all(`project:${billing}`).length;
    expect((await h.call('ada', 'POST', move(billing), { afterProjectId: platform })).status).toBe(
      200,
    );
    expect(
      h.sqlite
        .query<{ message: string }, [string]>(
          'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
        )
        .all(`project:${billing}`)
        .slice(billingEvents)
        .map(({ message }) => JSON.parse(message) as unknown),
    ).toEqual([{ type: 'elsewhere_changed', projectId: billing, causeProjectId: platform }]);
  });

  it('keeps shared fan-out silent when only rank positions are respaced', async () => {
    await seedSharedAna([platform, billing]);
    for (const [projectId, position] of [
      [platform, 100],
      [billing, 200],
      [search, 300],
    ] as const)
      h.sqlite.run(
        'INSERT INTO project_rank (project_id, organization_id, position, created_at, created_by) VALUES (?, ?, ?, 1, ?)',
        [projectId, 'org-a', position, h.userId('ada')],
      );
    const beforeRank = h.sqlite.query('SELECT position FROM project_rank ORDER BY position').all();
    const beforeEvents = h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all();
    expect((await h.call('ada', 'POST', move(billing), { afterProjectId: platform })).status).toBe(
      200,
    );
    expect(h.sqlite.query('SELECT position FROM project_rank ORDER BY position').all()).not.toEqual(
      beforeRank,
    );
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all()).toEqual(
      beforeEvents,
    );
  });

  it('rolls back a rank move and first recipient when a later fan-out insert fails', async () => {
    await seedSharedAna([platform, billing, search]);
    const recipients = [platform, billing].sort();
    const second = recipients.at(1);
    if (second === undefined) throw new Error('rank rollback fixture has no second recipient');
    const rankBefore = h.sqlite.query('SELECT * FROM project_rank ORDER BY project_id').all();
    const eventsBefore = h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all();
    const sequencesBefore = h.sqlite
      .query('SELECT * FROM event_sequencer ORDER BY subscription')
      .all();
    h.sqlite.run(
      `CREATE TRIGGER fail_rank_fanout BEFORE INSERT ON event_log WHEN NEW.subscription = 'project:${second}' BEGIN SELECT RAISE(FAIL, 'injected rank fan-out failure'); END`,
    );
    try {
      expect(await h.call('ada', 'POST', move(search), { afterProjectId: null })).toMatchObject({
        status: 500,
      });
    } finally {
      h.sqlite.run('DROP TRIGGER fail_rank_fanout');
    }
    expect(h.sqlite.query('SELECT * FROM project_rank ORDER BY project_id').all()).toEqual(
      rankBefore,
    );
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all()).toEqual(
      eventsBefore,
    );
    expect(h.sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all()).toEqual(
      sequencesBefore,
    );
  });

  it('releases the rank writer before waiting on committed recipient transport', async () => {
    await seedSharedAna([platform, billing]);
    const entered = Promise.withResolvers<undefined>();
    const held = Promise.withResolvers<undefined>();
    pushDuringTest = async () => {
      entered.resolve(undefined);
      await held.promise;
      return Response.json({ delivered_to_sockets: 0 });
    };
    const pending = h.call('ada', 'POST', move(billing), { afterProjectId: null });
    await entered.promise;
    try {
      h.sqlite.run('UPDATE project SET name = ? WHERE id = ?', ['second writer entered', platform]);
    } finally {
      held.resolve(undefined);
    }
    expect((await pending).status).toBe(200);
    expect(
      h.sqlite
        .query<{ name: string }, [string]>('SELECT name FROM project WHERE id = ?')
        .get(platform)?.name,
    ).toBe('second writer entered');
  });

  it('refuses a member and a viewer the move, changing nothing', async () => {
    for (const username of ['mel', 'vic']) {
      const answer = await h.call(username, 'POST', move(search), { afterProjectId: null });
      expect({ username, status: answer.status, body: answer.body }).toEqual({
        username,
        status: 403,
        body: { error: 'forbidden' },
      });
    }
    expect(names(await h.call('ada', 'GET', RANK))).toEqual(['Platform', 'Billing', 'Search']);
  });

  it('rechecks current admin authority after route resolution before a rank move', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const rankBefore = h.sqlite.query('SELECT * FROM project_rank ORDER BY project_id').all();
    const eventBefore = h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all();
    const sequenceBefore = h.sqlite
      .query('SELECT * FROM event_sequencer ORDER BY subscription')
      .all();
    const held = Promise.withResolvers<undefined>();
    const acquired = Promise.withResolvers<undefined>();
    const resolved = Promise.withResolvers<undefined>();
    const turn = h.holdWriteTurn(held.promise, () => {
      acquired.resolve(undefined);
    });
    await acquired.promise;
    captureActive = true;
    changeAfterResolution = () => {
      h.sqlite.run(
        "UPDATE organization_membership SET role = 'viewer' WHERE organization_id = 'org-a' AND user_id = ?",
        [h.userId('ada')],
      );
      resolved.resolve(undefined);
    };
    const pending = h.call('ada', 'POST', move(billing), { afterProjectId: null });
    await resolved.promise;
    held.resolve(undefined);
    await turn;
    expect(await pending).toMatchObject({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(captureCalls).toBe(0);
    expect(h.sqlite.query('SELECT * FROM project_rank ORDER BY project_id').all()).toEqual(
      rankBefore,
    );
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all()).toEqual(
      eventBefore,
    );
    expect(h.sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all()).toEqual(
      sequenceBefore,
    );
  });

  it('captures the assignment admitted by the writer after a queued preflight', async () => {
    await seedSharedAna([platform, billing]);
    const billingAssignment = h.sqlite
      .query<{ work_item_id: string; step_id: string }, []>(
        "SELECT work_item_id, step_id FROM assignment WHERE work_item_id = 'rank-row-1'",
      )
      .get();
    if (billingAssignment === null) throw new Error('billing fixture assignment disappeared');
    h.sqlite.run("DELETE FROM assignment WHERE work_item_id = 'rank-row-1'");
    stalePreflight = await h.captureFanout('org-a');
    const held = Promise.withResolvers<undefined>();
    const acquired = Promise.withResolvers<undefined>();
    const resolved = Promise.withResolvers<undefined>();
    const turn = h.holdWriteTurn(held.promise, () => {
      acquired.resolve(undefined);
    });
    await acquired.promise;
    changeAfterResolution = () => {
      h.sqlite.run(
        "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, 'rank-ana')",
        [billingAssignment.work_item_id, billingAssignment.step_id],
      );
      resolved.resolve(undefined);
    };
    const pending = h.call('ada', 'POST', move(billing), { afterProjectId: null });
    await resolved.promise;
    held.resolve(undefined);
    await turn;
    expect((await pending).status).toBe(200);
    const messages = h.sqlite
      .query<{ message: string }, [string]>(
        'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
      )
      .all(`project:${platform}`)
      .map(({ message }) => JSON.parse(message) as unknown);
    expect(messages).toContainEqual({
      type: 'elsewhere_changed',
      projectId: platform,
      causeProjectId: billing,
    });
  });

  it('keeps the admitted project date owner single for dated and undated transitions', async () => {
    await seedSharedAna([platform, billing]);
    const sharedEvents = () =>
      h.sqlite
        .query<{ message: string }, [string]>(
          'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
        )
        .all(`project:${billing}`)
        .map(({ message }) => JSON.parse(message) as unknown)
        .filter(
          (message): message is { type: string } =>
            typeof message === 'object' &&
            message !== null &&
            'type' in message &&
            message.type === 'elsewhere_changed',
        );
    const expected = { type: 'elsewhere_changed', projectId: billing, causeProjectId: platform };
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${platform}`, { startDate: '2026-10-06' }))
        .status,
    ).toBe(200);
    expect(sharedEvents()).toEqual([expected]);
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${platform}`, { startDate: null })).status,
    ).toBe(200);
    expect(sharedEvents()).toEqual([expected, expected]);
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${platform}`, { name: 'Renamed' })).status,
    ).toBe(200);
    expect(sharedEvents()).toEqual([expected, expected]);
  });

  it('does not let a self-move bypass current rank authority', async () => {
    captureActive = true;
    changeAfterResolution = () => {
      h.sqlite.run(
        "DELETE FROM organization_membership WHERE organization_id = 'org-a' AND user_id = ?",
        [h.userId('ada')],
      );
    };
    expect(await h.call('ada', 'POST', move(billing), { afterProjectId: billing })).toMatchObject({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(captureCalls).toBe(0);
  });

  it('answers a foreign project, on either side of a move, as an absent one', async () => {
    captureActive = true;
    const absent = await h.call('ada', 'POST', move('nowhere'), { afterProjectId: null });
    expect(absent).toMatchObject({ status: 404, body: { error: 'not_found' } });
    expect(await h.call('ada', 'POST', move(foreign), { afterProjectId: null })).toEqual(absent);
    expect(await h.call('ada', 'POST', move(platform), { afterProjectId: foreign })).toMatchObject({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(JSON.stringify((await h.call('ada', 'GET', RANK)).body)).not.toContain(foreign);
    expect(captureCalls).toBe(0);
  });

  it('orders the load reads by the rank, naming each rank', async () => {
    h.sqlite.run("INSERT INTO person (id, name) VALUES ('pe-a', 'root-Ana')");
    h.sqlite.run(
      "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('pe-a', 'org-a', 'Ana')",
    );
    for (const id of [platform, billing]) {
      await h.call('ada', 'PATCH', `/api/projects/${id}`, { startDate: '2026-10-05' });
      const read = await h.call('ada', 'GET', `/api/projects/${id}`);
      const step = (read.body as { steps: { id: string }[] }).steps.at(0);
      if (step === undefined) throw new Error('the project started with no step');
      const applied = await h.call('ada', 'POST', `/api/projects/${id}/commands`, {
        commands: [
          { kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Work' },
          {
            kind: 'setEstimate',
            workItemRef: 'w',
            stepId: step.id,
            days: { optimistic: 2, realistic: 2, pessimistic: 2 },
          },
          { kind: 'setAssignee', workItemRef: 'w', stepId: step.id, personId: 'pe-a' },
        ],
      });
      expect(applied.status).toBe(200);
    }
    await h.call('ada', 'POST', move(billing), { afterProjectId: null });
    const load = await h.call('ada', 'GET', '/api/people/pe-a/load?from=2026-10-05&to=2026-10-16');
    expect(
      (load.body as { projects: { name: string; rank: number }[] }).projects.map(
        ({ name, rank }) => [name, rank],
      ),
    ).toEqual([
      ['Billing', 1],
      ['Platform', 2],
    ]);
  });
});

describe('before activation', () => {
  it('answers organization_required, since no organization owns the order', async () => {
    h.close();
    h = OrganizationHarness.openComposed();
    await h.register('ada');
    const project = await create('ada', 'Legacy');
    expect(await h.call('ada', 'GET', RANK)).toMatchObject({
      status: 409,
      body: { error: 'organization_required' },
    });
    expect(await h.call('ada', 'POST', move(project), { afterProjectId: null })).toMatchObject({
      status: 409,
      body: { error: 'organization_required' },
    });
  });
});
