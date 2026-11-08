import { readPreconditions } from '@wbs/core/service/compensating';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from '@wbs/store-sqlite/testing/dependency-capability';
import { afterEach, expect, test } from 'bun:test';

import {
  closeFixture,
  harness,
  openFixture,
  readIncidentRows,
  readTables,
  seedIncidents,
  setRequestAdmissionObserver,
} from './cross-project-dependency-fixture';
import { runSemanticCopy } from './semantic-copy-fixture';

afterEach(closeFixture);

function readRevision(workItemId: string) {
  const row = harness.sqlite
    .query<{ revision: number }, [string]>('SELECT revision FROM work_item WHERE id=?')
    .get(workItemId);
  if (row === null) throw new Error('copy fixture revision missing');
  return row.revision;
}
function readJournal(projectId: string) {
  const entry = harness.sqlite
    .query<{ preconditions: string }, [string]>(
      'SELECT preconditions FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
    )
    .get(projectId);
  if (entry === null) throw new Error('copy fixture journal missing');
  return readPreconditions(JSON.parse(entry.preconditions) as unknown);
}
async function seedPrerequisites() {
  const fixture = await seedIncidents();
  const boundary = harness.publicWrites();
  await boundary.uow.run(async (scope) => {
    await scope.stores.typedDependencies.add(
      {
        id: 'incoming-local',
        projectId: fixture.owner.projectId,
        predecessor: {
          scope: 'whole',
          projectId: fixture.owner.projectId,
          workItemId: fixture.localPeer,
        },
        successor: { scope: 'whole', ...fixture.owner },
        type: 'FF',
      },
      { at: 10, by: fixture.principal.id },
    );
    for (const type of ['FS', 'FF'] as const)
      await scope.stores.typedDependencies.add(
        {
          id: `incoming-${type}`,
          projectId: fixture.owner.projectId,
          predecessor: { scope: 'whole', ...fixture.predecessor },
          successor: { scope: 'whole', ...fixture.owner },
          type,
        },
        { at: 10, by: fixture.principal.id },
      );
    return { commit: true, value: undefined };
  });
  return fixture;
}

test('semantic copy retains local and remote prerequisites with exact revisions and stable compensation identities', async () => {
  const fixture = await seedPrerequisites();
  const owner = fixture.owner.projectId;
  const original = await readIncidentRows(owner);
  const beforeLocal = readRevision(fixture.localPeer);
  const beforeRemote = readRevision(fixture.predecessor.workItemId);
  const foreignBefore = readTables()
    .filter(({ name }) => ['command_journal', 'plan_event'].includes(name))
    .map(({ name, rows }) => ({ name, rows: rows.filter((row) => !row.includes(owner)) }));
  const copied = await runSemanticCopy(fixture, (service) =>
    service.duplicate(fixture.owner.workItemId, fixture.principal.id),
  );
  expect(copied.ok).toBe(true);
  if (!copied.ok) throw new Error('semantic copy refused');
  const copiedId = copied.value.id;
  const after = await readIncidentRows(owner);
  const links = after.filter((edge) => edge.successor.workItemId === copiedId);
  expect(links).toHaveLength(4);
  expect(links.map((edge) => edge.type).sort()).toEqual(['FF', 'FF', 'FS', 'SS']);
  const selected = original.filter(
    (edge) =>
      edge.successor.projectId === owner && edge.successor.workItemId === fixture.owner.workItemId,
  );
  expect(
    links
      .map(({ predecessor, successor, type }) => ({ predecessor, successor, type }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ).toEqual(
    selected
      .map(({ predecessor, successor, type }) => ({
        predecessor,
        successor: { ...successor, workItemId: copiedId },
        type,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
  expect(links.every((edge) => !original.some((source) => source.id === edge.id))).toBe(true);
  expect(after.filter((edge) => !links.some((copy) => copy.id === edge.id))).toEqual(original);
  expect(readRevision(fixture.localPeer)).toBe(beforeLocal + 1);
  expect(readRevision(fixture.predecessor.workItemId)).toBe(beforeRemote + 3);
  const preconditions = readJournal(owner);
  expect(preconditions.from).toEqual({ [fixture.localPeer]: beforeLocal });
  expect(preconditions.expected).toEqual({ [fixture.localPeer]: beforeLocal + 1, [copiedId]: 4 });
  expect(preconditions.externalRevisions).toEqual({
    from: [{ ...fixture.predecessor, revision: beforeRemote }],
    expected: [{ ...fixture.predecessor, revision: beforeRemote + 3 }],
  });
  expect(
    readTables()
      .filter(({ name }) => ['command_journal', 'plan_event'].includes(name))
      .map(({ name, rows }) => ({ name, rows: rows.filter((row) => !row.includes(owner)) })),
  ).toEqual(foreignBefore);
  const copiedAudit = harness.sqlite
    .query<{ created_at: number; created_by: string }, [string]>(
      'SELECT created_at,created_by FROM external_dependency WHERE id=?',
    )
    .get(links.find((edge) => edge.predecessor.projectId !== owner)?.id ?? 'missing');
  expect(copiedAudit?.created_at).toBeGreaterThan(10);
  expect(copiedAudit?.created_by).toBe(fixture.principal.id);
  expect(
    (
      await runSemanticCopy(fixture, (service) =>
        service.undoWithin(
          { projectId: owner, userId: fixture.principal.id, personId: null },
          fixture.expectedAccess,
        ),
      )
    ).ok,
  ).toBe(true);
  expect(await readIncidentRows(owner)).toEqual(original);
  expect(
    (
      await runSemanticCopy(fixture, (service) =>
        service.redoWithin(
          { projectId: owner, userId: fixture.principal.id, personId: null },
          fixture.expectedAccess,
        ),
      )
    ).ok,
  ).toBe(true);
  expect(
    (await readIncidentRows(owner)).filter((edge) => edge.successor.workItemId === copiedId),
  ).toEqual(links);
});

test('incapable mounted copy refuses enabled external authority and changes nothing', async () => {
  const fixture = await seedIncidents({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
  });
  const before = readTables();
  const copied = await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
    commands: [{ kind: 'duplicateWorkItem', workItemId: fixture.owner.workItemId }],
  });
  expect(copied.status).toBe(500);
  expect(readTables()).toEqual(before);
});

test('copying only a predecessor never changes foreign rows relationships audit history or events', async () => {
  const fixture = await seedIncidents();
  const boundary = harness.publicWrites();
  await boundary.uow.run(async (scope) => {
    for (const edge of await scope.stores.typedDependencies.listByProject(fixture.owner.projectId))
      if (edge.successor.workItemId === fixture.owner.workItemId)
        await scope.stores.typedDependencies.remove(edge.id, { at: 20, by: fixture.principal.id });
    return { commit: true, value: undefined };
  });
  const original = await readIncidentRows(fixture.owner.projectId);
  const foreignBefore = readTables()
    .filter(({ name }) => !['event_log', 'event_sequencer'].includes(name))
    .map(({ name, rows }) => ({
      name,
      rows: rows.filter(
        (row) =>
          row.includes(fixture.successor.projectId) ||
          row.includes(fixture.secondSuccessor.projectId),
      ),
    }));
  const copied = await fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
    commands: [{ kind: 'duplicateWorkItem', workItemId: fixture.owner.workItemId }],
  });
  expect(copied.status).toBe(200);
  expect(await readIncidentRows(fixture.owner.projectId)).toEqual(original);
  expect(
    readTables()
      .filter(({ name }) => !['event_log', 'event_sequencer'].includes(name))
      .map(({ name, rows }) => ({
        name,
        rows: rows.filter(
          (row) =>
            row.includes(fixture.successor.projectId) ||
            row.includes(fixture.secondSuccessor.projectId),
        ),
      })),
  ).toEqual(foreignBefore);
});

for (const phase of ['after copy', 'after undo'] as const)
  test(`semantic copy replay refuses a changed remote predecessor ${phase}`, async () => {
    const fixture = await seedIncidents();
    const owner = fixture.owner.projectId;
    const copied = await runSemanticCopy(fixture, (service) =>
      service.duplicate(fixture.owner.workItemId, fixture.principal.id),
    );
    expect(copied.ok).toBe(true);
    if (phase === 'after undo')
      expect(
        (
          await runSemanticCopy(fixture, (service) =>
            service.undoWithin(
              { projectId: owner, userId: fixture.principal.id, personId: null },
              fixture.expectedAccess,
            ),
          )
        ).ok,
      ).toBe(true);
    expect(
      (
        await fixture.request(`/api/projects/${fixture.predecessor.projectId}/commands`, {
          commands: [
            {
              kind: 'patchWorkItem',
              workItemId: fixture.predecessor.workItemId,
              patch: { notes: 'concurrent edit' },
            },
          ],
        })
      ).status,
    ).toBe(200);
    const before = readTables();
    const replayed = await runSemanticCopy(fixture, (service) =>
      phase === 'after copy'
        ? service.undoWithin(
            { projectId: owner, userId: fixture.principal.id, personId: null },
            fixture.expectedAccess,
          )
        : service.redoWithin(
            { projectId: owner, userId: fixture.principal.id, personId: null },
            fixture.expectedAccess,
          ),
    );
    expect(replayed.ok).toBe(false);
    expect(readTables()).toEqual(before);
  });

for (const fault of [
  'absent row',
  'foreign project',
  'unreadable row',
  'wrong step',
  'parent node',
  'failed graph',
] as const)
  test(`semantic copy refuses ${fault} evidence atomically`, async () => {
    const fixture = await seedIncidents();
    const before = readTables();
    const copied = runSemanticCopy(
      fixture,
      (service) => service.duplicate(fixture.owner.workItemId, fixture.principal.id),
      (stores) => ({
        ...stores,
        projects: new Proxy(stores.projects, {
          get(source, key) {
            if (key === 'stepsOf' && fault === 'wrong step')
              return async (projectId: string) =>
                (await source.stepsOf(projectId)).map((step) =>
                  projectId === fixture.predecessor.projectId
                    ? { ...step, projectId: fixture.owner.projectId }
                    : step,
                );
            return Reflect.get(source, key, source) as unknown;
          },
        }),
        workItems: new Proxy(stores.workItems, {
          get(source, key) {
            if (key === 'findById')
              return async (workItemId: string) => {
                if (workItemId !== fixture.predecessor.workItemId)
                  return source.findById(workItemId);
                if (fault === 'absent row') return null;
                if (fault === 'unreadable row')
                  throw new Error('injected unreadable copy endpoint');
                const row = await source.findById(workItemId);
                return row !== null && fault === 'foreign project'
                  ? { ...row, projectId: fixture.successor.projectId }
                  : row;
              };
            if (key === 'listByProject' && fault === 'parent node')
              return async (projectId: string) => {
                const rows = await source.listByProject(projectId);
                const first = rows.at(0);
                return projectId === fixture.predecessor.projectId && first !== undefined
                  ? [
                      ...rows,
                      { ...first, id: 'injected-child', parentId: fixture.predecessor.workItemId },
                    ]
                  : rows;
              };
            return Reflect.get(source, key, source) as unknown;
          },
        }),
        typedDependencies: new Proxy(stores.typedDependencies, {
          get(source, key) {
            if (key === 'listIncident' && fault === 'failed graph')
              return () => Promise.reject(new Error('injected unreadable copy graph'));
            return Reflect.get(source, key, source) as unknown;
          },
        }),
      }),
    );
    if (fault === 'unreadable row' || fault === 'failed graph')
      expect(await copied.catch((cause: unknown) => cause)).toBeInstanceOf(Error);
    else
      expect(await copied).toMatchObject({
        ok: false,
        reason: fault === 'parent node' ? 'rolled_up' : 'not_found',
      });
    expect(readTables()).toEqual(before);
  });

for (const fault of ['second insert', 'journal'] as const)
  test(`semantic copy rolls back every table after ${fault} failure`, async () => {
    const fixture = await seedPrerequisites();
    const before = readTables();
    let inserts = 0;
    const pending = runSemanticCopy(
      fixture,
      (service) => service.duplicate(fixture.owner.workItemId, fixture.principal.id),
      (stores) => ({
        ...stores,
        typedDependencies: new Proxy(stores.typedDependencies, {
          get(source, key) {
            if (key === 'add' && fault === 'second insert')
              return async (...args: Parameters<typeof source.add>) => {
                if (++inserts === 2) throw new Error('injected copy persistence failure');
                return source.add(...args);
              };
            return Reflect.get(source, key, source) as unknown;
          },
        }),
        journal: new Proxy(stores.journal, {
          get(source, key) {
            if (key === 'append' && fault === 'journal')
              return () => Promise.reject(new Error('injected copy persistence failure'));
            return Reflect.get(source, key, source) as unknown;
          },
        }),
      }),
    );
    expect(await pending.catch((cause: unknown) => cause)).toMatchObject({
      message: 'injected copy persistence failure',
    });
    expect(readTables()).toEqual(before);
  });

test('semantic batch rolls back the earlier copy when a later typed edge closes a resolved cycle', async () => {
  const fixture = await seedIncidents();
  const before = readTables();
  const copied = await runSemanticCopy(fixture, async (service) => {
    const duplicate = await service.duplicate(fixture.owner.workItemId, fixture.principal.id);
    if (!duplicate.ok) return duplicate;
    const edge = await service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
      predecessor: {
        scope: 'whole',
        projectId: fixture.owner.projectId,
        workItemId: duplicate.value.id,
      },
      successor: { scope: 'whole', ...fixture.owner },
      type: 'FS',
    });
    if (!edge.ok) return edge;
    return service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
      predecessor: { scope: 'whole', ...fixture.owner },
      successor: {
        scope: 'whole',
        projectId: fixture.owner.projectId,
        workItemId: duplicate.value.id,
      },
      type: 'FS',
    });
  });
  expect(copied).toMatchObject({ ok: false, reason: 'cycle' });
  expect(readTables()).toEqual(before);
});

test('semantic retained batch refreshes local prerequisite revisions and copied link reads without remote owner rows', async () => {
  const fixture = await seedPrerequisites();
  const beforeLocal = readRevision(fixture.localPeer);
  await runSemanticCopy(fixture, async (service) => {
    const copied = await service.duplicate(fixture.owner.workItemId, fixture.principal.id);
    expect(copied.ok).toBe(true);
    if (!copied.ok) return copied;
    const patched = await service.patch(fixture.localPeer, fixture.principal.id, {
      notes: 'later retained edit',
    });
    expect(patched.ok).toBe(true);
    return patched;
  });
  const preconditions = readJournal(fixture.owner.projectId);
  expect(preconditions.from).toEqual({ [fixture.localPeer]: beforeLocal });
  expect(preconditions.expected[fixture.localPeer]).toBe(beforeLocal + 2);
  expect(Object.keys(preconditions.expected)).not.toContain(fixture.predecessor.workItemId);
});

test('semantic copy reads a restricted predecessor while predecessor editing remains forbidden', async () => {
  const fixture = await seedIncidents();
  await harness.register('grace');
  harness.member('org-a', 'grace', 'member');
  harness.sqlite
    .query('UPDATE organization_membership SET role=? WHERE organization_id=? AND user_id=?')
    .run('member', 'org-a', fixture.principal.id);
  harness.sqlite
    .query('UPDATE project SET owner_id=?,restricted=1 WHERE id=?')
    .run(harness.userId('grace'), fixture.predecessor.projectId);
  expect(
    (
      await fixture.request(`/api/projects/${fixture.predecessor.projectId}/commands`, {
        commands: [
          {
            kind: 'patchWorkItem',
            workItemId: fixture.predecessor.workItemId,
            patch: { notes: 'forbidden edit' },
          },
        ],
      })
    ).status,
  ).toBe(403);
  expect(
    await runSemanticCopy(fixture, (service) =>
      service.duplicate(fixture.owner.workItemId, fixture.principal.id),
    ),
  ).toMatchObject({ ok: true });
});

test('mounted copy rechecks membership after queued request resolution', async () => {
  const fixture = await seedIncidents();
  let entered: () => void = () => {
    throw new Error('write turn callback missing');
  };
  let release: () => void = () => {
    throw new Error('write turn release missing');
  };
  let resolved: () => void = () => {
    throw new Error('admission callback missing');
  };
  const heldTurn = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const requestResolved = new Promise<void>((resolve) => {
    resolved = resolve;
  });
  const held = harness.holdWriteTurn(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
    () => {
      entered();
    },
  );
  await heldTurn;
  setRequestAdmissionObserver(() => {
    resolved();
  });
  const pending = fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, {
    commands: [{ kind: 'duplicateWorkItem', workItemId: fixture.owner.workItemId }],
  });
  try {
    await requestResolved;
    harness.sqlite
      .query('DELETE FROM organization_membership WHERE organization_id=? AND user_id=?')
      .run('org-a', fixture.principal.id);
    const before = readTables();
    release();
    await held;
    const copied = await pending;
    expect(copied.status).toBe(403);
    expect(await copied.json()).toMatchObject({ error: 'not_a_member' });
    expect(readTables()).toEqual(before);
  } finally {
    release();
    await held;
    setRequestAdmissionObserver(undefined);
  }
});

for (const delivery of ['missing project', 'foreign step'] as const)
  test(`semantic redo revalidates ${delivery} before restoring copied rows`, async () => {
    const fixture = await seedIncidents();
    const owner = fixture.owner.projectId;
    expect(
      (
        await runSemanticCopy(fixture, (service) =>
          service.duplicate(fixture.owner.workItemId, fixture.principal.id),
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await runSemanticCopy(fixture, (service) =>
          service.undoWithin(
            { projectId: owner, userId: fixture.principal.id, personId: null },
            fixture.expectedAccess,
          ),
        )
      ).ok,
    ).toBe(true);
    const before = readTables();
    const replayed = await runSemanticCopy(
      fixture,
      (service) =>
        service.redoWithin(
          { projectId: owner, userId: fixture.principal.id, personId: null },
          fixture.expectedAccess,
        ),
      (stores) => ({
        ...stores,
        projects: new Proxy(stores.projects, {
          get(source, key) {
            if (key === 'findInOrganization' && delivery === 'missing project')
              return (projectId: string, organizationId: string) =>
                projectId === fixture.predecessor.projectId
                  ? Promise.resolve(null)
                  : source.findInOrganization(projectId, organizationId);
            if (key === 'stepsOf' && delivery === 'foreign step')
              return async (projectId: string) =>
                (await source.stepsOf(projectId)).map((step) =>
                  projectId === fixture.predecessor.projectId
                    ? { ...step, projectId: owner }
                    : step,
                );
            return Reflect.get(source, key, source) as unknown;
          },
        }),
      }),
    );
    expect(replayed).toMatchObject({ ok: false, reason: 'not_found' });
    expect(readTables()).toEqual(before);
  });

test('semantic replay refuses absent external before metadata without restoring any copied row', async () => {
  const fixture = await seedIncidents();
  const owner = fixture.owner.projectId;
  expect(
    (
      await runSemanticCopy(fixture, (service) =>
        service.duplicate(fixture.owner.workItemId, fixture.principal.id),
      )
    ).ok,
  ).toBe(true);
  expect(
    (
      await runSemanticCopy(fixture, (service) =>
        service.undoWithin(
          { projectId: owner, userId: fixture.principal.id, personId: null },
          fixture.expectedAccess,
        ),
      )
    ).ok,
  ).toBe(true);
  const preconditions = readJournal(owner);
  if (preconditions.externalRevisions === undefined)
    throw new Error('fixture external metadata missing');
  preconditions.externalRevisions = { ...preconditions.externalRevisions, from: [] };
  harness.sqlite
    .query('UPDATE command_journal SET preconditions=? WHERE project_id=? AND kind=?')
    .run(JSON.stringify(preconditions), owner, 'duplicate');
  const before = readTables();
  const failure = await runSemanticCopy(fixture, (service) =>
    service.redoWithin(
      { projectId: owner, userId: fixture.principal.id, personId: null },
      fixture.expectedAccess,
    ),
  ).catch((cause: unknown) => cause);
  expect(failure).toMatchObject({ message: 'journal external revision coverage is not exact' });
  expect(readTables()).toEqual(before);
});

for (const fault of ['wrong owner', 'descendant leaf'] as const)
  test(`semantic copy refuses corrupt selected ${fault} source delivery`, async () => {
    const fixture = await seedIncidents();
    const before = readTables();
    const copied = runSemanticCopy(
      fixture,
      (service) => service.duplicate(fixture.owner.workItemId, fixture.principal.id),
      (stores) => ({
        ...stores,
        typedDependencies: new Proxy(stores.typedDependencies, {
          get(source, key) {
            if (key === 'listByProject')
              return async (projectId: string) =>
                (await source.listByProject(projectId)).map((edge) =>
                  edge.id !== 'incoming'
                    ? edge
                    : fault === 'wrong owner'
                      ? { ...edge, projectId: fixture.predecessor.projectId }
                      : {
                          ...edge,
                          predecessor: {
                            ...edge.predecessor,
                            scope: 'descendant-step' as const,
                            stepId:
                              edge.predecessor.scope === 'whole'
                                ? 'missing'
                                : edge.predecessor.stepId,
                          },
                        },
                );
            return Reflect.get(source, key, source) as unknown;
          },
        }),
      }),
    );
    if (fault === 'wrong owner')
      expect(await copied.catch((cause: unknown) => cause)).toMatchObject({
        message: 'copied relationship owner differs from its successor',
      });
    else expect(await copied).toMatchObject({ ok: false, reason: 'not_a_parent' });
    expect(readTables()).toEqual(before);
  });

for (const sameStep of [false, true])
  test(`semantic copy ${sameStep ? 'refuses true self-node expansion' : 'retains ordered nodes on one work item'}`, async () => {
    const fixture = await openFixture();
    const steps = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id=? ORDER BY position')
      .all(fixture.owner.projectId);
    const first = steps.at(0);
    const second = steps.at(1);
    if (first === undefined || second === undefined)
      throw new Error('fixture workflow steps missing');
    await harness.publicWrites().uow.run(async (scope) => {
      await scope.stores.typedDependencies.add(
        {
          id: 'same-task',
          projectId: fixture.owner.projectId,
          predecessor: { ...fixture.owner, scope: 'node', stepId: first.id },
          successor: { ...fixture.owner, scope: 'node', stepId: sameStep ? first.id : second.id },
          type: 'FS',
        },
        { at: 10, by: fixture.principal.id },
      );
      return { commit: true, value: undefined };
    });
    const before = readTables();
    const copied = await runSemanticCopy(fixture, (service) =>
      service.duplicate(fixture.owner.workItemId, fixture.principal.id),
    );
    if (sameStep) {
      expect(copied).toMatchObject({ ok: false, reason: 'self_node' });
      expect(readTables()).toEqual(before);
    } else {
      expect(copied.ok).toBe(true);
      if (!copied.ok) throw new Error('ordered nodes copy refused');
      const links = (await readIncidentRows(fixture.owner.projectId)).filter(
        (edge) => edge.id !== 'same-task',
      );
      expect(links).toHaveLength(1);
      expect(
        links.map(({ projectId, predecessor, successor, type }) => ({
          projectId,
          predecessor,
          successor,
          type,
        })),
      ).toEqual([
        {
          projectId: fixture.owner.projectId,
          predecessor: {
            scope: 'node',
            projectId: fixture.owner.projectId,
            workItemId: copied.value.id,
            stepId: first.id,
          },
          successor: {
            scope: 'node',
            projectId: fixture.owner.projectId,
            workItemId: copied.value.id,
            stepId: second.id,
          },
          type: 'FS',
        },
      ]);
    }
  });

test('copy undo refuses a local retained prerequisite edited by another actor through the real command runner', async () => {
  const fixture = await seedPrerequisites();
  const owner = fixture.owner.projectId;
  expect(
    (
      await runSemanticCopy(fixture, (service) =>
        service.duplicate(fixture.owner.workItemId, fixture.principal.id),
      )
    ).ok,
  ).toBe(true);
  await harness.register('grace');
  harness.member('org-a', 'grace', 'super_admin');
  const bound = await harness.request('/api/organization/active', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      authorization: `Bearer ${harness.token('grace')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ organizationId: 'org-a' }),
  });
  expect(bound.status).toBe(200);
  const cookie = bound.headers.get('set-cookie')?.split(';')[0];
  if (cookie === undefined) throw new Error('second actor binding missing');
  const patched = await harness.request(`/api/projects/${owner}/commands`, {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      authorization: `Bearer ${harness.token('grace')}`,
      cookie,
      'X-WBS-Expected-Organization': 'org-a',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      commands: [
        {
          kind: 'patchWorkItem',
          workItemId: fixture.localPeer,
          patch: { notes: 'other actor edit' },
        },
      ],
    }),
  });
  expect(patched.status).toBe(200);
  const before = readTables();
  expect(
    await runSemanticCopy(fixture, (service) =>
      service.undoWithin(
        { projectId: owner, userId: fixture.principal.id, personId: null },
        fixture.expectedAccess,
      ),
    ),
  ).toMatchObject({ ok: false, reason: 'stale_undo' });
  expect(readTables()).toEqual(before);
});
