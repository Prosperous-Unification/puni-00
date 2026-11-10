import type { OrganizationAccess } from '@wbs/core';
import type { ResourceAccess, UnitOfWork } from '@wbs/core';
import { clockOf } from '@wbs/core';
import { capacityModeRoutes } from '@wbs/core/http/capacity-mode.routes';
import { projectRankRoutes } from '@wbs/core/http/project-rank.routes';
import { CapacityModeResource } from '@wbs/core/service/capacity-mode.resource';
import { ProjectRankResource } from '@wbs/core/service/project-rank.resource';
import { standaloneCapacityModeSwitch } from '@wbs/core/service/standalone-capacity-mode';
import { standaloneRankStore } from '@wbs/core/service/standalone-rank';
import { AccessDecisionRepository } from '@wbs/store-sqlite/access-decisions';
import { openConnection } from '@wbs/store-sqlite/db';
import { OPEN } from '@wbs/store-sqlite/gate';
import {
  SqliteOrganizationAccess,
  userBoundOrganizationOf,
} from '@wbs/store-sqlite/organization-access';
import { ProjectRepository } from '@wbs/store-sqlite/project';
import { ProjectRankRepository } from '@wbs/store-sqlite/project-rank';
import { afterEach, beforeEach, expect, it, spyOn } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
let harness: OrganizationHarness;
let first: string;
let second: string;
const clock = clockOf({ now: () => 123456, newId: () => crypto.randomUUID() });
beforeEach(async () => {
  harness = OrganizationHarness.openComposedWith({
    supportedCapacityModes: ['isolated', 'shared'],
  });
  for (const username of ['keeper', 'other']) await harness.register(username);
  harness.organization('org-a');
  harness.organization('org-b');
  harness.member('org-a', 'keeper', 'viewer', ['org-super-admin']);
  harness.member('org-a', 'other', 'viewer');
  harness.grantPermissions('org-a', 'other', [
    'organization.manage_spaces',
    'organization.manage_capacity_mode',
  ]);
  for (const username of ['keeper', 'other']) harness.bind(username, 'org-a');
  harness.activate();
  for (const name of ['First', 'Second']) {
    const created = await harness.call('keeper', 'POST', '/api/projects', { name });
    if (created.status !== 200) throw new Error('rank/mode project setup refused');
    const saved = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM project WHERE name=?')
      .get(name);
    if (saved === null) throw new Error('rank/mode project setup missing');
    if (name === 'First') first = saved.id;
    else second = saved.id;
  }
});
afterEach(() => {
  harness.close();
});
function makeAccess(username = 'keeper'): Extract<ResourceAccess, { kind: 'scoped' }> {
  const id = harness.userId(username);
  return {
    kind: 'scoped',
    scope: { organizationId: 'org-a', userId: id, cap: null },
    principal: { id },
  };
}
function captureState() {
  return [
    'project_rank',
    'organization',
    'shared_people_audit',
    'event_log',
    'event_sequencer',
    'command_journal',
  ].map((table) => harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
}
function openResources(uow?: UnitOfWork) {
  const connection = openConnection(harness.databasePath());
  const boundary = harness.publicWrites();
  const delivery = boundary.committedFanout;
  if (delivery === undefined) throw new Error('rank/mode fixture lacks committed delivery');
  const raw = new ProjectRankRepository(connection.db, OPEN),
    catalog = new ProjectRepository(connection.db, OPEN);
  const ranks = standaloneRankStore(raw, uow ?? boundary.uow, delivery, boundary.commandAccess);
  const modes = standaloneCapacityModeSwitch(
    raw,
    uow ?? boundary.uow,
    delivery,
    boundary.commandAccess,
  );
  const projects = {
    listWithin: (actorId: string, access: ResourceAccess) => {
      if (access.kind === 'legacy') throw new Error('unexpected legacy project list');
      return catalog.listForInOrganization(actorId, access.scope.organizationId);
    },
  };
  const decisions = new AccessDecisionRepository(connection.db);
  return {
    connection,
    boundary,
    delivery,
    ranks,
    modes,
    projects,
    rankResource: new ProjectRankResource({ ranks, projects, clock, accessDecisions: decisions }),
    modeResource: new CapacityModeResource({
      modes,
      clock,
      supported: ['isolated', 'shared'],
      accessDecisions: decisions,
    }),
  };
}
async function captureFailure(pending: Promise<unknown>): Promise<Error> {
  const failure = await pending.then(
    () => null,
    (failure: unknown) => failure,
  );
  if (!(failure instanceof Error))
    throw new Error('expected production rank/mode rejection', { cause: failure });
  return failure;
}
const operations = ['rank read', 'rank move', 'mode read', 'mode switch'] as const;
type Operation = (typeof operations)[number];
async function invokeBoundary(
  fixture: ReturnType<typeof openResources>,
  operation: Operation,
  access: ResourceAccess,
) {
  const actor = await harness.authenticatedCommandPrincipal('keeper', '');
  switch (operation) {
    case 'rank read':
      return fixture.rankResource.read(actor.id, access);
    case 'rank move':
      return fixture.rankResource.move(actor, access, second, null);
    case 'mode read':
      return fixture.modeResource.read(access, false);
    case 'mode switch':
      return fixture.modeResource.switch(actor, access, true, false);
  }
}
for (const operation of operations) {
  for (const mismatch of operation === 'mode read'
    ? (['principal'] as const)
    : (['scope', 'principal'] as const)) {
    it(
      'rejects direct ' + operation + ' ' + mismatch + ' mismatch before grant and fact reads',
      async () => {
        const fixture = openResources(),
          access = makeAccess();
        const other = harness.userId('other');
        if (mismatch === 'scope')
          Object.assign(access, { scope: { ...access.scope, userId: other } });
        else Object.assign(access, { principal: { id: other } });
        const grant = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt'),
          rankRead = spyOn(fixture.ranks, 'orderIn'),
          rankWrite = spyOn(fixture.ranks, 'moveAfter'),
          modeRead = spyOn(fixture.modes, 'capacityModeIn'),
          modeWrite = spyOn(fixture.modes, 'switchCapacityMode'),
          names = spyOn(fixture.projects, 'listWithin'),
          published = spyOn(fixture.delivery, 'deliverCommitted');
        const before = captureState();
        try {
          const failure = await captureFailure(invokeBoundary(fixture, operation, access));
          expect(failure.message).toBe(
            operation === 'mode read'
              ? 'capacity-mode resource principal differs from its member'
              : operation === 'mode switch'
                ? 'capacity-mode resource authority differs from its actor'
                : 'rank resource authority differs from its actor',
          );
          for (const observer of [
            grant,
            rankRead,
            rankWrite,
            modeRead,
            modeWrite,
            names,
            published,
          ])
            expect(observer).not.toHaveBeenCalled();
          expect(captureState()).toEqual(before);
        } finally {
          for (const observer of [
            grant,
            rankRead,
            rankWrite,
            modeRead,
            modeWrite,
            names,
            published,
          ])
            observer.mockRestore();
          fixture.connection.close();
        }
      },
    );
  }
  it('accepts coherent current authority at direct ' + operation, async () => {
    const fixture = openResources();
    try {
      expect(await invokeBoundary(fixture, operation, makeAccess())).toMatchObject({ ok: true });
    } finally {
      fixture.connection.close();
    }
  });
  it('preserves organization_required for legacy ' + operation, async () => {
    const fixture = openResources();
    try {
      expect(await invokeBoundary(fixture, operation, { kind: 'legacy' })).toEqual({
        ok: false,
        refusal: 'organization_required',
      });
    } finally {
      fixture.connection.close();
    }
  });
}

for (const operation of ['rank read', 'rank move', 'mode read', 'mode switch'] as const) {
  const changes =
    operation === 'rank read'
      ? (['id'] as const)
      : operation === 'mode read'
        ? (['delegation'] as const)
        : (['id', 'authentication', 'delegation'] as const);
  for (const changed of changes) {
    it(
      'retains ' + operation + ' route ' + changed + ' before organization resolution',
      async () => {
        const observer = spyOn(SqliteOrganizationAccess.prototype, 'resolve'),
          original = observer.getMockImplementation();
        if (original === undefined) throw new Error('rank/mode resolver implementation absent');
        let resolutions = 0;
        observer.mockImplementation(async function (this: SqliteOrganizationAccess, principal) {
          const resolved = await original.call(this, principal);
          if (resolutions++ === 0) {
            if (changed === 'id') Object.assign(principal, { id: harness.userId('other') });
            if (changed === 'authentication') {
              if (principal.authentication === undefined)
                throw new Error('verified route authentication absent');
              Object.assign(principal.authentication, {
                kind: 'machine',
                credentialId: 'substitute',
                personId: 'substitute',
              });
            }
            if (changed === 'delegation')
              Object.assign(principal, {
                delegation: { organizationId: 'org-b', audience: 'wbs-be-01/direct' },
              });
          }
          return resolved;
        });
        try {
          const reply =
            operation === 'rank read'
              ? await harness.call('keeper', 'GET', '/api/organization/project-rank')
              : operation === 'rank move'
                ? await harness.call(
                    'keeper',
                    'POST',
                    '/api/organization/projects/' + second + '/rank',
                    { afterProjectId: null },
                  )
                : operation === 'mode read'
                  ? await harness.call('keeper', 'GET', '/api/organization')
                  : await harness.call('keeper', 'PATCH', '/api/organization', {
                      sharedPeople: true,
                    });
          expect(reply.status).toBe(200);
          if (operation === 'mode read') expect(reply.body).toMatchObject({ canSwitch: true });
          if (operation === 'rank move')
            expect(reply.body).toMatchObject({
              projects: [{ projectId: second }, { projectId: first }],
            });
          if (operation === 'mode switch') expect(reply.body).toMatchObject({ sharedPeople: true });
          expect(resolutions).toBe(
            operation === 'rank move' || operation === 'mode switch' ? 2 : 1,
          );
        } finally {
          observer.mockRestore();
        }
      },
    );
  }
}
for (const changed of ['target', 'destination', 'sharedPeople'] as const) {
  it('retains rank/mode route ' + changed + ' before the bound resolver await', async () => {
    const fixture = openResources(),
      caller = await harness.authenticatedCommandPrincipal('keeper', '');
    const held = Promise.withResolvers<undefined>(),
      entered = Promise.withResolvers<undefined>();
    const actual = new SqliteOrganizationAccess(
      fixture.connection.db,
      userBoundOrganizationOf(() => Promise.resolve('org-a')),
      () => Date.now(),
    );
    const organizations: OrganizationAccess = {
      resolve: async (principal) => {
        const resolved = await actual.resolve(principal);
        entered.resolve(undefined);
        await held.promise;
        return resolved;
      },
    };
    const rankEndpoints = projectRankRoutes(fixture.rankResource, organizations),
      modeEndpoints = capacityModeRoutes(fixture.modeResource, organizations);
    const params = { id: second },
      body = { afterProjectId: null as string | null },
      mode = { sharedPeople: true };
    const request = {
      method: changed === 'sharedPeople' ? 'PATCH' : 'POST',
      url: new URL('http://localhost'),
      headers: new Headers({ 'X-WBS-Expected-Organization': 'org-a' }),
      signal: new AbortController().signal,
    };
    const pending =
      changed === 'sharedPeople'
        ? modeEndpoints[1].handle({
            principal: caller,
            params: {},
            query: undefined,
            body: mode,
            request,
          })
        : rankEndpoints[1].handle({ principal: caller, params, query: undefined, body, request });
    await entered.promise;
    if (changed === 'target') params.id = first;
    else if (changed === 'destination') body.afterProjectId = first;
    else mode.sharedPeople = false;
    held.resolve(undefined);
    try {
      const reply = await pending;
      expect(reply.status).toBe(200);
      expect(reply.body).toMatchObject(
        changed === 'sharedPeople'
          ? { sharedPeople: true }
          : { projects: [{ projectId: second }, { projectId: first }] },
      );
    } finally {
      held.resolve(undefined);
      fixture.connection.close();
    }
  });
}

function wrapOwner(patch: 'retired slots' | 'capture' | 'ranks' | 'grants'): UnitOfWork {
  const owner = harness.publicWrites().uow;
  return {
    run: (perform) =>
      owner.run((scope) => {
        if (patch === 'capture') {
          const { fanoutCapture, ...without } = scope;
          return perform(without);
        }
        if (patch === 'ranks') {
          const { projectRanks, ...stores } = scope.stores;
          return perform({ ...scope, stores });
        }
        if (patch === 'grants') {
          const { accessDecisions, ...stores } = scope.stores;
          return perform({ ...scope, stores });
        }
        if (scope.fanoutCapture === undefined) throw new Error('fixture lacks actual capture');
        const capture = { ...scope.fanoutCapture };
        Reflect.deleteProperty(capture, 'authorizeRankMove');
        Reflect.deleteProperty(capture, 'authorizeModeSwitch');
        expect(Object.hasOwn(capture, 'authorizeRankMove')).toBe(false);
        expect(Object.hasOwn(capture, 'authorizeModeSwitch')).toBe(false);
        return perform({ ...scope, fanoutCapture: capture });
      }),
  };
}
for (const operation of ['rank', 'mode'] as const) {
  for (const stale of ['user', 'organization'] as const) {
    it(
      'preserves stale expected ' + stale + ' as a modeled conflict at standalone ' + operation,
      async () => {
        const fixture = openResources(),
          principal = await harness.authenticatedCommandPrincipal('keeper', '');
        const expected = makeAccess();
        if (stale === 'user') Object.assign(expected.scope, { userId: harness.userId('other') });
        else Object.assign(expected.scope, { organizationId: 'org-b' });
        const caller = { kind: 'human' as const, principal, expectedAccess: expected };
        const before = captureState(),
          published = spyOn(fixture.delivery, 'deliverCommitted');
        try {
          const outcome =
            operation === 'rank'
              ? await fixture.ranks.moveAfter(
                  'org-a',
                  second,
                  null,
                  clock.stampFor(principal.id),
                  caller,
                )
              : await fixture.modes.switchCapacityMode(
                  'org-a',
                  'shared',
                  clock.stampFor(principal.id),
                  crypto.randomUUID(),
                  caller,
                );
          expect(outcome).toEqual({
            ok: false,
            authority: { ok: false, refusal: 'organization_context_changed' },
          });
          expect(captureState()).toEqual(before);
          expect(published).not.toHaveBeenCalled();
        } finally {
          published.mockRestore();
          fixture.connection.close();
        }
      },
    );
  }
  for (const alias of ['by', 'at'] as const) {
    it(
      'retains standalone ' + operation + ' queued stamp ' + alias + ' before admitted ownership',
      async () => {
        const fixture = openResources(),
          principal = await harness.authenticatedCommandPrincipal('keeper', ''),
          stamp = { by: principal.id, at: 123456 },
          caller = { kind: 'human' as const, principal, expectedAccess: makeAccess() };
        const held = Promise.withResolvers<undefined>(),
          entered = Promise.withResolvers<undefined>();
        const blocker = harness.holdWriteTurn(held.promise, () => {
          entered.resolve(undefined);
        });
        await entered.promise;
        const auditId = crypto.randomUUID();
        const pending =
          operation === 'rank'
            ? fixture.ranks.moveAfter('org-a', second, null, stamp, caller)
            : fixture.modes.switchCapacityMode('org-a', 'shared', stamp, auditId, caller);
        if (alias === 'by') stamp.by = harness.userId('other');
        else stamp.at = 124456;
        held.resolve(undefined);
        await blocker;
        try {
          expect(await pending).toMatchObject({ ok: true });
          if (operation === 'rank') {
            const rows = harness.sqlite
              .query<{ created_by: string; created_at: number }, []>(
                'SELECT created_by,created_at FROM project_rank',
              )
              .all();
            expect(rows).toHaveLength(2);
            expect(
              rows.every((row) => row.created_by === principal.id && row.created_at === 123456),
            ).toBe(true);
          } else
            expect(
              harness.sqlite
                .query<{ actor_id: string; created_at: number }, [string]>(
                  'SELECT actor_id,created_at FROM shared_people_audit WHERE id=?',
                )
                .get(auditId),
            ).toEqual({ actor_id: principal.id, created_at: 123456 });
        } finally {
          held.resolve(undefined);
          try {
            await pending;
          } finally {
            fixture.connection.close();
          }
        }
      },
    );
  }
  for (const missing of ['capture', 'grants'] as const) {
    it('requires ' + missing + ' before a standalone ' + operation + ' no-op', async () => {
      const fixture = openResources(wrapOwner(missing)),
        principal = await harness.authenticatedCommandPrincipal('keeper', ''),
        caller = { kind: 'human' as const, principal, expectedAccess: makeAccess() },
        before = captureState();
      const published = spyOn(fixture.delivery, 'deliverCommitted');
      try {
        const failure = await captureFailure(
          operation === 'rank'
            ? fixture.ranks.moveAfter('org-a', first, first, clock.stampFor(principal.id), caller)
            : fixture.modes.switchCapacityMode(
                'org-a',
                'isolated',
                clock.stampFor(principal.id),
                crypto.randomUUID(),
                caller,
              ),
        );
        expect(failure.message).toContain(
          missing === 'grants' ? 'no access decisions' : 'lacks borrowed',
        );
        expect(captureState()).toEqual(before);
        expect(published).not.toHaveBeenCalled();
      } finally {
        published.mockRestore();
        fixture.connection.close();
      }
    });
  }
  it('propagates unreadable grant state before a standalone ' + operation + ' no-op', async () => {
    const fixture = openResources(),
      principal = await harness.authenticatedCommandPrincipal('keeper', ''),
      caller = { kind: 'human' as const, principal, expectedAccess: makeAccess() };
    harness.sqlite.run('ALTER TABLE access_grant RENAME TO unreadable_access_grant');
    const before = captureState();
    try {
      const failure = await captureFailure(
        operation === 'rank'
          ? fixture.ranks.moveAfter('org-a', first, first, clock.stampFor(principal.id), caller)
          : fixture.modes.switchCapacityMode(
              'org-a',
              'isolated',
              clock.stampFor(principal.id),
              crypto.randomUUID(),
              caller,
            ),
      );
      expect(failure.message).toContain('access_grant');
      expect(captureState()).toEqual(before);
    } finally {
      fixture.connection.close();
    }
  });
}
it('moves rank with current grants and no retired role-authority slots', async () => {
  const fixture = openResources(wrapOwner('retired slots')),
    principal = await harness.authenticatedCommandPrincipal('keeper', '');
  try {
    expect(
      await fixture.ranks.moveAfter('org-a', second, null, clock.stampFor(principal.id), {
        kind: 'human',
        principal,
        expectedAccess: makeAccess(),
      }),
    ).toMatchObject({ ok: true, order: [{ projectId: second }, { projectId: first }] });
    expect(harness.sqlite.query('SELECT project_id FROM project_rank').all()).toHaveLength(2);
  } finally {
    fixture.connection.close();
  }
});
it('requires the borrowed rank store before a standalone self move', async () => {
  const fixture = openResources(wrapOwner('ranks')),
    principal = await harness.authenticatedCommandPrincipal('keeper', ''),
    before = captureState(),
    grant = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
  try {
    expect(
      (
        await captureFailure(
          fixture.ranks.moveAfter('org-a', first, first, clock.stampFor(principal.id), {
            kind: 'human',
            principal,
            expectedAccess: makeAccess(),
          }),
        )
      ).message,
    ).toContain('lacks borrowed');
    expect(grant).not.toHaveBeenCalled();
    expect(captureState()).toEqual(before);
  } finally {
    grant.mockRestore();
    fixture.connection.close();
  }
});

function pauseResource(
  fixture: ReturnType<typeof openResources>,
  operation: Operation,
  entered: () => void,
  hold: Promise<undefined>,
): () => void {
  if (operation === 'rank read') {
    const observer = spyOn(fixture.ranks, 'orderIn'),
      original = observer.getMockImplementation();
    if (original === undefined) throw new Error('rank fact reader absent');
    observer.mockImplementation(async function (...args) {
      entered();
      await hold;
      return original.apply(fixture.ranks, args);
    });
    return () => {
      observer.mockRestore();
    };
  }
  if (operation === 'mode read') {
    const observer = spyOn(fixture.modes, 'capacityModeIn'),
      original = observer.getMockImplementation();
    if (original === undefined) throw new Error('mode fact reader absent');
    observer.mockImplementation(async function (...args) {
      entered();
      await hold;
      return original.apply(fixture.modes, args);
    });
    return () => {
      observer.mockRestore();
    };
  }
  const observer = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt'),
    original = observer.getMockImplementation();
  if (original === undefined) throw new Error('rank/mode grant reader absent');
  let paused = false;
  observer.mockImplementation(async function (this: AccessDecisionRepository, ...args) {
    if (!paused) {
      paused = true;
      entered();
      await hold;
    }
    return original.apply(this, args);
  });
  return () => {
    observer.mockRestore();
  };
}
function invokeResource(
  fixture: ReturnType<typeof openResources>,
  operation: Operation,
  actor: Awaited<ReturnType<OrganizationHarness['authenticatedCommandPrincipal']>>,
  access: ResourceAccess,
): Promise<unknown> {
  switch (operation) {
    case 'rank read':
      return fixture.rankResource.read(actor.id, access);
    case 'rank move':
      return fixture.rankResource.move(actor, access, second, null);
    case 'mode read':
      return fixture.modeResource.read(access, false);
    case 'mode switch':
      return fixture.modeResource.switch(actor, access, true, false);
  }
}
for (const operation of operations) {
  it('retains direct ' + operation + ' scoped evidence before its awaited dependency', async () => {
    const fixture = openResources(),
      actor = await harness.authenticatedCommandPrincipal('keeper', ''),
      access = makeAccess(),
      held = Promise.withResolvers<undefined>(),
      entered = Promise.withResolvers<undefined>();
    const restore = pauseResource(
      fixture,
      operation,
      () => {
        entered.resolve(undefined);
      },
      held.promise,
    );
    const pending = invokeResource(fixture, operation, actor, access);
    await entered.promise;
    Object.assign(access.scope, { organizationId: 'org-b', userId: harness.userId('other') });
    Object.assign(access.principal, { id: harness.userId('other') });
    held.resolve(undefined);
    try {
      const outcome = await pending;
      expect(outcome).toMatchObject(
        operation === 'rank read' || operation === 'rank move'
          ? {
              ok: true,
              projects: [
                expect.objectContaining({ projectId: operation === 'rank read' ? first : second }),
                expect.anything(),
              ],
            }
          : { ok: true, canSwitch: true },
      );
    } finally {
      held.resolve(undefined);
      restore();
      try {
        await pending;
      } finally {
        fixture.connection.close();
      }
    }
  });
  it('throws before facts for a missing direct ' + operation + ' grant principal', async () => {
    const fixture = openResources(),
      access = makeAccess();
    Reflect.deleteProperty(access, 'principal');
    const grant = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt'),
      rankRead = spyOn(fixture.ranks, 'orderIn'),
      modeRead = spyOn(fixture.modes, 'capacityModeIn'),
      before = captureState();
    try {
      expect(await captureFailure(invokeBoundary(fixture, operation, access))).toBeInstanceOf(
        Error,
      );
      expect(grant).not.toHaveBeenCalled();
      expect(rankRead).not.toHaveBeenCalled();
      expect(modeRead).not.toHaveBeenCalled();
      expect(captureState()).toEqual(before);
    } finally {
      grant.mockRestore();
      rankRead.mockRestore();
      modeRead.mockRestore();
      fixture.connection.close();
    }
  });
}
for (const operation of ['rank move', 'mode switch'] as const) {
  for (const changed of ['access authentication', 'actor id', 'actor authentication'] as const) {
    it(
      'retains direct ' + operation + ' ' + changed + ' before awaited grant evaluation',
      async () => {
        const fixture = openResources(),
          actor = await harness.authenticatedCommandPrincipal('keeper', ''),
          access = makeAccess();
        if (actor.authentication === undefined)
          throw new Error('actual account authentication absent');
        Object.assign(access.principal, { authentication: structuredClone(actor.authentication) });
        const held = Promise.withResolvers<undefined>(),
          entered = Promise.withResolvers<undefined>(),
          restore = pauseResource(
            fixture,
            operation,
            () => {
              entered.resolve(undefined);
            },
            held.promise,
          );
        const pending = invokeResource(fixture, operation, actor, access);
        await entered.promise;
        if (changed === 'actor id') Object.assign(actor, { id: harness.userId('other') });
        else if (changed === 'actor authentication')
          Object.assign(actor.authentication, {
            kind: 'machine',
            credentialId: 'substitute',
            personId: 'substitute',
          });
        else {
          if (access.principal.authentication === undefined)
            throw new Error('scoped authentication absent');
          Object.assign(access.principal.authentication, {
            kind: 'machine',
            credentialId: 'substitute',
            personId: 'substitute',
          });
        }
        held.resolve(undefined);
        try {
          expect(await pending).toMatchObject({ ok: true });
        } finally {
          held.resolve(undefined);
          restore();
          try {
            await pending;
          } finally {
            fixture.connection.close();
          }
        }
      },
    );
  }
}

for (const operation of ['rank move', 'mode switch'] as const) {
  it('uses a minimal current grant at ' + operation + ' despite viewer storage', async () => {
    const reply =
      operation === 'rank move'
        ? await harness.call('other', 'POST', '/api/organization/projects/' + second + '/rank', {
            afterProjectId: null,
          })
        : await harness.call('other', 'PATCH', '/api/organization', { sharedPeople: true });
    expect(reply.status).toBe(200);
  });
}

it('retains mode read scoped authentication before its awaited fact read', async () => {
  const fixture = openResources(),
    actor = await harness.authenticatedCommandPrincipal('keeper', ''),
    access = makeAccess();
  if (actor.authentication === undefined) throw new Error('actual account authentication absent');
  Object.assign(access.principal, { authentication: structuredClone(actor.authentication) });
  const held = Promise.withResolvers<undefined>(),
    entered = Promise.withResolvers<undefined>(),
    restore = pauseResource(
      fixture,
      'mode read',
      () => {
        entered.resolve(undefined);
      },
      held.promise,
    );
  const pending = fixture.modeResource.read(access, false);
  await entered.promise;
  if (access.principal.authentication === undefined)
    throw new Error('scoped authentication absent');
  Object.assign(access.principal.authentication, {
    kind: 'machine',
    credentialId: 'substitute',
    personId: 'substitute',
  });
  held.resolve(undefined);
  try {
    expect(await pending).toMatchObject({ ok: true, canSwitch: true });
  } finally {
    held.resolve(undefined);
    restore();
    try {
      await pending;
    } finally {
      fixture.connection.close();
    }
  }
});
for (const operation of ['rank', 'mode'] as const) {
  it(
    'names the current ' + operation + ' permission before a role-only standalone no-op',
    async () => {
      const principal = await harness.authenticatedCommandPrincipal('other', '');
      harness.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [principal.id]);
      harness.sqlite.run("UPDATE organization_membership SET role='super_admin' WHERE user_id=?", [
        principal.id,
      ]);
      const fixture = openResources(),
        caller = { kind: 'human' as const, principal, expectedAccess: makeAccess('other') },
        before = captureState(),
        published = spyOn(fixture.delivery, 'deliverCommitted');
      try {
        const outcome =
          operation === 'rank'
            ? await fixture.ranks.moveAfter(
                'org-a',
                first,
                first,
                clock.stampFor(principal.id),
                caller,
              )
            : await fixture.modes.switchCapacityMode(
                'org-a',
                'isolated',
                clock.stampFor(principal.id),
                crypto.randomUUID(),
                caller,
              );
        expect(outcome).toEqual({
          ok: false,
          reason: 'forbidden',
          permission:
            operation === 'rank'
              ? 'organization.manage_spaces'
              : 'organization.manage_capacity_mode',
        });
        expect(captureState()).toEqual(before);
        expect(published).not.toHaveBeenCalled();
      } finally {
        published.mockRestore();
        fixture.connection.close();
      }
    },
  );
  it(
    'retains standalone ' + operation + ' queued caller authority and expected context',
    async () => {
      const fixture = openResources(),
        principal = await harness.authenticatedCommandPrincipal('keeper', ''),
        actorId = principal.id,
        caller = { kind: 'human' as const, principal, expectedAccess: makeAccess() };
      if (principal.authentication === undefined)
        throw new Error('actual caller authentication absent');
      const stamp = clock.stampFor(actorId),
        auditId = crypto.randomUUID(),
        held = Promise.withResolvers<undefined>(),
        entered = Promise.withResolvers<undefined>();
      const blocker = harness.holdWriteTurn(held.promise, () => {
        entered.resolve(undefined);
      });
      await entered.promise;
      const pending =
        operation === 'rank'
          ? fixture.ranks.moveAfter('org-a', second, null, stamp, caller)
          : fixture.modes.switchCapacityMode('org-a', 'shared', stamp, auditId, caller);
      Object.assign(principal, { id: harness.userId('other') });
      Object.assign(principal.authentication, {
        kind: 'machine',
        credentialId: 'substitute',
        personId: 'substitute',
      });
      Object.assign(caller.expectedAccess.scope, {
        organizationId: 'org-b',
        userId: harness.userId('other'),
      });
      Object.assign(caller.expectedAccess.principal, { id: harness.userId('other') });
      held.resolve(undefined);
      await blocker;
      try {
        expect(await pending).toMatchObject({ ok: true });
        const actors =
          operation === 'rank'
            ? harness.sqlite
                .query<{ actor_id: string }, []>('SELECT created_by AS actor_id FROM project_rank')
                .all()
            : harness.sqlite
                .query<{ actor_id: string }, [string]>(
                  'SELECT actor_id FROM shared_people_audit WHERE id=?',
                )
                .all(auditId);
        expect(actors.length).toBeGreaterThan(0);
        expect(actors.every((row) => row.actor_id === actorId)).toBe(true);
      } finally {
        held.resolve(undefined);
        try {
          await pending;
        } finally {
          fixture.connection.close();
        }
      }
    },
  );
}
it('requires the borrowed mode store before a standalone no-op', async () => {
  const fixture = openResources(wrapOwner('ranks')),
    principal = await harness.authenticatedCommandPrincipal('keeper', ''),
    before = captureState(),
    grant = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
  try {
    expect(
      (
        await captureFailure(
          fixture.modes.switchCapacityMode(
            'org-a',
            'isolated',
            clock.stampFor(principal.id),
            crypto.randomUUID(),
            { kind: 'human', principal, expectedAccess: makeAccess() },
          ),
        )
      ).message,
    ).toContain('lacks borrowed');
    expect(grant).not.toHaveBeenCalled();
    expect(captureState()).toEqual(before);
  } finally {
    grant.mockRestore();
    fixture.connection.close();
  }
});
