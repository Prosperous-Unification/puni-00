import {
  type ClientReply,
  createProject,
  type readActiveOrganization,
  type selectActiveOrganization,
} from '@wbs/contracts';
import { afterEach, expect, it, vi } from 'vitest';

import { browserClient } from '@/lib/http';
import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
import { fakeProjectApi } from '@/testing/fake-project-api';
import { SILENT_STREAM } from '@/testing/silent-stream';

import { credentialOf } from './credential';
import { createOrganizationOwner, type OrganizationRoutes } from './organization-owner';
import { createSessionOwner } from './session-runtime';

const identity = { userId: 'u1', credential: credentialOf('token') };
function active(organizationId: string): ClientReply<typeof readActiveOrganization> {
  return {
    kind: 'success',
    representation: 'json',
    status: 200,
    headers: new Headers(),
    body: { organizationId, name: organizationId, role: 'member' },
  };
}
const selected = (organizationId: string): ClientReply<typeof selectActiveOrganization> => ({
  kind: 'success',
  representation: 'json',
  status: 200,
  headers: new Headers(),
  body: { organizationId },
});
const sessions = () =>
  createSessionOwner({
    clientFor: () => fakeDirectoryApi(),
    projectClientFor: () => fakeProjectApi(),
    streamDeps: SILENT_STREAM,
  });
afterEach(() => vi.unstubAllGlobals());

it('switches only after confirmed context', async () => {
  let confirm: ((reply: ClientReply<typeof readActiveOrganization>) => void) | undefined;
  let reads = 0;
  const routes: OrganizationRoutes = {
    discover: () =>
      ++reads === 1
        ? Promise.resolve(active('org-a'))
        : new Promise((resolve) => {
            confirm = resolve;
          }),
    select: (id) => Promise.resolve(selected(id)),
  };
  const sessionOwner = sessions();
  const owner = createOrganizationOwner({ identity, sessions: sessionOwner, routes });
  await owner.refresh();
  const first = sessionOwner.snapshot();
  if (first.status !== 'live') throw new Error('A was not live');
  const switching = owner.choose('org-b');
  expect(first.services.isCurrent()).toBe(false);
  expect(owner.snapshot().kind).toBe('switching');
  await vi.waitFor(() => {
    expect(confirm).toBeDefined();
  });
  if (confirm === undefined) throw new Error('confirmation was not requested');
  expect(sessionOwner.snapshot().status).not.toBe('live');
  confirm(active('org-b'));
  await switching;
  expect(owner.snapshot()).toMatchObject({
    kind: 'active',
    organization: { organizationId: 'org-b' },
  });
  await owner.leave();
});

it('selection failure leaves organization content withdrawn', async () => {
  const sessionOwner = sessions();
  const owner = createOrganizationOwner({
    identity,
    sessions: sessionOwner,
    routes: {
      discover: () => Promise.resolve(active('org-a')),
      select: () =>
        Promise.resolve({
          kind: 'failure',
          failure: { code: 'transport', cause: new Error('offline') },
        }),
    },
  });
  await owner.refresh();
  await owner.choose('org-b');
  expect(owner.snapshot().kind).toBe('failure');
  expect(sessionOwner.snapshot().status).not.toBe('live');
  await owner.leave();
});

it('a mismatched confirmation cannot publish the intended or previous organization', async () => {
  const sessionOwner = sessions();
  const owner = createOrganizationOwner({
    identity,
    sessions: sessionOwner,
    routes: {
      discover: () => Promise.resolve(active('org-a')),
      select: (id) => Promise.resolve(selected(id)),
    },
  });
  await owner.refresh();
  await owner.choose('org-b');
  expect(owner.snapshot().kind).toBe('failure');
  expect(sessionOwner.snapshot().status).not.toBe('live');
  await owner.leave();
});

it('late organization discovery cannot publish after a newer transition', async () => {
  let firstAnswer: ((reply: ClientReply<typeof readActiveOrganization>) => void) | undefined;
  let reads = 0;
  const owner = createOrganizationOwner({
    identity,
    sessions: sessions(),
    routes: {
      discover: () =>
        ++reads === 1
          ? new Promise((resolve) => {
              firstAnswer = resolve;
            })
          : Promise.resolve(active('org-b')),
      select: (id) => Promise.resolve(selected(id)),
    },
  });
  const first = owner.refresh();
  await vi.waitFor(() => {
    expect(firstAnswer).toBeDefined();
  });
  await owner.choose('org-b');
  if (firstAnswer === undefined) throw new Error('initial discovery missing');
  firstAnswer(active('org-a'));
  await first;
  expect(owner.snapshot()).toMatchObject({
    kind: 'active',
    organization: { organizationId: 'org-b' },
  });
  await owner.leave();
});

it('cross-tab payload cannot select authority', async () => {
  const select = vi.fn((id: string) => Promise.resolve(selected(id)));
  const owner = createOrganizationOwner({
    identity,
    sessions: sessions(),
    routes: { discover: () => Promise.resolve(active('org-a')), select },
  });
  await owner.refresh();
  await owner.notice({ organizationId: 'org-b', role: 'super_admin' });
  expect(owner.snapshot()).toMatchObject({
    kind: 'active',
    organization: { organizationId: 'org-a' },
  });
  expect(select).not.toHaveBeenCalled();
  await owner.leave();
});

it('membership loss clears the whole organization runtime without retry', async () => {
  vi.stubGlobal('location', { origin: 'http://wbs.test' });
  const fetch = vi.fn(() =>
    Promise.resolve(Response.json({ error: 'not_a_member' }, { status: 403 })),
  );
  vi.stubGlobal('fetch', fetch);
  const sessionOwner = sessions();
  const owner = createOrganizationOwner({
    identity,
    sessions: sessionOwner,
    routes: {
      discover: () => Promise.resolve(active('org-a')),
      select: (id) => Promise.resolve(selected(id)),
    },
  });
  await owner.refresh();
  const runtime = sessionOwner.snapshot();
  if (runtime.status !== 'live') throw new Error('runtime missing');
  const client = browserClient([createProject], runtime.services.resourceScope);
  await client.postApiProjects({ body: { name: 'refused' } });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(owner.snapshot().kind).toBe('lost');
  expect(runtime.services.isCurrent()).toBe(false);
  await owner.leave();
});

it('sign-out fences a pending selection confirmation', async () => {
  let confirm: ((reply: ClientReply<typeof readActiveOrganization>) => void) | undefined;
  const sessionOwner = sessions();
  const owner = createOrganizationOwner({
    identity,
    sessions: sessionOwner,
    routes: {
      discover: () =>
        new Promise((resolve) => {
          confirm = resolve;
        }),
      select: (id) => Promise.resolve(selected(id)),
    },
  });
  const choosing = owner.choose('org-a');
  await vi.waitFor(() => {
    expect(confirm).toBeDefined();
  });
  await owner.leave();
  if (confirm === undefined) throw new Error('confirmation absent');
  confirm(active('org-a'));
  expect(await choosing).toBe('overtaken');
  expect(sessionOwner.snapshot().status).not.toBe('live');
});

it('focus reconciliation cannot publish old A while a B selection is in flight', async () => {
  let releaseSelection: ((reply: ClientReply<typeof selectActiveOrganization>) => void) | undefined;
  let selectedOrganization = 'org-a';
  const announce = vi.fn();
  const discover = vi.fn(() => Promise.resolve(active(selectedOrganization)));
  const owner = createOrganizationOwner({
    identity,
    sessions: sessions(),
    routes: {
      discover,
      select: () =>
        new Promise((resolve) => {
          releaseSelection = resolve;
        }),
    },
    announce,
  });
  await owner.refresh();
  const published: string[] = [];
  const unsubscribe = owner.subscribe(() => {
    const state = owner.snapshot();
    if (state.kind === 'active') published.push(state.organization.organizationId);
  });
  const choosing = owner.choose('org-b');
  await vi.waitFor(() => {
    expect(releaseSelection).toBeDefined();
  });
  const reconciling = owner.notice('focus');
  expect(owner.snapshot().kind).toBe('switching');
  expect(discover).toHaveBeenCalledTimes(1);
  if (releaseSelection === undefined) throw new Error('selection was not requested');
  selectedOrganization = 'org-b';
  releaseSelection(selected('org-b'));
  expect(await choosing).toBe('overtaken');
  expect(await reconciling).toBe('published');
  expect(owner.snapshot()).toMatchObject({
    kind: 'active',
    organization: { organizationId: 'org-b' },
  });
  expect(announce).toHaveBeenCalledTimes(1);
  expect(published).toEqual(['org-b']);
  unsubscribe();
  await owner.leave();
});

it('focus reconciliation cannot restore old A when an in-flight B selection fails', async () => {
  let releaseSelection: ((reply: ClientReply<typeof selectActiveOrganization>) => void) | undefined;
  const discover = vi.fn(() => Promise.resolve(active('org-a')));
  const owner = createOrganizationOwner({
    identity,
    sessions: sessions(),
    routes: {
      discover,
      select: () =>
        new Promise((resolve) => {
          releaseSelection = resolve;
        }),
    },
  });
  await owner.refresh();
  const published: string[] = [];
  const unsubscribe = owner.subscribe(() => {
    const state = owner.snapshot();
    if (state.kind === 'active') published.push(state.organization.organizationId);
  });
  const choosing = owner.choose('org-b');
  await vi.waitFor(() => {
    expect(releaseSelection).toBeDefined();
  });
  const reconciling = owner.notice('focus');
  expect(owner.snapshot().kind).toBe('switching');
  if (releaseSelection === undefined) throw new Error('selection was not requested');
  releaseSelection({
    kind: 'failure',
    failure: { code: 'transport', cause: new Error('offline') },
  });
  expect(await choosing).toBe('refused');
  expect(await reconciling).toBe('refused');
  expect(owner.snapshot().kind).toBe('failure');
  expect(discover).toHaveBeenCalledTimes(1);
  expect(published).toEqual([]);
  unsubscribe();
  await owner.leave();
});

it('a peer notice invalidates a held B confirmation before it can publish', async () => {
  let releaseConfirmation:
    ((reply: ClientReply<typeof readActiveOrganization>) => void) | undefined;
  let latest = 'org-a';
  let reads = 0;
  const owner = createOrganizationOwner({
    identity,
    sessions: sessions(),
    routes: {
      discover: () =>
        ++reads === 2
          ? new Promise((resolve) => {
              releaseConfirmation = resolve;
            })
          : Promise.resolve(active(latest)),
      select: (organizationId) => {
        latest = organizationId;
        return Promise.resolve(selected(organizationId));
      },
    },
  });
  await owner.refresh();
  const published: string[] = [];
  const unsubscribe = owner.subscribe(() => {
    const state = owner.snapshot();
    if (state.kind === 'active') published.push(state.organization.organizationId);
  });
  const choosing = owner.choose('org-b');
  await vi.waitFor(() => {
    expect(releaseConfirmation).toBeDefined();
  });
  latest = 'org-c';
  const reconciling = owner.notice({ organizationId: 'org-a' });
  if (releaseConfirmation === undefined) throw new Error('confirmation was not requested');
  releaseConfirmation(active('org-b'));
  expect(await choosing).toBe('overtaken');
  expect(await reconciling).toBe('refused');
  expect(owner.snapshot().kind).toBe('failure');
  expect(reads).toBe(3);
  expect(published).toEqual([]);
  unsubscribe();
  await owner.leave();
});

it('sign-out cancels queued reconciliation without reopening resources', async () => {
  let releaseSelection: ((reply: ClientReply<typeof selectActiveOrganization>) => void) | undefined;
  const announce = vi.fn();
  const sessionOwner = sessions();
  const owner = createOrganizationOwner({
    identity,
    sessions: sessionOwner,
    routes: {
      discover: () => Promise.resolve(active('org-a')),
      select: () =>
        new Promise((resolve) => {
          releaseSelection = resolve;
        }),
    },
    announce,
  });
  await owner.refresh();
  const choosing = owner.choose('org-b');
  await vi.waitFor(() => {
    expect(releaseSelection).toBeDefined();
  });
  const reconciling = owner.notice('focus');
  await owner.leave();
  expect(await reconciling).toBe('overtaken');
  if (releaseSelection === undefined) throw new Error('selection was not requested');
  releaseSelection(selected('org-b'));
  expect(await choosing).toBe('overtaken');
  expect(sessionOwner.snapshot().status).not.toBe('live');
  expect(announce).not.toHaveBeenCalled();
});

it('preserves the complete company sign-in refusal during selection', async () => {
  const refusal = {
    error: 'sso_required',
    organizationId: 'org-a',
    login: '/api/auth/login?organization=acme-eu',
    link: true,
  } as const;
  const owner = createOrganizationOwner({
    identity,
    sessions: sessions(),
    routes: {
      discover: () => Promise.resolve(active('org-a')),
      select: () =>
        Promise.resolve({
          kind: 'refusal',
          representation: 'json',
          status: 403,
          headers: new Headers(),
          body: refusal,
        }),
    },
  });
  await owner.choose('org-a');
  expect(owner.snapshot()).toEqual({ kind: 'lost', refusal });
  await owner.leave();
});
