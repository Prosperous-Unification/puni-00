import type { AuthenticatedUser } from '@wbs/contracts';
import { inMemoryWorkPackages } from '@wbs/store-memory/work-package-fixture';
import { expect, it } from 'bun:test';

import type { ScopedPrincipal } from '../../ports/access-decisions';
import type { Clock } from '../../ports/clock';
import type { CommandAccess, CommandCaller } from '../../ports/command-access';
import type { ResourceAccess } from '../../ports/organization-access';
import type { PlanTransactionalStores } from '../../ports/stores';
import type { Decision, UnitOfWork } from '../../ports/unit-of-work';
import type { WorkPackageStore } from '../../ports/work-package-store';
import type { WriteStamp } from '../../ports/write-stamp';
import { createWorkPackageOpening } from './work-package-opening';

function createOpeningActor(): AuthenticatedUser {
  return {
    id: 'opening-reader',
    username: 'Opening reader',
    scopes: ['read', 'write'],
    authentication: { kind: 'first_party', issuedAt: 1 },
  };
}
function createOpeningAccess(): ResourceAccess & { kind: 'scoped' } {
  const principal: ScopedPrincipal = {
    id: 'opening-reader',
    authentication: { kind: 'first_party', issuedAt: 1 },
  };
  return {
    kind: 'scoped',
    principal,
    scope: { organizationId: 'opening-org', userId: principal.id, cap: null },
  };
}

/** A purpose-bound collaborator model: every unrelated store access throws, with no SQLite authority claim. */
function createOpeningOwner(
  record: WorkPackageStore['recordReadableOpenInOrganization'] = () => Promise.resolve(true),
  wait: Promise<void> = Promise.resolve(),
) {
  const calls: ('begin' | 'commit' | 'rollback')[] = [];
  const storesReached: string[] = [];
  const stamps: string[] = [];
  const now = { at: 17 };
  const legacy = { exists: true, writes: [] as WriteStamp[] };
  // This unit boundary deliberately implements only the three methods the OPEN owner may reach.
  const workPackages = new Proxy({} as WorkPackageStore, {
    get(_target, key: string | symbol) {
      if (key === 'recordReadableOpenInOrganization') return record;
      if (key === 'findById')
        return () => Promise.resolve(legacy.exists ? { id: 'opening-package' } : null);
      if (key === 'recordOpen')
        return (_id: string, stamp: WriteStamp) => {
          legacy.writes.push(structuredClone(stamp));
          return Promise.resolve();
        };
      throw Error('Unexpected OPEN work-package method: ' + String(key));
    },
  });
  // The transaction model exposes exactly its participating work-package store, never a detached catalog.
  const stores = new Proxy({} as PlanTransactionalStores, {
    get(_target, key: string | symbol) {
      storesReached.push(String(key));
      if (key === 'workPackages') return workPackages;
      throw Error('Unexpected OPEN catalog: ' + String(key));
    },
  });
  const uow: UnitOfWork = {
    async run<T>(
      act: (scope: { stores: PlanTransactionalStores }) => Promise<Decision<T>>,
    ): Promise<T> {
      calls.push('begin');
      await wait;
      let decision: Decision<T>;
      try {
        decision = await act({ stores });
      } catch (cause) {
        calls.push('rollback');
        throw cause;
      }
      calls.push(decision.commit ? 'commit' : 'rollback');
      return decision.value;
    },
  };
  const clock: Clock = {
    now: () => now.at,
    newId: () => {
      throw Error('Opening minted an unrelated identity');
    },
    stampFor: (by) => {
      stamps.push(by);
      return { at: now.at, by };
    },
  };
  const callers: CommandCaller[] = [];
  const commandAccess: CommandAccess = {
    resolve(caller) {
      callers.push(structuredClone(caller));
      if (caller.kind !== 'human') throw Error('Expected complete human caller');
      return Promise.resolve({ ok: true, access: caller.expectedAccess });
    },
  };
  return { uow, clock, commandAccess, callers, calls, storesReached, stamps, now, legacy };
}

it('retains the complete opening caller, expected scope and one stamp before the writer waits', async () => {
  const held = Promise.withResolvers<undefined>();
  const recorded: unknown[][] = [];
  const owner = createOpeningOwner((...args) => {
    recorded.push(structuredClone(args));
    return Promise.resolve(true);
  }, held.promise);
  const authentication = { kind: 'first_party' as const, issuedAt: 1 };
  const scopes: AuthenticatedUser['scopes'][number][] = ['read', 'write'];
  const actor: AuthenticatedUser = { ...createOpeningActor(), authentication, scopes };
  const scope = { organizationId: 'opening-org', userId: actor.id, cap: null };
  const access: ResourceAccess & { kind: 'scoped' } = { ...createOpeningAccess(), scope };
  const expectedActor = structuredClone(actor);
  const expectedAccess = structuredClone(access);
  const sharedStamp = { by: actor.id, at: 17 };
  owner.clock.stampFor = (by) => {
    owner.stamps.push(by);
    return sharedStamp;
  };
  const observed = createWorkPackageOpening(owner)
    .openWithin('opening-package', actor, access)
    .then(
      (value) => ({ ok: true as const, value }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
  let primary: { cause: unknown } | undefined;
  try {
    expect(owner.calls).toEqual(['begin']);
    expect(owner.stamps).toEqual(['opening-reader']);
    actor.id = 'changed-top-level-account';
    authentication.issuedAt = 99;
    scopes.splice(0, scopes.length, 'editor');
    scope.organizationId = 'changed-expected-org';
    owner.now.at = 99;
    sharedStamp.by = 'changed-stamp-account';
    sharedStamp.at = 99;
  } catch (cause) {
    primary = { cause };
  }
  held.resolve(undefined);
  const settled = await observed;
  if (primary !== undefined) {
    if (!settled.ok)
      throw new AggregateError(
        [primary.cause, settled.cause],
        'Opening retention assertion and settlement failed',
        { cause: primary.cause },
      );
    throw primary.cause;
  }
  if (!settled.ok) throw settled.cause;
  expect(settled.value).toEqual({ ok: true });
  expect(owner.callers).toEqual([{ kind: 'human', principal: expectedActor, expectedAccess }]);
  expect(recorded).toEqual([
    ['opening-package', { at: 17, by: 'opening-reader' }, 'opening-org', expectedAccess.principal],
  ]);
  expect(owner.calls).toEqual(['begin', 'commit']);
  expect(owner.storesReached).toEqual(['workPackages']);
  expect(owner.stamps).toEqual(['opening-reader']);
});

it('refuses missing OAuth write scope before stamping or acquiring the writer', async () => {
  const owner = createOpeningOwner();
  const actor = createOpeningActor();
  actor.scopes = ['read'];
  expect(
    await createWorkPackageOpening(owner).openWithin(
      'opening-package',
      actor,
      createOpeningAccess(),
    ),
  ).toEqual({ ok: false, error: 'insufficient_scope' });
  expect(owner.calls).toEqual([]);
  expect(owner.stamps).toEqual([]);
  expect(owner.callers).toEqual([]);
});

it('rejects a clock stamp for another account before actual writer acquisition', async () => {
  const owner = createOpeningOwner();
  owner.clock.stampFor = () => ({ at: 17, by: 'unrelated-account' });
  const failure = await createWorkPackageOpening(owner)
    .openWithin('opening-package', createOpeningActor(), createOpeningAccess())
    .then(
      () => ({ rejected: false as const }),
      (cause: unknown) => ({ rejected: true as const, cause }),
    );
  expect(failure.rejected).toBe(true);
  if (!failure.rejected) throw Error('Wrong stamp unexpectedly admitted');
  expect(failure.cause).toEqual(Error('opening stamp differs from the acting account'));
  expect(owner.calls).toEqual([]);
  expect(owner.storesReached).toEqual([]);
});

it('rolls back a current context refusal without acquiring a package catalog', async () => {
  const owner = createOpeningOwner();
  owner.commandAccess.resolve = () =>
    Promise.resolve({ ok: false, refusal: 'organization_context_changed' });
  expect(
    await createWorkPackageOpening(owner).openWithin(
      'opening-package',
      createOpeningActor(),
      createOpeningAccess(),
    ),
  ).toEqual({ ok: false, refusal: 'organization_context_changed' });
  expect(owner.calls).toEqual(['begin', 'rollback']);
  expect(owner.storesReached).toEqual([]);
});

it('rejects incoherent resolved kind, organization, principal and scope identity without recording access', async () => {
  const changed: ResourceAccess[] = [
    { kind: 'legacy' },
    {
      ...createOpeningAccess(),
      scope: { organizationId: 'other-org', userId: 'opening-reader', cap: null },
    },
    {
      ...createOpeningAccess(),
      principal: { ...createOpeningAccess().principal, id: 'other-account' },
    },
    {
      ...createOpeningAccess(),
      scope: { organizationId: 'opening-org', userId: 'other-account', cap: null },
    },
  ];
  for (const access of changed) {
    const owner = createOpeningOwner();
    owner.commandAccess.resolve = () => Promise.resolve({ ok: true, access });
    const failure = await createWorkPackageOpening(owner)
      .openWithin('opening-package', createOpeningActor(), createOpeningAccess())
      .then(
        () => ({ rejected: false as const }),
        (cause: unknown) => ({ rejected: true as const, cause }),
      );
    expect(failure.rejected).toBe(true);
    if (!failure.rejected) throw Error('Incoherent authority unexpectedly admitted');
    expect(failure.cause).toEqual(
      Error('opening admitted authority differs from the captured act'),
    );
    expect(owner.calls).toEqual(['begin', 'rollback']);
    expect(owner.storesReached).toEqual([]);
  }
});

it('rolls back an opaque store refusal and commits only its successful access record', async () => {
  for (const recorded of [false, true]) {
    const owner = createOpeningOwner(() => Promise.resolve(recorded));
    expect(
      await createWorkPackageOpening(owner).openWithin(
        'opening-package',
        createOpeningActor(),
        createOpeningAccess(),
      ),
    ).toEqual(recorded ? { ok: true } : { ok: false, reason: 'not_found' });
    expect(owner.calls).toEqual(['begin', recorded ? 'commit' : 'rollback']);
    expect(owner.storesReached).toEqual(['workPackages']);
  }
});

it('retains raw legacy opening behavior inside the participating writer only', async () => {
  const owner = createOpeningOwner();
  expect(
    await createWorkPackageOpening(owner).openWithin('opening-package', createOpeningActor(), {
      kind: 'legacy',
    }),
  ).toEqual({ ok: true });
  expect(owner.legacy.writes).toEqual([{ by: 'opening-reader', at: 17 }]);
  owner.legacy.exists = false;
  expect(
    await createWorkPackageOpening(owner).openWithin('absent', createOpeningActor(), {
      kind: 'legacy',
    }),
  ).toEqual({ ok: false, reason: 'not_found' });
  expect(owner.calls).toEqual(['begin', 'commit', 'begin', 'rollback']);
  expect(owner.legacy.writes).toHaveLength(1);
});

it('preserves exact store failures including undefined and preconstructed aggregate failures', async () => {
  for (const thrown of [
    Error('opening store failed'),
    undefined,
    new AggregateError([undefined, Error('rollback failed')], 'paired opening rollback', {
      cause: undefined,
    }),
  ]) {
    const owner = createOpeningOwner(() =>
      Promise.resolve().then(() => {
        const cause: unknown = thrown;
        throw cause;
      }),
    );
    const failure = await createWorkPackageOpening(owner)
      .openWithin('opening-package', createOpeningActor(), createOpeningAccess())
      .then(
        () => ({ rejected: false as const }),
        (cause: unknown) => ({ rejected: true as const, cause }),
      );
    expect(failure.rejected).toBe(true);
    if (!failure.rejected) throw Error('Opening failure unexpectedly resolved');
    expect(failure.cause).toBe(thrown);
    expect(owner.calls).toEqual(['begin', 'rollback']);
  }
});

it('explicitly refuses current navigation on the memory fixture rather than inventing read authority', async () => {
  const failure = await inMemoryWorkPackages()
    .recordReadableOpenInOrganization('package', { by: 'reader', at: 1 }, 'org', { id: 'reader' })
    .then(
      () => ({ rejected: false as const }),
      (cause: unknown) => ({ rejected: true as const, cause }),
    );
  expect(failure.rejected).toBe(true);
  if (!failure.rejected) throw Error('Memory OPEN invented current authority');
  expect(failure.cause).toEqual(
    Error('the in-memory work package store has no current opening authority'),
  );
});
