import { describe, expect, it, vi } from 'vitest';

import { type BrowserSignOutState, createBrowserSignOut } from './browser-sign-out';

const acknowledged = {
  kind: 'success',
  representation: 'empty',
  status: 204,
  headers: new Headers(),
} as const;
const refused = {
  kind: 'refusal',
  representation: 'json',
  status: 401,
  body: { error: 'unauthenticated' },
  headers: new Headers(),
} as const;

function deferred<T>() {
  let resolve = (_value: T): void => {
    throw new Error('deferred not initialized');
  };
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('browser sign-out attempt', () => {
  it('withdraws locally and dispatches server logout in the gesture turn, joining either completion order once', async () => {
    for (const order of ['local', 'server'] as const) {
      const local = deferred<'signed-out'>();
      const server = deferred<typeof acknowledged>();
      const events: string[] = [];
      const states: BrowserSignOutState[] = [];
      const logout = vi.fn((_token: string, _signal: AbortSignal) => {
        events.push('server');
        return server.promise;
      });
      const coordinator = createBrowserSignOut({
        logout,
        publish: (state) => states.push(state),
        budgetMs: 1000,
      });
      coordinator.acceptSession();
      coordinator.start('native-token', () => {
        events.push('exit');
        return local.promise;
      });
      coordinator.start('native-token', () => {
        events.push('second exit');
        return local.promise;
      });
      expect(events).toEqual(['exit', 'server']);
      expect(states).toEqual([{ kind: 'pending' }]);
      if (order === 'local') {
        local.resolve('signed-out');
        await Promise.resolve();
        expect(states).toEqual([{ kind: 'pending' }]);
        server.resolve(acknowledged);
      } else {
        server.resolve(acknowledged);
        await Promise.resolve();
        expect(states).toEqual([{ kind: 'pending' }]);
        local.resolve('signed-out');
      }
      await vi.waitFor(() => {
        expect(states).toEqual([{ kind: 'pending' }, { kind: 'signed-out' }]);
      });
      expect(logout).toHaveBeenCalledTimes(1);
      coordinator.dispose();
    }
  });

  it('never acknowledges a refused, malformed or failed server outcome after local retirement', async () => {
    for (const reply of [
      refused,
      {
        kind: 'refusal',
        representation: 'json',
        status: 403,
        body: { error: 'invalid_origin' },
        headers: new Headers(),
      } as const,
      {
        kind: 'failure',
        failure: {
          code: 'invalid_response',
          reason: 'schema',
          status: 204,
          headers: new Headers(),
        },
      } as const,
      {
        kind: 'failure',
        failure: { code: 'unexpected_status', status: 500, headers: new Headers() },
      } as const,
      { kind: 'failure', failure: { code: 'cancelled' } } as const,
    ]) {
      const states: BrowserSignOutState[] = [];
      const coordinator = createBrowserSignOut({
        logout: () => Promise.resolve(reply),
        publish: (state) => states.push(state),
        budgetMs: 1000,
      });
      coordinator.acceptSession();
      coordinator.start('', () => Promise.resolve('signed-out'));
      await vi.waitFor(() => {
        expect(states.at(-1)?.kind).toBe('failure');
      });
      expect(states).not.toContainEqual({ kind: 'signed-out' });
      coordinator.dispose();
    }
  });

  it('surfaces unexpected adapter and local throws to the boundary', async () => {
    const failed: BrowserSignOutState[] = [];
    const adapterFault = new Error('adapter failed');
    const transport = createBrowserSignOut({
      logout: () => Promise.reject(adapterFault),
      publish: (state) => failed.push(state),
      budgetMs: 1000,
    });
    transport.acceptSession();
    transport.start('', () => Promise.resolve('signed-out'));
    await vi.waitFor(() => {
      expect(failed.at(-1)).toEqual({ kind: 'fault', error: adapterFault });
    });
    transport.dispose();

    const local: BrowserSignOutState[] = [];
    const retirement = createBrowserSignOut({
      logout: () => Promise.resolve(acknowledged),
      publish: (state) => local.push(state),
      budgetMs: 1000,
    });
    retirement.acceptSession();
    const fault = new Error('close failed');
    retirement.start('', () => Promise.reject(fault));
    await vi.waitFor(() => {
      expect(local.at(-1)).toEqual({ kind: 'fault', error: fault });
    });
    retirement.dispose();
  });

  it('suppresses a stale acknowledgment after a newer session or unmount', async () => {
    for (const dispose of [false, true]) {
      const server = deferred<typeof acknowledged>();
      const states: BrowserSignOutState[] = [];
      const request = { signal: new AbortController().signal };
      const coordinator = createBrowserSignOut({
        logout: (_token, signal) => {
          request.signal = signal;
          return server.promise;
        },
        publish: (state) => states.push(state),
        budgetMs: 1000,
      });
      coordinator.acceptSession();
      coordinator.start('', () => Promise.resolve('signed-out'));
      if (dispose) coordinator.dispose();
      else coordinator.acceptSession();
      expect(request.signal.aborted).toBe(true);
      server.resolve(acknowledged);
      await Promise.resolve();
      await Promise.resolve();
      expect(states).not.toContainEqual({ kind: 'signed-out' });
    }
  });

  it('preserves fatal and overtaken local exit outcomes despite server 204', async () => {
    for (const exit of ['fatal', 'overtaken'] as const) {
      const states: BrowserSignOutState[] = [];
      const coordinator = createBrowserSignOut({
        logout: () => Promise.resolve(acknowledged),
        publish: (state) => states.push(state),
        budgetMs: 1000,
      });
      coordinator.acceptSession();
      coordinator.start('', () => Promise.resolve(exit));
      await vi.waitFor(() => {
        expect(states.at(-1)).toEqual({ kind: exit });
      });
      expect(states).not.toContainEqual({ kind: 'signed-out' });
      coordinator.dispose();
    }
  });

  it('bounds a stalled server without treating cancellation as acknowledgment, and still observes local exit', async () => {
    vi.useFakeTimers();
    try {
      const local = deferred<'signed-out'>();
      const states: BrowserSignOutState[] = [];
      const logout = vi.fn(
        (_token: string, _signal: AbortSignal) => new Promise<typeof acknowledged>(() => undefined),
      );
      const coordinator = createBrowserSignOut({
        logout,
        publish: (state) => states.push(state),
        budgetMs: 50,
      });
      coordinator.acceptSession();
      coordinator.start('', () => local.promise);
      await vi.advanceTimersByTimeAsync(50);
      expect(states).toEqual([{ kind: 'pending' }]);
      expect(logout.mock.calls[0]?.[1].aborted).toBe(true);
      local.resolve('signed-out');
      await Promise.resolve();
      await Promise.resolve();
      expect(states.at(-1)).toEqual({ kind: 'failure', reason: 'timeout' });
      coordinator.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
