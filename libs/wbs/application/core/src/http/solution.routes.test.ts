import type { AuthenticatedUser } from '@wbs/contracts';
import { inMemoryStores } from '@wbs/store-memory/in-memory-source';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { expect, spyOn, test } from 'bun:test';

import { WorkPackageService } from '../module/work-package/work-package.resource';
import type { CommandCaller } from '../ports/command-access';
import type { ResourceAccess } from '../ports/organization-access';
import type { WorkPackageObservation } from '../ports/work-package-observation';
import { createLocalDependencyContext } from '../service/dependency-context';
import { bindFixtureSteps } from '../testing/bound-package-fixture';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { testClock } from '../testing/clock-fixture';
import { createLegacyWorkPackageFixture } from '../testing/legacy-work-package-fixture';
import { legacyOrganizationAccess } from '../testing/organization-access-fixture';
import { solutionRoutes } from './solution.routes';

/** Unused LIST/detail/history dependencies reject; these doubles exercise only the solution binding protocol. */
function createObservation(
  readSolution: WorkPackageObservation['readSolution'],
): WorkPackageObservation {
  return {
    checkRead: () => Promise.reject(new Error('unexpected solution fixture admission')),
    captureSavedPlan: () =>
      Promise.reject(new Error('unused saved-plan capture in ordinary route fixture')),
    captureSavedCurrent: () =>
      Promise.reject(new Error('unused current comparison observation in this route model')),
    readSaved: () => Promise.reject(new Error('unused saved byte observation in this route model')),
    listSaved: () => Promise.reject(new Error('unexpected solution fixture saved shelf')),
    list: () => Promise.reject(new Error('unexpected solution fixture list')),
    read: () => Promise.reject(new Error('unexpected solution fixture detail')),
    readSolution,
    readHistory: () => Promise.reject(new Error('unexpected solution fixture history')),
  };
}
/** Explicit legacy route model; it does not represent current memory Source authority. */
function createLegacyObservation(workPackages: WorkPackageService): WorkPackageObservation {
  return createObservation(async (caller, slug) => {
    if (caller.kind !== 'human' || caller.expectedAccess.kind !== 'legacy')
      throw new Error('unexpected scoped solution unit caller');
    return {
      ok: true,
      value: await workPackages.readBySolutionSlugWithin(slug, caller.expectedAccess),
    };
  });
}

const input = {
  params: { slug: 'linked' },
  query: undefined,
  body: undefined,
  principal: { id: 'reader', username: 'reader', scopes: ['read'] as const },
  request: {
    method: 'GET',
    url: new URL('https://example.com/plans/by-solution/linked'),
    headers: new Headers(),
    signal: new AbortController().signal,
  },
};

test('direct solution binding reads the exact slug and complete work package with ordered steps', async () => {
  const fixture = await createLegacyWorkPackageFixture('owner', 'route-legacy', 'route-parent');
  const store = fixture.workPackages;
  const workPackage = workPackageRow({
    projectId: 'route-parent',
    id: 'work_package',
    restricted: true,
    solutionRef: { slug: 'linked', url: 'https://example.com/linked' },
  });
  const steps = [
    {
      id: 'z-build',
      workPackageId: 'work_package',
      name: 'Build',
      position: 30,
      code: 'build',
      allowancePercent: 0,
      estimateUnit: 'workdays' as const,
    },
    {
      id: 'a-research',
      workPackageId: 'work_package',
      name: 'Research',
      position: 10,
      code: 'research',
      allowancePercent: 12.5,
      estimateUnit: 'minutes' as const,
    },
    {
      id: 'm-review',
      workPackageId: 'work_package',
      name: 'Review',
      position: 20,
      code: 'review',
      allowancePercent: 5,
      estimateUnit: 'workdays' as const,
    },
  ];
  await bindFixtureSteps(
    fixture.source,
    'route-legacy',
    [
      {
        definition: {
          id: 'a-research',
          code: 'research',
          name: 'Research',
          position: 1,
          defaultEstimateUnit: 'minutes',
          defaultAllowancePercent: 12.5,
        },
        binding: {
          bindingId: 'solution-research',
          scopeKind: 'project',
          scopeId: 'route-parent',
          position: 10,
          workItemTypeId: null,
        },
      },
      {
        definition: {
          id: 'm-review',
          code: 'review',
          name: 'Review',
          position: 2,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 5,
        },
        binding: {
          bindingId: 'solution-review',
          scopeKind: 'project',
          scopeId: 'route-parent',
          position: 20,
          workItemTypeId: null,
        },
      },
      {
        definition: {
          id: 'z-build',
          code: 'build',
          name: 'Build',
          position: 3,
          defaultEstimateUnit: 'workdays',
          defaultAllowancePercent: 0,
        },
        binding: {
          bindingId: 'solution-build',
          scopeKind: 'organization',
          scopeId: 'route-legacy',
          position: 30,
          workItemTypeId: null,
        },
      },
    ],
    { at: 1, by: 'owner' },
  );
  await store.create(workPackage, [], { at: 1, by: 'owner' });
  const [endpoint] = solutionRoutes(
    createLegacyObservation(
      new WorkPackageService({
        dependencyContext: createLocalDependencyContext(fixture.source.stores),
        clock: testClock,
        workPackages: store,
        broadcast: recordingBroadcaster(),
      }),
    ),
    legacyOrganizationAccess,
  );
  expect(await endpoint.handle(input)).toEqual({
    ok: true,
    status: 200,
    body: { workPackage, steps },
  });
  expect(await endpoint.handle({ ...input, params: { slug: 'other' } })).toEqual({
    ok: false,
    status: 404,
    body: { error: 'not_found' },
  });
});

test('direct solution binding preserves unknown work package and step store failures', async () => {
  const store = (await createLegacyWorkPackageFixture('owner', 'route-legacy', 'route-parent'))
    .workPackages;
  await store.create(
    workPackageRow({
      projectId: 'route-parent',
      id: 'work_package',
      solutionRef: { slug: 'linked', url: 'https://example.com' },
    }),
    [],
    { at: 1, by: 'owner' },
  );
  const [endpoint] = solutionRoutes(
    createLegacyObservation(
      new WorkPackageService({
        dependencyContext: createLocalDependencyContext({
          ...inMemoryStores(),
          workPackages: store,
        }),
        clock: testClock,
        workPackages: store,
        broadcast: recordingBroadcaster(),
      }),
    ),
    legacyOrganizationAccess,
  );
  for (const method of ['findBySolutionSlug', 'stepsOf'] as const) {
    const failure = new Error(`${method} unavailable`);
    const fault = spyOn(store, method).mockRejectedValue(failure);
    try {
      expect(await endpoint.handle(input).catch((cause: unknown) => cause)).toBe(failure);
    } finally {
      fault.mockRestore();
    }
  }
});

test('retains the complete solution principal before initial admission and forwards its expected access', async () => {
  const authentication = { kind: 'first_party' as const, issuedAt: 1 };
  const scopes: AuthenticatedUser['scopes'][number][] = ['read', 'write'];
  const principal: AuthenticatedUser = {
    id: 'reader',
    username: 'Reader',
    scopes,
    authentication,
  };
  const retained: AuthenticatedUser = {
    ...structuredClone(principal),
    organizationOperation: { kind: 'read', expected: { kind: 'absent' } },
  };
  const expectedAccess: ResourceAccess = {
    kind: 'scoped',
    principal: { id: 'reader' },
    scope: { organizationId: 'route-organization', userId: 'reader', cap: null },
  };
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  let observed: { readonly caller: CommandCaller; readonly slug: string } | undefined;
  const [endpoint] = solutionRoutes(
    createObservation((caller, slug) => {
      observed = { caller, slug };
      return Promise.resolve({ ok: true, value: null });
    }),
    {
      async resolve() {
        entered.resolve(undefined);
        await released.promise;
        return { ok: true, access: expectedAccess };
      },
    },
  );
  const reading = endpoint.handle({ ...input, principal });
  try {
    await entered.promise;
    principal.id = 'changed';
    authentication.issuedAt = 99;
    scopes.splice(0, scopes.length, 'editor');
  } finally {
    released.resolve(undefined);
  }
  expect(await reading).toEqual({ ok: false, status: 404, body: { error: 'not_found' } });
  expect(observed).toEqual({
    caller: { kind: 'human', principal: retained, expectedAccess },
    slug: 'linked',
  });
});

test('forwards initial solution membership refusal without observing and later context refusal exactly', async () => {
  let calls = 0;
  const observation = createObservation(() => {
    calls++;
    return Promise.resolve({ ok: false, refusal: 'organization_context_changed' });
  });
  const [initial] = solutionRoutes(observation, {
    resolve: () => Promise.resolve({ ok: false, refusal: 'not_a_member' }),
  });
  expect(await initial.handle(input)).toEqual({
    ok: false,
    status: 403,
    body: { error: 'not_a_member' },
  });
  expect(calls).toBe(0);
  const [later] = solutionRoutes(observation, legacyOrganizationAccess);
  expect(await later.handle(input)).toEqual({
    ok: false,
    status: 409,
    body: { error: 'organization_context_changed' },
  });
  expect(calls).toBe(1);
});

test('preserves exact unknown initial and observed solution failures', async () => {
  const failure = new Error('solution observation unavailable');
  const observation = createObservation(() => Promise.reject(failure));
  const [later] = solutionRoutes(observation, legacyOrganizationAccess);
  expect(await later.handle(input).catch((cause: unknown) => cause)).toBe(failure);
  const [initial] = solutionRoutes(observation, { resolve: () => Promise.reject(failure) });
  expect(await initial.handle(input).catch((cause: unknown) => cause)).toBe(failure);
});
