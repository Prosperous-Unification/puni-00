import type { Permission } from '@wbs/domain';
import { inMemoryStores } from '@wbs/store-memory/in-memory-source';
import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { inMemorySteps } from '@wbs/store-memory/step-fixture';
import { ownTestSource } from '@wbs/store-memory/testing/owned-source-fixture';
import { inMemoryTypedDependencies } from '@wbs/store-memory/typed-dependency-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { expect, test } from 'bun:test';

import { createWorkingPlan } from '../module/plan-commands/working-plan.resource';
import { StepService } from '../module/step/step.resource';
import type { AccessDecisions } from '../ports/access-decisions';
import { createLocalDependencyContext } from '../service/dependency-context';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { testClock } from '../testing/clock-fixture';
import { localCommandAccess } from '../testing/organization-access-fixture';
import { type RecoveryWriteBoundary, runRecoveryWrite } from './recovery-write';

/** Named subjects/scopes used by the fake owner; no legacy role implies a grant. */
const stepAccessDecisions: AccessDecisions = {
  packageTargetOf: (id, organizationId) => {
    if (organizationId !== 'org-a' || !['work_package', 'granted', 'other'].includes(id))
      throw new Error('unexpected step fixture target address');
    return Promise.resolve({
      kind: 'work_package',
      chain: {
        level: 'work_package',
        organizationId,
        spaceId: null,
        projectId: 'step-parent',
        workPackageId: id,
      },
      restricted: false,
    });
  },
  effectiveRoleAt: (principal, target) => {
    if (
      principal.id !== 'sam' ||
      target.kind !== 'work_package' ||
      target.chain.organizationId !== 'org-a'
    )
      throw new Error('unexpected step fixture grant subject/scope');
    const permissions = new Set<Permission>(['package.read']);
    if (target.chain.workPackageId === 'work_package' || target.chain.workPackageId === 'granted')
      permissions.add('package.write');
    else if (target.chain.workPackageId !== 'other')
      throw new Error('unexpected step fixture package');
    return Promise.resolve({ permissions, via: [] });
  },
  readablePackageIds: () => Promise.reject(new Error('step fixture does not list packages')),
};

test('publishes a granted dependent write only after its unit of work commits', async () => {
  const order: string[] = [];
  let held: RecoveryWriteBoundary['announcements'] | null = null;
  const boundary = {
    commandAccess: localCommandAccess,
    uow: {
      run: async (act: (scope: unknown) => Promise<{ value: { ok: boolean } }>) => {
        const decision = await act({
          stores: {
            typedDependencies: inMemoryTypedDependencies(),
            workPackages: {
              findInOrganization: (id: string) =>
                Promise.resolve(workPackageRow({ id, projectId: 'step-parent' })),
            },
            accessDecisions: stepAccessDecisions,
          },
        });
        order.push('commit');
        return decision.value;
      },
    },
    batch: (_scope: unknown, broadcast: RecoveryWriteBoundary['announcements']) => {
      held = broadcast;
      return {};
    },
    announcements: {
      publish: () => {
        order.push('publish');
        return Promise.resolve();
      },
      latestSeq: () => Promise.resolve(-1),
    },
  } as unknown as RecoveryWriteBoundary;
  expect(
    await runRecoveryWrite<{ ok: true } | { ok: false; reason: 'not_found' | 'forbidden' }>(
      boundary,
      {
        principal: { id: 'sam' },
        kind: 'scoped',
        scope: { cap: null, organizationId: 'org-a', userId: 'sam' },
      },
      'work_package',
      { id: 'sam', username: 'sam', scopes: ['write'] },
      { step: 'add' },
      async () => {
        const broadcast = held;
        if (broadcast === null) throw new Error('batch did not receive a broadcaster');
        await broadcast.publish('work_package', { type: 'step_removed', stepId: 'step' });
        order.push('write');
        return { ok: true };
      },
      (reason) => ({ ok: false, reason }),
    ),
  ).toEqual({ ok: true });
  expect(order).toEqual(['write', 'commit', 'publish']);
});

test('scoped step service preserves exact grant scope actor coherence and working-plan lifetime', async () => {
  const fixture = openMemorySourceFixture();
  ownTestSource(fixture.source);
  fixture.addOrganization('org-a', { legacy: false });
  await fixture.source.stores.users.create(
    { id: 'owner', username: 'Owner', passwordHash: null, createdAt: 1 },
    { at: 1, by: 'owner' },
  );
  fixture.setPackageCreationMembers('org-a', ['owner']);
  fixture.seedPackageParent({
    spaceId: null,
    spacePosition: null,
    id: 'step-parent',
    organizationId: 'org-a',
    name: 'Step parent',
    createdBy: 'owner',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
  });
  const workPackages = fixture.source.stores.workPackages;
  await workPackages.createInOrganization(
    workPackageRow({ id: 'granted', projectId: 'step-parent', restricted: true }),
    [],
    { at: 1, by: 'owner' },
    'org-a',
    { id: crypto.randomUUID(), auditId: crypto.randomUUID() },
  );
  await workPackages.createInOrganization(
    workPackageRow({ id: 'other', projectId: 'step-parent', restricted: true }),
    [],
    { at: 1, by: 'owner' },
    'org-a',
    { id: crypto.randomUUID(), auditId: crypto.randomUUID() },
  );
  const stored = inMemorySteps([]);
  const access = {
    principal: { id: 'sam' },
    kind: 'scoped' as const,
    scope: { cap: null, organizationId: 'org-a', userId: 'sam', role: 'super_admin' as const },
  };
  const stores = {
    ...inMemoryStores(),
    workPackages,
    steps: stored,
    accessDecisions: stepAccessDecisions,
  };
  const plan = createWorkingPlan({ stores }, 'granted');
  let retained: StepService | undefined;
  const boundary = {
    commandAccess: localCommandAccess,
    uow: {
      run: async (act: (scope: unknown) => Promise<{ value: { ok: boolean } }>) => {
        try {
          return (await act({ stores })).value;
        } finally {
          plan.close();
        }
      },
    },
    batch: (_scope: unknown, broadcast: RecoveryWriteBoundary['announcements']) => {
      const service = new StepService({
        accessDecisions: plan.stores.accessDecisions,
        workPackages,
        steps: stored,
        broadcast,
        clock: testClock,
        dependencyContext: createLocalDependencyContext({ ...inMemoryStores(), workPackages }),
      });
      retained = service;
      return { steps: service };
    },
    announcements: recordingBroadcaster(),
  } as unknown as RecoveryWriteBoundary;
  await runRecoveryWrite<{ ok: true } | { ok: false }>(
    boundary,
    access,
    'granted',
    { id: 'sam', username: 'sam', scopes: ['write'] },
    { step: 'add' },
    async (services) => {
      expect(
        await services.steps.addWithin('other', 'sam', 'Wrong work package', 0, undefined, access),
      ).toEqual({ ok: false, reason: 'forbidden', permission: 'package.write' });
      expect(
        await services.steps
          .addWithin('granted', 'other-actor', 'Wrong actor', 0, undefined, access)
          .then(
            () => 'unexpected success',
            (failure: unknown) => (failure instanceof Error ? failure.message : failure),
          ),
      ).toContain('principal differs');
      return { ok: true as const };
    },
    () => ({ ok: false as const }),
  );
  if (retained === undefined) throw new Error('batch did not build a step service');
  expect(
    await retained.addWithin('granted', 'sam', 'Expired', 0, undefined, access).then(
      () => 'unexpected success',
      (failure: unknown) => (failure instanceof Error ? failure.message : failure),
    ),
  ).toContain('closed');
  expect(await stored.listByWorkPackage('granted')).toEqual([]);
  expect(await stored.listByWorkPackage('other')).toEqual([]);
});
