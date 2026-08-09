import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as Api from '@/lib/api';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/**
 * `loadSession`, replaceable per test.
 *
 * It is the first thing `App` touches and the only seam between the app and the
 * browser that does not need a server: a stored session that cannot be read is
 * a fault in `App`'s own effect, which is exactly the part of the tree a
 * boundary around only the signed-in branch would not have covered. The rest of
 * the module stays real — `AuthForm` imports from it too.
 */
const loadSession = vi.hoisted(() => vi.fn<[], Api.Session | null>(() => null));

/**
 * `login`, so a test can put an account in without a server.
 *
 * The rest of the sign-in stays real — the form, its submit, `saveSession` —
 * because what is being asserted is where the app lands **after** the session
 * arrives, and a stubbed `AuthForm` would decide that question by itself.
 */
const login = vi.hoisted(() =>
  vi.fn<[string, string], Promise<Api.Session>>(() =>
    Promise.resolve({ token: 'tok', user: { id: 'u1', username: 'kat' } }),
  ),
);

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  loadSession,
  login,
}));

const { App } = await import('./app');

const muteConsoleError = () =>
  // React writes a caught error to `console.error` whatever a boundary does.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

let logged: ReturnType<typeof muteConsoleError>;

beforeEach(() => {
  loadSession.mockReturnValue(null);
  logged = muteConsoleError();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
  logged.mockRestore();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('the app root', () => {
  itDom('shows the sign-in form when there is no stored session', async () => {
    render(<App />);

    // The boundary is transparent when nothing throws: the app it wraps is
    // what renders, and this is what says so.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'WBS tool v2' })).toBeDefined();
    });
    expect(document.querySelector('[data-app-fault]')).toBeNull();
  });

  itDom('renders the fault page instead of an empty document when the app throws', async () => {
    // F7, observed live 2026-08-09: React logged "Consider adding an error
    // boundary" and `innerHTML` went empty. This is that, through the real
    // `App`: the session check throws, nothing nearer catches it, and what the
    // reader gets is a sentence and a way out rather than a blank page.
    //
    // Proof: `<AppFaultBoundary>` struck from `app.tsx`, leaving `App` as
    // `AppContent` alone. This test failed with the render itself throwing —
    // `Error: the stored session could not be read` out of `render`, not as a
    // failed expectation — and `document.body.innerHTML` empty behind it.
    // Watched 2026-08-09.
    loadSession.mockImplementation(() => {
      throw new Error('the stored session could not be read');
    });

    render(<App />);

    await waitFor(() => {
      expect(document.querySelector('[data-app-fault]')).not.toBeNull();
    });
    expect(screen.getByRole('alert').textContent).toContain('the stored session could not be read');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDefined();
    expect(document.body.innerHTML).not.toBe('');
  });
});

/**
 * The gate, and the address it is asked for while it is shut.
 *
 * Both halves are here rather than in `app-router.test.tsx` because the claim
 * is about the **order** of the two: the router is mounted inside the branch
 * the gate already chose, so a signed-out visitor gets the form at every
 * address, and nothing rewrites the address on the way in.
 */
describe('a signed-in address asked for while signed out', () => {
  itDom('draws the sign-in form and no directory', async () => {
    window.history.replaceState({}, '', '/directory');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Log in' })).toBeDefined();
    });
    // The whole of the negative below: with the router hoisted above the gate,
    // this heading is on screen for somebody with no session at all.
    expect(screen.queryByRole('heading', { name: 'Directory' })).toBeNull();
    expect(window.location.pathname).toBe('/directory');
  });

  /**
   * Proof: the router hoisted above the gate — `app.tsx`'s
   * `if (session === null)` branch made unreachable so `<AppRouter>` is
   * mounted whether or not there is a session, the token passed as
   * `session?.token ?? ''` — and **both** tests in this block were watched
   * failing on `Unable to find role="button" and name "Log in"`, the directory
   * drawn to a visitor holding no session at all. Restored. Watched
   * 2026-08-09.
   */
  itDom('honours the address it was opened at, once the account is in', async () => {
    window.history.replaceState({}, '', '/directory');
    // The directory page reads on arrival; it is the page under the address
    // rather than the subject here, so its two reads answer empty.
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        Promise.resolve(
          new Response(JSON.stringify(path.includes('/people') ? { people: [] } : { teams: [] }), {
            status: 200,
          }),
        ),
      ),
    );

    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Log in' })).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'kat' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    // The page that was asked for, not the project — and the address it was
    // asked at, unrewritten.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Directory' })).toBeDefined();
    });
    expect(screen.queryByRole('combobox', { name: 'Project' })).toBeNull();
    expect(window.location.pathname).toBe('/directory');
  });
});
