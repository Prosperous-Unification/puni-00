import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DriveableMediaQueryList } from '../../vitest.setup';
import type { Remembered } from '../modules/preferences/contract';
import { fakeBrowserStorage } from '../modules/preferences/fake-browser-storage';
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
