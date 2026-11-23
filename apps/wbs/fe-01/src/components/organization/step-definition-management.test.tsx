import { afterEach, expect, it, vi } from 'vitest';

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
});

function stubDefinitionServer(plan: Parameters<typeof stubServer>[0]) {
  return stubServer({
    'GET /api/work-item-types': [() => answerJson(200, { workItemTypes: [] })],
    ...plan,
  });
}

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
const binding = {
  bindingId: 'binding-dev',
  organizationId: 'org-a',
  stepId: 'step-dev',
  scopeKind: 'organization',
  scopeId: 'org-a',
  workItemTypeId: null,
  position: 10,
  origin: 'authored',
};
const empty = { definitions: [], bindings: [] };

function mount() {
  const lost = vi.fn();
  const scope: ResourceScope = {
    organization: { kind: 'active', organizationId: 'org-a' },
    isCurrent: () => true,
    refuse: vi.fn(),
  };
  render(
    <OrganizationResourcesProvider scope={scope}>
      <StepsPanel onAccessLost={lost} />
    </OrganizationResourcesProvider>,
  );
  return { lost };
}

async function enterNewStep(allowance = '12.34') {
  const form = await screen.findByRole('form', { name: 'New step definition' });
  fireEvent.change(within(form).getByLabelText('Step name'), { target: { value: 'Development' } });
  fireEvent.change(within(form).getByLabelText('Step code'), { target: { value: 'dev' } });
  fireEvent.change(within(form).getByLabelText('Default estimate unit'), {
    target: { value: 'minutes' },
  });
  fireEvent.change(within(form).getByLabelText('Default allowance (%)'), {
    target: { value: allowance },
  });
  return form;
}

it('creates and binds an organization step with exact defaults through the actual resource client', async () => {
  const sent = stubDefinitionServer({
    'GET /api/organization/steps': [
      () => answerJson(200, empty),
      () => answerJson(200, { definitions: [definition], bindings: [binding] }),
    ],
    'POST /api/organization/step-bindings': [() => answerJson(201, { definition, binding })],
  });
  const forwarded = globalThis.fetch,
    headers: Headers[] = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    headers.push(new Headers(init?.headers));
    return forwarded(input, init);
  });
  mount();
  fireEvent.submit(await enterNewStep());
  const table = await screen.findByRole('table', { name: 'Step definitions' });
  expect(within(table).getByText('Development')).toBeDefined();
  expect(within(table).getByText('12.34%')).toBeDefined();
  expect(sent.filter(({ route }) => route.startsWith('POST '))).toEqual([
    {
      route: 'POST /api/organization/step-bindings',
      body: {
        scopeKind: 'organization',
        scopeId: 'org-a',
        workItemTypeId: null,
        position: 10,
        define: {
          code: 'dev',
          name: 'Development',
          position: 10,
          defaultEstimateUnit: 'minutes',
          defaultAllowanceBps: 1234,
        },
      },
    },
  ]);
  expect(headers.every((header) => header.get('X-WBS-Expected-Organization') === 'org-a')).toBe(
    true,
  );
  expect(sent.some(({ route }) => route.includes('/work-packages/'))).toBe(false);
});

it('edits global name and defaults while preserving the immutable step code', async () => {
  const renamed = {
    ...definition,
    name: 'Delivery',
    defaultEstimateUnit: 'workdays',
    defaultAllowanceBps: 250,
  };
  const sent = stubDefinitionServer({
    'GET /api/organization/steps': [
      () => answerJson(200, { definitions: [definition], bindings: [binding] }),
      () => answerJson(200, { definitions: [renamed], bindings: [binding] }),
    ],
    'PATCH /api/organization/steps/step-dev': [() => answerJson(200, { definition: renamed })],
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Development' }));
  const form = screen.getByRole('form', { name: 'Edit step definition' });
  expect(within(form).queryByLabelText('Step code')).toBeNull();
  expect(within(form).getByText('dev')).toBeDefined();
  fireEvent.change(within(form).getByLabelText('Step name'), { target: { value: 'Delivery' } });
  fireEvent.change(within(form).getByLabelText('Default estimate unit'), {
    target: { value: 'workdays' },
  });
  fireEvent.change(within(form).getByLabelText('Default allowance (%)'), {
    target: { value: '2.5' },
  });
  fireEvent.submit(form);
  await screen.findByRole('button', { name: 'Edit Delivery' });
  expect(sent.filter(({ route }) => route.startsWith('PATCH '))).toEqual([
    {
      route: 'PATCH /api/organization/steps/step-dev',
      body: { name: 'Delivery', defaultEstimateUnit: 'workdays', defaultAllowanceBps: 250 },
    },
  ]);
  expect(
    screen.getByText(
      'Defaults apply to new package values. Existing package values stay unchanged.',
    ),
  ).toBeDefined();
  expect(sent.some(({ route }) => route.includes('/work-packages/'))).toBe(false);
});

it('confirms retirement and preserves the explanation of reserved historical names and codes', async () => {
  const sent = stubDefinitionServer({
    'GET /api/organization/steps': [
      () => answerJson(200, { definitions: [definition], bindings: [] }),
      () => answerJson(200, empty),
    ],
    'DELETE /api/organization/steps/step-dev': [() => answerEmpty(204)],
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Retire Development' }));
  expect(sent.filter(({ route }) => route.startsWith('DELETE '))).toEqual([]);
  expect(
    screen.getByText(
      'Retirement keeps historical values and reserves this name and code. Remove its bindings first.',
    ),
  ).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm retirement' }));
  await screen.findByText('No step definitions yet.');
  expect(sent.filter(({ route }) => route.startsWith('DELETE '))).toEqual([
    { route: 'DELETE /api/organization/steps/step-dev', body: undefined },
  ]);
});

it('renders a late bound-step refusal without retiring the displayed definition', async () => {
  stubDefinitionServer({
    'GET /api/organization/steps': [
      () => answerJson(200, { definitions: [definition], bindings: [] }),
    ],
    'DELETE /api/organization/steps/step-dev': [() => answerJson(409, { error: 'step_bound' })],
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Retire Development' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm retirement' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'This step is still bound. Remove its bindings before retiring it.',
  );
  expect(screen.getByRole('button', { name: 'Edit Development' })).toBeDefined();
});

for (const error of ['code_taken', 'name_taken'] as const) {
  it('keeps a new-step draft when the server refuses reserved ' + error, async () => {
    stubDefinitionServer({
      'GET /api/organization/steps': [() => answerJson(200, empty)],
      'POST /api/organization/step-bindings': [() => answerJson(409, { error })],
    });
    mount();
    const form = await enterNewStep();
    fireEvent.submit(form);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      error === 'code_taken'
        ? 'This code is already reserved, including by retired steps.'
        : 'This name is already reserved, including by retired steps.',
    );
    expect(within(form).getByLabelText('Step name')).toHaveProperty('value', 'Development');
    expect(within(form).getByLabelText('Step code')).toHaveProperty('value', 'dev');
  });
}

it('refuses lossy allowance input before sending a definition mutation', async () => {
  const sent = stubDefinitionServer({
    'GET /api/organization/steps': [() => answerJson(200, empty)],
  });
  mount();
  fireEvent.submit(await enterNewStep('12.345'));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Enter an allowance from 0 to 1000 with at most two decimal places.',
  );
  expect(sent.filter(({ route }) => route.startsWith('POST '))).toEqual([]);
});

it('withdraws organization access on a real definition write refusal', async () => {
  stubDefinitionServer({
    'GET /api/organization/steps': [() => answerJson(200, empty)],
    'POST /api/organization/step-bindings': [() => answerJson(403, { error: 'not_a_member' })],
  });
  const { lost } = mount();
  fireEvent.submit(await enterNewStep());
  await waitFor(() => {
    expect(lost).toHaveBeenCalledWith('removed');
  });
});

it('admits only one pending definition write across repeated form submissions', async () => {
  const sent = stubDefinitionServer({
    'GET /api/organization/steps': [() => answerJson(200, empty)],
    'POST /api/organization/step-bindings': [
      () => answerJson(403, { error: 'forbidden', permission: 'organization.manage_settings' }),
    ],
  });
  const forwarded = globalThis.fetch;
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = forwarded(input, init);
    if (init?.method === 'POST') await held;
    return response;
  });
  mount();
  const form = await enterNewStep();
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  await waitFor(() => {
    expect(sent.filter(({ route }) => route.startsWith('POST '))).toHaveLength(1);
  });
  if (release === undefined) throw new Error('Definition write owner was not acquired');
  const complete = release;
  await act(async () => {
    complete();
    await held;
  });
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'You do not have permission to manage steps at this scope.',
  );
});

it('ignores a definition write reply after refresh replaces its editor', async () => {
  const sent = stubDefinitionServer({
    'GET /api/organization/steps': [() => answerJson(200, empty)],
    'POST /api/organization/step-bindings': [() => answerJson(403, { error: 'not_a_member' })],
  });
  const forwarded = globalThis.fetch;
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = forwarded(input, init);
    if (init?.method === 'POST') await held;
    return response;
  });
  const { lost } = mount();
  fireEvent.submit(await enterNewStep());
  await waitFor(() => {
    expect(sent.filter(({ route }) => route.startsWith('POST '))).toHaveLength(1);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh steps' }));
  await screen.findByRole('form', { name: 'New step definition' });
  if (release === undefined) throw new Error('Definition write owner was not acquired');
  const complete = release;
  await act(async () => {
    complete();
    await held;
  });
  expect(lost).not.toHaveBeenCalled();
  expect(sent.filter(({ route }) => route === 'GET /api/organization/steps')).toHaveLength(2);
  expect(sent.filter(({ route }) => route === 'GET /api/work-item-types')).toHaveLength(4);
});

it('renders invalid estimate-unit input without sending a definition mutation', async () => {
  const sent = stubDefinitionServer({
    'GET /api/organization/steps': [() => answerJson(200, empty)],
  });
  mount();
  const form = await enterNewStep();
  const select = within(form).getByLabelText('Default estimate unit');
  const option = document.createElement('option');
  option.value = 'hours';
  option.textContent = 'Hours';
  select.appendChild(option);
  fireEvent.change(select, { target: { value: 'hours' } });
  fireEvent.submit(form);
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Choose workdays or minutes.',
  );
  expect(sent.filter(({ route }) => route.startsWith('POST '))).toEqual([]);
});

for (const blank of ['', '  ']) {
  it(
    'requires an explicit allowance instead of turning ' + JSON.stringify(blank) + ' into zero',
    async () => {
      const sent = stubDefinitionServer({
        'GET /api/organization/steps': [() => answerJson(200, empty)],
      });
      mount();
      fireEvent.submit(await enterNewStep(blank));
      expect(await screen.findByRole('alert')).toHaveProperty(
        'textContent',
        'Enter an allowance from 0 to 1000 with at most two decimal places.',
      );
      expect(sent.filter(({ route }) => route.startsWith('POST '))).toEqual([]);
    },
  );
}
