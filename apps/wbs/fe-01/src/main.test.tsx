import { describe, expect, it, vi } from 'vitest';

import { ROOT_FAULT_OPTIONS } from '@/components/chrome/root-fault-options';

/**
 * The real `createRoot`, replaced for this file.
 *
 * `main.tsx` is a module with one side effect — it creates the application's root and
 * renders into it — so the only way to assert what it passes is to be the thing it calls.
 * `render` is a no-op here on purpose: what is under test is the root's construction, not
 * the tree, which every other suite in this app already covers.
 */
const createRoot = vi.hoisted(() =>
  vi.fn((_container: Element | DocumentFragment, _options?: unknown) => ({
    render: vi.fn(),
    unmount: vi.fn(),
  })),
);

vi.mock('react-dom/client', () => ({ createRoot }));

describe('the application’s root', () => {
  it('is created with the options that keep a fault out of the console', async () => {
    // Without this case the whole disclosure rule is one deleted argument away from being
    // undone with every other test still green: `ROOT_FAULT_OPTIONS` can be complete and
    // correct while nothing passes it to the root the application actually runs in.
    document.body.innerHTML = '<div id="root"></div>';

    await import('./main');

    expect(createRoot).toHaveBeenCalledTimes(1);
    expect(createRoot.mock.calls[0][0]).toBe(document.getElementById('root'));
    expect(createRoot.mock.calls[0][1]).toBe(ROOT_FAULT_OPTIONS);
    // 30 seconds and not Vitest's 5: `await import('./main')` transforms `main.tsx`, the
    // whole `App` graph under it and `styles.css` through Vite inside the test body, and
    // that took longer than 5000ms on every run of a loaded host (watched twice,
    // 2026-09-21, `Error: Test timed out in 5000ms.`).
  }, 30_000);
});
