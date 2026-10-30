import { createHash } from 'node:crypto';

import type { StoredTypedDependency } from '@wbs/core';
import { readCommand, readPayload, readPreconditions } from '@wbs/core/service/compensating';
import { ConnectedDependencyGraphReader } from '@wbs/core/service/connected-dependency-graph';
import { DependencyGraphGuard } from '@wbs/core/service/dependency-graph';
import { formatStepNodeId } from '@wbs/domain';
import { afterEach, expect, test } from 'bun:test';
import { decodeJwt } from 'jose';

import {
  closeFixture,
  harness,
  openFixture,
  readIncidentRows,
  readTables,
  runSemantic,
  seedIncidents,
  setRequestAdmissionObserver,
} from './cross-project-dependency-fixture';
afterEach(closeFixture);
test('actual first child hands an outgoing node to its child and undo redo preserves the remote row', async () => {
  const fixture = await openFixture();
  const boundary = harness.publicWrites();
  const step = harness.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
    )
    .get(fixture.owner.projectId);
  if (step === null) throw new Error('fixture owner step missing');
  const outgoing: StoredTypedDependency = {
    id: 'outgoing',
    projectId: fixture.successor.projectId,
    predecessor: { ...fixture.owner, scope: 'node', stepId: step.id },
    successor: { ...fixture.successor, scope: 'whole' },
    type: 'FS',
  };
  await boundary.uow.run(async (scope) => {
    await scope.stores.typedDependencies.add(outgoing, { at: 10, by: fixture.principal.id });
    return { commit: true, value: undefined };
  });
  const created = await runSemantic(fixture, (service) =>
    service.create(fixture.owner.projectId, fixture.principal.id, {
      parentId: fixture.owner.workItemId,
      afterId: null,
      name: 'First child',
    }),
  );
  expect(created.ok).toBe(true);
  const child = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE parent_id=?')
    .get(fixture.owner.workItemId);
  if (child === null) throw new Error('fixture child missing');
  expect(
    harness.sqlite
      .query('SELECT work_item_id FROM plan_event WHERE project_id=? ORDER BY rowid DESC LIMIT 1')
      .get(fixture.owner.projectId),
  ).toEqual({ work_item_id: child.id });
  expect(
    harness.sqlite
      .query<{ predecessor_work_item_id: string }, []>(
        'SELECT predecessor_work_item_id FROM external_dependency',
      )
      .get(),
  ).toEqual({ predecessor_work_item_id: child.id });
  expect(
    (
      await runSemantic(fixture, (service) =>
        service.undoWithin(
          { projectId: fixture.owner.projectId, userId: fixture.principal.id, personId: null },
          fixture.expectedAccess,
        ),
      )
    ).ok,
  ).toBe(true);
  expect(
    harness.sqlite.query('SELECT predecessor_work_item_id FROM external_dependency').get(),
  ).toEqual({ predecessor_work_item_id: fixture.owner.workItemId });
  const flipped = harness.sqlite
    .query<{ preconditions: string }, [string]>(
      'SELECT preconditions FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
    )
    .get(fixture.owner.projectId);
  if (flipped === null) throw new Error('fixture flipped journal missing');
  expect(
    Object.keys(readPreconditions(JSON.parse(flipped.preconditions) as unknown).expected),
  ).toEqual([fixture.owner.workItemId]);
  expect(
    (
      await runSemantic(fixture, (service) =>
        service.redoWithin(
          { projectId: fixture.owner.projectId, userId: fixture.principal.id, personId: null },
          fixture.expectedAccess,
        ),
      )
    ).ok,
  ).toBe(true);
  expect(
    harness.sqlite.query('SELECT predecessor_work_item_id FROM external_dependency').get(),
  ).toEqual({ predecessor_work_item_id: child.id });
  expect(
    harness.sqlite.query('SELECT created_at,created_by FROM external_dependency').get(),
  ).toEqual({ created_at: 10, created_by: fixture.principal.id });
});

test('mixed incident handdown preserves scopes steps both owners history and local retained rows through nested undo redo', async () => {
  const fixture = await seedIncidents();
  const owner = fixture.owner.projectId;
  const actor = fixture.principal.id;
  const remoteHistory = harness.sqlite
    .query('SELECT * FROM command_journal WHERE project_id!=? ORDER BY id')
    .all(owner);
  const original = await readIncidentRows(owner);
  const created = await runSemantic(fixture, async (service) => {
    const earlier = await service.patch(fixture.localPeer, actor, { notes: 'earlier batch patch' });
    if (!earlier.ok) return earlier;
    const child = await service.create(owner, actor, {
      parentId: fixture.owner.workItemId,
      afterId: null,
      name: 'Mixed child',
    });
    if (!child.ok) return child;
    const later = await service.patch(fixture.localPeer, actor, { name: 'Later local command' });
    if (!later.ok) return later;
    return child;
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('fixture child refused');
  expect(created.stepNodeMapping).toEqual(
    fixture.steps.map(({ id }) => ({
      from: formatStepNodeId({ workItemId: fixture.owner.workItemId, stepId: id }),
      to: formatStepNodeId({ workItemId: created.value.id, stepId: id }),
    })),
  );
  const mapped = await readIncidentRows(owner);
  expect(mapped).toEqual(
    original.map((relationship) => ({
      ...relationship,
      predecessor:
        relationship.predecessor.scope === 'node' &&
        relationship.predecessor.projectId === owner &&
        relationship.predecessor.workItemId === fixture.owner.workItemId
          ? { ...relationship.predecessor, workItemId: created.value.id }
          : relationship.predecessor,
      successor:
        relationship.successor.scope === 'node' &&
        relationship.successor.projectId === owner &&
        relationship.successor.workItemId === fixture.owner.workItemId
          ? { ...relationship.successor, workItemId: created.value.id }
          : relationship.successor,
    })),
  );
  const journal = harness.sqlite
    .query<{ preconditions: string }, [string]>(
      'SELECT preconditions FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
    )
    .get(owner);
  if (journal === null) throw new Error('fixture history missing');
  const preconditions = readPreconditions(JSON.parse(journal.preconditions) as unknown);
  expect(
    preconditions
      .externalRevisions!.expected.map(
        ({ projectId, workItemId }: { projectId: string; workItemId: string }) => [
          projectId,
          workItemId,
        ],
      )
      .sort(),
  ).toEqual(
    [fixture.predecessor, fixture.successor, fixture.secondSuccessor]
      .map(({ projectId, workItemId }) => [projectId, workItemId])
      .sort(),
  );
  expect(Object.keys(preconditions.expected).sort()).toEqual(
    [fixture.owner.workItemId, created.value.id, fixture.localPeer].sort(),
  );
  expect(
    (
      await runSemantic(fixture, (service) =>
        service.undoWithin(
          { projectId: owner, userId: actor, personId: null },
          fixture.expectedAccess,
        ),
      )
    ).ok,
  ).toBe(true);
  expect(await readIncidentRows(owner)).toEqual(original);
  expect(
    (
      await runSemantic(fixture, (service) =>
        service.redoWithin(
          { projectId: owner, userId: actor, personId: null },
          fixture.expectedAccess,
        ),
      )
    ).ok,
  ).toBe(true);
  expect(await readIncidentRows(owner)).toEqual(mapped);
  expect(
    harness.sqlite
      .query('SELECT * FROM command_journal WHERE project_id!=? ORDER BY id')
      .all(owner),
  ).toEqual(remoteHistory);
  const second = await runSemantic(fixture, (service) =>
    service.create(owner, actor, {
      parentId: fixture.owner.workItemId,
      afterId: created.value.id,
      name: 'Second child',
    }),
  );
  expect(second.ok).toBe(true);
  expect(await readIncidentRows(owner)).toEqual(mapped);
});

for (const corruption of [
  'remote-revision',
  'relationship-type',
  'missing-receipt',
  'missing-created-at',
  'missing-receipt-direction',
  'changed-step',
  'changed-owner',
  'changed-scope',
  'changed-audit',
  'missing-scoped-revision',
  'new-incident',
  'missing-relationship',
  'both-receipt-types',
  'both-receipt-audits',
] as const)
  test(`compound undo refuses ${corruption} atomically after an earlier patch`, async () => {
    const fixture = await seedIncidents();
    const owner = fixture.owner.projectId;
    const actor = fixture.principal.id;
    const created = await runSemantic(fixture, (service) =>
      service.create(owner, actor, {
        parentId: fixture.owner.workItemId,
        afterId: null,
        name: 'Guarded child',
      }),
    );
    if (!created.ok) throw new Error('fixture create refused');
    if (corruption === 'remote-revision')
      harness.sqlite
        .query('UPDATE work_item SET revision=revision+1 WHERE id=?')
        .run(fixture.secondSuccessor.workItemId);
    else if (corruption === 'missing-relationship')
      harness.sqlite.run("DELETE FROM external_dependency WHERE id='outgoing-2'");
    else if (corruption === 'relationship-type')
      harness.sqlite.run("UPDATE external_dependency SET type='SS' WHERE id='outgoing-2'");
    else if (corruption === 'new-incident') {
      await harness.publicWrites().uow.run(async (scope) => {
        await scope.stores.typedDependencies.add(
          {
            id: 'newer',
            projectId: fixture.successor.projectId,
            predecessor: {
              projectId: owner,
              workItemId: created.value.id,
              scope: 'node',
              stepId: fixture.steps[0].id,
            },
            successor: { ...fixture.successor, scope: 'whole' },
            type: 'FF',
          },
          { at: 20, by: actor },
        );
        return { commit: true, value: undefined };
      });
      // Keep old guarded revisions so this case reaches exact receipt-set validation.
      const entry = harness.sqlite
        .query<{ preconditions: string }, [string]>(
          'SELECT preconditions FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
        )
        .get(owner);
      if (entry === null) throw new Error('fixture journal missing');
      const expected = readPreconditions(JSON.parse(entry.preconditions) as unknown);
      for (const [id, revision] of Object.entries(expected.expected))
        harness.sqlite.query('UPDATE work_item SET revision=? WHERE id=?').run(revision, id);
      for (const revision of expected.externalRevisions!.expected)
        harness.sqlite
          .query('UPDATE work_item SET revision=? WHERE id=?')
          .run(revision.revision, revision.workItemId);
    } else {
      const entry = harness.sqlite
        .query<{ id: string; inverse: string; preconditions: string }, [string]>(
          'SELECT id,inverse,preconditions FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
        )
        .get(owner);
      if (entry === null) throw new Error('fixture journal missing');
      const inverse = JSON.parse(entry.inverse) as {
        receipts?: { from: ReceiptWire; to: ReceiptWire }[];
      };
      if (corruption === 'missing-scoped-revision') {
        const current = readPreconditions(JSON.parse(entry.preconditions) as unknown);
        const preconditions = {
          ...current,
          externalRevisions: {
            ...current.externalRevisions!,
            expected: current.externalRevisions!.expected.slice(0, -1),
          },
        };
        harness.sqlite
          .query('UPDATE command_journal SET preconditions=? WHERE id=?')
          .run(JSON.stringify(preconditions), entry.id);
      } else {
        const receipt = inverse.receipts?.[0];
        if (receipt === undefined) throw new Error('fixture receipt missing');
        if (corruption === 'missing-receipt') delete inverse.receipts;
        if (corruption === 'missing-created-at') Reflect.deleteProperty(receipt.from, 'createdAt');
        if (corruption === 'missing-receipt-direction') Reflect.deleteProperty(receipt, 'from');
        if (corruption === 'both-receipt-types') {
          receipt.from.dependency.type = 'FS';
          receipt.to.dependency.type = 'FS';
        }
        if (corruption === 'both-receipt-audits') {
          receipt.from.createdAt++;
          receipt.to.createdAt++;
        }
        if (corruption === 'changed-step') receipt.to.dependency.successor.stepId = 'foreign-step';
        if (corruption === 'changed-owner')
          receipt.to.dependency.projectId = fixture.successor.projectId;
        if (corruption === 'changed-scope') {
          receipt.to.dependency.successor.scope = 'whole';
          delete receipt.to.dependency.successor.stepId;
        }
        if (corruption === 'changed-audit') receipt.to.createdAt++;
        harness.sqlite
          .query('UPDATE command_journal SET inverse=? WHERE id=?')
          .run(JSON.stringify(inverse), entry.id);
      }
    }
    const before = readTables();
    const replay = runSemantic(fixture, async (service) => {
      const patched = await service.patch(fixture.ancestor, actor, { notes: 'must roll back' });
      if (!patched.ok) return patched;
      return service.undoWithin(
        { projectId: owner, userId: actor, personId: null },
        fixture.expectedAccess,
      );
    });
    const outcome: unknown = await replay.then(
      (value) => value,
      (error: unknown) => error,
    );
    if (
      [
        'remote-revision',
        'relationship-type',
        'new-incident',
        'missing-relationship',
        'both-receipt-types',
        'both-receipt-audits',
      ].includes(corruption)
    ) {
      expect(outcome).toMatchObject({ ok: false, reason: 'stale_undo' });
      if (typeof outcome !== 'object' || outcome === null || !('detail' in outcome))
        throw new Error('fixture expected modeled refusal');
      expect(outcome.detail).toContain(
        corruption === 'remote-revision'
          ? 'external dependency endpoint changed'
          : 'incident transition refused: stale_undo',
      );
    } else {
      expect(outcome).toBeInstanceOf(Error);
      expect(outcome instanceof Error ? outcome.message : '').toContain(
        corruption === 'missing-created-at'
          ? 'journal incident receipt is malformed'
          : corruption === 'missing-receipt-direction'
            ? 'journal incident receipt directions are missing'
            : corruption === 'missing-scoped-revision'
              ? 'journal external revision coverage is not exact'
              : corruption === 'changed-owner'
                ? 'journal typed dependency successor owner disagrees'
                : 'journal incident',
      );
    }
    expect(readTables()).toEqual(before);
  });

for (const revocation of ['membership', 'credential'] as const)
  for (const direction of ['undo', 'redo'] as const)
    test(`mounted compound ${direction} rechecks ${revocation} after request admission while queued for the writer`, async () => {
      const fixture = await seedIncidents();
      const created = await runSemantic(fixture, (service) =>
        service.create(fixture.owner.projectId, fixture.principal.id, {
          parentId: fixture.owner.workItemId,
          afterId: null,
          name: 'Queued child',
        }),
      );
      if (!created.ok) throw new Error('fixture create refused');
      if (direction === 'redo')
        expect(
          (
            await runSemantic(fixture, (service) =>
              service.undoWithin(
                {
                  projectId: fixture.owner.projectId,
                  userId: fixture.principal.id,
                  personId: null,
                },
                fixture.expectedAccess,
              ),
            )
          ).ok,
        ).toBe(true);
      let release!: () => void;
      let entered!: () => void;
      let admitted!: () => void;
      const turnEntered = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const requestAdmitted = new Promise<void>((resolve) => {
        admitted = resolve;
      });
      const held = harness.holdWriteTurn(
        new Promise<void>((resolve) => {
          release = resolve;
        }),
        () => {
          entered();
        },
      );
      await turnEntered;
      setRequestAdmissionObserver(() => {
        admitted();
      });
      const pending = fixture.request(`/api/projects/${fixture.owner.projectId}/${direction}`);
      try {
        await requestAdmitted;
        if (revocation === 'membership') {
          harness.sqlite
            .query(
              "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id=?",
            )
            .run(fixture.principal.id);
        } else {
          const claims = decodeJwt(harness.token('ada'));
          if (typeof claims.exp !== 'number')
            throw new Error('fixture credential expiration missing');
          harness.sqlite
            .query(
              'INSERT INTO browser_credential_revocations(kind,user_id,credential_digest,expires_at,revoked_at) VALUES (?,?,?,?,?)',
            )
            .run(
              'native',
              fixture.principal.id,
              createHash('sha256').update(harness.token('ada')).digest('hex'),
              claims.exp * 1000,
              Date.now(),
            );
        }
        const before = readTables();
        release();
        await held;
        const response = await pending;
        expect({
          status: response.status,
          changed: JSON.stringify(readTables()) !== JSON.stringify(before),
        }).toEqual({ status: 403, changed: false });
        expect(await response.json()).toMatchObject({
          error: revocation === 'membership' ? 'not_a_member' : 'no_active_organization',
        });
        expect(readTables()).toEqual(before);
      } finally {
        release();
        await held;
        setRequestAdmissionObserver(undefined);
      }
    });

test('compound handdown carries local statement estimate and progress facts with exact unit bindings through neighboring history', async () => {
  const fixture = await seedIncidents();
  const owner = fixture.owner.projectId;
  const actor = fixture.principal.id;
  const step = fixture.steps.at(0);
  if (step === undefined) throw new Error('fixture step missing');
  expect(
    (
      await runSemantic(fixture, async (service) => {
        const readiness = await service.patch(fixture.owner.workItemId, actor, {
          readiness: 'ready',
          hold: null,
        });
        if (!readiness.ok) return readiness;
        const estimate = await service.setEstimate(fixture.owner.workItemId, actor, step.id, {
          optimistic: 1,
          realistic: 2,
          pessimistic: 3,
        });
        if (!estimate.ok) return estimate;
        return service.setProgress(fixture.owner.workItemId, actor, step.id, 'in_progress');
      })
    ).ok,
  ).toBe(true);
  const created = await runSemantic(fixture, (service) =>
    service.create(owner, actor, {
      parentId: fixture.owner.workItemId,
      afterId: null,
      name: 'Child with facts',
    }),
  );
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('fixture create refused');
  const journal = harness.sqlite
    .query<{ preconditions: string }, [string]>(
      'SELECT preconditions FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
    )
    .get(owner);
  if (journal === null) throw new Error('fixture journal missing');
  expect(readPreconditions(JSON.parse(journal.preconditions) as unknown).estimateUnits).toEqual({
    [step.id]: 'workdays',
  });
  expect(harness.sqlite.query('SELECT work_item_id FROM estimate').all()).toEqual([
    { work_item_id: created.value.id },
  ]);
  expect(harness.sqlite.query('SELECT work_item_id FROM step_progress').all()).toEqual([
    { work_item_id: created.value.id },
  ]);
  expect(
    (
      await runSemantic(fixture, (service) =>
        service.undoWithin(
          { projectId: owner, userId: actor, personId: null },
          fixture.expectedAccess,
        ),
      )
    ).ok,
  ).toBe(true);
  expect(harness.sqlite.query('SELECT work_item_id FROM estimate').all()).toEqual([
    { work_item_id: fixture.owner.workItemId },
  ]);
  expect(harness.sqlite.query('SELECT work_item_id FROM step_progress').all()).toEqual([
    { work_item_id: fixture.owner.workItemId },
  ]);
  expect(
    (
      await runSemantic(fixture, (service) =>
        service.undoWithin(
          { projectId: owner, userId: actor, personId: null },
          fixture.expectedAccess,
        ),
      )
    ).ok,
  ).toBe(true);
  expect(harness.sqlite.query('SELECT work_item_id FROM estimate').all()).toEqual([]);
  expect(
    (
      await runSemantic(fixture, (service) =>
        service.redoWithin(
          { projectId: owner, userId: actor, personId: null },
          fixture.expectedAccess,
        ),
      )
    ).ok,
  ).toBe(true);
  expect(
    (
      await runSemantic(fixture, (service) =>
        service.redoWithin(
          { projectId: owner, userId: actor, personId: null },
          fixture.expectedAccess,
        ),
      )
    ).ok,
  ).toBe(true);
  expect(harness.sqlite.query('SELECT work_item_id FROM estimate').all()).toEqual([
    { work_item_id: created.value.id },
  ]);
});

interface ReceiptWire {
  createdAt: number;
  dependency: { projectId: string; type: string; successor: { scope: string; stepId?: string } };
}

test('outer batch retains earliest remote before revisions across two consecutive incident mappings', async () => {
  const fixture = await seedIncidents();
  const owner = fixture.owner.projectId;
  const remoteIds = [
    fixture.predecessor.workItemId,
    fixture.successor.workItemId,
    fixture.secondSuccessor.workItemId,
  ];
  const readRemoteRevisions = () =>
    harness.sqlite
      .query<{ id: string; project_id: string; revision: number }, string[]>(
        `SELECT id,project_id,revision FROM work_item WHERE id IN (${remoteIds.map(() => '?').join(',')}) ORDER BY project_id,id`,
      )
      .all(...remoteIds)
      .map(({ id, project_id, revision }) => ({ projectId: project_id, workItemId: id, revision }));
  const before = readRemoteRevisions();
  const original = await readIncidentRows(owner);
  const created = await runSemantic(fixture, async (service) => {
    const first = await service.create(owner, fixture.principal.id, {
      parentId: fixture.owner.workItemId,
      afterId: null,
      name: 'First generation',
    });
    if (!first.ok) return first;
    return service.create(owner, fixture.principal.id, {
      parentId: first.value.id,
      afterId: null,
      name: 'Second generation',
    });
  });
  expect(created.ok).toBe(true);
  const entry = harness.sqlite
    .query<{ preconditions: string }, [string]>(
      'SELECT preconditions FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
    )
    .get(owner);
  if (entry === null) throw new Error('fixture journal missing');
  const preconditions = readPreconditions(JSON.parse(entry.preconditions) as unknown);
  const sort = (entries: readonly { projectId: string; workItemId: string; revision: number }[]) =>
    [...entries].sort(
      (a, b) => a.projectId.localeCompare(b.projectId) || a.workItemId.localeCompare(b.workItemId),
    );
  expect(sort(preconditions.externalRevisions!.from)).toEqual(sort(before));
  expect(sort(preconditions.externalRevisions!.expected)).toEqual(sort(readRemoteRevisions()));
  const mapped = await readIncidentRows(owner);
  expect(
    (
      await runSemantic(fixture, (service) =>
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
      await runSemantic(fixture, (service) =>
        service.redoWithin(
          { projectId: owner, userId: fixture.principal.id, personId: null },
          fixture.expectedAccess,
        ),
      )
    ).ok,
  ).toBe(true);
  expect(await readIncidentRows(owner)).toEqual(mapped);
});

for (const delivery of ['unreadable-project', 'missing-row', 'foreign-row'] as const)
  test(`compound redo refuses current ${delivery} evidence and rolls back a preceding local patch`, async () => {
    const fixture = await seedIncidents();
    const owner = fixture.owner.projectId;
    const actor = fixture.principal.id;
    const created = await runSemantic(fixture, (service) =>
      service.create(owner, actor, {
        parentId: fixture.owner.workItemId,
        afterId: null,
        name: 'Read guarded child',
      }),
    );
    if (!created.ok) throw new Error('fixture create refused');
    expect(
      (
        await runSemantic(fixture, (service) =>
          service.undoWithin(
            { projectId: owner, userId: actor, personId: null },
            fixture.expectedAccess,
          ),
        )
      ).ok,
    ).toBe(true);
    const before = readTables();
    const refused = await runSemantic(
      fixture,
      async (service) => {
        const patched = await service.patch(fixture.ancestor, actor, { notes: 'must roll back' });
        if (!patched.ok) return patched;
        return service.redoWithin(
          { projectId: owner, userId: actor, personId: null },
          fixture.expectedAccess,
        );
      },
      (stores) => ({
        ...stores,
        projects:
          delivery !== 'unreadable-project'
            ? stores.projects
            : new Proxy(stores.projects, {
                get(target, key) {
                  if (key === 'findInOrganization')
                    return (projectId: string, organizationId: string) =>
                      projectId === fixture.successor.projectId
                        ? Promise.resolve(null)
                        : target.findInOrganization(projectId, organizationId);
                  const member: unknown = Reflect.get(target, key);
                  return typeof member === 'function'
                    ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
                    : member;
                },
              }),
        workItems:
          delivery === 'unreadable-project'
            ? stores.workItems
            : new Proxy(stores.workItems, {
                get(target, key) {
                  if (key === 'findById')
                    return async (id: string) => {
                      const row = await target.findById(id);
                      if (row === null || id !== fixture.successor.workItemId) return row;
                      return delivery === 'missing-row' ? null : { ...row, projectId: owner };
                    };
                  const member: unknown = Reflect.get(target, key);
                  return typeof member === 'function'
                    ? (...args: unknown[]): unknown => Reflect.apply(member, target, args)
                    : member;
                },
              }),
      }),
    );
    expect(refused).toMatchObject({ ok: false, reason: 'not_found' });
    expect(readTables()).toEqual(before);
  });

// Proof: bypassing both history endpoint reads and external revision reads changed this mounted refusal from 404 not_found to 409 stale_undo (2026-10-22).
// Bypassing endpoint reads alone remained green because revision reads independently detect the missing predecessor.
test('synthetic mounted undo refuses a legally destroyed predecessor before restoring the successor or consuming history', async () => {
  const pushes: string[] = [];
  const fixture = await openFixture({ syntheticExternalCommands: true, pushes });
  await harness.register('grace');
  harness.member('org-a', 'grace', 'member');
  harness.sqlite
    .query('UPDATE organization_membership SET role=? WHERE organization_id=? AND user_id=?')
    .run('member', 'org-a', fixture.principal.id);
  harness.sqlite
    .query('UPDATE project SET owner_id=?,restricted=1 WHERE id=?')
    .run(harness.userId('grace'), fixture.predecessor.projectId);
  const selected = await harness.request('/api/organization/active', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      authorization: `Bearer ${harness.token('grace')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ organizationId: 'org-a' }),
  });
  expect(selected.status).toBe(200);
  const cookie = selected.headers.get('set-cookie')?.split(';')[0];
  if (cookie === undefined) throw new Error('mounted Grace binding missing');
  const route = `/api/projects/${fixture.owner.projectId}`;
  expect(
    (
      await fixture.request(`${route}/commands`, {
        commands: [{ kind: 'addTypedDependency', ...fixture.input }],
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fixture.request(`${route}/commands`, {
        commands: [
          { kind: 'deleteWorkItem', workItemId: fixture.owner.workItemId, strategy: 'cascade' },
        ],
      })
    ).status,
  ).toBe(200);
  expect(harness.sqlite.query('SELECT * FROM external_dependency').all()).toEqual([]);
  const destroyed = await harness.request(
    `/api/projects/${fixture.predecessor.projectId}/commands`,
    {
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
            kind: 'deleteWorkItem',
            workItemId: fixture.predecessor.workItemId,
            strategy: 'cascade',
          },
        ],
      }),
    },
  );
  expect(destroyed.status).toBe(200);
  expect(
    harness.sqlite
      .query('SELECT id FROM work_item WHERE id IN (?,?)')
      .all(fixture.predecessor.workItemId, fixture.owner.workItemId),
  ).toEqual([]);
  const before = readTables();
  const beforePushes = [...pushes];
  const refused = await fixture.request(`${route}/undo`);
  const body: unknown = await refused.json();
  expect({ status: refused.status, body }).toEqual({
    status: 404,
    body: { error: 'not_found' },
  });
  expect(readTables()).toEqual(before);
  expect(pushes).toEqual(beforePushes);
});

for (const direction of ['undo', 'redo'] as const)
  for (const observation of ['healthy', 'remote-cycle', 'final-finding'] as const)
    test(`synthetic mounted compound ${direction} ${observation === 'remote-cycle' ? 'refuses a remote-only cycle atomically and prunes exactly its selected journal' : observation === 'final-finding' ? 'refuses a final-only graph finding after healthy reattachment' : 'restores the exact relationship and flips its selected journal'}`, async () => {
      const pushes: string[] = [];
      const fixture = await openFixture({ syntheticExternalCommands: true, pushes });
      const a = fixture.predecessor;
      const b = fixture.owner;
      const route = `/api/projects/${b.projectId}`;
      const remoteRoute = `/api/projects/${a.projectId}`;
      const createPeer = async (projectId: string, name: string) => {
        expect(
          (
            await fixture.request(`/api/projects/${projectId}/commands`, {
              commands: [{ kind: 'createWorkItem', name }],
            })
          ).status,
        ).toBe(200);
        const row = harness.sqlite
          .query<{ id: string }, [string, string]>(
            'SELECT id FROM work_item WHERE project_id=? AND name=?',
          )
          .get(projectId, name);
        if (row === null) throw new Error('fixture bridge missing');
        return { projectId, workItemId: row.id };
      };
      const x = await createPeer(b.projectId, 'Cycle bridge X');
      const y = await createPeer(a.projectId, 'Cycle bridge Y');
      const readNode = (address: typeof a) => {
        const step = harness.sqlite
          .query<{ id: string }, [string]>("SELECT id FROM step WHERE project_id=? AND name='Dev'")
          .get(address.projectId);
        if (step === null) throw new Error('fixture Dev step missing');
        return { ...address, scope: 'node' as const, stepId: step.id };
      };
      const createAddCommand = (predecessor: typeof a, successor: typeof a) => ({
        kind: 'addTypedDependency',
        predecessor: readNode(predecessor),
        successor: readNode(successor),
        type: 'FS',
      });
      expect(
        (await fixture.request(`${route}/commands`, { commands: [createAddCommand(b, x)] })).status,
      ).toBe(200);
      expect(
        (await fixture.request(`${remoteRoute}/commands`, { commands: [createAddCommand(y, a)] }))
          .status,
      ).toBe(200);
      const patch = {
        kind: 'patchWorkItem',
        workItemId: b.workItemId,
        patch: { notes: 'Compound replay patch' },
      };
      if (direction === 'undo')
        expect(
          (await fixture.request(`${route}/commands`, { commands: [createAddCommand(a, b)] }))
            .status,
        ).toBe(200);
      const readRelationship = () =>
        harness.sqlite
          .query<{ id: string }, [string]>(
            'SELECT id,type,predecessor_project_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_project_id,successor_work_item_id,successor_scope,successor_step_id FROM external_dependency WHERE successor_project_id=?',
          )
          .get(b.projectId);
      const createRemoveCommand = () => {
        const row = harness.sqlite
          .query<{ id: string }, [string]>(
            'SELECT id FROM external_dependency WHERE successor_project_id=?',
          )
          .get(b.projectId);
        if (row === null) throw new Error('fixture relationship missing');
        return { kind: 'removeTypedDependency', dependencyId: row.id };
      };
      const original = direction === 'undo' ? readRelationship() : null;
      expect(
        (
          await fixture.request(`${route}/commands`, {
            commands:
              direction === 'undo'
                ? [createRemoveCommand(), patch]
                : [patch, createAddCommand(a, b)],
          })
        ).status,
      ).toBe(200);
      const relationship = direction === 'undo' ? original : readRelationship();
      const relationshipId = relationship?.id;
      if (typeof relationshipId !== 'string') throw new Error('fixture relationship ID absent');
      expect(relationship).toMatchObject({
        id: expect.any(String) as unknown,
        type: 'FS',
        predecessor_project_id: a.projectId,
        predecessor_work_item_id: a.workItemId,
        predecessor_scope: 'node',
        predecessor_step_id: readNode(a).stepId,
        successor_project_id: b.projectId,
        successor_work_item_id: b.workItemId,
        successor_scope: 'node',
        successor_step_id: readNode(b).stepId,
      });
      if (direction === 'redo') expect((await fixture.request(`${route}/undo`)).status).toBe(200);
      expect(readRelationship()).toBeNull();
      const selected = harness.sqlite
        .query<{ id: string; undone: number; inverse: string; payload: string }, [string]>(
          'SELECT id,undone,inverse,payload FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
        )
        .get(b.projectId);
      if (selected === null) throw new Error('fixture selected journal missing');
      expect(selected.undone).toBe(direction === 'redo' ? 1 : 0);
      const replay =
        direction === 'undo'
          ? readCommand(JSON.parse(selected.inverse) as unknown)
          : readPayload(JSON.parse(selected.payload) as unknown).forward;
      expect(replay.do).toBe('batch');
      if (replay.do !== 'batch') throw new Error('fixture compound replay missing');
      expect(replay.steps.map((command) => command.do)).toEqual(['patch', 'add_typed_dependency']);
      const readGuardedRevisions = () =>
        harness.sqlite
          .query('SELECT id,revision FROM work_item WHERE id IN (?,?) ORDER BY id')
          .all(a.workItemId, b.workItemId);
      const revisions = readGuardedRevisions();
      if (observation === 'remote-cycle')
        expect(
          (await fixture.request(`${remoteRoute}/commands`, { commands: [createAddCommand(x, y)] }))
            .status,
        ).toBe(200);
      expect(readGuardedRevisions()).toEqual(revisions);
      const before = readTables();
      const beforePatch = harness.sqlite
        .query('SELECT notes,revision,updated_at FROM work_item WHERE id=?')
        .get(b.workItemId);
      const beforePushes = [...pushes];
      // Saved method keeps the genuine connected graph and its receiver active.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalCycle = DependencyGraphGuard.prototype.findCycle;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalRead = ConnectedDependencyGraphReader.prototype.read;
      let captured: Awaited<ReturnType<ConnectedDependencyGraphReader['read']>> | undefined;
      let proposedReads = 0;
      let finalReads = 0;
      if (observation === 'final-finding') {
        ConnectedDependencyGraphReader.prototype.read = async function (projectIds, changes) {
          captured = await originalRead.call(this, projectIds, changes);
          return captured;
        };
        DependencyGraphGuard.prototype.findCycle = async function (projectId, change) {
          const cycle = await originalCycle.call(this, projectId, change);
          expect(projectId).toBe(b.projectId);
          expect(cycle).toBeNull();
          if (change !== undefined && Object.keys(change).length > 0) {
            proposedReads++;
            return cycle;
          }
          finalReads++;
          expect(proposedReads).toBeGreaterThan(0);
          if (captured === undefined) throw new Error('fixture staged graph absent');
          const restoredRelationship = {
            id: relationshipId,
            projectId: b.projectId,
            predecessor: readNode(a),
            successor: readNode(b),
            type: 'FS' as const,
          };
          expect(captured.external.find(({ id }) => id === relationshipId)).toEqual(
            restoredRelationship,
          );
          expect(
            captured.projects
              .find(({ projectId }) => projectId === b.projectId)
              ?.state.rows.find(({ id }) => id === b.workItemId)?.notes,
          ).toBe(direction === 'undo' ? '' : 'Compound replay patch');
          return { kind: 'cycle', relationshipIds: ['final-observation-only'] };
        };
      }
      let response: Response;
      try {
        response = await fixture.request(`${route}/${direction}`);
      } finally {
        DependencyGraphGuard.prototype.findCycle = originalCycle;
        ConnectedDependencyGraphReader.prototype.read = originalRead;
      }
      const body: unknown = await response.json();
      if (observation === 'final-finding') expect(finalReads).toBe(1);
      if (observation === 'healthy') {
        expect({ status: response.status, body }).toMatchObject({ status: 200 });
        expect(readRelationship()).toEqual(relationship);
        expect(
          harness.sqlite.query('SELECT notes FROM work_item WHERE id=?').get(b.workItemId),
        ).toEqual({
          notes: direction === 'undo' ? '' : 'Compound replay patch',
        });
        expect(
          harness.sqlite.query('SELECT undone FROM command_journal WHERE id=?').get(selected.id),
        ).toEqual({ undone: direction === 'undo' ? 1 : 0 });
        return;
      }
      expect({ status: response.status, body }).toEqual({
        status: 409,
        body: {
          error: 'stale_undo',
          detail:
            observation === 'final-finding'
              ? 'that would now close a dependency cycle between steps.'
              : 'that relationship would now be refused: cycle.',
        },
      });
      expect(
        harness.sqlite
          .query('SELECT notes,revision,updated_at FROM work_item WHERE id=?')
          .get(b.workItemId),
      ).toEqual(beforePatch);
      expect(readTables().filter(({ name }) => name !== 'command_journal')).toEqual(
        before.filter(({ name }) => name !== 'command_journal'),
      );
      expect(pushes).toEqual(beforePushes);
      expect(readTables()).toEqual(
        before.map((table) =>
          table.name !== 'command_journal'
            ? table
            : {
                ...table,
                rows: table.rows.filter(
                  (row) => (JSON.parse(row) as { id: string }).id !== selected.id,
                ),
              },
        ),
      );
    });
