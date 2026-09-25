import { DiBag, DiBagCloseCancelledError } from 'di-bag';
import { describe, expect, it } from 'vitest';

import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';
import { THEME_KEY } from '@/modules/preferences/preference-keys';

import {
  acquireApplicationRuntime,
  acquireTransactionally,
  type ApplicationServices,
  applicationSlot,
  installApplicationRuntime,
} from './application-runtime';
import {
  createLifetimeSlot,
  type LifetimeSlot,
  PartialAcquisitionError,
  RETIREMENT_BUDGET_MS,
} from './lifetime-slot';

/** What a half-finished read of a real graph did, for the transaction assertions. */
interface HalfGraph {
  readonly read: () => { readonly first: string; readonly second: string };
  readonly graph: { readonly close: (options: { waitTimeoutMs: number }) => Promise<void> };
  readonly disposals: () => readonly string[];
}

/**
 * A real DI Bag graph whose second read throws after the first was acquired.
 *
 * Not a hand-written pair of functions: what the transaction has to release is a
 * graph DI Bag owns, and DI Bag releases one only through `close()` on the bag
 * that acquired it — measured, and the reason
 * {@link PartialAcquisitionError} carries a close at all.
 */
function halfAcquiring(): HalfGraph {
  const disposals: string[] = [];
  const bag = DiBag.createBuilder()
    .withServices({
      first: DiBag.providerWithDisposal({
        provider: DiBag.createProvider((): string => 'the resource it took', {
          factoryReturnKind: 'sync-value',
        }),
        disposeService: async () => {
          disposals.push('first');
          await Promise.resolve();
        },
      }),
      second: DiBag.createProvider(
        (): string => {
          throw new Error('alice@example.com could not be composed');
        },
        { factoryReturnKind: 'sync-value' },
      ),
    })
    .buildContainer();
  return {
    graph: bag,
    disposals: () => disposals,
    read: () => ({ first: bag.resolve('first'), second: bag.resolve('second') }),
  };
}

/**
 * A real DI Bag graph whose one owned service never finishes disposing.
 *
 * Only DI Bag's own wait budget can end a close of it, so the budget the
 * transaction handed DI Bag is what the refusal reports: the one place the
 * slot's `timeoutMs` becomes the library's `waitTimeoutMs`.
 */
function neverDisposing() {
  return DiBag.createBuilder()
    .withServices({
      owned: DiBag.providerWithDisposal({
        provider: DiBag.createProvider((): string => 'held', { factoryReturnKind: 'sync-value' }),
        disposeService: () => new Promise<void>(() => undefined),
      }),
    })
    .buildContainer();
}

/** The wait budget in DI Bag's cancelled-close refusal. */
async function budgetOfRefusedClose(closing: Promise<void>): Promise<number | undefined> {
  const refusal = await closing.then(
    () => new Error('the close was expected to outrun its budget'),
    (thrown: unknown) => thrown,
  );
  if (!(refusal instanceof DiBagCloseCancelledError)) throw refusal;
  return refusal.details.waitTimeoutMs;
}

describe('the page’s runtime, installed transactionally', () => {
  /**
   * The installer hands out the contract's exports and nothing else.
   *
   * The assertion that makes the bag unreachable: an extra property on the returned
   * object still satisfies {@link ApplicationServices}, so the type checker refuses
   * nothing here. Enumerating the surface does.
   */
  it('publishes its two public services and nothing else', () => {
    const { services } = installApplicationRuntime({ openStore: fakeBrowserStorage });

    expect(Object.keys(services)).toEqual(['preferences', 'remembered']);
    expect(
      Object.values(services).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  it('revokes the store it owns when the installation closes', async () => {
    const store = fakeBrowserStorage();
    const installed = installApplicationRuntime({ openStore: () => store });
    const detail = installed.services.remembered.ganttDetail;

    await installed.close({ timeoutMs: 50 });

    expect(() => {
      detail.write(true);
    }).toThrow('the preferences store was revoked with its runtime');
    expect(() => detail.read()).toThrow('the preferences store was revoked with its runtime');
    expect(store.held()).toEqual({});
  });

  it('publishes the preferences the browser store already holds', () => {
    const store = fakeBrowserStorage({ [THEME_KEY]: '"dark"' });
    const isTheme = (claimed: unknown): claimed is 'dark' | 'light' =>
      claimed === 'dark' || claimed === 'light';

    const { services } = installApplicationRuntime({ openStore: () => store });

    expect(services.remembered.themeChoice(isTheme).read()).toBe('dark');
    expect(services.preferences.unchecked('wbs.demo.id').read()).toBe(null);
  });

  it('releases everything a half-finished read acquired', async () => {
    const half = halfAcquiring();

    const refusal = ((): unknown => {
      try {
        acquireTransactionally(half.graph, half.read);
      } catch (thrown: unknown) {
        return thrown;
      }
      throw new Error('the half-finished read was expected to throw');
    })();

    expect(refusal).toBeInstanceOf(PartialAcquisitionError);
    expect(half.disposals()).toEqual([]);
    await (refusal as PartialAcquisitionError).release({ timeoutMs: 50 });
    expect(half.disposals()).toEqual(['first']);
  });

  it('hands DI Bag the budget of a runtime’s own close', async () => {
    const graph = neverDisposing();
    const runtime = acquireTransactionally(graph, () => ({ owned: graph.resolve('owned') }));

    expect(await budgetOfRefusedClose(runtime.close({ timeoutMs: 25 }))).toBe(25);
  });

  it('hands DI Bag the budget of a half-finished read’s release', async () => {
    const graph = neverDisposing();

    const refusal = ((): unknown => {
      try {
        acquireTransactionally(graph, () => {
          graph.resolve('owned');
          throw new Error('the second resource refused');
        });
      } catch (thrown: unknown) {
        return thrown;
      }
      throw new Error('the half-finished read was expected to throw');
    })();

    expect(refusal).toBeInstanceOf(PartialAcquisitionError);
    expect(
      await budgetOfRefusedClose((refusal as PartialAcquisitionError).release({ timeoutMs: 30 })),
    ).toBe(30);
  });

  it('carries the original failure as the cause of a refused installation', () => {
    const half = halfAcquiring();

    try {
      acquireTransactionally(half.graph, half.read);
      throw new Error('the half-finished read was expected to throw');
    } catch (thrown: unknown) {
      expect(thrown).toBeInstanceOf(PartialAcquisitionError);
      expect((thrown as PartialAcquisitionError).cause).toBeInstanceOf(Error);
      expect(((thrown as PartialAcquisitionError).cause as Error).message).toContain(
        'could not be composed',
      );
    }
  });

  it('refuses the installation when this browser has no store to open', async () => {
    const refusal = ((): unknown => {
      try {
        installApplicationRuntime({
          openStore: () => {
            // Deliberately not a real browser's wording for a blocked store:
            // `DOM_EVIDENCE` in `src/test-tiers.test.ts` reads the names of browser
            // globals as evidence that a suite needs a browser, even in prose, and
            // the real message carries one. This suite stays in the fast tier.
            throw new Error('access to this store is denied');
          },
        });
      } catch (thrown: unknown) {
        return thrown;
      }
      throw new Error('opening no store was expected to throw');
    })();

    expect(refusal).toBeInstanceOf(PartialAcquisitionError);
    // Nothing was acquired, so its release has nothing to give back and must
    // still settle: the slot awaits it before it publishes the fatal state.
    await expect((refusal as PartialAcquisitionError).release({ timeoutMs: 50 })).resolves.toBe(
      undefined,
    );
  });

  /**
   * The production path a refused installation really takes: through the slot,
   * which publishes the sanitized fatal state and stays buildable.
   */
  it('leaves the slot fatal but buildable when the installation is refused', async () => {
    const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>(50);

    await expect(
      slot.replace(() =>
        installApplicationRuntime({
          openStore: () => {
            throw new Error('alice@example.com is not allowed a store');
          },
        }),
      ),
    ).rejects.toBeInstanceOf(PartialAcquisitionError);

    const refused = slot.snapshot();
    expect(refused.status).toBe('fatal');
    if (refused.status !== 'fatal') throw new Error('the slot was expected to be fatal');
    expect(refused.terminal).toBe(false);
    expect(refused.fault.sentence).not.toContain('alice@example.com');
    expect(refused.fault.occurrenceId).not.toBe('');

    const services = await slot.replace(() =>
      installApplicationRuntime({ openStore: fakeBrowserStorage }),
    );
    expect(slot.snapshot().status).toBe('live');
    expect(typeof services.remembered.lastOpenedProject.read).toBe('function');
  });

  /**
   * Retirement gives the store back, through the slot the page really uses —
   * unchanged: this test does not wire `isLive` to the slot, so `ensureLive`
   * keeps its own always-`true` default and this reference still falls all
   * the way through to `REVOKED`, exactly as before 050-7-d.
   */
  it('revokes the store it owns when the slot retires it', async () => {
    const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>(50);
    const store = fakeBrowserStorage();
    const services = await slot.replace(() =>
      installApplicationRuntime({ openStore: () => store }),
    );
    const detail = services.remembered.ganttDetail;

    await slot.retire();

    expect(slot.snapshot().status).toBe('empty');
    expect(() => {
      detail.write(true);
    }).toThrow('the preferences store was revoked with its runtime');
  });

  describe('once isLive is wired to a real slot', () => {
    /**
     * Precedence is read from the slot's own **current** state, not from
     * what happened to a runtime in the past: `ensureLive` refuses
     * `WITHDRAWN` whenever `slot.snapshot().status !== 'live'`, and once the
     * slot is `live` again — with anyone — a stale reference's own read
     * proceeds to its own store, which reaches `REVOKED` if that store has
     * already been given back. Nothing here is "permanent"; it tracks the
     * slot, moment to moment.
     */
    it('refuses a captured reference the instant retirement is accepted', async () => {
      const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>();
      const store = fakeBrowserStorage();
      const services = await slot.replace(() =>
        installApplicationRuntime({
          openStore: () => store,
          isLive: () => slot.snapshot().status === 'live',
        }),
      );
      const detail = services.remembered.ganttDetail;

      // Not awaited: `accept()` (`lifetime-slot.ts`) withdraws publication
      // synchronously, so `slot.snapshot().status` is already `retiring` here
      // — regardless of whether `disposeWithdrawn()`'s own bounded close has
      // itself started (it typically has, by this point, when nothing else
      // is queued ahead of this transition; `ensureLive` does not depend on
      // that timing either way).
      const retiring = slot.retire();
      expect(slot.snapshot().status).toBe('retiring');

      expect(() => {
        detail.write(true);
      }).toThrow('the page withdrew this preference store before the access completed');

      await retiring;
    });

    it('keeps refusing WITHDRAWN while the slot stays non-live, once retirement has fully settled', async () => {
      const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>(50);
      const store = fakeBrowserStorage();
      const services = await slot.replace(() =>
        installApplicationRuntime({
          openStore: () => store,
          isLive: () => slot.snapshot().status === 'live',
        }),
      );
      const detail = services.remembered.ganttDetail;

      await slot.retire();
      expect(slot.snapshot().status).toBe('empty');

      expect(() => {
        detail.write(true);
      }).toThrow('the page withdrew this preference store before the access completed');
    });

    /**
     * `IsRuntimeLive`'s own JSDoc names this scope limit: the predicate asks
     * "is something live here", not "is it still me". Once a *newer* runtime
     * is live, a stale reference from a runtime the slot has moved past
     * passes `ensureLive()` again and reaches its own, already-revoked
     * store — `REVOKED`, not `WITHDRAWN`, is what actually fires for this
     * one case. Proved two ways: a direct `replace` while the reference was
     * still live, and — the case review 2 asked to be added explicitly — a
     * `retire` (settling to `empty`, `WITHDRAWN` observed there) followed
     * later by a separate `replace`, after which the same reference flips
     * from `WITHDRAWN` to `REVOKED` without any code of its own changing.
     */
    it('lets a stale reference from a REPLACED runtime reach REVOKED, once a newer runtime is live', async () => {
      const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>(50);
      const isLive = (): boolean => slot.snapshot().status === 'live';
      const oldStore = fakeBrowserStorage();
      const oldServices = await slot.replace(() =>
        installApplicationRuntime({ openStore: () => oldStore, isLive }),
      );
      const staleDetail = oldServices.remembered.ganttDetail;

      const newStore = fakeBrowserStorage();
      await slot.replace(() => installApplicationRuntime({ openStore: () => newStore, isLive }));
      expect(slot.snapshot().status).toBe('live');

      expect(() => {
        staleDetail.write(true);
      }).toThrow('the preferences store was revoked with its runtime');
    });

    it('flips a retired reference from WITHDRAWN to REVOKED once a LATER replace makes the slot live again', async () => {
      const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>(50);
      const isLive = (): boolean => slot.snapshot().status === 'live';
      const firstStore = fakeBrowserStorage();
      const firstServices = await slot.replace(() =>
        installApplicationRuntime({ openStore: () => firstStore, isLive }),
      );
      const staleDetail = firstServices.remembered.ganttDetail;

      await slot.retire();
      expect(slot.snapshot().status).toBe('empty');
      expect(() => {
        staleDetail.write(true);
      }).toThrow('the page withdrew this preference store before the access completed');

      const secondStore = fakeBrowserStorage();
      await slot.replace(() => installApplicationRuntime({ openStore: () => secondStore, isLive }));
      expect(slot.snapshot().status).toBe('live');

      expect(() => {
        staleDetail.write(true);
      }).toThrow('the preferences store was revoked with its runtime');
    });
  });

  /**
   * The production wiring, proved through the real singleton it is written
   * against — not only through the equivalent, purpose-built slot above.
   * `applicationSlot` is a module-level singleton shared by every test in
   * this file; this is the only one that drives it, and it awaits full
   * settlement so the slot is back at `empty` for anything that runs after.
   */
  it('refuses a captured reference through the production singleton once withdrawal is accepted', async () => {
    const services = await applicationSlot.replace(acquireApplicationRuntime);
    const detail = services.remembered.ganttDetail;

    const retiring = applicationSlot.retire();
    expect(applicationSlot.snapshot().status).toBe('retiring');

    // Proof: on 2026-09-22, changing `acquireApplicationRuntime`'s own
    // `isLive` to `() => true` made this receive a `ReferenceError` from the
    // real browser-store adapter's missing global in the node tier, while the
    // DOM-bearing configuration received no exception.
    expect(() => {
      detail.write(true);
    }).toThrow('the page withdrew this preference store before the access completed');

    await retiring;
    expect(applicationSlot.snapshot().status).toBe('empty');
  });

  it('gives its retirement the production budget when the slot is built with none', async () => {
    const budgets: number[] = [];
    const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>();
    const store = fakeBrowserStorage();
    await slot.replace(() => {
      const installed = installApplicationRuntime({ openStore: () => store });
      return {
        services: installed.services,
        close: (options) => {
          budgets.push(options.timeoutMs);
          return installed.close(options);
        },
      };
    });

    await slot.retire();

    expect(budgets).toEqual([RETIREMENT_BUDGET_MS]);
  });
});
