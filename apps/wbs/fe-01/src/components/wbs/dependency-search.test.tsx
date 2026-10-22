import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DependencyLookup, ProjectDiscoveryReply } from '@/modules/dependency-lookup/contract';

import { DependencyOptions } from './dependency-options';
import { useDependencySearch } from './use-dependency-search';

function lookup(): DependencyLookup {
  return {
    discoverProjects: vi.fn().mockResolvedValue({
      kind: 'success',
      body: {
        projects: [{ projectId: 'remote', abbreviation: 'PUNI', name: 'Puni project' }],
        nextCursor: null,
      },
    }),
    searchEndpoints: vi.fn().mockResolvedValue({
      kind: 'success',
      body: {
        project: { projectId: 'remote', abbreviation: 'PUNI', name: 'Puni project' },
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
    projectId: 'local',
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
  it('empty numeric and local step tokens never request projects', async () => {
    vi.useFakeTimers();
    const service = lookup();
    render(<Field service={service} />);
    for (const token of ['', '080', '010.s1-dev']) {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: token } });
      await tick();
    }
    expect(service.discoverProjects).not.toHaveBeenCalled();
  });
  it('shows projects alongside local title matches after debounce and selecting only scopes lookup', async () => {
    vi.useFakeTimers();
    const service = lookup();
    render(<Field service={service} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '010,  puni' } });
    expect(service.discoverProjects).not.toHaveBeenCalled();
    expect(screen.getByRole('option', { name: '010 - Puni local title' })).toBeDefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(199);
    });
    expect(service.discoverProjects).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    fireEvent.click(screen.getByRole('option', { name: 'Project PUNI - Puni project' }));
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
    let answer: ((reply: ProjectDiscoveryReply) => void) | undefined;
    vi.mocked(service.discoverProjects).mockImplementation(
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
          projects: [{ projectId: 'remote', abbreviation: 'PUNI', name: 'Stale project' }],
          nextCursor: null,
        },
      });
      await Promise.resolve();
    });
    expect(screen.queryByText('Stale project')).toBeNull();
    expect(screen.queryByRole('option', { name: /Project PUNI/ })).toBeNull();
  });
  it('failed lookup renders retry instead of an empty result', async () => {
    vi.useFakeTimers();
    const service = lookup();
    vi.mocked(service.discoverProjects).mockResolvedValueOnce({
      kind: 'failure',
      failure: { code: 'transport', cause: 'offline' },
    });
    render(<Field service={service} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PUNI' } });
    await tick();
    expect(screen.getByRole('button', { name: 'Retry lookup' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Retry lookup' }));
    await tick();
    expect(screen.getByRole('option', { name: /Project PUNI/ })).toBeDefined();
  });
  it('unmount cancels lookup', async () => {
    vi.useFakeTimers();
    const service = lookup();
    vi.mocked(service.discoverProjects).mockImplementation(() => new Promise(() => undefined));
    const mounted = render(<Field service={service} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PUNI' } });
    await tick();
    const signal = vi.mocked(service.discoverProjects).mock.calls[0]?.[2];
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
  expect(screen.getByRole('option', { name: /Project PUNI/ })).toBeDefined();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'OTHER' } });
  expect(screen.queryByRole('option', { name: /Project PUNI/ })).toBeNull();
});

it('an older ignored-abort answer cannot erase a newer ready question', async () => {
  vi.useFakeTimers();
  const service = lookup();
  let answer: ((reply: ProjectDiscoveryReply) => void) | undefined;
  vi.mocked(service.discoverProjects)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    )
    .mockResolvedValueOnce({
      kind: 'success',
      body: {
        projects: [{ projectId: 'new', abbreviation: 'NEW', name: 'New question' }],
        nextCursor: null,
      },
    });
  render(<Field service={service} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'OLD' } });
  await tick();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'NEW' } });
  await tick();
  expect(screen.getByRole('option', { name: 'Project NEW - New question' })).toBeDefined();
  if (answer === undefined) throw new Error('Old request not sent');
  await act(async () => {
    answer?.({ kind: 'success', body: { projects: [], nextCursor: null } });
    await Promise.resolve();
  });
  expect(screen.getByRole('option', { name: 'Project NEW - New question' })).toBeDefined();
});

it('explicit More refuses endpoint pages from another revision and keeps scopes distinct', async () => {
  vi.useFakeTimers();
  const service = lookup();
  const project = { projectId: 'remote', abbreviation: 'PUNI', name: 'Puni project' };
  vi.mocked(service.searchEndpoints)
    .mockResolvedValueOnce({
      kind: 'success',
      body: {
        project,
        addressRevision: 'r1',
        candidates: [
          {
            projectId: 'remote',
            workItemId: 'a',
            number: '080',
            name: 'Build',
            endpoint: { scope: 'whole', workItemId: 'a' },
            reference: 'PUNI.080',
          },
          {
            projectId: 'remote',
            workItemId: 'a',
            number: '080',
            name: 'Build',
            endpoint: { scope: 'node', workItemId: 'a', stepId: 'dev' },
            reference: 'PUNI.080.s1-dev',
            step: { id: 'dev', code: 'DEV', name: 'Dev', position: 0, ordinal: 1 },
          },
          {
            projectId: 'remote',
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
        project,
        addressRevision: 'r2',
        candidates: [
          {
            projectId: 'remote',
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
  fireEvent.click(screen.getByRole('option', { name: /Project PUNI/ }));
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
  expect(service.discoverProjects).toHaveBeenCalledWith('PUNI-CORE', null, expect.any(AbortSignal));
  fireEvent.click(screen.getByRole('option', { name: /Project PUNI/ }));
  await tick();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '080' } });
  await tick();
  expect(service.discoverProjects).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PUNI' } });
  await tick();
  expect(service.discoverProjects).toHaveBeenCalledTimes(2);
});

it('rejects candidate evidence for a different stable project', async () => {
  vi.useFakeTimers();
  const service = lookup();
  vi.mocked(service.searchEndpoints).mockResolvedValue({
    kind: 'success',
    body: {
      project: { projectId: 'other', abbreviation: 'PUNI', name: 'Reused address' },
      addressRevision: 'r1',
      candidates: [],
      nextCursor: null,
    },
  });
  render(<Field service={service} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'PUNI' } });
  await tick();
  fireEvent.click(screen.getByRole('option', { name: /Project PUNI/ }));
  await tick();
  expect(screen.getByRole('button', { name: 'Refresh choices' })).toBeDefined();
  expect(screen.queryByText('No matching dependency choices.')).toBeNull();
});
