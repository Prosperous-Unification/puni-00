import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  DependencyLookup,
  WorkPackageDiscoveryReply,
} from '@/modules/dependency-lookup/contract';

import { DependencyOptions } from './dependency-options';
import { useDependencySearch } from './use-dependency-search';

function lookup(): DependencyLookup {
  return {
    discoverWorkPackages: vi.fn().mockResolvedValue({
      kind: 'success',
      body: {
        workPackages: [
          { workPackageId: 'remote', abbreviation: 'PUNI', name: 'Puni work package' },
        ],
        nextCursor: null,
      },
    }),
    searchEndpoints: vi.fn().mockResolvedValue({
      kind: 'success',
      body: {
        workPackage: { workPackageId: 'remote', abbreviation: 'PUNI', name: 'Puni work package' },
        addressRevision: 'r1',
        candidates: [],
        nextCursor: null,
      },
    }),
    resolveReference: vi.fn(),
  };
}
function Field({ service }: { service: DependencyLookup }) {
  const [typed, setTyped] = useState('');
  const search = useDependencySearch({
    lookup: service,
    workPackageId: 'local',
    ownerId: 'successor',
    active: true,
    typed,
    setTyped,
    localEntries: [
      {
        id: 'local-row',
        number: '010',
        name: 'Puni local title',
        status: 'unknown',
        parentId: null,
        dependsOn: [],
      },
    ],
  });
  return (
    <>
      <input
        aria-label="Dependency"
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
      />
      <DependencyOptions search={search} onChoose={vi.fn()} onCustomize={vi.fn()} />
    </>
  );
}
async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
}
afterEach(() => {
  vi.useRealTimers();
});

describe('mounted dependency lookup', () => {
  it('empty numeric and local step tokens never request work packages', async () => {
    vi.useFakeTimers();
    const service = lookup();
    render(<Field service={service} />);
    for (const token of ['', '080', '010.s1-dev']) {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: token } });
      await tick();
    }
    expect(service.discoverWorkPackages).not.toHaveBeenCalled();
  });
  it('shows work packages alongside local title matches after debounce and selecting only scopes lookup', async () => {
    vi.useFakeTimers();
    const service = lookup();
    render(<Field service={service} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '010,  puni' } });
    expect(service.discoverWorkPackages).not.toHaveBeenCalled();
    expect(screen.getByRole('option', { name: '010 - Puni local title' })).toBeDefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(199);
    });
    expect(service.discoverWorkPackages).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    fireEvent.click(screen.getByRole('option', { name: 'Work package PUNI - Puni work package' }));
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('010,  PUNI.');
    await tick();
    expect(service.searchEndpoints).toHaveBeenCalledWith(
      'remote',
      '',
      null,
      expect.any(AbortSignal),
    );
  });
  it('late alphabetic response cannot populate 080 even if transport ignores cancellation', async () => {
    vi.useFakeTimers();
    const service = lookup();
    let answer: ((reply: WorkPackageDiscoveryReply) => void) | undefined;
    vi.mocked(service.discoverWorkPackages).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    render(<Field service={service} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PUNI' } });
    await tick();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '080' } });
    if (answer === undefined) throw new Error('Request not sent');
    await act(async () => {
      answer?.({
        kind: 'success',
        body: {
          workPackages: [
            { workPackageId: 'remote', abbreviation: 'PUNI', name: 'Stale work package' },
          ],
          nextCursor: null,
        },
      });
      await Promise.resolve();
    });
    expect(screen.queryByText('Stale work package')).toBeNull();
    expect(screen.queryByRole('option', { name: /WorkPackage PUNI/ })).toBeNull();
  });
  it('failed lookup renders retry instead of an empty result', async () => {
    vi.useFakeTimers();
    const service = lookup();
    vi.mocked(service.discoverWorkPackages).mockResolvedValueOnce({
      kind: 'failure',
      failure: { code: 'transport', cause: 'offline' },
    });
    render(<Field service={service} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PUNI' } });
    await tick();
    expect(screen.getByRole('button', { name: 'Retry lookup' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Retry lookup' }));
    await tick();
    expect(screen.getByRole('option', { name: /WorkPackage PUNI/ })).toBeDefined();
  });
  it('unmount cancels lookup', async () => {
    vi.useFakeTimers();
    const service = lookup();
    vi.mocked(service.discoverWorkPackages).mockImplementation(() => new Promise(() => undefined));
    const mounted = render(<Field service={service} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PUNI' } });
    await tick();
    const signal = vi.mocked(service.discoverWorkPackages).mock.calls[0]?.[2];
    mounted.unmount();
    expect(signal?.aborted).toBe(true);
  });
});

it('hides old alphabetic options synchronously when the current question changes', async () => {
  vi.useFakeTimers();
  const service = lookup();
  render(<Field service={service} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PUNI' } });
  await tick();
  expect(screen.getByRole('option', { name: /WorkPackage PUNI/ })).toBeDefined();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'OTHER' } });
  expect(screen.queryByRole('option', { name: /WorkPackage PUNI/ })).toBeNull();
});

it('an older ignored-abort answer cannot erase a newer ready question', async () => {
  vi.useFakeTimers();
  const service = lookup();
  let answer: ((reply: WorkPackageDiscoveryReply) => void) | undefined;
  vi.mocked(service.discoverWorkPackages)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    )
    .mockResolvedValueOnce({
      kind: 'success',
      body: {
        workPackages: [{ workPackageId: 'new', abbreviation: 'NEW', name: 'New question' }],
        nextCursor: null,
      },
    });
  render(<Field service={service} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'OLD' } });
  await tick();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'NEW' } });
  await tick();
  expect(screen.getByRole('option', { name: 'Work package NEW - New question' })).toBeDefined();
  if (answer === undefined) throw new Error('Old request not sent');
  await act(async () => {
    answer?.({ kind: 'success', body: { workPackages: [], nextCursor: null } });
    await Promise.resolve();
  });
  expect(screen.getByRole('option', { name: 'Work package NEW - New question' })).toBeDefined();
});

it('explicit More refuses endpoint pages from another revision and keeps scopes distinct', async () => {
  vi.useFakeTimers();
  const service = lookup();
  const workPackage = { workPackageId: 'remote', abbreviation: 'PUNI', name: 'Puni work package' };
  vi.mocked(service.searchEndpoints)
    .mockResolvedValueOnce({
      kind: 'success',
      body: {
        workPackage,
        addressRevision: 'r1',
        candidates: [
          {
            workPackageId: 'remote',
            workItemId: 'a',
            number: '080',
            name: 'Build',
            endpoint: { scope: 'whole', workItemId: 'a' },
            reference: 'PUNI.080',
          },
          {
            workPackageId: 'remote',
            workItemId: 'a',
            number: '080',
            name: 'Build',
            endpoint: { scope: 'node', workItemId: 'a', stepId: 'dev' },
            reference: 'PUNI.080.s1-dev',
            step: { id: 'dev', code: 'DEV', name: 'Dev', position: 0, ordinal: 1 },
          },
          {
            workPackageId: 'remote',
            workItemId: 'a',
            number: '080',
            name: 'Build',
            endpoint: { scope: 'descendant-step', workItemId: 'a', stepId: 'dev' },
            step: { id: 'dev', code: 'DEV', name: 'Dev', position: 0, ordinal: 1 },
            reference: null,
          },
        ],
        nextCursor: 'page2',
      },
    })
    .mockResolvedValueOnce({
      kind: 'success',
      body: {
        workPackage,
        addressRevision: 'r2',
        candidates: [
          {
            workPackageId: 'remote',
            workItemId: 'b',
            number: '090',
            name: 'Changed',
            endpoint: { scope: 'whole', workItemId: 'b' },
            reference: 'PUNI.090',
          },
        ],
        nextCursor: null,
      },
    });
  render(<Field service={service} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PUNI' } });
  await tick();
  fireEvent.click(screen.getByRole('option', { name: /WorkPackage PUNI/ }));
  await tick();
  expect(screen.getByRole('option', { name: 'PUNI.080 - Build' })).toBeDefined();
  expect(screen.getByRole('option', { name: 'PUNI.080.s1-dev - Build' })).toBeDefined();
  expect(
    screen.getByRole('option', { name: 'PUNI.080 · Dev (all descendants) - Build' }),
  ).toBeDefined();
  expect(service.searchEndpoints).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'More choices' }));
  await tick();
  expect(service.searchEndpoints).toHaveBeenLastCalledWith(
    'remote',
    '',
    'page2',
    expect.any(AbortSignal),
  );
  expect(screen.getByRole('button', { name: 'Refresh choices' })).toBeDefined();
  expect(screen.queryByRole('option', { name: 'PUNI.090 - Changed' })).toBeNull();
});

it('qualified discovery uses the first-dot abbreviation and numeric replacement clears chosen scope', async () => {
  vi.useFakeTimers();
  const service = lookup();
  render(<Field service={service} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PUNI-CORE.080.39' } });
  await tick();
  expect(service.discoverWorkPackages).toHaveBeenCalledWith(
    'PUNI-CORE',
    null,
    expect.any(AbortSignal),
  );
  fireEvent.click(screen.getByRole('option', { name: /WorkPackage PUNI/ }));
  await tick();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '080' } });
  await tick();
  expect(service.discoverWorkPackages).toHaveBeenCalledTimes(1);
  expect(service.searchEndpoints).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PUNI' } });
  await tick();
  expect(service.discoverWorkPackages).toHaveBeenCalledTimes(2);
});

it('rejects candidate evidence for a different stable work package', async () => {
  vi.useFakeTimers();
  const service = lookup();
  vi.mocked(service.searchEndpoints).mockResolvedValue({
    kind: 'success',
    body: {
      workPackage: { workPackageId: 'other', abbreviation: 'PUNI', name: 'Reused address' },
      addressRevision: 'r1',
      candidates: [],
      nextCursor: null,
    },
  });
  render(<Field service={service} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PUNI' } });
  await tick();
  fireEvent.click(screen.getByRole('option', { name: /WorkPackage PUNI/ }));
  await tick();
  expect(screen.getByRole('button', { name: 'Refresh choices' })).toBeDefined();
  expect(screen.queryByText('No matching dependency choices.')).toBeNull();
});

it('replacement lookup requires a deliberate work package choice before using retained selected scope', async () => {
  vi.useFakeTimers();
  const service = lookup();
  const mounted = render(<Field service={service} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PUNI' } });
  await tick();
  fireEvent.click(screen.getByRole('option', { name: 'Work package PUNI - Puni work package' }));
  await tick();
  const replacement = lookup();
  mounted.rerender(<Field service={replacement} />);
  await tick();
  expect(replacement.searchEndpoints).not.toHaveBeenCalled();
  expect(replacement.discoverWorkPackages).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('option', { name: 'Work package PUNI - Puni work package' }));
  await tick();
  expect(replacement.searchEndpoints).toHaveBeenCalledWith(
    'remote',
    '',
    null,
    expect.any(AbortSignal),
  );
});
