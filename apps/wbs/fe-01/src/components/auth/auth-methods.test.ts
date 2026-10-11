import { afterEach, describe, expect, it, vi } from 'vitest';

import { readAuthMethods } from './auth-methods';

const response = (status: number, body: unknown) => Response.json(body, { status });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readAuthMethods', () => {
  it('answers the enabled methods in the order the server gave', async () => {
    const fetched = vi.fn((_url: string) =>
      Promise.resolve(
        response(200, {
          methods: [
            { id: 'google', label: 'Continue with Google' },
            { id: 'email', label: 'Continue with an email code' },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetched);
    await expect(readAuthMethods(new AbortController().signal)).resolves.toEqual({
      kind: 'ready',
      methods: ['google', 'email'],
    });
    expect(fetched.mock.calls[0]?.[0]).toBe('/api/auth/methods');
  });

  it('carries no list when the read fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    await expect(readAuthMethods(new AbortController().signal)).resolves.toEqual({
      kind: 'failed',
    });
  });

  it('never answers a method outside the catalogue', async () => {
    // Proof: 2026-10-11, reading the reply as raw JSON instead of through the
    // shape-derived client made this answer `ready` with `facebook`.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          response(200, { methods: [{ id: 'facebook', label: 'Continue with Facebook' }] }),
        ),
      ),
    );
    await expect(readAuthMethods(new AbortController().signal)).resolves.toEqual({
      kind: 'failed',
    });
  });
});
