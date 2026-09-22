import { DiBag } from 'di-bag';

import { browserStorage } from '@/modules/preferences/browser-storage.repository';
import type {
  BrowserStorage,
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

/** What a built graph owes a transaction: one bounded close for everything it took. */
interface ClosableGraph {
  readonly close: (options: { timeoutMs: number }) => Promise<void>;
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
    return { services: read(), close: (options) => graph.close(options) };
  } catch (failure) {
    throw new PartialAcquisitionError(failure, (options) => graph.close(options));
  }
}

/** The one dependency of the page's runtime: how this browser's store is reached. */
export interface ApplicationDependencies {
  /** Defaults to the real adapter; a test passes a fake, and nothing else does. */
  readonly openStore: () => BrowserStorage;
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
  const bag = DiBag.createBuilder()
    .installModule(preferencesModule)
    .register({ browserStore: DiBag.fromSyncFactory(() => dependencies.openStore()) })
    .build();
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

/** The production acquisition, named so a caller passes a function and not a call. */
export const acquireApplicationRuntime: Acquire<ApplicationServices> = () =>
  installApplicationRuntime();
