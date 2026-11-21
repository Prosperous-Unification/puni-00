import { createMemoryHistory } from '@tanstack/react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { AppRouter } from '@/app-router';
import { AppFaultBoundary } from '@/components/chrome/app-fault';
import { FaultBoundary } from '@/components/chrome/fault-boundary';
import { ScopedSteps } from '@/components/organization/scoped-steps';
import { StepsPanel } from '@/components/organization/steps-panel';
import { ProjectPicker } from '@/components/projects/project-picker';
import type { ResourceScope } from '@/lib/organization-context';
import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import { installSessionRuntime } from '@/runtime/session-runtime';
import { installWorkPackageRuntime } from '@/runtime/work-package-runtime';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@/testing/organization-render';
import { refusingApi } from '@/testing/refusing-api';
import { answerJson, stubServer } from '@/testing/stub-server';

publishApplicationRuntimeForEachTest();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const project = {
  id: 'project-a',
  organizationId: 'org-a',
  spaceId: 'space-a',
  spacePosition: 10,
  name: 'Mars',
  revision: 1,
  createdAt: 1,
  updatedAt: null,
  createdBy: 'user-a',
  workPackageCount: 0,
  workPackages: [],
};
const space = {
  id: 'space-a',
  name: 'Q3',
  virtual: false,
  projectCount: 0,
  workPackageCount: 0,
  revision: 1,
  createdById: 'user-a',
  createdAt: 1,
};
const story = { id: 'story', name: 'Story' },
  spike = { id: 'spike', name: 'Spike' };
const dev = {
  id: 'dev',
  organizationId: 'org-a',
  code: 'dev',
  name: 'Development',
  position: 10,
  defaultEstimateUnit: 'workdays',
  defaultAllowanceBps: 0,
  definedAt: { scopeKind: 'organization', scopeId: 'org-a' },
  origin: 'authored',
};
const qa = {
  ...dev,
  id: 'qa',
  code: 'qa',
  name: 'QA',
  position: 20,
  definedAt: { scopeKind: 'space', scopeId: 'space-a' },
};
const review = {
  ...dev,
  id: 'review',
  code: 'review',
  name: 'Review',
  position: 30,
  definedAt: { scopeKind: 'project', scopeId: 'project-a' },
};
const orgBinding = {
  bindingId: 'org-dev',
  organizationId: 'org-a',
  stepId: 'dev',
  scopeKind: 'organization',
  scopeId: 'org-a',
  workItemTypeId: null,
  position: 10,
  origin: 'authored',
};
const spaceBinding = {
  ...orgBinding,
  bindingId: 'space-qa',
  stepId: 'qa',
  scopeKind: 'space',
  scopeId: 'space-a',
  workItemTypeId: 'story',
};
const projectBinding = {
  ...orgBinding,
  bindingId: 'project-review',
  stepId: 'review',
  scopeKind: 'project',
  scopeId: 'project-a',
  workItemTypeId: 'story',
};
const redundantBinding = {
  ...orgBinding,
  bindingId: 'project-dev',
  scopeKind: 'project',
  scopeId: 'project-a',
};
const catalogue = {
  definitions: [dev, qa, review],
  bindings: [orgBinding, spaceBinding, projectBinding, redundantBinding],
};
const via = ({ bindingId, scopeKind, scopeId, workItemTypeId }: typeof orgBinding) => ({
  bindingId,
  scopeKind,
  scopeId,
  workItemTypeId,
});
const untyped = {
  steps: [
    {
      stepId: 'dev',
      code: 'dev',
      name: 'Development',
      via: [via(orgBinding), via(redundantBinding)],
    },
  ],
};
const typed = {
  steps: [
    ...untyped.steps,
    {
      stepId: 'qa',
      code: 'qa',
      name: 'QA',
      via: [
        { bindingId: 'space-qa', scopeKind: 'space', scopeId: 'space-a', workItemTypeId: 'story' },
      ],
    },
    {
      stepId: 'review',
      code: 'review',
      name: 'Review',
      via: [
        {
          bindingId: 'project-review',
          scopeKind: 'project',
          scopeId: 'project-a',
          workItemTypeId: 'story',
        },
      ],
    },
  ],
};

function serve(overrides: Parameters<typeof stubServer>[0] = {}) {
  return stubServer({
    'GET /api/projects/project-a': [() => answerJson(200, { project })],
    'GET /api/projects/project-b': [
      () => answerJson(200, { project: { ...project, id: 'project-b', name: 'Venus' } }),
    ],
    'GET /api/organization/steps': [() => answerJson(200, catalogue)],
    'GET /api/work-item-types': [() => answerJson(200, { workItemTypes: [story, spike] })],
    'GET /api/projects/project-a/steps': [() => answerJson(200, untyped)],
    'GET /api/projects/project-b/steps': [() => answerJson(200, { steps: [] })],
    'GET /api/spaces/space-a': [
      () =>
        answerJson(200, {
          space,
          writable: false,
          projects: [],
          personIds: [],
          serviceTeamIds: [],
        }),
    ],
    'GET /api/spaces/space-a/in-progress': [
      () => answerJson(200, { items: [], truncated: false, unavailable: [] }),
    ],
    'GET /api/spaces/all': [
      () =>
        answerJson(200, {
          space: {
            ...space,
            id: 'all',
            name: 'All projects',
            virtual: true,
            createdById: null,
            createdAt: null,
            revision: 0,
          },
          writable: false,
          projects: [],
          personIds: [],
          serviceTeamIds: [],
        }),
    ],
    'GET /api/spaces/all/in-progress': [
      () => answerJson(200, { items: [], truncated: false, unavailable: [] }),
    ],
    ...overrides,
  });
}
function mount(path: string, expectedFault?: string, active = true, productionBoundary = false) {
  const organization = active
    ? { kind: 'active' as const, organizationId: 'org-a' }
    : { kind: 'legacy' as const };
  const scope: ResourceScope = { organization, isCurrent: () => true, refuse: vi.fn() };
  const owned = installSessionRuntime({
    userId: 'user-a',
    organization,
    resourceScope: scope,
    directoryApi: fakeDirectoryApi(),
    catalogRoutes: refusingApi({}),
    workPackageSourceFor: () => {
      throw Error('Settings must not invent or open a work package');
    },
    isCurrent: () => true,
    installWorkPackage: installWorkPackageRuntime,
    budgetMs: 1000,
  });
  const history = createMemoryHistory({ initialEntries: [path] });
  const surface = (
    <AppRouter
      session={owned.services}
      presence={() => null}
      account={<span>Account</span>}
      history={history}
    />
  );
  render(
    productionBoundary ? (
      <AppFaultBoundary>{surface}</AppFaultBoundary>
    ) : (
      <FaultBoundary
        logAs="scoped step owner test"
        resetKey="owner"
        discloses={(cause) => {
          let current = cause;
          while (current instanceof Error) {
            if (current.message === expectedFault) return 'Expected owner fault.';
            current = current.cause;
          }
          return null;
        }}
        fallback={(fault) => <p role="alert">{fault.sentence}</p>}
      >
        {surface}
      </FaultBoundary>
    ),
  );
  return { history, scope };
}
async function draft(scopeName: string) {
  const panel = await screen.findByRole('region', { name: 'Steps' });
  const form = await within(panel).findByRole('form', { name: 'New step definition' });
  fireEvent.change(within(form).getByLabelText('Step name'), { target: { value: 'Audit' } });
  fireEvent.change(within(form).getByLabelText('Step code'), { target: { value: 'audit' } });
  fireEvent.change(within(form).getByLabelText('Default estimate unit'), {
    target: { value: 'minutes' },
  });
  fireEvent.change(within(form).getByLabelText('Default allowance (%)'), {
    target: { value: '5.5' },
  });
  await within(form).findByRole('option', { name: 'Story' });
  fireEvent.change(within(form).getByLabelText('Work item type'), {
    target: { value: within(form).getByRole('option', { name: 'Story' }).getAttribute('value') },
  });
  expect(await screen.findByRole('region', { name: scopeName + ' step bindings' })).toBeDefined();
  return form;
}

it('links project settings only from an actual observed selection, including an empty project', () => {
  const properties = {
    choices: { kind: 'ready' as const, projects: [project] },
    onChoose: vi.fn(),
    onRefresh: vi.fn(),
  };
  const mounted = render(<ProjectPicker {...properties} selectedId={null} />);
  expect(screen.queryByRole('link', { name: 'Project settings for Mars' })).toBeNull();
  mounted.rerender(<ProjectPicker {...properties} selectedId="project-a" />);
  expect(screen.getByRole('link', { name: 'Project settings for Mars' }).getAttribute('href')).toBe(
    '/projects/project-a/settings',
  );
  mounted.rerender(<ProjectPicker {...properties} selectedId="unlisted" />);
  expect(screen.queryByRole('link', { name: 'Project settings for Mars' })).toBeNull();
});

it('opens actual empty project settings without manufacturing a package or global edit authority', async () => {
  const sent = serve();
  mount('/projects/project-a/settings');
  expect(await screen.findByRole('heading', { name: 'Mars', level: 1 })).toBeDefined();
  await screen.findByRole('region', { name: 'Mars step bindings' });
  expect(screen.queryByRole('button', { name: 'Edit Development' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Retire Development' })).toBeNull();
  expect(sent.some(({ route }) => route.includes('/work-packages/'))).toBe(false);
});

for (const owner of [
  { kind: 'organization', id: 'org-a', name: 'Organization', path: null },
  { kind: 'project', id: 'project-a', name: 'Mars', path: '/projects/project-a/settings' },
  { kind: 'space', id: 'space-a', name: 'Q3', path: '/spaces/space-a' },
]) {
  it(
    'defines and binds a real typed step at the actual ' + owner.kind + ' settings owner',
    async () => {
      const authored = {
        ...dev,
        id: 'audit',
        code: 'audit',
        name: 'Audit',
        defaultEstimateUnit: 'minutes',
        defaultAllowanceBps: 550,
        definedAt: { scopeKind: owner.kind, scopeId: owner.id },
      };
      const binding = {
        ...orgBinding,
        bindingId: 'audit-binding',
        stepId: 'audit',
        scopeKind: owner.kind,
        scopeId: owner.id,
        workItemTypeId: 'story',
      };
      const sent = serve({
        'GET /api/organization/steps': [
          () => answerJson(200, catalogue),
          () =>
            answerJson(200, {
              definitions: [...catalogue.definitions, { ...authored, name: 'Canonical audit' }],
              bindings: [...catalogue.bindings, binding],
            }),
        ],
        'POST /api/organization/step-bindings': [
          () => answerJson(201, { definition: authored, binding }),
        ],
      });
      const forwarded = globalThis.fetch,
        headers: Headers[] = [];
      vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
        headers.push(new Headers(init?.headers));
        return forwarded(input, init);
      });
      if (owner.path === null) {
        const scope: ResourceScope = {
          organization: { kind: 'active', organizationId: 'org-a' },
          isCurrent: () => true,
          refuse: vi.fn(),
        };
        render(
          <OrganizationResourcesProvider scope={scope}>
            <StepsPanel onAccessLost={vi.fn()} />
          </OrganizationResourcesProvider>,
        );
      } else mount(owner.path);
      if (owner.kind === 'project')
        await screen.findByRole('table', { name: 'Resolved project steps' });
      fireEvent.submit(await draft(owner.name));
      await waitFor(() => {
        expect(sent.filter(({ route }) => route === 'GET /api/organization/steps')).toHaveLength(2);
      });
      expect(sent.filter(({ route }) => route.startsWith('POST '))).toEqual([
        {
          route: 'POST /api/organization/step-bindings',
          body: {
            scopeKind: owner.kind,
            scopeId: owner.id,
            workItemTypeId: 'story',
            position: 10,
            define: {
              code: 'audit',
              name: 'Audit',
              position: 10,
              defaultEstimateUnit: 'minutes',
              defaultAllowanceBps: 550,
            },
          },
        },
      ]);
      expect(headers.every((header) => header.get('X-WBS-Expected-Organization') === 'org-a')).toBe(
        true,
      );
      const bindings = await screen.findByRole('region', { name: owner.name + ' step bindings' });
      expect(await within(bindings).findByText('Canonical audit')).toBeDefined();
      if (owner.kind === 'project')
        await waitFor(() => {
          expect(
            sent.filter(({ route }) => route === 'GET /api/projects/project-a/steps'),
          ).toHaveLength(2);
        });
    },
  );
}

it('shows every inherited provenance binding for the selected actual type and explicit untyped default', async () => {
  const sent = serve({
    'GET /api/projects/project-a/steps': [
      () => answerJson(200, untyped),
      () => answerJson(200, typed),
      () => answerJson(200, untyped),
    ],
  });
  mount('/projects/project-a/settings');
  const resolved = await screen.findByRole('region', { name: 'Resolved project steps' });
  await within(resolved).findByText('Development');
  expect(within(resolved).getByText('Organization · Every type')).toBeDefined();
  expect(within(resolved).getByText('Project · Every type')).toBeDefined();
  const selector = within(resolved).getByLabelText('Resolve steps for');
  await within(selector).findByRole('option', { name: 'Story' });
  fireEvent.change(selector, {
    target: {
      value: within(selector).getByRole('option', { name: 'Story' }).getAttribute('value'),
    },
  });
  await within(resolved).findByText('Review');
  expect(within(resolved).getByText('Space · Story')).toBeDefined();
  expect(within(resolved).getByText('Project · Story')).toBeDefined();
  expect(within(resolved).queryByRole('button', { name: /remov|Retire|Edit/ })).toBeNull();
  fireEvent.change(selector, { target: { value: '' } });
  await waitFor(() => {
    expect(within(resolved).queryByText('Review')).toBeNull();
  });
  expect(sent.filter(({ route }) => route === 'GET /api/projects/project-a/steps')).toEqual([
    { route: 'GET /api/projects/project-a/steps', body: undefined },
    { route: 'GET /api/projects/project-a/steps', body: undefined, search: '?type=story' },
    { route: 'GET /api/projects/project-a/steps', body: undefined },
  ]);
});

for (const refusal of [
  {
    status: 403,
    body: { error: 'forbidden', permission: 'project.read' },
    text: 'You do not have permission to view this project.',
  },
  { status: 404, body: { error: 'not_found' }, text: 'This project is no longer available.' },
]) {
  it(
    'renders actual project admission ' + String(refusal.status) + ' without a settings editor',
    async () => {
      const sent = serve({
        'GET /api/projects/project-a': [() => answerJson(refusal.status, refusal.body)],
      });
      mount('/projects/project-a/settings');
      expect(await screen.findByRole('alert')).toHaveProperty('textContent', refusal.text);
      expect(screen.queryByRole('form', { name: 'New step definition' })).toBeNull();
      expect(sent.some(({ route }) => route === 'GET /api/organization/steps')).toBe(false);
    },
  );
}

for (const corruption of [
  {
    project: { ...project, id: 'project-b' },
    diagnostic: 'Project settings read returned another project',
  },
  {
    project: { ...project, organizationId: 'org-b' },
    diagnostic: 'Project settings read returned another organization',
  },
]) {
  it('refuses contradictory project owner metadata: ' + corruption.diagnostic, async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sent = serve({
      'GET /api/projects/project-a': [() => answerJson(200, { project: corruption.project })],
    });
    mount('/projects/project-a/settings', corruption.diagnostic);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Expected owner fault.');
    expect(sent.some(({ route }) => route === 'GET /api/organization/steps')).toBe(false);
  });
}

it('keeps project settings unavailable in explicitly inactive organization mode', async () => {
  const sent = serve();
  mount('/projects/project-a/settings', undefined, false);
  expect(await screen.findByText('Choose an organization to view project settings.')).toBeDefined();
  expect(sent).toEqual([]);
});

it('offers no scoped step controls for the actual virtual all space', async () => {
  const sent = serve();
  mount('/spaces/all');
  await screen.findByRole('heading', { name: 'All projects', level: 1 });
  await screen.findByText('No projects in this space yet.');
  expect(screen.queryByRole('region', { name: 'Steps' })).toBeNull();
  expect(sent.some(({ route }) => route === 'GET /api/organization/steps')).toBe(false);
});

it('withdraws all named-space content after the step catalogue loses membership', async () => {
  serve({ 'GET /api/organization/steps': [() => answerJson(403, { error: 'not_a_member' })] });
  mount('/spaces/space-a');
  expect(await screen.findByText('You no longer have access to this organization.')).toBeDefined();
  expect(screen.queryByRole('heading', { name: 'Q3', level: 1 })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Steps' })).toBeNull();
});

it('fences a held project read when the router selects another actual owner', async () => {
  serve({ 'GET /api/projects/project-a': [() => answerJson(403, { error: 'not_a_member' })] });
  const forwarded = globalThis.fetch;
  let release: (() => void) | undefined;
  let withheld = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const reply = forwarded(input, init);
    const address =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (address.endsWith('/api/projects/project-a')) {
      withheld = true;
      await held;
    }
    return reply;
  });
  const { history } = mount('/projects/project-a/settings');
  await waitFor(() => {
    expect(withheld).toBe(true);
  });
  act(() => {
    history.push('/projects/project-b/settings');
  });
  await screen.findByRole('heading', { name: 'Venus', level: 1 });
  if (release === undefined) throw Error('Held project read owner absent');
  const complete = release;
  await act(async () => {
    complete();
    await held;
  });
  expect(screen.getByRole('heading', { name: 'Venus', level: 1 })).toBeDefined();
  expect(screen.queryByText('You no longer have access to this organization.')).toBeNull();
});

for (const corruption of [
  { space: { ...space, id: 'space-b' }, diagnostic: 'Space read returned another space' },
  {
    space: { ...space, virtual: true },
    diagnostic: 'Space read returned contradictory virtual identity',
  },
]) {
  it('refuses contradictory space owner metadata: ' + corruption.diagnostic, async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    serve({
      'GET /api/spaces/space-a': [
        () =>
          answerJson(200, {
            space: corruption.space,
            writable: false,
            projects: [],
            personIds: [],
            serviceTeamIds: [],
          }),
      ],
    });
    mount('/spaces/space-a', corruption.diagnostic);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Expected owner fault.');
  });
}

for (const starting of ['project', 'organization'] as const) {
  it(
    'retires the entire ' + starting + ' definition draft when a supplied settings owner changes',
    async () => {
      serve();
      const scope: ResourceScope = {
        organization: { kind: 'active', organizationId: 'org-a' },
        isCurrent: () => true,
        refuse: vi.fn(),
      };
      const accessLost = vi.fn(),
        changed = vi.fn();
      const editor = (kind: 'project' | 'organization' | 'space') => (
        <OrganizationResourcesProvider scope={scope}>
          <ScopedSteps
            scope={{
              scopeKind: kind,
              scopeId:
                kind === 'organization' ? 'org-a' : kind === 'project' ? 'project-a' : 'space-a',
              name: kind === 'organization' ? 'Organization' : kind === 'project' ? 'Mars' : 'Q3',
            }}
            onChanged={changed}
            onAccessLost={accessLost}
          />
        </OrganizationResourcesProvider>
      );
      const mounted = render(editor(starting));
      if (starting === 'organization')
        fireEvent.click(await screen.findByRole('button', { name: 'Edit Development' }));
      else await draft('Mars');
      mounted.rerender(editor('space'));
      const next = await screen.findByRole('form', { name: 'New step definition' });
      expect(within(next).getByLabelText('Step name')).toHaveProperty('value', '');
      expect(screen.queryByRole('form', { name: 'Edit step definition' })).toBeNull();
    },
  );
}

it('keeps the newer project owner read when an older real request completes later', async () => {
  serve({
    'GET /api/projects/project-a': [
      () => answerJson(200, { project: { ...project, name: 'Older project' } }),
      () => answerJson(200, { project: { ...project, name: 'Newer project' } }),
    ],
  });
  const forwarded = globalThis.fetch;
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let withheld = false;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const reply = forwarded(input, init);
    const address =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!withheld && address.endsWith('/api/projects/project-a')) {
      withheld = true;
      await held;
    }
    return reply;
  });
  mount('/projects/project-a/settings');
  await waitFor(() => {
    expect(withheld).toBe(true);
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Refresh project' }));
  await screen.findByRole('heading', { name: 'Newer project', level: 1 });
  if (release === undefined) throw Error('Held older project read absent');
  const complete = release;
  await act(async () => {
    complete();
    await held;
  });
  expect(screen.getByRole('heading', { name: 'Newer project', level: 1 })).toBeDefined();
  expect(screen.queryByRole('heading', { name: 'Older project', level: 1 })).toBeNull();
});

it('keeps the newer typed resolution when an older untyped real request completes later', async () => {
  serve({
    'GET /api/projects/project-a/steps': [
      () => answerJson(200, untyped),
      () => answerJson(200, typed),
    ],
  });
  const forwarded = globalThis.fetch;
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let withheld = false;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const reply = forwarded(input, init);
    const address =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!withheld && address.endsWith('/api/projects/project-a/steps')) {
      withheld = true;
      await held;
    }
    return reply;
  });
  mount('/projects/project-a/settings');
  await waitFor(() => {
    expect(withheld).toBe(true);
  });
  const panel = await screen.findByRole('region', { name: 'Resolved project steps' });
  const selector = within(panel).getByLabelText('Resolve steps for');
  const option = await within(selector).findByRole('option', { name: 'Story' });
  fireEvent.change(selector, { target: { value: option.getAttribute('value') } });
  await within(panel).findByText('Review');
  if (release === undefined) throw Error('Held untyped resolution absent');
  const complete = release;
  await act(async () => {
    complete();
    await held;
  });
  expect(within(panel).getByText('Review')).toBeDefined();
  expect(within(panel).getByText('Space · Story')).toBeDefined();
});

it('ignores a creation-directory refusal after refreshing its settings editor', async () => {
  serve({
    'GET /api/work-item-types': [
      () => answerJson(200, { workItemTypes: [story, spike] }),
      () => answerJson(403, { error: 'not_a_member' }),
      () => answerJson(200, { workItemTypes: [story, spike] }),
    ],
  });
  const forwarded = globalThis.fetch;
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let withheld = false;
  let typeReads = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const reply = forwarded(input, init);
    const address =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (address.endsWith('/api/work-item-types')) typeReads++;
    if (!withheld && address.endsWith('/api/work-item-types') && typeReads === 2) {
      withheld = true;
      await held;
    }
    return reply;
  });
  mount('/projects/project-a/settings');
  await waitFor(() => {
    expect(withheld).toBe(true);
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Refresh steps' }));
  await screen.findByRole('form', { name: 'New step definition' });
  if (release === undefined) throw Error('Held creation directory absent');
  const complete = release;
  await act(async () => {
    complete();
    await held;
  });
  expect(screen.getByRole('heading', { name: 'Mars', level: 1 })).toBeDefined();
  expect(screen.queryByText('You no longer have access to this organization.')).toBeNull();
});

it('refuses an unlisted creation type instead of creating an every-type binding', async () => {
  const sent = serve();
  mount('/projects/project-a/settings');
  const form = await draft('Mars'),
    selector = within(form).getByLabelText('Work item type');
  const option = document.createElement('option');
  option.value = 'type:foreign';
  option.textContent = 'Unlisted';
  selector.appendChild(option);
  fireEvent.change(selector, { target: { value: 'type:foreign' } });
  fireEvent.submit(form);
  expect(await within(form).findByRole('alert')).toHaveProperty(
    'textContent',
    'Choose a listed work item type or Every type.',
  );
  expect(sent.filter(({ route }) => route.startsWith('POST '))).toEqual([]);
});

it('renders a failed definition type read and retries without inventing creation choices', async () => {
  serve({
    'GET /api/work-item-types': [
      () => answerJson(200, { workItemTypes: [story, spike] }),
      () => {
        throw Error('Controlled creation directory failure');
      },
      () => answerJson(200, { workItemTypes: [story, spike] }),
    ],
  });
  mount('/projects/project-a/settings');
  const panel = await screen.findByRole('region', { name: 'Steps' });
  expect(await within(panel).findByRole('alert')).toHaveProperty(
    'textContent',
    'Could not reach the server. Try again.',
  );
  expect(within(panel).queryByRole('form', { name: 'New step definition' })).toBeNull();
  fireEvent.click(within(panel).getByRole('button', { name: 'Retry definition types' }));
  const form = await within(panel).findByRole('form', { name: 'New step definition' });
  expect(within(form).getByRole('option', { name: 'Story' })).toBeDefined();
});

it('preserves a scoped creation draft when actual project settings permission refuses the write', async () => {
  serve({
    'POST /api/organization/step-bindings': [
      () => answerJson(403, { error: 'forbidden', permission: 'project.manage_settings' }),
    ],
  });
  mount('/projects/project-a/settings');
  const form = await draft('Mars');
  fireEvent.submit(form);
  expect(await within(form).findByRole('alert')).toHaveProperty(
    'textContent',
    'You do not have permission to manage steps at this scope.',
  );
  expect(within(form).getByLabelText('Step name')).toHaveProperty('value', 'Audit');
  expect(within(form).getByLabelText('Step code')).toHaveProperty('value', 'audit');
});

it('withdraws the project editor after current resolved-step admission is refused', async () => {
  serve({
    'GET /api/projects/project-a/steps': [
      () => answerJson(200, untyped),
      () => answerJson(403, { error: 'forbidden', permission: 'project.read' }),
    ],
  });
  mount('/projects/project-a/settings');
  const panel = await screen.findByRole('region', { name: 'Resolved project steps' });
  await within(panel).findByText('Development');
  const selector = within(panel).getByLabelText('Resolve steps for');
  fireEvent.change(selector, {
    target: {
      value: within(selector).getByRole('option', { name: 'Story' }).getAttribute('value'),
    },
  });
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'This project or its selected type is no longer available. Refresh the project.',
  );
  expect(screen.queryByRole('heading', { name: 'Mars', level: 1 })).toBeNull();
  expect(screen.queryByRole('form', { name: 'New step definition' })).toBeNull();
});

it('keeps named-space catalogue settings unavailable to an explicitly inactive resource context', async () => {
  const sent = serve();
  mount('/spaces/space-a', undefined, false);
  await screen.findByText('No projects in this space yet.');
  expect(screen.queryByRole('region', { name: 'Steps' })).toBeNull();
  expect(sent.some(({ route }) => route === 'GET /api/organization/steps')).toBe(false);
});

it('routes trusted project faults through the actual sanitized app boundary', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  serve({
    'GET /api/projects/project-a': [
      () => answerJson(200, { project: { ...project, id: 'project-b' } }),
    ],
  });
  mount('/projects/project-a/settings', undefined, true, true);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('The app stopped:');
  expect(alert.querySelector('[data-app-fault-reference]')?.textContent).toMatch(/^Reference /);
  expect(alert.textContent).not.toContain('Unexpected project settings read failure');
  expect(alert.textContent).not.toContain('Project settings read returned another project');
});

it('encodes an observed project id in the settings link without treating path separators as another owner', () => {
  render(
    <ProjectPicker
      choices={{ kind: 'ready', projects: [{ ...project, id: 'project/a' }] }}
      selectedId="project/a"
      onChoose={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );
  expect(screen.getByRole('link', { name: 'Project settings for Mars' }).getAttribute('href')).toBe(
    '/projects/project%2Fa/settings',
  );
});

it('refuses an unlisted resolution type without quietly requesting the untyped default', async () => {
  const sent = serve();
  mount('/projects/project-a/settings');
  const resolved = await screen.findByRole('region', { name: 'Resolved project steps' });
  await within(resolved).findByText('Development');
  const selector = within(resolved).getByLabelText('Resolve steps for');
  const option = document.createElement('option');
  option.value = 'type:foreign';
  option.textContent = 'Unlisted';
  selector.appendChild(option);
  fireEvent.change(selector, { target: { value: 'type:foreign' } });
  expect(await within(resolved).findByRole('alert')).toHaveProperty(
    'textContent',
    'The selected type is no longer listed. Choose a current type.',
  );
  expect(sent.filter(({ route }) => route === 'GET /api/projects/project-a/steps')).toHaveLength(1);
});
