import { afterEach, expect, it, vi } from 'vitest';

import { OrganizationPage } from '@/components/organization/organization-page';
import type { ResourceScope } from '@/lib/organization-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@/testing/organization-render';
import { answerJson, stubServer } from '@/testing/stub-server';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const definition = {
  id: 'step-dev',
  organizationId: 'org-a',
  code: 'dev',
  name: 'Development',
  position: 10,
  defaultEstimateUnit: 'minutes',
  defaultAllowanceBps: 1234,
  definedAt: { scopeKind: 'organization', scopeId: 'org-a' },
  origin: 'authored',
};
const catalogue = {
  definitions: [definition],
  bindings: [
    {
      bindingId: 'binding-dev',
      organizationId: 'org-a',
      stepId: 'step-dev',
      scopeKind: 'organization',
      scopeId: 'org-a',
      workItemTypeId: null,
      position: 10,
      origin: 'authored',
    },
  ],
};

/** Actual page/client/provider; only the HTTP transport is controlled, with every unrelated panel healthy. */
function stubPage(answers: Parameters<typeof stubServer>[0]['GET /api/organization/steps']) {
  const sent = stubServer({
    'GET /api/organization/active': [
      () => answerJson(200, { organizationId: 'org-a', name: 'Acme', role: 'viewer' }),
    ],
    'GET /api/organization/sso-connections': [() => answerJson(200, { connections: [] })],
    'GET /api/organization/provisioning-tokens': [() => answerJson(200, { tokens: [] })],
    'GET /api/organization/session-policy': [() => answerJson(200, { policy: null })],
    'GET /api/organization/join-requests': [() => answerJson(200, { requests: [] })],
    'GET /api/organization/domains': [() => answerJson(200, { domains: [] })],
    'GET /api/organization/members': [() => answerJson(200, { members: [] })],
    'GET /api/organization/invitations': [() => answerJson(200, { invitations: [] })],
    'GET /api/organization': [
      () => answerJson(200, { sharedPeople: false, sharingAvailable: false, canSwitch: false }),
    ],
    'GET /api/organization/steps': answers,
    'GET /api/work-item-types': [() => answerJson(200, { workItemTypes: [] })],
  });
  const forwarded = globalThis.fetch;
  const headers: Headers[] = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (new URL(path, 'http://wbs.test').pathname === '/api/organization/steps')
      headers.push(new Headers(init?.headers));
    return forwarded(input, init);
  });
  return { sent, headers };
}

function renderPage() {
  const refuse = vi.fn();
  const scope: ResourceScope = {
    organization: { kind: 'active', organizationId: 'org-a' },
    isCurrent: () => true,
    refuse,
  };
  render(
    <OrganizationResourcesProvider scope={scope}>
      <OrganizationPage nav={<nav />} account={<span />} userId="viewer-a" />
    </OrganizationResourcesProvider>,
  );
  expect(screen.getByRole('heading', { name: 'Organization', level: 1 })).toBeDefined();
  expect(screen.getByRole('region', { name: 'Invitations' })).toBeDefined();
  return { refuse };
}

it('organization Steps renders loading then an empty active catalogue in its real page', async () => {
  const transport = stubPage([() => answerJson(200, { definitions: [], bindings: [] })]);
  renderPage();
  const panel = screen.getByRole('region', { name: 'Steps' });
  expect(within(panel).getByText('Loading steps…')).toBeDefined();
  expect(await within(panel).findByText('No step definitions yet.')).toBeDefined();
  expect(
    transport.sent.filter(({ route }) => route === 'GET /api/organization/steps'),
  ).toHaveLength(1);
  expect(transport.headers.map((headers) => headers.get('X-WBS-Expected-Organization'))).toEqual([
    'org-a',
  ]);
});

it('organization Steps renders query failure and retries the actual catalogue request', async () => {
  const transport = stubPage([
    () => {
      throw new Error('controlled catalogue transport failure');
    },
    () => answerJson(200, { definitions: [], bindings: [] }),
  ]);
  renderPage();
  await screen.findByText('No invitations yet.');
  const panel = await screen.findByRole('region', { name: 'Steps' });
  expect(await within(panel).findByRole('alert')).toHaveProperty(
    'textContent',
    'Could not reach the server. Try again.',
  );
  expect(within(panel).queryByText('No step definitions yet.')).toBeNull();
  fireEvent.click(within(panel).getByRole('button', { name: 'Retry steps' }));
  expect(await within(panel).findByText('No step definitions yet.')).toBeDefined();
  expect(
    transport.sent.filter(({ route }) => route === 'GET /api/organization/steps'),
  ).toHaveLength(2);
});

it('organization Steps draws current definition defaults from the catalogue wire for a reader', async () => {
  const transport = stubPage([() => answerJson(200, catalogue)]);
  renderPage();
  await screen.findByText('No invitations yet.');
  const panel = await screen.findByRole('region', { name: 'Steps' });
  const table = await within(panel).findByRole('table', { name: 'Step definitions' });
  expect(within(table).getByText('Development')).toBeDefined();
  expect(within(table).getByText('dev')).toBeDefined();
  expect(within(table).getByText('Minutes')).toBeDefined();
  expect(within(table).getByText('12.34%')).toBeDefined();
  expect(transport.sent.filter(({ route }) => !route.startsWith('GET '))).toEqual([]);
  expect(transport.headers.map((headers) => headers.get('X-WBS-Expected-Organization'))).toEqual([
    'org-a',
  ]);
});

it('organization Steps gives up all page rows when its catalogue refresh loses membership', async () => {
  stubPage([() => answerJson(200, catalogue), () => answerJson(403, { error: 'not_a_member' })]);
  const { refuse } = renderPage();
  const panel = await screen.findByRole('region', { name: 'Steps' });
  await within(await within(panel).findByRole('table', { name: 'Step definitions' })).findByText(
    'Development',
  );
  fireEvent.click(within(panel).getByRole('button', { name: 'Refresh steps' }));
  expect(await screen.findByText('You no longer have access to this organization.')).toBeDefined();
  await waitFor(() => {
    expect(screen.queryByRole('region', { name: 'Steps' })).toBeNull();
  });
  expect(screen.queryByText('Development')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Invitations' })).toBeNull();
  expect(refuse).toHaveBeenCalledWith({ error: 'not_a_member' });
});

it('organization Steps keeps the newer refresh when an older real request completes afterward', async () => {
  const older = { ...definition, id: 'step-older', code: 'older', name: 'Older response' };
  const newer = { ...definition, id: 'step-newer', code: 'newer', name: 'Newer response' };
  const transport = stubPage([
    () => answerJson(200, catalogue),
    () => answerJson(200, { definitions: [older], bindings: [] }),
    () => answerJson(200, { definitions: [newer], bindings: [] }),
  ]);
  const forwarded = globalThis.fetch;
  let complete: (() => void) | undefined;
  const release = {
    promise: new Promise<void>((resolve) => {
      complete = resolve;
    }),
    resolve: () => {
      if (complete === undefined) throw new Error('catalogue read promise executor did not run');
      complete();
    },
  };
  let reads = 0;
  let pending: Promise<Response> | undefined;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const response = forwarded(input, init);
    if (new URL(path, 'http://wbs.test').pathname === '/api/organization/steps' && ++reads === 2) {
      pending = response.then(async (reply) => {
        await release.promise;
        return reply;
      });
      return pending;
    }
    return response;
  });
  try {
    renderPage();
    const panel = await screen.findByRole('region', { name: 'Steps' });
    expect(
      await within(
        await within(panel).findByRole('table', { name: 'Step definitions' }),
      ).findByText('Development'),
    ).toBeDefined();
    fireEvent.click(within(panel).getByRole('button', { name: 'Refresh steps' }));
    await waitFor(() => {
      expect(reads).toBe(2);
    });
    expect(within(panel).getByText('Loading steps…')).toBeDefined();
    expect(within(panel).queryByText('Development')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Refresh steps' }));
    expect(await within(panel).findByText('Newer response')).toBeDefined();
    if (pending === undefined) throw new Error('actual earlier catalogue read was not held');
    await act(async () => {
      release.resolve();
      await pending;
    });
    expect(within(panel).getByText('Newer response')).toBeDefined();
    expect(within(panel).queryByText('Older response')).toBeNull();
    expect(
      transport.sent.filter(({ route }) => route === 'GET /api/organization/steps'),
    ).toHaveLength(3);
  } finally {
    release.resolve();
    if (pending !== undefined) await pending;
  }
});
