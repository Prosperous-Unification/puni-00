import { afterEach, describe, expect, it, vi } from 'vitest';

import { readAddableMethods, startMethodLink } from './add-sign-in-method';

const response = (status: number, body: unknown) => Response.json(body, { status });
const signal = () => new AbortController().signal;

/** Answers each path from a table, recording what was sent. */
function serve(table: Readonly<Partial<Record<string, () => Response>>>) {
  const sent: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      sent.push({ path, body });
      const answer = table[path];
      return Promise.resolve(answer === undefined ? response(404, {}) : answer());
    }),
  );
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readAddableMethods', () => {
  it('offers the enabled methods the account has not linked, in catalogue order', async () => {
    serve({
      '/api/auth/methods': () =>
        response(200, {
          methods: [
            { id: 'google', label: 'Continue with Google' },
            { id: 'github', label: 'Continue with GitHub' },
            { id: 'email', label: 'Continue with an email code' },
          ],
        }),
      '/api/auth/me': () =>
        response(200, {
          user: { id: 'g', username: 'g', scopes: ['read'], linkedMethods: ['google'] },
        }),
    });
    // Proof: 2026-10-11, not subtracting the linked methods made this offer
    // google again.
    expect(await readAddableMethods(signal())).toEqual({
      kind: 'ready',
      methods: ['github', 'email'],
    });
  });

  it('offers nothing it cannot read, and says so in its answer', async () => {
    serve({ '/api/auth/methods': () => response(502, {}) });
    expect(await readAddableMethods(signal())).toEqual({ kind: 'failed' });
  });
});

describe('startMethodLink', () => {
  it('posts the method alone and leaves for the provider', async () => {
    const sent = serve({
      '/api/auth/link/auth0': () =>
        response(200, { location: 'https://tenant.test/authorize?connection=github' }),
    });
    expect(await startMethodLink('github')).toEqual({
      kind: 'leave',
      url: 'https://tenant.test/authorize?connection=github',
    });
    expect(sent).toEqual([{ path: '/api/auth/link/auth0', body: { method: 'github' } }]);
  });

  it('words each refusal instead of leaving', async () => {
    const answers: [number, string, string][] = [
      [
        401,
        'invalid_credentials',
        'Sign in with Google, GitHub or an email code to add another method, or link from onboarding with your password.',
      ],
      [403, 'onboarding_inactive', 'Adding sign-in methods is not available yet.'],
      [429, 'invalid_credentials', 'Too many attempts. Wait a few minutes and try again.'],
      [400, 'invalid_body', 'Could not start adding that method. Reload and try again.'],
    ];
    for (const [status, error, words] of answers) {
      serve({ '/api/auth/link/auth0': () => response(status, { error }) });
      expect(await startMethodLink('google')).toEqual({ kind: 'message', text: words });
    }
  });
});
