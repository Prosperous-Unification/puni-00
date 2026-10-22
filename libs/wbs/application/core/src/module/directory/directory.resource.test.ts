import { inMemoryDirectory } from '@wbs/store-memory/directory-fixture';
import { describe, expect, test } from 'bun:test';

import { clockOf } from '../../ports/clock';
import type { DirectoryStore } from '../../ports/directory-store';
import { LEGACY_ACCESS, type ResourceAccess } from '../../ports/organization-access';
import type { OrganizationLimitGauge } from '../../ports/organization-limits';
import { DirectoryService } from './directory.resource';

const scoped: ResourceAccess = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'u', role: 'member' },
};

/**
 * A service whose clock mints `id-1`, `id-2`, … over an in-memory directory
 * already holding tags named after the first `taken` of those ids.
 */
async function fixture(taken: number, organizationLimits?: OrganizationLimitGauge) {
  const base = inMemoryDirectory();
  await base.addTeam({ id: 't', name: 't' }, { at: 0, by: 'u' });
  for (let n = 1; n <= taken; n += 1) {
    await base.addTag({ id: `other-${String(n)}`, name: `id-${String(n)}` }, { at: 0, by: 'u' });
    const added = await base.addPerson({ id: `other-${String(n)}`, name: `id-${String(n)}` }, [], {
      at: 0,
      by: 'u',
    });
    if (!added.ok) throw new Error('the colliding person was refused');
  }
  const mapped: string[] = [];
  const directory: DirectoryStore = {
    ...base,
    // Only the team `t` is the organization's, and nothing else yet.
    listInOrganization: (catalog) =>
      // A test double answering one catalog's rows for the generic signature.
      Promise.resolve(
        (catalog === 'teams' ? [{ id: 't', name: 't', serviceIds: [] }] : []) as never,
      ),
    mapInOrganization: (_catalog, resourceId) => {
      mapped.push(resourceId);
      return Promise.resolve();
    },
  };
  let minted = 0;
  const service = new DirectoryService({
    directory,
    ...(organizationLimits === undefined ? {} : { organizationLimits }),
    broadcast: { publish: () => Promise.resolve(), latestSeq: () => Promise.resolve(-1) },
    clock: clockOf({
      now: () => 0,
      newId: () => {
        minted += 1;
        return `id-${String(minted)}`;
      },
    }),
  });
  return { service, mapped, base };
}

describe('an opaque root name', () => {
  test('retries an opaque root name another root holds, then gives up', async () => {
    const once = await fixture(1);
    expect(await once.service.addWithin('tags', 'u', 'urgent', scoped)).toEqual({
      id: 'id-2',
      name: 'urgent',
    });
    expect(once.mapped).toEqual(['id-2']);

    const always = await fixture(3);
    let refusal: unknown;
    try {
      await always.service.addWithin('tags', 'u', 'urgent', scoped);
    } catch (error) {
      refusal = error;
    }
    expect(String(refusal)).toContain('no free opaque directory name after 3 ids');
    expect(always.mapped).toEqual([]);
  });

  test('retries a colliding opaque person name without touching the person it collided with', async () => {
    const once = await fixture(1);
    expect(await once.service.addPersonWithin('u', 'Kat', ['t'], scoped)).toEqual({
      ok: true,
      value: { id: 'id-2', name: 'Kat', kind: 'person' },
    });
    const people = await once.base.listPeople();
    expect(people.find((person) => person.id === 'other-1')?.teamIds).toEqual([]);
    expect(people.find((person) => person.id === 'id-2')?.teamIds).toEqual(['t']);
    expect(once.mapped).toEqual(['id-2']);
  });
});

describe('binding an account to a person', () => {
  // Legacy access has no organization, so nobody holds the admin role a
  // binding needs (`wbs-team-claims` D5).
  test('refuses a binding under legacy access', async () => {
    const { service, base } = await fixture(0);
    const added = await base.addPerson({ id: 'claire', name: 'Claire', kind: 'agent' }, [], {
      at: 0,
      by: 'u',
    });
    if (!added.ok) throw new Error('the fixture person was refused');

    expect(await service.patchPerson('claire', 'u', { accountId: 'u' })).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await base.boundAccountOf('claire')).toBeNull();
  });
});

describe('resource writes', () => {
  // Proof: with refuseStandaloneResourceWrite answering nothing, all three writes
  // below resolved against the standalone service; watched 2026-10-20.
  test('run only inside a command batch, never through a standalone-built service', () => {
    const service = new DirectoryService({
      directory: inMemoryDirectory(),
      broadcast: { publish: () => Promise.resolve(), latestSeq: () => Promise.resolve(-1) },
      clock: clockOf({ now: () => 0, newId: () => 'id' }),
      standaloneWrite: () => Promise.reject(new Error('standalone owner reached')),
    });
    const legacy: ResourceAccess = { kind: 'legacy' };
    for (const write of [
      () =>
        service.addResourceWithin('u', { name: 'ram', kind: 'divisible', unitLabel: 'GB' }, legacy),
      () => service.patchResourceWithin('r', 'u', { unitLabel: 'MB' }, legacy),
      () => service.removeResourceWithin('r', 'u', false, legacy),
    ])
      expect(write()).rejects.toThrow('resource writes run only inside a command batch');
  });

  test('creates a scoped resource under an opaque root name, refusing a local name held', async () => {
    const base = inMemoryDirectory();
    const mapped: { id: string; name: string }[] = [];
    const directory: DirectoryStore = {
      ...base,
      listInOrganization: async (catalog) =>
        // A test double answering one catalog's rows for the generic signature.
        (catalog === 'resources'
          ? (await base.listResources())
              .filter(({ id }) => mapped.some((each) => each.id === id))
              .map((each) => ({
                ...each,
                name: mapped.find(({ id }) => id === each.id)?.name ?? each.name,
              }))
          : []) as never,
      mapInOrganization: (_catalog, resourceId, _organizationId, name) => {
        mapped.push({ id: resourceId, name });
        return Promise.resolve();
      },
    };
    const service = new DirectoryService({
      directory,
      broadcast: { publish: () => Promise.resolve(), latestSeq: () => Promise.resolve(-1) },
      clock: clockOf({ now: () => 0, newId: () => 'root-1' }),
    });
    const input = { name: 'h2puni ram', kind: 'divisible' as const, unitLabel: 'GB' };
    expect(await service.addResourceWithin('u', input, scoped)).toEqual({
      ok: true,
      value: { id: 'root-1', ...input },
    });
    // The root carries its own id as its name; the organization's row carries the name.
    expect(await base.listResources()).toEqual([
      { id: 'root-1', name: 'root-1', kind: 'divisible', unitLabel: 'GB' },
    ]);
    expect(mapped).toEqual([{ id: 'root-1', name: 'h2puni ram' }]);
    // Proof: with the organization-local name check removed, this second create
    // collided on the opaque id and threw instead of answering taken; watched 2026-10-20.
    expect(await service.addResourceWithin('u', input, scoped)).toEqual({
      ok: false,
      reason: 'taken',
      name: 'h2puni ram',
    });
  });
});

/** A gauge answering `cap` and `current` for every organization, recording who asked. */
function gauge(cap: number, current: number) {
  const reads: string[] = [];
  const limits: OrganizationLimitGauge = {
    readAgentPersonCap: (organizationId) => {
      reads.push(organizationId);
      return Promise.resolve({ cap, current });
    },
  };
  return { limits, reads };
}

describe('the agent person cap on an add (`wbs-organization-limits` L9)', () => {
  test('refuses adding an agent at the cap, creating and mapping nothing', async () => {
    const { limits, reads } = gauge(2, 2);
    const capped = await fixture(0, limits);

    expect(await capped.service.addPersonWithin('u', 'Bot', [], scoped, 'agent')).toEqual({
      ok: false,
      reason: 'agent_person_limit',
      cap: 2,
      current: 2,
      added: 1,
    });
    expect(reads).toEqual(['org-a']);
    expect(capped.mapped).toEqual([]);
    expect((await capped.base.listPeople()).map(({ name }) => name)).toEqual([]);
  });

  test('adds an agent below the cap, and a person at it without reading the cap', async () => {
    const below = gauge(2, 1);
    const roomy = await fixture(0, below.limits);
    const agent = await roomy.service.addPersonWithin('u', 'Bot', [], scoped, 'agent');
    expect(agent).toEqual({ ok: true, value: { id: 'id-1', name: 'Bot', kind: 'agent' } });
    expect(below.reads).toEqual(['org-a']);

    const full = gauge(2, 2);
    const atCap = await fixture(0, full.limits);
    const human = await atCap.service.addPersonWithin('u', 'Ann', [], scoped, 'person');
    expect(human.ok).toBe(true);
    expect(full.reads).toEqual([]);
  });

  test('adds an agent under legacy access without reading any cap', async () => {
    const { limits, reads } = gauge(0, 0);
    const legacy = await fixture(0, limits);

    const added = await legacy.service.addPersonWithin('u', 'Bot', [], LEGACY_ACCESS, 'agent');

    expect(added.ok).toBe(true);
    expect(reads).toEqual([]);
  });

  test('throws for a scoped agent add in a graph composed without limits', async () => {
    const uncomposed = await fixture(0);

    let thrown: unknown;
    try {
      await uncomposed.service.addPersonWithin('u', 'Bot', [], scoped, 'agent');
    } catch (error) {
      thrown = error;
    }

    expect(String(thrown)).toContain('without organization limits');
    expect(uncomposed.mapped).toEqual([]);
  });
});
