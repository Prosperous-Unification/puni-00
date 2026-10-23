import type { DeliveryReader, DeliveryReading } from '@shared/delivery';
import { DELIVERY_GATE_LIMITS, type DeliveryGateLimits } from '@wbs/core/service/delivery-gate';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';
let h: OrganizationHarness;
let own: string;
let other: string;
let foreign: string;
let work: string;
let sibling: string;
let elsewhere: string;
let reference: string;
let siblingReference: string;
let reads: string[];
let reading: DeliveryReading;
let revokeDuringRead: boolean;
let failReader: boolean;
let readerSignals: (AbortSignal | undefined)[];
let holdReads: Promise<void> | null;
const url = 'https://github.com/puni/project/pull/12';
async function create(username: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name: 'Delivery plan' });
  expect(answer.status).toBe(200);
  return (answer.body as { project: { id: string } }).project.id;
}
async function linked(project: string, name: string): Promise<string> {
  const answer = await h.call('ada', 'POST', `/api/projects/${project}/commands`, {
    commands: [{ kind: 'createWorkItem', name, parentId: null, afterId: null }],
  });
  expect(answer.status).toBe(200);
  const id = (answer.body as { results: { id?: string }[] }).results[0]?.id;
  if (id === undefined) throw new Error('work item missing');
  const patched = await h.call('ada', 'POST', `/api/projects/${project}/commands`, {
    commands: [
      {
        kind: 'patchWorkItem',
        workItemId: id,
        patch: { externalRefs: [{ systemId: 'sys-github-pr', url, name: 'Change' }] },
      },
    ],
  });
  expect(patched).toMatchObject({ status: 200 });
  return id;
}
async function readWork(project: string, id: string) {
  const answer = await h.call('ada', 'GET', `/api/projects/${project}/work-items/${id}`);
  expect(answer.status).toBe(200);
  return (answer.body as { workItem: { externalRefs: { id: string }[] } }).workItem;
}
function path(project = own, id = work, ref = reference): string {
  return `/api/projects/${project}/work-items/${id}/refs/${ref}/delivery`;
}
/** The 200 body the route answers for `served`, with the server clock's instant. */
const anyInstant: unknown = expect.any(String);
const served = (body: DeliveryReading) => ({ reading: body, servedAt: anyInstant });
async function setup(delivery?: DeliveryReader, deliveryLimits?: Partial<DeliveryGateLimits>) {
  h = OrganizationHarness.openComposedWith({
    ...(delivery === undefined ? {} : { delivery }),
    ...(deliveryLimits === undefined
      ? {}
      : { deliveryLimits: { ...DELIVERY_GATE_LIMITS, ...deliveryLimits } }),
    afterResolve: () => {
      if (revokeDuringRead)
        h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('ada')]);
    },
  });
  for (const username of ['ada', 'grace', 'nell']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
  h.sqlite.run(
    "INSERT INTO external_system_organization (resource_id, organization_id, name) VALUES ('sys-github-pr', 'org-a', 'GitHub')",
  );
  own = await create('ada');
  other = await create('ada');
  foreign = await create('grace');
  work = await linked(own, 'Tracked');
  sibling = await linked(own, 'Sibling');
  elsewhere = await linked(other, 'Other project');
  reference = (await readWork(own, work)).externalRefs[0]?.id ?? '';
  siblingReference = (await readWork(own, sibling)).externalRefs[0]?.id ?? '';
  expect(reference).not.toBe('');
  expect(siblingReference).not.toBe('');
}
const fakeReader: DeliveryReader = {
  read: async (savedUrl, signal) => {
    reads.push(savedUrl);
    readerSignals.push(signal);
    if (failReader) throw new Error('unexpected delivery failure');
    if (holdReads !== null) await holdReads;
    return reading;
  },
};
beforeEach(async () => {
  reads = [];
  readerSignals = [];
  holdReads = null;
  revokeDuringRead = false;
  failReader = false;
  reading = { kind: 'unsupported', reason: 'test-provider' };
  await setup(fakeReader);
});
afterEach(() => {
  h.close();
});
describe('authorized saved-reference delivery', () => {
  it('returns the reading from the saved URL and leaves planning unchanged', async () => {
    const before = await readWork(own, work);
    expect(await h.call('ada', 'GET', path())).toEqual({ status: 200, body: served(reading) });
    expect(reads).toEqual([url]);
    expect(await readWork(own, work)).toEqual(before);
    expect(reads).toEqual([url]);
  });
  it('refuses unauthenticated, unbound and removed members without provider reads', async () => {
    expect((await h.call('unknown', 'GET', path())).status).toBe(401);
    expect(await h.call('nell', 'GET', path())).toEqual({
      status: 403,
      body: { error: 'no_active_organization' },
    });
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('ada')]);
    expect(await h.call('ada', 'GET', path())).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
    expect(reads).toEqual([]);
  });
  it('answers foreign, missing and misassociated resources alike without provider reads', async () => {
    for (const addressed of [
      path(foreign),
      path('missing'),
      path(own, 'missing'),
      path(own, elsewhere),
      path(own, work, siblingReference),
      path(own, work, 'missing'),
    ]) {
      expect(await h.call('ada', 'GET', addressed)).toEqual({
        status: 404,
        body: { error: 'not_found' },
      });
    }
    expect(await h.call('grace', 'GET', path())).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(reads).toEqual([]);
  });
  it('refuses caller-selected URLs without provider reads', async () => {
    expect((await h.call('ada', 'GET', `${path()}?url=https://attacker.invalid`)).status).toBe(400);
    expect(reads).toEqual([]);
  });
  it('returns the observed revision without changing progress or references', async () => {
    reading = {
      kind: 'observed',
      observation: {
        version: 1,
        observedAt: '2026-10-23T00:00:00Z',
        change: {
          source: {
            provider: 'synthetic',
            id: 'change:12',
            url,
            nativeState: 'landed',
            observedAt: '2026-10-23T00:00:00Z',
          },
          title: 'Deliver',
          revision: 'revision:a',
          state: 'merged',
          mergedRevision: 'revision:merge',
        },
        checks: [],
        runs: [],
        coverage: { checks: 'partial', runs: 'complete', notes: ['Checks unavailable'] },
      },
    };
    const before = await readWork(own, work);
    expect(await h.call('ada', 'GET', path())).toEqual({ status: 200, body: served(reading) });
    expect(await readWork(own, work)).toEqual(before);
  });
  it('rechecks membership after initial organization resolution', async () => {
    revokeDuringRead = true;
    expect(await h.call('ada', 'GET', path())).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
    expect(reads).toEqual([]);
  });
  it('preserves an unavailable schedule refusal before provider reads', async () => {
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [own],
    );
    expect(await h.call('ada', 'GET', path())).toEqual({
      status: 409,
      body: { error: 'engine_unavailable', engine: 'optimized' },
    });
    expect(reads).toEqual([]);
  });
  it('refuses stale organization context before provider reads', async () => {
    expect(
      await h.callWith(h.token('ada'), 'GET', path(), undefined, {
        'X-WBS-Expected-Organization': 'org-b',
      }),
    ).toEqual({ status: 409, body: { error: 'organization_context_changed' } });
    expect(reads).toEqual([]);
  });
  it('rejects malformed trusted reader output at the response boundary', async () => {
    reading = { kind: 'observed', observation: { version: 1 } } as DeliveryReading;
    expect((await h.call('ada', 'GET', path())).status).toBe(500);
  });
  it('does not translate unexpected reader faults to successful readings', async () => {
    failReader = true;
    expect((await h.call('ada', 'GET', path())).status).toBe(500);
  });
  it('composes the public GitHub adapter when no reader is injected', async () => {
    h.close();
    await setup();
    const patched = await h.call('ada', 'POST', `/api/projects/${own}/commands`, {
      commands: [
        {
          kind: 'patchWorkItem',
          workItemId: work,
          patch: {
            externalRefs: [
              { systemId: 'sys-github-pr', url: 'https://unsupported.invalid/change/1' },
            ],
          },
        },
      ],
    });
    expect(patched.status).toBe(200);
    reference = (await readWork(own, work)).externalRefs[0]?.id ?? '';
    expect(await h.call('ada', 'GET', path())).toEqual({
      status: 200,
      body: served({
        kind: 'unsupported',
        reason: 'Only canonical public GitHub pull request URLs are supported',
      }),
    });
  });
  it('preserves modeled provider unavailability', async () => {
    reading = {
      kind: 'unavailable',
      reason: 'rate-limited',
      message: 'Try later',
      observedAt: '2026-10-23T00:00:00Z',
    };
    expect(await h.call('ada', 'GET', path())).toEqual({ status: 200, body: served(reading) });
  });
  it('rejects semantically impossible reader output at the response boundary', async () => {
    // The wire schema admits a merge revision on an open change; only the semantic validator refuses it.
    reading = {
      kind: 'observed',
      observation: {
        version: 1,
        observedAt: '2026-10-23T00:00:00Z',
        change: {
          source: {
            provider: 'synthetic',
            id: 'change:12',
            url,
            nativeState: 'open',
            observedAt: '2026-10-23T00:00:00Z',
          },
          title: 'Deliver',
          revision: 'revision:a',
          state: 'open',
          mergedRevision: 'revision:merge',
        },
        checks: [],
        runs: [],
        coverage: { checks: 'complete', runs: 'complete', notes: [] },
      },
    };
    expect((await h.call('ada', 'GET', path())).status).toBe(500);
  });
  it('serves the cached reading inside the TTL with its original observedAt', async () => {
    reading = {
      kind: 'unavailable',
      reason: 'timeout',
      message: 'Slow provider',
      observedAt: '2026-10-23T00:00:00Z',
    };
    const first = await h.call('ada', 'GET', path());
    const second = await h.call('ada', 'GET', path());
    expect(first).toEqual({ status: 200, body: served(reading) });
    expect(second).toEqual({ status: 200, body: served(reading) });
    expect(reads).toEqual([url]);
  });
  it('answers 429 delivery_rate_limited once the organization spent its provider reads', async () => {
    h.close();
    await setup(fakeReader, { cacheTtlMs: 0, organizationReads: 2 });
    expect((await h.call('ada', 'GET', path())).status).toBe(200);
    expect((await h.call('ada', 'GET', path())).status).toBe(200);
    const refused = await h.request(path(), {
      headers: {
        authorization: `Bearer ${h.token('ada')}`,
        'X-WBS-Expected-Organization': 'org-a',
      },
    });
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('300');
    expect(await refused.json()).toEqual({
      error: 'delivery_rate_limited',
      retryAfterSeconds: 300,
    });
    expect(reads).toHaveLength(2);
  });
  it('answers 503 delivery_busy when every provider read slot stays taken', async () => {
    h.close();
    await setup(fakeReader, { cacheTtlMs: 0, concurrentReads: 1, busyWaitMs: 20 });
    let release: () => void = () => {
      throw new Error('no read is held');
    };
    holdReads = new Promise((resolve) => {
      release = resolve;
    });
    const held = h.call('ada', 'GET', path());
    while (reads.length === 0) await new Promise((resolve) => setTimeout(resolve, 1));
    expect(await h.call('ada', 'GET', path())).toEqual({
      status: 503,
      body: { error: 'delivery_busy' },
    });
    release();
    expect((await held).status).toBe(200);
    expect(reads).toHaveLength(1);
  });
  it('cancels the provider read when the request aborts', async () => {
    holdReads = new Promise(() => undefined);
    const closed = new AbortController();
    const answer = h
      .request(path(), {
        headers: {
          authorization: `Bearer ${h.token('ada')}`,
          'X-WBS-Expected-Organization': 'org-a',
        },
        signal: closed.signal,
      })
      .catch((failure: unknown) => failure);
    while (readerSignals.length === 0) await new Promise((resolve) => setTimeout(resolve, 1));
    expect(readerSignals[0]?.aborted).toBe(false);
    closed.abort();
    expect(readerSignals[0]?.aborted).toBe(true);
    void answer;
  });
});
