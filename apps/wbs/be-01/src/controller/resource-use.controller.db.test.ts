import { resourceRuntimeAdmission, resourceRuntimeEvent } from '@wbs/contracts';
import { openDatabase } from '@wbs/store-sqlite';
import { afterEach, beforeAll, beforeEach, expect, it } from 'bun:test';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import { type HarnessMachineGrants, OrganizationHarness } from '../testing/organization-harness';

let machineGrants: HarnessMachineGrants;
let h: OrganizationHarness;
let projectId: string;
let leaf: string;
let resourceId: string;
let key: string;
let path: string;
beforeAll(async () => {
  machineGrants = await forwardingMachineGrants();
});
/**
 * Resource uses and the runtime authority's events over be-01's production
 * composition and real SQLite. Every machine key, the agent's and the runtime
 * controller's, reaches be-01 through mcp-01's forwarded grant
 * ({@link callForwarded}), as on the MCP path.
 */
beforeEach(async () => {
  h = OrganizationHarness.openComposedWith({ machineGrants });
  for (const username of ['owner', 'viewer', 'other']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'owner', 'super_admin');
  h.member('org-a', 'viewer', 'viewer');
  h.member('org-b', 'other', 'admin');
  h.bind('owner', 'org-a');
  h.bind('viewer', 'org-a');
  h.bind('other', 'org-b');
  h.activate();
  addAgentPerson(h.sqlite, 'agent-a', 'org-a', h.userId('owner'));
  addAgentPerson(h.sqlite, 'agent-b', 'org-b', h.userId('other'));
  key = (
    await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'agent-a',
      issuedBy: h.userId('owner'),
    })
  ).key;
  const project = await h.call('owner', 'POST', '/api/projects', { name: 'Tracked plan' });
  projectId = (project.body as { project: { id: string } }).project.id;
  const created = await h.call('owner', 'POST', `/api/projects/${projectId}/commands`, {
    commands: [{ kind: 'createWorkItem', parentId: null, name: 'Leaf' }],
  });
  leaf = (created.body as { results: { id: string }[] }).results[0].id;
  const resource = await h.call('owner', 'POST', '/api/directory/commands', {
    commands: [
      { kind: 'createResource', name: 'Disk', resourceKind: 'divisible', unitLabel: 'GB' },
    ],
  });
  resourceId = (resource.body as { results: { id: string }[] }).results[0].id;
  path = `/api/projects/${projectId}/resource-uses`;
});
afterEach(async () => h.closeComposed());
function draft(requestId = crypto.randomUUID()) {
  return {
    requestId,
    resourceId,
    workItemId: leaf,
    agentRun: 'run-a',
    responsiblePersonId: 'agent-a',
    locator: '/display/checkout',
    units: 3,
  };
}
async function registered(extra = {}) {
  const answer = await h.call('owner', 'POST', path, { ...draft(), ...extra });
  expect(answer.status).toBe(201);
  return (answer.body as { use: { id: string; state: string; revision: number } }).use;
}
function event(id: string, kind: string, expectedRevision: number, extra = {}) {
  return h.call('owner', 'POST', `${path}/${id}/events`, {
    eventId: crypto.randomUUID(),
    kind,
    expectedRevision,
    reason: 'Operator report',
    ...extra,
  });
}
it('registers two separate copies with immutable snapshots and paginated history', async () => {
  const first = await registered();
  const second = await registered();
  expect(first.id).not.toBe(second.id);
  const listed = await h.call('viewer', 'GET', `${path}?limit=1`);
  expect(listed.status).toBe(200);
  expect(listed.body).toMatchObject({
    uses: [{ resourceName: 'Disk', unitLabel: 'GB', state: 'active', revision: 1 }],
  });
  const cursor = (listed.body as { nextCursor: string }).nextCursor;
  expect(cursor).toBeString();
  expect((await h.call('viewer', 'GET', `${path}?limit=1&cursor=${cursor}`)).body).toMatchObject({
    nextCursor: null,
  });
  expect((await h.call('owner', 'GET', `${path}/${first.id}/history`)).body).toMatchObject({
    events: [{ kind: 'registered', source: 'reported', revision: 1 }],
  });
});
it('requires pending cleanup and evidence, records reported release, and refuses terminal changes', async () => {
  const use = await registered();
  expect((await event(use.id, 'release_reported', 1, { evidence: 'evidence:1' })).status).toBe(409);
  expect((await event(use.id, 'cleanup_requested', 1)).body).toMatchObject({
    use: { state: 'cleanup_pending', revision: 2 },
  });
  expect((await event(use.id, 'release_reported', 2)).status).toBe(400);
  expect((await event(use.id, 'release_reported', 2, { evidence: '  ' })).status).toBe(400);
  expect(
    (await event(use.id, 'release_reported', 2, { evidence: 'evidence:1' })).body,
  ).toMatchObject({ use: { state: 'release_reported', revision: 3 } });
  expect((await event(use.id, 'cleanup_requested', 3)).status).toBe(409);
});
it('binds idempotency to exact body and actor and refuses stale concurrent writes', async () => {
  const body = draft();
  const first = await h.call('owner', 'POST', path, body);
  expect(first.status).toBe(201);
  expect(await h.call('owner', 'POST', path, body)).toEqual(first);
  expect((await h.call('owner', 'POST', path, { ...body, units: 4 })).status).toBe(409);
  expect((await callForwarded(h, key, 'POST', path, body)).status).toBe(409);
  const id = (first.body as { use: { id: string } }).use.id;
  const append = {
    eventId: 'event-1',
    expectedRevision: 1,
    kind: 'cleanup_requested',
    reason: 'done',
  };
  const wrote = await h.call('owner', 'POST', `${path}/${id}/events`, append);
  expect(wrote.status).toBe(200);
  expect(await h.call('owner', 'POST', `${path}/${id}/events`, append)).toEqual(wrote);
  expect(
    (await h.call('owner', 'POST', `${path}/${id}/events`, { ...append, reason: 'changed' }))
      .status,
  ).toBe(409);
  const raced = await Promise.all([
    event(id, 'cleanup_blocked', 2),
    event(id, 'release_reported', 2, { evidence: 'e:1' }),
  ]);
  expect(raced.map((each) => each.status).sort()).toEqual([200, 409]);
});
it('validates retention owner, reason and deadline', async () => {
  const use = await registered();
  expect(
    (await event(use.id, 'retained', 1, { ownerPersonId: 'agent-b', reviewAt: Date.now() + 60000 }))
      .status,
  ).toBe(404);
  expect(
    (await event(use.id, 'retained', 1, { ownerPersonId: 'agent-a', reviewAt: 1 })).status,
  ).toBe(400);
  expect(
    (await event(use.id, 'retained', 1, { ownerPersonId: 'agent-a', reviewAt: Date.now() + 60000 }))
      .body,
  ).toMatchObject({ use: { state: 'retained', retention: { ownerPersonId: 'agent-a' } } });
});
it('guards project reads and writes, viewer writes, machine attribution and foreign references', async () => {
  const use = await registered();
  for (const suffix of ['', `/${use.id}/history`])
    expect((await h.call('other', 'GET', path + suffix)).status).toBe(404);
  expect((await h.call('other', 'POST', path, draft())).status).toBe(404);
  expect(
    (
      await h.call('other', 'POST', `${path}/${use.id}/events`, {
        eventId: 'x',
        kind: 'cleanup_requested',
        expectedRevision: 1,
        reason: 'x',
      })
    ).status,
  ).toBe(404);
  expect((await h.call('viewer', 'POST', path, draft())).status).toBe(403);
  expect(
    (await callForwarded(h, key, 'POST', path, { ...draft(), responsiblePersonId: 'agent-b' }))
      .status,
  ).toBe(403);
  expect(
    (await h.call('owner', 'POST', path, { ...draft(), responsiblePersonId: 'agent-b' })).status,
  ).toBe(404);
  expect((await h.call('owner', 'POST', path, { ...draft(), workItemId: 'absent' })).status).toBe(
    404,
  );
  expect((await callForwarded(h, key, 'POST', path, draft())).status).toBe(201);
});
async function commands(commands: unknown[]) {
  return h.call('owner', 'POST', `/api/projects/${projectId}/commands`, { commands });
}
function states() {
  return h.sqlite
    .query<{ id: string; state: string }, []>('SELECT id,state FROM resource_use ORDER BY id')
    .all();
}
async function steps() {
  return (
    (await h.call('owner', 'GET', `/api/projects/${projectId}`)).body as { steps: { id: string }[] }
  ).steps.map((each) => each.id);
}
it('signals only the last matching claim release and leaves other runs and retained uses alone', async () => {
  const [dev, qa] = await steps();
  // Both claims continue independently releasable work; QA has already started.
  expect(
    (await commands([{ kind: 'setProgress', workItemId: leaf, stepId: qa, state: 'in_progress' }]))
      .status,
  ).toBe(200);
  expect(
    (
      await commands([
        { kind: 'claimWorkItem', workItemId: leaf, personId: 'agent-a', runId: 'run-a' },
      ])
    ).status,
  ).toBe(200);
  const use = await registered();
  const other = await registered({ agentRun: 'run-b' });
  const retained = await registered();
  await event(retained.id, 'retained', 1, {
    ownerPersonId: 'agent-a',
    reviewAt: Date.now() + 60000,
  });
  expect(
    (
      await commands([
        { kind: 'releaseWorkItem', workItemId: leaf, personId: 'agent-a', steps: [dev] },
      ])
    ).status,
  ).toBe(200);
  expect(states().find((each) => each.id === use.id)?.state).toBe('active');
  expect(
    (
      await commands([
        { kind: 'releaseWorkItem', workItemId: leaf, personId: 'agent-a', steps: [qa] },
      ])
    ).status,
  ).toBe(200);
  expect(states().find((each) => each.id === use.id)?.state).toBe('cleanup_pending');
  expect(states().find((each) => each.id === other.id)?.state).toBe('active');
  expect(states().find((each) => each.id === retained.id)?.state).toBe('retained');
  expect((await h.call('owner', 'GET', `${path}/${use.id}/history`)).body).toMatchObject({
    events: [{ kind: 'registered' }, { kind: 'cleanup_requested' }],
  });
});
it('signals lease expiry through the composed sweep without reporting release', async () => {
  const [dev] = await steps();
  expect(
    (
      await callForwarded(h, key, 'POST', `/api/projects/${projectId}/commands`, {
        commands: [
          {
            kind: 'claimWorkItem',
            workItemId: leaf,
            personId: 'agent-a',
            runId: 'run-a',
            steps: [dev],
          },
        ],
      })
    ).status,
  ).toBe(200);
  const use = await registered();
  h.sqlite.run('UPDATE claim SET lease_expires_at = 1');
  h.claimLeaseSweep().start();
  await h.claimLeaseSweep().settled();
  await h.claimLeaseSweep().stop();
  expect(states().find((each) => each.id === use.id)?.state).toBe('cleanup_pending');
  expect(h.sqlite.query<{ n: number }, []>('SELECT count(*) AS n FROM claim').get()?.n).toBe(0);
});
it('signals exact ended attempts atomically and keeps outcome independent of cleanup', async () => {
  const [dev, qa] = await steps();
  expect(
    (
      await commands([
        { kind: 'startAttempt', workItemId: leaf, stepId: dev, executorPersonId: 'agent-a' },
        { kind: 'startAttempt', workItemId: leaf, stepId: qa, executorPersonId: 'agent-a' },
      ])
    ).status,
  ).toBe(200);
  const use = await registered({ stepId: dev, attemptNumber: 1 });
  const other = await registered({ stepId: qa, attemptNumber: 1 });
  expect(
    (
      await commands([
        { kind: 'endAttempt', workItemId: leaf, stepId: dev, outcome: 'succeeded' },
        { kind: 'endAttempt', workItemId: leaf, stepId: dev, outcome: 'succeeded' },
      ])
    ).status,
  ).toBe(409);
  expect(states().find((each) => each.id === use.id)?.state).toBe('active');
  expect(
    (await commands([{ kind: 'endAttempt', workItemId: leaf, stepId: dev, outcome: 'succeeded' }]))
      .status,
  ).toBe(200);
  expect(states().find((each) => each.id === use.id)?.state).toBe('cleanup_pending');
  expect(states().find((each) => each.id === other.id)?.state).toBe('active');
  expect(
    h.sqlite
      .query<{ outcome: string }, [string]>('SELECT outcome FROM step_node_attempt WHERE step_id=?')
      .get(dev)?.outcome,
  ).toBe('succeeded');
  expect(
    (await commands([{ kind: 'removeAttempt', workItemId: leaf, stepId: dev, attemptNumber: 1 }]))
      .status,
  ).toBe(200);
  expect((await h.call('owner', 'GET', `${path}/${use.id}/history`)).body).toMatchObject({
    events: [{ kind: 'registered' }, { kind: 'cleanup_requested' }],
  });
});
it('keeps deleted planning snapshots and limits orphan access to original organization admins', async () => {
  const use = await registered();
  h.sqlite.run('DELETE FROM work_item WHERE id=?', [leaf]);
  h.sqlite.run('DELETE FROM project_access WHERE project_id=?', [projectId]);
  h.sqlite.run('DELETE FROM step WHERE project_id=?', [projectId]);
  h.sqlite.run('DELETE FROM project WHERE id=?', [projectId]);
  expect((await h.call('owner', 'GET', path)).body).toMatchObject({
    uses: [{ projectName: 'Tracked plan', workItemName: 'Leaf', state: 'active' }],
  });
  expect((await h.call('viewer', 'GET', path)).status).toBe(404);
  expect((await h.call('other', 'GET', `${path}/${use.id}/history`)).status).toBe(404);
  expect((await event(use.id, 'cleanup_requested', 1)).status).toBe(200);
  expect((await callForwarded(h, key, 'GET', path)).status).toBe(404);
});
it('tracking writes leave scheduling and occupancy unchanged', async () => {
  const before = await h.optimizationHash(projectId);
  const claimsBefore = await h.call('owner', 'GET', `/api/projects/${projectId}/claims`);
  const use = await registered();
  await event(use.id, 'cleanup_requested', 1);
  await event(use.id, 'release_reported', 2, { evidence: 'reported:1' });
  expect(await h.optimizationHash(projectId)).toBe(before);
  expect((await h.call('owner', 'GET', `/api/projects/${projectId}/claims`)).body).toMatchObject({
    claims: (claimsBefore.body as { claims: unknown[] }).claims,
  });
});
it('identifies the actual reporting agent in immutable history', async () => {
  const answer = await callForwarded(h, key, 'POST', path, draft());
  expect(answer.status).toBe(201);
  const use = (answer.body as { use: { id: string } }).use;
  expect((await h.call('owner', 'GET', `${path}/${use.id}/history`)).body).toMatchObject({
    events: [{ actorId: h.userId('owner'), actorPersonId: 'agent-a', actorName: 'agent-a' }],
  });
});
it('refuses late registration against an ended attempt and mismatched attempt pairs', async () => {
  const [dev] = await steps();
  await commands([
    { kind: 'startAttempt', workItemId: leaf, stepId: dev, executorPersonId: 'agent-a' },
    { kind: 'endAttempt', workItemId: leaf, stepId: dev, outcome: 'succeeded' },
  ]);
  expect(
    (await h.call('owner', 'POST', path, { ...draft(), stepId: dev, attemptNumber: 1 })).status,
  ).toBe(409);
  expect((await h.call('owner', 'POST', path, { ...draft(), stepId: dev })).status).toBe(400);
  expect((await h.call('owner', 'POST', path, { ...draft(), attemptNumber: 1 })).status).toBe(400);
});
it('denies removed members, viewers and foreign references on every write boundary', async () => {
  const use = await registered();
  const append = {
    eventId: 'viewer-event',
    kind: 'cleanup_requested',
    expectedRevision: 1,
    reason: 'x',
  };
  expect((await h.call('viewer', 'POST', `${path}/${use.id}/events`, append)).status).toBe(403);
  const foreign = await h.call('other', 'POST', '/api/directory/commands', {
    commands: [
      { kind: 'createResource', name: 'Foreign disk', resourceKind: 'divisible', unitLabel: 'GB' },
    ],
  });
  const foreignId = (foreign.body as { results: { id: string }[] }).results[0].id;
  expect((await h.call('owner', 'POST', path, { ...draft(), resourceId: foreignId })).status).toBe(
    404,
  );
  h.sqlite.run('DELETE FROM organization_membership WHERE user_id=?', [h.userId('viewer')]);
  expect((await h.call('viewer', 'GET', path)).status).toBe(403);
  expect((await h.call('viewer', 'GET', `${path}/${use.id}/history`)).status).toBe(403);
  expect((await h.call('viewer', 'POST', path, draft())).status).toBe(403);
});
it('replays the original response after later events and refuses a different event actor', async () => {
  const use = await registered();
  const pending = {
    eventId: 'pending-1',
    kind: 'cleanup_requested',
    expectedRevision: 1,
    reason: 'done',
  };
  const first = await h.call('owner', 'POST', `${path}/${use.id}/events`, pending);
  await event(use.id, 'release_reported', 2, { evidence: 'e:1' });
  expect(await h.call('owner', 'POST', `${path}/${use.id}/events`, pending)).toEqual(first);
  expect((await callForwarded(h, key, 'POST', `${path}/${use.id}/events`, pending)).status).toBe(
    409,
  );
  expect((await h.call('owner', 'GET', `${path}/${use.id}/history?limit=2`)).body).toMatchObject({
    events: [{ revision: 1 }, { revision: 2 }],
    nextCursor: '2',
  });
  expect(
    (await h.call('owner', 'GET', `${path}/${use.id}/history?limit=2&cursor=2`)).body,
  ).toMatchObject({ events: [{ revision: 3 }], nextCursor: null });
});
it('validates positive integral units, bounded pages and retention metadata without writing', async () => {
  for (const units of [0, -1, 1.5])
    expect((await h.call('owner', 'POST', path, { ...draft(), units })).status).toBe(400);
  for (const limit of ['0', '101', 'oops'])
    expect((await h.call('owner', 'GET', `${path}?limit=${limit}`)).status).toBe(400);
  const use = await registered();
  for (const extra of [
    {},
    { ownerPersonId: 'agent-a' },
    { ownerPersonId: 'agent-a', reviewAt: Date.now() + 60000, reason: '  ' },
  ])
    expect((await event(use.id, 'retained', 1, extra)).status).toBe(400);
  expect((await h.call('owner', 'GET', `${path}/${use.id}/history`)).body).toMatchObject({
    events: [{ revision: 1 }],
    nextCursor: null,
  });
});
it('preserves immutable history and refuses destructive rollback once reports exist', async () => {
  const use = await registered();
  expect(() =>
    h.sqlite.run('UPDATE resource_use_event SET revision=99 WHERE use_id=?', [use.id]),
  ).toThrow('immutable');
  expect(() => h.sqlite.run('DELETE FROM resource_use_event WHERE use_id=?', [use.id])).toThrow(
    'immutable',
  );
  const down = await Bun.file(
    new URL('../../drizzle/20261025120000_add_resource_use/down.sql', import.meta.url),
  ).text();
  expect(() => {
    h.sqlite.transaction(() => {
      for (const statement of down.split('--> statement-breakpoint').filter((each) => each.trim()))
        h.sqlite.run(statement);
    })();
  }).toThrow();
  expect((await h.call('owner', 'GET', path)).body).toMatchObject({ uses: [{ id: use.id }] });
});
it('rolls an empty migration back and forward and keeps persisted reports across a reopened reader', async () => {
  const folder = new URL('../../drizzle/20261025120000_add_resource_use/', import.meta.url);
  const down = await Bun.file(new URL('down.sql', folder)).text();
  h.sqlite.transaction(() => {
    for (const statement of down.split('--> statement-breakpoint').filter((each) => each.trim()))
      h.sqlite.run(statement);
  })();
  expect(() => h.sqlite.query('SELECT * FROM resource_use').all()).toThrow();
  const forward = await Bun.file(new URL('migration.sql', folder)).text();
  h.sqlite.transaction(() => {
    for (const statement of forward.split('--> statement-breakpoint').filter((each) => each.trim()))
      h.sqlite.run(statement);
  })();
  const use = await registered();
  const reopened = openDatabase(h.databasePath());
  try {
    expect(reopened.query<{ id: string }, []>('SELECT id FROM resource_use').all()).toEqual([
      { id: use.id },
    ]);
  } finally {
    reopened.close();
  }
});
it('refuses a stale revision even when the requested transition is otherwise valid', async () => {
  const use = await registered();
  expect((await event(use.id, 'cleanup_requested', 1)).status).toBe(200);
  expect((await event(use.id, 'release_reported', 1, { evidence: 'reported:stale' })).status).toBe(
    409,
  );
  expect(states().find((each) => each.id === use.id)?.state).toBe('cleanup_pending');
});
it('never treats an unbound claim run as matching arbitrary registered runs', async () => {
  const [dev] = await steps();
  expect(
    (
      await commands([
        { kind: 'claimWorkItem', workItemId: leaf, personId: 'agent-a', steps: [dev] },
      ])
    ).status,
  ).toBe(200);
  const use = await registered();
  expect(
    (await commands([{ kind: 'releaseWorkItem', workItemId: leaf, personId: 'agent-a' }])).status,
  ).toBe(200);
  expect(states().find((each) => each.id === use.id)?.state).toBe('active');
});
async function runtimeSetup() {
  const provider = await h.call('owner', 'POST', '/api/organization/compute-providers', {
    kind: 'ssh_host',
    name: 'Managed host',
    locator: 'display-only',
  });
  expect(provider.status).toBe(201);
  const providerId = (provider.body as { id: string }).id;
  addAgentPerson(h.sqlite, 'runtime-controller', 'org-a', h.userId('owner'));
  const issued = await issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'runtime-controller',
    issuedBy: h.userId('owner'),
    name: 'runtime-key',
  });
  const authorityId = 'dash-local';
  const binding = { providerId, credentialId: issued.id, epoch: 'epoch-one' };
  expect(
    (await h.call('owner', 'PUT', `/api/organization/resource-authorities/${authorityId}`, binding))
      .status,
  ).toBe(200);
  const runtimeUseId = crypto.randomUUID();
  const runtimeEvent = {
    eventId: crypto.randomUUID(),
    epoch: 'epoch-one',
    sequence: 1,
    useId: runtimeUseId,
    incarnation: 'incarnation-one',
    revision: 1,
    kind: 'registered',
    observedAt: Date.now(),
    reason: 'Created managed checkout',
    use: {
      projectId,
      resourceId,
      workItemId: leaf,
      agentRun: 'run-a',
      responsiblePersonId: 'agent-a',
      locator: '/enrolled/managed',
      units: 3,
      kind: 'temporary_directory',
      reservedDiskUnits: 3,
      reservedWorkspaceUnits: 1,
    },
  };
  const eventsPath = `/api/resource-authorities/${authorityId}/events`;
  return { authorityId, binding, issued, runtimeUseId, runtimeEvent, eventsPath };
}
it('admits only the exact live runtime credential and preserves ordered event replay', async () => {
  const r = await runtimeSetup();
  expect((await h.call('owner', 'PUT', r.eventsPath, r.runtimeEvent)).status).toBe(403);
  expect((await callForwarded(h, key, 'PUT', r.eventsPath, r.runtimeEvent)).status).toBe(403);
  const samePerson = await issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'runtime-controller',
    issuedBy: h.userId('owner'),
    name: 'not-the-bound-key',
  });
  expect((await callForwarded(h, samePerson.key, 'PUT', r.eventsPath, r.runtimeEvent)).status).toBe(
    403,
  );
  const wrote = await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent);
  expect(wrote).toMatchObject({
    status: 200,
    body: { acceptedSequence: 1, useId: r.runtimeUseId, revision: 1 },
  });
  expect(await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent)).toEqual(wrote);
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
        ...r.runtimeEvent,
        reason: 'changed',
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
        ...r.runtimeEvent,
        eventId: 'gap',
        sequence: 3,
        revision: 2,
        kind: 'cleanup_pending',
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
        ...r.runtimeEvent,
        eventId: 'epoch',
        epoch: 'wrong',
        sequence: 2,
        revision: 2,
        kind: 'cleanup_pending',
      })
    ).status,
  ).toBe(409);
  h.sqlite.run('UPDATE machine_credential SET revoked_at=1 WHERE id=?', [r.issued.id]);
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent)).status).toBe(
    401,
  );
});
it('queues runtime cleanup without changing the physical observation and acknowledges via trusted events', async () => {
  const r = await runtimeSetup();
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent)).status).toBe(
    200,
  );
  expect(
    (await event(r.runtimeUseId, 'release_reported', 1, { evidence: 'worker assertion' })).status,
  ).toBe(403);
  const queued = await event(r.runtimeUseId, 'cleanup_requested', 1);
  expect(queued).toMatchObject({
    status: 200,
    body: {
      use: {
        source: 'runtime',
        state: 'active',
        pendingCleanupRequest: true,
        revision: 2,
        runtimeRevision: 1,
      },
    },
  });
  const read = await callForwarded(
    h,
    r.issued.key,
    'GET',
    `/api/resource-authorities/${r.authorityId}/cleanup-requests?after=0`,
  );
  expect(read.status).toBe(200);
  const requests = (
    read.body as { requests: { requestId: number; expectedRevision: number; useId: string }[] }
  ).requests;
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ useId: r.runtimeUseId, expectedRevision: 1 });
  const pending = {
    ...r.runtimeEvent,
    eventId: 'pending',
    sequence: 2,
    revision: 2,
    kind: 'cleanup_pending',
    requestId: requests[0].requestId,
  };
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, pending)).status).toBe(200);
  expect((await h.call('owner', 'GET', path)).body).toMatchObject({
    uses: [{ state: 'cleanup_pending', pendingCleanupRequest: false, runtimeRevision: 2 }],
  });
  const released = {
    ...r.runtimeEvent,
    eventId: 'released',
    sequence: 3,
    revision: 3,
    kind: 'release_verified',
  };
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, released)).status).toBe(400);
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
        ...released,
        evidence: {
          digest: 'a'.repeat(64),
          locator: 'dash-resource://evidence/1',
          disposition: 'removed',
          reclaimedBytes: null,
        },
      })
    ).status,
  ).toBe(200);
  expect((await h.call('owner', 'GET', path)).body).toMatchObject({
    uses: [{ source: 'runtime', state: 'release_verified', reclaimedBytes: null }],
  });
  expect((await event(r.runtimeUseId, 'cleanup_requested', 4)).status).toBe(409);
});
it('protects runtime authority binding, request stream and source identity from foreign or ordinary callers', async () => {
  const r = await runtimeSetup();
  const bindPath = `/api/organization/resource-authorities/${r.authorityId}`;
  expect((await h.call('viewer', 'PUT', bindPath, r.binding)).status).toBe(403);
  expect((await callForwarded(h, key, 'PUT', bindPath, r.binding)).status).toBe(403);
  expect(
    (await h.call('owner', 'PUT', bindPath, { ...r.binding, epoch: 'replacement' })).status,
  ).toBe(409);
  expect((await h.call('other', 'GET', bindPath)).status).toBe(404);
  expect(
    (await h.call('owner', 'GET', `/api/resource-authorities/${r.authorityId}/cleanup-requests`))
      .status,
  ).toBe(403);
  expect(
    (
      await callForwarded(
        h,
        key,
        'GET',
        `/api/resource-authorities/${r.authorityId}/cleanup-requests`,
      )
    ).status,
  ).toBe(403);
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent)).status).toBe(
    200,
  );
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
        ...r.runtimeEvent,
        eventId: 'changed-use',
        sequence: 2,
        revision: 2,
        kind: 'cleanup_pending',
        use: { ...r.runtimeEvent.use, locator: '/replacement' },
      })
    ).status,
  ).toBe(409);
});
it('refuses cascading provider and resource deletion while runtime cleanup remains outstanding', async () => {
  const r = await runtimeSetup();
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent)).status).toBe(
    200,
  );
  expect(
    (
      await h.call(
        'owner',
        'DELETE',
        `/api/organization/compute-providers/${r.binding.providerId}?cascade=true`,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await h.call('owner', 'POST', '/api/directory/commands', {
        commands: [{ kind: 'deleteResource', resourceId, cascade: true }],
      })
    ).status,
  ).toBe(409);
  expect((await h.call('owner', 'GET', path)).body).toMatchObject({
    uses: [{ providerId: r.binding.providerId }],
  });
});
it('acknowledges a stale queued request with the existing terminal proof and no revived use', async () => {
  const r = await runtimeSetup();
  await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent);
  await event(r.runtimeUseId, 'cleanup_requested', 1);
  const requests = (
    await callForwarded(
      h,
      r.issued.key,
      'GET',
      `/api/resource-authorities/${r.authorityId}/cleanup-requests`,
    )
  ).body as { requests: { requestId: number }[] };
  await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
    ...r.runtimeEvent,
    eventId: 'pending-auto',
    sequence: 2,
    revision: 2,
    kind: 'cleanup_pending',
  });
  const proof = {
    digest: 'a'.repeat(64),
    locator: 'dash-resource://evidence/existing',
    disposition: 'removed',
    reclaimedBytes: null,
  };
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
        ...r.runtimeEvent,
        eventId: 'released-auto',
        sequence: 3,
        revision: 3,
        kind: 'release_verified',
        evidence: proof,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
        ...r.runtimeEvent,
        eventId: 'terminal-ack',
        sequence: 4,
        revision: 4,
        kind: 'release_verified',
        evidence: proof,
        requestId: requests.requests[0].requestId,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await callForwarded(
        h,
        r.issued.key,
        'GET',
        `/api/resource-authorities/${r.authorityId}/cleanup-requests`,
      )
    ).body,
  ).toMatchObject({ requests: [] });
});
it('revoking the worker queues runtime cleanup while its separate authority stays live', async () => {
  const r = await runtimeSetup();
  const [dev] = await steps();
  expect(
    (
      await callForwarded(h, key, 'POST', `/api/projects/${projectId}/commands`, {
        commands: [
          {
            kind: 'claimWorkItem',
            workItemId: leaf,
            personId: 'agent-a',
            runId: 'run-a',
            steps: [dev],
          },
        ],
      })
    ).status,
  ).toBe(200);
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent)).status).toBe(
    200,
  );
  h.claimLeaseSweep().start();
  await h.claimLeaseSweep().settled();
  const credential = h.sqlite
    .query<{ id: string }, []>('SELECT id FROM machine_credential WHERE person_id="agent-a"')
    .get();
  if (credential === null) throw new Error('worker credential missing');
  expect(
    (await h.call('owner', 'DELETE', `/api/organization/machine-credentials/${credential.id}`))
      .status,
  ).toBe(204);
  await h.claimLeaseSweep().settled();
  await h.claimLeaseSweep().stop();
  const queued = await callForwarded(
    h,
    r.issued.key,
    'GET',
    `/api/resource-authorities/${r.authorityId}/cleanup-requests`,
  );
  expect(queued.status).toBe(200);
  expect(queued.body).toMatchObject({ requests: [{ useId: r.runtimeUseId }] });
  expect((await h.call('owner', 'GET', path)).body).toMatchObject({
    uses: [{ state: 'active', pendingCleanupRequest: true }],
  });
});
it('queues cleanup for runtime registration delivered after its attempt already ended', async () => {
  const r = await runtimeSetup();
  const [dev] = await steps();
  await commands([
    { kind: 'startAttempt', workItemId: leaf, stepId: dev, executorPersonId: 'agent-a' },
    { kind: 'endAttempt', workItemId: leaf, stepId: dev, outcome: 'succeeded' },
  ]);
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
        ...r.runtimeEvent,
        use: { ...r.runtimeEvent.use, stepId: dev, attemptNumber: 1 },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await callForwarded(
        h,
        r.issued.key,
        'GET',
        `/api/resource-authorities/${r.authorityId}/cleanup-requests`,
      )
    ).body,
  ).toMatchObject({ requests: [{ useId: r.runtimeUseId }] });
});
it('keeps a newer cleanup request pending when later runtime events retain the older request cause', async () => {
  const r = await runtimeSetup();
  await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent);
  await event(r.runtimeUseId, 'cleanup_requested', 1);
  const first = (
    (
      await callForwarded(
        h,
        r.issued.key,
        'GET',
        `/api/resource-authorities/${r.authorityId}/cleanup-requests`,
      )
    ).body as { requests: { requestId: number }[] }
  ).requests[0].requestId;
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
        ...r.runtimeEvent,
        eventId: 'pending-cause',
        sequence: 2,
        revision: 2,
        kind: 'cleanup_pending',
        requestId: first,
      })
    ).status,
  ).toBe(200);
  expect((await event(r.runtimeUseId, 'cleanup_requested', 3)).status).toBe(200);
  const second = (
    (
      await callForwarded(
        h,
        r.issued.key,
        'GET',
        `/api/resource-authorities/${r.authorityId}/cleanup-requests`,
      )
    ).body as { requests: { requestId: number }[] }
  ).requests[0].requestId;
  const released = {
    ...r.runtimeEvent,
    eventId: 'released-cause',
    sequence: 3,
    revision: 3,
    kind: 'release_verified',
    requestId: first,
    evidence: {
      digest: 'a'.repeat(64),
      locator: 'dash-resource://proof/existing',
      disposition: 'removed',
      reclaimedBytes: null,
    },
  };
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, released)).status).toBe(200);
  expect((await h.call('owner', 'GET', path)).body).toMatchObject({
    uses: [{ state: 'release_verified', pendingCleanupRequest: true }],
  });
  expect(
    (
      await callForwarded(
        h,
        r.issued.key,
        'GET',
        `/api/resource-authorities/${r.authorityId}/cleanup-requests`,
      )
    ).body,
  ).toMatchObject({ requests: [{ requestId: second }] });
  expect(
    (
      await h.call(
        'owner',
        'DELETE',
        `/api/organization/compute-providers/${r.binding.providerId}?cascade=true`,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await h.call('owner', 'POST', '/api/directory/commands', {
        commands: [{ kind: 'deleteResource', resourceId, cascade: true }],
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
        ...released,
        eventId: 'terminal-cause',
        sequence: 4,
        revision: 4,
        requestId: second,
      })
    ).status,
  ).toBe(200);
  expect((await h.call('owner', 'GET', path)).body).toMatchObject({
    uses: [{ state: 'release_verified', pendingCleanupRequest: false }],
  });
});
it('refuses another in-scope person as the machine report owner', async () => {
  addAgentPerson(h.sqlite, 'sibling-agent', 'org-a', h.userId('owner'));
  expect(
    (
      await callForwarded(h, key, 'POST', path, {
        ...draft(),
        responsiblePersonId: 'sibling-agent',
      })
    ).status,
  ).toBe(403);
});
it('rechecks a runtime grant after upstream credential admission', async () => {
  const r = await runtimeSetup();
  const authority = h.resourceRuntime();
  const actor = {
    id: h.userId('owner'),
    personId: 'runtime-controller',
    credentialId: r.issued.id,
    fingerprint: 'verified-before-revocation',
    access: {
      kind: 'scoped' as const,
      scope: {
        organizationId: 'org-a',
        userId: h.userId('owner'),
        role: 'super_admin' as const,
        delegated: true as const,
      },
    },
  };
  h.sqlite.run('UPDATE machine_credential SET revoked_at=1 WHERE id=?', [r.issued.id]);
  expect(await authority.requests(r.authorityId, actor, 0, 50)).toEqual({
    ok: false,
    reason: 'forbidden',
  });
});

it('rolls the empty runtime migration back and forward but preserves a binding-only ledger', async () => {
  const folder = new URL('../../drizzle/20261025130000_add_resource_runtime/', import.meta.url);
  const down = await Bun.file(new URL('down.sql', folder)).text();
  const forward = await Bun.file(new URL('migration.sql', folder)).text();
  const apply = (sql: string) => {
    h.sqlite.transaction(() => {
      for (const statement of sql.split('--> statement-breakpoint').filter((each) => each.trim()))
        h.sqlite.run(statement);
    })();
  };
  apply(down);
  expect(() => h.sqlite.query('SELECT * FROM resource_authority').all()).toThrow();
  apply(forward);
  const r = await runtimeSetup();
  expect(h.sqlite.query('SELECT * FROM resource_runtime_use').all()).toHaveLength(0);
  expect(() => {
    apply(down);
  }).toThrow();
  expect(
    (await h.call('owner', 'GET', `/api/organization/resource-authorities/${r.authorityId}`)).body,
  ).toMatchObject({ authorityId: r.authorityId, acceptedSequence: 0 });
});

it('accepts authoritative retry observations without manufacturing an intermediate cleanup request', async () => {
  const r = await runtimeSetup();
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent)).status).toBe(
    200,
  );
  const kinds = [
    'cleanup_pending',
    'cleanup_pending',
    'blocked',
    'blocked',
    'retained',
    'cleanup_pending',
    'blocked',
    'release_verified',
  ];
  for (const [offset, kind] of kinds.entries()) {
    const revision = offset + 2;
    const observed = {
      ...r.runtimeEvent,
      eventId: `retry-${String(revision)}`,
      sequence: revision,
      revision,
      kind,
      ...(kind === 'retained'
        ? { retention: { ownerPersonId: 'agent-a', reviewAt: Date.now() + 60000 } }
        : {}),
      ...(kind === 'release_verified'
        ? {
            evidence: {
              digest: 'a'.repeat(64),
              locator: 'dash-resource://retry-proof',
              disposition: 'removed',
              reclaimedBytes: null,
            },
          }
        : {}),
    };
    expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, observed)).status).toBe(200);
  }
  expect((await h.call('owner', 'GET', path)).body).toMatchObject({
    uses: [{ state: 'release_verified', runtimeRevision: 9 }],
  });
});

it('delivers historical retention after its deadline without wedging ordered recovery', async () => {
  const r = await runtimeSetup();
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent)).status).toBe(
    200,
  );
  const observedAt = Date.now() - 60000;
  const reviewAt = observedAt + 1000;
  const retained = {
    ...r.runtimeEvent,
    eventId: 'delayed-retention',
    sequence: 2,
    revision: 2,
    kind: 'retained',
    observedAt,
    retention: { ownerPersonId: 'agent-a', reviewAt },
  };
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
        ...retained,
        retention: { ...retained.retention, reviewAt: observedAt },
      })
    ).status,
  ).toBe(400);
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, retained)).status).toBe(200);
  expect((await h.call('owner', 'GET', path)).body).toMatchObject({
    uses: [{ state: 'retained', retention: { reviewAt } }],
  });
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
        ...r.runtimeEvent,
        eventId: 'after-retention',
        sequence: 3,
        revision: 3,
        kind: 'cleanup_pending',
      })
    ).status,
  ).toBe(200);
});

it.each(['unbound', 'rebound'] as const)(
  'rejects a queued runtime actor after its person is %s',
  async (change) => {
    const r = await runtimeSetup();
    expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent)).status).toBe(
      200,
    );
    const actor = {
      id: h.userId('owner'),
      personId: 'runtime-controller',
      credentialId: r.issued.id,
      fingerprint: 'previously-admitted',
      access: {
        kind: 'scoped' as const,
        scope: {
          organizationId: 'org-a',
          userId: h.userId('owner'),
          role: 'super_admin' as const,
          delegated: true as const,
        },
      },
    };
    const release = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const held = h.holdWriteTurn(release.promise, () => {
      entered.resolve(undefined);
    });
    await entered.promise;
    const queued = h.resourceRuntime().ingest(
      r.authorityId,
      actor,
      resourceRuntimeEvent.assert({
        ...r.runtimeEvent,
        eventId: 'queued-after-binding-change',
        sequence: 2,
        revision: 2,
        kind: 'cleanup_pending',
      }),
      Date.now(),
    );
    const requests = h.resourceRuntime().requests(r.authorityId, actor, 0, 50);
    const admission = h.resourceRuntime().admit(
      r.authorityId,
      actor,
      resourceRuntimeAdmission.assert({
        ...admissionOf(r.runtimeEvent),
        useId: crypto.randomUUID(),
        eventId: crypto.randomUUID(),
      }),
      Date.now(),
    );
    try {
      h.sqlite.run('UPDATE person SET account_id=? WHERE id=?', [
        change === 'unbound' ? null : h.userId('viewer'),
        'runtime-controller',
      ]);
    } finally {
      release.resolve(undefined);
    }
    await held;
    expect(await queued).toEqual({ ok: false, reason: 'forbidden' });
    expect(await requests).toEqual({ ok: false, reason: 'forbidden' });
    expect(await admission).toEqual({ ok: false, reason: 'forbidden' });
    expect(
      (await h.call('owner', 'GET', `/api/organization/resource-authorities/${r.authorityId}`))
        .body,
    ).toMatchObject({ acceptedSequence: 1 });
    expect((await h.call('owner', 'GET', path)).body).toMatchObject({
      uses: [{ state: 'active', runtimeRevision: 1 }],
    });
    if (change === 'unbound')
      expect(
        (
          await callForwarded(
            h,
            r.issued.key,
            'GET',
            `/api/resource-authorities/${r.authorityId}/cleanup-requests`,
          )
        ).status,
      ).toBe(401);
  },
);

it('requires the whole original terminal evidence before acknowledging a pending request', async () => {
  const r = await runtimeSetup();
  await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent);
  await event(r.runtimeUseId, 'cleanup_requested', 1);
  const requests = (
    await callForwarded(
      h,
      r.issued.key,
      'GET',
      `/api/resource-authorities/${r.authorityId}/cleanup-requests`,
    )
  ).body as { requests: { requestId: number }[] };
  await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
    ...r.runtimeEvent,
    eventId: 'proof-pending',
    sequence: 2,
    revision: 2,
    kind: 'cleanup_pending',
  });
  const proof = {
    digest: 'a'.repeat(64),
    locator: 'dash-resource://proof/complete',
    disposition: 'removed',
    reclaimedBytes: null,
  };
  const released = {
    ...r.runtimeEvent,
    eventId: 'proof-release',
    sequence: 3,
    revision: 3,
    kind: 'release_verified',
    evidence: proof,
  };
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, released)).status).toBe(200);
  const acknowledgment = {
    ...released,
    eventId: 'proof-acknowledged',
    sequence: 4,
    revision: 4,
    requestId: requests.requests[0].requestId,
  };
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
        ...acknowledgment,
        evidence: { ...proof, disposition: 'not_created' },
      })
    ).status,
  ).toBe(409);
  expect(
    (await h.call('owner', 'GET', `/api/organization/resource-authorities/${r.authorityId}`)).body,
  ).toMatchObject({ acceptedSequence: 3 });
  expect((await h.call('owner', 'GET', path)).body).toMatchObject({
    uses: [{ state: 'release_verified', pendingCleanupRequest: true, runtimeRevision: 3 }],
  });
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, acknowledgment)).status).toBe(
    200,
  );
});

function admissionOf(event: Awaited<ReturnType<typeof runtimeSetup>>['runtimeEvent']) {
  return {
    eventId: event.eventId,
    epoch: event.epoch,
    useId: event.useId,
    incarnation: event.incarnation,
    observedAt: event.observedAt,
    reason: event.reason,
    use: event.use,
  };
}
it('durable admission survives task deletion and preserves pre-publication cleanup requests', async () => {
  const r = await runtimeSetup();
  const admission = admissionOf(r.runtimeEvent);
  const endpoint = `/api/resource-authorities/${r.authorityId}/admissions`;
  const accepted = await callForwarded(h, r.issued.key, 'PUT', endpoint, admission);
  expect(accepted.status).toBe(200);
  expect((await h.call('owner', 'GET', path)).body).toMatchObject({
    uses: [{ runtimeRevision: 0, revision: 1 }],
  });
  expect((await event(r.runtimeUseId, 'cleanup_requested', 1)).status).toBe(200);
  expect(
    (
      await callForwarded(
        h,
        r.issued.key,
        'GET',
        `/api/resource-authorities/${r.authorityId}/cleanup-requests`,
      )
    ).body,
  ).toMatchObject({ requests: [{ expectedRevision: 0 }] });
  expect((await commands([{ kind: 'deleteWorkItem', workItemId: leaf }])).status).toBe(200);
  expect(await callForwarded(h, r.issued.key, 'PUT', endpoint, admission)).toEqual(accepted);
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent)).status).toBe(
    200,
  );
  expect((await h.call('owner', 'GET', path)).body).toMatchObject({
    uses: [{ workItemName: 'Leaf', revision: 2, runtimeRevision: 1, pendingCleanupRequest: true }],
  });
  expect((await h.call('owner', 'GET', `${path}/${r.runtimeUseId}/history`)).body).toMatchObject({
    events: [
      { kind: 'registered', revision: 1 },
      { kind: 'cleanup_requested', revision: 2 },
    ],
  });
  expect(await callForwarded(h, r.issued.key, 'PUT', endpoint, admission)).toEqual(accepted);
});
it('provisional admission protects provider and resource deletion without consuming source sequence', async () => {
  const r = await runtimeSetup();
  const endpoint = `/api/resource-authorities/${r.authorityId}/admissions`;
  expect(
    (await callForwarded(h, r.issued.key, 'PUT', endpoint, admissionOf(r.runtimeEvent))).status,
  ).toBe(200);
  expect(
    (
      await h.call(
        'owner',
        'DELETE',
        `/api/organization/compute-providers/${r.binding.providerId}?cascade=true`,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await h.call('owner', 'POST', '/api/directory/commands', {
        commands: [{ kind: 'deleteResource', resourceId, cascade: true }],
      })
    ).status,
  ).toBe(409);
  expect(
    (await h.call('owner', 'GET', `/api/organization/resource-authorities/${r.authorityId}`)).body,
  ).toMatchObject({ acceptedSequence: 0 });
});
it('admission refuses foreign or missing attribution and changed replay while later valid publication advances', async () => {
  const r = await runtimeSetup();
  const endpoint = `/api/resource-authorities/${r.authorityId}/admissions`;
  const admission = admissionOf(r.runtimeEvent);
  for (const use of [
    { ...admission.use, workItemId: 'missing' },
    { ...admission.use, responsiblePersonId: 'agent-b' },
  ])
    expect(
      (await callForwarded(h, r.issued.key, 'PUT', endpoint, { ...admission, use })).status,
    ).toBe(404);
  expect((await h.call('owner', 'PUT', endpoint, admission)).status).toBe(403);
  expect((await callForwarded(h, key, 'PUT', endpoint, admission)).status).toBe(403);
  expect(
    (await callForwarded(h, r.issued.key, 'PUT', endpoint, { ...admission, epoch: 'wrong' }))
      .status,
  ).toBe(409);
  expect((await callForwarded(h, r.issued.key, 'PUT', endpoint, admission)).status).toBe(200);
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', endpoint, {
        ...admission,
        use: { ...admission.use, locator: '/changed' },
      })
    ).status,
  ).toBe(409);
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent)).status).toBe(
    200,
  );
  h.sqlite.run('UPDATE machine_credential SET revoked_at=? WHERE id=?', [Date.now(), r.issued.id]);
  expect((await callForwarded(h, r.issued.key, 'PUT', endpoint, admission)).status).toBe(401);
});

it('admission replay survives project deletion with original organization authority and immutable history', async () => {
  const r = await runtimeSetup();
  const endpoint = `/api/resource-authorities/${r.authorityId}/admissions`;
  const admission = admissionOf(r.runtimeEvent);
  const accepted = await callForwarded(h, r.issued.key, 'PUT', endpoint, admission);
  expect(accepted.status).toBe(200);
  expect((await commands([{ kind: 'deleteWorkItem', workItemId: leaf }])).status).toBe(200);
  // Project deletion has no public route in this increment; mirror the existing orphan-history fixture.
  h.sqlite.run('DELETE FROM project_access WHERE project_id=?', [projectId]);
  h.sqlite.run('DELETE FROM step WHERE project_id=?', [projectId]);
  h.sqlite.run('DELETE FROM project WHERE id=?', [projectId]);
  expect(await callForwarded(h, r.issued.key, 'PUT', endpoint, admission)).toEqual(accepted);
  expect(
    (
      await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, {
        ...r.runtimeEvent,
        use: { ...r.runtimeEvent.use, locator: '/substituted' },
      })
    ).status,
  ).toBe(409);
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, r.runtimeEvent)).status).toBe(
    200,
  );
  expect((await h.call('owner', 'GET', `${path}/${r.runtimeUseId}/history`)).body).toMatchObject({
    events: [{ kind: 'registered', revision: 1 }],
  });
  expect((await h.call('other', 'GET', path)).status).toBe(404);
});
it('resource deletion before admission refuses without sequence allocation and the next resource can publish', async () => {
  const r = await runtimeSetup();
  const endpoint = `/api/resource-authorities/${r.authorityId}/admissions`;
  expect(
    (
      await h.call('owner', 'POST', '/api/directory/commands', {
        commands: [{ kind: 'deleteResource', resourceId, cascade: true }],
      })
    ).status,
  ).toBe(200);
  expect(
    (await callForwarded(h, r.issued.key, 'PUT', endpoint, admissionOf(r.runtimeEvent))).status,
  ).toBe(404);
  const created = await h.call('owner', 'POST', '/api/directory/commands', {
    commands: [
      { kind: 'createResource', name: 'Next disk', resourceKind: 'divisible', unitLabel: 'GB' },
    ],
  });
  const nextResourceId = (created.body as { results: { id: string }[] }).results[0].id;
  const next = { ...r.runtimeEvent, use: { ...r.runtimeEvent.use, resourceId: nextResourceId } };
  expect((await callForwarded(h, r.issued.key, 'PUT', endpoint, admissionOf(next))).status).toBe(
    200,
  );
  expect((await callForwarded(h, r.issued.key, 'PUT', r.eventsPath, next)).body).toMatchObject({
    acceptedSequence: 1,
  });
});

it('admission identities cannot reserve the same authority event for two different projects', async () => {
  const r = await runtimeSetup();
  const endpoint = `/api/resource-authorities/${r.authorityId}/admissions`;
  expect(
    (await callForwarded(h, r.issued.key, 'PUT', endpoint, admissionOf(r.runtimeEvent))).status,
  ).toBe(200);
  const project = await h.call('owner', 'POST', '/api/projects', { name: 'Second project' });
  const secondProject = (project.body as { project: { id: string } }).project.id;
  const created = await h.call('owner', 'POST', `/api/projects/${secondProject}/commands`, {
    commands: [{ kind: 'createWorkItem', parentId: null, name: 'Second leaf' }],
  });
  const secondLeaf = (created.body as { results: { id: string }[] }).results[0].id;
  const duplicate = {
    ...admissionOf(r.runtimeEvent),
    useId: crypto.randomUUID(),
    use: { ...r.runtimeEvent.use, projectId: secondProject, workItemId: secondLeaf },
  };
  expect((await callForwarded(h, r.issued.key, 'PUT', endpoint, duplicate)).status).toBe(409);
  expect(
    (await h.call('owner', 'GET', `/api/projects/${secondProject}/resource-uses`)).body,
  ).toMatchObject({ uses: [] });
});
