import type { ResourceRuntimeAdmission, ResourceRuntimeEvent } from '@wbs/contracts';
import type { AuthenticatedUser } from '@wbs/contracts';
import { bindResourceAuthority, registerResourceUse } from '@wbs/contracts';
import type { ResourceAccess, ResourceRuntimeActor } from '@wbs/core';
import type { ResourceRuntime, ResourceUses } from '@wbs/core';
import { resourceRuntimeRoutes } from '@wbs/core/http/resource-runtime.routes';
import { resourceUseActorOf, resourceUseRoutes } from '@wbs/core/http/resource-use.routes';
import { retainSecurityPrincipal } from '@wbs/core/ports/security-principal';
import { CONTRIBUTOR_CAP } from '@wbs/domain';
import { AccessDecisionRepository } from '@wbs/store-sqlite/access-decisions';
import { openConnection } from '@wbs/store-sqlite/db';
import { WriteCoordinator } from '@wbs/store-sqlite/gate';
import { SqliteResourceRuntime } from '@wbs/store-sqlite/resource-runtime';
import { SqliteResourceUses } from '@wbs/store-sqlite/resource-use';
import { afterEach, beforeAll, beforeEach, expect, it, spyOn } from 'bun:test';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import { type HarnessMachineGrants, OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
let machineGrants: HarnessMachineGrants;
beforeAll(async () => {
  machineGrants = await forwardingMachineGrants();
});
beforeEach(async () => {
  harness = OrganizationHarness.openComposedWith({ machineGrants });
  for (const username of ['keeper', 'substitute']) await harness.register(username);
  harness.organization('org-a');
  for (const username of ['keeper', 'substitute']) {
    harness.member('org-a', username, 'viewer', ['org-super-admin']);
    harness.bind(username, 'org-a');
  }
  harness.activate();
});
afterEach(async () => harness.closeComposed());

async function openBoundary() {
  const connection = openConnection(harness.databasePath());
  const gate = new WriteCoordinator();
  const principal = await harness.authenticatedCommandPrincipal('keeper', '');
  const access: Extract<ResourceAccess, { kind: 'scoped' }> = {
    kind: 'scoped',
    scope: { organizationId: 'org-a', userId: principal.id, role: 'viewer', cap: null },
    principal: {
      id: principal.id,
      authentication: structuredClone(principal.authentication),
    },
  };
  const actor = {
    ...resourceUseActorOf(principal, access),
    principal: retainSecurityPrincipal(principal),
    credentialId: null,
  };
  return {
    connection,
    gate,
    actor,
    uses: new SqliteResourceUses(connection.db, gate),
    runtime: new SqliteResourceRuntime(connection.db, gate),
  };
}
const operations = [
  'register',
  'append',
  'list',
  'history',
  'bind',
  'read',
  'admit',
  'ingest',
  'requests',
] as const;
type Operation = (typeof operations)[number];
function invoke(
  boundary: Awaited<ReturnType<typeof openBoundary>>,
  operation: Operation,
  actor: ResourceRuntimeActor,
): Promise<unknown> {
  const use = {
    projectId: 'addressed-package',
    resourceId: 'addressed-resource',
    workItemId: 'addressed-work',
    agentRun: 'run-a',
    responsiblePersonId: 'agent-a',
    locator: '/display/checkout',
    units: 1,
    kind: 'temporary_directory' as const,
    reservedDiskUnits: 1,
    reservedWorkspaceUnits: 1,
  };
  const admission: ResourceRuntimeAdmission = {
    eventId: 'registration-event',
    epoch: 'epoch-a',
    useId: 'addressed-use',
    incarnation: 'incarnation-a',
    observedAt: 1,
    reason: 'Register checkout',
    use,
  };
  const event: ResourceRuntimeEvent = {
    ...admission,
    sequence: 1,
    revision: 1,
    kind: 'registered',
  };
  switch (operation) {
    case 'register':
      return boundary.uses.register(
        use.projectId,
        actor,
        { ...use, requestId: 'registration-request' },
        2,
      );
    case 'append':
      return boundary.uses.append(
        use.projectId,
        admission.useId,
        actor,
        {
          eventId: 'cleanup-event',
          expectedRevision: 1,
          kind: 'cleanup_requested',
          reason: 'Request cleanup',
        },
        2,
      );
    case 'list':
      return boundary.uses.list(use.projectId, actor, { limit: 50 });
    case 'history':
      return boundary.uses.history(use.projectId, admission.useId, actor, { limit: 50 });
    case 'bind':
      return boundary.runtime.bind(
        'addressed-authority',
        actor,
        { providerId: 'provider-a', credentialId: 'key-a', epoch: 'epoch-a' },
        2,
      );
    case 'read':
      return boundary.runtime.read('addressed-authority', actor);
    case 'admit':
      return boundary.runtime.admit('addressed-authority', actor, admission, 2);
    case 'ingest':
      return boundary.runtime.ingest('addressed-authority', actor, event, 2);
    case 'requests':
      return boundary.runtime.requests('addressed-authority', actor, 0, 50);
  }
}
function captureState() {
  return [
    'resource_use',
    'resource_use_event',
    'resource_authority',
    'resource_runtime_use',
    'resource_runtime_event',
    'resource_cleanup_request',
    'event_log',
    'organization_audit',
  ].map((table) => harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
}
for (const operation of operations) {
  for (const mismatch of ['actor', 'scope', 'authentication'] as const) {
    it(
      'rejects direct resource ' + operation + ' ' + mismatch + ' mismatch before reads',
      async () => {
        const boundary = await openBoundary();
        const original = captureState();
        const principal = await harness.authenticatedCommandPrincipal('substitute', '');
        const actor = boundary.actor;
        if (mismatch === 'actor')
          Object.assign(actor, { principal: retainSecurityPrincipal(principal) });
        else if (mismatch === 'scope') {
          if (actor.access.kind !== 'scoped') throw new Error('expected scoped boundary fixture');
          Object.assign(actor.access.scope, { userId: principal.id });
        } else {
          if (actor.access.kind !== 'scoped') throw new Error('expected scoped boundary fixture');
          Object.assign(actor.access, {
            principal: {
              id: actor.id,
              authentication: { kind: 'upstream', issuer: 'substituted', subject: 'substituted' },
            },
          });
        }
        const grant = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
        const select = spyOn(boundary.connection.db, 'select');
        const get = spyOn(boundary.connection.db, 'get');
        try {
          const failure = await Promise.resolve()
            .then(() => invoke(boundary, operation, actor))
            .then(
              () => null,
              (failure: unknown) => failure,
            );
          expect(failure).toBeInstanceOf(Error);
          if (!(failure instanceof Error))
            throw new Error('expected direct resource identity refusal');
          expect(failure.message).toContain('resource');
          expect(failure.message).toMatch(/principal|authentication|actor|scope/);
          expect(grant).toHaveBeenCalledTimes(0);
          expect(select).toHaveBeenCalledTimes(0);
          expect(get).toHaveBeenCalledTimes(0);
          expect(captureState()).toEqual(original);
        } finally {
          grant.mockRestore();
          select.mockRestore();
          get.mockRestore();
          boundary.connection.close();
        }
      },
    );
  }
}

async function makeMachineActor() {
  addAgentPerson(harness.sqlite, 'reporting-agent', 'org-a', harness.userId('keeper'));
  const credential = await issueApiKey(harness.sqlite, {
    organizationId: 'org-a',
    personId: 'reporting-agent',
    issuedBy: harness.userId('keeper'),
  });
  harness.sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('reporter-own-grant','org-a','organization','org-a','machine_credential',?,'project-contributor','route',1)",
    [credential.id],
  );
  const principal = await harness.authenticatedMachinePrincipal(credential.key);
  const access: Extract<ResourceAccess, { kind: 'scoped' }> = {
    kind: 'scoped',
    scope: { organizationId: 'org-a', userId: principal.id, role: 'viewer', cap: CONTRIBUTOR_CAP },
    principal: { id: principal.id, authentication: structuredClone(principal.authentication) },
  };
  return {
    principal,
    actor: {
      ...resourceUseActorOf(principal, access),
      principal: retainSecurityPrincipal(principal),
      credentialId: credential.id,
    },
  };
}
for (const operation of operations) {
  for (const mismatch of [
    'missing principal',
    'missing scoped principal',
    'fingerprint',
    'delegation organization',
    'unpinned person',
    'machine person',
  ] as const) {
    it('rejects direct resource ' + operation + ' ' + mismatch + ' before reads', async () => {
      const boundary = await openBoundary();
      const actor =
        mismatch === 'machine person' ? (await makeMachineActor()).actor : boundary.actor;
      const original = captureState();
      if (mismatch === 'missing principal') Object.assign(actor, { principal: undefined });
      else if (mismatch === 'missing scoped principal')
        Object.assign(actor.access, { principal: undefined });
      else if (mismatch === 'fingerprint')
        Object.assign(actor, { fingerprint: 'substituted-fingerprint' });
      else if (mismatch === 'delegation organization')
        Object.assign(actor.principal, {
          delegation: { organizationId: 'org-b', audience: 'wbs-be-01/direct' },
        });
      else
        Object.assign(actor, {
          personId: mismatch === 'machine person' ? 'other-agent' : 'reporting-agent',
        });
      const grant = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
      const select = spyOn(boundary.connection.db, 'select');
      const get = spyOn(boundary.connection.db, 'get');
      try {
        const failure = await Promise.resolve()
          .then(() => invoke(boundary, operation, actor))
          .then(
            () => null,
            (failure: unknown) => failure,
          );
        expect(failure).toBeInstanceOf(Error);
        if (!(failure instanceof Error)) throw new Error('expected direct resource tuple refusal');
        expect(failure.message).toContain('resource');
        expect(grant).toHaveBeenCalledTimes(0);
        expect(select).toHaveBeenCalledTimes(0);
        expect(get).toHaveBeenCalledTimes(0);
        expect(captureState()).toEqual(original);
      } finally {
        grant.mockRestore();
        select.mockRestore();
        get.mockRestore();
        boundary.connection.close();
      }
    });
  }
}
for (const operation of ['bind', 'read', 'admit', 'ingest', 'requests'] as const) {
  for (const kind of ['account', 'machine'] as const) {
    it(
      'rejects direct runtime ' + operation + ' ' + kind + ' credential mismatch before reads',
      async () => {
        const boundary = await openBoundary();
        const actor = kind === 'machine' ? (await makeMachineActor()).actor : boundary.actor;
        Object.assign(actor, { credentialId: 'substituted-key' });
        const original = captureState();
        const grant = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
        const select = spyOn(boundary.connection.db, 'select');
        const get = spyOn(boundary.connection.db, 'get');
        try {
          const failure = await Promise.resolve()
            .then(() => invoke(boundary, operation, actor))
            .then(
              () => null,
              (failure: unknown) => failure,
            );
          expect(failure).toBeInstanceOf(Error);
          if (!(failure instanceof Error))
            throw new Error('expected runtime credential tuple refusal');
          expect(failure.message).toContain('resource');
          expect(grant).toHaveBeenCalledTimes(0);
          expect(select).toHaveBeenCalledTimes(0);
          expect(get).toHaveBeenCalledTimes(0);
          expect(captureState()).toEqual(original);
        } finally {
          grant.mockRestore();
          select.mockRestore();
          get.mockRestore();
          boundary.connection.close();
        }
      },
    );
  }
}

function openRouteWindow(access: ResourceAccess) {
  const entered = Promise.withResolvers<undefined>(),
    held = Promise.withResolvers<undefined>();
  const calls: { operation: Operation; values: readonly unknown[] }[] = [];
  const record = (operation: Operation, values: readonly unknown[]) => {
    calls.push({ operation, values });
    return Promise.resolve({ ok: false as const, reason: 'invalid_body' as const });
  };
  const uses: ResourceUses = {
    register: (...values) => record('register', values),
    append: (...values) => record('append', values),
    list: (...values) => record('list', values),
    history: (...values) => record('history', values),
  };
  const runtime: ResourceRuntime = {
    bind: (...values) => record('bind', values),
    read: (...values) => record('read', values),
    admit: (...values) => record('admit', values),
    ingest: (...values) => record('ingest', values),
    requests: (...values) => record('requests', values),
  };
  let observed: AuthenticatedUser | undefined;
  const organizations = {
    resolve: async (principal: AuthenticatedUser) => {
      observed = principal;
      const retained = structuredClone(access);
      entered.resolve(undefined);
      await held.promise;
      return { ok: true as const, access: retained };
    },
  };
  return {
    entered,
    held,
    calls,
    uses: resourceUseRoutes(organizations, uses, { now: () => 123 }),
    runtime: resourceRuntimeRoutes(organizations, runtime, { now: () => 123 }),
    observed: () => observed,
  };
}
function invokeRoute(
  window: ReturnType<typeof openRouteWindow>,
  operation: Operation,
  principal: AuthenticatedUser,
) {
  const params = {
    id: 'original-package',
    useId: 'original-use',
    authorityId: 'original-authority',
  };
  const query = {
    limit: '4',
    cursor: '3',
    after: '3',
    workItemId: 'original-work',
    state: 'active' as const,
  };
  const use = {
    projectId: 'original-package',
    resourceId: 'original-resource',
    workItemId: 'original-work',
    agentRun: 'original-run',
    responsiblePersonId: 'reporting-agent',
    locator: '/original',
    units: 3,
    kind: 'temporary_directory' as const,
    reservedDiskUnits: 3,
    reservedWorkspaceUnits: 1,
  };
  const registration = { ...use, requestId: 'original-request' };
  const appended = {
    eventId: 'original-event',
    expectedRevision: 1,
    kind: 'retained' as const,
    reason: 'original-reason',
    ownerPersonId: 'reporting-agent',
    reviewAt: 999,
  };
  const binding = {
    providerId: 'original-provider',
    credentialId: 'original-key',
    epoch: 'original-epoch',
  };
  const admission = {
    eventId: 'original-event',
    epoch: 'original-epoch',
    useId: 'original-use',
    incarnation: 'original-incarnation',
    observedAt: 1,
    reason: 'original-reason',
    use,
  };
  const event = {
    ...admission,
    sequence: 1,
    revision: 1,
    kind: 'registered' as const,
    evidence: {
      digest: 'a'.repeat(64),
      locator: '/original-evidence',
      disposition: 'removed' as const,
      reclaimedBytes: null,
    },
    retention: { ownerPersonId: 'reporting-agent', reviewAt: 999 },
  };
  const request = {
    url: new URL('http://localhost'),
    method: 'POST',
    headers: new Headers(),
    signal: new AbortController().signal,
  };
  const common = { principal, params, request };
  let pending;
  switch (operation) {
    case 'register':
      pending = window.uses[0].handle({ ...common, query: undefined, body: registration });
      break;
    case 'append':
      pending = window.uses[1].handle({ ...common, query: undefined, body: appended });
      break;
    case 'list':
      pending = window.uses[2].handle({ ...common, query, body: undefined });
      break;
    case 'history':
      pending = window.uses[3].handle({ ...common, query, body: undefined });
      break;
    case 'bind':
      pending = window.runtime[0].handle({ ...common, query: undefined, body: binding });
      break;
    case 'read':
      pending = window.runtime[1].handle({ ...common, query: undefined, body: undefined });
      break;
    case 'admit':
      pending = window.runtime[2].handle({ ...common, query: undefined, body: admission });
      break;
    case 'ingest':
      pending = window.runtime[3].handle({ ...common, query: undefined, body: event });
      break;
    case 'requests':
      pending = window.runtime[4].handle({ ...common, query, body: undefined });
      break;
  }
  return { pending, params, query, use, registration, appended, binding, admission, event };
}
for (const operation of operations) {
  for (const alias of ['id', 'authentication', 'delegation', 'target'] as const) {
    it(
      'retains actual resource ' + operation + ' route ' + alias + ' before resolver await',
      async () => {
        const boundary = await openBoundary();
        const protocol =
          operation === 'admit' || operation === 'ingest' || operation === 'requests';
        const machine = protocol ? await makeMachineActor() : undefined;
        const principal =
          machine?.principal ?? (await harness.authenticatedCommandPrincipal('keeper', ''));
        const actor = machine?.actor ?? boundary.actor;
        const original = retainSecurityPrincipal(principal);
        const window = openRouteWindow(actor.access),
          invocation = invokeRoute(window, operation, principal);
        await window.entered.promise;
        const resolvedPrincipal = window.observed();
        if (resolvedPrincipal === undefined) throw new Error('resource resolver was not reached');
        expect(resolvedPrincipal.id).toBe(original.id);
        if (alias === 'id') resolvedPrincipal.id = harness.userId('substitute');
        else if (alias === 'authentication') {
          if (resolvedPrincipal.authentication === undefined)
            throw new Error('expected verified authentication');
          if (resolvedPrincipal.authentication.kind === 'machine')
            Object.assign(resolvedPrincipal.authentication, {
              credentialId: 'substituted-key',
              personId: 'substituted-person',
            });
          else
            Object.assign(resolvedPrincipal.authentication, {
              kind: 'machine',
              credentialId: 'substituted-key',
              personId: 'substituted-person',
            });
        } else if (alias === 'delegation')
          Object.assign(resolvedPrincipal, {
            delegation: { organizationId: 'org-b', audience: 'wbs-be-01/direct' },
          });
        else
          Object.assign(invocation.params, {
            id: 'substituted-package',
            useId: 'substituted-use',
            authorityId: 'substituted-authority',
          });
        window.held.resolve(undefined);
        try {
          expect((await invocation.pending).status).toBe(400);
          expect(window.calls).toHaveLength(1);
          const called = window.calls[0];
          expect(called).toBeDefined();
          expect(called.operation).toBe(operation);
          expect(called.values[0]).toBe(
            ['register', 'append', 'list', 'history'].includes(operation)
              ? 'original-package'
              : 'original-authority',
          );
          const actorIndex = operation === 'append' || operation === 'history' ? 2 : 1;
          expect(called.values[actorIndex]).toMatchObject({ id: original.id, principal: original });
          if (operation === 'append' || operation === 'history')
            expect(called.values[1]).toBe('original-use');
          expect(original.id).toBe(harness.userId('keeper'));
        } finally {
          window.held.resolve(undefined);
          await invocation.pending;
          boundary.connection.close();
        }
      },
    );
  }
}

for (const operation of operations.filter((operation) => operation !== 'read')) {
  it('retains resource ' + operation + ' route payload before resolver await', async () => {
    const boundary = await openBoundary();
    const protocol = operation === 'admit' || operation === 'ingest' || operation === 'requests';
    const machine = protocol ? await makeMachineActor() : undefined;
    const principal =
      machine?.principal ?? (await harness.authenticatedCommandPrincipal('keeper', ''));
    const window = openRouteWindow(machine?.actor.access ?? boundary.actor.access);
    const invocation = invokeRoute(window, operation, principal);
    await window.entered.promise;
    if (operation === 'register')
      Object.assign(invocation.registration, { locator: '/substituted', units: 9 });
    if (operation === 'append')
      Object.assign(invocation.appended, {
        reason: 'substituted',
        ownerPersonId: 'substituted-owner',
        reviewAt: 9999,
      });
    if (operation === 'bind')
      Object.assign(invocation.binding, {
        providerId: 'substituted-provider',
        credentialId: 'substituted-key',
        epoch: 'substituted-epoch',
      });
    if (operation === 'admit' || operation === 'ingest') {
      Object.assign(invocation.use, {
        locator: '/substituted',
        resourceId: 'substituted-resource',
        units: 9,
      });
      if (operation === 'ingest') {
        Object.assign(invocation.event.evidence, {
          digest: 'b'.repeat(64),
          locator: '/substituted-evidence',
        });
        Object.assign(invocation.event.retention, {
          ownerPersonId: 'substituted-owner',
          reviewAt: 9999,
        });
      }
    }
    if (operation === 'list' || operation === 'history' || operation === 'requests')
      Object.assign(invocation.query, {
        cursor: '9',
        limit: '9',
        after: '9',
        workItemId: 'substituted-work',
      });
    window.held.resolve(undefined);
    try {
      expect((await invocation.pending).status).toBe(400);
      expect(window.calls).toHaveLength(1);
      const called = window.calls[0];
      expect(called).toBeDefined();
      if (operation === 'register')
        expect(called.values[2]).toMatchObject({ locator: '/original', units: 3 });
      if (operation === 'append')
        expect(called.values[3]).toMatchObject({
          reason: 'original-reason',
          ownerPersonId: 'reporting-agent',
          reviewAt: 999,
        });
      if (operation === 'bind')
        expect(called.values[2]).toEqual({
          providerId: 'original-provider',
          credentialId: 'original-key',
          epoch: 'original-epoch',
        });
      if (operation === 'admit' || operation === 'ingest')
        expect(called.values[2]).toMatchObject({
          use: { resourceId: 'original-resource', locator: '/original', units: 3 },
        });
      if (operation === 'ingest')
        expect(called.values[2]).toMatchObject({
          evidence: { digest: 'a'.repeat(64), locator: '/original-evidence' },
          retention: { ownerPersonId: 'reporting-agent', reviewAt: 999 },
        });
      if (operation === 'list')
        expect(called.values[2]).toMatchObject({
          cursor: '3',
          limit: 4,
          workItemId: 'original-work',
        });
      if (operation === 'history')
        expect(called.values[3]).toMatchObject({ cursor: '3', limit: 4 });
      if (operation === 'requests') expect(called.values.slice(2)).toEqual([3, 4]);
    } finally {
      window.held.resolve(undefined);
      await invocation.pending;
      boundary.connection.close();
    }
  });
}

for (const field of [
  'first party time',
  'upstream issuer',
  'upstream subject',
  'machine credential',
  'machine person',
  'machine run',
  'consent issuer',
  'consent subject',
  'consent credential',
  'consent person',
] as const) {
  it('rejects direct resource authentication field ' + field + ' before reads', async () => {
    const boundary = await openBoundary();
    const machine = await makeMachineActor();
    const actor =
      field.startsWith('machine') || field.startsWith('consent') ? machine.actor : boundary.actor;
    let authentication: AuthenticatedUser['authentication'];
    if (field.startsWith('first')) authentication = { kind: 'first_party', issuedAt: 123 };
    else if (field.startsWith('upstream'))
      authentication = { kind: 'upstream', issuer: 'original-issuer', subject: 'original-subject' };
    else if (field.startsWith('consent'))
      authentication = {
        kind: 'consent',
        credentialId: machine.actor.credentialId,
        personId: 'reporting-agent',
        issuer: 'original-issuer',
        subject: 'original-subject',
      };
    else
      authentication = {
        kind: 'machine',
        credentialId: machine.actor.credentialId,
        personId: 'reporting-agent',
        runId: 'original-run',
      };
    const actual = { id: actor.id, authentication };
    const access = actor.access;
    if (access.kind !== 'scoped') throw new Error('expected auth field scope');
    Object.assign(
      actor,
      resourceUseActorOf(actual, {
        ...access,
        principal: { id: actor.id, authentication: structuredClone(authentication) },
      }),
    );
    const scoped =
      actor.access.kind === 'scoped' ? actor.access.principal.authentication : undefined;
    if (scoped === undefined) throw new Error('missing auth field fixture');
    Object.assign(
      scoped,
      field.endsWith('time')
        ? { issuedAt: 124 }
        : field.endsWith('issuer')
          ? { issuer: 'different-issuer' }
          : field.endsWith('subject')
            ? { subject: 'different-subject' }
            : field.endsWith('credential')
              ? { credentialId: crypto.randomUUID() }
              : field.endsWith('person')
                ? { personId: 'different-person' }
                : { runId: 'different-run' },
    );
    const grant = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt'),
      get = spyOn(boundary.connection.db, 'get'),
      select = spyOn(boundary.connection.db, 'select'),
      before = captureState();
    try {
      const failure = await Promise.resolve()
        .then(() => boundary.uses.list('addressed-package', actor, { limit: 50 }))
        .then(
          () => null,
          (failure: unknown) => failure,
        );
      expect(failure).toBeInstanceOf(Error);
      if (!(failure instanceof Error)) throw new Error('missing auth field invariant');
      expect(failure.message).toBe(
        'resource scoped authentication differs from the actual principal',
      );
      expect(grant).toHaveBeenCalledTimes(0);
      expect(get).toHaveBeenCalledTimes(0);
      expect(select).toHaveBeenCalledTimes(0);
      expect(captureState()).toEqual(before);
    } finally {
      grant.mockRestore();
      get.mockRestore();
      select.mockRestore();
      boundary.connection.close();
    }
  });
}
it('compares resource authentication by defined fields independently of property order', async () => {
  const boundary = await openBoundary(),
    machine = await makeMachineActor(),
    actor = machine.actor;
  if (actor.access.kind !== 'scoped' || actor.principal.authentication?.kind !== 'machine')
    throw new Error('missing machine field fixture');
  Object.assign(actor.access, {
    principal: {
      id: actor.id,
      authentication: {
        personId: actor.principal.authentication.personId,
        credentialId: actor.principal.authentication.credentialId,
        kind: 'machine',
      },
    },
  });
  try {
    expect(await boundary.uses.list('absent-package', actor, { limit: 50 })).toEqual({
      ok: false,
      reason: 'not_found',
    });
  } finally {
    boundary.connection.close();
  }
});
for (const [label, endpoint] of [
  ['manual', registerResourceUse],
  ['runtime', bindResourceAuthority],
] as const) {
  it(
    'validates the ' + label + ' resource refusal against the full permission catalogue',
    async () => {
      let forbidden: (typeof endpoint.refusals)[number] | undefined;
      for (const candidate of endpoint.refusals) {
        if (
          candidate.status === 403 &&
          (await candidate.schema.validator['~standard'].validate({ error: 'forbidden' }))
            .issues === undefined
        ) {
          forbidden = candidate;
          break;
        }
      }
      if (forbidden === undefined) throw new Error('missing resource forbidden contract');
      const validate = (value: unknown) => forbidden.schema.validator['~standard'].validate(value);
      expect(
        (await validate({ error: 'forbidden', permission: 'organization.manage_directory' }))
          .issues,
      ).toBeUndefined();
      expect(
        (await validate({ error: 'forbidden', permission: 'package.write' })).issues,
      ).toBeUndefined();
      expect((await validate({ error: 'forbidden' })).issues).toBeUndefined();
      expect(
        (await validate({ error: 'forbidden', permission: 'package.teleport' })).issues,
      ).toBeDefined();
    },
  );
}

for (const field of ['scalar actor', 'scoped principal id'] as const) {
  it('rejects the isolated resource ' + field + ' mismatch before every dependency', async () => {
    const boundary = await openBoundary(),
      actor = boundary.actor,
      before = captureState();
    if (field === 'scalar actor') actor.id = harness.userId('substitute');
    else {
      if (actor.access.kind !== 'scoped') throw new Error('missing scoped fixture');
      Object.assign(actor.access.principal, { id: harness.userId('substitute') });
    }
    const grant = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt'),
      get = spyOn(boundary.connection.db, 'get'),
      select = spyOn(boundary.connection.db, 'select');
    try {
      const failure = await Promise.resolve()
        .then(() => invoke(boundary, 'register', actor))
        .then(
          () => null,
          (failure: unknown) => failure,
        );
      expect(failure).toBeInstanceOf(Error);
      if (!(failure instanceof Error))
        throw new Error('expected isolated resource identity invariant');
      expect(failure.message).toContain(
        field === 'scalar actor' ? 'resource actor differs' : 'resource scope differs',
      );
      expect(grant).toHaveBeenCalledTimes(0);
      expect(get).toHaveBeenCalledTimes(0);
      expect(select).toHaveBeenCalledTimes(0);
      expect(captureState()).toEqual(before);
    } finally {
      grant.mockRestore();
      get.mockRestore();
      select.mockRestore();
      boundary.connection.close();
    }
  });
}
