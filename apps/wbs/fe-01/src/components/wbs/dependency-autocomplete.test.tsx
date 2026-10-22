import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProjectAddressApi } from '@/lib/wbs-api';
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
  const add = vi.fn().mockResolvedValue(undefined);
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
        .some((alert) => alert.textContent.includes('external_dependencies_inactive')),
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
