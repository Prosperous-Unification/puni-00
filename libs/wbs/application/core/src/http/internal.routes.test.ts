import type { AuthenticatedUser } from '@wbs/contracts';
import { ValidationError } from '@wbs/validation';
import { expect, test } from 'bun:test';

import type { CommandCaller } from '../ports/command-access';
import {
  LEGACY_ACCESS,
  type OrganizationAccess,
  type OrganizationPrincipal,
  type ResourceAccess,
} from '../ports/organization-access';
import type { WorkPackageObservation } from '../ports/work-package-observation';
import { EMPTY } from './endpoint';
import {
  gatewayAccessRoutes,
  type InternalCallContext,
  type InternalDeps,
  internalRoutes,
} from './internal.routes';

// Test doubles: every work package exists under legacy access, so these cases
// exercise payload handling rather than the per-subscription access check.
const access = {
  observation: { checkRead: () => Promise.resolve({ ok: true, value: true }) } satisfies Pick<
    WorkPackageObservation,
    'checkRead'
  >,
  organizations: {
    resolve: () => Promise.resolve({ ok: true, access: LEGACY_ACCESS }),
  } satisfies OrganizationAccess,
};
const routes = (deps: Pick<InternalDeps, 'onForward' | 'onResume'>) =>
  internalRoutes({ ...deps, ...access });
const user = { id: 'ada', username: 'ada', scopes: ['read' as const] };

const request = {
  method: 'POST',
  url: new URL('https://backend.example/internal/forward'),
  headers: new Headers({ 'X-Client-Id': 'client', 'X-Connection-Id': 'connection' }),
  signal: new AbortController().signal,
};
const common = {
  params: {},
  query: undefined,
  principal: { kind: 'internal' as const },
  request,
};

test('direct internal bindings preserve opaque payload, trace and nullable context headers', async () => {
  const calls: { message: unknown; context: InternalCallContext }[] = [];
  const [forward] = routes({
    onForward: (message, context) => {
      calls.push({ message, context });
      return Promise.resolve({ push_responses: [null, { arbitrary: true }] });
    },
    onResume: () => Promise.resolve({}),
  });
  const payload = ['arbitrary', { old: null }];
  expect(
    await forward.handle({ ...common, body: { message: payload, trace_id: 'trace' } }),
  ).toEqual({
    ok: true,
    status: 200,
    body: { ack: true, push_responses: [null, { arbitrary: true }] },
  });
  expect(calls[0]).toEqual({
    message: payload,
    context: { clientId: 'client', connectionId: 'connection', traceId: 'trace' },
  });
  await forward.handle({
    ...common,
    request: { ...request, headers: new Headers({ 'x-client-id': '' }) },
    body: { message: null, trace_id: '' },
  });
  expect(calls[1]?.context).toEqual({ clientId: '', connectionId: null, traceId: '' });
});

test('direct resume normalizes legacy array entries without narrowing numeric cursors', async () => {
  const calls: { points: Record<string, number>; context: InternalCallContext }[] = [];
  const [, resume] = routes({
    onForward: () => Promise.resolve({}),
    onResume: (points, context) => {
      calls.push({ points, context });
      return Promise.resolve({ p: { status: 'denied' as const, reason: 'out_of_range' as const } });
    },
  });
  expect(
    await resume.handle({
      ...common,
      principal: user,
      body: { resume_points: [-1, 0.5], trace_id: 'trace' },
    }),
  ).toEqual({
    ok: true,
    status: 200,
    body: {
      p: { status: 'denied', reason: 'out_of_range' },
      // Array indices name no work package: parsed, then denied without replay.
      '0': { status: 'denied', reason: 'forbidden' },
      '1': { status: 'denied', reason: 'forbidden' },
    },
  });
  expect(
    await resume.handle({
      ...common,
      principal: user,
      body: { resume_points: { 'work-package:p': -1, 'work-package:q': 0.5 }, trace_id: 'trace' },
    }),
  ).toEqual({ ok: true, status: 200, body: { p: { status: 'denied', reason: 'out_of_range' } } });
  expect(calls).toEqual([
    {
      points: {},
      context: { clientId: 'client', connectionId: 'connection', traceId: 'trace' },
    },
    {
      points: { 'work-package:p': -1, 'work-package:q': 0.5 },
      context: { clientId: 'client', connectionId: 'connection', traceId: 'trace' },
    },
  ]);
});

test('both direct callbacks reject original errors including ValidationError', async () => {
  for (const failure of [
    new Error('store unavailable'),
    new ValidationError('trusted callback invalid'),
  ]) {
    const [forward, resume] = routes({
      onForward: () => {
        return Promise.reject(failure);
      },
      onResume: () => {
        return Promise.reject(failure);
      },
    });
    expect(
      await forward
        .handle({ ...common, body: { message: {}, trace_id: 't' } })
        .catch((cause: unknown) => cause),
    ).toBe(failure);
    expect(
      await resume
        .handle({ ...common, principal: user, body: { resume_points: {}, trace_id: 't' } })
        .catch((cause: unknown) => cause),
    ).toBe(failure);
  }
});

type ReadObservation = Pick<WorkPackageObservation, 'checkRead'>;
const gatewayScope: ResourceAccess = {
  kind: 'scoped',
  principal: { id: 'ada' },
  scope: { organizationId: 'gateway-org', userId: 'ada', cap: null },
};
const gatewayInput = {
  ...common,
  params: { workPackageId: 'addressed-package' },
  principal: user,
  body: undefined,
};

/** Mutable nested protocol evidence; no verifier, credential or database authority is modeled. */
function createGatewayPrincipal() {
  const authentication = { kind: 'first_party' as const, issuedAt: 1 };
  const scopes: AuthenticatedUser['scopes'][number][] = ['read', 'write'];
  const organizationBinding = {
    credential: {
      kind: 'native' as const,
      userId: 'ada',
      digest: 'verified-digest',
      expiresAt: 1000,
    },
    cookie: 'selected-cookie',
  };
  const delegation = {
    organizationId: 'gateway-org',
    audience: 'wbs-be-01/via-gw-01' as const,
    client: 'client',
    grant: 'grant',
  };
  const principal: AuthenticatedUser = {
    id: 'ada',
    username: 'Ada',
    scopes,
    authentication,
    organizationBinding,
    delegation,
  };
  return { principal, authentication, scopes, organizationBinding, delegation };
}

for (const variant of [0, 1] as const) {
  const name = variant === 0 ? 'browser' : 'delegation';

  test(
    'direct ' +
      name +
      ' gateway maps current read admission and absence without a raw package read',
    async () => {
      const calls: { caller: CommandCaller; id: string }[] = [];
      for (const allowed of [true, false]) {
        const observation: ReadObservation = {
          checkRead: (caller, id) => {
            calls.push(structuredClone({ caller, id }));
            return Promise.resolve({ ok: true, value: allowed });
          },
        };
        const endpoint = gatewayAccessRoutes(observation, {
          resolve: () => Promise.resolve({ ok: true, access: gatewayScope }),
        })[variant];
        expect(await endpoint.handle(gatewayInput)).toEqual(
          allowed
            ? { ok: true, status: 204, body: EMPTY }
            : { ok: false, status: 404, body: { error: 'not_found' } },
        );
      }
      expect(calls).toEqual(
        [true, false].map(() => ({
          caller: { kind: 'human', principal: user, expectedAccess: gatewayScope },
          id: 'addressed-package',
        })),
      );
    },
  );

  test(
    'direct ' +
      name +
      ' gateway retains nested caller and primitive package ID before initial resolution waits',
    async () => {
      const evidence = createGatewayPrincipal();
      const retained = structuredClone(evidence.principal);
      const params = { workPackageId: 'original-package' };
      const entered = Promise.withResolvers<undefined>();
      const released = Promise.withResolvers<undefined>();
      let captured: { caller: CommandCaller; id: string } | undefined;
      const resolutions: OrganizationPrincipal[] = [];
      const observation: ReadObservation = {
        checkRead: (caller, id) => {
          captured = structuredClone({ caller, id });
          return Promise.resolve({ ok: true, value: true });
        },
      };
      const endpoint = gatewayAccessRoutes(observation, {
        async resolve(principal) {
          resolutions.push(structuredClone(principal));
          entered.resolve(undefined);
          await released.promise;
          return { ok: true, access: gatewayScope };
        },
      })[variant];
      const observed = endpoint
        .handle({ ...gatewayInput, params, principal: evidence.principal })
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
          throw Error('Gateway route settled before initial resolver entry');
        }
        evidence.principal.id = 'changed-top-level';
        evidence.authentication.issuedAt = 99;
        evidence.scopes.splice(0, evidence.scopes.length, 'editor');
        evidence.organizationBinding.cookie = 'changed-cookie';
        evidence.organizationBinding.credential.expiresAt = 1;
        evidence.delegation.organizationId = 'changed-org';
        evidence.delegation.client = 'changed-client';
        evidence.delegation.grant = 'changed-grant';
        params.workPackageId = 'changed-package';
      } catch (cause: unknown) {
        primary = { cause };
      }
      released.resolve(undefined);
      const settled = await observed;
      if (primary !== undefined) {
        if (!settled.ok && !primaryOwnsPending)
          throw new AggregateError(
            [primary.cause, settled.cause],
            'Gateway entry and settlement failed',
            { cause: primary.cause },
          );
        throw primary.cause;
      }
      if (!settled.ok) throw settled.cause;
      expect(settled.value).toEqual({ ok: true, status: 204, body: EMPTY });
      // organization-control does not inject history's organizationOperation field.
      expect(resolutions).toEqual([retained]);
      expect(captured).toEqual({
        caller: { kind: 'human', principal: retained, expectedAccess: gatewayScope },
        id: 'original-package',
      });
    },
  );

  test(
    'direct ' +
      name +
      ' gateway skips observation on initial refusal and forwards later current refusals exactly',
    async () => {
      let calls = 0;
      const observation: ReadObservation = {
        checkRead: () => {
          calls++;
          return Promise.resolve({ ok: false, refusal: 'organization_context_changed' });
        },
      };
      const initial = gatewayAccessRoutes(observation, {
        resolve: () => Promise.resolve({ ok: false, refusal: 'not_a_member' }),
      })[variant];
      expect(await initial.handle(gatewayInput)).toEqual({
        ok: false,
        status: 403,
        body: { error: 'not_a_member' },
      });
      expect(calls).toBe(0);
      const later = gatewayAccessRoutes(observation, {
        resolve: () => Promise.resolve({ ok: true, access: gatewayScope }),
      })[variant];
      expect(await later.handle(gatewayInput)).toEqual({
        ok: false,
        status: 409,
        body: { error: 'organization_context_changed' },
      });
      expect(calls).toBe(1);
    },
  );

  test(
    'direct ' +
      name +
      ' gateway preserves initial and observed unknown rejections including undefined',
    async () => {
      for (const cause of [
        Error('gateway unavailable'),
        new ValidationError('trusted gateway invalid'),
        undefined,
        new AggregateError([Error('first'), Error('second')], 'paired gateway failure'),
      ]) {
        const rejectGatewayFailure = () =>
          Promise.resolve().then(() => {
            const failure: unknown = cause;
            throw failure;
          });
        const observation: ReadObservation = { checkRead: rejectGatewayFailure };
        const later = gatewayAccessRoutes(observation, {
          resolve: () => Promise.resolve({ ok: true, access: gatewayScope }),
        })[variant];
        const initial = gatewayAccessRoutes(
          { checkRead: () => Promise.reject(Error('Unexpected gateway observation')) },
          { resolve: rejectGatewayFailure },
        )[variant];
        for (const endpoint of [initial, later]) {
          const settled = await endpoint.handle(gatewayInput).then(
            () => ({ rejected: false as const }),
            (failure: unknown) => ({ rejected: true as const, failure }),
          );
          expect(settled.rejected).toBe(true);
          if (!settled.rejected) throw Error('Gateway failure unexpectedly resolved');
          expect(settled.failure).toBe(cause);
        }
      }
    },
  );
}

test('direct resume checks only valid namespaces and replays only currently readable cursor entries', async () => {
  const observed: { caller: CommandCaller; id: string }[] = [];
  const replayed: { points: Record<string, number>; context: InternalCallContext }[] = [];
  const visible = {
    status: 'replaying' as const,
    events: [{ seq: 7, message: { label: 'visible event' } }],
  };
  const [, resume] = internalRoutes({
    observation: {
      checkRead: (caller, id) => {
        observed.push(structuredClone({ caller, id }));
        return Promise.resolve({ ok: true, value: id === 'visible' });
      },
    },
    organizations: { resolve: () => Promise.resolve({ ok: true, access: gatewayScope }) },
    onForward: () => Promise.reject(Error('Unexpected resume forward')),
    onResume: (points, context) => {
      replayed.push(structuredClone({ points, context }));
      return Promise.resolve({ 'work-package:visible': visible });
    },
  });
  const denied = { status: 'denied', reason: 'forbidden' } as const;
  expect(
    await resume.handle({
      ...common,
      principal: user,
      body: {
        resume_points: {
          'work-package:visible': -2.5,
          'work-package:hidden': 0.25,
          'other:space': 9,
          'work-package:': 3,
        },
        trace_id: 'trace',
      },
    }),
  ).toEqual({
    ok: true,
    status: 200,
    body: {
      'work-package:visible': visible,
      'work-package:hidden': denied,
      'other:space': denied,
      'work-package:': denied,
    },
  });
  expect(observed).toEqual(
    ['visible', 'hidden'].map((id) => ({
      caller: { kind: 'human', principal: user, expectedAccess: gatewayScope },
      id,
    })),
  );
  expect(replayed).toEqual([
    {
      points: { 'work-package:visible': -2.5 },
      context: { clientId: 'client', connectionId: 'connection', traceId: 'trace' },
    },
  ]);
});

test('direct resume retains nested caller and copied cursor entries before initial resolution waits', async () => {
  const evidence = createGatewayPrincipal();
  const retained = structuredClone(evidence.principal);
  const points: Record<string, number> = { 'work-package:original': 0.5 };
  const body = { resume_points: points, trace_id: 'original-trace' };
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  const observedCalls: { caller: CommandCaller; id: string }[] = [];
  const replayCalls: { points: Record<string, number>; context: InternalCallContext }[] = [];
  const resolutions: OrganizationPrincipal[] = [];
  const [, resume] = internalRoutes({
    observation: {
      checkRead: (caller, id) => {
        observedCalls.push(structuredClone({ caller, id }));
        return Promise.resolve({ ok: true, value: true });
      },
    },
    organizations: {
      async resolve(principal) {
        resolutions.push(structuredClone(principal));
        entered.resolve(undefined);
        await released.promise;
        return { ok: true, access: gatewayScope };
      },
    },
    onForward: () => Promise.reject(Error('Unexpected held resume forward')),
    onResume: (selected, context) => {
      replayCalls.push(structuredClone({ points: selected, context }));
      return Promise.resolve({});
    },
  });
  const observed = resume.handle({ ...common, principal: evidence.principal, body }).then(
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
      throw Error('Resume settled before initial resolver entry');
    }
    evidence.principal.id = 'changed-top-level';
    evidence.authentication.issuedAt = 99;
    evidence.scopes.splice(0, evidence.scopes.length, 'editor');
    evidence.organizationBinding.cookie = 'changed-cookie';
    evidence.organizationBinding.credential.expiresAt = 1;
    evidence.delegation.organizationId = 'changed-org';
    evidence.delegation.client = 'changed-client';
    evidence.delegation.grant = 'changed-grant';
    points['work-package:original'] = 99;
    points['work-package:injected'] = -9;
    body.resume_points = { 'work-package:replacement': 7 };
    body.trace_id = 'changed-trace';
  } catch (cause: unknown) {
    primary = { cause };
  }
  released.resolve(undefined);
  const settled = await observed;
  if (primary !== undefined) {
    if (!settled.ok && !primaryOwnsPending)
      throw new AggregateError(
        [primary.cause, settled.cause],
        'Resume entry and settlement failed',
        { cause: primary.cause },
      );
    throw primary.cause;
  }
  if (!settled.ok) throw settled.cause;
  expect(settled.value).toEqual({ ok: true, status: 200, body: {} });
  expect(resolutions).toEqual([retained]);
  expect(observedCalls).toEqual([
    {
      caller: { kind: 'human', principal: retained, expectedAccess: gatewayScope },
      id: 'original',
    },
  ]);
  expect(replayCalls).toEqual([
    {
      points: { 'work-package:original': 0.5 },
      context: { clientId: 'client', connectionId: 'connection', traceId: 'original-trace' },
    },
  ]);
});

test('direct resume denies initial and later current refusals without passing those subscriptions to replay', async () => {
  for (const stage of ['initial', 'observed'] as const) {
    const calls: string[] = [];
    const replayCalls: Record<string, number>[] = [];
    const [, resume] = internalRoutes({
      observation: {
        checkRead: (_caller, id) => {
          calls.push(id);
          return Promise.resolve({ ok: false, refusal: 'organization_context_changed' });
        },
      },
      organizations: {
        resolve: () =>
          Promise.resolve(
            stage === 'initial'
              ? { ok: false, refusal: 'not_a_member' }
              : { ok: true, access: gatewayScope },
          ),
      },
      onForward: () => Promise.reject(Error('Unexpected refused resume forward')),
      onResume: (points) => {
        replayCalls.push(structuredClone(points));
        return Promise.resolve({});
      },
    });
    expect(
      await resume.handle({
        ...common,
        principal: user,
        body: {
          resume_points: { 'work-package:private': -1, 'other:invalid': 2 },
          trace_id: 'trace',
        },
      }),
    ).toEqual({
      ok: true,
      status: 200,
      body: {
        'work-package:private': { status: 'denied', reason: 'forbidden' },
        'other:invalid': { status: 'denied', reason: 'forbidden' },
      },
    });
    expect(calls).toEqual(stage === 'initial' ? [] : ['private']);
    expect(replayCalls).toEqual([{}]);
  }
});

test('direct resume preserves initial and observed unknown rejections including undefined without replay', async () => {
  for (const cause of [
    Error('resume observer unavailable'),
    new ValidationError('trusted resume invalid'),
    undefined,
    new AggregateError([Error('first'), Error('second')], 'paired resume failure'),
  ]) {
    const rejectResumeFailure = () =>
      Promise.resolve().then(() => {
        const failure: unknown = cause;
        throw failure;
      });
    for (const stage of ['initial', 'observed'] as const) {
      let replays = 0;
      const [, resume] = internalRoutes({
        observation: { checkRead: rejectResumeFailure },
        organizations: {
          resolve:
            stage === 'initial'
              ? rejectResumeFailure
              : () => Promise.resolve({ ok: true, access: gatewayScope }),
        },
        onForward: () => Promise.reject(Error('Unexpected failed resume forward')),
        onResume: () => {
          replays++;
          return Promise.resolve({});
        },
      });
      const settled = await resume
        .handle({
          ...common,
          principal: user,
          body: { resume_points: { 'work-package:private': 0.5 }, trace_id: 'trace' },
        })
        .then(
          () => ({ rejected: false as const }),
          (failure: unknown) => ({ rejected: true as const, failure }),
        );
      expect(settled.rejected).toBe(true);
      if (!settled.rejected) throw Error('Resume failure unexpectedly resolved');
      expect(settled.failure).toBe(cause);
      expect(replays).toBe(0);
    }
  }
});
