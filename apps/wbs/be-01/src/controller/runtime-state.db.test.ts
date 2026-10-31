import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AuthenticatedUser } from '@wbs/contracts';
import { servicesOver } from '@wbs/core/compose';
import {
  createPlanCommandRunner,
  createRuntimeState,
} from '@wbs/core/module/plan-commands/composition';
import {
  digestRuntimeBasis,
  type RuntimeContext,
  type RuntimeObservation,
} from '@wbs/core/module/plan-commands/runtime-state';
import { CREATOR_ADMISSION } from '@wbs/core/ports/edit-admission';
import type { ResourceAccess } from '@wbs/core/ports/organization-access';
import type { Decision, Scope, UnitOfWork } from '@wbs/core/ports/unit-of-work';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { openSqliteSource } from '@wbs/store-sqlite/source';
import { openSpaceDatabase } from '@wbs/store-sqlite/testing/space-database';
import { afterEach, describe, expect, it } from 'bun:test';

import { nodeDigest } from '../runtime/bun-runtime';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from '../testing/organization-limits-fixture';

const actor: AuthenticatedUser = { id: 'ada', username: 'ada', scopes: ['read', 'write'] };
const access: ResourceAccess = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
};
const context: RuntimeContext = { actor, access, projectId: 'a1', personId: 'agent' };
const stamp = { at: 2, by: 'ada' };
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function seeded() {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-runtime-observation-'));
  const dbPath = await openSpaceDatabase(directory);
  const sqlite = openSqliteSource({
    dbPath,
    organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
  });
  const source = sqlite.bindLivePlans({
    schedulerOf: () => {
      throw new Error('runtime read invoked scheduler');
    },
  });
  cleanups.push(async () => {
    await source.close();
    rmSync(directory, { recursive: true, force: true });
  });
  sqlite.db.run(
    `INSERT INTO organization_membership (organization_id,user_id,role,created_at) VALUES ('org-a','ada','member',1)`,
  );
  await source.stores.directory.addPerson({ id: 'agent', name: 'Agent', kind: 'agent' }, [], stamp);
  await source.stores.directory.mapInOrganization('people', 'agent', 'org-a', 'Agent');
  expect(
    await source.stores.directory.patchPerson('agent', { accountId: 'ada' }, stamp),
  ).toMatchObject({ ok: true });
  await source.stores.steps.add(
    {
      id: 'dev',
      projectId: 'a1',
      name: 'Dev',
      code: 'dev',
      allowancePercent: 0,
      estimateUnit: 'workdays',
    },
    stamp,
  );
  await source.stores.workItems.insert(workItemRow({ id: 'leaf', projectId: 'a1' }), [], stamp);
  await source.stores.directory.addExternalSystem({ id: 'runtime-pr', name: 'Runtime PR' }, stamp);
  const broadcast = recordingBroadcaster();
  const options = {
    admission: CREATOR_ADMISSION,
    clock: testClock,
    broadcast,
    scheduler: fastScheduler,
  };
  const graph = servicesOver(source.stores, options);
  const runner = createPlanCommandRunner({
    uow: source.uow,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope, announcements) =>
      servicesOver(scope.stores, { ...options, broadcast: announcements }),
  });
  const runtime = createRuntimeState(source.uow);
  const observe = async (): Promise<RuntimeObservation> => {
    const observation = await runtime.captureRuntimeObservation(context);
    if ('ok' in observation) throw new Error(`runtime refused: ${observation.reason}`);
    return observation;
  };
  const basis = async () => {
    const observation = await observe();
    return digestRuntimeBasis(
      {
        ledgerId: 'trusted-ledger',
        organizationId: observation.scope.organizationId,
        projectId: observation.scope.projectId,
        projectRevision: observation.projectRevision,
        workItems: observation.workItems,
      },
      nodeDigest,
    );
  };
  return { sqlite, source, runner, runtime, observe, basis };
}

describe('admitted runtime observation', () => {
  it('reads complete local rows and steps with server scope and real digest', async () => {
    const { observe, basis, sqlite, source } = await seeded();
    sqlite.db.run(
      `INSERT INTO work_item_external_ref (id, work_item_id, system_id, url, name, position) VALUES ('ref','leaf','runtime-pr','https://github.com/example/repo/pull/1','PR',0)`,
    );
    await source.stores.workItems.insert(
      workItemRow({ id: 'child', projectId: 'a1', parentId: 'leaf' }),
      [],
      stamp,
    );
    await source.stores.workItems.insert(
      workItemRow({ id: 'foreign-row', projectId: 'b1' }),
      [],
      stamp,
    );
    const observation = await observe();
    expect(observation.scope).toEqual({
      organizationId: 'org-a',
      projectId: 'a1',
      personId: 'agent',
    });
    expect([...observation.workItems].sort((left, right) => (left.id < right.id ? -1 : 1))).toEqual(
      [
        { id: 'child', parentId: 'leaf', revision: 0, externalRefs: [] },
        {
          id: 'leaf',
          parentId: null,
          revision: 0,
          externalRefs: [
            {
              id: 'ref',
              systemId: 'runtime-pr',
              url: 'https://github.com/example/repo/pull/1',
              name: 'PR',
            },
          ],
        },
      ],
    );
    expect(observation.workItems).toHaveLength(2);
    expect(observation.steps).toEqual([{ id: 'dev', code: 'dev', position: 10 }]);
    expect(await basis()).toMatch(/^rb1:[0-9a-f]{64}$/);
    expect(
      await digestRuntimeBasis(
        {
          ledgerId: 'ledger-a',
          organizationId: 'org-a',
          projectId: 'project-a',
          projectRevision: 2,
          workItems: [
            { id: 'b', revision: 4 },
            { id: 'a', revision: 3 },
          ],
        },
        nodeDigest,
      ),
    ).toBe('rb1:4888e63baed32cb0eb96fafb546a0f09a69f40cb2c7c7ede4847af251368186d');
  });

  it('refuses legacy, foreign project, unknown person and an unbound person', async () => {
    const { runtime, source } = await seeded();
    expect(
      await runtime.captureRuntimeObservation({ ...context, access: { kind: 'legacy' } }),
    ).toEqual({ ok: false, reason: 'runtime_scope_unavailable' });
    expect(await runtime.captureRuntimeObservation({ ...context, projectId: 'b1' })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await runtime.captureRuntimeObservation({ ...context, personId: 'absent' })).toEqual({
      ok: false,
      reason: 'unknown_person',
    });
    await source.stores.directory.patchPerson('agent', { accountId: null }, stamp);
    expect(await runtime.captureRuntimeObservation(context)).toEqual({
      ok: false,
      reason: 'person_not_bound',
    });
  });

  it('refuses a foreign person even when bound to the actor and otherwise authorized', async () => {
    const { runtime, source } = await seeded();
    await source.stores.directory.addPerson(
      { id: 'foreign', name: 'Foreign', kind: 'agent' },
      [],
      stamp,
    );
    expect(
      await source.stores.directory.patchPerson('foreign', { accountId: 'ada' }, stamp),
    ).toMatchObject({ ok: true });
    await source.stores.directory.mapInOrganization('people', 'foreign', 'org-b', 'Foreign');
    expect(await runtime.captureRuntimeObservation({ ...context, personId: 'foreign' })).toEqual({
      ok: false,
      reason: 'unknown_person',
    });
  });

  it('refuses a removed member despite valid project and bound person', async () => {
    const { runtime, sqlite } = await seeded();
    sqlite.db.run(
      `DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id='ada'`,
    );
    expect(await runtime.captureRuntimeObservation(context)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('refuses current viewer membership even with a stale member context', async () => {
    const { runtime, sqlite } = await seeded();
    sqlite.db.run(
      `UPDATE organization_membership SET role='viewer' WHERE organization_id='org-a' AND user_id='ada'`,
    );
    expect(await runtime.captureRuntimeObservation(context)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('uses the admitted current role after a queued admin is demoted to member', async () => {
    const { source, runtime, sqlite } = await seeded();
    await source.stores.directory.patchPerson('agent', { accountId: null }, stamp);
    sqlite.db.run(
      `UPDATE organization_membership SET role='admin' WHERE organization_id='org-a' AND user_id='ada'`,
    );
    const staleAdmin: RuntimeContext = {
      ...context,
      access: { kind: 'scoped', scope: { organizationId: 'org-a', userId: 'ada', role: 'admin' } },
    };
    expect(await runtime.captureRuntimeObservation(staleAdmin)).toHaveProperty(
      'scope.personId',
      'agent',
    );
    const reached = Promise.withResolvers<undefined>();
    const released = Promise.withResolvers<undefined>();
    const demotion = source.uow.run(async () => {
      sqlite.db.run(
        `UPDATE organization_membership SET role='member' WHERE organization_id='org-a' AND user_id='ada'`,
      );
      reached.resolve(undefined);
      await released.promise;
      return { commit: true, value: undefined };
    });
    await reached.promise;
    const pending = runtime.captureRuntimeObservation(staleAdmin);
    released.resolve(undefined);
    await demotion;
    expect(await pending).toEqual({ ok: false, reason: 'person_not_bound' });
  });

  it('enforces real credential pins even for an admin', async () => {
    const { source, runtime, sqlite } = await seeded();
    await source.stores.directory.addPerson(
      { id: 'other', name: 'Other', kind: 'agent' },
      [],
      stamp,
    );
    sqlite.db.run(
      `UPDATE organization_membership SET role='admin' WHERE organization_id='org-a' AND user_id='ada'`,
    );
    // A machine credential's own person is the pin (`wbs-machine-credentials` A12, A18): an
    // upstream pair pins nothing since the operator links retired.
    const pinnedTo = (personId: string): RuntimeContext => ({
      ...context,
      actor: { ...actor, authentication: { kind: 'machine', credentialId: 'key-1', personId } },
    });
    expect(await runtime.captureRuntimeObservation(pinnedTo('other'))).toEqual({
      ok: false,
      reason: 'credential_not_for_person',
    });
    expect(await runtime.captureRuntimeObservation(pinnedTo('agent'))).toHaveProperty(
      'scope.personId',
      'agent',
    );
  });

  it('throws when a required scope capability is absent', async () => {
    const { sqlite } = await seeded();
    const failure = await createRuntimeState(sqlite.uow)
      .captureRuntimeObservation(context)
      .then(
        () => null,
        (cause: unknown) => cause,
      );
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ message: 'runtime project scope resolver is missing' });
  });

  it('throws when the admitted project read contradicts fresh resolution', async () => {
    const { source } = await seeded();
    // Only the borrowed project-read boundary is broken; source admission, current
    // membership/person authorization and transaction coordination stay real.
    const broken: UnitOfWork = {
      run<T>(act: (scope: Scope) => Promise<Decision<T>>): Promise<T> {
        return source.uow.run((scope) =>
          act({
            ...scope,
            stores: {
              ...scope.stores,
              projects: new Proxy(scope.stores.projects, {
                get(target, key, receiver) {
                  if (key === 'findInOrganization') return () => Promise.resolve(null);
                  const member: unknown = Reflect.get(target, key, receiver);
                  return member;
                },
              }),
            },
          }),
        );
      },
    };
    const failure = await createRuntimeState(broken)
      .captureRuntimeObservation(context)
      .then(
        () => null,
        (cause: unknown) => cause,
      );
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ message: 'admitted runtime project disappeared' });
  });

  it('throws for unreadable local facts and malformed current role', async () => {
    const { sqlite, runtime } = await seeded();
    sqlite.db.run(`PRAGMA ignore_check_constraints=ON`);
    sqlite.db.run(
      `UPDATE organization_membership SET role='invalid-role' WHERE organization_id='org-a' AND user_id='ada'`,
    );
    const malformed = await runtime.captureRuntimeObservation(context).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(malformed).toBeInstanceOf(Error);
    sqlite.db.run(
      `UPDATE organization_membership SET role='member' WHERE organization_id='org-a' AND user_id='ada'`,
    );
    sqlite.db.run(`PRAGMA ignore_check_constraints=OFF`);
    sqlite.db.run(`ALTER TABLE step RENAME TO unavailable_step`);
    const unreadable = await runtime.captureRuntimeObservation(context).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(unreadable).toBeInstanceOf(Error);
  });

  it('changes the real basis after claim, progress, ref replacement and topology edits', async () => {
    const { runner, basis } = await seeded();
    let previous = await basis();
    for (const commands of [
      [
        {
          kind: 'claimWorkItem',
          workItemId: 'leaf',
          personId: 'agent',
          steps: ['dev'],
          runId: 'session',
        },
      ],
      [{ kind: 'setProgress', workItemId: 'leaf', stepId: 'dev', state: 'done' }],
      [
        {
          kind: 'patchWorkItem',
          workItemId: 'leaf',
          patch: {
            externalRefs: [
              {
                systemId: 'runtime-pr',
                url: 'https://github.com/example/repo/pull/2',
                name: 'PR 2',
              },
            ],
          },
        },
      ],
      [{ kind: 'createWorkItem', name: 'Other', parentId: null, afterId: 'leaf' }],
    ] as const) {
      expect(await runner.run('a1', 'ada', [...commands])).toMatchObject({ ok: true });
      const current = await basis();
      expect(current).not.toBe(previous);
      previous = current;
    }
  });

  it.each(['project', 'person', 'actor', 'organization', 'credential'])(
    'retains the original %s while queued on the real source',
    async (field) => {
      const { source, runtime, observe } = await seeded();
      const before = await observe();
      await source.stores.directory.addPerson(
        { id: 'other', name: 'Other', kind: 'agent' },
        [],
        stamp,
      );
      const mutable = {
        projectId: 'a1',
        personId: 'agent',
        actor: {
          ...actor,
          authentication: {
            kind: 'machine' as const,
            credentialId: 'key-1',
            personId: 'agent',
          },
        },
        access: {
          kind: 'scoped' as const,
          scope: { organizationId: 'org-a', userId: 'ada', role: 'member' as const },
        },
      };
      const reached = Promise.withResolvers<undefined>();
      const released = Promise.withResolvers<undefined>();
      const writer = source.uow.run(async () => {
        reached.resolve(undefined);
        await released.promise;
        return { commit: true, value: undefined };
      });
      await reached.promise;
      const pending = runtime.captureRuntimeObservation(mutable);
      switch (field) {
        case 'project':
          mutable.projectId = 'b1';
          break;
        case 'person':
          mutable.personId = 'absent';
          break;
        case 'actor':
          mutable.actor.id = 'absent';
          break;
        case 'organization':
          mutable.access.scope.organizationId = 'org-b';
          break;
        case 'credential':
          mutable.actor.authentication.personId = 'other';
          break;
        default:
          throw new Error('unknown mutation field');
      }
      released.resolve(undefined);
      await writer;
      expect(await pending).toEqual(before);
    },
  );

  it('queues behind a partly written real source transaction until rollback', async () => {
    const { source, runtime, observe } = await seeded();
    const before = await observe();
    const reached = Promise.withResolvers<undefined>();
    const released = Promise.withResolvers<undefined>();
    const writer = source.uow.run(async ({ stores }) => {
      await stores.workItems.insert(workItemRow({ id: 'staged', projectId: 'a1' }), [], stamp);
      reached.resolve(undefined);
      await released.promise;
      return { commit: false, value: undefined };
    });
    await reached.promise;
    let settled = false;
    const pending = runtime.captureRuntimeObservation(context).then((observation) => {
      settled = true;
      return observation;
    });
    let settledBeforeRelease: boolean;
    try {
      await Bun.sleep(30);
      settledBeforeRelease = settled;
    } finally {
      released.resolve(undefined);
    }
    await writer;
    expect({ settledBeforeRelease, observation: await pending }).toEqual({
      settledBeforeRelease: false,
      observation: before,
    });
  });
});
