import { describe, expect, it, vi } from 'vitest';

import type { ProjectAddressApi } from '@/lib/wbs-api';

import { openDependencyLookup } from './dependency-lookup.feature';

const projects = {
  projects: [{ projectId: 'remote', abbreviation: 'PUNI', name: 'Puni' }],
  nextCursor: null,
};
const success = <T>(body: T) => ({
  kind: 'success' as const,
  representation: 'json' as const,
  status: 200 as const,
  body,
  headers: new Headers(),
});
function routes(): ProjectAddressApi {
  return {
    projects: vi.fn().mockResolvedValue(success(projects)),
    candidates: vi.fn(),
    resolve: vi.fn(),
  };
}

describe('dependency lookup lifetime', () => {
  it('opens without reads and bounds every deliberate page to 25', async () => {
    const api = routes();
    const opened = openDependencyLookup({ projectId: 'local', isCurrent: () => true, routes: api });
    expect(api.projects).not.toHaveBeenCalled();
    expect(await opened.lookup.discoverProjects('pu', 'page2')).toEqual({
      kind: 'success',
      body: projects,
    });
    expect(api.projects).toHaveBeenCalledWith(
      { q: 'pu', limit: '25', cursor: 'page2' },
      expect.any(AbortSignal),
    );
    opened.close();
  });

  it('withdrawal sends nothing and never publishes an earlier ignored-abort answer', async () => {
    const api = routes();
    let current = true;
    let answer: ((reply: Awaited<ReturnType<ProjectAddressApi['projects']>>) => void) | undefined;
    vi.mocked(api.projects).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const opened = openDependencyLookup({
      projectId: 'local',
      isCurrent: () => current,
      routes: api,
    });
    const pending = opened.lookup.discoverProjects('pu', null);
    current = false;
    const retained = opened.lookup.discoverProjects('pu', null);
    expect(api.projects).toHaveBeenCalledTimes(1);
    expect(await retained).toEqual({ kind: 'cancelled' });
    if (answer === undefined) throw new Error('Request was not started');
    answer(success(projects));
    expect(await pending).toEqual({ kind: 'cancelled' });
    opened.close();
  });

  it('close aborts in-flight requests and retained service cannot send', async () => {
    const api = routes();
    vi.mocked(api.projects).mockImplementation(
      (_query, signal) =>
        new Promise((resolve) => {
          signal?.addEventListener('abort', () => {
            resolve({ kind: 'failure', failure: { code: 'cancelled' } });
          });
        }),
    );
    const opened = openDependencyLookup({ projectId: 'local', isCurrent: () => true, routes: api });
    const pending = opened.lookup.discoverProjects('pu', null);
    const signal = vi.mocked(api.projects).mock.calls[0]?.[1];
    opened.close();
    expect(signal?.aborted).toBe(true);
    expect(await pending).toEqual({ kind: 'cancelled' });
    const retained = opened.lookup.discoverProjects('pu', null);
    expect(api.projects).toHaveBeenCalledTimes(1);
    expect(await retained).toEqual({ kind: 'cancelled' });
  });

  it('forwards caller cancellation and preserves typed refusals and boundary failure', async () => {
    const api = routes();
    const opened = openDependencyLookup({ projectId: 'local', isCurrent: () => true, routes: api });
    vi.mocked(api.projects).mockResolvedValue({
      kind: 'refusal',
      representation: 'json',
      status: 400,
      body: { error: 'invalid_query' },
      headers: new Headers(),
    });
    expect(await opened.lookup.discoverProjects('pu', null)).toEqual({
      kind: 'refusal',
      status: 400,
      body: { error: 'invalid_query' },
    });
    vi.mocked(api.projects).mockResolvedValue({
      kind: 'failure',
      failure: { code: 'invalid_request', part: 'query' },
    });
    expect(await opened.lookup.discoverProjects('pu', null)).toEqual({
      kind: 'failure',
      failure: { code: 'invalid_request', part: 'query' },
    });
    const controller = new AbortController();
    controller.abort();
    expect(await opened.lookup.discoverProjects('pu', null, controller.signal)).toEqual({
      kind: 'cancelled',
    });
    expect(api.projects).toHaveBeenCalledTimes(2);
    opened.close();
  });
});

it('caller cancellation rejects a late success even when the private transport ignores abort', async () => {
  const api = routes();
  let answer: ((reply: Awaited<ReturnType<ProjectAddressApi['projects']>>) => void) | undefined;
  vi.mocked(api.projects).mockImplementation(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  const opened = openDependencyLookup({ projectId: 'local', isCurrent: () => true, routes: api });
  const controller = new AbortController();
  const pending = opened.lookup.discoverProjects('pu', null, controller.signal);
  controller.abort();
  if (answer === undefined) throw new Error('Request not sent');
  answer(success(projects));
  expect(await pending).toEqual({ kind: 'cancelled' });
  opened.close();
});
