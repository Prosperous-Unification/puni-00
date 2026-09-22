import { DiBag } from 'di-bag';
import { describe, expect, it } from 'vitest';

import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';
import { THEME_KEY } from '@/modules/preferences/preference-keys';

import {
  acquireTransactionally,
  type ApplicationServices,
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
  readonly graph: { readonly close: (options: { timeoutMs: number }) => Promise<void> };
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
    .register({
      first: DiBag.withDisposal(
        DiBag.fromSyncFactory((): string => 'the resource it took'),
        async () => {
          disposals.push('first');
          await Promise.resolve();
        },
      ),
      second: DiBag.fromSyncFactory((): string => {
        throw new Error('alice@example.com could not be composed');
      }),
    })
    .build();
  return {
    graph: bag,
    disposals: () => disposals,
    read: () => ({ first: bag.resolve('first'), second: bag.resolve('second') }),
  };
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

  /** Retirement gives the store back, through the slot the page really uses. */
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
