import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpProjectApi, type ProjectAddressApi, type ProjectApi } from '@/lib/wbs-api';
import { projectServicesOver } from '@/modules/project/composition';
import { fakeProjectApi } from '@/testing/fake-project-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { NO_SAVED_PLANS } from '@/testing/no-saved-plans';
import { WbsTableOverClient } from '@/testing/wbs-table-over-client';

const project = { projectId: 'remote', abbreviation: 'PUNI', name: 'Puni remote' };
const node = {
  projectId: 'remote',
  workItemId: 'remote-row',
  number: '080',
  name: 'Remote build',
  endpoint: { scope: 'node' as const, workItemId: 'remote-row', stepId: 'remote-dev' },
  reference: 'PUNI.080.s1-dev',
  step: { id: 'remote-dev', code: 'DEV', name: 'Development', position: 0, ordinal: 1 },
};
const success = <T,>(body: T) => ({
  kind: 'success' as const,
  representation: 'json' as const,
  status: 200 as const,
  body,
  headers: new Headers(),
});
function addresses(): ProjectAddressApi {
  return {
    projects: vi.fn().mockResolvedValue(success({ projects: [project], nextCursor: null })),
    candidates: vi
      .fn()
      .mockResolvedValue(
        success({ project, addressRevision: 'r1', candidates: [node], nextCursor: null }),
      ),
    resolve: vi.fn(),
  };
}
publishApplicationRuntimeForEachTest();
afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
});
async function mount(phone = false) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: phone ? 390 : 1024 });
  const api = fakeProjectApi();
  const source = await api.createWorkItem('p1', {
    parentId: null,
    afterId: null,
    name: 'Puni local title',
  });
  await api.createWorkItem('p1', { parentId: null, afterId: source.id, name: 'Successor' });
  const add = vi.fn<ProjectApi['addTypedDependency']>().mockResolvedValue(undefined);
  const client = { ...api, addTypedDependency: add };
  const routes = addresses();
  render(
    <WbsTableOverClient
      projectId="p1"
      projectServices={projectServicesOver(client, NO_SAVED_PLANS, routes)}
    />,
  );
  if (phone) fireEvent.click(await screen.findByRole('button', { name: 'Depends on for 020' }));
  const box = await screen.findByLabelText<HTMLInputElement>('Add a dependency to 020');
  fireEvent.focus(box);
  return { box, add, routes };
}

describe('actual dependency autocomplete fields', () => {
  for (const phone of [false, true])
    it(`scopes project selection and writes exact remote node identity on ${phone ? 'phone' : 'desktop'}`, async () => {
      const { box, add, routes } = await mount(phone);
      fireEvent.change(box, { target: { value: '010,  puni' } });
      const projectChoice = await screen.findByRole(phone ? 'button' : 'option', {
        name: 'Project PUNI - Puni remote',
      });
      expect(
        screen.getByRole(phone ? 'button' : 'option', { name: '010 - Puni local title' }),
      ).toBeDefined();
      fireEvent.click(projectChoice);
      expect(add).not.toHaveBeenCalled();
      expect(box.value).toBe('010,  PUNI.');
      fireEvent.click(
        await screen.findByRole(phone ? 'button' : 'option', {
          name: 'PUNI.080.s1-dev - Remote build',
        }),
      );
      await waitFor(() => {
        expect(add).toHaveBeenCalledWith(
          'p1',
          { projectId: 'remote', scope: 'node', workItemId: 'remote-row', stepId: 'remote-dev' },
          expect.objectContaining({ scope: 'whole' }),
          'FS',
        );
      });
      await waitFor(() => {
        expect(box.value).toBe('010,  ');
      });
      expect(routes.candidates).toHaveBeenCalledWith(
        'remote',
        { q: '', limit: '25' },
        expect.any(AbortSignal),
      );
    });

  it('Customize remote node never authors before Add and retains exact project/step identities', async () => {
    const { box, add } = await mount();
    fireEvent.change(box, { target: { value: '010, puni' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
    );
    expect(add).not.toHaveBeenCalled();
    const submit = await screen.findByRole<HTMLButtonElement>('button', { name: /^Add$/ });
    await waitFor(() => {
      expect(submit.disabled).toBe(false);
    });
    fireEvent.click(submit);
    await waitFor(() => {
      expect(add).toHaveBeenCalledWith(
        'p1',
        { projectId: 'remote', scope: 'node', workItemId: 'remote-row', stepId: 'remote-dev' },
        expect.objectContaining({ scope: 'whole' }),
        'FS',
      );
    });
    await waitFor(() => {
      expect(box.value).toBe('010, ');
    });
  });
});

it('retains a refused remote draft and locks repeated taps by endpoint identity', async () => {
  const { box, add } = await mount();
  let reject: ((reason: unknown) => void) | undefined;
  add.mockImplementationOnce(
    () =>
      new Promise((_resolve, refuse) => {
        reject = refuse;
      }),
  );
  fireEvent.change(box, { target: { value: '010, PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
  const option = await screen.findByRole('option', { name: 'PUNI.080.s1-dev - Remote build' });
  fireEvent.click(option);
  fireEvent.click(option);
  expect(add).toHaveBeenCalledTimes(1);
  expect(box.value).toBe('010, PUNI.080.s1-dev');
  if (reject === undefined) throw new Error('Write did not start');
  await act(async () => {
    reject?.(new Error('external_dependencies_inactive'));
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(
      screen
        .getAllByRole('alert')
        .some((alert) =>
          alert.textContent.includes(
            'Dependencies between projects are not enabled on this server.',
          ),
        ),
    ).toBe(true);
  });
  expect(box.value).toBe('010, PUNI.080.s1-dev');
});

it('a pending endpoint in one project never locks the same opaque work-item/step IDs in another', async () => {
  const { box, add, routes } = await mount();
  const other = { projectId: 'other', abbreviation: 'OTHER', name: 'Other project' };
  vi.mocked(routes.projects).mockImplementation((query) =>
    Promise.resolve(
      success({ projects: query.q === 'OTHER' ? [other] : [project], nextCursor: null }),
    ),
  );
  vi.mocked(routes.candidates).mockImplementation((projectId) => {
    const selected = projectId === 'other' ? other : project;
    return Promise.resolve(
      success({
        project: selected,
        addressRevision: 'r1',
        candidates: [{ ...node, projectId, reference: `${selected.abbreviation}.080.s1-dev` }],
        nextCursor: null,
      }),
    );
  });
  const releases: (() => void)[] = [];
  add.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        releases.push(resolve);
      }),
  );
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
  fireEvent.click(await screen.findByRole('option', { name: 'PUNI.080.s1-dev - Remote build' }));
  expect(add).toHaveBeenCalledTimes(1);
  fireEvent.change(box, { target: { value: 'OTHER' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project OTHER - Other project' }));
  fireEvent.click(await screen.findByRole('option', { name: 'OTHER.080.s1-dev - Remote build' }));
  expect(add).toHaveBeenCalledTimes(2);
  await act(async () => {
    for (const release of releases) release();
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(box.value).toBe('');
  });
});

it('mixed list submit keeps successful local/remote identities and reports unresolved tokens once', async () => {
  const { box, add, routes } = await mount();
  vi.mocked(routes.resolve).mockResolvedValue(
    success({
      projectId: 'remote',
      endpoint: node.endpoint,
      reference: node.reference,
      addressRevision: 'r1',
    }),
  );
  fireEvent.change(box, { target: { value: '010 PUNI.080.s1-dev puni.080.s1-dev 999' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => {
    expect(add).toHaveBeenCalledTimes(1);
  });
  await screen.findByRole('button', { name: /^Stop 020 waiting for 010/ });
  await waitFor(() => {
    expect(
      screen.getAllByRole('alert').filter((alert) => alert.textContent.includes('999 (not found)')),
    ).toHaveLength(1);
  });
});

it('keyboard project and endpoint selection preserve earlier tokens without submitting them', async () => {
  const { box, add } = await mount();
  fireEvent.change(box, { target: { value: '010, PUNI' } });
  await screen.findByRole('option', { name: 'Project PUNI - Puni remote' });
  fireEvent.keyDown(box, { key: 'ArrowDown' });
  fireEvent.keyDown(box, { key: 'ArrowDown' });
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(add).not.toHaveBeenCalled();
  expect(box.value).toBe('010, PUNI.');
  await screen.findByRole('option', { name: 'PUNI.080.s1-dev - Remote build' });
  fireEvent.keyDown(box, { key: 'ArrowDown' });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => {
    expect(add).toHaveBeenCalledTimes(1);
  });
  await waitFor(() => {
    expect(box.value).toBe('010, ');
  });
  expect(screen.queryByRole('button', { name: /^Stop 020 waiting for 010/ })).toBeNull();
});

it('switching remote Customize follows the newly selected stable project', async () => {
  const { box, add, routes } = await mount();
  const other = { projectId: 'other', abbreviation: 'OTHER', name: 'Other project' };
  vi.mocked(routes.projects).mockResolvedValue(
    success({ projects: [project, other], nextCursor: null }),
  );
  vi.mocked(routes.candidates).mockImplementation((projectId) => {
    const selected = projectId === 'other' ? other : project;
    return Promise.resolve(
      success({
        project: selected,
        addressRevision: 'r1',
        candidates: [{ ...node, projectId, reference: `${selected.abbreviation}.080.s1-dev` }],
        nextCursor: null,
      }),
    );
  });
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
  );
  await waitFor(() => {
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /^Add$/ }).disabled).toBe(false);
  });
  fireEvent.change(box, { target: { value: 'OTHER' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project OTHER - Other project' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Customize OTHER.080.s1-dev - Remote build' }),
  );
  await waitFor(() => {
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /^Add$/ }).disabled).toBe(false);
  });
  fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
  await waitFor(() => {
    expect(add).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ projectId: 'other' }),
      expect.anything(),
      'FS',
    );
  });
});

it('remote Customize returns keyboard focus to its dependency input', async () => {
  const { box } = await mount();
  fireEvent.change(box, { target: { value: '010, PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Back to dependency picker' }));
  expect(document.activeElement).toBe(box);
  expect(box.value).toBe('010, PUNI.');
});

it('a selected stable project stays pinned after a trailing comma', async () => {
  const { box, add, routes } = await mount();
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
  const other = { ...project, projectId: 'reused-project', name: 'Replacement holder' };
  vi.mocked(routes.projects).mockResolvedValue(success({ projects: [other], nextCursor: null }));
  vi.mocked(routes.candidates).mockImplementation((projectId) =>
    Promise.resolve(
      success({
        project: projectId === 'remote' ? project : other,
        addressRevision: 'r1',
        candidates: [{ ...node, projectId }],
        nextCursor: null,
      }),
    ),
  );
  vi.mocked(routes.resolve).mockImplementation((projectId) =>
    Promise.resolve(
      success({
        projectId,
        endpoint: node.endpoint,
        reference: node.reference,
        addressRevision: 'r1',
      }),
    ),
  );
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev,' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => {
    expect(add).toHaveBeenCalledTimes(1);
  });
  expect(add).toHaveBeenCalledWith(
    'p1',
    expect.objectContaining({ projectId: 'remote' }),
    expect.anything(),
    'FS',
  );
  expect(routes.projects).toHaveBeenCalledTimes(1);
});

it('local Customize retains previous mixed tokens after successful Add', async () => {
  const { box, add } = await mount();
  fireEvent.change(box, { target: { value: '999, 010' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Customize 010 - Puni local title' }));
  fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
  await waitFor(() => {
    expect(add).toHaveBeenCalledTimes(1);
  });
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'Customize dependency' })).toBeNull();
  });
  expect(box.value).toBe('999, ');
});

it('switching same-abbreviation remote Customize never offers the previous project endpoint', async () => {
  const { box, add, routes } = await mount();
  const other = { projectId: 'other', abbreviation: 'PUNI', name: 'Other Puni holder' };
  vi.mocked(routes.projects).mockResolvedValue(
    success({ projects: [project, other], nextCursor: null }),
  );
  vi.mocked(routes.candidates).mockImplementation((projectId) =>
    Promise.resolve(
      success({
        project: projectId === 'remote' ? project : other,
        addressRevision: 'r1',
        candidates: [{ ...node, projectId }],
        nextCursor: null,
      }),
    ),
  );
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
  );
  await waitFor(() => {
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /^Add$/ }).disabled).toBe(false);
  });
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Other Puni holder' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
  );
  const selector = screen.getByLabelText<HTMLSelectElement>('Predecessor');
  await waitFor(() => {
    expect([...selector.options].some((option) => !option.disabled)).toBe(true);
  });
  const offered = [...selector.options].find((option) => !option.disabled);
  if (offered === undefined) throw new Error('No offered scope');
  fireEvent.change(selector, { target: { value: offered.value } });
  fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
  await waitFor(() => {
    expect(add).toHaveBeenCalledTimes(1);
  });
  expect(add).toHaveBeenCalledWith(
    'p1',
    expect.objectContaining({ projectId: 'other' }),
    expect.anything(),
    'FS',
  );
});

it('current lookup cancellation is visible in the actual field', async () => {
  const { box, routes } = await mount();
  vi.mocked(routes.projects).mockResolvedValue({ kind: 'failure', failure: { code: 'cancelled' } });
  fireEvent.change(box, { target: { value: 'PUNI' } });
  await waitFor(() => {
    expect(routes.projects).toHaveBeenCalledTimes(1);
  });
  await waitFor(() => {
    expect(screen.queryByText('Loading dependency choices…')).toBeNull();
  });
  expect(screen.getByText(/cancelled/i)).toBeDefined();
});

it('separately selected occurrences of one abbreviation keep their own stable projects', async () => {
  const { box, add, routes } = await mount();
  const other = { ...project, projectId: 'other', name: 'Other Puni holder' };
  vi.mocked(routes.candidates).mockImplementation((projectId) =>
    Promise.resolve(
      success({
        project: projectId === 'remote' ? project : other,
        addressRevision: 'r1',
        candidates: [{ ...node, projectId }],
        nextCursor: null,
      }),
    ),
  );
  vi.mocked(routes.resolve).mockImplementation((projectId) =>
    Promise.resolve(
      success({
        projectId,
        endpoint: node.endpoint,
        reference: node.reference,
        addressRevision: 'r1',
      }),
    ),
  );
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
  vi.mocked(routes.projects).mockResolvedValue(success({ projects: [other], nextCursor: null }));
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev, PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Other Puni holder' }));
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev, PUNI.080.s1-dev,' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => {
    expect(add).toHaveBeenCalledTimes(2);
  });
  expect(add.mock.calls.map((call) => call[1].projectId)).toEqual(['remote', 'other']);
  expect(routes.projects).toHaveBeenCalledTimes(2);
});

for (const phone of [false, true]) {
  for (const exit of ['Back', 'Escape', 'ArrowLeft', 'Add']) {
    it(`remote Customize ${exit} restores actual ${phone ? 'phone' : 'desktop'} focus and retains earlier tokens`, async () => {
      const { box, add } = await mount(phone);
      fireEvent.change(box, { target: { value: '999, PUNI' } });
      fireEvent.click(
        await screen.findByRole(phone ? 'button' : 'option', {
          name: 'Project PUNI - Puni remote',
        }),
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
      );
      const back = screen.getByRole('button', { name: 'Back to dependency picker' });
      expect(document.activeElement).toBe(back);
      if (exit === 'Add') {
        const submit = screen.getByRole<HTMLButtonElement>('button', { name: /^Add$/ });
        await waitFor(() => {
          expect(submit.disabled).toBe(false);
        });
        fireEvent.click(submit);
        await waitFor(() => {
          expect(add).toHaveBeenCalledTimes(1);
        });
      } else if (exit === 'Back') fireEvent.click(back);
      else fireEvent.keyDown(back, { key: exit });
      await waitFor(() => {
        expect(document.activeElement).toBe(box);
      });
      expect(box.value).toBe(exit === 'Add' ? '999, ' : '999, PUNI.');
    });
  }
}

it('local Customize success preserves newer edits and restores the existing draft', async () => {
  const { box, add } = await mount();
  let release: (() => void) | undefined;
  add.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  fireEvent.change(box, { target: { value: '999, 010' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Customize 010 - Puni local title' }));
  fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
  fireEvent.change(box, { target: { value: '999, 010, newer' } });
  if (release === undefined) throw new Error('Write did not start');
  await act(async () => {
    release?.();
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(document.activeElement).toBe(box);
  });
  expect(box.value).toBe('999, 010, newer');
});

for (const phone of [false, true])
  it(`current cancellation can deliberately retry on ${phone ? 'phone' : 'desktop'}`, async () => {
    const { box, routes } = await mount(phone);
    vi.mocked(routes.projects).mockResolvedValueOnce({
      kind: 'failure',
      failure: { code: 'cancelled' },
    });
    fireEvent.change(box, { target: { value: 'PUNI' } });
    expect(await screen.findByText('Dependency lookup cancelled.')).toBeDefined();
    expect(routes.projects).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry lookup' }));
    expect(
      await screen.findByRole(phone ? 'button' : 'option', { name: 'Project PUNI - Puni remote' }),
    ).toBeDefined();
    expect(routes.projects).toHaveBeenCalledTimes(2);
  });

it('current Customize cancellation is visible and retries only the selected stable project', async () => {
  const { box, routes, add } = await mount();
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
  await screen.findByRole('option', { name: 'PUNI.080.s1-dev - Remote build' });
  vi.mocked(routes.candidates).mockResolvedValueOnce({
    kind: 'failure',
    failure: { code: 'cancelled' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }));
  expect(await screen.findByText('Predecessor lookup cancelled.')).toBeDefined();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: /^Add$/ }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry scopes' }));
  await waitFor(() => {
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /^Add$/ }).disabled).toBe(false);
  });
  fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
  await waitFor(() => {
    expect(add).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ projectId: 'remote' }),
      expect.anything(),
      'FS',
    );
  });
  expect(routes.projects).toHaveBeenCalledTimes(1);
});

it('local Customize focus restoration retains a previous remote token binding', async () => {
  const { box, add, routes } = await mount();
  vi.mocked(routes.resolve).mockImplementation((projectId) =>
    Promise.resolve(
      success({
        projectId,
        endpoint: node.endpoint,
        reference: node.reference,
        addressRevision: 'r1',
      }),
    ),
  );
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev, 010' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Customize 010 - Puni local title' }));
  fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
  await waitFor(() => {
    expect(document.activeElement).toBe(box);
  });
  expect(box.value).toBe('PUNI.080.s1-dev, ');
  vi.mocked(routes.projects).mockResolvedValue(
    success({ projects: [{ ...project, projectId: 'replacement' }], nextCursor: null }),
  );
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => {
    expect(add).toHaveBeenCalledTimes(2);
  });
  expect(add.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ projectId: 'remote' }));
  expect(routes.projects).toHaveBeenCalledTimes(1);
});

it('ambiguous deletion between identically spelled separately bound occurrences requires reselection', async () => {
  const { box, add, routes } = await mount();
  const other = { ...project, projectId: 'other', name: 'Other Puni holder' };
  vi.mocked(routes.candidates).mockImplementation((projectId) =>
    Promise.resolve(
      success({
        project: projectId === 'remote' ? project : other,
        addressRevision: 'r1',
        candidates: [{ ...node, projectId }],
        nextCursor: null,
      }),
    ),
  );
  vi.mocked(routes.resolve).mockImplementation((projectId) =>
    Promise.resolve(
      success({
        projectId,
        endpoint: node.endpoint,
        reference: node.reference,
        addressRevision: 'r1',
      }),
    ),
  );
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
  vi.mocked(routes.projects).mockResolvedValue(success({ projects: [other], nextCursor: null }));
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev, PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Other Puni holder' }));
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev, PUNI.080.s1-dev,' } });
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev,' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(
    await screen.findByText('These were refused: PUNI.080.s1-dev (choose a project).'),
  ).toBeDefined();
  expect(add).not.toHaveBeenCalled();
  expect(routes.projects).toHaveBeenCalledTimes(2);
});

it('actual HTTP409 through the mounted writer retains the mixed draft and readable refusal', async () => {
  const { box, add } = await mount();
  const fetcher = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(
      Response.json(
        { error: 'external_dependencies_inactive', at: 0, kind: 'addTypedDependency' },
        { status: 409 },
      ),
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  add.mockImplementation((...args) => httpProjectApi('token').addTypedDependency(...args));
  try {
    fireEvent.change(box, { target: { value: '010, PUNI' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
    fireEvent.click(await screen.findByRole('option', { name: 'PUNI.080.s1-dev - Remote build' }));
    expect(
      await screen.findByText('Dependencies between projects are not enabled on this server.'),
    ).toBeDefined();
    expect(box.value).toBe('010, PUNI.080.s1-dev');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const call = fetcher.mock.calls[0];
    if (typeof call[1]?.body !== 'string') throw new Error('Command body absent');
    expect(call[0]).toBe('/api/projects/p1/commands');
    expect(JSON.parse(call[1].body)).toEqual({
      commands: [
        {
          kind: 'addTypedDependency',
          predecessor: {
            scope: 'node',
            projectId: 'remote',
            workItemId: 'remote-row',
            stepId: 'remote-dev',
          },
          successor: add.mock.calls[0][2],
          type: 'FS',
        },
      ],
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

for (const phone of [false, true])
  for (const exit of ['Back', 'Escape', 'ArrowLeft']) {
    it(`local Customize ${exit} returns to the retained ${phone ? 'phone' : 'desktop'} draft`, async () => {
      const { box, add } = await mount(phone);
      fireEvent.change(box, { target: { value: '999, 010' } });
      fireEvent.click(
        await screen.findByRole('button', { name: 'Customize 010 - Puni local title' }),
      );
      const back = screen.getByRole('button', { name: 'Back to dependency picker' });
      if (exit === 'Back') fireEvent.click(back);
      else fireEvent.keyDown(back, { key: exit });
      await waitFor(() => {
        expect(document.activeElement).toBe(box);
      });
      expect(box.value).toBe('999, 010');
      expect(add).not.toHaveBeenCalled();
    });
  }

it('remote Customize success preserves newer typed work when returning focus', async () => {
  const { box, add } = await mount();
  let release: (() => void) | undefined;
  add.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  fireEvent.change(box, { target: { value: '999, PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
  );
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: /^Add$/ });
  await waitFor(() => {
    expect(submit.disabled).toBe(false);
  });
  fireEvent.click(submit);
  fireEvent.change(box, { target: { value: '999, PUNI.080, newer' } });
  if (release === undefined) throw new Error('Write did not start');
  await act(async () => {
    release?.();
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(document.activeElement).toBe(box);
  });
  expect(box.value).toBe('999, PUNI.080, newer');
});

it('an older Customize success does not erase a newly selected holder with the identical draft text', async () => {
  const { box, add, routes } = await mount();
  let release: (() => void) | undefined;
  add.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const other = { ...project, projectId: 'other', name: 'Other Puni holder' };
  vi.mocked(routes.candidates).mockImplementation((projectId) =>
    Promise.resolve(
      success({
        project: projectId === 'remote' ? project : other,
        addressRevision: 'r1',
        candidates: [{ ...node, projectId }],
        nextCursor: null,
      }),
    ),
  );
  fireEvent.change(box, { target: { value: '999, PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
  );
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: /^Add$/ });
  await waitFor(() => {
    expect(submit.disabled).toBe(false);
  });
  fireEvent.click(submit);
  vi.mocked(routes.projects).mockResolvedValue(success({ projects: [other], nextCursor: null }));
  fireEvent.change(box, { target: { value: '999, PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Other Puni holder' }));
  expect(box.value).toBe('999, PUNI.');
  if (release === undefined) throw new Error('Write did not start');
  await act(async () => {
    release?.();
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(document.activeElement).toBe(box);
  });
  expect(box.value).toBe('999, PUNI.');
});

for (const phone of [false, true])
  it(`an older one-click completion preserves the new identical token on ${phone ? 'phone' : 'desktop'}`, async () => {
    const { box, add, routes } = await mount(phone);
    const other = { ...project, projectId: 'other', name: 'Other Puni holder' };
    vi.mocked(routes.candidates).mockImplementation((projectId) =>
      Promise.resolve(
        success({
          project: projectId === 'remote' ? project : other,
          addressRevision: 'r1',
          candidates: [{ ...node, projectId }],
          nextCursor: null,
        }),
      ),
    );
    const releases: (() => void)[] = [];
    add.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    );
    const role = phone ? 'button' : 'option';
    fireEvent.change(box, { target: { value: 'PUNI' } });
    fireEvent.click(await screen.findByRole(role, { name: 'Project PUNI - Puni remote' }));
    fireEvent.click(await screen.findByRole(role, { name: 'PUNI.080.s1-dev - Remote build' }));
    vi.mocked(routes.projects).mockResolvedValue(success({ projects: [other], nextCursor: null }));
    fireEvent.change(box, { target: { value: 'PUNI' } });
    fireEvent.click(await screen.findByRole(role, { name: 'Project PUNI - Other Puni holder' }));
    fireEvent.click(await screen.findByRole(role, { name: 'PUNI.080.s1-dev - Remote build' }));
    expect(add).toHaveBeenCalledTimes(2);
    await act(async () => {
      releases[0]?.();
      await Promise.resolve();
    });
    expect(box.value).toBe('PUNI.080.s1-dev');
    await act(async () => {
      releases[1]?.();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(box.value).toBe('');
    });
  });

it('an older list completion retains a newly selected identical-text occurrence', async () => {
  const { box, add, routes } = await mount();
  let release: (() => void) | undefined;
  add.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const other = { ...project, projectId: 'other', name: 'Other Puni holder' };
  vi.mocked(routes.candidates).mockImplementation((projectId) =>
    Promise.resolve(
      success({
        project: projectId === 'remote' ? project : other,
        addressRevision: 'r1',
        candidates: [{ ...node, projectId }],
        nextCursor: null,
      }),
    ),
  );
  vi.mocked(routes.resolve).mockImplementation((projectId) =>
    Promise.resolve(
      success({
        projectId,
        endpoint: node.endpoint,
        reference: node.reference,
        addressRevision: 'r1',
      }),
    ),
  );
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Puni remote' }));
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev,' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => {
    expect(add).toHaveBeenCalledTimes(1);
  });
  vi.mocked(routes.projects).mockResolvedValue(success({ projects: [other], nextCursor: null }));
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Project PUNI - Other Puni holder' }));
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev,' } });
  if (release === undefined) throw new Error('Write did not start');
  await act(async () => {
    release?.();
    await Promise.resolve();
  });
  expect(box.value).toBe('PUNI.080.s1-dev,');
});
