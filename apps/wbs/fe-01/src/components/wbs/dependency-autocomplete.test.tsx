import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { httpWorkPackageApi, type WorkPackageAddressApi, type WorkPackageApi } from '@/lib/wbs-api';
import { workPackageServicesOver } from '@/modules/work-package/composition';
import { fakeWorkPackageApi } from '@/testing/fake-work-package-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { NO_SAVED_PLANS } from '@/testing/no-saved-plans';
import { WbsTableOverClient } from '@/testing/wbs-table-over-client';

const workPackage = { workPackageId: 'remote', abbreviation: 'PUNI', name: 'Puni remote' };
const node = {
  workPackageId: 'remote',
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
function addresses(): WorkPackageAddressApi {
  return {
    workPackages: vi
      .fn()
      .mockResolvedValue(success({ workPackages: [workPackage], nextCursor: null })),
    candidates: vi
      .fn()
      .mockResolvedValue(
        success({ workPackage, addressRevision: 'r1', candidates: [node], nextCursor: null }),
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
  const api = fakeWorkPackageApi();
  const source = await api.createWorkItem('p1', {
    parentId: null,
    afterId: null,
    name: 'Puni local title',
  });
  await api.createWorkItem('p1', { parentId: null, afterId: source.id, name: 'Successor' });
  const add = vi.fn<WorkPackageApi['addTypedDependency']>().mockResolvedValue(undefined);
  const client = { ...api, addTypedDependency: add };
  const routes = addresses();
  render(
    <WbsTableOverClient
      workPackageId="p1"
      workPackageServices={workPackageServicesOver(client, NO_SAVED_PLANS, routes)}
    />,
  );
  if (phone) fireEvent.click(await screen.findByRole('button', { name: 'Depends on for 020' }));
  const box = await screen.findByLabelText<HTMLInputElement>('Add a dependency to 020');
  fireEvent.focus(box);
  return { box, add, routes };
}

describe('actual dependency autocomplete fields', () => {
  for (const phone of [false, true])
    it(`scopes work package selection and writes exact remote node identity on ${phone ? 'phone' : 'desktop'}`, async () => {
      const { box, add, routes } = await mount(phone);
      fireEvent.change(box, { target: { value: '010,  puni' } });
      const workPackageChoice = await screen.findByRole(phone ? 'button' : 'option', {
        name: 'Work package PUNI - Puni remote',
      });
      expect(
        screen.getByRole(phone ? 'button' : 'option', { name: '010 - Puni local title' }),
      ).toBeDefined();
      fireEvent.click(workPackageChoice);
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
          {
            workPackageId: 'remote',
            scope: 'node',
            workItemId: 'remote-row',
            stepId: 'remote-dev',
          },
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

  it('Customize remote node never authors before Add and retains exact work-package/step identities', async () => {
    const { box, add } = await mount();
    fireEvent.change(box, { target: { value: '010, puni' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
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
        { workPackageId: 'remote', scope: 'node', workItemId: 'remote-row', stepId: 'remote-dev' },
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
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
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
            'Dependencies between work packages are not enabled on this server.',
          ),
        ),
    ).toBe(true);
  });
  expect(box.value).toBe('010, PUNI.080.s1-dev');
});

it('a pending endpoint in one work package never locks the same opaque work-item/step IDs in another', async () => {
  const { box, add, routes } = await mount();
  const other = { workPackageId: 'other', abbreviation: 'OTHER', name: 'Other work package' };
  vi.mocked(routes.workPackages).mockImplementation((query) =>
    Promise.resolve(
      success({ workPackages: query.q === 'OTHER' ? [other] : [workPackage], nextCursor: null }),
    ),
  );
  vi.mocked(routes.candidates).mockImplementation((workPackageId) => {
    const selected = workPackageId === 'other' ? other : workPackage;
    return Promise.resolve(
      success({
        workPackage: selected,
        addressRevision: 'r1',
        candidates: [{ ...node, workPackageId, reference: `${selected.abbreviation}.080.s1-dev` }],
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
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
  fireEvent.click(await screen.findByRole('option', { name: 'PUNI.080.s1-dev - Remote build' }));
  expect(add).toHaveBeenCalledTimes(1);
  fireEvent.change(box, { target: { value: 'OTHER' } });
  fireEvent.click(
    await screen.findByRole('option', { name: 'Work package OTHER - Other work package' }),
  );
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
      workPackageId: 'remote',
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

it('keyboard work package and endpoint selection preserve earlier tokens without submitting them', async () => {
  const { box, add } = await mount();
  fireEvent.change(box, { target: { value: '010, PUNI' } });
  await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' });
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

it('switching remote Customize follows the newly selected stable work package', async () => {
  const { box, add, routes } = await mount();
  const other = { workPackageId: 'other', abbreviation: 'OTHER', name: 'Other work package' };
  vi.mocked(routes.workPackages).mockResolvedValue(
    success({ workPackages: [workPackage, other], nextCursor: null }),
  );
  vi.mocked(routes.candidates).mockImplementation((workPackageId) => {
    const selected = workPackageId === 'other' ? other : workPackage;
    return Promise.resolve(
      success({
        workPackage: selected,
        addressRevision: 'r1',
        candidates: [{ ...node, workPackageId, reference: `${selected.abbreviation}.080.s1-dev` }],
        nextCursor: null,
      }),
    );
  });
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
  );
  await waitFor(() => {
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /^Add$/ }).disabled).toBe(false);
  });
  fireEvent.change(box, { target: { value: 'OTHER' } });
  fireEvent.click(
    await screen.findByRole('option', { name: 'Work package OTHER - Other work package' }),
  );
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
      expect.objectContaining({ workPackageId: 'other' }),
      expect.anything(),
      'FS',
    );
  });
});

it('remote Customize returns keyboard focus to its dependency input', async () => {
  const { box } = await mount();
  fireEvent.change(box, { target: { value: '010, PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Back to dependency picker' }));
  expect(document.activeElement).toBe(box);
  expect(box.value).toBe('010, PUNI.');
});

it('a selected stable work package stays pinned after a trailing comma', async () => {
  const { box, add, routes } = await mount();
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
  const other = {
    ...workPackage,
    workPackageId: 'reused-work-package',
    name: 'Replacement holder',
  };
  vi.mocked(routes.workPackages).mockResolvedValue(
    success({ workPackages: [other], nextCursor: null }),
  );
  vi.mocked(routes.candidates).mockImplementation((workPackageId) =>
    Promise.resolve(
      success({
        workPackage: workPackageId === 'remote' ? workPackage : other,
        addressRevision: 'r1',
        candidates: [{ ...node, workPackageId }],
        nextCursor: null,
      }),
    ),
  );
  vi.mocked(routes.resolve).mockImplementation((workPackageId) =>
    Promise.resolve(
      success({
        workPackageId,
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
    expect.objectContaining({ workPackageId: 'remote' }),
    expect.anything(),
    'FS',
  );
  expect(routes.workPackages).toHaveBeenCalledTimes(1);
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

it('switching same-abbreviation remote Customize never offers the previous work package endpoint', async () => {
  const { box, add, routes } = await mount();
  const other = { workPackageId: 'other', abbreviation: 'PUNI', name: 'Other Puni holder' };
  vi.mocked(routes.workPackages).mockResolvedValue(
    success({ workPackages: [workPackage, other], nextCursor: null }),
  );
  vi.mocked(routes.candidates).mockImplementation((workPackageId) =>
    Promise.resolve(
      success({
        workPackage: workPackageId === 'remote' ? workPackage : other,
        addressRevision: 'r1',
        candidates: [{ ...node, workPackageId }],
        nextCursor: null,
      }),
    ),
  );
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
  );
  await waitFor(() => {
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /^Add$/ }).disabled).toBe(false);
  });
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(
    await screen.findByRole('option', { name: 'Work package PUNI - Other Puni holder' }),
  );
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
    expect.objectContaining({ workPackageId: 'other' }),
    expect.anything(),
    'FS',
  );
});

it('current lookup cancellation is visible in the actual field', async () => {
  const { box, routes } = await mount();
  vi.mocked(routes.workPackages).mockResolvedValue({
    kind: 'failure',
    failure: { code: 'cancelled' },
  });
  fireEvent.change(box, { target: { value: 'PUNI' } });
  await waitFor(() => {
    expect(routes.workPackages).toHaveBeenCalledTimes(1);
  });
  await waitFor(() => {
    expect(screen.queryByText('Loading dependency choices…')).toBeNull();
  });
  expect(screen.getByText(/cancelled/i)).toBeDefined();
});

it('separately selected occurrences of one abbreviation keep their own stable work packages', async () => {
  const { box, add, routes } = await mount();
  const other = { ...workPackage, workPackageId: 'other', name: 'Other Puni holder' };
  vi.mocked(routes.candidates).mockImplementation((workPackageId) =>
    Promise.resolve(
      success({
        workPackage: workPackageId === 'remote' ? workPackage : other,
        addressRevision: 'r1',
        candidates: [{ ...node, workPackageId }],
        nextCursor: null,
      }),
    ),
  );
  vi.mocked(routes.resolve).mockImplementation((workPackageId) =>
    Promise.resolve(
      success({
        workPackageId,
        endpoint: node.endpoint,
        reference: node.reference,
        addressRevision: 'r1',
      }),
    ),
  );
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
  vi.mocked(routes.workPackages).mockResolvedValue(
    success({ workPackages: [other], nextCursor: null }),
  );
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev, PUNI' } });
  fireEvent.click(
    await screen.findByRole('option', { name: 'Work package PUNI - Other Puni holder' }),
  );
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev, PUNI.080.s1-dev,' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => {
    expect(add).toHaveBeenCalledTimes(2);
  });
  expect(add.mock.calls.map((call) => call[1].workPackageId)).toEqual(['remote', 'other']);
  expect(routes.workPackages).toHaveBeenCalledTimes(2);
});

for (const phone of [false, true]) {
  for (const exit of ['Back', 'Escape', 'ArrowLeft', 'Add']) {
    it(`remote Customize ${exit} restores actual ${phone ? 'phone' : 'desktop'} focus and retains earlier tokens`, async () => {
      const { box, add } = await mount(phone);
      fireEvent.change(box, { target: { value: '999, PUNI' } });
      fireEvent.click(
        await screen.findByRole(phone ? 'button' : 'option', {
          name: 'Work package PUNI - Puni remote',
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
    vi.mocked(routes.workPackages).mockResolvedValueOnce({
      kind: 'failure',
      failure: { code: 'cancelled' },
    });
    fireEvent.change(box, { target: { value: 'PUNI' } });
    expect(await screen.findByText('Dependency lookup cancelled.')).toBeDefined();
    expect(routes.workPackages).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry lookup' }));
    expect(
      await screen.findByRole(phone ? 'button' : 'option', {
        name: 'Work package PUNI - Puni remote',
      }),
    ).toBeDefined();
    expect(routes.workPackages).toHaveBeenCalledTimes(2);
  });

it('current Customize cancellation is visible and retries only the selected stable work package', async () => {
  const { box, routes, add } = await mount();
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
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
      expect.objectContaining({ workPackageId: 'remote' }),
      expect.anything(),
      'FS',
    );
  });
  expect(routes.workPackages).toHaveBeenCalledTimes(1);
});

it('local Customize focus restoration retains a previous remote token binding', async () => {
  const { box, add, routes } = await mount();
  vi.mocked(routes.resolve).mockImplementation((workPackageId) =>
    Promise.resolve(
      success({
        workPackageId,
        endpoint: node.endpoint,
        reference: node.reference,
        addressRevision: 'r1',
      }),
    ),
  );
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev, 010' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Customize 010 - Puni local title' }));
  fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
  await waitFor(() => {
    expect(document.activeElement).toBe(box);
  });
  expect(box.value).toBe('PUNI.080.s1-dev, ');
  vi.mocked(routes.workPackages).mockResolvedValue(
    success({ workPackages: [{ ...workPackage, workPackageId: 'replacement' }], nextCursor: null }),
  );
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => {
    expect(add).toHaveBeenCalledTimes(2);
  });
  expect(add.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ workPackageId: 'remote' }));
  expect(routes.workPackages).toHaveBeenCalledTimes(1);
});

it('ambiguous deletion between identically spelled separately bound occurrences requires reselection', async () => {
  const { box, add, routes } = await mount();
  const other = { ...workPackage, workPackageId: 'other', name: 'Other Puni holder' };
  vi.mocked(routes.candidates).mockImplementation((workPackageId) =>
    Promise.resolve(
      success({
        workPackage: workPackageId === 'remote' ? workPackage : other,
        addressRevision: 'r1',
        candidates: [{ ...node, workPackageId }],
        nextCursor: null,
      }),
    ),
  );
  vi.mocked(routes.resolve).mockImplementation((workPackageId) =>
    Promise.resolve(
      success({
        workPackageId,
        endpoint: node.endpoint,
        reference: node.reference,
        addressRevision: 'r1',
      }),
    ),
  );
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
  vi.mocked(routes.workPackages).mockResolvedValue(
    success({ workPackages: [other], nextCursor: null }),
  );
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev, PUNI' } });
  fireEvent.click(
    await screen.findByRole('option', { name: 'Work package PUNI - Other Puni holder' }),
  );
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev, PUNI.080.s1-dev,' } });
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev,' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(
    await screen.findByText('These were refused: PUNI.080.s1-dev (choose a work package).'),
  ).toBeDefined();
  expect(add).not.toHaveBeenCalled();
  expect(routes.workPackages).toHaveBeenCalledTimes(2);
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
  add.mockImplementation((...args) => httpWorkPackageApi('token').addTypedDependency(...args));
  try {
    fireEvent.change(box, { target: { value: '010, PUNI' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
    fireEvent.click(await screen.findByRole('option', { name: 'PUNI.080.s1-dev - Remote build' }));
    expect(
      await screen.findByText('Dependencies between work packages are not enabled on this server.'),
    ).toBeDefined();
    expect(box.value).toBe('010, PUNI.080.s1-dev');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const call = fetcher.mock.calls[0];
    if (typeof call[1]?.body !== 'string') throw new Error('Command body absent');
    expect(call[0]).toBe('/api/work-packages/p1/commands');
    expect(JSON.parse(call[1].body)).toEqual({
      commands: [
        {
          kind: 'addTypedDependency',
          predecessor: {
            scope: 'node',
            workPackageId: 'remote',
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
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
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
  const other = { ...workPackage, workPackageId: 'other', name: 'Other Puni holder' };
  vi.mocked(routes.candidates).mockImplementation((workPackageId) =>
    Promise.resolve(
      success({
        workPackage: workPackageId === 'remote' ? workPackage : other,
        addressRevision: 'r1',
        candidates: [{ ...node, workPackageId }],
        nextCursor: null,
      }),
    ),
  );
  fireEvent.change(box, { target: { value: '999, PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
  );
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: /^Add$/ });
  await waitFor(() => {
    expect(submit.disabled).toBe(false);
  });
  fireEvent.click(submit);
  vi.mocked(routes.workPackages).mockResolvedValue(
    success({ workPackages: [other], nextCursor: null }),
  );
  fireEvent.change(box, { target: { value: '999, PUNI' } });
  fireEvent.click(
    await screen.findByRole('option', { name: 'Work package PUNI - Other Puni holder' }),
  );
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
    const other = { ...workPackage, workPackageId: 'other', name: 'Other Puni holder' };
    vi.mocked(routes.candidates).mockImplementation((workPackageId) =>
      Promise.resolve(
        success({
          workPackage: workPackageId === 'remote' ? workPackage : other,
          addressRevision: 'r1',
          candidates: [{ ...node, workPackageId }],
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
    fireEvent.click(await screen.findByRole(role, { name: 'Work package PUNI - Puni remote' }));
    fireEvent.click(await screen.findByRole(role, { name: 'PUNI.080.s1-dev - Remote build' }));
    vi.mocked(routes.workPackages).mockResolvedValue(
      success({ workPackages: [other], nextCursor: null }),
    );
    fireEvent.change(box, { target: { value: 'PUNI' } });
    fireEvent.click(
      await screen.findByRole(role, { name: 'Work package PUNI - Other Puni holder' }),
    );
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
  const other = { ...workPackage, workPackageId: 'other', name: 'Other Puni holder' };
  vi.mocked(routes.candidates).mockImplementation((workPackageId) =>
    Promise.resolve(
      success({
        workPackage: workPackageId === 'remote' ? workPackage : other,
        addressRevision: 'r1',
        candidates: [{ ...node, workPackageId }],
        nextCursor: null,
      }),
    ),
  );
  vi.mocked(routes.resolve).mockImplementation((workPackageId) =>
    Promise.resolve(
      success({
        workPackageId,
        endpoint: node.endpoint,
        reference: node.reference,
        addressRevision: 'r1',
      }),
    ),
  );
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev,' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => {
    expect(add).toHaveBeenCalledTimes(1);
  });
  vi.mocked(routes.workPackages).mockResolvedValue(
    success({ workPackages: [other], nextCursor: null }),
  );
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(
    await screen.findByRole('option', { name: 'Work package PUNI - Other Puni holder' }),
  );
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev,' } });
  if (release === undefined) throw new Error('Write did not start');
  await act(async () => {
    release?.();
    await Promise.resolve();
  });
  expect(box.value).toBe('PUNI.080.s1-dev,');
});

for (const phone of [false, true])
  for (const selectedWorkPackageId of ['other', 'remote'])
    it(`round2 an old pending Customize completion cannot close a newer editor on ${phone ? 'phone' : 'desktop'} for ${selectedWorkPackageId}`, async () => {
      const { box, add, routes } = await mount(phone);
      const other = { ...workPackage, workPackageId: selectedWorkPackageId, name: 'Other holder' };
      vi.mocked(routes.candidates).mockImplementation((workPackageId) =>
        Promise.resolve(
          success({
            workPackage: workPackageId === 'remote' ? workPackage : other,
            addressRevision: 'r1',
            candidates: [
              { ...node, workPackageId },
              {
                workPackageId,
                workItemId: node.workItemId,
                number: node.number,
                name: node.name,
                endpoint: { scope: 'whole', workItemId: node.workItemId },
                reference: 'PUNI.080',
              },
            ],
            nextCursor: null,
          }),
        ),
      );
      let release: (() => void) | undefined;
      add.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      const role = phone ? 'button' : 'option';
      fireEvent.change(box, { target: { value: '999, PUNI' } });
      fireEvent.click(await screen.findByRole(role, { name: 'Work package PUNI - Puni remote' }));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
      );
      await waitFor(() => {
        expect(screen.getByRole<HTMLButtonElement>('button', { name: /^Add$/ }).disabled).toBe(
          false,
        );
      });
      fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
      expect(add).toHaveBeenCalledTimes(1);
      vi.mocked(routes.workPackages).mockResolvedValue(
        success({ workPackages: [other], nextCursor: null }),
      );
      fireEvent.change(box, { target: { value: '999, PUNI' } });
      fireEvent.click(await screen.findByRole(role, { name: 'Work package PUNI - Other holder' }));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
      );
      await waitFor(() => {
        expect(screen.getByRole<HTMLButtonElement>('button', { name: /^Add$/ }).disabled).toBe(
          false,
        );
      });
      const relationship = screen.getByLabelText<HTMLSelectElement>('Relationship');
      fireEvent.change(screen.getByLabelText('Predecessor'), {
        target: { value: JSON.stringify([selectedWorkPackageId, node.workItemId, 'whole', null]) },
      });
      fireEvent.change(relationship, { target: { value: 'SS' } });
      act(() => {
        relationship.focus();
      });
      if (release === undefined) throw new Error('Old write did not start');
      await act(async () => {
        release?.();
        await Promise.resolve();
      });
      expect(screen.getByRole('dialog', { name: 'Customize dependency' })).toBeDefined();
      expect(screen.getByLabelText<HTMLSelectElement>('Relationship').value).toBe('SS');
      expect(box.value).toBe('999, PUNI.');
      expect(screen.getByLabelText<HTMLSelectElement>('Predecessor').value).toBe(
        JSON.stringify([selectedWorkPackageId, node.workItemId, 'whole', null]),
      );
      expect(document.activeElement).toBe(relationship);
      fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
      await waitFor(() => {
        expect(add).toHaveBeenCalledTimes(2);
      });
      expect(add.mock.calls[1][1]).toEqual({
        workPackageId: selectedWorkPackageId,
        scope: 'whole',
        workItemId: node.workItemId,
      });
      expect(add.mock.calls[1][3]).toBe('SS');
    });

for (const phone of [false, true])
  for (const customize of [false, true])
    it(`round2 known ${customize ? 'Customize' : 'one-click'} consumption preserves the first identical binding on ${phone ? 'phone' : 'desktop'}`, async () => {
      const { box, add, routes } = await mount(phone);
      const role = phone ? 'button' : 'option';
      const other = { ...workPackage, workPackageId: 'other', name: 'Other holder' };
      vi.mocked(routes.candidates).mockImplementation((workPackageId) =>
        Promise.resolve(
          success({
            workPackage: workPackageId === 'remote' ? workPackage : other,
            addressRevision: 'r1',
            candidates: [{ ...node, workPackageId }],
            nextCursor: null,
          }),
        ),
      );
      vi.mocked(routes.resolve).mockImplementation((workPackageId) =>
        Promise.resolve(
          success({
            workPackageId,
            endpoint: node.endpoint,
            reference: node.reference,
            addressRevision: 'r1',
          }),
        ),
      );
      fireEvent.change(box, { target: { value: 'PUNI' } });
      fireEvent.click(await screen.findByRole(role, { name: 'Work package PUNI - Puni remote' }));
      vi.mocked(routes.workPackages).mockResolvedValue(
        success({ workPackages: [other], nextCursor: null }),
      );
      fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev, PUNI' } });
      fireEvent.click(await screen.findByRole(role, { name: 'Work package PUNI - Other holder' }));
      fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev, PUNI.080.s1-dev' } });
      if (customize) {
        fireEvent.click(
          await screen.findByRole('button', { name: 'Customize PUNI.080.s1-dev - Remote build' }),
        );
        await waitFor(() => {
          expect(screen.getByRole<HTMLButtonElement>('button', { name: /^Add$/ }).disabled).toBe(
            false,
          );
        });
        fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
      } else
        fireEvent.click(await screen.findByRole(role, { name: 'PUNI.080.s1-dev - Remote build' }));
      await waitFor(() => {
        expect(box.value).toBe('PUNI.080.s1-dev, ');
      });
      expect(add.mock.calls.map((call) => call[1].workPackageId)).toEqual(['other']);
      if (phone) {
        fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev' } });
        fireEvent.click(await screen.findByRole(role, { name: 'PUNI.080.s1-dev - Remote build' }));
      } else fireEvent.keyDown(box, { key: 'Enter' });
      await waitFor(() => {
        expect(add).toHaveBeenCalledTimes(2);
      });
      expect(add.mock.calls.map((call) => call[1].workPackageId)).toEqual(['other', 'remote']);
      expect(routes.workPackages).toHaveBeenCalledTimes(2);
    });

it('round2 deliberate reselection after ambiguous duplicate deletion restores one pinned occurrence', async () => {
  const { box, add, routes } = await mount();
  const other = { ...workPackage, workPackageId: 'other', name: 'Other holder' };
  vi.mocked(routes.candidates).mockImplementation((workPackageId) =>
    Promise.resolve(
      success({
        workPackage: workPackageId === 'remote' ? workPackage : other,
        addressRevision: 'r1',
        candidates: [{ ...node, workPackageId }],
        nextCursor: null,
      }),
    ),
  );
  vi.mocked(routes.resolve).mockImplementation((workPackageId) =>
    Promise.resolve(
      success({
        workPackageId,
        endpoint: node.endpoint,
        reference: node.reference,
        addressRevision: 'r1',
      }),
    ),
  );
  fireEvent.change(box, { target: { value: 'PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Puni remote' }));
  vi.mocked(routes.workPackages).mockResolvedValue(
    success({ workPackages: [other], nextCursor: null }),
  );
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev, PUNI' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Other holder' }));
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev, PUNI.080.s1-dev,' } });
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev,' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(
    await screen.findByText('These were refused: PUNI.080.s1-dev (choose a work package).'),
  ).toBeDefined();
  expect(add).not.toHaveBeenCalled();
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Work package PUNI - Other holder' }));
  fireEvent.change(box, { target: { value: 'PUNI.080.s1-dev,' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => {
    expect(add).toHaveBeenCalledTimes(1);
  });
  expect(add.mock.calls[0][1]).toEqual(expect.objectContaining({ workPackageId: 'other' }));
});
