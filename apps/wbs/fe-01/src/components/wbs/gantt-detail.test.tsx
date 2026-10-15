import { act, cleanup, render, renderHook } from '@testing-library/react';
import { type ReactNode, useLayoutEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { BrowserStorage } from '@/modules/preferences/contract';
import {
  fakeBrowserStorage,
  type HeldByFake,
  writeRefusingBrowserStorage,
} from '@/modules/preferences/fake-browser-storage';
import { GANTT_DETAIL_KEY, RETIRED_GANTT_ARROWS_KEY } from '@/modules/preferences/preference-keys';
import { type ApplicationServices, installApplicationRuntime } from '@/runtime/application-runtime';
import { ApplicationServicesProvider } from '@/runtime/application-services-context';
import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';

import { type GanttDetail, selectMarksAtPointer, useGanttDetail } from './gantt-detail';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/** Every slot this file built, given back after React's own cleanup. */
const built: LifetimeSlot<ApplicationServices>[] = [];

afterEach(async () => {
  try {
    cleanup();
  } finally {
    for (const slot of built.splice(0)) await slot.retire();
  }
});

function emptySlot(): LifetimeSlot<ApplicationServices> {
  const slot = createLifetimeSlot<ApplicationServices>(50);
  built.push(slot);
  return slot;
}

/**
 * The production installer over `store`, live when this resolves, whose disposal
 * waits for `disposal` first — so a test can read the withdrawn state while the
 * runtime is still letting go.
 */
async function publishOver(
  slot: LifetimeSlot<ApplicationServices>,
  store: BrowserStorage,
  disposal: Promise<void> = Promise.resolve(),
): Promise<void> {
  await act(async () => {
    await slot.replace(() => {
      const installed = installApplicationRuntime({
        openStore: () => store,
        isLive: () => slot.snapshot().status === 'live',
      });
      return {
        services: installed.services,
        close: async (options) => {
          await disposal;
          await installed.close(options);
        },
      };
    });
  });
}

function wrapperFor(slot: LifetimeSlot<ApplicationServices>) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>;
  }
  return Wrapper;
}

const storedDetail = (store: HeldByFake): string | undefined => store.held()[GANTT_DETAIL_KEY];

/** Lets the slot's own microtask notification reach React, and nothing more. */
async function deliverNotification(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/**
 * The four lifecycle transitions of
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`, for
 * the chart's detail switch — an answer the page keeps on screen, so it follows
 * the same state machine `useTheme` does.
 */
describe('the detail switch, over the runtime the page publishes', () => {
  itDom('opens on the never-said default and remembers nothing when no runtime is live', () => {
    const slot = emptySlot();
    const held = renderHook(() => useGanttDetail(true), { wrapper: wrapperFor(slot) });
    expect(held.result.current.shown).toBe(true);
    expect(held.result.current.persists).toBe(false);

    act(() => {
      held.result.current.ask(false);
    });

    expect(held.result.current.shown).toBe(false);
    expect(held.result.current.persists).toBe(false);
    // Not the page's own store either: nothing fell through to it.
    expect(localStorage.getItem(GANTT_DETAIL_KEY)).toBeNull();
  });

  /**
   * The never-said default is decided against the plan's links, so it waits
   * until they are known (`null` until the first plan read lands) instead of
   * being taken from whatever the chart held at mount — the same plan opened
   * with Detail on or off depending on which arrived first (ui-review F-065).
   *
   * Proof: with the hook taking `hasDependencyEdges` at mount as before (the
   * unknown links read as "no links"), this failed on `expected false to be
   * true` at the first `rerender`. Watched 2026-10-14.
   */
  itDom('waits for the links to be known before taking the never-said default', async () => {
    const unpublished = renderHook(({ edges }) => useGanttDetail(edges), {
      wrapper: wrapperFor(emptySlot()),
      initialProps: { edges: null as boolean | null },
    });
    expect(unpublished.result.current.shown).toBe(false);
    unpublished.rerender({ edges: true });
    expect(unpublished.result.current.shown).toBe(true);

    const slot = emptySlot();
    await publishOver(slot, fakeBrowserStorage({}));
    const live = renderHook(({ edges }) => useGanttDetail(edges), {
      wrapper: wrapperFor(slot),
      initialProps: { edges: null as boolean | null },
    });
    expect(live.result.current.shown).toBe(false);
    live.rerender({ edges: true });
    expect(live.result.current.shown).toBe(true);
    expect(live.result.current.persists).toBe(true);
  });

  // Proof: with `shown` following the live links (`said ?? hasDependencyEdges
  // === true`, no latch), this failed on `expected true to be false`. Watched
  // 2026-10-15.
  itDom('keeps the default it decided once the links were known', () => {
    const held = renderHook(({ edges }) => useGanttDetail(edges), {
      wrapper: wrapperFor(emptySlot()),
      initialProps: { edges: null as boolean | null },
    });
    held.rerender({ edges: false });
    expect(held.result.current.shown).toBe(false);
    // A first link drawn later in the session does not turn the brackets and
    // arrows on under a reader who opened the plan without them.
    held.rerender({ edges: true });
    expect(held.result.current.shown).toBe(false);
  });

  // Proof: with `shown` held off until the links are known (`opening === null
  // ? false : …`), this failed on `expected false to be true`. Watched
  // 2026-10-15.
  itDom('shows a remembered answer without waiting for the links', async () => {
    const slot = emptySlot();
    await publishOver(slot, fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'true' }));
    const held = renderHook(() => useGanttDetail(null), { wrapper: wrapperFor(slot) });
    expect(held.result.current.shown).toBe(true);
  });

  // Proof: with the latched links ranked above the reader's answer (`opening
  // ?? said ?? false`), this failed on `expected true to be false`. Watched
  // 2026-10-15.
  itDom('does not let late links overrule what the reader asked for', () => {
    const held = renderHook(({ edges }) => useGanttDetail(edges), {
      wrapper: wrapperFor(emptySlot()),
      initialProps: { edges: null as boolean | null },
    });
    act(() => {
      held.result.current.ask(false);
    });
    held.rerender({ edges: true });
    expect(held.result.current.shown).toBe(false);
  });

  itDom(
    'returns to the never-said default and stops remembering once withdrawn, without waiting for disposal',
    async () => {
      const store = fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'false' });
      let release = (): void => {
        throw new Error('the disposal was never reached');
      };
      const disposal = new Promise<void>((resolve) => {
        release = resolve;
      });
      const slot = emptySlot();
      await publishOver(slot, store, disposal);
      // Released whatever the assertions below do, so the file's own teardown
      // never waits on a disposal this test is still holding.
      try {
        const held = renderHook(() => useGanttDetail(true), { wrapper: wrapperFor(slot) });
        expect(held.result.current.shown).toBe(false);
        expect(held.result.current.persists).toBe(true);

        const retiring = slot.retire();
        await deliverNotification();

        expect(slot.snapshot().status, 'setup: the disposal is still held').toBe('retiring');
        expect(held.result.current.shown).toBe(true);
        expect(held.result.current.persists).toBe(false);
        expect(storedDetail(store)).toBe('false');
        release();
        await act(async () => {
          await retiring;
        });
      } finally {
        release();
      }
    },
  );

  itDom(
    'changes the marks and remembers nothing when asked between a withdrawal and the next render',
    async () => {
      const store = fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'true' });
      const slot = emptySlot();
      await publishOver(slot, store);
      const held = renderHook(() => useGanttDetail(false), { wrapper: wrapperFor(slot) });
      expect(held.result.current.shown).toBe(true);
      const { ask } = held.result.current;

      // Withdrawal is synchronous; the notification that re-renders the hook is
      // not, so `ask` still belongs to the render that read the live runtime.
      const retiring = slot.retire();
      expect(() => {
        act(() => {
          ask(false);
        });
      }).not.toThrow();

      expect(held.result.current.shown).toBe(false);
      expect(held.result.current.persists).toBe(false);
      expect(storedDetail(store)).toBe('true');
      await act(async () => {
        await retiring;
      });
    },
  );

  itDom(
    'adopts a replacement runtime’s own remembered answer, and drops what it refuses',
    async () => {
      const first = fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'false' });
      const second = fakeBrowserStorage({
        [GANTT_DETAIL_KEY]: 'true',
        [RETIRED_GANTT_ARROWS_KEY]: 'true',
      });
      const slot = emptySlot();
      await publishOver(slot, first);
      const held = renderHook(() => useGanttDetail(false), { wrapper: wrapperFor(slot) });
      expect(held.result.current.shown).toBe(false);

      await publishOver(slot, second);

      expect(held.result.current.shown).toBe(true);
      expect(held.result.current.persists).toBe(true);
      expect(second.held()[RETIRED_GANTT_ARROWS_KEY]).toBeUndefined();
      expect(storedDetail(first)).toBe('false');
    },
  );

  itDom('does not let a superseded ask change the marks or any store', async () => {
    const first = fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'false' });
    const second = fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'true' });
    const slot = emptySlot();
    await publishOver(slot, first);
    const held = renderHook(() => useGanttDetail(false), { wrapper: wrapperFor(slot) });
    const retained = held.result.current.ask;
    await publishOver(slot, second);
    expect(held.result.current.shown).toBe(true);

    act(() => {
      retained(false);
    });

    expect(held.result.current.shown).toBe(true);
    expect(held.result.current.persists).toBe(true);
    expect(storedDetail(second)).toBe('true');
    expect(storedDetail(first)).toBe('false');
  });

  itDom(
    'lets a store’s own write failure through by identity, showing nothing it could not keep',
    async () => {
      const denied = new Error('write denied');
      const store = writeRefusingBrowserStorage(denied);
      const slot = emptySlot();
      await publishOver(slot, store);
      const held = renderHook(() => useGanttDetail(false), { wrapper: wrapperFor(slot) });

      let thrown: unknown = null;
      try {
        act(() => {
          held.result.current.ask(true);
        });
      } catch (caught) {
        thrown = caught;
      }

      // Anything the failed call queued is let through before reading it back.
      await act(async () => {
        await Promise.resolve();
      });

      expect(thrown).toBe(denied);
      expect(held.result.current.shown).toBe(false);
      expect(held.result.current.persists).toBe(true);
      expect(storedDetail(store)).toBeUndefined();
    },
  );

  itDom(
    'settles on the withdrawn state, without throwing, when retired between its render and its effect',
    async () => {
      const slot = emptySlot();
      await publishOver(slot, fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'false' }));
      const captured: { detail: GanttDetail | null } = { detail: null };

      function ObservesDetail(): null {
        captured.detail = useGanttDetail(true);
        return null;
      }

      function RetiresFromLayoutEffect(): null {
        // A layout effect commits before every passive effect of the same
        // commit — including the sibling hook's own resynchronisation effect.
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
            <ObservesDetail />
          </ApplicationServicesProvider>,
        );
      } catch (caught) {
        thrown = caught;
      }

      expect(thrown).toBeNull();
      expect(captured.detail?.shown).toBe(true);
      expect(captured.detail?.persists).toBe(false);
    },
  );
});

describe('forecast pointer collisions', () => {
  it('returns every containing surface rather than guessing the nearest mark', () => {
    const surfaces = [
      { markId: 'first', left: 0, right: 18, top: 0, bottom: 20 },
      { markId: 'second', left: 6, right: 24, top: 0, bottom: 20 },
      { markId: 'other-row', left: 6, right: 24, top: 20, bottom: 40 },
    ];
    expect(selectMarksAtPointer(surfaces, 12, 10)).toEqual(['first', 'second']);
    expect(selectMarksAtPointer(surfaces, 2, 10)).toEqual(['first']);
    expect(selectMarksAtPointer(surfaces, 30, 10)).toEqual([]);
  });
});
