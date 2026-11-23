import { describe, expect, it, vi } from 'vitest';

import type { WorkPackageAddressApi } from '@/lib/wbs-api';

import { openDependencyLookup } from './dependency-lookup.feature';

const workPackages = {
  workPackages: [{ workPackageId: 'remote', abbreviation: 'PUNI', name: 'Puni' }],
  nextCursor: null,
};
const success = <T>(body: T) => ({
  kind: 'success' as const,
  representation: 'json' as const,
  status: 200 as const,
  body,
  headers: new Headers(),
});
function routes(): WorkPackageAddressApi {
  return {
    workPackages: vi.fn().mockResolvedValue(success(workPackages)),
    candidates: vi.fn(),
    resolve: vi.fn(),
  };
}

describe('dependency lookup lifetime', () => {
  it('opens without reads and bounds every deliberate page to 25', async () => {
    const api = routes();
    const opened = openDependencyLookup({
      workPackageId: 'local',
      isCurrent: () => true,
      routes: api,
    });
    expect(api.workPackages).not.toHaveBeenCalled();
    expect(await opened.lookup.discoverWorkPackages('pu', 'page2')).toEqual({
      kind: 'success',
      body: workPackages,
    });
    expect(api.workPackages).toHaveBeenCalledWith(
      { q: 'pu', limit: '25', cursor: 'page2' },
      expect.any(AbortSignal),
    );
    opened.close();
  });

  it('withdrawal sends nothing and never publishes an earlier ignored-abort answer', async () => {
    const api = routes();
    let current = true;
    let answer:
      ((reply: Awaited<ReturnType<WorkPackageAddressApi['workPackages']>>) => void) | undefined;
    vi.mocked(api.workPackages).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const opened = openDependencyLookup({
      workPackageId: 'local',
      isCurrent: () => current,
      routes: api,
    });
    const pending = opened.lookup.discoverWorkPackages('pu', null);
    current = false;
    const retained = opened.lookup.discoverWorkPackages('pu', null);
    expect(api.workPackages).toHaveBeenCalledTimes(1);
    expect(await retained).toEqual({ kind: 'cancelled' });
    if (answer === undefined) throw new Error('Request was not started');
    answer(success(workPackages));
    expect(await pending).toEqual({ kind: 'cancelled' });
    opened.close();
  });

  it('close aborts in-flight requests and retained service cannot send', async () => {
    const api = routes();
    vi.mocked(api.workPackages).mockImplementation(
      (_query, signal) =>
        new Promise((resolve) => {
          signal?.addEventListener('abort', () => {
            resolve({ kind: 'failure', failure: { code: 'cancelled' } });
          });
        }),
    );
    const opened = openDependencyLookup({
      workPackageId: 'local',
      isCurrent: () => true,
      routes: api,
    });
    const pending = opened.lookup.discoverWorkPackages('pu', null);
    const signal = vi.mocked(api.workPackages).mock.calls[0]?.[1];
    opened.close();
    expect(signal?.aborted).toBe(true);
    expect(await pending).toEqual({ kind: 'cancelled' });
    const retained = opened.lookup.discoverWorkPackages('pu', null);
    expect(api.workPackages).toHaveBeenCalledTimes(1);
    expect(await retained).toEqual({ kind: 'cancelled' });
  });

  it('forwards caller cancellation and preserves typed refusals and boundary failure', async () => {
    const api = routes();
    const opened = openDependencyLookup({
      workPackageId: 'local',
      isCurrent: () => true,
      routes: api,
    });
    vi.mocked(api.workPackages).mockResolvedValue({
      kind: 'refusal',
      representation: 'json',
      status: 400,
      body: { error: 'invalid_query' },
      headers: new Headers(),
    });
    expect(await opened.lookup.discoverWorkPackages('pu', null)).toEqual({
      kind: 'refusal',
      status: 400,
      body: { error: 'invalid_query' },
    });
    vi.mocked(api.workPackages).mockResolvedValue({
      kind: 'failure',
      failure: { code: 'invalid_request', part: 'query' },
    });
    expect(await opened.lookup.discoverWorkPackages('pu', null)).toEqual({
      kind: 'failure',
      failure: { code: 'invalid_request', part: 'query' },
    });
    const controller = new AbortController();
    controller.abort();
    expect(await opened.lookup.discoverWorkPackages('pu', null, controller.signal)).toEqual({
      kind: 'cancelled',
    });
    expect(api.workPackages).toHaveBeenCalledTimes(2);
    opened.close();
  });
});

it('caller cancellation rejects a late success even when the private transport ignores abort', async () => {
  const api = routes();
  let answer:
    ((reply: Awaited<ReturnType<WorkPackageAddressApi['workPackages']>>) => void) | undefined;
  vi.mocked(api.workPackages).mockImplementation(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  const opened = openDependencyLookup({
    workPackageId: 'local',
    isCurrent: () => true,
    routes: api,
  });
  const controller = new AbortController();
  const pending = opened.lookup.discoverWorkPackages('pu', null, controller.signal);
  controller.abort();
  if (answer === undefined) throw new Error('Request not sent');
  answer(success(workPackages));
  expect(await pending).toEqual({ kind: 'cancelled' });
  opened.close();
});
