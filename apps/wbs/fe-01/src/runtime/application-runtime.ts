import { DiBag } from 'di-bag';

import { browserStorage } from '@/modules/preferences/browser-storage.repository';
import type {
  BrowserStorage,
  IsRuntimeLive,
  Preferences,
  RememberedPreferences,
} from '@/modules/preferences/contract';
import { preferencesModule } from '@/modules/preferences/module';

import {
  type Acquire,
  createLifetimeSlot,
  type LifetimeSlot,
  PartialAcquisitionError,
  type RetirableRuntime,
} from './lifetime-slot';

/**
 * What the page's own runtime publishes, and the whole of it.
 *
 * `remembered` is the feature-service delivery takes. `preferences` is the
 * resource, carried here for `src/lib/remembered.ts` alone and **never for a
 * React context**: see `PreferencesExports`, which records why it is exported
 * and what closing it needs.
 *
 * No bag, no browser store, no repository. That is rule K2, and the runtime's own
 * test enumerates this surface rather than trusting the type — an object with an
 * extra property still satisfies an interface.
 */
export interface ApplicationServices {
  readonly preferences: Preferences;
  readonly remembered: RememberedPreferences;
}

/**
 * What a built graph owes a transaction: one bounded close for everything it took.
 *
 * DI Bag names the bound `waitTimeoutMs`; the lifetime slot's own contract keeps
 * `timeoutMs`, and {@link acquireTransactionally} is the one place that translates.
 */
interface ClosableGraph {
  readonly close: (options: { waitTimeoutMs: number }) => Promise<void>;
}

/**
 * Reads a built graph's services, or gives back everything the reading acquired.
 *
 * The transaction the lifetime slot's contract asks for, in one place because
 * every lifetime after this one needs the same shape. DI Bag releases a
 * partially acquired graph **only** through `close()` on the bag that acquired
 * it, so a read that throws halfway cannot release anything by itself: it raises
 * {@link PartialAcquisitionError} carrying that bag's bounded close, and the slot
 * awaits it before it publishes anything.
 *
 * Every failure is wrapped, including one that acquired nothing, and that is
 * deliberate rather than sloppy: a resolve that throws cannot say whether an
 * earlier dependency of the same graph was acquired first, and closing a graph
 * that took nothing runs no disposer.
 *
 * @throws {@link PartialAcquisitionError} for any failure of `read`, with the
 * original failure as its `cause`.
 */
export function acquireTransactionally<S>(
  graph: ClosableGraph,
  read: () => S,
): RetirableRuntime<S> {
  try {
    // Proof: on 2026-09-22, a resolved no-op close left the store readable after
    // 'revokes the store it owns when the installation closes' (3 failed, 39 passed).
    return {
      services: read(),
      // Proof: on 2026-09-25, handing DI Bag `options.timeoutMs + 1` here failed 'hands DI Bag the
      // budget of a runtime’s own close' with `expected 26 to be 25`; with that assertion
      // weakened to a type check the same fault passed the whole file.
      close: (options) => graph.close({ waitTimeoutMs: options.timeoutMs }),
    };
  } catch (failure) {
    // Proof: on 2026-09-22, rethrowing this unwrapped made 'releases everything a
    // half-finished read acquired' receive Error instead of PartialAcquisitionError.
    // Proof: on 2026-09-22, a resolved no-op release made that test record []
    // instead of ['first']; the graph's disposer never ran (1 failed, 41 passed).
    throw new PartialAcquisitionError(failure, (options) =>
      // Proof: on 2026-09-25, handing DI Bag `options.timeoutMs + 1` here failed 'hands DI Bag
      // the budget of a half-finished read’s release' with `expected 31 to be 30`; with that
      // assertion weakened to a type check the same fault passed the whole file.
      graph.close({ waitTimeoutMs: options.timeoutMs }),
    );
  }
}

/** The page's runtime's own dependencies: its store, and its own liveness. */
export interface ApplicationDependencies {
  /** Defaults to the real adapter; a test passes a fake, and nothing else does. */
  readonly openStore: () => BrowserStorage;
  /**
   * Whether this installation's own runtime is still the one a lifetime slot
   * is publishing, checked synchronously — see `contract.ts`'s
   * {@link IsRuntimeLive}. Optional because most callers of
   * {@link installApplicationRuntime} — every test that builds a runtime
   * directly, without a slot — never retire anything and so never need it;
   * omitting it keeps this module's preferences always live, exactly as
   * before this dependency existed. {@link acquireApplicationRuntime} is the
   * one caller that supplies the real one.
   */
  readonly isLive?: IsRuntimeLive;
}

/**
 * Installs the page's runtime: one bag, the preferences module, nothing else yet.
 *
 * Synchronous, because {@link Acquire} is and because every factory here is:
 * DI Bag's `build()` and `resolve()` run sync factories inline, and the slot's
 * two generation fences are sufficient only while construction cannot await.
 *
 * The bag is built here and nowhere else, so nothing outside this function can
 * reach a private binding or the graph itself — the returned surface is the two
 * public services, enumerated by a test.
 *
 * @throws {@link PartialAcquisitionError} when a service cannot be resolved,
 * carrying the bounded close for whatever was acquired first.
 */
export function installApplicationRuntime(
  dependencies: ApplicationDependencies = { openStore: browserStorage },
): RetirableRuntime<ApplicationServices> {
  const isLive = dependencies.isLive ?? (() => true);
  const bag = DiBag.createBuilder()
    .withInstalledModules([preferencesModule])
    .withServices({
      browserStore: DiBag.createProvider(() => dependencies.openStore(), {
        factoryReturnKind: 'sync-value',
      }),
    })
    .withServices({
      isLive: DiBag.createProvider(() => isLive, { factoryReturnKind: 'sync-value' }),
    })
    .buildContainer();
  // Proof: on 2026-09-22, returning the bag made this surface enumerate
  // ['preferences', 'remembered', 'bag'] (1 failed, 41 passed).
  // Proof: on 2026-09-22, hanging `resolve` beneath `preferences` made the
  // no-resolver assertion receive false (1 failed, 41 passed).
  return acquireTransactionally(bag, () => ({
    preferences: bag.resolve('preferences'),
    remembered: bag.resolve('remembered'),
  }));
}

/**
 * The one slot that owns the page's runtime.
 *
 * A module constant because there is exactly one page per document and because
 * the fatal state has to be readable by whatever renders it. It starts `empty`:
 * the first runtime is published by the bootstrap's `replace`, awaited like any
 * other transition.
 */
export const applicationSlot: LifetimeSlot<ApplicationServices> =
  createLifetimeSlot<ApplicationServices>();

/**
 * The production acquisition, named so a caller passes a function and not a call.
 *
 * The one production wiring of `isLive`: `applicationSlot.snapshot().status ===
 * 'live'`, checked against the same slot this factory is passed to
 * (`applicationSlot.replace(acquireApplicationRuntime)`, in
 * `application-bootstrap.tsx`). Reading `applicationSlot` from inside this
 * closure rather than importing it into `preferences.resource.ts` or
 * `module.ts` is what keeps rule K2's boundary: the slot is runtime
 * infrastructure, and only this composition root — never a module beneath
 * it — is allowed to know its own lifetime slot exists. Proved end to end,
 * through this real singleton, by `application-runtime.test.ts`'s own
 * "refuses a captured reference through the production singleton…" example —
 * not only by the equivalent, non-singleton example built against a
 * purpose-built slot.
 */
export const acquireApplicationRuntime: Acquire<ApplicationServices> = () =>
  installApplicationRuntime({
    openStore: browserStorage,
    // Proof: on 2026-09-22, returning true made the production-singleton test
    // reach the real adapter: `localStorage is not defined` in the node tier
    // and no exception at all in the DOM-bearing configuration.
    isLive: () => applicationSlot.snapshot().status === 'live',
  });
