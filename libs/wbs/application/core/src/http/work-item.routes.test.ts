import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { createPlanCommandRunner } from '../module/plan-commands/composition';
import { NO_COMPUTE_PROVIDERS } from '../ports/compute-providers';
import { createTestServices } from '../testing/harness';
import { localCommandAccess } from '../testing/organization-access-fixture';
import { legacyOrganizationAccess } from '../testing/organization-access-fixture';
import { batchServices, testWrites } from '../testing/writes-fixture';
import { workItemRoutes } from './work-item.routes';

/** Only this module's new logical Sources; a failed close remains retained and is reported after all cleanup attempts. */
const ownedSources = new Set<ReturnType<typeof openMemorySourceFixture>['source']>();
function openOwnedSource() {
  const source = openMemorySourceFixture().source;
  ownedSources.add(source);
  return source;
}
afterEach(async () => {
  const cleanupCauses: unknown[] = [];
  for (const source of ownedSources) {
    try {
      await source.close();
      ownedSources.delete(source);
    } catch (cause: unknown) {
      cleanupCauses.push(cause);
    }
  }
  if (cleanupCauses.length > 0)
    throw new AggregateError(cleanupCauses, 'test-owned MemorySource cleanup failed', {
      cause: cleanupCauses.at(-1),
    });
});

function fixture() {
  const plan = createTestServices(openOwnedSource());
  const writes = testWrites(undefined, batchServices(plan));
  const runner = createPlanCommandRunner({
    commandAccess: localCommandAccess,
    batchServices: writes.batch,
    publicServices: batchServices(plan),
    uow: writes.uow,
    announcements: writes.announcements,
  });
  return {
    runner,
    endpoints: workItemRoutes(
      plan.service,
      runner,
      { sha256: () => Promise.resolve('0'.repeat(64)) },
      legacyOrganizationAccess,
      { reports: NO_COMPUTE_PROVIDERS.reports, clock: { now: () => 0 } },
    ),
  };
}

test('typed undo and redo preserve actor and details without exposing journal entry ids', async () => {
  const f = fixture();
  const actor = { id: 'owner', username: 'owner', scopes: ['read', 'write'] as const };
  for (const [endpoint, operation] of [
    [f.endpoints[3], 'undoWithin'],
    [f.endpoints[4], 'redoWithin'],
  ] as const) {
    const call = spyOn(f.runner, operation);
    const completed = {
      ok: true as const,
      value: { done: 'Undo change', detail: 'Work', entryId: 'private' },
    };
    call.mockResolvedValueOnce(completed);
    expect(
      await endpoint.handle({
        params: { id: 'p' },
        query: undefined,
        body: undefined,
        principal: actor,
        request: {
          method: 'POST',
          url: new URL('http://localhost'),
          headers: new Headers(),
          signal: new AbortController().signal,
        },
      }),
    ).toEqual({ ok: true, status: 200, body: { done: 'Undo change', detail: 'Work' } });
    expect(call).toHaveBeenCalledWith(
      'p',
      { ...actor, organizationOperation: { kind: 'mutation', expected: { kind: 'absent' } } },
      { kind: 'legacy' },
    );
  }
});

test('undo and redo walk a consent agent’s own stack, not its human’s', async () => {
  const f = fixture();
  const agent = {
    id: 'owner',
    username: 'owner',
    scopes: ['read', 'write'] as const,
    authentication: {
      kind: 'consent' as const,
      issuer: 'https://idp.example/',
      subject: 'owner',
      credentialId: 'consent-1',
      personId: 'codex',
    },
  };
  for (const [endpoint, operation] of [
    [f.endpoints[3], 'undoWithin'],
    [f.endpoints[4], 'redoWithin'],
  ] as const) {
    const call = spyOn(f.runner, operation);
    call.mockResolvedValueOnce({ ok: false, reason: 'nothing_to_undo', detail: null });
    await endpoint.handle({
      params: { id: 'p' },
      query: undefined,
      body: undefined,
      principal: agent,
      request: {
        method: 'POST',
        url: new URL('http://localhost'),
        headers: new Headers(),
        signal: new AbortController().signal,
      },
    });
    expect(call).toHaveBeenCalledWith(
      'p',
      { ...agent, organizationOperation: { kind: 'mutation', expected: { kind: 'absent' } } },
      { kind: 'legacy' },
    );
  }
});

test('undo and redo expose detached step usage conflicts without private replay state', async () => {
  const f = fixture(),
    actor = { id: 'owner', username: 'owner', scopes: ['read', 'write'] as const };
  for (const [endpoint, operation] of [
    [f.endpoints[3], 'undoWithin'],
    [f.endpoints[4], 'redoWithin'],
  ] as const) {
    const facts: ('estimate' | 'blockage')[] = ['estimate'];
    const pairs = [
      { id: 'destination', name: 'Destination', workPackageId: 'p', stepId: 'dev', facts },
    ];
    spyOn(f.runner, operation).mockResolvedValueOnce({
      ok: false,
      reason: 'step_nodes_in_use',
      detail: null,
      count: 1,
      pairs,
    });
    const reply = await endpoint.handle({
      params: { id: 'p' },
      query: undefined,
      body: undefined,
      principal: actor,
      request: {
        method: 'POST',
        url: new URL('http://localhost'),
        headers: new Headers(),
        signal: new AbortController().signal,
      },
    });
    expect(reply).toEqual({
      ok: false,
      status: 409,
      body: { error: 'step_nodes_in_use', count: 1, pairs },
    });
    facts.push('blockage');
    expect(reply).toEqual({
      ok: false,
      status: 409,
      body: {
        error: 'step_nodes_in_use',
        count: 1,
        pairs: [
          {
            id: 'destination',
            name: 'Destination',
            workPackageId: 'p',
            stepId: 'dev',
            facts: ['estimate'],
          },
        ],
      },
    });
  }
});
