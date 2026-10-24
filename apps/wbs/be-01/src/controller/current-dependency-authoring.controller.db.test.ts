import type { ExternalDependencyAuthoring } from '@wbs/core/ports/external-dependency-authoring';
import { afterEach, expect, test } from 'bun:test';

import {
  closeFixture,
  harness,
  openFixture,
  readTables,
  runSemantic,
} from './cross-project-dependency-fixture';

afterEach(closeFixture);

async function expectAuthorityFailure(attempt: Promise<unknown>, message: string) {
  const failure: unknown = await attempt.catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(failure instanceof Error ? failure.message : undefined).toBe(message);
}

function mutableAuthoring(initial: ExternalDependencyAuthoring['state']) {
  let state = initial;
  let isUnreadable = false;
  let reads = 0;
  return {
    port: {
      get state() {
        reads++;
        if (isUnreadable) throw new Error('authoring authority unreadable');
        return state;
      },
    },
    setState(next: ExternalDependencyAuthoring['state']) {
      state = next;
    },
    breakRead() {
      isUnreadable = true;
    },
    readCount: () => reads,
  };
}

for (const initial of ['active', 'inactive'] as const) {
  test(`current capability replaces construction ${initial} for add`, async () => {
    const fixture = await openFixture();
    const authoring = mutableAuthoring(initial);
    const before = readTables();
    const attempt = await runSemantic(
      fixture,
      async (service) => {
        authoring.setState(initial === 'active' ? 'inactive' : 'active');
        return service.addTypedDependency(
          fixture.owner.projectId,
          fixture.principal.id,
          fixture.input,
        );
      },
      undefined,
      authoring.port,
    );
    if (initial === 'active') {
      expect(attempt).toEqual({ ok: false, reason: 'external_dependencies_inactive' });
      expect(readTables()).toEqual(before);
    } else expect(attempt.ok).toBe(true);
  });
}

for (const operation of [
  'add',
  'update-external',
  'update-local',
  'remove',
  'copy',
  'undo',
  'redo',
] as const) {
  for (const fault of ['inactive', 'unreadable', 'active'] as const) {
    test(`current capability ${fault} admits or refuses ${operation} atomically`, async () => {
      const fixture = await openFixture();
      const owner = fixture.owner.projectId;
      const actor = fixture.principal.id;
      const authoring = mutableAuthoring('active');
      const localInput = {
        ...fixture.input,
        predecessor: { ...fixture.owner, scope: 'whole' as const },
        successor: { ...fixture.owner, scope: 'whole' as const },
      };
      // An independent local predecessor avoids a self edge in update-to-local.
      expect(
        (
          await fixture.request(`/api/projects/${owner}/commands`, {
            commands: [{ kind: 'createWorkItem', name: 'Local predecessor' }],
          })
        ).status,
      ).toBe(200);
      const peer = harness.sqlite
        .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE name=?')
        .get('Local predecessor');
      if (peer === null) throw new Error('fixture local predecessor missing');
      localInput.predecessor.workItemId = peer.id;
      const seeded = await runSemantic(
        fixture,
        (service) =>
          service.addTypedDependency(
            owner,
            actor,
            operation === 'update-external' ? localInput : fixture.input,
          ),
        undefined,
        authoring.port,
      );
      if (!seeded.ok) throw new Error(`fixture relationship refused: ${seeded.reason}`);
      if (operation === 'redo') {
        expect(
          (
            await runSemantic(
              fixture,
              (service) => service.undoWithin(owner, actor, fixture.expectedAccess),
              undefined,
              authoring.port,
            )
          ).ok,
        ).toBe(true);
      }
      const before = readTables();
      if (fault === 'active') authoring.setState('inactive');
      const execute = () =>
        runSemantic(
          fixture,
          async (service) => {
            if (fault === 'unreadable') authoring.breakRead();
            else authoring.setState(fault);
            switch (operation) {
              case 'add':
                return service.addTypedDependency(owner, actor, { ...fixture.input, type: 'SS' });
              case 'update-external':
                return service.updateTypedDependency(owner, actor, seeded.value, fixture.input);
              case 'update-local':
                return service.updateTypedDependency(owner, actor, seeded.value, localInput);
              case 'remove':
                return service.removeTypedDependency(owner, actor, seeded.value);
              case 'copy':
                return service.duplicate(fixture.owner.workItemId, actor);
              case 'undo':
                return service.undoWithin(owner, actor, fixture.expectedAccess);
              case 'redo':
                return service.redoWithin(owner, actor, fixture.expectedAccess);
            }
          },
          undefined,
          authoring.port,
        );
      if (fault === 'unreadable')
        await expectAuthorityFailure(execute(), 'authoring authority unreadable');
      else if (fault === 'active') expect((await execute()).ok).toBe(true);
      else
        expect(await execute()).toMatchObject({
          ok: false,
          reason: 'external_dependencies_inactive',
        });
      if (fault !== 'active') expect(readTables()).toEqual(before);
    });
  }
}

test('current capability preserves principal owner and endpoint concealment before an unreadable port', async () => {
  const fixture = await openFixture();
  const authoring = mutableAuthoring('active');
  const before = readTables();
  await runSemantic(
    fixture,
    async (service) => {
      const reads = authoring.readCount();
      authoring.breakRead();
      expect(
        await service.addTypedDependency(fixture.owner.projectId, 'stranger', fixture.input),
      ).toEqual({ ok: false, reason: 'forbidden' });
      expect(
        await service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
          ...fixture.input,
          successor: { ...fixture.input.successor, projectId: fixture.successor.projectId },
        }),
      ).toEqual({ ok: false, reason: 'not_found' });
      expect(
        await service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
          ...fixture.input,
          predecessor: { ...fixture.input.predecessor, workItemId: 'missing' },
        }),
      ).toEqual({ ok: false, reason: 'not_found' });
      expect(authoring.readCount()).toBe(reads);
      return { ok: false as const };
    },
    undefined,
    authoring.port,
  );
  expect(readTables()).toEqual(before);
});

test('a local command does not consume unreadable external authority after construction', async () => {
  const fixture = await openFixture();
  const authoring = mutableAuthoring('inactive');
  const attempt = await runSemantic(
    fixture,
    async (service) => {
      authoring.breakRead();
      return service.create(fixture.owner.projectId, fixture.principal.id, {
        name: 'Local only',
        parentId: null,
        afterId: null,
      });
    },
    undefined,
    authoring.port,
  );
  expect(attempt.ok).toBe(true);
});

for (const fault of ['inactive', 'unreadable'] as const) {
  test(`current capability ${fault} rolls back an earlier local batch write`, async () => {
    const fixture = await openFixture();
    const authoring = mutableAuthoring('active');
    const before = readTables();
    const execute = () =>
      runSemantic(
        fixture,
        async (service) => {
          const created = await service.create(fixture.owner.projectId, fixture.principal.id, {
            name: 'Must roll back',
            parentId: null,
            afterId: null,
          });
          expect(created.ok).toBe(true);
          if (fault === 'unreadable') authoring.breakRead();
          else authoring.setState(fault);
          return service.addTypedDependency(
            fixture.owner.projectId,
            fixture.principal.id,
            fixture.input,
          );
        },
        undefined,
        authoring.port,
      );
    if (fault === 'unreadable')
      await expectAuthorityFailure(execute(), 'authoring authority unreadable');
    else expect(await execute()).toEqual({ ok: false, reason: 'external_dependencies_inactive' });
    // Complete table snapshot includes revisions, command history and durable events;
    // runSemantic also requires the recording broadcaster to remain empty.
    expect(readTables()).toEqual(before);
  });
}

for (const fault of ['missing', 'unknown'] as const) {
  test(`current capability ${fault} is a trusted wiring failure after construction`, async () => {
    const fixture = await openFixture();
    const authoring = mutableAuthoring('active');
    const before = readTables();
    await expectAuthorityFailure(
      runSemantic(
        fixture,
        async (service) => {
          if (fault === 'missing') Reflect.deleteProperty(authoring.port, 'state');
          else Object.defineProperty(authoring.port, 'state', { value: 'unknown' });
          return service.addTypedDependency(
            fixture.owner.projectId,
            fixture.principal.id,
            fixture.input,
          );
        },
        undefined,
        authoring.port,
      ),
      fault === 'missing'
        ? 'external dependency authoring capability is missing'
        : 'unknown external dependency authoring state',
    );
    expect(readTables()).toEqual(before);
  });
}

test('derived incident history does not require general external authoring', async () => {
  const fixture = await openFixture();
  const step = harness.sqlite
    .query<{ id: string }, [string]>(
      'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
    )
    .get(fixture.owner.projectId);
  if (step === null) throw new Error('fixture owner step missing');
  const authoring = mutableAuthoring('active');
  expect(
    (
      await runSemantic(
        fixture,
        (service) =>
          service.addTypedDependency(fixture.owner.projectId, fixture.principal.id, {
            ...fixture.input,
            successor: { ...fixture.owner, scope: 'node', stepId: step.id },
          }),
        undefined,
        authoring.port,
      )
    ).ok,
  ).toBe(true);
  expect(
    (
      await runSemantic(fixture, (service) =>
        service.create(fixture.owner.projectId, fixture.principal.id, {
          parentId: fixture.owner.workItemId,
          afterId: null,
          name: 'Derived child',
        }),
      )
    ).ok,
  ).toBe(true);
  for (const direction of ['undo', 'redo'] as const) {
    const current = mutableAuthoring('inactive');
    const replayed = await runSemantic(
      fixture,
      async (service) => {
        const reads = current.readCount();
        current.breakRead();
        const replay =
          direction === 'undo'
            ? await service.undoWithin(
                fixture.owner.projectId,
                fixture.principal.id,
                fixture.expectedAccess,
              )
            : await service.redoWithin(
                fixture.owner.projectId,
                fixture.principal.id,
                fixture.expectedAccess,
              );
        expect(current.readCount()).toBe(reads);
        return replay;
      },
      undefined,
      current.port,
    );
    expect(replayed.ok).toBe(true);
  }
});
