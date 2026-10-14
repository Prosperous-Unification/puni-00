import { createProject, listTeams } from '@wbs/contracts';
import { afterEach, expect, it, vi } from 'vitest';

import { browserClient } from '@/lib/http';
import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
import { fakeProjectApi } from '@/testing/fake-project-api';
import { SILENT_STREAM } from '@/testing/silent-stream';

import { credentialOf } from './credential';
import { createSessionOwner, installSessionRuntime } from './session-runtime';

const identity = { userId: 'u1', credential: credentialOf('token') };
afterEach(() => vi.unstubAllGlobals());

it('replaces services when the same account switches organizations', async () => {
  const owner = createSessionOwner({
    clientFor: fakeDirectoryApi,
    projectClientFor: fakeProjectApi,
    streamDeps: SILENT_STREAM,
  });
  await owner.open({ ...identity, organization: { kind: 'active', organizationId: 'org-a' } });
  const first = owner.snapshot();
  if (first.status !== 'live') throw new Error('A runtime is absent');
  await owner.open({ ...identity, organization: { kind: 'active', organizationId: 'org-b' } });
  const second = owner.snapshot();
  if (second.status !== 'live') throw new Error('B runtime is absent');
  expect(second.services).not.toBe(first.services);
  expect(first.services.isCurrent()).toBe(false);
  expect(second.services.organization).toEqual({ kind: 'active', organizationId: 'org-b' });
  await owner.leave();
});

it('old clients retain their expected organization', async () => {
  vi.stubGlobal('location', { origin: 'http://wbs.test' });
  const sent: (string | null)[] = [];
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    sent.push(new Headers(init.headers).get('X-WBS-Expected-Organization'));
    return Promise.resolve(Response.json({ teams: [] }));
  });
  const context = {
    organization: { kind: 'active' as const, organizationId: 'org-a' },
    isCurrent: () => true,
    refuse: () => undefined,
  };
  const first = browserClient([listTeams], context);
  const second = browserClient([listTeams], {
    ...context,
    organization: { kind: 'active', organizationId: 'org-b' },
  });
  context.organization.organizationId = 'org-b';
  await first.getApiTeams({});
  await second.getApiTeams({});
  expect(sent).toEqual(['org-a', 'org-b']);
});

it('late organization responses cannot publish', async () => {
  vi.stubGlobal('location', { origin: 'http://wbs.test' });
  let current = true;
  let answer: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    'fetch',
    () =>
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
  );
  const client = browserClient([listTeams], {
    organization: { kind: 'active', organizationId: 'org-a' },
    isCurrent: () => current,
    refuse: () => undefined,
  });
  const pending = client.getApiTeams({});
  current = false;
  if (answer === undefined) throw new Error('request was not sent');
  answer(Response.json({ teams: [] }));
  expect(await pending).toEqual({ kind: 'failure', failure: { code: 'cancelled' } });
});

it('context refusal sends exactly one mutation', async () => {
  vi.stubGlobal('location', { origin: 'http://wbs.test' });
  const fetch = vi.fn(() =>
    Promise.resolve(Response.json({ error: 'organization_context_changed' }, { status: 409 })),
  );
  vi.stubGlobal('fetch', fetch);
  const refused: unknown[] = [];
  const client = browserClient([createProject], {
    organization: { kind: 'active', organizationId: 'org-a' },
    isCurrent: () => true,
    refuse: (refusal) => refused.push(refusal),
  });
  expect((await client.postApiProjects({ body: { name: 'plan' } })).kind).toBe('refusal');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(refused).toEqual([{ error: 'organization_context_changed' }]);
});

it('failed retirement cannot publish the next organization', async () => {
  const opened: string[] = [];
  const owner = createSessionOwner({
    clientFor: () => fakeDirectoryApi(),
    projectClientFor: () => fakeProjectApi(),
    streamDeps: SILENT_STREAM,
    install: (dependencies) => {
      const runtime = installSessionRuntime(dependencies);
      opened.push(
        dependencies.organization?.kind === 'active'
          ? dependencies.organization.organizationId
          : 'legacy',
      );
      return {
        services: runtime.services,
        close: async (options) => {
          await runtime.close(options);
          throw new Error('retirement failed');
        },
      };
    },
  });
  await owner.open({ ...identity, organization: { kind: 'active', organizationId: 'org-a' } });
  await owner.open({ ...identity, organization: { kind: 'active', organizationId: 'org-b' } });
  expect(owner.snapshot().status).toBe('fatal');
  expect(opened).toEqual(['org-a']);
});
