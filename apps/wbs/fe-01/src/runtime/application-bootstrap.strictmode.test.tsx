import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/app';
import type { BrowserStorage } from '@/modules/preferences/contract';
import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';

import { bootstrapApplication } from './application-bootstrap';
import { type ApplicationServices, installApplicationRuntime } from './application-runtime';
import { createLifetimeSlot, type LifetimeSlot } from './lifetime-slot';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/** What a real mount acquired, counted where production acquires it. */
interface Counted {
  readonly acquire: () => ReturnType<typeof installApplicationRuntime>;
  readonly runtimes: () => number;
  readonly stores: () => number;
}

/**
 * The production installation, counted twice over.
 *
 * Two numbers and not one, because the map's lifecycle test 1 asks for both: how
 * many times the page's runtime was built, and how many times the resource it owns
 * was acquired. A runtime built inside the tree moves the first; a resource resolved
 * inside a component or a lazy initialiser moves the second.
 */
function countedAcquisition(): Counted {
  let runtimes = 0;
  let stores = 0;
  const openStore = (): BrowserStorage => {
    stores += 1;
    return fakeBrowserStorage();
  };
  return {
    runtimes: () => runtimes,
    stores: () => stores,
    acquire: () => {
      runtimes += 1;
      return installApplicationRuntime({ openStore });
    },
  };
}

/**
 * The app's own first effect fetches the signed-in identity; jsdom has no server.
 *
 * Named helpers rather than `ReturnType<typeof vi.spyOn>`: that type is `any` for a
 * two-argument `spyOn`, and every `.mockRestore` under it is an
 * `@typescript-eslint/no-unsafe-member-access` error (observed 2026-09-22).
 */
const refuseFetch = () => vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no server'));
const muteConsoleError = () =>
  vi.spyOn(console, 'error').mockImplementation(() => {
    return undefined;
  });

let fetching: ReturnType<typeof refuseFetch>;
let logged: ReturnType<typeof muteConsoleError>;

beforeEach(() => {
  fetching = refuseFetch();
  logged = muteConsoleError();
});

afterEach(() => {
  fetching.mockRestore();
  logged.mockRestore();
});

describe('the page under Strict Mode', () => {
  /**
   * The map's lifecycle test 1, with a real React root.
   *
   * A recording root cannot answer this: it never mounts its tree, so Strict Mode's
   * double invocation never happens and a runtime built inside the tree would be
   * counted once. This mounts the real `App` through the real `createRoot`, inside
   * `<StrictMode>`, and counts what production counted.
   */
  itDom(
    'acquires its runtime once, above the tree that is mounted twice',
    async () => {
      const host = document.createElement('div');
      document.body.append(host);
      const counted = countedAcquisition();
      const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>(50);

      await act(async () => {
        await bootstrapApplication(host, {
          acquire: counted.acquire,
          slot,
          mount: (element, options) => createRoot(element, options),
          app: App,
          eventTarget: new EventTarget(),
        });
      });

      // The tree really mounted, or the counts below would be about nothing.
      expect(host.innerHTML).not.toBe('');
      expect(counted.runtimes()).toBe(1);
      expect(counted.stores()).toBe(1);
      expect(slot.snapshot().status).toBe('live');
    },
    30_000,
  );
});
