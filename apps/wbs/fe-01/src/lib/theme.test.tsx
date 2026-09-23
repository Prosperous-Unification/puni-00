import { act, cleanup, render, renderHook } from '@testing-library/react';
import { type ReactNode, useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DriveableMediaQueryList } from '../../vitest.setup';
import type { Remembered } from '../modules/preferences/contract';
import {
  fakeBrowserStorage,
  readRefusingBrowserStorage,
  writeRefusingBrowserStorage,
} from '../modules/preferences/fake-browser-storage';
import {
  type ApplicationServices,
  installApplicationRuntime,
} from '../runtime/application-runtime';
import { ApplicationServicesProvider } from '../runtime/application-services-context';
import { createLifetimeSlot, type LifetimeSlot } from '../runtime/lifetime-slot';
import {
  DARK_CLASS,
  DARK_QUERY,
  isThemeChoice,
  paintPalette,
  paletteFor,
  readTheme,
  rememberedTheme,
  systemMedia,
  type Theme,
  THEME_KEY,
  type ThemeChoice,
  useTheme,
} from './theme';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/**
 * The one list the app and this file both hold, so driving it here is felt
 * there. `vitest.setup.ts` caches by query string precisely for this — the cast
 * is to the extra method that stand-in adds, and to nothing else.
 */
const platform = (): DriveableMediaQueryList =>
  window.matchMedia(DARK_QUERY) as DriveableMediaQueryList;

/**
 * Every {@link LifetimeSlot} this file built, retired by this file's own
 * `afterEach` rather than by each test body — so a slot a failed assertion left
 * live is still given back. `retire()` on an already-empty slot is a documented
 * no-op, so retiring one a test retired itself costs nothing, and lifecycle under
 * test stays distinct from fixture teardown.
 */
const builtSlots: LifetimeSlot<ApplicationServices>[] = [];

/** A fresh, tracked slot, `empty` until a test `replace`s it. */
function freshSlot(): LifetimeSlot<ApplicationServices> {
  const slot = createLifetimeSlot<ApplicationServices>(50);
  builtSlots.push(slot);
  return slot;
}

/**
 * A slot `live` over the production installer, its liveness predicate wired
 * exactly as `acquireApplicationRuntime` wires the real one — not
 * `installApplicationRuntime()` bare, whose default `isLive` is always `true` and
 * so could never reproduce a withdrawn access. `store` defaults to a fresh
 * in-memory fake rather than real `localStorage`, so a test can tell the
 * runtime's own store apart from `composition.ts`'s module-load singleton, which
 * always wraps the real one.
 *
 * Awaits the real `replace` promise, so the slot is genuinely `live` on return.
 */
async function liveSlot(
  store: ReturnType<typeof fakeBrowserStorage> = fakeBrowserStorage(),
): Promise<{
  slot: LifetimeSlot<ApplicationServices>;
  store: ReturnType<typeof fakeBrowserStorage>;
}> {
  const slot = freshSlot();
  await slot.replace(() =>
    installApplicationRuntime({
      openStore: () => store,
      isLive: () => slot.snapshot().status === 'live',
    }),
  );
  return { slot, store };
}

/**
 * The same live slot, with its runtime's own disposal **held open** until the
 * returned `release` is called.
 *
 * What it separates is notification from disposal: `retire()` withdraws
 * publication synchronously and notifies from a microtask, and the disposal is a
 * different event that can take as long as it likes. A test that awaits the
 * retirement promise before asserting cannot tell which of the two the hook
 * actually reacted to.
 *
 * The slot's own budget is not at risk: it is passed into DI Bag's `close`, and
 * the wait below happens before that call is ever made.
 */
async function liveSlotHoldingDisposal(
  store: ReturnType<typeof fakeBrowserStorage> = fakeBrowserStorage(),
): Promise<{
  slot: LifetimeSlot<ApplicationServices>;
  store: ReturnType<typeof fakeBrowserStorage>;
  release: () => void;
}> {
  const slot = freshSlot();
  let release = (): void => undefined;
  const disposalGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await slot.replace(() => {
    const installed = installApplicationRuntime({
      openStore: () => store,
      isLive: () => slot.snapshot().status === 'live',
    });
    return {
      services: installed.services,
      close: async (options) => {
        await disposalGate;
        await installed.close(options);
      },
    };
  });
  return { slot, store, release };
}

function wrapperFor(slot: LifetimeSlot<ApplicationServices>) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>;
  }
  return Wrapper;
}

/**
 * A runtime's own theme store, over a fresh, real installation — the runtime path
 * the bare-function cases below now take instead of importing `composition.ts`'s
 * module-load duplicate. Retained and given back after `run`, matching
 * `composition-agreement.test.ts`'s own pattern.
 */
async function withThemeStore<T>(run: (themeStore: Remembered<ThemeChoice>) => T): Promise<T> {
  const installed = installApplicationRuntime();
  try {
    return run(installed.services.remembered.themeChoice(isThemeChoice));
  } finally {
    await installed.close({ timeoutMs: 50 });
  }
}

beforeEach(() => {
  localStorage.removeItem(THEME_KEY);
  document.documentElement.classList.remove(DARK_CLASS);
  platform().setMatches(false);
});

/**
 * React `cleanup()` first, before any slot this file built is retired, including
 * after a failed assertion: `afterEach` runs whatever the test body reached.
 */
afterEach(async () => {
  cleanup();
  const slots = builtSlots.splice(0);
  await Promise.all(slots.map((slot) => slot.retire()));
});

/**
 * The setting behind the theme control: three answers, one of which is "ask the
 * machine".
 *
 * Watched failures for every test here are in
 * `openspec/changes/dark-mode/verify.md`.
 */
describe('what the theme setting resolves to', () => {
  itDom('follows the machine, both ways, while the choice is system', () => {
    expect(paletteFor('system', true)).toBe('dark');
    expect(paletteFor('system', false)).toBe('light');
  });

  itDom('ignores the machine once a palette has been chosen outright', () => {
    // The whole reason there are three states and not a checkbox: a reader who
    // chose light means it at midnight, on a laptop that has gone dark.
    expect(paletteFor('light', true)).toBe('light');
    expect(paletteFor('dark', false)).toBe('dark');
  });
});

describe('what this browser remembers', () => {
  itDom('starts on system, having never been told', async () => {
    await withThemeStore((themeStore) => {
      expect(rememberedTheme(themeStore)).toBe('system');
    });
  });

  itDom('reads back an answer it was given', async () => {
    localStorage.setItem(THEME_KEY, JSON.stringify('dark'));

    await withThemeStore((themeStore) => {
      expect(rememberedTheme(themeStore)).toBe('dark');
    });
  });

  itDom('refuses a stored answer that is not one of the three, and drops the key', async () => {
    localStorage.setItem(THEME_KEY, JSON.stringify('midnight'));

    await withThemeStore((themeStore) => {
      expect(rememberedTheme(themeStore)).toBe('system');
    });
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  itDom('refuses storage that is not JSON at all, and drops the key', async () => {
    localStorage.setItem(THEME_KEY, '{not json');

    await withThemeStore((themeStore) => {
      expect(rememberedTheme(themeStore)).toBe('system');
    });
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  itDom('reads the same answer without writing anything, for a render to call', async () => {
    // The half `useTheme`'s lazy initialiser is allowed to do. Both refusals
    // above are the same read plus a write, and a `useState` initialiser is a
    // render — StrictMode calls it twice on purpose to surface exactly that.
    //
    // Proof: `readTheme` pointed back at `rememberedTheme`, this failed on
    // `expected null to be '"midnight"'` — the key gone, from a read.
    // Watched on h2puni under vitest, 2026-08-12.
    localStorage.setItem(THEME_KEY, JSON.stringify('midnight'));

    await withThemeStore((themeStore) => {
      expect(readTheme(themeStore)).toBe('system');
    });
    expect(localStorage.getItem(THEME_KEY)).toBe(JSON.stringify('midnight'));
  });
});

describe('what the theme puts on the document', () => {
  itDom('hangs the dark token set on the root, and takes it off again', () => {
    paintPalette('dark');
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);

    paintPalette('light');
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });

  itDom('refuses a runtime that cannot be asked what colour scheme it prefers', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored below, never called detached
    const real = window.matchMedia;
    // The failure this guards is a runtime with no `matchMedia`, and the only
    // way to construct it is to take the one this environment installed away.
    Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true });

    expect(() => systemMedia()).toThrow(/colour scheme/);

    Object.defineProperty(window, 'matchMedia', { value: real, configurable: true });
  });
});

describe('the theme, followed and remembered while the app is open', () => {
  itDom('opens on the answer this browser last gave, without a paint in between', async () => {
    const { slot } = await liveSlot(fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('dark') }));

    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });

    expect(held.result.current.choice).toBe('dark');
    expect(held.result.current.palette).toBe('dark');
    expect(held.result.current.persists).toBe(true);
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  itDom('drops an answer it cannot read, from an effect rather than from a render', async () => {
    const { slot, store } = await liveSlot(
      fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('midnight') }),
    );

    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });

    // The behaviour is unchanged by the move — a corrupt key is gone by the
    // time the hook has mounted, which is all a reader could ever have seen.
    // The removal is now asserted against the store this hook really reads and
    // writes, through the injected fake's own `held()`, rather than against the
    // module-load singleton it no longer touches.
    expect(held.result.current.choice).toBe('system');
    expect(store.held()[THEME_KEY]).toBeUndefined();
  });

  itDom('opens on the machine’s own answer where nothing was ever chosen', async () => {
    platform().setMatches(true);
    const { slot } = await liveSlot();

    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });

    expect(held.result.current.choice).toBe('system');
    expect(held.result.current.palette).toBe('dark');
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  itDom('writes the answer down as it is chosen, and paints it', async () => {
    const { slot, store } = await liveSlot();

    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });

    act(() => {
      held.result.current.chooseTheme('dark');
    });

    expect(store.held()[THEME_KEY]).toBe(JSON.stringify('dark'));
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  itDom('follows the machine changing under it while the choice is system', async () => {
    const { slot } = await liveSlot();
    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);

    act(() => {
      platform().setMatches(true);
    });

    expect(held.result.current.palette).toBe('dark');
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  itDom('leaves a chosen palette where it is when the machine changes under it', async () => {
    const { slot } = await liveSlot();
    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
    act(() => {
      held.result.current.chooseTheme('light');
    });

    act(() => {
      platform().setMatches(true);
    });

    expect(held.result.current.palette).toBe('light');
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });

  itDom('goes back to the machine’s answer when system is chosen again', async () => {
    platform().setMatches(true);
    const { slot } = await liveSlot();
    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
    act(() => {
      held.result.current.chooseTheme('light');
    });
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);

    act(() => {
      held.result.current.chooseTheme('system');
    });

    expect(held.result.current.palette).toBe('dark');
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  itDom('stops listening to the machine once it is gone', async () => {
    // **The class cannot answer this and the listener count can.** This test
    // asserted only the third block below, and it could not fail: `paintPalette`
    // runs from a `useEffect`, React runs no effect for an unmounted hook, so
    // deleting `media.removeEventListener('change', follow)` left the class
    // exactly where it was and the assertion green. The author watched the
    // subscribe red and never the unsubscribe — `verify.md`'s own jsdom table
    // lists `addEventListener` and not its opposite. Caught in cross-review,
    // 2026-08-12.
    //
    // What is asked instead is the platform, which is the only party an unmount
    // is allowed to change: `vitest.setup.ts`'s stand-in reports how many
    // `change` listeners are live on the one cached list.
    // A baseline rather than a literal `0`, and that is not defensiveness: the
    // list is cached per query string for the whole file, so a literal would
    // make this test's verdict depend on how many hooks the tests above it
    // mounted — which is exactly what the injection below reported. What is
    // asserted is the *difference* one mount and one unmount make.
    const before = platform().listenerCount;

    const { slot } = await liveSlot();
    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
    expect(platform().listenerCount, 'the hook never subscribed at all').toBe(before + 1);

    held.unmount();

    // Proof: `media.removeEventListener('change', follow)` deleted from the
    // effect's cleanup in `theme.ts`, this failed on `the hook left its
    // listener on the platform: expected 8 to be 7`, where the block below
    // stayed green — which is the whole point. Watched on h2puni, 2026-08-12.
    expect(platform().listenerCount, 'the hook left its listener on the platform').toBe(before);

    act(() => {
      platform().setMatches(true);
    });

    // The class is what a leaked listener would move, and there is no component
    // left to move it: an unmounted hook that still repaints the document is a
    // second theme fighting the one on screen. Kept as a pin on the consequence
    // — it is what a reader would see — rather than as the proof, which is the
    // count above.
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });
});

/**
 * The four transitions `useTheme`'s own state machine names, one named example
 * each, plus the three cases its invariants are stated over.
 *
 * `theme.model.test.tsx` is where the same machine is run against a reference
 * model under generated interleavings; these are the readable statements of what
 * each transition is for, and each has its own independent mutation.
 */
describe('the theme when the application services are withdrawn or transitioning', () => {
  itDom(
    'resets to system and stops persisting once the runtime is withdrawn, without waiting for disposal',
    async () => {
      const { slot, release } = await liveSlotHoldingDisposal(
        fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('dark') }),
      );
      const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
      expect(held.result.current.choice).toBe('dark');

      // `retire()` withdraws publication synchronously; the disposal behind it is
      // still waiting for `release` below while these assertions run.
      const retiring = slot.retire();
      try {
        await act(async () => {
          await Promise.resolve();
        });

        expect(held.result.current.choice).toBe('system');
        expect(held.result.current.persists).toBe(false);
      } finally {
        release();
        await act(async () => {
          await retiring;
        });
      }
    },
  );

  itDom('adopts a later live store’s own saved choice once one is published', async () => {
    const empty = freshSlot();
    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(empty) });
    expect(held.result.current.choice).toBe('system');
    expect(held.result.current.persists).toBe(false);

    const publishing = empty.replace(() =>
      installApplicationRuntime({
        openStore: () => fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('dark') }),
        isLive: () => empty.snapshot().status === 'live',
      }),
    );
    await act(async () => {
      await publishing;
    });

    expect(held.result.current.choice).toBe('dark');
    expect(held.result.current.persists).toBe(true);
  });

  itDom(
    'recovers, instead of throwing, when the store is retired between this hook’s render and its resync effect',
    async () => {
      const { slot } = await liveSlot(fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('dark') }));
      const captured: { theme: Theme | null } = { theme: null };

      function ObservesTheme(): null {
        captured.theme = useTheme();
        return null;
      }

      function RetiresFromLayoutEffect(): null {
        // A layout effect commits before every passive effect of the same
        // commit — including the sibling hook's own resync effect below.
        useLayoutEffect(() => {
          void slot.retire();
        }, []);
        return null;
      }

      let thrown: unknown = null;
      try {
        render(
          <ApplicationServicesProvider slot={slot}>
            <RetiresFromLayoutEffect />
            <ObservesTheme />
          </ApplicationServicesProvider>,
        );
      } catch (caught) {
        thrown = caught;
      }

      expect(thrown).toBeNull();
      expect(captured.theme?.choice).toBe('system');
      expect(captured.theme?.persists).toBe(false);
    },
  );

  itDom(
    'does not throw when the closured store goes withdrawn between renders, and settles on the withdrawn state',
    async () => {
      const { slot, store } = await liveSlot();
      const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
      const { chooseTheme } = held.result.current;

      // Withdrawal is synchronous; the notification that would rebuild
      // `chooseTheme` over a `null` store is not — this call still closes over
      // the live store `renderHook` built it with.
      const retiring = slot.retire();

      expect(() => {
        act(() => {
          chooseTheme('dark');
        });
      }).not.toThrow();

      await act(async () => {
        await retiring;
      });

      expect(held.result.current.choice).toBe('system');
      expect(held.result.current.persists).toBe(false);
      // Nothing reached the store this closure's write raced against closing.
      expect(store.held()[THEME_KEY]).toBeUndefined();
    },
  );

  itDom('does not let a superseded chooser change a replacement runtime’s own state', async () => {
    const first = fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('light') });
    const second = fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('light') });
    const { slot } = await liveSlot(first);
    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
    const staleChooseTheme = held.result.current.chooseTheme;
    expect(held.result.current.choice).toBe('light');

    const replacing = slot.replace(() =>
      installApplicationRuntime({
        openStore: () => second,
        isLive: () => slot.snapshot().status === 'live',
      }),
    );
    await act(async () => {
      await replacing;
    });
    expect(held.result.current.choice).toBe('light');
    expect(held.result.current.persists).toBe(true);

    act(() => {
      staleChooseTheme('dark');
    });

    expect(held.result.current.choice).toBe('light');
    expect(held.result.current.persists).toBe(true);
    expect(first.held()[THEME_KEY]).toBe(JSON.stringify('light'));
    expect(second.held()[THEME_KEY]).toBe(JSON.stringify('light'));
  });

  itDom(
    'propagates the chooser’s own ordinary storage failure by identity, showing no choice it could not keep',
    async () => {
      // Identity, not message text: what has to reach the caller is the very
      // object the store raised. A message comparison would pass for a refusal
      // some layer between rewrapped or replaced.
      const failure = new Error('write denied');
      const { slot, store } = await liveSlot(writeRefusingBrowserStorage(failure));
      const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
      expect(held.result.current.choice).toBe('system');
      expect(held.result.current.persists).toBe(true);

      let caught: unknown = null;
      try {
        act(() => {
          held.result.current.chooseTheme('dark');
        });
      } catch (refusal) {
        caught = refusal;
      }

      expect(caught).toBe(failure);
      // Neither the displayed choice nor the stored bytes moved: this failure is
      // not a lifecycle refusal, so nothing above the store recovers from it.
      expect(held.result.current.choice).toBe('system');
      expect(held.result.current.persists).toBe(true);
      expect(store.held()[THEME_KEY]).toBeUndefined();
    },
  );

  itDom(
    'propagates the resync effect’s own ordinary storage failure by identity, rather than recovering from it',
    async () => {
      // The chooser's write is not the only access this hook makes: the resync
      // effect reads, and drops. A store that refuses only writes can never reach
      // that read, which is why this case needs a store that answers the render's
      // own read and refuses the effect's — `readsBeforeFailing: 1` is exactly the
      // lazy `useState` initialiser's single read.
      const failure = new Error('read denied');
      const { slot } = await liveSlot(
        readRefusingBrowserStorage(failure, 1, { [THEME_KEY]: JSON.stringify('dark') }),
      );

      let caught: unknown = null;
      try {
        renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
      } catch (refusal) {
        caught = refusal;
      }

      expect(caught).toBe(failure);
    },
  );

  itDom(
    'reads and writes the runtime’s own injected store, never the staged composition.ts singleton',
    async () => {
      const { slot, store } = await liveSlot();
      const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });

      act(() => {
        held.result.current.chooseTheme('dark');
      });

      expect(store.held()[THEME_KEY]).toBe(JSON.stringify('dark'));
      // `composition.ts`'s own `rememberedPreferences` wraps real `localStorage`
      // unconditionally; if this hook still reached it, this key would be set.
      expect(localStorage.getItem(THEME_KEY)).toBeNull();
    },
  );

  itDom('degrades to system and never throws when never live', () => {
    const empty = freshSlot();

    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(empty) });

    expect(held.result.current.choice).toBe('system');
    expect(held.result.current.palette).toBe('light');
    expect(held.result.current.persists).toBe(false);

    act(() => {
      held.result.current.chooseTheme('dark');
    });

    expect(held.result.current.choice).toBe('dark');
    expect(held.result.current.persists).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  itDom(
    'lets a reader still operate the control while never live, through the same null guard',
    () => {
      const empty = freshSlot();
      const held = renderHook(() => useTheme(), { wrapper: wrapperFor(empty) });

      act(() => {
        held.result.current.chooseTheme('light');
      });

      expect(held.result.current.choice).toBe('light');
      expect(held.result.current.persists).toBe(false);
    },
  );
});
