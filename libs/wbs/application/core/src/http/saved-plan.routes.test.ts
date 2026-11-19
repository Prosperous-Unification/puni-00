import { readFileSync } from 'node:fs';

import type { AuthenticatedUser } from '@wbs/contracts';
import { buildScheduleBody, type PlanSide, projectSavedPlanInput } from '@wbs/domain';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { expect, mock, test } from 'bun:test';

import { installSavedPlans } from '../module/saved-plans/check';
import { SavedPlanResource } from '../module/saved-plans/saved-plan.resource';
import { summarizeSavedComparisonSide } from '../module/saved-plans/saved-plan-comparison';
import { UnknownSavedPlanBodyVersionError } from '../module/saved-plans/saved-plan-integrity';
import { schedulePlanInput } from '../module/saved-plans/saved-plan-schedule';
import type { CommandCaller } from '../ports/command-access';
import type { OrganizationAccess, ResourceAccess } from '../ports/organization-access';
import type { SavedPlanRow, SavedPlanWrite, StoredSavedPlan } from '../ports/saved-plan-store';
import type { SavedCurrentCapture } from '../ports/work-package-observation';
import type {
  SavedPlanReadAddress,
  WorkPackageObservation,
} from '../ports/work-package-observation';
import type { SavedPlanService } from '../service/saved-plan.service';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { connectedReads } from '../testing/connected-plan-fixture';
import { legacyOrganizationAccess } from '../testing/organization-access-fixture';
import { EMPTY } from './endpoint';
import { savedPlanRoutes } from './saved-plan.routes';
const principal: AuthenticatedUser = { id: 'actor', username: 'Ada', scopes: ['read', 'write'] };
const record: SavedPlanWrite = {
  id: 's',
  workPackageId: 'p',
  name: 'Saved',
  createdBy: 'Ada',
  createdById: 'actor',
  createdAt: 1,
  input: { schemaVersion: 1, bytes: '{ "historic": true }', sha256: 'digest' },
  schedule: { present: false, absentReason: 'future_reason' },
};
const storedRecord: StoredSavedPlan = {
  stepIdentity: { kind: 'pre_catalogue' },
  header: {
    id: 's',
    workPackageId: 'p',
    name: 'Saved',
    createdBy: 'Ada',
    createdById: 'actor',
    createdAt: 1,
    inputSchemaVersion: 1,
    inputBytes: 20,
    inputSha256: 'digest',
    scheduleSchemaVersion: null,
    scheduleBytes: null,
    scheduleSha256: null,
    scheduleInputSha256: null,
    schedulerAlgorithmId: null,
    scheduleAbsentReason: 'future_reason',
  },
  bodies: { input: '{ "historic": true }', schedule: null },
};
const direct = {
  params: { id: 'p' },
  body: {},
  query: undefined,
  principal,
  request: {
    method: 'POST',
    url: new URL('http://localhost/api/work-packages/p/saved-plans'),
    headers: new Headers(),
    signal: new AbortController().signal,
  },
};

function fixture() {
  const announcements = recordingBroadcaster();
  const workPackageRead = mock(() =>
    Promise.resolve({
      workPackage: workPackageRow({ id: 'p', projectId: 'route-parent' }),
      steps: [],
    }),
  );
  const save = mock(() => Promise.resolve({ outcome: 'saved' as const, record }));
  const list = mock(() => Promise.resolve([]));
  const read = mock(() => Promise.resolve({ outcome: 'read' as const, plan: record }));
  const compare = mock(() =>
    Promise.resolve({
      outcome: 'compared',
      diff: { input: [], schedule: [] },
    } as const),
  );
  const rename = mock(() => Promise.resolve({ outcome: 'touched' as const, workPackageId: 'p' }));
  const remove = mock(() => Promise.resolve({ outcome: 'touched' as const, workPackageId: 'p' }));
  const plans = { save, list, read, readStoredPlan: read, compare, rename, delete: remove };
  const workPackages = { readWithin: workPackageRead };
  const endpoints = savedPlanRoutes(
    plans as never,
    workPackages as never,
    announcements,
    legacyOrganizationAccess,
    {
      captureSavedCurrent: () =>
        Promise.reject(new Error('unused current capture in this saved fixture')),
      listSaved: () => Promise.reject(new Error('unused saved shelf in save/touch fixture')),
      readSaved: () =>
        Promise.resolve({ ok: true, value: { kind: 'stored', stored: storedRecord } }),
    },
  );
  return {
    endpoints,
    plans,
    workPackages,
    save,
    list,
    read,
    compare,
    rename,
    remove,
    workPackageRead,
    announcements,
  };
}

test('direct save and touch bindings pass the admitted actor and announce committed success', async () => {
  const f = fixture();
  expect(await f.endpoints[0].handle(direct)).toEqual({
    ok: true,
    status: 201,
    body: { savedPlan: record },
  });
  expect(f.save).toHaveBeenCalledWith({
    workPackageId: 'p',
    createdBy: 'Ada',
    createdById: 'actor',
    access: { kind: 'legacy' },
  });
  expect(
    await f.endpoints[4].handle({ ...direct, params: { id: 's' }, body: { name: '  ' } }),
  ).toEqual({ ok: true, status: 200, body: { savedPlanId: 's', name: '  ' } });
  expect(f.rename).toHaveBeenCalledWith('s', 'actor', '  ', {
    kind: 'legacy',
    actorId: 'actor',
    source: 'human',
    operation: 'rename',
  });
  expect(await f.endpoints[5].handle({ ...direct, params: { id: 's' }, body: undefined })).toEqual({
    ok: true,
    status: 204,
    body: EMPTY,
  });
  expect(f.remove).toHaveBeenCalledWith('s', 'actor', {
    kind: 'legacy',
    actorId: 'actor',
    source: 'human',
    operation: 'delete',
  });
  expect(f.announcements.published).toEqual(
    Array.from({ length: 3 }, () => ({
      workPackageId: 'p',
      event: { type: 'saved_plans_changed' },
    })),
  );
});

test('direct unknown service errors preserve error identity', async () => {
  const f = fixture();
  const failure = new Error('direct unavailable');
  f.read.mockRejectedValueOnce(failure);
  expect(
    await f.endpoints[3].handle({ ...direct, body: undefined }).catch((cause: unknown) => cause),
  ).toBe(failure);
});

const shelfHeader: SavedPlanRow = {
  id: 'header',
  workPackageId: 'p',
  name: 'Stored name',
  createdBy: 'Historic creator',
  createdById: 'old-account',
  createdAt: 12,
  inputSchemaVersion: 99,
  inputBytes: 23,
  inputSha256: 'unchanged-input-hash',
  scheduleSchemaVersion: null,
  scheduleBytes: null,
  scheduleSha256: null,
  scheduleInputSha256: null,
  schedulerAlgorithmId: null,
  scheduleAbsentReason: 'future-reason',
};

function createShelfEndpoint(
  listSaved: WorkPackageObservation['listSaved'],
  organizations: OrganizationAccess,
) {
  const f = fixture();
  const endpoint = savedPlanRoutes(
    f.plans as never,
    f.workPackages as never,
    f.announcements,
    organizations,
    {
      captureSavedCurrent: () =>
        Promise.reject(new Error('unused current capture in this saved fixture')),
      listSaved,
      readSaved: () => Promise.reject(Error('unused saved byte observation in shelf fixture')),
    },
  )[1];
  return { ...f, endpoint };
}

test('direct shelf projects detached headers in supplied order and distinguishes empty from absent', async () => {
  const received: { caller: CommandCaller; id: string }[] = [];
  const f = createShelfEndpoint((caller, id) => {
    received.push(structuredClone({ caller, id }));
    return Promise.resolve({
      ok: true,
      value:
        id === 'absent'
          ? null
          : id === 'empty'
            ? []
            : [shelfHeader, { ...shelfHeader, id: 'second', name: 'Second' }],
    });
  }, legacyOrganizationAccess);
  const listed = await f.endpoint.handle({ ...direct, body: undefined });
  expect(listed).toEqual({
    ok: true,
    status: 200,
    body: {
      savedPlans: [
        {
          id: 'header',
          name: 'Stored name',
          createdBy: 'Historic creator',
          createdAt: 12,
          inputBytes: 23,
          scheduleBytes: null,
          scheduleAbsentReason: 'future-reason',
        },
        {
          id: 'second',
          name: 'Second',
          createdBy: 'Historic creator',
          createdAt: 12,
          inputBytes: 23,
          scheduleBytes: null,
          scheduleAbsentReason: 'future-reason',
        },
      ],
    },
  });
  expect(await f.endpoint.handle({ ...direct, params: { id: 'empty' }, body: undefined })).toEqual({
    ok: true,
    status: 200,
    body: { savedPlans: [] },
  });
  expect(await f.endpoint.handle({ ...direct, params: { id: 'absent' }, body: undefined })).toEqual(
    { ok: false, status: 404, body: { error: 'not_found' } },
  );
  expect(received.map((entry) => entry.id)).toEqual(['p', 'empty', 'absent']);
  expect(received[0]?.caller).toEqual({
    kind: 'human',
    principal: {
      ...principal,
      organizationOperation: { kind: 'read', expected: { kind: 'absent' } },
    },
    expectedAccess: { kind: 'legacy' },
  });
  expect(f.list).not.toHaveBeenCalled();
  expect(f.workPackageRead).not.toHaveBeenCalled();
});

test('direct shelf skips observation after initial refusal and forwards later context refusal exactly', async () => {
  let calls = 0;
  const listSaved: WorkPackageObservation['listSaved'] = () => {
    calls++;
    return Promise.resolve({ ok: false, refusal: 'organization_context_changed' });
  };
  const first = createShelfEndpoint(listSaved, {
    resolve: () => Promise.resolve({ ok: false, refusal: 'not_a_member' }),
  });
  expect(await first.endpoint.handle({ ...direct, body: undefined })).toEqual({
    ok: false,
    status: 403,
    body: { error: 'not_a_member' },
  });
  expect(calls).toBe(0);
  const later = createShelfEndpoint(listSaved, legacyOrganizationAccess);
  expect(await later.endpoint.handle({ ...direct, body: undefined })).toEqual({
    ok: false,
    status: 409,
    body: { error: 'organization_context_changed' },
  });
  expect(calls).toBe(1);
});

test('direct shelf retains nested caller and primitive ID before held initial resolution', async () => {
  const authentication = { kind: 'first_party' as const, issuedAt: 1 };
  const scopes: AuthenticatedUser['scopes'][number][] = ['read', 'write'];
  const organizationBinding = {
    credential: { kind: 'native' as const, userId: 'actor', digest: 'verified', expiresAt: 1000 },
    cookie: 'selected',
  };
  const actor: AuthenticatedUser = { ...principal, authentication, scopes, organizationBinding };
  const retained: AuthenticatedUser = {
    ...structuredClone(actor),
    organizationOperation: { kind: 'read', expected: { kind: 'absent' } },
  };
  const access: ResourceAccess = {
    kind: 'scoped',
    principal: { id: 'actor' },
    scope: { organizationId: 'shelf-org', userId: 'actor', cap: null },
  };
  const entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  let captured: { caller: CommandCaller; id: string } | undefined;
  let resolvedPrincipal: Parameters<OrganizationAccess['resolve']>[0] | undefined;
  const f = createShelfEndpoint(
    (caller, id) => {
      captured = structuredClone({ caller, id });
      return Promise.resolve({ ok: true, value: [] });
    },
    {
      async resolve(principal) {
        entered.resolve(undefined);
        await release.promise;
        resolvedPrincipal = structuredClone(principal);
        return { ok: true, access };
      },
    },
  );
  const params = { id: 'original' };
  const pending = f.endpoint.handle({ ...direct, body: undefined, principal: actor, params }).then(
    (value) => ({ ok: true as const, value }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  let primary: { cause: unknown } | undefined,
    ownsPending = false;
  try {
    const first = await Promise.race([
      entered.promise.then(() => ({ entered: true as const })),
      pending.then((settled) => ({ entered: false as const, settled })),
    ]);
    if (!first.entered) {
      if (!first.settled.ok) {
        ownsPending = true;
        throw first.settled.cause;
      }
      throw Error('Shelf completed before initial resolution entry');
    }
    actor.id = 'top-level-copy-is-not-the-witness';
    authentication.issuedAt = 99;
    scopes.splice(0, scopes.length, 'editor');
    organizationBinding.cookie = 'changed';
    organizationBinding.credential.expiresAt = 1;
    params.id = 'changed';
  } catch (cause: unknown) {
    primary = { cause };
  }
  release.resolve(undefined);
  const settled = await pending;
  if (primary !== undefined) {
    if (!settled.ok && !ownsPending)
      throw new AggregateError(
        [primary.cause, settled.cause],
        'Shelf entry and settlement failed',
        { cause: primary.cause },
      );
    throw primary.cause;
  }
  if (!settled.ok) throw settled.cause;
  expect(settled.value).toEqual({ ok: true, status: 200, body: { savedPlans: [] } });
  expect(captured).toEqual({
    caller: { kind: 'human', principal: retained, expectedAccess: access },
    id: 'original',
  });
  expect(resolvedPrincipal).toEqual(retained);
});

test('direct shelf preserves unknown initial and observed failures including undefined', async () => {
  for (const cause of [
    Error('shelf failed'),
    undefined,
    new AggregateError([Error('first'), Error('second')], 'paired fixture failure'),
  ]) {
    const reject = () =>
      Promise.resolve().then(() => {
        const failure: unknown = cause;
        throw failure;
      });
    const initial = createShelfEndpoint(
      () => Promise.reject(Error('unexpected shelf observation')),
      { resolve: reject },
    );
    const observed = createShelfEndpoint(reject, legacyOrganizationAccess);
    for (const endpoint of [initial.endpoint, observed.endpoint]) {
      const settled = await endpoint.handle({ ...direct, body: undefined }).then(
        () => ({ rejected: false as const }),
        (failure: unknown) => ({ rejected: true as const, failure }),
      );
      expect(settled.rejected).toBe(true);
      if (!settled.rejected) throw Error('Shelf failure resolved');
      expect(settled.failure).toBe(cause);
    }
  }
});

const savedProtocolSide: PlanSide = {
  comparison: { kind: 'captured' as const },
  ...projectSavedPlanInput(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-input9-local.txt',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
    9,
  ),
  schedule: { present: false, absentReason: 'historic-unavailable' },
};

function createSavedReadEndpoints(
  readSaved: WorkPackageObservation['readSaved'],
  organizations: OrganizationAccess = legacyOrganizationAccess,
  captureSavedCurrent: WorkPackageObservation['captureSavedCurrent'] = () =>
    Promise.reject(Error('unused current capture in saved protocol')),
) {
  const f = fixture();
  const readStoredPlan = mock<SavedPlanService['readStoredPlan']>(() =>
    Promise.resolve({ outcome: 'read', plan: record }),
  );
  const readStoredSide = mock<SavedPlanService['readStoredSide']>(() =>
    Promise.resolve({ outcome: 'side', side: savedProtocolSide }),
  );
  const compareSides = mock<SavedPlanService['compareSides']>(
    (left, leftSide, right, rightSide) => ({
      outcome: 'compared',
      diff: { input: [], schedule: [] },
      left: summarizeSavedComparisonSide(leftSide, left),
      right: summarizeSavedComparisonSide(rightSide, right),
    }),
  );
  const projectCapturedCurrent = mock<SavedPlanService['projectCapturedCurrent']>(
    () => savedProtocolSide,
  );
  const plans = {
    ...f.plans,
    readStoredPlan,
    readStoredSide,
    compareSides,
    projectCapturedCurrent,
  };
  const endpoints = savedPlanRoutes(
    plans as never,
    f.workPackages as never,
    f.announcements,
    organizations,
    {
      captureSavedCurrent,
      listSaved: () => Promise.reject(Error('unused shelf in saved read protocol')),
      readSaved,
    },
  );
  return { ...f, endpoints, readStoredPlan, readStoredSide, compareSides, projectCapturedCurrent };
}

const compareDirect = {
  ...direct,
  body: undefined,
  query: { left: 'left-saved', right: 'right-saved' },
};

test('direct saved detail passes exact detached bytes to post-observation verification and conceals both absence kinds', async () => {
  const calls: { caller: CommandCaller; address: SavedPlanReadAddress }[] = [];
  let settled = false;
  const f = createSavedReadEndpoints((caller, address) => {
    calls.push(structuredClone({ caller, address }));
    settled = true;
    return Promise.resolve({ ok: true, value: { kind: 'stored', stored: storedRecord } });
  });
  f.readStoredPlan.mockImplementation((stored) => {
    expect(settled).toBe(true);
    expect(stored).toBe(storedRecord);
    return Promise.resolve({ outcome: 'read', plan: record });
  });
  expect(await f.endpoints[3].handle({ ...direct, params: { id: 's' }, body: undefined })).toEqual({
    ok: true,
    status: 200,
    body: { savedPlan: record },
  });
  expect(calls).toEqual([
    {
      caller: {
        kind: 'human',
        principal: {
          ...principal,
          organizationOperation: { kind: 'read', expected: { kind: 'absent' } },
        },
        expectedAccess: { kind: 'legacy' },
      },
      address: { kind: 'detail', savedPlanId: 's' },
    },
  ]);
  expect(f.workPackageRead).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
  for (const kind of ['package_not_found', 'saved_plan_not_found'] as const) {
    const hidden = createSavedReadEndpoints(() => Promise.resolve({ ok: true, value: { kind } }));
    expect(
      await hidden.endpoints[3].handle({ ...direct, params: { id: 's' }, body: undefined }),
    ).toEqual({ ok: false, status: 404, body: { error: 'not_found' } });
    expect(hidden.readStoredPlan).not.toHaveBeenCalled();
  }
});

test('direct saved comparison fully verifies left before observing right and uses only resolved historical sides', async () => {
  const sequence: string[] = [];
  const f = createSavedReadEndpoints((_caller, address) => {
    sequence.push('observe:' + address.savedPlanId);
    return Promise.resolve({
      ok: true,
      value: {
        kind: 'stored',
        stored: { ...storedRecord, header: { ...storedRecord.header, id: address.savedPlanId } },
      },
    });
  });
  f.readStoredSide.mockImplementation((stored) => {
    sequence.push('verify:' + stored.header.id);
    return Promise.resolve({ outcome: 'side', side: savedProtocolSide });
  });
  const reply = await f.endpoints[2].handle(compareDirect);
  expect(reply).toEqual({
    ok: true,
    status: 200,
    body: {
      left: summarizeSavedComparisonSide(savedProtocolSide, {
        kind: 'saved',
        savedPlanId: 'left-saved',
      }),
      right: summarizeSavedComparisonSide(savedProtocolSide, {
        kind: 'saved',
        savedPlanId: 'right-saved',
      }),
      diff: { input: [], schedule: [] },
    },
  });
  expect(sequence).toEqual([
    'observe:left-saved',
    'verify:left-saved',
    'observe:right-saved',
    'verify:right-saved',
  ]);
  expect(f.compareSides).toHaveBeenCalledWith(
    { kind: 'saved', savedPlanId: 'left-saved' },
    savedProtocolSide,
    { kind: 'saved', savedPlanId: 'right-saved' },
    savedProtocolSide,
  );
  expect(f.compare).not.toHaveBeenCalled();
  expect(f.workPackageRead).not.toHaveBeenCalled();
});

test('direct saved comparison preserves package versus side absence and left corruption precedence', async () => {
  for (const kind of ['package_not_found', 'saved_plan_not_found'] as const) {
    const received: string[] = [];
    const f = createSavedReadEndpoints((_caller, address) => {
      received.push(address.savedPlanId);
      return Promise.resolve({ ok: true, value: { kind } });
    });
    expect(await f.endpoints[2].handle(compareDirect)).toEqual({
      ok: false,
      status: 404,
      body:
        kind === 'package_not_found'
          ? { error: 'not_found' }
          : { error: 'not_found', savedPlanId: 'left-saved' },
    });
    expect(received).toEqual(['left-saved']);
    expect(f.readStoredSide).not.toHaveBeenCalled();
  }
  const received: string[] = [];
  const f = createSavedReadEndpoints((_caller, address) => {
    received.push(address.savedPlanId);
    return Promise.resolve({ ok: true, value: { kind: 'stored', stored: storedRecord } });
  });
  const refusal = { reason: 'body_missing', savedPlanId: 'left-saved', body: 'input' } as const;
  f.readStoredSide.mockResolvedValueOnce({
    outcome: 'corrupt',
    savedPlanId: 'left-saved',
    refusal,
  });
  expect(await f.endpoints[2].handle(compareDirect)).toEqual({
    ok: false,
    status: 422,
    body: { error: 'corrupt', savedPlanId: 'left-saved', refusal },
  });
  expect(received).toEqual(['left-saved']);
  expect(f.compareSides).not.toHaveBeenCalled();
});

test('direct saved reads preserve initial and later typed refusals before pure projection', async () => {
  for (const index of [2, 3]) {
    let calls = 0;
    const readSaved: WorkPackageObservation['readSaved'] = () => {
      calls++;
      return Promise.resolve({ ok: false, refusal: 'organization_context_changed' });
    };
    const initial = createSavedReadEndpoints(readSaved, {
      resolve: () => Promise.resolve({ ok: false, refusal: 'not_a_member' }),
    });
    const invokeInitial =
      index === 2
        ? () => initial.endpoints[2].handle(compareDirect)
        : () => initial.endpoints[3].handle({ ...direct, body: undefined });
    expect(await invokeInitial()).toEqual({
      ok: false,
      status: 403,
      body: { error: 'not_a_member' },
    });
    expect(calls).toBe(0);
    const later = createSavedReadEndpoints(readSaved);
    const invokeLater =
      index === 2
        ? () => later.endpoints[2].handle(compareDirect)
        : () => later.endpoints[3].handle({ ...direct, body: undefined });
    expect(await invokeLater()).toEqual({
      ok: false,
      status: 409,
      body: { error: 'organization_context_changed' },
    });
    expect(calls).toBe(1);
    expect(later.readStoredPlan).not.toHaveBeenCalled();
    expect(later.readStoredSide).not.toHaveBeenCalled();
  }
});

for (const purpose of ['detail', 'comparison'] as const) {
  test(
    'direct saved ' +
      purpose +
      ' retains full nested caller and primitive address before initial resolution',
    async () => {
      const authentication = { kind: 'first_party' as const, issuedAt: 1 };
      const scopes: AuthenticatedUser['scopes'][number][] = ['read', 'write'];
      const organizationBinding = {
        credential: { kind: 'native' as const, userId: 'actor', digest: 'bound', expiresAt: 1000 },
        cookie: 'selected',
      };
      const actor: AuthenticatedUser = {
        ...principal,
        authentication,
        scopes,
        organizationBinding,
      };
      const retained: AuthenticatedUser = {
        ...structuredClone(actor),
        organizationOperation: { kind: 'read', expected: { kind: 'absent' } },
      };
      const access: ResourceAccess = {
        kind: 'scoped',
        principal: { id: 'actor' },
        scope: { organizationId: 'read-org', userId: 'actor', cap: null },
      };
      const entered = Promise.withResolvers<undefined>(),
        release = Promise.withResolvers<undefined>();
      let resolvedPrincipal: Parameters<OrganizationAccess['resolve']>[0] | undefined;
      const captures: { caller: CommandCaller; address: SavedPlanReadAddress }[] = [];
      const f = createSavedReadEndpoints(
        (caller, address) => {
          captures.push(structuredClone({ caller, address }));
          return Promise.resolve({ ok: true, value: { kind: 'stored', stored: storedRecord } });
        },
        {
          async resolve(principal) {
            entered.resolve(undefined);
            await release.promise;
            resolvedPrincipal = structuredClone(principal);
            return { ok: true, access };
          },
        },
      );
      const params = { id: purpose === 'detail' ? 'original-saved' : 'original-package' };
      const query = { left: 'original-left', right: 'original-right' };
      const invoke =
        purpose === 'detail'
          ? () => f.endpoints[3].handle({ ...direct, body: undefined, principal: actor, params })
          : () =>
              f.endpoints[2].handle({
                ...direct,
                body: undefined,
                principal: actor,
                params,
                query,
              });
      const pending = invoke().then(
        (value) => ({ ok: true as const, value }),
        (cause: unknown) => ({ ok: false as const, cause }),
      );
      let primary: { cause: unknown } | undefined,
        ownsPending = false;
      try {
        const first = await Promise.race([
          entered.promise.then(() => ({ entered: true as const })),
          pending.then((settled) => ({ entered: false as const, settled })),
        ]);
        if (!first.entered) {
          if (!first.settled.ok) {
            ownsPending = true;
            throw first.settled.cause;
          }
          throw Error('saved read completed before held initial resolution');
        }
        authentication.issuedAt = 99;
        scopes.splice(0, scopes.length, 'editor');
        organizationBinding.cookie = 'changed';
        organizationBinding.credential.expiresAt = 1;
        params.id = 'changed';
        query.left = 'current';
        query.right = 'changed';
      } catch (cause: unknown) {
        primary = { cause };
      }
      release.resolve(undefined);
      const settled = await pending;
      if (primary !== undefined) {
        if (!settled.ok && !ownsPending)
          throw new AggregateError(
            [primary.cause, settled.cause],
            'saved read entry and settlement failed',
            { cause: primary.cause },
          );
        throw primary.cause;
      }
      if (!settled.ok) throw settled.cause;
      expect(settled.value.status).toBe(200);
      expect(resolvedPrincipal).toEqual(retained);
      expect(captures).toEqual(
        purpose === 'detail'
          ? [
              {
                caller: { kind: 'human', principal: retained, expectedAccess: access },
                address: { kind: 'detail', savedPlanId: 'original-saved' },
              },
            ]
          : ['original-left', 'original-right'].map((savedPlanId) => ({
              caller: { kind: 'human', principal: retained, expectedAccess: access },
              address: { kind: 'comparison', workPackageId: 'original-package', savedPlanId },
            })),
      );
      expect(f.workPackageRead).not.toHaveBeenCalled();
      expect(f.compare).not.toHaveBeenCalled();
    },
  );
}

test('direct saved read observation errors including version-shaped and undefined remain outside stored-version classification', async () => {
  for (const failure of [
    undefined,
    Error('saved observation failed'),
    new UnknownSavedPlanBodyVersionError('outside', 'input', 99, [1]),
  ]) {
    const reject = () =>
      Promise.resolve().then(() => {
        const cause: unknown = failure;
        throw cause;
      });
    for (const index of [2, 3]) {
      for (const stage of ['initial', 'observation'] as const) {
        const f = createSavedReadEndpoints(
          reject,
          stage === 'initial' ? { resolve: reject } : legacyOrganizationAccess,
        );
        const invoke =
          index === 2
            ? () => f.endpoints[2].handle(compareDirect)
            : () => f.endpoints[3].handle({ ...direct, body: undefined });
        const settled = await invoke().then(
          () => ({ rejected: false as const }),
          (cause: unknown) => ({ rejected: true as const, cause }),
        );
        expect(settled.rejected).toBe(true);
        if (!settled.rejected) throw Error('saved observation failure resolved');
        expect(settled.cause).toBe(failure);
        expect(f.readStoredPlan).not.toHaveBeenCalled();
        expect(f.readStoredSide).not.toHaveBeenCalled();
      }
    }
  }
});

test('direct saved pure verification keeps unsupported version501 and null-body integrity422', async () => {
  const f = createSavedReadEndpoints(() =>
    Promise.resolve({ ok: true, value: { kind: 'stored', stored: storedRecord } }),
  );
  f.readStoredPlan.mockRejectedValueOnce(
    new UnknownSavedPlanBodyVersionError('s', 'input', 99, [1]),
  );
  expect(await f.endpoints[3].handle({ ...direct, body: undefined })).toEqual({
    ok: false,
    status: 501,
    body: {
      error: 'unsupported_body_version',
      savedPlanId: 's',
      body: 'input',
      version: 99,
      supported: [1],
    },
  });
  const refuseUnused = () => Promise.reject(Error('detached verifier reached persistence'));
  const resource = new SavedPlanResource({
    capture: { readPlanInput: refuseUnused },
    plans: {
      write: refuseUnused,
      readOf: refuseUnused,
      listOf: refuseUnused,
      principalsOf: refuseUnused,
      renameTo: refuseUnused,
      deleteOf: refuseUnused,
    },
    digest: { sha256: refuseUnused },
  });
  const stored = { ...storedRecord, bodies: { input: null, schedule: null } };
  const absentBody = await resource.readStoredPlan(stored);
  expect(absentBody).toEqual({
    outcome: 'corrupt',
    refusal: { reason: 'body_missing', savedPlanId: 's', body: 'input' },
  });
  f.readStoredPlan.mockImplementation(() => Promise.resolve(absentBody));
  expect(await f.endpoints[3].handle({ ...direct, body: undefined })).toEqual({
    ok: false,
    status: 422,
    body: {
      error: 'corrupt',
      refusal: { reason: 'body_missing', savedPlanId: 's', body: 'input' },
    },
  });
});

test('direct saved detail waits for the held observation result before pure verification', async () => {
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<Awaited<ReturnType<WorkPackageObservation['readSaved']>>>();
  const f = createSavedReadEndpoints(() => {
    entered.resolve(undefined);
    return release.promise;
  });
  f.readStoredPlan.mockImplementation((stored) => {
    expect(stored).toBe(storedRecord);
    return Promise.resolve({ outcome: 'read', plan: record });
  });
  const pending = f.endpoints[3].handle({ ...direct, params: { id: 's' }, body: undefined }).then(
    (value) => ({ ok: true as const, value }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  let primary: { cause: unknown } | undefined;
  let ownsPending = false;
  try {
    const first = await Promise.race([
      entered.promise.then(() => ({ entered: true as const })),
      pending.then((settled) => ({ entered: false as const, settled })),
    ]);
    if (!first.entered) {
      if (!first.settled.ok) {
        ownsPending = true;
        throw first.settled.cause;
      }
      throw Error('saved detail completed before entering the held observation');
    }
    expect(f.readStoredPlan).not.toHaveBeenCalled();
    expect(f.readStoredSide).not.toHaveBeenCalled();
  } catch (cause: unknown) {
    primary = { cause };
  }
  release.resolve({ ok: true, value: { kind: 'stored', stored: storedRecord } });
  const settled = await pending;
  if (primary !== undefined) {
    if (!settled.ok && !ownsPending)
      throw new AggregateError(
        [primary.cause, settled.cause],
        'held saved detail and settlement failed',
        {
          cause: primary.cause,
        },
      );
    throw primary.cause;
  }
  if (!settled.ok) throw settled.cause;
  expect(settled.value).toEqual({ ok: true, status: 200, body: { savedPlan: record } });
  expect(f.readStoredPlan).toHaveBeenCalledTimes(1);
  expect(f.workPackageRead).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
});

for (const outcome of ['context', 'missing', 'corrupt', 'version'] as const) {
  test(
    'direct saved comparison preserves the right-only ' + outcome + ' refusal after a healthy left',
    async () => {
      const leftStored = {
        ...storedRecord,
        header: { ...storedRecord.header, id: 'left-saved' },
        bodies: { input: ' left detached bytes\n', schedule: null },
      } satisfies StoredSavedPlan;
      const rightStored = {
        ...storedRecord,
        header: { ...storedRecord.header, id: 'right-saved' },
        bodies: { input: ' right detached bytes\n', schedule: null },
      } satisfies StoredSavedPlan;
      const sequence: string[] = [];
      const addresses: SavedPlanReadAddress[] = [];
      const readSaved: WorkPackageObservation['readSaved'] = (_caller, address) => {
        addresses.push(structuredClone(address));
        sequence.push('observe:' + address.savedPlanId);
        if (address.savedPlanId === 'right-saved' && outcome === 'context')
          return Promise.resolve({ ok: false, refusal: 'organization_context_changed' });
        if (address.savedPlanId === 'right-saved' && outcome === 'missing')
          return Promise.resolve({ ok: true, value: { kind: 'saved_plan_not_found' } });
        return Promise.resolve({
          ok: true,
          value: {
            kind: 'stored',
            stored: address.savedPlanId === 'left-saved' ? leftStored : rightStored,
          },
        });
      };
      const f = createSavedReadEndpoints(readSaved);
      const refusal = {
        reason: 'body_missing',
        savedPlanId: 'right-saved',
        body: 'input',
      } as const;
      f.readStoredSide.mockImplementation((stored) => {
        expect(stored).toBe(stored.header.id === 'left-saved' ? leftStored : rightStored);
        sequence.push('verify:' + stored.header.id);
        if (stored.header.id === 'right-saved' && outcome === 'corrupt')
          return Promise.resolve({ outcome: 'corrupt', savedPlanId: 'right-saved', refusal });
        if (stored.header.id === 'right-saved' && outcome === 'version')
          return Promise.reject(
            new UnknownSavedPlanBodyVersionError('right-saved', 'input', 99, [1]),
          );
        return Promise.resolve({ outcome: 'side', side: savedProtocolSide });
      });
      const reply = await f.endpoints[2].handle(compareDirect);
      if (outcome === 'context')
        expect(reply).toEqual({
          ok: false,
          status: 409,
          body: { error: 'organization_context_changed' },
        });
      else if (outcome === 'missing')
        expect(reply).toEqual({
          ok: false,
          status: 404,
          body: { error: 'not_found', savedPlanId: 'right-saved' },
        });
      else if (outcome === 'corrupt')
        expect(reply).toEqual({
          ok: false,
          status: 422,
          body: { error: 'corrupt', savedPlanId: 'right-saved', refusal },
        });
      else
        expect(reply).toEqual({
          ok: false,
          status: 501,
          body: {
            error: 'unsupported_body_version',
            savedPlanId: 'right-saved',
            body: 'input',
            version: 99,
            supported: [1],
          },
        });
      expect(addresses).toEqual(
        ['left-saved', 'right-saved'].map((savedPlanId) => ({
          kind: 'comparison',
          workPackageId: 'p',
          savedPlanId,
        })),
      );
      expect(sequence).toEqual([
        'observe:left-saved',
        'verify:left-saved',
        'observe:right-saved',
        ...(outcome === 'corrupt' || outcome === 'version' ? ['verify:right-saved'] : []),
      ]);
      expect(f.readStoredSide).toHaveBeenCalledTimes(
        outcome === 'corrupt' || outcome === 'version' ? 2 : 1,
      );
      expect(f.compareSides).not.toHaveBeenCalled();
      expect(f.readStoredPlan).not.toHaveBeenCalled();
      expect(f.workPackageRead).not.toHaveBeenCalled();
      expect(f.compare).not.toHaveBeenCalled();
    },
  );
}

test('actual saved feature verifies detached missing bodies and names its corrupt side without raw persistence', async () => {
  const refuseUnused = () => {
    throw Error('detached saved feature reached a raw capability');
  };
  const { savedPlans } = installSavedPlans({
    capture: { readPlanInput: refuseUnused },
    plans: {
      write: refuseUnused,
      readOf: refuseUnused,
      listOf: refuseUnused,
      principalsOf: refuseUnused,
      renameTo: refuseUnused,
      deleteOf: refuseUnused,
    },
    digest: { sha256: refuseUnused },
    scheduler: { read: refuseUnused, supports: refuseUnused, readResolvedFast: refuseUnused },
    captureSharedPlan: refuseUnused,
    newId: refuseUnused,
    now: refuseUnused,
  });
  const stored = {
    ...storedRecord,
    header: { ...storedRecord.header, id: 'actual-detached-side' },
    bodies: { input: null, schedule: null },
  } satisfies StoredSavedPlan;
  const refusal = {
    reason: 'body_missing',
    savedPlanId: 'actual-detached-side',
    body: 'input',
  } as const;
  expect(await savedPlans.readStoredPlan(stored)).toEqual({ outcome: 'corrupt', refusal });
  expect(await savedPlans.readStoredSide(stored)).toEqual({
    outcome: 'corrupt',
    savedPlanId: 'actual-detached-side',
    refusal,
  });
});

const completedCurrent: Extract<SavedCurrentCapture, { readonly kind: 'local' }> = {
  kind: 'local',
  reads: connectedReads('p'),
  scheduled: { kind: 'cycle' },
};

test('direct current/current observes and projects once then reuses the exact completed side without raw reads', async () => {
  const received: { caller: CommandCaller; id: string }[] = [];
  const f = createSavedReadEndpoints(
    () => Promise.reject(Error('current/current read saved bytes')),
    legacyOrganizationAccess,
    (caller, id) => {
      received.push(structuredClone({ caller, id }));
      return Promise.resolve({ ok: true, value: completedCurrent });
    },
  );
  expect(
    (
      await f.endpoints[2].handle({
        ...compareDirect,
        query: { left: 'current', right: 'current' },
      })
    ).status,
  ).toBe(200);
  expect(received).toEqual([
    {
      caller: {
        kind: 'human',
        principal: {
          ...principal,
          organizationOperation: { kind: 'read', expected: { kind: 'absent' } },
        },
        expectedAccess: { kind: 'legacy' },
      },
      id: 'p',
    },
  ]);
  expect(f.projectCapturedCurrent).toHaveBeenCalledTimes(1);
  expect(f.projectCapturedCurrent).toHaveBeenCalledWith(completedCurrent, 'p');
  expect(f.compareSides).toHaveBeenCalledWith(
    { kind: 'current' },
    savedProtocolSide,
    { kind: 'current' },
    savedProtocolSide,
  );
  expect(f.workPackageRead).not.toHaveBeenCalled();
  expect(f.compare).not.toHaveBeenCalled();
  expect(f.readStoredSide).not.toHaveBeenCalled();
});

for (const order of ['saved/current', 'current/saved'] as const) {
  test('direct ' + order + ' fully completes each original side in left-first order', async () => {
    const sequence: string[] = [];
    const f = createSavedReadEndpoints(
      (_caller, address) => {
        sequence.push('saved:' + address.savedPlanId);
        return Promise.resolve({ ok: true, value: { kind: 'stored', stored: storedRecord } });
      },
      legacyOrganizationAccess,
      (_caller, id) => {
        sequence.push('current:' + id);
        return Promise.resolve({ ok: true, value: completedCurrent });
      },
    );
    f.readStoredSide.mockImplementation((stored) => {
      expect(stored).toBe(storedRecord);
      sequence.push('verify:saved');
      return Promise.resolve({ outcome: 'side', side: savedProtocolSide });
    });
    f.projectCapturedCurrent.mockImplementation((captured) => {
      expect(captured).toBe(completedCurrent);
      sequence.push('project:current');
      return savedProtocolSide;
    });
    const query =
      order === 'saved/current' ? { left: 's', right: 'current' } : { left: 'current', right: 's' };
    expect((await f.endpoints[2].handle({ ...compareDirect, query })).status).toBe(200);
    expect(sequence).toEqual(
      order === 'saved/current'
        ? ['saved:s', 'verify:saved', 'current:p', 'project:current']
        : ['current:p', 'project:current', 'saved:s', 'verify:saved'],
    );
    expect(f.workPackageRead).not.toHaveBeenCalled();
    expect(f.compare).not.toHaveBeenCalled();
  });
}

test('direct saved/current stops at left absence corruption or unsupported version before capturing current', async () => {
  for (const mode of ['missing', 'corrupt', 'version'] as const) {
    let captures = 0;
    const f = createSavedReadEndpoints(
      () =>
        Promise.resolve({
          ok: true,
          value:
            mode === 'missing'
              ? { kind: 'saved_plan_not_found' }
              : { kind: 'stored', stored: storedRecord },
        }),
      legacyOrganizationAccess,
      () => {
        captures++;
        return Promise.resolve({ ok: true, value: completedCurrent });
      },
    );
    if (mode === 'corrupt')
      f.readStoredSide.mockResolvedValueOnce({
        outcome: 'corrupt',
        savedPlanId: 's',
        refusal: { reason: 'body_missing', savedPlanId: 's', body: 'input' },
      });
    if (mode === 'version')
      f.readStoredSide.mockRejectedValueOnce(
        new UnknownSavedPlanBodyVersionError('s', 'input', 99, [1]),
      );
    const reply = await f.endpoints[2].handle({
      ...compareDirect,
      query: { left: 's', right: 'current' },
    });
    expect(reply.status).toBe(mode === 'missing' ? 404 : mode === 'corrupt' ? 422 : 501);
    expect(captures).toBe(0);
    expect(f.projectCapturedCurrent).not.toHaveBeenCalled();
    expect(f.compareSides).not.toHaveBeenCalled();
  }
});

test('direct current denial and initial or later refusal do not inspect the right saved side', async () => {
  for (const stage of ['initial', 'late', 'hidden'] as const) {
    let captures = 0,
      savedReads = 0;
    const f = createSavedReadEndpoints(
      () => {
        savedReads++;
        return Promise.reject(Error('denied current inspected saved bytes'));
      },
      stage === 'initial'
        ? { resolve: () => Promise.resolve({ ok: false, refusal: 'not_a_member' }) }
        : legacyOrganizationAccess,
      () => {
        captures++;
        return Promise.resolve(
          stage === 'late'
            ? { ok: false, refusal: 'organization_context_changed' }
            : { ok: true, value: null },
        );
      },
    );
    expect(
      await f.endpoints[2].handle({ ...compareDirect, query: { left: 'current', right: 's' } }),
    ).toEqual(
      stage === 'initial'
        ? { ok: false, status: 403, body: { error: 'not_a_member' } }
        : stage === 'late'
          ? { ok: false, status: 409, body: { error: 'organization_context_changed' } }
          : { ok: false, status: 404, body: { error: 'not_found' } },
    );
    expect(captures).toBe(stage === 'initial' ? 0 : 1);
    expect(savedReads).toBe(0);
    expect(f.projectCapturedCurrent).not.toHaveBeenCalled();
    expect(f.compareSides).not.toHaveBeenCalled();
  }
});

test('direct current capture and pure projection retain unknown including undefined outside stored-version classification', async () => {
  for (const failure of [
    undefined,
    Error('current failed'),
    new UnknownSavedPlanBodyVersionError('current-not-stored', 'input', 99, [1]),
  ]) {
    for (const stage of ['capture', 'projection'] as const) {
      const reject = () =>
        Promise.resolve().then(() => {
          const cause: unknown = failure;
          throw cause;
        });
      const f = createSavedReadEndpoints(
        () => Promise.reject(Error('unexpected stored read')),
        legacyOrganizationAccess,
        stage === 'capture' ? reject : () => Promise.resolve({ ok: true, value: completedCurrent }),
      );
      if (stage === 'projection')
        f.projectCapturedCurrent.mockImplementation(() => {
          const cause: unknown = failure;
          throw cause;
        });
      const settled = await f.endpoints[2]
        .handle({ ...compareDirect, query: { left: 'current', right: 'current' } })
        .then(
          () => ({ rejected: false as const }),
          (cause: unknown) => ({ rejected: true as const, cause }),
        );
      expect(settled.rejected).toBe(true);
      if (!settled.rejected) throw Error('current failure resolved');
      expect(settled.cause).toBe(failure);
      expect(f.readStoredSide).not.toHaveBeenCalled();
      expect(f.compareSides).not.toHaveBeenCalled();
    }
  }
});

test('actual current feature projects detached local S4 without raw capture clock digest or scheduler callbacks', () => {
  const refuse = () => {
    throw Error('detached current projection reached a raw capability');
  };
  const { savedPlans } = installSavedPlans({
    capture: { readPlanInput: refuse },
    plans: {
      write: refuse,
      readOf: refuse,
      listOf: refuse,
      principalsOf: refuse,
      renameTo: refuse,
      deleteOf: refuse,
    },
    digest: { sha256: refuse },
    scheduler: { read: refuse, supports: refuse, readResolvedFast: refuse },
    captureSharedPlan: refuse,
    now: refuse,
    newId: refuse,
  });
  const side = savedPlans.projectCapturedCurrent(completedCurrent, 'p');
  expect(side.input.workPackage.id).toBe('p');
  expect(side.inputEvidence.parent).toEqual({ kind: 'recorded', projectId: 'captured-parent' });
  expect(side.schedule).toEqual({ present: false, absentReason: 'infeasible' });
  const unavailable: SavedCurrentCapture = {
    ...completedCurrent,
    scheduled: { kind: 'engine_unavailable', error: 'engine_unavailable', engine: 'optimized' },
  };
  expect(savedPlans.projectCapturedCurrent(unavailable, 'p').schedule).toEqual({
    present: false,
    absentReason: 'unavailable',
  });
});

for (const state of ['ready', 'pending', 'failed'] as const) {
  test(`actual detached current projection serializes optimized-enabled ${state} without Fast fallback or raw capabilities`, () => {
    const refuse = () => {
      throw Error('detached optimized projection reached a raw capability');
    };
    const { savedPlans } = installSavedPlans({
      capture: { readPlanInput: refuse },
      plans: {
        write: refuse,
        readOf: refuse,
        listOf: refuse,
        principalsOf: refuse,
        renameTo: refuse,
        deleteOf: refuse,
      },
      digest: { sha256: refuse },
      scheduler: { read: refuse, supports: refuse, readResolvedFast: refuse },
      captureSharedPlan: refuse,
      now: refuse,
      newId: refuse,
    });
    const reads = connectedReads('p');
    const capturedReads = {
      ...reads,
      workPackage: {
        ...reads.workPackage,
        scheduleEngine: 'optimized' as const,
        scheduleObjective: 'time' as const,
        optimizationEnabled: true,
      },
    };
    const fast = schedulePlanInput(capturedReads);
    const selected = { ...fast, waitingForCapacity: 73 };
    const other = { ...fast, waitingForCapacity: 19 };
    const variant =
      state === 'ready'
        ? { state: 'ready' as const, proof: 'proven' as const }
        : state === 'pending'
          ? { state: 'pending' as const }
          : { state: 'failed' as const, reason: 'timeout' as const };
    const captured: SavedCurrentCapture = {
      kind: 'local',
      reads: capturedReads,
      scheduled: {
        kind: 'scheduled',
        fast,
        optimization: {
          inputHash: 'detached-exact-input',
          generation: 7,
          contractVersion: '7+1.0.0',
          budgetMs: 60000,
          variants: { pri: { state: 'ready', proof: 'proven' }, time: variant },
          schedules: { pri: other, time: state === 'ready' ? selected : null },
        },
      },
    };
    const side = savedPlans.projectCapturedCurrent(captured, 'p');
    expect(side.input.workPackage.id).toBe('p');
    expect(side.inputEvidence.parent).toEqual({ kind: 'recorded', projectId: 'captured-parent' });
    if (state === 'ready') {
      expect(side.schedule).toMatchObject({
        present: true,
        algorithmId: 'optimized:7+1.0.0:time:60000',
        body: { version: 3, waitingForCapacity: 73 },
      });
      if (!side.schedule.present) throw Error('selected ready schedule absent');
      const projectedBody: unknown = side.schedule.body;
      expect(projectedBody).toEqual(
        buildScheduleBody(
          selected,
          capturedReads.workPackage.startDate,
          'optimized:7+1.0.0:time:60000',
        ),
      );
    } else {
      expect(side.schedule).toEqual({
        present: false,
        absentReason: state === 'pending' ? 'pending' : 'unavailable',
      });
    }
  });
}
