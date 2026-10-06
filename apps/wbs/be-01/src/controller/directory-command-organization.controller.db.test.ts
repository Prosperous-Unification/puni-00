import type { CapturedFanout } from '@wbs/core/ports/fanout-capture-store';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * Directory commands under organization isolation (task 3.4, part 2), over
 * be-01's production composition and real SQLite; see
 * {@link OrganizationHarness.openComposed}.
 *
 * Each organization owns one entry of every catalog, seeded as SQL with a root
 * name (`root-…`) that differs from its organization-local name, so any answer
 * carrying a root name is visible as a leak.
 */
let h: OrganizationHarness;
let own: string;
let foreign: string;
let captureActive: boolean;
let captureCalls: number;
let countCaptures: boolean;
let observedCaptures: number;
let capturedOrganizations: string[];
let recordCaptured: boolean;
let capturedValues: CapturedFanout[];
let failCapturedAfter: number | null;
let holdCapture: ((organizationId: string) => Promise<void>) | null;
let onOwnerAttempt: (() => void) | null;
let refuseNestedOwner: boolean;
let recordCaptureNames: boolean;
let capturedPersonNames: string[];
let countOwners: boolean;
let ownerCalls: number;
let pushDuringTest: (() => Promise<Response>) | null;

beforeEach(async () => {
  captureActive = false;
  captureCalls = 0;
  countCaptures = false;
  observedCaptures = 0;
  capturedOrganizations = [];
  recordCaptured = false;
  capturedValues = [];
  failCapturedAfter = null;
  holdCapture = null;
  onOwnerAttempt = null;
  refuseNestedOwner = false;
  recordCaptureNames = false;
  capturedPersonNames = [];
  countOwners = false;
  ownerCalls = 0;
  pushDuringTest = null;
  h = OrganizationHarness.openComposed(
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    () => pushDuringTest?.() ?? Promise.resolve(Response.json({ delivered_to_sockets: 0 })),
    (organizationId) => {
      if (countCaptures) observedCaptures += 1;
      if (countCaptures) capturedOrganizations.push(organizationId);
      if (captureActive) {
        captureCalls += 1;
        throw new Error('injected directory capture must not run on refusal');
      }
      return holdCapture?.(organizationId);
    },
    (captured) => {
      if (failCapturedAfter === observedCaptures)
        throw new Error('injected second-owner after-capture failure');
      if (recordCaptured) capturedValues.push(captured);
      if (!recordCaptureNames) return;
      const name = h.sqlite
        .query<{ name: string }, []>(
          "SELECT name FROM person_organization WHERE resource_id = 'pe-a'",
        )
        .get()?.name;
      if (name === undefined) throw new Error('capture fixture lost the addressed person');
      capturedPersonNames.push(name);
    },
    () => {
      if (countOwners) ownerCalls += 1;
      if (refuseNestedOwner && ownerCalls > 1)
        throw new Error('nested standalone directory owner attempted inside command');
      onOwnerAttempt?.();
    },
  );
  for (const username of ['ada', 'grace', 'vic']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('vic', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
  own = await create('ada', 'A plan');
  foreign = await create('grace', 'B plan');
  seedCatalogs('a');
  seedCatalogs('b');
});

afterEach(() => {
  h.close();
});

async function create(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

function directory(username: string, commands: unknown[]): Promise<Answer> {
  return h.call(username, 'POST', '/api/directory/commands', { commands });
}

/** One entry of every catalog, owned by organization `org`. */
function seedCatalogs(org: 'a' | 'b'): void {
  for (const [root, side, id] of [
    ['person', 'person_organization', `pe-${org}`],
    ['service_team', 'service_team_organization', `tm-${org}`],
    ['service', 'service_organization', `sv-${org}`],
    ['tag', 'tag_organization', `tg-${org}`],
    ['work_item_type', 'work_item_type_organization', `ty-${org}`],
  ] as const) {
    h.sqlite.run(`INSERT INTO ${root} (id, name) VALUES (?, ?)`, [id, `root-${id}`]);
    h.sqlite.run(`INSERT INTO ${side} (resource_id, organization_id, name) VALUES (?, ?, ?)`, [
      id,
      `org-${org}`,
      id,
    ]);
  }
}

/** Every directory row and ownership mapping, to show a refusal changed nothing. */
function snapshot(): unknown {
  return [
    'person',
    'person_organization',
    'project_team_capacity',
    'assignment',
    'person_team',
    'service_team',
    'service_team_organization',
    'team_service',
    'service',
    'service_organization',
    'tag',
    'tag_organization',
    'work_item_type',
    'work_item_type_organization',
    'work_item_tag',
    'work_item_team',
    'work_item_service',
    'work_item_work_item_type',
    'work_item',
  ].map((table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all().map(withoutAudit));
}

function durableSnapshot(): unknown {
  return {
    directory: snapshot(),
    events: h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all(),
    sequences: h.sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all(),
  };
}

function withoutAudit(row: unknown): unknown {
  if (typeof row !== 'object' || row === null) return row;
  return Object.fromEntries(
    Object.entries(row).filter(([column]) => !['updated_at', 'created_at'].includes(column)),
  );
}

async function rejectedError(write: Promise<unknown>): Promise<Error> {
  try {
    await write;
  } catch (cause) {
    if (cause instanceof Error) return cause;
    throw new Error('directory write rejected with a non-Error cause', { cause });
  }
  throw new Error('directory write unexpectedly succeeded');
}

async function list(username: string, path: string, key: string): Promise<unknown> {
  const answer = await h.call(username, 'GET', path);
  return (answer.body as Record<string, unknown>)[key];
}

async function seedSharedStandalonePerson(projectIds: readonly string[]): Promise<void> {
  for (const [index, projectId] of projectIds.entries()) {
    const read = await h.call('ada', 'GET', `/api/projects/${projectId}`);
    const stepId = (read.body as { steps: { id: string }[] }).steps.at(0)?.id;
    if (stepId === undefined) throw new Error('standalone directory fixture has no step');
    const workItemId = `standalone-person-row-${String(index)}`;
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
      [workItemId, stepId],
    );
    h.sqlite.run('INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)', [
      workItemId,
      stepId,
      'pe-a',
    ]);
  }
  h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
}

describe('after activation', () => {
  it('returns invalid standalone service input before any owner or capture', async () => {
    const actorId = h.userId('ada');
    const access = {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-a', userId: actorId, role: 'member' as const },
    };
    const service = h.publicDirectoryService();
    const before = snapshot();
    countOwners = true;
    captureActive = true;
    try {
      expect(await service.patchPersonWithin('missing-person', actorId, {}, access)).toEqual({
        ok: false,
        reason: 'nothing_to_change',
      });
      expect(await service.patchPersonWithin('pe-a', actorId, { kind: 'invalid' }, access)).toEqual(
        { ok: false, reason: 'invalid_kind' },
      );
      expect(await service.patchPersonWithin('pe-a', actorId, { name: '' }, access)).toEqual({
        ok: false,
        reason: 'name_required',
      });
      expect(await service.patchTeamWithin('missing-team', actorId, {}, access)).toEqual({
        ok: false,
        reason: 'nothing_to_change',
      });
      expect(await service.patchTeamWithin('tm-a', actorId, { name: '' }, access)).toEqual({
        ok: false,
        reason: 'name_required',
      });
      expect(await service.addWithin('teams', actorId, '', access)).toBeNull();
    } finally {
      captureActive = false;
      countOwners = false;
    }
    expect(ownerCalls).toBe(0);
    expect(captureCalls).toBe(0);
    expect(snapshot()).toEqual(before);
  });
  it('refuses absent and validly foreign standalone directory addresses before capture', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const access = {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-a', userId: h.userId('ada'), role: 'member' as const },
    };
    const before = snapshot();
    const eventBefore = h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all();
    const sequenceBefore = h.sqlite
      .query('SELECT * FROM event_sequencer ORDER BY subscription')
      .all();
    captureActive = true;
    for (const personId of ['missing-person', 'pe-b']) {
      expect(
        await h.removeStandaloneDirectoryWithin('people', personId, h.userId('ada'), true, access),
      ).toEqual({ ok: false, reason: 'not_found' });
    }
    expect(captureCalls).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all()).toEqual(
      eventBefore,
    );
    expect(h.sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all()).toEqual(
      sequenceBefore,
    );
  });

  it('throws for a present scoped person with missing trusted ownership before capture', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    h.sqlite.run("INSERT INTO person (id, name) VALUES ('orphan-person', 'orphan')");
    const before = snapshot();
    captureActive = true;
    expect(
      (
        await rejectedError(
          h.removeStandaloneDirectoryWithin('people', 'orphan-person', h.userId('ada'), true, {
            kind: 'scoped',
            scope: { organizationId: 'org-a', userId: h.userId('ada'), role: 'member' },
          }),
        )
      ).message,
    ).toContain('lacks ownership');
    expect(captureCalls).toBe(0);
    expect(snapshot()).toEqual(before);
  });

  it('throws for a trusted assignment reaching a foreign project before standalone capture', async () => {
    const read = await h.call('grace', 'GET', `/api/projects/${foreign}`);
    const stepId = (read.body as { steps: { id: string }[] }).steps.at(0)?.id;
    if (stepId === undefined) throw new Error('foreign project has no step');
    h.sqlite.run(
      "INSERT INTO work_item (id, project_id, position, name) VALUES ('corrupt-reach-row', ?, 10, 'Corrupt reach')",
      [foreign],
    );
    h.sqlite.run(
      "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES ('corrupt-reach-row', ?, 'pe-a')",
      [stepId],
    );
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const before = snapshot();
    captureActive = true;
    expect(
      (
        await rejectedError(
          h.removeStandaloneDirectoryWithin('people', 'pe-a', h.userId('ada'), true, {
            kind: 'scoped',
            scope: { organizationId: 'org-a', userId: h.userId('ada'), role: 'member' },
          }),
        )
      ).message,
    ).toContain('reached from outside it');
    expect(captureCalls).toBe(0);
    expect(snapshot()).toEqual(before);
  });

  it('rechecks foreign team membership after preflight on the owning writer before capture', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const actorId = h.userId('ada');
    const access = {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-a', userId: actorId, role: 'member' as const },
    };
    let racedState: unknown;
    let racedEvents: unknown[] = [];
    let racedSequences: unknown[] = [];
    let pushes = 0;
    pushDuringTest = () => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    };
    captureActive = true;
    onOwnerAttempt = () => {
      h.sqlite.run("INSERT INTO person_team (person_id, service_team_id) VALUES ('pe-b', 'tm-a')");
      racedState = snapshot();
      racedEvents = h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all();
      racedSequences = h.sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all();
      onOwnerAttempt = null;
    };
    try {
      expect(
        (
          await rejectedError(
            h.removeStandaloneDirectoryWithin('teams', 'tm-a', actorId, true, access),
          )
        ).message,
      ).toContain('reached from outside it');
    } finally {
      captureActive = false;
      onOwnerAttempt = null;
    }
    expect(captureCalls).toBe(0);
    expect(snapshot()).toEqual(racedState);
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all()).toEqual(
      racedEvents,
    );
    expect(h.sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all()).toEqual(
      racedSequences,
    );
    expect(pushes).toBe(0);
  });

  for (const scenario of [
    {
      label: 'service-team link',
      catalog: 'services' as const,
      id: 'sv-a',
      relation: "INSERT INTO team_service (team_id, service_id) VALUES ('tm-b', 'sv-a')",
    },
    {
      label: 'tagged foreign work item',
      catalog: 'tags' as const,
      id: 'tg-a',
      relation:
        "INSERT INTO work_item_tag (work_item_id, tag_id) VALUES ('foreign-reach-row', 'tg-a')",
    },
    {
      label: 'typed foreign work item',
      catalog: 'workItemTypes' as const,
      id: 'ty-a',
      relation:
        "INSERT INTO work_item_work_item_type (work_item_id, type_id) VALUES ('foreign-reach-row', 'ty-a')",
    },
  ]) {
    it(`rechecks late foreign ${scenario.label} reach before capture`, async () => {
      h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      if (scenario.catalog !== 'services')
        h.sqlite.run(
          "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('foreign-reach-row', ?, NULL, 0, 'Foreign reach')",
          [foreign],
        );
      const actorId = h.userId('ada');
      let racedState: unknown;
      captureActive = true;
      onOwnerAttempt = () => {
        h.sqlite.run(scenario.relation);
        racedState = snapshot();
        onOwnerAttempt = null;
      };
      try {
        expect(
          (
            await rejectedError(
              h.removeStandaloneDirectoryWithin(scenario.catalog, scenario.id, actorId, true, {
                kind: 'scoped',
                scope: { organizationId: 'org-a', userId: actorId, role: 'member' },
              }),
            )
          ).message,
        ).toContain('reached from outside it');
      } finally {
        onOwnerAttempt = null;
        captureActive = false;
      }
      expect(captureCalls).toBe(0);
      expect(snapshot()).toEqual(racedState);
    });
  }

  it('rechecks an assignment foreign step after preflight on the owning writer', async () => {
    const foreignStep = (
      (await h.call('grace', 'GET', `/api/projects/${foreign}`)).body as {
        steps: { id: string }[];
      }
    ).steps.at(0)?.id;
    if (foreignStep === undefined) throw new Error('foreign step is missing');
    h.sqlite.run(
      "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('own-reach-row', ?, NULL, 0, 'Own row')",
      [own],
    );
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const actorId = h.userId('ada');
    let racedState: unknown;
    captureActive = true;
    onOwnerAttempt = () => {
      h.sqlite.run('INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)', [
        'own-reach-row',
        foreignStep,
        'pe-a',
      ]);
      racedState = snapshot();
      onOwnerAttempt = null;
    };
    try {
      expect(
        (
          await rejectedError(
            h.removeStandaloneDirectoryWithin('people', 'pe-a', actorId, true, {
              kind: 'scoped',
              scope: { organizationId: 'org-a', userId: actorId, role: 'member' },
            }),
          )
        ).message,
      ).toContain('reached from outside it');
    } finally {
      onOwnerAttempt = null;
      captureActive = false;
    }
    expect(captureCalls).toBe(0);
    expect(snapshot()).toEqual(racedState);
  });

  it('keeps standalone team and service link refusals typed before capture', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const actorId = h.userId('ada');
    const access = {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-a', userId: actorId, role: 'member' as const },
    };
    const before = snapshot();
    const eventsBefore = h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all();
    const sequencesBefore = h.sqlite
      .query('SELECT * FROM event_sequencer ORDER BY subscription')
      .all();
    captureActive = true;
    const service = h.publicDirectoryService();
    for (const serviceId of ['sv-b', 'missing-service'])
      expect(
        await service.patchTeamWithin('tm-a', actorId, { serviceIds: [serviceId] }, access),
      ).toEqual({ ok: false, reason: 'unknown_service' });
    for (const teamId of ['tm-b', 'missing-team']) {
      expect(
        await service.patchPersonWithin('pe-a', actorId, { teamIds: [teamId] }, access),
      ).toEqual({ ok: false, reason: 'unknown_team' });
      expect(await service.addPersonWithin(actorId, 'Someone', [teamId], access)).toEqual({
        ok: false,
        reason: 'unknown_team',
      });
    }
    expect(await service.patchPersonWithin('pe-b', actorId, { kind: 'agent' }, access)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(captureCalls).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all()).toEqual(
      eventsBefore,
    );
    expect(h.sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all()).toEqual(
      sequencesBefore,
    );
  });

  it('retains a standalone person rename when the later membership store write fails', async () => {
    const actorId = h.userId('ada');
    const access = {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-a', userId: actorId, role: 'member' as const },
    };
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const eventsBefore = h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all();
    const sequencesBefore = h.sqlite
      .query('SELECT * FROM event_sequencer ORDER BY subscription')
      .all();
    h.sqlite.run(
      "CREATE TRIGGER fail_person_membership BEFORE INSERT ON person_team WHEN NEW.person_id = 'pe-a' BEGIN SELECT RAISE(FAIL, 'injected later person membership failure'); END",
    );
    recordCaptureNames = true;
    try {
      await rejectedError(
        h
          .publicDirectoryService()
          .patchPersonWithin('pe-a', actorId, { name: 'Ada renamed', teamIds: ['tm-a'] }, access),
      );
    } finally {
      recordCaptureNames = false;
      h.sqlite.run('DROP TRIGGER fail_person_membership');
    }
    expect(capturedPersonNames).toEqual(['pe-a', 'pe-a', 'Ada renamed']);
    expect(
      h.sqlite
        .query<{ name: string }, []>(
          "SELECT name FROM person_organization WHERE resource_id = 'pe-a'",
        )
        .get()?.name,
    ).toBe('Ada renamed');
    expect(h.sqlite.query("SELECT * FROM person_team WHERE person_id = 'pe-a'").all()).toEqual([]);
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all()).toEqual(
      eventsBefore,
    );
    expect(h.sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all()).toEqual(
      sequencesBefore,
    );
  });

  it('opens one owner for each successful raw mutation in compound person and team patches', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const actorId = h.userId('ada');
    const access = {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-a', userId: actorId, role: 'member' as const },
    };
    countOwners = true;
    countCaptures = true;
    recordCaptureNames = true;
    try {
      expect(
        await h
          .publicDirectoryService()
          .patchPersonWithin('pe-a', actorId, { name: 'Ada two', teamIds: ['tm-a'] }, access),
      ).toMatchObject({ ok: true });
      expect(ownerCalls).toBe(2);
      expect(observedCaptures).toBe(4);
      expect(capturedPersonNames).toEqual(['pe-a', 'pe-a', 'Ada two', 'Ada two']);
      ownerCalls = 0;
      observedCaptures = 0;
      expect(
        await h
          .publicDirectoryService()
          .patchTeamWithin('tm-a', actorId, { name: 'Team two', serviceIds: ['sv-a'] }, access),
      ).toMatchObject({ ok: true });
      expect(ownerCalls).toBe(2);
      expect(observedCaptures).toBe(4);
    } finally {
      countOwners = false;
      countCaptures = false;
      recordCaptureNames = false;
    }
  });

  it('captures a name-idempotent add that joins an existing assigned person to a used team', async () => {
    const lower = await create('ada', 'Second A plan');
    await seedSharedStandalonePerson([own, lower]);
    h.sqlite.run("INSERT INTO service_team (id, name) VALUES ('tm-extra', 'root-extra')");
    h.sqlite.run(
      "INSERT INTO service_team_organization (resource_id, organization_id, name) VALUES ('tm-extra', 'org-a', 'Extra')",
    );
    for (const rowId of ['standalone-person-row-0', 'standalone-person-row-1'])
      h.sqlite.run('INSERT INTO work_item_team (work_item_id, team_id) VALUES (?, ?)', [
        rowId,
        'tm-extra',
      ]);
    const eventsBefore = h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all();
    const sequencesBefore = h.sqlite
      .query('SELECT * FROM event_sequencer ORDER BY subscription')
      .all();
    let pushes = 0;
    pushDuringTest = () => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    };
    const actorId = h.userId('ada');
    countOwners = true;
    countCaptures = true;
    recordCaptured = true;
    try {
      expect(
        await h.publicDirectoryService().addPersonWithin(actorId, 'pe-a', ['tm-extra'], {
          kind: 'scoped',
          scope: { organizationId: 'org-a', userId: actorId, role: 'member' },
        }),
      ).toMatchObject({ ok: true, value: { id: 'pe-a' } });
    } finally {
      countOwners = false;
      countCaptures = false;
      recordCaptured = false;
    }
    expect(ownerCalls).toBe(1);
    expect(observedCaptures).toBe(2);
    expect(
      h.sqlite
        .query(
          "SELECT * FROM person_team WHERE person_id = 'pe-a' AND service_team_id = 'tm-extra'",
        )
        .all(),
    ).toHaveLength(1);
    expect(capturedValues.map(({ observation }) => observation.organizationId)).toEqual([
      'org-a',
      'org-a',
    ]);
    expect(capturedValues.map(({ observation }) => observation.mode)).toEqual(['shared', 'shared']);
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all()).toEqual(
      eventsBefore,
    );
    expect(h.sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all()).toEqual(
      sequencesBefore,
    );
    expect(pushes).toBe(0);
  });

  it('keeps concurrent standalone directory invocation access bound to its own organization', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id IN ('org-a', 'org-b')");
    const aActor = h.userId('ada');
    const bActor = h.userId('grace');
    const firstCapture = Promise.withResolvers<undefined>();
    const releaseFirst = Promise.withResolvers<undefined>();
    const secondOwner = Promise.withResolvers<undefined>();
    let held = false;
    holdCapture = async (organizationId) => {
      if (organizationId !== 'org-a' || held) return;
      held = true;
      firstCapture.resolve(undefined);
      await releaseFirst.promise;
    };
    countCaptures = true;
    const first = h
      .publicDirectoryService()
      .patchPersonWithin(
        'pe-a',
        aActor,
        { name: 'Ada concurrent' },
        { kind: 'scoped', scope: { organizationId: 'org-a', userId: aActor, role: 'member' } },
      );
    await firstCapture.promise;
    onOwnerAttempt = () => {
      secondOwner.resolve(undefined);
    };
    const second = h
      .publicDirectoryService()
      .patchPersonWithin(
        'pe-b',
        bActor,
        { name: 'Grace concurrent' },
        { kind: 'scoped', scope: { organizationId: 'org-b', userId: bActor, role: 'member' } },
      );
    await secondOwner.promise;
    releaseFirst.resolve(undefined);
    try {
      expect(await first).toMatchObject({ ok: true });
      expect(await second).toMatchObject({ ok: true });
    } finally {
      holdCapture = null;
      onOwnerAttempt = null;
      countCaptures = false;
      releaseFirst.resolve(undefined);
    }
    expect(capturedOrganizations).toEqual(['org-a', 'org-a', 'org-b', 'org-b']);
    expect(
      h.sqlite
        .query<{ name: string }, []>(
          "SELECT name FROM person_organization WHERE resource_id = 'pe-a'",
        )
        .get()?.name,
    ).toBe('Ada concurrent');
    expect(
      h.sqlite
        .query<{ name: string }, []>(
          "SELECT name FROM person_organization WHERE resource_id = 'pe-b'",
        )
        .get()?.name,
    ).toBe('Grace concurrent');
  });

  it('does not share invocation access while two scoped service reads await', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id IN ('org-a', 'org-b')");
    const aActor = h.userId('ada');
    const bActor = h.userId('grace');
    countCaptures = true;
    try {
      const first = h
        .publicDirectoryService()
        .patchPersonWithin(
          'pe-a',
          aActor,
          { name: 'Ada parallel' },
          { kind: 'scoped', scope: { organizationId: 'org-a', userId: aActor, role: 'member' } },
        );
      const second = h
        .publicDirectoryService()
        .patchPersonWithin(
          'pe-b',
          bActor,
          { name: 'Grace parallel' },
          { kind: 'scoped', scope: { organizationId: 'org-b', userId: bActor, role: 'member' } },
        );
      const [firstAnswer, secondAnswer] = await Promise.all([first, second]);
      expect(firstAnswer.ok).toBe(true);
      expect(secondAnswer.ok).toBe(true);
    } finally {
      countCaptures = false;
    }
    expect(capturedOrganizations).toEqual(['org-a', 'org-a', 'org-b', 'org-b']);
    expect(
      h.sqlite
        .query<{ name: string }, []>(
          "SELECT name FROM person_organization WHERE resource_id = 'pe-a'",
        )
        .get()?.name,
    ).toBe('Ada parallel');
    expect(
      h.sqlite
        .query<{ name: string }, []>(
          "SELECT name FROM person_organization WHERE resource_id = 'pe-b'",
        )
        .get()?.name,
    ).toBe('Grace parallel');
  });

  it('retains a standalone team rename when the later service-link store write fails', async () => {
    const actorId = h.userId('ada');
    const access = {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-a', userId: actorId, role: 'member' as const },
    };
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const eventsBefore = h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all();
    const sequencesBefore = h.sqlite
      .query('SELECT * FROM event_sequencer ORDER BY subscription')
      .all();
    h.sqlite.run(
      "CREATE TRIGGER fail_team_service_link BEFORE INSERT ON team_service WHEN NEW.team_id = 'tm-a' BEGIN SELECT RAISE(FAIL, 'injected later team service failure'); END",
    );
    try {
      await rejectedError(
        h
          .publicDirectoryService()
          .patchTeamWithin(
            'tm-a',
            actorId,
            { name: 'Platform renamed', serviceIds: ['sv-a'] },
            access,
          ),
      );
    } finally {
      h.sqlite.run('DROP TRIGGER fail_team_service_link');
    }
    expect(
      h.sqlite
        .query<{ name: string }, []>(
          "SELECT name FROM service_team_organization WHERE resource_id = 'tm-a'",
        )
        .get()?.name,
    ).toBe('Platform renamed');
    expect(h.sqlite.query("SELECT * FROM team_service WHERE team_id = 'tm-a'").all()).toEqual([]);
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all()).toEqual(
      eventsBefore,
    );
    expect(h.sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all()).toEqual(
      sequencesBefore,
    );
  });

  it('retains the first rename when the second raw owner fails after capture', async () => {
    await seedSharedStandalonePerson([own]);
    const actorId = h.userId('ada');
    let pushes = 0;
    pushDuringTest = () => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    };
    countOwners = true;
    countCaptures = true;
    failCapturedAfter = 4;
    try {
      expect(
        (
          await rejectedError(
            h.publicDirectoryService().patchPersonWithin(
              'pe-a',
              actorId,
              { name: 'Ada after capture', teamIds: ['tm-a'] },
              {
                kind: 'scoped',
                scope: { organizationId: 'org-a', userId: actorId, role: 'member' },
              },
            ),
          )
        ).message,
      ).toContain('second-owner after-capture');
    } finally {
      countOwners = false;
      countCaptures = false;
      failCapturedAfter = null;
    }
    expect(ownerCalls).toBe(2);
    expect(observedCaptures).toBe(4);
    expect(
      h.sqlite
        .query<{ name: string }, []>(
          "SELECT name FROM person_organization WHERE resource_id = 'pe-a'",
        )
        .get()?.name,
    ).toBe('Ada after capture');
    expect(h.sqlite.query("SELECT * FROM person_team WHERE person_id = 'pe-a'").all()).toEqual([]);
    const messages = h.sqlite
      .query<{ message: string }, [string]>(
        'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
      )
      .all(`project:${own}`)
      .map(({ message }) => JSON.parse(message) as { type: string });
    expect(messages.map(({ type }) => type)).toEqual(['directory_changed']);
    expect(pushes).toBe(1);
  });

  it('retains a team rename and one announcement when its second owner fails after capture', async () => {
    await seedSharedStandalonePerson([own]);
    h.sqlite.run(
      "INSERT INTO work_item_team (work_item_id, team_id) VALUES ('standalone-person-row-0', 'tm-a')",
    );
    const actorId = h.userId('ada');
    let pushes = 0;
    pushDuringTest = () => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    };
    countOwners = true;
    countCaptures = true;
    failCapturedAfter = 4;
    try {
      expect(
        (
          await rejectedError(
            h.publicDirectoryService().patchTeamWithin(
              'tm-a',
              actorId,
              { name: 'Retained team', serviceIds: ['sv-a'] },
              {
                kind: 'scoped',
                scope: { organizationId: 'org-a', userId: actorId, role: 'member' },
              },
            ),
          )
        ).message,
      ).toContain('second-owner after-capture');
    } finally {
      countOwners = false;
      countCaptures = false;
      failCapturedAfter = null;
    }
    expect(ownerCalls).toBe(2);
    expect(observedCaptures).toBe(4);
    expect(
      h.sqlite
        .query<{ name: string }, []>(
          "SELECT name FROM service_team_organization WHERE resource_id = 'tm-a'",
        )
        .get()?.name,
    ).toBe('Retained team');
    expect(h.sqlite.query("SELECT * FROM team_service WHERE team_id = 'tm-a'").all()).toEqual([]);
    const messages = h.sqlite
      .query<{ message: string }, [string]>(
        'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
      )
      .all(`project:${own}`)
      .map(({ message }) => JSON.parse(message) as { type: string });
    expect(messages.map(({ type }) => type)).toEqual(['directory_changed']);
    expect(pushes).toBe(1);
  });

  it('returns typed late person and team link refusals after the first rename commits', async () => {
    const actorId = h.userId('ada');
    let pushes = 0;
    pushDuringTest = () => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    };
    const access = {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-a', userId: actorId, role: 'member' as const },
    };
    for (const scenario of [
      {
        target: 'team',
        remove: "DELETE FROM service WHERE id = 'sv-a'",
        reason: 'unknown_service',
        write: () =>
          h
            .publicDirectoryService()
            .patchTeamWithin(
              'tm-a',
              actorId,
              { name: 'Team retained', serviceIds: ['sv-a'] },
              access,
            ),
        renamed: () =>
          h.sqlite
            .query<{ name: string }, []>(
              "SELECT name FROM service_team_organization WHERE resource_id = 'tm-a'",
            )
            .get()?.name,
        expectedName: 'Team retained',
      },
      {
        target: 'person',
        remove: "DELETE FROM service_team WHERE id = 'tm-a'",
        reason: 'unknown_team',
        write: () =>
          h
            .publicDirectoryService()
            .patchPersonWithin(
              'pe-a',
              actorId,
              { name: 'Person retained', teamIds: ['tm-a'] },
              access,
            ),
        renamed: () =>
          h.sqlite
            .query<{ name: string }, []>(
              "SELECT name FROM person_organization WHERE resource_id = 'pe-a'",
            )
            .get()?.name,
        expectedName: 'Person retained',
      },
    ] as const) {
      let afterRace: unknown;
      countOwners = true;
      countCaptures = true;
      onOwnerAttempt = () => {
        if (ownerCalls === 2) {
          h.sqlite.run(scenario.remove);
          afterRace = durableSnapshot();
        }
      };
      try {
        expect(await scenario.write()).toEqual({ ok: false, reason: scenario.reason });
      } finally {
        onOwnerAttempt = null;
        countOwners = false;
        countCaptures = false;
      }
      expect(ownerCalls).toBe(2);
      expect(observedCaptures).toBe(2);
      expect(scenario.renamed()).toBe(scenario.expectedName);
      expect(durableSnapshot()).toEqual(afterRace);
      expect(pushes).toBe(0);
      ownerCalls = 0;
      observedCaptures = 0;
    }
  });

  it('returns typed late existing-person add refusal', async () => {
    let afterRace: unknown;
    const actorId = h.userId('ada');
    let pushes = 0;
    pushDuringTest = () => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    };
    const access = {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-a', userId: actorId, role: 'member' as const },
    };
    countOwners = true;
    countCaptures = true;
    onOwnerAttempt = () => {
      h.sqlite.run("DELETE FROM service_team WHERE id = 'tm-a'");
      afterRace = durableSnapshot();
      onOwnerAttempt = null;
    };
    try {
      expect(
        await h.publicDirectoryService().addPersonWithin(actorId, 'pe-a', ['tm-a'], access),
      ).toEqual({ ok: false, reason: 'unknown_team' });
    } finally {
      onOwnerAttempt = null;
      countOwners = false;
      countCaptures = false;
    }
    expect(ownerCalls).toBe(1);
    expect(observedCaptures).toBe(0);
    expect(durableSnapshot()).toEqual(afterRace);
    expect(pushes).toBe(0);
    expect(h.sqlite.query("SELECT * FROM person_team WHERE person_id = 'pe-a'").all()).toEqual([]);
  });

  it('returns typed late new-person link refusal after its earlier raw creates', async () => {
    let afterRace: unknown;
    const actorId = h.userId('ada');
    let pushes = 0;
    pushDuringTest = () => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    };
    const access = {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-a', userId: actorId, role: 'member' as const },
    };
    countOwners = true;
    countCaptures = true;
    onOwnerAttempt = () => {
      if (ownerCalls !== 3) return;
      h.sqlite.run("DELETE FROM service_team WHERE id = 'tm-a'");
      afterRace = durableSnapshot();
      onOwnerAttempt = null;
    };
    try {
      expect(
        await h.publicDirectoryService().addPersonWithin(actorId, 'New Ada', ['tm-a'], access),
      ).toEqual({ ok: false, reason: 'unknown_team' });
    } finally {
      onOwnerAttempt = null;
      countOwners = false;
      countCaptures = false;
    }
    expect(ownerCalls).toBe(3);
    expect(observedCaptures).toBe(4);
    expect(durableSnapshot()).toEqual(afterRace);
    expect(pushes).toBe(0);
    const created = h.sqlite
      .query<{ resource_id: string }, []>(
        "SELECT resource_id FROM person_organization WHERE name = 'New Ada'",
      )
      .get()?.resource_id;
    if (created === undefined) throw new Error('new person mapping was not retained');
    expect(h.sqlite.query('SELECT * FROM person_team WHERE person_id = ?').all(created)).toEqual(
      [],
    );
  });

  it('returns typed late not_found for addressed person and team owner refusals', async () => {
    const actorId = h.userId('ada');
    const access = {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-a', userId: actorId, role: 'member' as const },
    };
    for (const scenario of [
      {
        root: 'person',
        id: 'pe-a',
        write: () =>
          h.publicDirectoryService().patchPersonWithin('pe-a', actorId, { kind: 'agent' }, access),
      },
      {
        root: 'service_team',
        id: 'tm-a',
        write: () =>
          h.publicDirectoryService().patchTeamWithin('tm-a', actorId, { serviceIds: [] }, access),
      },
    ]) {
      countOwners = true;
      countCaptures = true;
      onOwnerAttempt = () => {
        h.sqlite.run(`DELETE FROM ${scenario.root} WHERE id = ?`, [scenario.id]);
        onOwnerAttempt = null;
      };
      try {
        expect(await scenario.write()).toEqual({ ok: false, reason: 'not_found' });
      } finally {
        countOwners = false;
        countCaptures = false;
        onOwnerAttempt = null;
      }
      expect(observedCaptures).toBe(0);
      observedCaptures = 0;
    }
  });

  it('announces a committed standalone rename once when the later link patch fails', async () => {
    await seedSharedStandalonePerson([own]);
    const actorId = h.userId('ada');
    let pushes = 0;
    pushDuringTest = () => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    };
    h.sqlite.run(
      "CREATE TRIGGER fail_ordinary_link BEFORE INSERT ON person_team WHEN NEW.person_id = 'pe-a' BEGIN SELECT RAISE(FAIL, 'injected later link failure'); END",
    );
    try {
      await rejectedError(
        h
          .publicDirectoryService()
          .patchPersonWithin(
            'pe-a',
            actorId,
            { name: 'Announced Ada', teamIds: ['tm-a'] },
            { kind: 'scoped', scope: { organizationId: 'org-a', userId: actorId, role: 'member' } },
          ),
      );
    } finally {
      h.sqlite.run('DROP TRIGGER fail_ordinary_link');
    }
    expect(
      h.sqlite
        .query<{ name: string }, []>(
          "SELECT name FROM person_organization WHERE resource_id = 'pe-a'",
        )
        .get()?.name,
    ).toBe('Announced Ada');
    const messages = h.sqlite
      .query<{ message: string }, [string]>(
        'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
      )
      .all(`project:${own}`)
      .map(({ message }) => JSON.parse(message) as { type: string });
    expect(messages.map(({ type }) => type)).toEqual(['directory_changed']);
    expect(pushes).toBe(1);
  });

  it('records old shared-person closure for a composed standalone cascade', async () => {
    const lower = await create('ada', 'Second A plan');
    await seedSharedStandalonePerson([own, lower]);
    const recorded = () =>
      h.sqlite
        .query<{ message: string }, [string]>(
          'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
        )
        .all(`project:${lower}`)
        .map(({ message }) => JSON.parse(message) as unknown);
    const count = recorded().length;
    expect(
      await h.removeStandaloneDirectoryWithin('people', 'pe-a', h.userId('ada'), true, {
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: h.userId('ada'), role: 'member' },
      }),
    ).toEqual({ ok: true });
    expect(recorded().slice(count)).toContainEqual({
      type: 'elsewhere_changed',
      projectId: lower,
      causeProjectId: own,
    });
  });

  it('records every real pair in the three-project standalone cascade control', async () => {
    const second = await create('ada', 'Second A plan');
    const third = await create('ada', 'Third A plan');
    await seedSharedStandalonePerson([own, second, third]);
    const actorId = h.userId('ada');
    expect(
      await h.removeStandaloneDirectoryWithin('people', 'pe-a', actorId, true, {
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: actorId, role: 'member' },
      }),
    ).toEqual({ ok: true });
    const pairs = h.sqlite
      .query<{ message: string }, []>(
        "SELECT message FROM event_log WHERE message LIKE '%elsewhere_changed%' ORDER BY subscription, seq",
      )
      .all()
      .map(({ message }) => JSON.parse(message) as unknown);
    expect(pairs).toEqual(
      [
        { type: 'elsewhere_changed', projectId: second, causeProjectId: own },
        { type: 'elsewhere_changed', projectId: third, causeProjectId: own },
        { type: 'elsewhere_changed', projectId: third, causeProjectId: second },
      ].sort(
        (left, right) =>
          left.projectId.localeCompare(right.projectId) ||
          left.causeProjectId.localeCompare(right.causeProjectId),
      ),
    );
  });

  it('rolls back a standalone cascade and first recipient when a later event insert fails', async () => {
    const downstream = [await create('ada', 'Second A plan'), await create('ada', 'Third A plan')];
    await seedSharedStandalonePerson([own, ...downstream]);
    const second = [...downstream].sort().at(1);
    if (second === undefined) throw new Error('directory rollback fixture has no second recipient');
    const before = snapshot();
    const eventsBefore = h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all();
    const sequencesBefore = h.sqlite
      .query('SELECT * FROM event_sequencer ORDER BY subscription')
      .all();
    let pushes = 0;
    pushDuringTest = () => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    };
    countOwners = true;
    countCaptures = true;
    h.sqlite.run(
      `CREATE TRIGGER fail_standalone_fanout BEFORE INSERT ON event_log WHEN NEW.subscription = 'project:${second}' BEGIN SELECT RAISE(FAIL, 'injected directory fan-out failure'); END`,
    );
    try {
      await rejectedError(
        h.removeStandaloneDirectoryWithin('people', 'pe-a', h.userId('ada'), true, {
          kind: 'scoped',
          scope: { organizationId: 'org-a', userId: h.userId('ada'), role: 'member' },
        }),
      );
    } finally {
      countOwners = false;
      countCaptures = false;
      h.sqlite.run('DROP TRIGGER fail_standalone_fanout');
    }
    expect(ownerCalls).toBe(1);
    expect(observedCaptures).toBe(2);
    expect(pushes).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(h.sqlite.query('SELECT * FROM event_log ORDER BY subscription, seq').all()).toEqual(
      eventsBefore,
    );
    expect(h.sqlite.query('SELECT * FROM event_sequencer ORDER BY subscription').all()).toEqual(
      sequencesBefore,
    );
  });

  it('releases the standalone directory writer before waiting on recipient transport', async () => {
    const lower = await create('ada', 'Second A plan');
    await seedSharedStandalonePerson([own, lower]);
    const entered = Promise.withResolvers<undefined>();
    const held = Promise.withResolvers<undefined>();
    pushDuringTest = async () => {
      entered.resolve(undefined);
      await held.promise;
      return Response.json({ delivered_to_sockets: 0 });
    };
    const pending = h.removeStandaloneDirectoryWithin('people', 'pe-a', h.userId('ada'), true, {
      kind: 'scoped',
      scope: { organizationId: 'org-a', userId: h.userId('ada'), role: 'member' },
    });
    await entered.promise;
    try {
      h.sqlite.run('UPDATE project SET name = ? WHERE id = ?', ['second writer entered', own]);
    } finally {
      held.resolve(undefined);
    }
    expect(await pending).toEqual({ ok: true });
    expect(
      h.sqlite.query<{ name: string }, [string]>('SELECT name FROM project WHERE id = ?').get(own)
        ?.name,
    ).toBe('second writer entered');
  });

  it('records one final fan-out for a project-null directory batch with two used people', async () => {
    const lower = await create('ada', 'Second A plan');
    const third = await create('ada', 'Third A plan');
    const projects = [own, lower, third];
    await seedSharedStandalonePerson(projects);
    h.sqlite.run("INSERT INTO person (id, name) VALUES ('pe-ben', 'Ben')");
    h.sqlite.run(
      "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('pe-ben', 'org-a', 'Ben')",
    );
    for (const [index, projectId] of projects.entries()) {
      const read = await h.call('ada', 'GET', `/api/projects/${projectId}`);
      const stepId = (read.body as { steps: { id: string }[] }).steps.at(0)?.id;
      if (stepId === undefined) throw new Error('directory batch fixture has no step');
      const rowId = `directory-ben-${String(index)}`;
      h.sqlite.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 20, ?)', [
        rowId,
        projectId,
        rowId,
      ]);
      h.sqlite.run(
        'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
        [rowId, stepId],
      );
      h.sqlite.run(
        "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, 'pe-ben')",
        [rowId, stepId],
      );
    }
    countOwners = true;
    refuseNestedOwner = true;
    let response: Answer;
    try {
      response = await directory('ada', [
        { kind: 'deletePerson', personId: 'pe-a', cascade: true },
        { kind: 'deletePerson', personId: 'pe-ben', cascade: true },
      ]);
    } finally {
      countOwners = false;
      refuseNestedOwner = false;
    }
    expect(response.status).toBe(200);
    expect(ownerCalls).toBe(1);
    const pairs = h.sqlite
      .query<{ message: string }, []>(
        "SELECT message FROM event_log WHERE message LIKE '%elsewhere_changed%' ORDER BY subscription, seq",
      )
      .all()
      .map(({ message }) => JSON.parse(message) as unknown);
    expect(pairs).toEqual(
      [
        { type: 'elsewhere_changed', projectId: lower, causeProjectId: own },
        { type: 'elsewhere_changed', projectId: third, causeProjectId: own },
        { type: 'elsewhere_changed', projectId: third, causeProjectId: lower },
      ].sort(
        (left, right) =>
          left.projectId.localeCompare(right.projectId) ||
          left.causeProjectId.localeCompare(right.causeProjectId),
      ),
    );
  });

  it('creates the same names in two organizations, each finding only its own', async () => {
    const mine = await directory('ada', [
      { kind: 'createTag', ref: 't', name: 'urgent' },
      { kind: 'createService', name: 'Billing' },
      { kind: 'createWorkItemType', name: 'Bug' },
      { kind: 'createTeam', ref: 'team', name: 'Platform' },
      { kind: 'createPerson', name: 'Kat', teamRefs: ['team'] },
    ]);
    expect(mine.status).toBe(200);
    const theirs = await directory('grace', [
      { kind: 'createTag', name: 'urgent' },
      { kind: 'createService', name: 'Billing' },
      { kind: 'createWorkItemType', name: 'Bug' },
      { kind: 'createTeam', name: 'Platform' },
      { kind: 'createPerson', name: 'Kat' },
    ]);
    expect(theirs.status).toBe(200);
    const ids = (answer: Answer) =>
      (answer.body as { results: { id: string; entity: { name: string } }[] }).results.map(
        (each) => [each.id, each.entity.name],
      );
    const a = ids(mine);
    const b = ids(theirs);
    expect(a.map(([, name]) => name)).toEqual(['urgent', 'Billing', 'Bug', 'Platform', 'Kat']);
    expect(b.map(([, name]) => name)).toEqual(a.map(([, name]) => name));
    for (const [index, [id]] of a.entries()) expect(b[index]?.[0]).not.toBe(id);
    // Idempotent by the organization-local name.
    const again = await directory('ada', [{ kind: 'createTag', name: 'urgent' }]);
    expect(ids(again)).toEqual([a[0]]);
    // The roots carry opaque names, never a display name two organizations share.
    const first = a.at(0);
    if (first === undefined) throw new Error('the tag create minted no id');
    const [urgent] = first;
    const tagRoot = h.sqlite
      .query<{ name: string }, [string]>('SELECT name FROM tag WHERE id = ?')
      .get(urgent);
    expect(tagRoot?.name).toBe(urgent);
    expect(await list('ada', '/api/tags', 'tags')).toEqual([
      { id: 'tg-a', name: 'tg-a' },
      { id: a[0]?.[0], name: 'urgent' },
    ]);
    expect(await list('grace', '/api/tags', 'tags')).toEqual([
      { id: 'tg-b', name: 'tg-b' },
      { id: b[0]?.[0], name: 'urgent' },
    ]);
  });

  it('answers a foreign entry exactly as an absent one, changing nothing', async () => {
    const pairs: [unknown, unknown][] = [
      [
        { kind: 'patchTag', tagId: 'tg-b', name: 'mine now' },
        { kind: 'patchTag', tagId: 'no-tag', name: 'mine now' },
      ],
      [
        { kind: 'patchService', serviceId: 'sv-b', name: 'mine now' },
        { kind: 'patchService', serviceId: 'no-service', name: 'mine now' },
      ],
      [
        { kind: 'patchWorkItemType', typeId: 'ty-b', name: 'mine now' },
        { kind: 'patchWorkItemType', typeId: 'no-type', name: 'mine now' },
      ],
      [
        { kind: 'patchTeam', teamId: 'tm-b', patch: { name: 'mine now' } },
        { kind: 'patchTeam', teamId: 'no-team', patch: { name: 'mine now' } },
      ],
      [
        { kind: 'patchPerson', personId: 'pe-b', patch: { name: 'mine now' } },
        { kind: 'patchPerson', personId: 'no-person', patch: { name: 'mine now' } },
      ],
      [
        { kind: 'patchTeam', teamId: 'tm-b', patch: { serviceIds: [] } },
        { kind: 'patchTeam', teamId: 'no-team', patch: { serviceIds: [] } },
      ],
      [
        { kind: 'patchPerson', personId: 'pe-b', patch: { kind: 'agent' } },
        { kind: 'patchPerson', personId: 'no-person', patch: { kind: 'agent' } },
      ],
      [
        { kind: 'deleteTag', tagId: 'tg-b', cascade: true },
        { kind: 'deleteTag', tagId: 'no-tag', cascade: true },
      ],
      [
        { kind: 'deleteService', serviceId: 'sv-b', cascade: true },
        { kind: 'deleteService', serviceId: 'no-service', cascade: true },
      ],
      [
        { kind: 'deleteWorkItemType', typeId: 'ty-b', cascade: true },
        { kind: 'deleteWorkItemType', typeId: 'no-type', cascade: true },
      ],
      [
        { kind: 'deleteTeam', teamId: 'tm-b', cascade: true },
        { kind: 'deleteTeam', teamId: 'no-team', cascade: true },
      ],
      [
        { kind: 'deletePerson', personId: 'pe-b', cascade: true },
        { kind: 'deletePerson', personId: 'no-person', cascade: true },
      ],
    ];
    for (const [foreignCommand, absentCommand] of pairs) {
      const before = snapshot();
      const foreignAnswer = await directory('ada', [
        { kind: 'createTag', name: 'kept?' },
        foreignCommand,
      ]);
      expect({ foreignCommand, answer: foreignAnswer }).toMatchObject({
        foreignCommand,
        answer: { status: 404, body: { error: 'not_found', at: 1 } },
      });
      expect(await directory('ada', [{ kind: 'createTag', name: 'kept?' }, absentCommand])).toEqual(
        foreignAnswer,
      );
      expect(snapshot()).toEqual(before);
    }
  });

  it('refuses a foreign service or team link exactly as an absent one', async () => {
    const pairs: [unknown, unknown, string][] = [
      [
        { kind: 'patchTeam', teamId: 'tm-a', patch: { serviceIds: ['sv-b'] } },
        { kind: 'patchTeam', teamId: 'tm-a', patch: { serviceIds: ['no-service'] } },
        'unknown_service',
      ],
      [
        { kind: 'patchPerson', personId: 'pe-a', patch: { teamIds: ['tm-b'] } },
        { kind: 'patchPerson', personId: 'pe-a', patch: { teamIds: ['no-team'] } },
        'unknown_team',
      ],
      [
        { kind: 'createPerson', name: 'Newcomer', teamIds: ['tm-b'] },
        { kind: 'createPerson', name: 'Newcomer', teamIds: ['no-team'] },
        'unknown_team',
      ],
      [
        { kind: 'createPerson', name: 'pe-a', teamIds: ['tm-b'] },
        { kind: 'createPerson', name: 'pe-a', teamIds: ['no-team'] },
        'unknown_team',
      ],
    ];
    for (const [foreignCommand, absentCommand, error] of pairs) {
      const before = snapshot();
      const foreignAnswer = await directory('ada', [foreignCommand]);
      expect({ foreignCommand, answer: foreignAnswer }).toMatchObject({
        foreignCommand,
        answer: { status: 404, body: { error, at: 0 } },
      });
      expect(await directory('ada', [absentCommand])).toEqual(foreignAnswer);
      expect(snapshot()).toEqual(before);
    }
  });

  it('renames only the organization-local name, refusing one another entry holds', async () => {
    h.sqlite.run("INSERT INTO tag (id, name) VALUES ('tg-a2', 'root-tg-a2')");
    h.sqlite.run(
      "INSERT INTO tag_organization (resource_id, organization_id, name) VALUES ('tg-a2', 'org-a', 'other')",
    );
    const before = snapshot();
    expect(await directory('ada', [{ kind: 'patchTag', tagId: 'tg-a', name: 'other' }])).toEqual({
      status: 409,
      body: { error: 'taken', at: 0, kind: 'patchTag', name: 'other' },
    });
    expect(snapshot()).toEqual(before);
    // B's name does not block A.
    const renamed = await directory('ada', [
      { kind: 'patchTag', tagId: 'tg-a', name: 'tg-b' },
      { kind: 'patchTeam', teamId: 'tm-a', patch: { name: 'Core', serviceIds: ['sv-a'] } },
      { kind: 'patchPerson', personId: 'pe-a', patch: { name: 'Ada L', teamIds: ['tm-a'] } },
    ]);
    expect(renamed).toMatchObject({
      status: 200,
      body: {
        results: [
          { entity: { id: 'tg-a', name: 'tg-b' } },
          { entity: { id: 'tm-a', name: 'Core', serviceIds: ['sv-a'] } },
          { entity: { id: 'pe-a', name: 'Ada L', teamIds: ['tm-a'] } },
        ],
      },
    });
    const roots = h.sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM tag WHERE id = 'tg-a' UNION ALL SELECT name FROM service_team WHERE id = 'tm-a' UNION ALL SELECT name FROM person WHERE id = 'pe-a'",
      )
      .all();
    expect(roots.map((row) => row.name)).toEqual(['root-tg-a', 'root-tm-a', 'root-pe-a']);
    expect(await list('grace', '/api/tags', 'tags')).toEqual([{ id: 'tg-b', name: 'tg-b' }]);
  });

  it('shows removal usage under organization-local names only', async () => {
    const step = (
      (await h.call('ada', 'GET', `/api/projects/${own}`)).body as { steps: { id: string }[] }
    ).steps[0]?.id;
    const created = await h.call('ada', 'POST', `/api/projects/${own}/commands`, {
      commands: [
        { kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Root' },
        { kind: 'setAssignee', workItemRef: 'w', stepId: step, personId: 'pe-a' },
        { kind: 'patchWorkItem', workItemRef: 'w', patch: { teamIds: ['tm-a'] } },
      ],
    });
    expect(created.status).toBe(200);
    h.sqlite.run("INSERT INTO person_team (person_id, service_team_id) VALUES ('pe-a', 'tm-a')");
    for (const command of [
      { kind: 'deletePerson', personId: 'pe-a' },
      { kind: 'deleteTeam', teamId: 'tm-a' },
    ]) {
      const refused = await directory('ada', [command]);
      expect(refused.status).toBe(409);
      expect(JSON.stringify(refused.body)).not.toContain('root-');
      expect(JSON.stringify(refused.body)).toContain('pe-a');
    }
    expect(
      (await directory('ada', [{ kind: 'deleteTeam', teamId: 'tm-a', cascade: true }])).status,
    ).toBe(200);
  });

  it('refreshes the mounted Working Plan after a team cascade before duplicating its leaf', async () => {
    const later = await create('ada', 'Later A plan');
    const ownRead = await h.call('ada', 'GET', `/api/projects/${own}`);
    const laterRead = await h.call('ada', 'GET', `/api/projects/${later}`);
    const ownStep = (ownRead.body as { steps: { id: string }[] }).steps.at(0)?.id;
    const laterStep = (laterRead.body as { steps: { id: string }[] }).steps.at(0)?.id;
    if (ownStep === undefined || laterStep === undefined) throw new Error('fixture step is absent');
    for (const [projectId, rowId, stepId] of [
      [own, 'reload-leaf', ownStep],
      [later, 'reload-later', laterStep],
    ]) {
      h.sqlite.run(
        "UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
        [projectId],
      );
      h.sqlite.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)', [
        rowId,
        projectId,
        rowId,
      ]);
      h.sqlite.run(
        'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
        [rowId, stepId],
      );
      h.sqlite.run(
        "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, 'pe-a')",
        [rowId, stepId],
      );
    }
    h.sqlite.run(
      "INSERT INTO work_item_team (work_item_id, team_id) VALUES ('reload-leaf', 'tm-a')",
    );
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const before = await h.captureFanout('org-a');
    const beforeLater = before.observation.projects.find((project) => project.projectId === later);
    if (beforeLater?.outcome.kind !== 'scheduled') throw new Error('later plan is not scheduled');
    expect(
      [...beforeLater.outcome.fast.slices.values()]
        .filter((slice) => slice.workItemId === 'reload-later' && slice.stepId === laterStep)
        .map((slice) => slice.earliestStart),
    ).toEqual([1]);
    const batch = await h.call('ada', 'POST', `/api/projects/${own}/commands`, {
      commands: [
        {
          kind: 'setEstimate',
          workItemId: 'reload-leaf',
          stepId: ownStep,
          days: { optimistic: 1, realistic: 1, pessimistic: 1 },
        },
        { kind: 'deleteTeam', teamId: 'tm-a', cascade: true },
        { kind: 'duplicateWorkItem', workItemId: 'reload-leaf', ref: 'copy' },
        { kind: 'arrangeBySchedule' },
      ],
    });
    expect(batch.status).toBe(200);
    const copy = h.sqlite
      .query<{ id: string }, [string]>(
        "SELECT id FROM work_item WHERE project_id = ? AND name = 'reload-leaf (copy)'",
      )
      .get(own)?.id;
    if (copy === undefined) throw new Error('duplicate command returned no copy');
    expect(
      h.sqlite
        .query('SELECT * FROM work_item_team WHERE work_item_id IN (?, ?)')
        .all('reload-leaf', copy),
    ).toEqual([]);
    expect(
      h.sqlite
        .query<{ person_id: string }, [string]>(
          'SELECT person_id FROM assignment WHERE work_item_id = ? ORDER BY step_id',
        )
        .all(copy)
        .map(({ person_id }) => person_id),
    ).toEqual(['pe-a']);
    const after = await h.captureFanout('org-a');
    const afterLater = after.observation.projects.find((project) => project.projectId === later);
    if (afterLater?.outcome.kind !== 'scheduled') throw new Error('later plan lost its schedule');
    expect(
      [...afterLater.outcome.fast.slices.values()]
        .filter((slice) => slice.workItemId === 'reload-later' && slice.stepId === laterStep)
        .map((slice) => slice.earliestStart),
    ).toEqual([2]);
    const sharedEvents = h.sqlite
      .query<{ message: string }, [string]>(
        'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
      )
      .all(`project:${later}`)
      .map(
        ({ message }) =>
          JSON.parse(message) as { type: string; projectId: string; causeProjectId?: string },
      );
    expect(sharedEvents.filter(({ type }) => type === 'elsewhere_changed')).toEqual([
      { type: 'elsewhere_changed', projectId: later, causeProjectId: own },
    ]);
  });

  it('fails closed on a directory entry a foreign project names', async () => {
    h.sqlite.run(
      "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-b', ?, NULL, 0, 'Theirs')",
      [foreign],
    );
    h.sqlite.run("INSERT INTO work_item_tag (work_item_id, tag_id) VALUES ('w-b', 'tg-a')");
    const before = snapshot();
    for (const command of [
      { kind: 'deleteTag', tagId: 'tg-a' },
      { kind: 'deleteTag', tagId: 'tg-a', cascade: true },
      { kind: 'patchTag', tagId: 'tg-a', name: 'renamed' },
    ]) {
      const answer = await directory('ada', [command]);
      expect({ command, status: answer.status }).toEqual({ command, status: 500 });
    }
    expect(snapshot()).toEqual(before);
    expect(own).not.toBe(foreign);
  });

  it('fails closed on an entry another organization reaches, whatever the write', async () => {
    h.sqlite.run(
      "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-b', ?, NULL, 0, 'Theirs')",
      [foreign],
    );
    const step = (
      (await h.call('grace', 'GET', `/api/projects/${foreign}`)).body as { steps: { id: string }[] }
    ).steps.at(0)?.id;
    if (step === undefined) throw new Error('the foreign project started with no step');
    const reaches: [string, [string, unknown[]][], unknown[]][] = [
      [
        "B's person in A's team",
        [["INSERT INTO person_team (person_id, service_team_id) VALUES ('pe-b', 'tm-a')", []]],
        [
          { kind: 'deleteTeam', teamId: 'tm-a', cascade: true },
          { kind: 'patchTeam', teamId: 'tm-a', patch: { name: 'Renamed' } },
        ],
      ],
      [
        "B's capacity for A's team",
        [
          [
            'INSERT INTO project_team_capacity (project_id, service_team_id, size) VALUES (?, ?, 2)',
            [foreign, 'tm-a'],
          ],
        ],
        [{ kind: 'patchTeam', teamId: 'tm-a', patch: { serviceIds: [] } }],
      ],
      [
        "B's team owning A's service",
        [["INSERT INTO team_service (team_id, service_id) VALUES ('tm-b', 'sv-a')", []]],
        [{ kind: 'deleteService', serviceId: 'sv-a' }],
      ],
      [
        "B's assignment of A's person",
        [
          [
            'INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)',
            ['w-b', step, 'pe-a'],
          ],
        ],
        [
          { kind: 'patchPerson', personId: 'pe-a', patch: { kind: 'agent' } },
          { kind: 'createPerson', name: 'pe-a', teamIds: ['tm-a'] },
        ],
      ],
      [
        "A's assignment of A's person on B's step",
        [
          [
            "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-a', ?, NULL, 0, 'Mine')",
            [own],
          ],
          [
            'INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)',
            ['w-a', step, 'pe-a'],
          ],
        ],
        [{ kind: 'deletePerson', personId: 'pe-a', cascade: true }],
      ],
      [
        "A's person in B's team",
        [["INSERT INTO person_team (person_id, service_team_id) VALUES ('pe-a', 'tm-b')", []]],
        [{ kind: 'patchPerson', personId: 'pe-a', patch: { kind: 'agent' } }],
      ],
      [
        "A's team owning B's service",
        [["INSERT INTO team_service (team_id, service_id) VALUES ('tm-a', 'sv-b')", []]],
        [{ kind: 'patchTeam', teamId: 'tm-a', patch: { name: 'Renamed' } }],
      ],
      [
        "B's row labelled with A's team",
        [["INSERT INTO work_item_team (work_item_id, team_id) VALUES ('w-b', 'tm-a')", []]],
        [{ kind: 'patchTeam', teamId: 'tm-a', patch: { name: 'Renamed' } }],
      ],
      [
        "B's row led by A's team",
        [["UPDATE work_item SET service_team_id = 'tm-a' WHERE id = 'w-b'", []]],
        [{ kind: 'patchTeam', teamId: 'tm-a', patch: { name: 'Renamed' } }],
      ],
      [
        "B's row delivering A's service",
        [["INSERT INTO work_item_service (work_item_id, service_id) VALUES ('w-b', 'sv-a')", []]],
        [{ kind: 'patchService', serviceId: 'sv-a', name: 'Renamed' }],
      ],
      [
        "B's row's single service A's",
        [["UPDATE work_item SET service_id = 'sv-a' WHERE id = 'w-b'", []]],
        [{ kind: 'patchService', serviceId: 'sv-a', name: 'Renamed' }],
      ],
      [
        "B's row typed with A's type",
        [
          [
            "INSERT INTO work_item_work_item_type (work_item_id, type_id) VALUES ('w-b', 'ty-a')",
            [],
          ],
        ],
        [{ kind: 'patchWorkItemType', typeId: 'ty-a', name: 'Renamed' }],
      ],
      [
        "B's row tagged with A's tag",
        [["INSERT INTO work_item_tag (work_item_id, tag_id) VALUES ('w-b', 'tg-a')", []]],
        [{ kind: 'patchTag', tagId: 'tg-a', name: 'Renamed' }],
      ],
    ];
    for (const [reach, seeds, commands] of reaches) {
      for (const [statement, params] of seeds) h.sqlite.run(statement, params as string[]);
      const before = snapshot();
      for (const command of commands) {
        const answer = await directory('ada', [command]);
        expect({ reach, command, status: answer.status }).toEqual({ reach, command, status: 500 });
      }
      expect(snapshot()).toEqual(before);
      h.sqlite.run("DELETE FROM person_team WHERE person_id = 'pe-b'");
      h.sqlite.run('DELETE FROM project_team_capacity WHERE project_id = ?', [foreign]);
      h.sqlite.run("DELETE FROM team_service WHERE team_id = 'tm-b'");
      h.sqlite.run("DELETE FROM assignment WHERE work_item_id IN ('w-a', 'w-b')");
      h.sqlite.run("DELETE FROM work_item WHERE id = 'w-a'");
      h.sqlite.run("DELETE FROM person_team WHERE person_id = 'pe-a'");
      h.sqlite.run("DELETE FROM team_service WHERE team_id = 'tm-a'");
      h.sqlite.run("DELETE FROM work_item_team WHERE work_item_id = 'w-b'");
      h.sqlite.run(
        "UPDATE work_item SET service_team_id = NULL, service_id = NULL WHERE id = 'w-b'",
      );
      h.sqlite.run("DELETE FROM work_item_service WHERE work_item_id = 'w-b'");
      h.sqlite.run("DELETE FROM work_item_work_item_type WHERE work_item_id = 'w-b'");
      h.sqlite.run("DELETE FROM work_item_tag WHERE work_item_id = 'w-b'");
    }
  });

  it('refuses a viewer every directory command', async () => {
    const before = snapshot();
    expect(await directory('vic', [{ kind: 'createTag', name: 'x' }])).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(snapshot()).toEqual(before);
  });
});
