import { createContext, type ReactNode, useContext, useRef, useSyncExternalStore } from 'react';

import type { RememberedPreferences } from '@/modules/preferences/contract';

import { type ApplicationServices, applicationSlot } from './application-runtime';
import type { LifetimeSlot } from './lifetime-slot';

/**
 * What a component under {@link ApplicationServicesProvider} may read: the slot
 * itself, never a snapshot taken once.
 *
 * The slot and not `ApplicationServices` directly, because rule F2 already made
 * the slot a store — `subscribe` and a `snapshot` stable until the next
 * transition — and {@link useApplicationServicesState} is what turns that store
 * into one React value through {@link applicationServicesStateFor}. Holding the
 * slot instead of a value means a runtime replaced after this provider mounted
 * is still followed: nothing here is fixed at provider-mount time.
 */
const ApplicationServicesContext = createContext<LifetimeSlot<ApplicationServices> | null>(null);

export interface ApplicationServicesProviderProps {
  /** Defaults to the page's one slot; a test passes its own, and nothing else does. */
  readonly slot?: LifetimeSlot<ApplicationServices>;
  readonly children: ReactNode;
}

/**
 * Publishes the page's runtime, through its slot, to the tree below.
 *
 * `apps/wbs/fe-01/src/runtime/application-bootstrap.tsx` mounts this once,
 * above `<App />`, only once the first transition has settled — so a reader
 * below it is always below a slot that has published at least one runtime.
 * What it reads from that slot **right now** is
 * {@link useApplicationServicesState}'s.
 */
export function ApplicationServicesProvider({
  slot = applicationSlot,
  children,
}: ApplicationServicesProviderProps): ReactNode {
  return (
    <ApplicationServicesContext.Provider value={slot}>
      {children}
    </ApplicationServicesContext.Provider>
  );
}

/**
 * What a consumer below {@link ApplicationServicesProvider} sees, at every
 * instant a `live` runtime is not certainly published.
 *
 * `live` carries the runtime's own `remembered`, exactly as
 * {@link ApplicationServices} published it — no wrapper. Every other slot
 * status — `empty`, `retiring`, `constructing` and `fatal` alike — reads as
 * `withdrawn`. `fatal` is not a fifth member here: `application-bootstrap.tsx`
 * already subscribes to the slot and replaces this whole tree with
 * `LifetimeFault` before a consumer under it could act on `withdrawn`.
 *
 * **This packet stops at the pure selector, deliberately, and section 4 of its
 * own plan document records why:** an access-time guard was tried and
 * withdrawn, and a withdrawal-at-the-source hook was tried and withdrawn too
 * — see
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-c-application-context.md`,
 * section 4. What this type and this module guarantee is narrower than either
 * attempt claimed: after the slot's own notification has committed, no
 * consumer **renders** `live` for a runtime the slot has moved past. A
 * reference already captured before that commit can still read and write
 * successfully until the runtime's own disposal actually revokes its store —
 * that gap is not closed here.
 */
export type ApplicationServicesState =
  | { readonly status: 'live'; readonly remembered: RememberedPreferences }
  | { readonly status: 'withdrawn' };

/** The one instance every withdrawn read returns — see {@link applicationServicesStateFor}. */
const WITHDRAWN: ApplicationServicesState = { status: 'withdrawn' };

/**
 * The slot's own state, turned into what a consumer may read.
 *
 * A pure function of one snapshot and nothing else — no cache, no ref, no
 * wrapper. `live` only when the slot itself is `live` right now, and every
 * other status reads as {@link WITHDRAWN}. See this type's own JSDoc, and the
 * plan document's section 4, for exactly what this does and does not
 * guarantee about a reference captured before the slot moved on.
 */
export function applicationServicesStateFor(
  slot: LifetimeSlot<ApplicationServices>,
): ApplicationServicesState {
  const state = slot.snapshot();
  return state.status === 'live'
    ? { status: 'live', remembered: state.services.remembered }
    : WITHDRAWN;
}

/**
 * The page's runtime, as the slot is publishing it right now.
 *
 * Rule K2's boundary, in React: the only preferences surface a component or a
 * hook may import is this one, never `ApplicationServices` or the `Preferences`
 * resource beneath it — see `modules/preferences/contract.ts`'s
 * `PreferencesExports`. Subscribed through `useSyncExternalStore`, so a
 * runtime the slot replaces or retires while this stays mounted is followed
 * rather than read once at mount.
 *
 * **Memoised by `remembered`'s own reference, for `useSyncExternalStore`'s own
 * contract, and for nothing else.** `applicationServicesStateFor` builds a
 * fresh object literal on every call, which `useSyncExternalStore` cannot use
 * directly as `getSnapshot` — its own contract requires the same reference
 * back until something real changed, or React logs "the result of getSnapshot
 * should be cached" and can re-render in a loop. The cache below exists
 * **only** to satisfy that contract; it decides nothing about whether a value
 * is still safe to read, and it never re-serves a cached `live` state once the
 * slot's own snapshot has left `live` — see `applicationServicesStateFor`'s
 * own JSDoc.
 *
 * @throws only when read below no {@link ApplicationServicesProvider} — a
 * wiring defect present from the first render, not a lifecycle transition a
 * retry could ever clear. Every other state this hook can observe is a member
 * of {@link ApplicationServicesState} and is returned, never thrown: a hook
 * that threw on an ordinary `withdrawn` tick would trip `AppFaultBoundary`,
 * whose own JSDoc says it "cannot heal itself" and never retries.
 */
export function useApplicationServicesState(): ApplicationServicesState {
  // Proof: on 2026-09-22, falling back to `applicationSlot` here instead of
  // throwing made 'throws when read below no provider' receive `null`
  // (no exception reported) in place of this message (1 failed, 11 passed).
  const slot = useContext(ApplicationServicesContext);
  if (slot === null) {
    throw new Error('useApplicationServicesState must be read below ApplicationServicesProvider');
  }
  const cache = useRef<{
    readonly remembered: RememberedPreferences | null;
    readonly state: ApplicationServicesState;
  }>({ remembered: null, state: WITHDRAWN });
  return useSyncExternalStore(slot.subscribe, () => {
    const next = applicationServicesStateFor(slot);
    const nextRemembered = next.status === 'live' ? next.remembered : null;
    if (nextRemembered !== cache.current.remembered) {
      cache.current = { remembered: nextRemembered, state: next };
    }
    return cache.current.state;
  });
}
