import type { ClientReply, listStepCatalogue } from '@wbs/contracts';
import { afterEach, expect, it, vi } from 'vitest';

import { FaultBoundary } from '@/components/chrome/fault-boundary';
import { StepBindings } from '@/components/organization/step-bindings';
import { StepsPanel } from '@/components/organization/steps-panel';
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
import { answerEmpty, answerJson, stubServer } from '@/testing/stub-server';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Catalogue = Extract<ClientReply<typeof listStepCatalogue>, { kind: 'success' }>['body'];
type Definition = Catalogue['definitions'][number];
type Binding = Catalogue['bindings'][number];
const development: Definition = {
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
const review = { ...development, id: 'review', code: 'review', name: 'Review', position: 20 };
const qa = { ...development, id: 'qa', code: 'qa', name: 'QA', position: 30 };
const story = { id: 'type-story', name: 'Story' },
  spike = { id: 'type-spike', name: 'Spike' };
const first: Binding = {
  bindingId: 'bind-a',
  organizationId: 'org-a',
  stepId: 'dev',
  scopeKind: 'organization',
  scopeId: 'org-a',
  workItemTypeId: 'type-story',
  position: 10,
  origin: 'authored',
};
const second: Binding = {
  ...first,
  bindingId: 'bind-b',
  stepId: 'review',
  workItemTypeId: 'type-spike',
  position: 20,
  origin: 'migration',
};
const third: Binding = { ...first, bindingId: 'bind-c', stepId: 'qa', position: 30 };
const foreignScope: Binding = {
  ...first,
  bindingId: 'bind-space',
  scopeKind: 'space',
  scopeId: 'org-a',
  position: 0,
};
const sibling: Binding = {
  ...first,
  bindingId: 'bind-sibling',
  scopeKind: 'project',
  scopeId: 'project-b',
  position: -10,
};
const catalogue: Catalogue = {
  definitions: [development, review, qa],
  bindings: [third, foreignScope, first, sibling, second],
};
const usage = {
  count: 201,
  pairs: Array.from({ length: 200 }, (_, index) => ({
    id: 'leaf-' + String(index),
    name: 'Protected leaf ' + String(index),
    workPackageId: 'package-a',
    stepId: 'dev',
    facts: ['estimate', 'attempt_issued'],
  })),
};

function serve(writes: Parameters<typeof stubServer>[0] = {}, catalogues = [catalogue]) {
  return stubServer({
    'GET /api/organization/steps': catalogues.map((value) => () => answerJson(200, value)),
    'GET /api/work-item-types': [() => answerJson(200, { workItemTypes: [story, spike] })],
    ...writes,
  });
}
function mount(expectedFault?: string) {
  const lost = vi.fn();
  const scope: ResourceScope = {
    organization: { kind: 'active', organizationId: 'org-a' },
    isCurrent: () => true,
    refuse: vi.fn(),
  };
  render(
    <OrganizationResourcesProvider scope={scope}>
      <FaultBoundary
        logAs="step catalogue test"
        resetKey="org-a"
        discloses={(cause) => {
          let current = cause;
          while (current instanceof Error) {
            if (current.message === expectedFault) return 'Expected catalogue refusal.';
            current = current.cause;
          }
          return null;
        }}
        fallback={(fault) => (
          <p role="alert">
            {expectedFault === undefined ? 'Step catalogue failed.' : fault.sentence}
          </p>
        )}
      >
        <StepsPanel onAccessLost={lost} />
      </FaultBoundary>
    </OrganizationResourcesProvider>,
  );
  return { lost };
}
async function bindings() {
  return screen.findByRole('region', { name: 'Organization step bindings' });
}
async function chooseExisting() {
  const form = await screen.findByRole('form', { name: 'Bind existing step' });
  await within(form).findByRole('option', { name: 'Story' });
  fireEvent.change(within(form).getByLabelText('Existing step'), { target: { value: 'qa' } });
  fireEvent.change(within(form).getByLabelText('Work item type'), {
    target: { value: 'type-story' },
  });
  return form;
}

it('draws only the actual organization bindings with current type names and origin', async () => {
  serve();
  mount();
  const panel = await bindings();
  const table = await within(panel).findByRole('table', { name: 'Bindings at Organization' });
  await within(table).findByText('Spike');
  expect(within(table).getAllByRole('row')).toHaveLength(4);
  expect(within(table).getByText('Migration')).toBeDefined();
  expect(
    within(table)
      .getAllByRole('button', { name: /^Move .* earlier$/ })
      .map((button) => button.getAttribute('aria-label')),
  ).toEqual([
    'Move Development for Story earlier',
    'Move Review for Spike earlier',
    'Move QA for Story earlier',
  ]);
});

it('binds an existing definition to the chosen actual type without redefining it', async () => {
  const sent = serve({
    'POST /api/organization/step-bindings': [
      () => answerJson(201, { binding: { ...third, bindingId: 'new-binding' } }),
    ],
  });
  const forwarded = globalThis.fetch,
    headers: Headers[] = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    headers.push(new Headers(init?.headers));
    return forwarded(input, init);
  });
  mount();
  fireEvent.submit(await chooseExisting());
  await waitFor(() => {
    expect(sent.filter(({ route }) => route === 'GET /api/organization/steps')).toHaveLength(2);
  });
  expect(sent.filter(({ route }) => route.startsWith('POST '))).toEqual([
    {
      route: 'POST /api/organization/step-bindings',
      body: {
        scopeKind: 'organization',
        scopeId: 'org-a',
        stepId: 'qa',
        workItemTypeId: 'type-story',
        position: 10,
      },
    },
  ]);
  expect(headers.every((header) => header.get('X-WBS-Expected-Organization') === 'org-a')).toBe(
    true,
  );
});

it('requires an active definition selection before binding', async () => {
  const sent = serve();
  mount();
  const form = await screen.findByRole('form', { name: 'Bind existing step' });
  await within(form).findByRole('option', { name: 'Story' });
  fireEvent.submit(form);
  expect(await within(await bindings()).findByRole('alert')).toHaveProperty(
    'textContent',
    'Choose an active step definition.',
  );
  expect(sent.filter(({ route }) => route.startsWith('POST '))).toEqual([]);
});

it('renders a failed type directory read and retries without treating it as every type', async () => {
  serve({
    'GET /api/work-item-types': [
      () => answerJson(200, { workItemTypes: [story, spike] }),
      () => {
        throw Error('Controlled type read failure');
      },
      () => answerJson(200, { workItemTypes: [story] }),
    ],
  });
  mount();
  const panel = await bindings();
  expect(await within(panel).findByRole('alert')).toHaveProperty(
    'textContent',
    'Could not reach the server. Try again.',
  );
  expect(within(panel).queryByRole('form', { name: 'Bind existing step' })).toBeNull();
  fireEvent.click(within(panel).getByRole('button', { name: 'Retry work item types' }));
  const form = await within(panel).findByRole('form', { name: 'Bind existing step' });
  await within(form).findByRole('option', { name: 'Story' });
});

it('previews removal and names the actual capped protected pairs without offering apply', async () => {
  const sent = serve({
    'DELETE /api/organization/step-bindings/bind-a': [
      () => answerJson(200, { wouldRefuse: 'step_nodes_in_use', ...usage }),
    ],
  });
  mount();
  const panel = await bindings();
  fireEvent.click(
    await within(panel).findByRole('button', { name: 'Preview removal of Development for Story' }),
  );
  expect(
    await within(panel).findByText(
      '201 protected steps would lose this binding. Showing the first 200.',
    ),
  ).toBeDefined();
  expect(within(panel).getByText('Protected leaf 0')).toBeDefined();
  expect(within(panel).getByText('Protected leaf 199')).toBeDefined();
  expect(within(panel).getAllByText('estimate, attempt_issued')).toHaveLength(200);
  expect(within(panel).getByRole('link', { name: 'Protected leaf 0' }).getAttribute('href')).toBe(
    '/?workPackage=package-a',
  );
  expect(within(panel).queryByRole('button', { name: 'Confirm binding removal' })).toBeNull();
  expect(sent.filter(({ route }) => route.startsWith('DELETE '))).toEqual([
    { route: 'DELETE /api/organization/step-bindings/bind-a', body: { dryRun: true } },
  ]);
});

it('requires a successful preview and explicit confirmation before actual binding removal', async () => {
  const withoutFirst = {
    ...catalogue,
    bindings: catalogue.bindings.filter((binding) => binding.bindingId !== 'bind-a'),
  };
  const sent = serve(
    {
      'DELETE /api/organization/step-bindings/bind-a': [
        () => answerJson(200, { wouldRefuse: null }),
        () => answerEmpty(204),
      ],
    },
    [catalogue, withoutFirst],
  );
  mount();
  const panel = await bindings();
  fireEvent.click(
    await within(panel).findByRole('button', { name: 'Preview removal of Development for Story' }),
  );
  const confirm = await within(panel).findByRole('button', { name: 'Confirm binding removal' });
  expect(sent.filter(({ route }) => route === 'GET /api/organization/steps')).toHaveLength(1);
  fireEvent.click(confirm);
  await waitFor(() => {
    expect(sent.filter(({ route }) => route === 'GET /api/organization/steps')).toHaveLength(2);
  });
  expect(sent.filter(({ route }) => route.startsWith('DELETE '))).toEqual([
    { route: 'DELETE /api/organization/step-bindings/bind-a', body: { dryRun: true } },
    { route: 'DELETE /api/organization/step-bindings/bind-a', body: { dryRun: false } },
  ]);
  expect(await screen.findByRole('button', { name: 'Edit Development' })).toBeDefined();
});

it('renders a late apply conflict from current protected facts and keeps the binding', async () => {
  const sent = serve({
    'DELETE /api/organization/step-bindings/bind-a': [
      () => answerJson(200, { wouldRefuse: null }),
      () => answerJson(409, { error: 'step_nodes_in_use', ...usage }),
    ],
  });
  mount();
  const panel = await bindings();
  fireEvent.click(
    await within(panel).findByRole('button', { name: 'Preview removal of Development for Story' }),
  );
  fireEvent.click(await within(panel).findByRole('button', { name: 'Confirm binding removal' }));
  await within(panel).findByText(
    '201 protected steps would lose this binding. Showing the first 200.',
  );
  expect(within(panel).queryByRole('button', { name: 'Confirm binding removal' })).toBeNull();
  expect(
    within(panel).getByRole('button', { name: 'Preview removal of Development for Story' }),
  ).toBeDefined();
  expect(sent.filter(({ route }) => route === 'GET /api/organization/steps')).toHaveLength(1);
});

it('reorders the complete own-scope census across types even while filtered to Story', async () => {
  const sent = serve({ 'POST /api/organization/step-bindings/reorder': [() => answerEmpty(204)] });
  mount();
  const panel = await bindings();
  const filter = await within(panel).findByLabelText('View bindings');
  await within(filter).findByRole('option', { name: 'Story' });
  fireEvent.change(filter, {
    target: { value: within(filter).getByRole('option', { name: 'Story' }).getAttribute('value') },
  });
  expect(within(panel).queryByText('Review')).toBeNull();
  fireEvent.click(within(panel).getByRole('button', { name: 'Move QA for Story earlier' }));
  await waitFor(() => {
    expect(sent.filter(({ route }) => route === 'GET /api/organization/steps')).toHaveLength(2);
  });
  expect(sent.filter(({ route }) => route.startsWith('POST '))).toEqual([
    {
      route: 'POST /api/organization/step-bindings/reorder',
      body: { scopeKind: 'organization', scopeId: 'org-a', ids: ['bind-a', 'bind-c', 'bind-b'] },
    },
  ]);
});

it('renders a stale reorder and preserves displayed server order', async () => {
  serve({
    'POST /api/organization/step-bindings/reorder': [
      () => answerJson(409, { error: 'stale_order' }),
    ],
  });
  mount();
  const panel = await bindings();
  fireEvent.click(await within(panel).findByRole('button', { name: 'Move QA for Story earlier' }));
  expect(await within(panel).findByRole('alert')).toHaveProperty(
    'textContent',
    'Bindings changed. Refresh steps before reordering.',
  );
  expect(
    within(panel)
      .getAllByRole('button', { name: /^Move .* earlier$/ })
      .map((button) => button.getAttribute('aria-label')),
  ).toEqual([
    'Move Development for Story earlier',
    'Move Review for Spike earlier',
    'Move QA for Story earlier',
  ]);
});

it('admits one binding write across repeated pending submissions', async () => {
  const sent = serve({
    'POST /api/organization/step-bindings': [() => answerJson(409, { error: 'duplicate_binding' })],
  });
  const forwarded = globalThis.fetch;
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const reply = forwarded(input, init);
    if (init?.method === 'POST') await held;
    return reply;
  });
  mount();
  const form = await chooseExisting();
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  await waitFor(() => {
    expect(sent.filter(({ route }) => route.startsWith('POST '))).toHaveLength(1);
  });
  if (release === undefined) throw Error('Pending binding owner absent');
  const complete = release;
  await act(async () => {
    complete();
    await held;
  });
  expect(await within(await bindings()).findByRole('alert')).toHaveProperty(
    'textContent',
    'This step is already bound here. Refresh steps.',
  );
});

for (const action of ['preview', 'types'] as const) {
  it(
    'ignores a late ' + action + ' refusal after refresh replaces the binding editor',
    async () => {
      const sent = serve(
        action === 'preview'
          ? {
              'DELETE /api/organization/step-bindings/bind-a': [
                () => answerJson(403, { error: 'not_a_member' }),
              ],
            }
          : {
              'GET /api/work-item-types': [
                () => answerJson(200, { workItemTypes: [story, spike] }),
                () => answerJson(403, { error: 'not_a_member' }),
                () => answerJson(200, { workItemTypes: [story] }),
              ],
            },
      );
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
        if (
          !withheld &&
          (action === 'preview'
            ? init?.method === 'DELETE'
            : address.endsWith('/api/work-item-types') && typeReads === 2)
        ) {
          withheld = true;
          await held;
        }
        return reply;
      });
      const { lost } = mount();
      if (action === 'preview')
        fireEvent.click(
          await within(await bindings()).findByRole('button', {
            name: 'Preview removal of Development for Story',
          }),
        );
      await waitFor(() => {
        expect(withheld).toBe(true);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Refresh steps' }));
      await within(await bindings()).findByRole('form', { name: 'Bind existing step' });
      if (release === undefined) throw Error('Held binding owner absent');
      const complete = release;
      await act(async () => {
        complete();
        await held;
      });
      expect(lost).not.toHaveBeenCalled();
      expect(sent.filter(({ route }) => route === 'GET /api/organization/steps')).toHaveLength(2);
    },
  );
}

for (const mode of ['preview', 'apply'] as const) {
  it('refuses a successful HTTP response for the wrong removal ' + mode + ' mode', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    serve({
      'DELETE /api/organization/step-bindings/bind-a':
        mode === 'preview'
          ? [() => answerEmpty(204)]
          : [
              () => answerJson(200, { wouldRefuse: null }),
              () => answerJson(200, { wouldRefuse: null }),
            ],
    });
    mount(
      mode === 'preview'
        ? 'Step binding preview requires a 200 response'
        : 'Step binding removal requires a 204 response',
    );
    const panel = await bindings();
    fireEvent.click(
      await within(panel).findByRole('button', {
        name: 'Preview removal of Development for Story',
      }),
    );
    if (mode === 'apply')
      fireEvent.click(
        await within(panel).findByRole('button', { name: 'Confirm binding removal' }),
      );
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Expected catalogue refusal.',
    );
  });
}

it('refuses an active binding whose definition is missing without guessing a label', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  serve({}, [{ ...catalogue, definitions: [review, qa] }]);
  mount('Step binding names a missing active definition: bind-a / dev');
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Expected catalogue refusal.',
  );
});

for (const specialId of ['all', 'null']) {
  it('keeps a type whose id is ' + specialId + ' distinct from the all-types filter', async () => {
    serve(
      {
        'GET /api/work-item-types': [
          () =>
            answerJson(200, {
              workItemTypes: [story, { id: specialId, name: 'Reserved-looking type' }],
            }),
        ],
      },
      [
        {
          ...catalogue,
          bindings: [
            ...catalogue.bindings,
            { ...first, bindingId: 'bind-every', workItemTypeId: null },
            { ...first, bindingId: 'bind-special', workItemTypeId: specialId },
          ],
        },
      ],
    );
    mount();
    const panel = await bindings();
    const filter = await within(panel).findByLabelText('View bindings');
    const option = await within(filter).findByRole('option', { name: 'Reserved-looking type' });
    fireEvent.change(filter, { target: { value: option.getAttribute('value') } });
    const table = within(panel).getByRole('table', { name: 'Bindings at Organization' });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Reserved-looking type')).toBeDefined();
  });
}

it('binds every type explicitly rather than manufacturing an untyped type id', async () => {
  const sent = serve({
    'POST /api/organization/step-bindings': [
      () => answerJson(201, { binding: { ...third, workItemTypeId: null } }),
    ],
  });
  mount();
  const form = await screen.findByRole('form', { name: 'Bind existing step' });
  await within(form).findByRole('option', { name: 'Story' });
  fireEvent.change(within(form).getByLabelText('Existing step'), { target: { value: 'qa' } });
  fireEvent.submit(form);
  await waitFor(() => {
    expect(sent.filter(({ route }) => route === 'GET /api/organization/steps')).toHaveLength(2);
  });
  expect(sent.filter(({ route }) => route.startsWith('POST '))).toEqual([
    {
      route: 'POST /api/organization/step-bindings',
      body: {
        scopeKind: 'organization',
        scopeId: 'org-a',
        stepId: 'qa',
        workItemTypeId: null,
        position: 10,
      },
    },
  ]);
});

it('shows a concurrently removed type as stale instead of relabeling it every type', async () => {
  serve({ 'GET /api/work-item-types': [() => answerJson(200, { workItemTypes: [] })] });
  mount();
  const table = await within(await bindings()).findByRole('table', {
    name: 'Bindings at Organization',
  });
  expect(within(table).getAllByText('Type no longer listed: type-story')).toHaveLength(2);
  expect(within(table).queryByText('Every type')).toBeNull();
});

it('keeps inherited and sibling bindings out of a project scope reorder', async () => {
  const ownA = {
    ...first,
    bindingId: 'project-own-a',
    scopeKind: 'project' as const,
    scopeId: 'project-a',
    origin: 'authored' as const,
  };
  const ownB = {
    ...third,
    bindingId: 'project-own-b',
    scopeKind: 'project' as const,
    scopeId: 'project-a',
    origin: 'authored' as const,
  };
  const captured = {
    definitions: [development, review, qa],
    bindings: [...catalogue.bindings, ownA, ownB],
  };
  const sent = serve({ 'POST /api/organization/step-bindings/reorder': [() => answerEmpty(204)] });
  const scope: ResourceScope = {
    organization: { kind: 'active', organizationId: 'org-a' },
    isCurrent: () => true,
    refuse: vi.fn(),
  };
  const changed = vi.fn();
  render(
    <OrganizationResourcesProvider scope={scope}>
      <StepBindings
        catalogue={captured}
        scope={{ scopeKind: 'project', scopeId: 'project-a', name: 'Selected project' }}
        onChanged={changed}
        onAccessLost={vi.fn()}
      />
    </OrganizationResourcesProvider>,
  );
  const panel = await screen.findByRole('region', { name: 'Selected project step bindings' });
  const table = await within(panel).findByRole('table', { name: 'Bindings at Selected project' });
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  fireEvent.click(within(panel).getByRole('button', { name: 'Move QA for Story earlier' }));
  await waitFor(() => {
    expect(changed).toHaveBeenCalledTimes(1);
  });
  expect(sent.filter(({ route }) => route.startsWith('POST '))).toEqual([
    {
      route: 'POST /api/organization/step-bindings/reorder',
      body: { scopeKind: 'project', scopeId: 'project-a', ids: ['project-own-b', 'project-own-a'] },
    },
  ]);
});

it.each([
  ['project', 'project-b'],
  ['space', 'project-a'],
] as const)(
  'replaces the binding draft and callback owner on scope %s %s',
  async (nextKind, nextId) => {
    const own = {
      ...first,
      bindingId: 'project-own',
      scopeKind: 'project' as const,
      scopeId: 'project-a',
      origin: 'authored' as const,
    };
    const captured = { definitions: [development, review, qa], bindings: [own] };
    serve({
      'DELETE /api/organization/step-bindings/project-own': [
        () => answerJson(403, { error: 'not_a_member' }),
      ],
    });
    const forwarded = globalThis.fetch;
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const reply = forwarded(input, init);
      if (init?.method === 'DELETE') await held;
      return reply;
    });
    const scope: ResourceScope = {
        organization: { kind: 'active', organizationId: 'org-a' },
        isCurrent: () => true,
        refuse: vi.fn(),
      },
      lost = vi.fn(),
      changed = vi.fn();
    const editor = (projectId: string, scopeKind: 'project' | 'space' = 'project') => (
      <OrganizationResourcesProvider scope={scope}>
        <StepBindings
          catalogue={captured}
          scope={{ scopeKind, scopeId: projectId, name: 'Selected project' }}
          onChanged={changed}
          onAccessLost={lost}
        />
      </OrganizationResourcesProvider>
    );
    const mounted = render(editor('project-a'));
    const panel = await screen.findByRole('region', { name: 'Selected project step bindings' });
    const form = await within(panel).findByRole('form', { name: 'Bind existing step' });
    fireEvent.change(within(form).getByLabelText('Existing step'), { target: { value: 'qa' } });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Preview removal of Development for Story' }),
    );
    mounted.rerender(editor(nextId, nextKind));
    const replacement = await screen.findByRole('form', { name: 'Bind existing step' });
    expect(within(replacement).getByLabelText('Existing step')).toHaveProperty('value', '');
    if (release === undefined) throw Error('Held old scope owner absent');
    const complete = release;
    await act(async () => {
      complete();
      await held;
    });
    expect(lost).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  },
);

it('keeps binary binding-id order for tied positions independently of locale and response order', async () => {
  serve({}, [
    {
      ...catalogue,
      bindings: [
        { ...third, bindingId: 'a', position: 10 },
        { ...first, bindingId: 'Z', position: 10 },
      ],
    },
  ]);
  mount();
  const table = await within(await bindings()).findByRole('table', {
    name: 'Bindings at Organization',
  });
  expect(
    within(table)
      .getAllByRole('button', { name: /^Move .* earlier$/ })
      .map((button) => button.getAttribute('aria-label')),
  ).toEqual(['Move Development for Story earlier', 'Move QA for Story earlier']);
});
