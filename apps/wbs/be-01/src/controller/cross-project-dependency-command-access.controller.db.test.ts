import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { WriteCoordinator } from '@wbs/store-sqlite/gate';
import { ProjectRepository } from '@wbs/store-sqlite/project';
import { WorkItemRepository } from '@wbs/store-sqlite/work-item';
import { afterEach, expect, spyOn, test } from 'bun:test';

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

function deferSignal() {
  let resolve = (): void => {
    throw new Error('signal not initialized');
  };
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function sendBatch(fixture: Fixture, commands: readonly unknown[]) {
  return fixture.request(`/api/projects/${fixture.owner.projectId}/commands`, { commands });
}

function readLinks(fixture: Fixture) {
  return harness.sqlite
    .query<{ id: string; type: string }, [string]>(
      'SELECT id, type FROM external_dependency WHERE successor_project_id=? ORDER BY id',
    )
    .all(fixture.owner.projectId);
}

async function addLink(fixture: Fixture) {
  expect(
    (await sendBatch(fixture, [{ kind: 'addTypedDependency', ...fixture.input }])).status,
  ).toBe(200);
  const link = readLinks(fixture).at(0);
  if (link === undefined) throw new Error('fixture external relationship missing');
  return link.id;
}

async function lookupPredecessor(fixture: Fixture) {
  const cookie = fixture.principal.organizationBinding?.cookie;
  if (cookie == null) throw new Error('fixture selection cookie missing');
  const headers = {
    cookie: `__Host-wbs_organization=${encodeURIComponent(cookie)}`,
    authorization: `Bearer ${harness.token('ada')}`,
    'X-WBS-Expected-Organization': 'org-a',
  };
  const candidates = await harness.request(
    `/api/projects/${fixture.predecessor.projectId}/address-candidates`,
    { headers },
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
    { headers },
  );
  expect(lookup.status).toBe(200);
  expect(await lookup.json()).toMatchObject({
    projectId: fixture.predecessor.projectId,
    endpoint: { workItemId: fixture.predecessor.workItemId },
  });
}

// Proof: bypassing only AdmittedScope.refuseOutsideScope's forbidden branch
// admitted queued add/update/remove after successor restriction (HTTP 200),
// instead of whole-request 403; watched 2026-10-23.
for (const operation of ['add', 'update', 'remove'] as const)
  test(`active mounted queued external ${operation} revalidates successor edit access`, async () => {
    const pushes: string[] = [];
    const fixture = await openFixture({ syntheticExternalCommands: true, pushes });
    await harness.register('owner');
    harness.member('org-a', 'owner', 'member');
    harness.sqlite.run('UPDATE project SET owner_id=? WHERE id=?', [
      harness.userId('owner'),
      fixture.owner.projectId,
    ]);
    harness.sqlite.run(
      "UPDATE organization_membership SET role='member' WHERE organization_id='org-a' AND user_id=?",
      [harness.userId('ada')],
    );
    const policy = harness.sqlite
      .query<{ owner_id: string; restricted: number }, [string]>(
        'SELECT owner_id, restricted FROM project WHERE id=?',
      )
      .get(fixture.owner.projectId);
    expect(policy).toEqual({ owner_id: harness.userId('owner'), restricted: 0 });
    expect(harness.userId('ada')).not.toBe(harness.userId('owner'));
    let dependencyId = operation === 'add' ? undefined : await addLink(fixture);
    const command = () =>
      operation === 'remove'
        ? { kind: 'removeTypedDependency', dependencyId }
        : {
            kind: operation === 'add' ? 'addTypedDependency' : 'updateTypedDependency',
            ...fixture.input,
            type: operation === 'update' ? 'SS' : 'FS',
            ...(dependencyId === undefined ? {} : { dependencyId }),
          };
    const method =
      operation === 'add'
        ? 'addTypedDependency'
        : operation === 'update'
          ? 'updateTypedDependency'
          : 'removeTypedDependency';
    const dispatch = spyOn(WorkItemService.prototype, method);
    const projectEvidence = spyOn(ProjectRepository.prototype, 'findInOrganization');
    const rowEvidence = spyOn(WorkItemRepository.prototype, 'findById');
    let release = (): void => {
      throw new Error('writer not held');
    };
    let held: Promise<void> | undefined;
    const separate = openDatabase(harness.databasePath());
    try {
      await lookupPredecessor(fixture);
      const sentControl = pushes.length;
      expect((await sendBatch(fixture, [command()])).status).toBe(200);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(projectEvidence).toHaveBeenCalled();
      expect(rowEvidence).toHaveBeenCalled();
      expect(pushes.length).toBeGreaterThan(sentControl);
      if (operation === 'add') {
        const link = readLinks(fixture).at(0);
        if (link === undefined) throw new Error('positive add relationship missing');
        expect(link.type).toBe('FS');
        expect(
          (await sendBatch(fixture, [{ kind: 'removeTypedDependency', dependencyId: link.id }]))
            .status,
        ).toBe(200);
      } else if (operation === 'update') {
        if (dependencyId === undefined) throw new Error('positive update relationship missing');
        expect(readLinks(fixture)).toEqual([{ id: dependencyId, type: 'SS' }]);
      } else {
        expect(readLinks(fixture)).toEqual([]);
        dependencyId = await addLink(fixture);
      }
      await lookupPredecessor(fixture);
      dispatch.mockClear();
      projectEvidence.mockClear();
      rowEvidence.mockClear();
      const entered = deferSignal();
      const unblock = deferSignal();
      release = () => {
        unblock.resolve();
      };
      held = harness.holdWriteTurn(unblock.promise, () => {
        entered.resolve();
      });
      await entered.promise;
      const resolved = deferSignal();
      const queued = deferSignal();
      const enterDescriptor = Object.getOwnPropertyDescriptor(WriteCoordinator.prototype, 'enter');
      if (enterDescriptor === undefined) throw new Error('fixture production method missing');
      const enter = enterDescriptor.value as WriteCoordinator['enter'];
      const queue = spyOn(WriteCoordinator.prototype, 'enter').mockImplementation(function <T>(
        this: WriteCoordinator,
        work: () => Promise<T>,
      ): Promise<T> {
        const pending = enter.call(this, work) as Promise<T>;
        queued.resolve();
        return pending;
      });
      setRequestAdmissionObserver(() => {
        resolved.resolve();
      });
      const pending = sendBatch(fixture, [
        {
          kind: 'patchWorkItem',
          workItemId: fixture.owner.workItemId,
          patch: { name: 'Must never dispatch' },
        },
        command(),
      ]);
      try {
        await resolved.promise;
        await queued.promise;
        queue.mockRestore();
        setRequestAdmissionObserver(undefined);
        separate.run('UPDATE project SET restricted=1 WHERE id=?', [fixture.owner.projectId]);
        const before = readTables();
        const links = readLinks(fixture);
        const sent = [...pushes];
        release();
        await held;
        const response = await pending;
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'forbidden' });
        expect(dispatch).not.toHaveBeenCalled();
        expect(projectEvidence).not.toHaveBeenCalled();
        expect(rowEvidence).not.toHaveBeenCalled();
        expect(readTables()).toEqual(before);
        expect(pushes).toEqual(sent);
        expect(readLinks(fixture)).toEqual(links);
        expect(links.length).toBe(operation === 'add' ? 0 : 1);
      } finally {
        queue.mockRestore();
      }
    } finally {
      setRequestAdmissionObserver(undefined);
      if (held !== undefined) {
        release();
        await held;
      }
      separate.close();
      dispatch.mockRestore();
      projectEvidence.mockRestore();
      rowEvidence.mockRestore();
    }
  }, 15_000);
