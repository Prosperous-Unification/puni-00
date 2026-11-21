import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { Component, type ReactNode, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

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
import { answerEmpty, answerJson, type StubAnswer, stubServer } from '@/testing/stub-server';

import { SpacePage } from './space-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const ana = { id: 'ana', name: 'Ana', kind: 'person', teamIds: [] };
const bot = { id: 'bot', name: 'Build agent', kind: 'agent', teamIds: [] };
const team = { id: 'ops', name: 'Operations', serviceIds: [] };
const spare = { id: 'design', name: 'Design', serviceIds: [] };
function createSpaceRead(
  id = 's',
  writable = true,
  personIds: string[] = [],
  serviceTeamIds: string[] = [],
) {
  return {
    space: {
      id,
      name: id === 's' ? 'Q3' : 'Q4',
      virtual: id === 'all',
      projectCount: 0,
      workPackageCount: 0,
      revision: 1,
      createdById: 'u',
      createdAt: 1,
    },
    writable,
    personIds,
    serviceTeamIds,
    projects: [],
  };
}
function serveSpaces(overrides: Record<string, StubAnswer[]> = {}) {
  return stubServer({
    'GET /api/spaces/s': [() => answerJson(200, createSpaceRead())],
    'GET /api/spaces/t': [() => answerJson(200, createSpaceRead('t'))],
    'GET /api/projects': [() => answerJson(200, { projects: [] })],
    'GET /api/organization/steps': [() => answerJson(503, { error: 'fixture_steps_unavailable' })],
    'GET /api/spaces/s/in-progress': [
      () => answerJson(200, { items: [], truncated: false, unavailable: [] }),
    ],
    'GET /api/spaces/t/in-progress': [
      () => answerJson(200, { items: [], truncated: false, unavailable: [] }),
    ],
    'GET /api/people': [() => answerJson(200, { people: [ana, bot] })],
    'GET /api/teams': [() => answerJson(200, { teams: [team, spare] })],
    ...overrides,
  });
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <p role="alert">Membership protocol failed</p> : this.props.children;
  }
}
/** A real resource owner withdraws its children when the client reports access loss. */
function Host({ initial = 's', legacy = false }: { initial?: string; legacy?: boolean }) {
  const [id, setId] = useState(initial),
    [withdrawn, setWithdrawn] = useState(false);
  const [scope] = useState<ResourceScope>(() => ({
    organization: legacy ? { kind: 'legacy' } : { kind: 'active', organizationId: 'org-a' },
    isCurrent: () => true,
    refuse: () => {
      setWithdrawn(true);
    },
  }));
  return withdrawn ? (
    <p>Organization resources withdrawn</p>
  ) : (
    <OrganizationResourcesProvider scope={scope}>
      <button
        onClick={() => {
          setId('t');
        }}
      >
        Switch space
      </button>
      <Boundary>
        <SpacePage spaceId={id} nav={null} account={null} />
      </Boundary>
    </OrganizationResourcesProvider>
  );
}
function mountSpace(props: Parameters<typeof Host>[0] = {}) {
  const root = createRootRoute({ component: () => <Host {...props} /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
}

for (const kind of ['person', 'team'] as const)
  it(
    'adds and removes a ' +
      kind +
      ' through bodyless membership calls and the authoritative space reread',
    async () => {
      const isPerson = kind === 'person',
        member = isPerson ? ana : team,
        other = isPerson ? bot : spare;
      const read = () =>
        createSpaceRead('s', true, isPerson ? [ana.id] : [], isPerson ? [] : [team.id]);
      const route = `/api/spaces/s/${isPerson ? 'people' : 'teams'}/${other.id}`;
      const sent = serveSpaces({
        'GET /api/spaces/s': [
          () => answerJson(200, read()),
          () =>
            answerJson(
              200,
              createSpaceRead(
                's',
                true,
                isPerson ? [ana.id, bot.id] : [],
                isPerson ? [] : [team.id, spare.id],
              ),
            ),
          () => answerJson(200, read()),
        ],
        ['POST ' + route]: [() => answerEmpty(204)],
        ['DELETE ' + route]: [() => answerEmpty(204)],
      });
      mountSpace();
      const panel = await screen.findByRole('region', {
        name: isPerson ? 'People in this space' : 'Teams in this space',
      });
      await within(panel).findByText(member.name);
      const select = within(panel).getByLabelText(isPerson ? 'Add a person' : 'Add a team');
      expect(within(select).queryByRole('option', { name: member.name })).toBeNull();
      fireEvent.change(select, { target: { value: other.id } });
      fireEvent.submit(
        within(panel).getByRole('form', {
          name: isPerson ? 'Add a person to this space' : 'Add a team to this space',
        }),
      );
      const remove = await within(panel).findByRole('button', {
        name: `Remove ${kind} ${other.name} from this space`,
      });
      fireEvent.click(remove);
      await waitFor(() => {
        expect(
          within(panel).queryByRole('button', {
            name: `Remove ${kind} ${other.name} from this space`,
          }),
        ).toBeNull();
      });
      expect(
        sent.filter(
          (request) => request.route.startsWith('POST ') || request.route.startsWith('DELETE '),
        ),
      ).toEqual([
        { route: 'POST ' + route, body: undefined },
        { route: 'DELETE ' + route, body: undefined },
      ]);
    },
  );

it('shows members to a viewer without offering membership mutations', async () => {
  serveSpaces({
    'GET /api/spaces/s': [() => answerJson(200, createSpaceRead('s', false, [ana.id], [team.id]))],
  });
  mountSpace();
  const people = await screen.findByRole('region', { name: 'People in this space' }),
    teams = await screen.findByRole('region', { name: 'Teams in this space' });
  await within(people).findByText('Ana');
  await within(teams).findByText('Operations');
  expect(within(people).queryByRole('combobox')).toBeNull();
  expect(within(teams).queryByRole('combobox')).toBeNull();
  expect(within(people).queryByRole('button', { name: /Remove person/ })).toBeNull();
  expect(within(teams).queryByRole('button', { name: /Remove team/ })).toBeNull();
});

it('does not invent belonging for virtual all and explains inactive organization membership', async () => {
  const sent = serveSpaces({
    'GET /api/spaces/all': [() => answerJson(200, createSpaceRead('all', false))],
    'GET /api/spaces/all/in-progress': [
      () => answerJson(200, { items: [], truncated: false, unavailable: [] }),
    ],
  });
  mountSpace({ initial: 'all' });
  await screen.findByRole('heading', { name: 'Q4' });
  expect(screen.queryByRole('region', { name: 'People in this space' })).toBeNull();
  expect(sent.some((request) => request.route === 'GET /api/people')).toBe(false);
  cleanup();
  mountSpace({ legacy: true });
  expect(await screen.findByText('Choose an organization to see people and teams.')).toBeDefined();
});

it('withholds changed membership instead of silently dropping an identity and refreshes it', async () => {
  serveSpaces({
    'GET /api/spaces/s': [
      () => answerJson(200, createSpaceRead('s', true, ['removed-person'])),
      () => answerJson(200, createSpaceRead()),
    ],
  });
  mountSpace();
  const panel = await screen.findByRole('region', { name: 'People in this space' });
  expect(
    await within(panel).findByText(
      'People in this space changed while loading. Refresh to update membership.',
    ),
  ).toBeDefined();
  expect(within(panel).queryByRole('combobox')).toBeNull();
  fireEvent.click(within(panel).getByRole('button', { name: 'Refresh people' }));
  expect(await within(panel).findByText('No people in this space.')).toBeDefined();
});

it('renders a directory failure and retries without pretending the membership is empty', async () => {
  serveSpaces({
    'GET /api/people': [
      () => answerJson(503, { error: 'directory_down' }),
      () => answerJson(200, { people: [ana] }),
    ],
  });
  mountSpace();
  const panel = await screen.findByRole('region', { name: 'People in this space' });
  expect(await within(panel).findByRole('alert')).toBeDefined();
  expect(within(panel).queryByText('No people in this space.')).toBeNull();
  fireEvent.click(within(panel).getByRole('button', { name: 'Refresh people' }));
  expect(await within(panel).findByLabelText('Add a person')).toBeDefined();
});

for (const surface of ['directory', 'write'] as const)
  it('withdraws the whole owner after membership loss on ' + surface, async () => {
    serveSpaces(
      surface === 'directory'
        ? { 'GET /api/people': [() => answerJson(403, { error: 'not_a_member' })] }
        : { 'POST /api/spaces/s/people/ana': [() => answerJson(403, { error: 'not_a_member' })] },
    );
    mountSpace();
    if (surface === 'write') {
      fireEvent.change(await screen.findByLabelText('Add a person'), { target: { value: 'ana' } });
      fireEvent.submit(screen.getByRole('form', { name: 'Add a person to this space' }));
    }
    expect(await screen.findByText('Organization resources withdrawn')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Q3' })).toBeNull();
  });

it('ignores a superseded directory refusal before it can withdraw a newer read owner', async () => {
  const gate = holdReply();
  let reads = 0;
  serveSpaces();
  const forwarded = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const address =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (address.endsWith('/api/people') && ++reads === 1) {
      await gate.promise;
      return answerJson(403, { error: 'not_a_member' });
    }
    return forwarded(input, init);
  });
  mountSpace();
  const panel = await screen.findByRole('region', { name: 'People in this space' });
  fireEvent.click(within(panel).getByRole('button', { name: 'Refresh people' }));
  await within(panel).findByLabelText('Add a person');
  await act(() => {
    gate.resolve();
    return gate.promise;
  });
  expect(screen.getByRole('heading', { name: 'Q3' })).toBeDefined();
  expect(screen.queryByText('Organization resources withdrawn')).toBeNull();
});

it('fences a held write and its draft when the actual space owner changes', async () => {
  const gate = holdReply();
  const sent = serveSpaces();
  const forwarded = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const address =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (address.endsWith('/api/spaces/s/people/ana') && init?.method === 'POST') {
      await gate.promise;
      return answerJson(403, { error: 'not_a_member' });
    }
    return forwarded(input, init);
  });
  mountSpace();
  fireEvent.change(await screen.findByLabelText('Add a person'), { target: { value: 'ana' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Add a person to this space' }));
  fireEvent.click(screen.getByRole('button', { name: 'Switch space' }));
  await screen.findByRole('heading', { name: 'Q4' });
  const reads = sent.filter((request) => request.route === 'GET /api/spaces/t').length;
  await act(() => {
    gate.resolve();
    return gate.promise;
  });
  expect(screen.getByRole('heading', { name: 'Q4' })).toBeDefined();
  expect(screen.queryByText('Organization resources withdrawn')).toBeNull();
  expect(screen.getByLabelText<HTMLSelectElement>('Add a person').value).toBe('');
  expect(sent.filter((request) => request.route === 'GET /api/spaces/t')).toHaveLength(reads);
});

it('rejects duplicate directory identities through the page error boundary', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  serveSpaces({
    'GET /api/people': [() => answerJson(200, { people: [ana, { ...ana, name: 'Imposter' }] })],
  });
  mountSpace();
  expect(await screen.findByText('Membership protocol failed')).toBeDefined();
  expect(errors).toHaveBeenCalled();
});

it('retires the old membership editor as soon as navigation starts, before the new space answers', async () => {
  const written = holdReply();
  const nextSpace = holdReply();
  serveSpaces();
  const forwarded = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const address =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (address.endsWith('/api/spaces/t')) {
      await nextSpace.promise;
      return answerJson(200, createSpaceRead('t'));
    }
    if (address.endsWith('/api/spaces/s/people/ana') && init?.method === 'POST') {
      await written.promise;
      return answerJson(403, { error: 'not_a_member' });
    }
    return forwarded(input, init);
  });
  mountSpace();
  fireEvent.change(await screen.findByLabelText('Add a person'), { target: { value: 'ana' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Add a person to this space' }));
  fireEvent.click(screen.getByRole('button', { name: 'Switch space' }));
  await act(() => {
    written.resolve();
    return written.promise;
  });
  expect(screen.queryByText('Organization resources withdrawn')).toBeNull();
  expect(screen.queryByRole('region', { name: 'People in this space' })).toBeNull();
  await act(() => {
    nextSpace.resolve();
    return nextSpace.promise;
  });
  expect(await screen.findByRole('heading', { name: 'Q4' })).toBeDefined();
});

it('admits only one write when the same form is submitted twice before repaint', async () => {
  const gate = holdReply();
  let writes = 0;
  serveSpaces();
  const forwarded = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const address =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (address.endsWith('/api/spaces/s/people/ana') && init?.method === 'POST') {
      writes++;
      await gate.promise;
      return answerEmpty(204);
    }
    return forwarded(input, init);
  });
  mountSpace();
  fireEvent.change(await screen.findByLabelText('Add a person'), { target: { value: 'ana' } });
  const form = screen.getByRole('form', { name: 'Add a person to this space' });
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  await waitFor(() => {
    expect(writes).toBe(1);
  });
  await act(() => {
    gate.resolve();
    return gate.promise;
  });
  expect(writes).toBe(1);
});

it('binds every directory and bodyless membership request to the captured organization', async () => {
  const headers: { path: string; expected: string | null }[] = [];
  serveSpaces({ 'POST /api/spaces/s/people/ana': [() => answerEmpty(204)] });
  const forwarded = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path =
      typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    headers.push({ path, expected: new Headers(init?.headers).get('X-WBS-Expected-Organization') });
    return forwarded(input, init);
  });
  mountSpace();
  fireEvent.change(await screen.findByLabelText('Add a person'), { target: { value: 'ana' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Add a person to this space' }));
  await screen.findByText('Added Ana to this space.');
  for (const path of ['/api/people', '/api/teams', '/api/spaces/s/people/ana']) {
    const matching = headers.filter((request) => request.path === path);
    expect(matching.length).toBeGreaterThan(0);
    expect(matching.every((request) => request.expected === 'org-a')).toBe(true);
  }
});

/** Holds the network boundary until the test observes the owner transition. */
function holdReply(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}
