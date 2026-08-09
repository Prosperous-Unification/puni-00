import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
const loadSession = vi.hoisted(() => vi.fn<() => Api.Session | null>(() => null));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  loadSession,
}));

const { App } = await import('./app');

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  loadSession.mockReturnValue(null);
  // React writes a caught error to `console.error` whatever a boundary does.
  logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  logged.mockRestore();
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
