import type { AuthenticatedUser } from '@wbs/contracts';
import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { expect, spyOn, test } from 'bun:test';

import { servicesOver } from '../compose';
import type { WorkPackageOpening } from '../module/work-package/work-package-opening';
import { LEGACY_EDIT_ADMISSION } from '../ports/edit-admission';
import type { OrganizationAccess, ResourceAccess } from '../ports/organization-access';
import type { PlanExportReader } from '../ports/plan-export-reader';
import type { WorkPackageObservation } from '../ports/work-package-observation';
import type { WorkPackageRead } from '../ports/work-package-read';
import { createLocalDependencyContext } from '../service/dependency-context';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { testClock } from '../testing/clock-fixture';
import { seedLegacyPackageParent } from '../testing/legacy-package-source-fixture';
import { legacyOrganizationAccess } from '../testing/organization-access-fixture';
import { fastScheduler } from '../testing/scheduler-fixture';
import { EMPTY } from './endpoint';
import { workPackageRoutes } from './work-package.routes';

const principal: AuthenticatedUser = { id: 'owner', username: 'Owner', scopes: ['read', 'write'] };
const request = {
  method: 'POST',
  url: new URL('http://localhost/api/work-packages'),
  headers: new Headers(),
  signal: new AbortController().signal,
};

async function fixture() {
  const owned = openMemorySourceFixture();
  await owned.source.stores.users.create(
    { id: principal.id, username: principal.username, passwordHash: null, createdAt: 1 },
    { at: 1, by: principal.id },
  );
  seedLegacyPackageParent(owned, {
    organizationId: 'route-legacy',
    projectId: 'route-parent',
    creator: principal.id,
  });
  return servicesOver(owned.source.stores, {
    dependencyContext: createLocalDependencyContext(owned.source.stores),
    admission: LEGACY_EDIT_ADMISSION,
    clock: testClock,
    broadcast: recordingBroadcaster(),
    scheduler: fastScheduler,
  });
}
/** Legacy binding unit model; current SQLite mode/grant semantics belong to the real observation owner. */
function createLegacyObservation(workPackages: WorkPackageRead): WorkPackageObservation {
  return {
    checkRead: () => Promise.reject(new Error('unexpected package admission in package binding')),
    captureSavedCurrent: () =>
      Promise.reject(new Error('unused current comparison observation in this route model')),
    readSaved: () => Promise.reject(new Error('unused saved byte observation in this route model')),
    listSaved: () => Promise.reject(new Error('unexpected saved shelf in package binding')),
    async list(caller) {
      if (caller.kind !== 'human' || caller.expectedAccess.kind !== 'legacy')
        throw Error('unexpected scoped route unit caller');
      return {
        ok: true,
        value: await workPackages.listWithin(caller.principal.id, caller.expectedAccess),
      };
    },
    async read(caller, id) {
      if (caller.kind !== 'human' || caller.expectedAccess.kind !== 'legacy')
        throw Error('unexpected scoped route unit caller');
      return { ok: true, value: await workPackages.readWithin(id, caller.expectedAccess) };
    },
    readSolution: () =>
      Promise.reject(new Error('unexpected solution observation in package binding')),
    readHistory: () =>
      Promise.reject(new Error('unexpected history observation in package binding')),
  };
}
const unusedExports: PlanExportReader = {
  readExport: () => Promise.reject(new Error('unexpected export capture')),
};

test('direct work package bindings create, read, patch and record opening with admitted actor', async () => {
  const { workPackages, workItems } = await fixture();
  const endpoints = workPackageRoutes(
    {
      authorizeRetry: (...args) => workPackages.authorizeRetry(...args),
      createWithin: (name, projectId, actor, access, abbreviation) =>
        workPackages.createWithin(name, projectId, actor.id, access, abbreviation),
      async openWithin(id, actor, access) {
        if (access.kind !== 'legacy') throw Error('unexpected scoped opening in legacy binding');
        return (await workPackages.openWithin(id, actor.id, access))
          ? { ok: true }
          : { ok: false, reason: 'not_found' };
      },
      updateWithin: (id, actor, patch, access) =>
        workPackages.updateWithin(id, actor.id, patch, access),
    },
    legacyOrganizationAccess,
    workItems,
    { now: () => 0 },
    unusedExports,
    createLegacyObservation(workPackages),
  );
  const made = await endpoints[0].handle({
    params: {},
    query: undefined,
    body: { name: 'Plan', projectId: 'route-parent' },
    principal,
    request,
  });
  if (!made.ok) throw new Error('create refused');
  expect(made.status).toBe(200);
  expect(made.body.workPackage.projectId).toBe('route-parent');
  expect(made.body.workPackage.name).toBe('Plan');
  expect(made.body.steps.map((step) => step.name)).toEqual(['Dev', 'QA']);
  const input = {
    params: { id: made.body.workPackage.id },
    query: undefined,
    body: undefined,
    principal,
    request,
  };
  // The read carries the work package's zone, `UTC` until set (`step-node-attempts` D3).
  expect(await endpoints[4].handle(input)).toEqual({
    ok: true,
    status: 200,
    body: { ...made.body, workPackage: { ...made.body.workPackage, timezone: 'UTC' } },
  });
  expect(await endpoints[2].handle(input)).toEqual({ ok: true, status: 204, body: EMPTY });
  const patched = await endpoints[5].handle({ ...input, body: { name: 'Renamed' } });
  if (!patched.ok) throw new Error('patch refused');
  expect(patched.body.workPackage.name).toBe('Renamed');
  expect(await endpoints[2].handle({ ...input, params: { id: 'missing' } })).toEqual({
    ok: false,
    status: 404,
    body: { error: 'not_found' },
  });
});

test('direct work package and export failures propagate without conversion to not_found', async () => {
  const { workPackages, workItems } = await fixture();
  const failure = new Error('work package store unavailable');
  const exportFailure: PlanExportReader = { readExport: () => Promise.reject(failure) };
  const endpoints = workPackageRoutes(
    {
      authorizeRetry: (...args) => workPackages.authorizeRetry(...args),
      createWithin: (name, projectId, actor, access, abbreviation) =>
        workPackages.createWithin(name, projectId, actor.id, access, abbreviation),
      async openWithin(id, actor, access) {
        if (access.kind !== 'legacy') throw Error('unexpected scoped opening in legacy binding');
        return (await workPackages.openWithin(id, actor.id, access))
          ? { ok: true }
          : { ok: false, reason: 'not_found' };
      },
      updateWithin: (id, actor, patch, access) =>
        workPackages.updateWithin(id, actor.id, patch, access),
    },
    legacyOrganizationAccess,
    workItems,
    { now: () => 0 },
    exportFailure,
    createLegacyObservation(workPackages),
  );
  const read = spyOn(workPackages, 'readWithin').mockRejectedValue(failure);
  try {
    const input = { params: { id: 'p' }, query: undefined, body: undefined, principal, request };
    expect(await endpoints[4].handle(input).catch((cause: unknown) => cause)).toBe(failure);
    expect(
      await endpoints[3]
        .handle({ ...input, query: { format: 'json' } })
        .catch((cause: unknown) => cause),
    ).toBe(failure);
  } finally {
    read.mockRestore();
  }
});

/** Uses real legacy route dependencies; only the new purpose delegate is observed here. */
async function createOpeningEndpoint(
  openWithin: WorkPackageOpening['openWithin'],
  organizations: OrganizationAccess,
) {
  const { workPackages, workItems } = await fixture();
  return workPackageRoutes(
    {
      authorizeRetry: (...args) => workPackages.authorizeRetry(...args),
      createWithin: (name, projectId, actor, access, abbreviation) =>
        workPackages.createWithin(name, projectId, actor.id, access, abbreviation),
      updateWithin: (id, actor, patch, access) =>
        workPackages.updateWithin(id, actor.id, patch, access),
      openWithin,
    },
    organizations,
    workItems,
    { now: () => 0 },
    unusedExports,
    createLegacyObservation(workPackages),
  )[2];
}

test('retains nested OPEN caller evidence before initial organization resolution and forwards its exact mutation expectation', async () => {
  const authentication = { kind: 'first_party' as const, issuedAt: 1 };
  const scopes: AuthenticatedUser['scopes'][number][] = ['read', 'write'];
  const organizationBinding = {
    credential: {
      kind: 'native' as const,
      userId: 'reader',
      digest: 'verified-digest',
      expiresAt: 1000,
    },
    cookie: 'selected-cookie',
  };
  const actor: AuthenticatedUser = {
    id: 'reader',
    username: 'Reader',
    authentication,
    scopes,
    organizationBinding,
  };
  const expected: AuthenticatedUser = {
    ...structuredClone(actor),
    organizationOperation: { kind: 'mutation', expected: { kind: 'absent' } },
  };
  const access: ResourceAccess = {
    kind: 'scoped',
    principal: { id: 'reader' },
    scope: { organizationId: 'route-org', userId: 'reader', cap: null },
  };
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  let captured:
    | {
        id: string;
        actor: AuthenticatedUser;
        access: ResourceAccess;
      }
    | undefined;
  const endpoint = await createOpeningEndpoint(
    (id, retained, resolved) => {
      captured = { id, actor: structuredClone(retained), access: resolved };
      return Promise.resolve({ ok: true });
    },
    {
      async resolve() {
        entered.resolve(undefined);
        await released.promise;
        return { ok: true, access };
      },
    },
  );
  const observed = endpoint
    .handle({
      params: { id: 'route-package' },
      body: undefined,
      query: undefined,
      principal: actor,
      request,
    })
    .then(
      (value) => ({ ok: true as const, value }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
  let primary: { cause: unknown } | undefined;
  let primaryOwnsPending = false;
  try {
    const entry = await Promise.race([
      entered.promise.then(() => ({ entered: true as const })),
      observed.then((settled) => ({ entered: false as const, settled })),
    ]);
    if (!entry.entered) {
      if (!entry.settled.ok) {
        primaryOwnsPending = true;
        throw entry.settled.cause;
      }
      throw Error('OPEN route settled before initial resolution entry');
    }
    actor.id = 'top-level-copy-is-not-the-necessity-witness';
    authentication.issuedAt = 99;
    organizationBinding.cookie = 'changed-cookie';
    organizationBinding.credential.expiresAt = 1;
    scopes.splice(0, scopes.length, 'editor');
  } catch (cause) {
    primary = { cause };
  }
  released.resolve(undefined);
  const settled = await observed;
  if (primary !== undefined) {
    if (!settled.ok && !primaryOwnsPending)
      throw new AggregateError(
        [primary.cause, settled.cause],
        'OPEN route entry and settlement failed',
        { cause: primary.cause },
      );
    throw primary.cause;
  }
  if (!settled.ok) throw settled.cause;
  expect(settled.value).toEqual({ ok: true, status: 204, body: EMPTY });
  expect(captured).toEqual({ id: 'route-package', actor: expected, access });
});

test('forwards OPEN current refusal, hidden target and exact unknown failure without a legacy fallback', async () => {
  const input = {
    params: { id: 'route-package' },
    query: undefined,
    body: undefined,
    principal,
    request,
  };
  for (const [refusal, expected] of [
    ['not_a_member', { ok: false, status: 403, body: { error: 'not_a_member' } }],
    [
      'organization_context_changed',
      { ok: false, status: 409, body: { error: 'organization_context_changed' } },
    ],
  ] as const) {
    let called = 0;
    const endpoint = await createOpeningEndpoint(() => {
      called++;
      return Promise.resolve({ ok: false, refusal });
    }, legacyOrganizationAccess);
    expect(await endpoint.handle(input)).toEqual(expected);
    expect(called).toBe(1);
  }
  const insufficient = await createOpeningEndpoint(
    () => Promise.resolve({ ok: false, error: 'insufficient_scope' }),
    legacyOrganizationAccess,
  );
  expect(await insufficient.handle(input)).toEqual({
    ok: false,
    status: 403,
    body: { error: 'insufficient_scope' },
  });
  const missing = await createOpeningEndpoint(
    () => Promise.resolve({ ok: false, reason: 'not_found' }),
    legacyOrganizationAccess,
  );
  expect(await missing.handle(input)).toEqual({
    ok: false,
    status: 404,
    body: { error: 'not_found' },
  });
  for (const cause of [Error('opening authority unreadable'), undefined]) {
    const endpoint = await createOpeningEndpoint(
      () =>
        Promise.resolve().then(() => {
          const thrown: unknown = cause;
          throw thrown;
        }),
      legacyOrganizationAccess,
    );
    const failure = await endpoint.handle(input).then(
      () => ({ rejected: false as const }),
      (caught: unknown) => ({ rejected: true as const, caught }),
    );
    expect(failure.rejected).toBe(true);
    if (!failure.rejected) throw Error('OPEN failure became a reply');
    expect(failure.caught).toBe(cause);
  }
});
