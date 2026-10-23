import { createHash } from 'node:crypto';

import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { WriteCoordinator } from '@wbs/store-sqlite/gate';
import { ProjectRepository } from '@wbs/store-sqlite/project';
import { WorkItemRepository } from '@wbs/store-sqlite/work-item';
import { afterEach, expect, spyOn, test } from 'bun:test';
import { decodeJwt } from 'jose';

import { openDatabase } from '../repository/db';
import {
  closeFixture,
  harness,
  openFixture,
  readTables,
  setRequestAdmissionObserver,
} from './cross-project-dependency-fixture';

afterEach(closeFixture);

type Fixture = Awaited<ReturnType<typeof openFixture>>;

function sendBatch(fixture: Fixture, commands: readonly unknown[]) {
  return fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, { commands });
}

function patchFirst(fixture: Fixture) {
  return {
    kind: 'patchWorkItem',
    workItemId: fixture.owner.workItemId,
    patch: { name: 'Must roll back' },
  };
}

async function addLink(fixture: Fixture) {
  expect(
    (await sendBatch(fixture, [{ kind: 'addTypedDependency', ...fixture.input }])).status,
  ).toBe(200);
  const link = harness.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM external_dependency WHERE successor_project_id=?',
    )
    .get(fixture.owner.projectId);
  if (link === null) throw new Error('fixture external relationship missing');
  return link.id;
}

async function createForeignEndpoint() {
  await harness.register('grace');
  harness.organization('org-b');
  harness.member('org-b', 'grace', 'super_admin');
  const selected = await harness.request('/api/organization/active', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      authorization: `Bearer ${harness.token('grace')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ organizationId: 'org-b' }),
  });
  expect(selected.status).toBe(200);
  const cookie = selected.headers.get('set-cookie')?.split(';')[0];
  if (cookie === undefined) throw new Error('foreign fixture cookie missing');
  const request = (path: string, body: unknown) =>
    harness.request(path, {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        authorization: `Bearer ${harness.token('grace')}`,
        cookie,
        'X-WBS-Expected-Organization': 'org-b',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  expect((await request('/api/projects', { name: 'Foreign' })).status).toBe(200);
  const project = harness.sqlite
    .query<{ id: string }, []>("SELECT id FROM project WHERE name='Foreign'")
    .get();
  if (project === null) throw new Error('foreign fixture project missing');
  expect(
    (
      await request(`/api/projects/${project.id}/commands`, {
        commands: [{ kind: 'createWorkItem', name: 'Foreign row' }],
      })
    ).status,
  ).toBe(200);
  const row = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE project_id=?')
    .get(project.id);
  if (row === null) throw new Error('foreign fixture row missing');
  return { projectId: project.id, workItemId: row.id };
}

// Proof: requiring remote edit authority changed this mounted add from 200 to 403 (2026-10-23).
test('active mounted restricted readable predecessor needs no edit permission', async () => {
  const pushes: string[] = [];
  const fixture = await openFixture({ syntheticExternalCommands: true, pushes });
  await harness.register('owner');
  harness.member('org-a', 'owner', 'member');
  harness.sqlite.run('UPDATE project SET owner_id=?, restricted=1 WHERE id=?', [
    harness.userId('owner'),
    fixture.predecessor.projectId,
  ]);
  harness.sqlite.run(
    "UPDATE organization_membership SET role='member' WHERE organization_id='org-a' AND user_id=?",
    [harness.userId('ada')],
  );
  const before = readTables();
  const denied = await fixture.request(`/api/projects/${fixture.predecessor.projectId}/commands`, {
    commands: [
      {
        kind: 'patchWorkItem',
        workItemId: fixture.predecessor.workItemId,
        patch: { name: 'Denied' },
      },
    ],
  });
  expect(denied.status).toBe(403);
  expect(await denied.json()).toMatchObject({ error: 'forbidden' });
  expect(readTables()).toEqual(before);
  const predecessorBefore = harness.sqlite
    .query<{ name: string; notes: string | null; priority: number }, [string]>(
      'SELECT name, notes, priority FROM work_item WHERE id=?',
    )
    .get(fixture.predecessor.workItemId);
  if (predecessorBefore === null) throw new Error('fixture predecessor missing');
  const sent = pushes.length;
  await addLink(fixture);
  expect(
    harness.sqlite
      .query<{ name: string; notes: string | null; priority: number }, [string]>(
        'SELECT name, notes, priority FROM work_item WHERE id=?',
      )
      .get(fixture.predecessor.workItemId),
  ).toEqual(predecessorBefore);
  expect(pushes.length).toBeGreaterThan(sent);
  expect(harness.sqlite.query('SELECT * FROM organization_audit').all()).toEqual([]);
});

// Proof: independently bypassing scoped project lookup, row project equality,
// step identity, absent-project and absent-row handling changed selected 404s
// to graph/tree or null-dereference errors before storage (2026-10-23).
for (const fault of [
  'foreign-project',
  'absent-project',
  'foreign-row',
  'absent-row',
  'foreign-step',
  'absent-step',
] as const)
  test(`active mounted ${fault} conceals facts and rolls back every table and publication`, async () => {
    const pushes: string[] = [];
    const fixture = await openFixture({ syntheticExternalCommands: true, pushes });
    const foreign = await createForeignEndpoint();
    const foreignStep = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id=? LIMIT 1')
      .get(foreign.projectId);
    if (foreignStep === null) throw new Error('foreign fixture step missing');
    const predecessor =
      fault === 'foreign-project'
        ? { ...foreign, scope: 'whole' }
        : fault === 'absent-project'
          ? { ...fixture.input.predecessor, projectId: 'absent-project' }
          : fault === 'foreign-row'
            ? { ...fixture.input.predecessor, workItemId: foreign.workItemId }
            : fault === 'absent-row'
              ? { ...fixture.input.predecessor, workItemId: 'absent-row' }
              : {
                  ...fixture.input.predecessor,
                  scope: 'node',
                  stepId: fault === 'foreign-step' ? foreignStep.id : 'absent-step',
                };
    const before = readTables();
    const sent = [...pushes];
    const response = await sendBatch(fixture, [
      patchFirst(fixture),
      { kind: 'addTypedDependency', ...fixture.input, predecessor },
    ]);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: 'not_found',
      at: 1,
      kind: 'addTypedDependency',
    });
    expect(readTables()).toEqual(before);
    expect(pushes).toEqual(sent);
  });

// Proof: bypassing each successor-owner entry guard independently reached the protected
// row tripwire and answered 500 instead of concealed 404 (2026-10-23).
for (const operation of ['add', 'update'] as const)
  test(`active mounted second successor owner ${operation} refuses before reading its row`, async () => {
    const pushes: string[] = [];
    const fixture = await openFixture({ syntheticExternalCommands: true, pushes });
    const dependencyId = operation === 'update' ? await addLink(fixture) : undefined;
    const before = readTables();
    const sent = [...pushes];
    const findDescriptor = Object.getOwnPropertyDescriptor(
      WorkItemRepository.prototype,
      'findById',
    );
    if (findDescriptor === undefined) throw new Error('fixture production method missing');
    const find = findDescriptor.value as WorkItemRepository['findById'];
    const tripwire = spyOn(WorkItemRepository.prototype, 'findById').mockImplementation(function (
      this: WorkItemRepository,
      id: string,
    ) {
      if (id === fixture.secondSuccessor.workItemId)
        throw new Error('protected second successor row was read');
      return find.call(this, id);
    });
    try {
      const kind = operation === 'add' ? 'addTypedDependency' : 'updateTypedDependency';
      const response = await sendBatch(fixture, [
        patchFirst(fixture),
        {
          kind,
          ...fixture.input,
          ...(dependencyId === undefined ? {} : { dependencyId }),
          successor: { ...fixture.secondSuccessor, scope: 'whole' },
        },
      ]);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not_found', at: 1, kind });
      expect(readTables()).toEqual(before);
      expect(pushes).toEqual(sent);
    } finally {
      tripwire.mockRestore();
    }
  });

// Proof: independently omitting old update/remove evidence changed modeled 404
// into the graph reader's unreadable-project throw, before SQL writes (2026-10-23).
for (const operation of ['update', 'remove'] as const)
  test(`active mounted ${operation} rechecks old external predecessor evidence`, async () => {
    const pushes: string[] = [];
    const fixture = await openFixture({ syntheticExternalCommands: true, pushes });
    expect(
      (await sendBatch(fixture, [{ kind: 'createWorkItem', name: 'Local predecessor' }])).status,
    ).toBe(200);
    const local = harness.sqlite
      .query<{ id: string }, []>("SELECT id FROM work_item WHERE name='Local predecessor'")
      .get();
    if (local === null) throw new Error('fixture local predecessor missing');
    const dependencyId = await addLink(fixture);
    const before = readTables();
    const sent = [...pushes];
    // Immutable project ownership prevents moving a live external root between
    // organizations. Deny only the old predecessor's scoped read delivery.
    let checkingEvidence = false;
    const updateDescriptor = Object.getOwnPropertyDescriptor(
      WorkItemService.prototype,
      'updateTypedDependency',
    );
    const removeDescriptor = Object.getOwnPropertyDescriptor(
      WorkItemService.prototype,
      'removeTypedDependency',
    );
    if (updateDescriptor === undefined || removeDescriptor === undefined)
      throw new Error('fixture production method missing');
    const update = updateDescriptor.value as WorkItemService['updateTypedDependency'];
    const remove = removeDescriptor.value as WorkItemService['removeTypedDependency'];
    const updateSpy = spyOn(WorkItemService.prototype, 'updateTypedDependency').mockImplementation(
      function (this: WorkItemService, ...args: Parameters<typeof update>) {
        checkingEvidence = true;
        return update.apply(this, args);
      },
    );
    const removeSpy = spyOn(WorkItemService.prototype, 'removeTypedDependency').mockImplementation(
      function (this: WorkItemService, ...args: Parameters<typeof remove>) {
        checkingEvidence = true;
        return remove.apply(this, args);
      },
    );
    const findDescriptor = Object.getOwnPropertyDescriptor(
      ProjectRepository.prototype,
      'findInOrganization',
    );
    if (findDescriptor === undefined) throw new Error('fixture production method missing');
    const find = findDescriptor.value as ProjectRepository['findInOrganization'];
    const denial = spyOn(ProjectRepository.prototype, 'findInOrganization').mockImplementation(
      function (this: ProjectRepository, id: string, organizationId: string) {
        return checkingEvidence && id === fixture.predecessor.projectId
          ? Promise.resolve(null)
          : find.call(this, id, organizationId);
      },
    );
    try {
      const kind = operation === 'update' ? 'updateTypedDependency' : 'removeTypedDependency';
      const response = await sendBatch(fixture, [
        patchFirst(fixture),
        operation === 'remove'
          ? { kind, dependencyId }
          : {
              kind,
              dependencyId,
              ...fixture.input,
              predecessor: { ...fixture.owner, workItemId: local.id, scope: 'whole' },
            },
      ]);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not_found', at: 1, kind });
      expect(readTables()).toEqual(before);
      expect(pushes).toEqual(sent);
    } finally {
      denial.mockRestore();
      updateSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });

// Proof: replacing writer-time resolution with captured request access admitted the
// revoked credential (200) and changed membership refusal; both tests failed (2026-10-23).
for (const fault of ['membership', 'revocation'] as const)
  test(`active mounted lookup then queued external write revalidates ${fault}`, async () => {
    const pushes: string[] = [];
    const fixture = await openFixture({ syntheticExternalCommands: true, pushes });
    const cookieToken = harness.token('ada');
    const cookie = fixture.principal.organizationBinding?.cookie;
    if (cookie == null) throw new Error('fixture selection cookie missing');
    const lookupHeaders = {
      cookie: `__Host-wbs_organization=${encodeURIComponent(cookie)}`,
      authorization: `Bearer ${cookieToken}`,
      'X-WBS-Expected-Organization': 'org-a',
    };
    // Read-only lookup uses the authenticated binding captured by the fixture.
    const candidates = await harness.request(
      `/api/projects/${fixture.predecessor.projectId}/address-candidates`,
      { headers: lookupHeaders },
    );
    expect(candidates.status).toBe(200);
    const page = (await candidates.json()) as { addressRevision: string };
    const abbreviation = harness.sqlite
      .query<{ abbreviation: string }, [string]>(
        'SELECT abbreviation FROM project_abbreviation WHERE project_id=?',
      )
      .get(fixture.predecessor.projectId);
    if (abbreviation === null) throw new Error('fixture abbreviation missing');
    const lookup = await harness.request(
      `/api/projects/${fixture.predecessor.projectId}/address-references?reference=${abbreviation.abbreviation}.010&revision=${page.addressRevision}`,
      { headers: lookupHeaders },
    );
    expect(lookup.status).toBe(200);
    expect(await lookup.json()).toMatchObject({
      projectId: fixture.predecessor.projectId,
      endpoint: { workItemId: fixture.predecessor.workItemId },
    });
    let release = (): void => {
      throw new Error('writer not held');
    };
    let entered = (): void => {
      throw new Error('writer entry not observed');
    };
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = harness.holdWriteTurn(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
      entered,
    );
    await ready;
    let markResolved = (): void => {
      throw new Error('request not resolved');
    };
    const resolved = new Promise<void>((resolve) => {
      markResolved = resolve;
    });
    let markQueued = (): void => {
      throw new Error('request not queued');
    };
    const queued = new Promise<void>((resolve) => {
      markQueued = resolve;
    });
    const enterDescriptor = Object.getOwnPropertyDescriptor(WriteCoordinator.prototype, 'enter');
    if (enterDescriptor === undefined) throw new Error('fixture production method missing');
    const enter = enterDescriptor.value as WriteCoordinator['enter'];
    const queue = spyOn(WriteCoordinator.prototype, 'enter').mockImplementation(function <T>(
      this: WriteCoordinator,
      work: () => Promise<T>,
    ): Promise<T> {
      const pending = enter.call(this, work) as Promise<T>;
      markQueued();
      return pending;
    });
    setRequestAdmissionObserver(markResolved);
    const pending = sendBatch(fixture, [
      patchFirst(fixture),
      { kind: 'addTypedDependency', ...fixture.input },
    ]);
    const separate = openDatabase(harness.databasePath());
    try {
      await resolved;
      await queued;
      queue.mockRestore();
      setRequestAdmissionObserver(undefined);
      if (fault === 'membership')
        separate.run(
          "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id=?",
          [harness.userId('ada')],
        );
      else {
        const claims = decodeJwt(cookieToken);
        separate.run(
          'INSERT INTO browser_credential_revocations (kind,user_id,credential_digest,expires_at,revoked_at) VALUES (?,?,?,?,?)',
          [
            'native',
            harness.userId('ada'),
            createHash('sha256').update(cookieToken).digest('hex'),
            Number(claims.exp) * 1000,
            Date.now(),
          ],
        );
      }
      const before = readTables();
      const sent = [...pushes];
      release();
      await held;
      const response = await pending;
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: fault === 'membership' ? 'not_a_member' : 'no_active_organization',
      });
      expect(readTables()).toEqual(before);
      expect(pushes).toEqual(sent);
    } finally {
      queue.mockRestore();
      setRequestAdmissionObserver(undefined);
      release();
      await held;
      separate.close();
    }
  }, 15_000);
