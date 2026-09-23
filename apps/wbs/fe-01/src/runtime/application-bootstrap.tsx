import { type ComponentType, type ReactNode, StrictMode } from 'react';
import { createRoot, type RootOptions } from 'react-dom/client';

import { App } from '@/app';
import type { DisclosedFault } from '@/components/chrome/fault-disclosure';
import { LifetimeFault } from '@/components/chrome/lifetime-fault';
import { ROOT_FAULT_OPTIONS } from '@/components/chrome/root-fault-options';

import {
  acquireApplicationRuntime,
  type ApplicationServices,
  applicationSlot,
} from './application-runtime';
import { ApplicationServicesProvider } from './application-services-context';
import { type Acquire, type LifetimeSlot, TransitionSupersededError } from './lifetime-slot';

/** What this bootstrap draws into, and what lets it take a tree back down. */
export interface BootstrapRoot {
  readonly render: (tree: ReactNode) => void;
  /** Unmounts synchronously — a component's own cleanup effects run inside this call. */
  readonly unmount: () => void;
}

/** What the page's bootstrap is wired from; production passes none of it. */
export interface BootstrapDependencies {
  /** How the page's runtime is built. Defaults to the production installation. */
  readonly acquire: Acquire<ApplicationServices>;
  /** The slot that owns it. Defaults to the page's one slot. */
  readonly slot: LifetimeSlot<ApplicationServices>;
  /** React's root factory, so a test can watch what this renders into it, and unmounts it. */
  readonly mount: (host: Element, options: RootOptions) => BootstrapRoot;
  /** The tree drawn once the runtime is live; the production entry supplies the real `App`. */
  readonly app: ComponentType;
  /**
   * Where `pagehide` and `pageshow` are heard.
   *
   * Injected rather than read off `window` inside this function, so a test drives
   * page-lifecycle events deterministically instead of dispatching them against the
   * real document. Production passes `window`, once, here.
   */
  readonly eventTarget: EventTarget;
}

const PRODUCTION: BootstrapDependencies = {
  acquire: acquireApplicationRuntime,
  slot: applicationSlot,
  mount: (host, options) => createRoot(host, options),
  app: App,
  eventTarget: window,
};

/**
 * True for a `pageshow` restored from the back/forward cache, whatever the
 * event's own concrete type turns out to be in a given environment.
 *
 * A user-defined type guard over `'persisted' in event` rather than an
 * `instanceof PageTransitionEvent` check: jsdom, and this file's own tests,
 * dispatch a plain `Event` carrying the flag, and both are real `pageshow`
 * deliveries as far as this module is concerned.
 */
function isPersistedPageShow(event: Event): event is Event & { readonly persisted: boolean } {
  if (!('persisted' in event)) return false;
  // The boundary: the `in` check just above is what makes this narrowing safe —
  // `Event` itself declares no `persisted` member, so nothing shorter than a
  // property probe can ask the question this guard exists to answer.
  const flagged = event as Event & { readonly persisted: unknown };
  return flagged.persisted === true;
}

/**
 * Everything between an empty document and a rendering page.
 *
 * The runtime is built **before** the React root renders anything and outside
 * `<StrictMode>`: a runtime created inside the tree is built twice in
 * development, and one created in a lazy initialiser is closed by Strict Mode's
 * first cleanup and reused by its second setup.
 *
 * The first publication is a `replace` on an empty slot, awaited like every later
 * transition, so the initial acquisition is bounded, queued and transactional —
 * see {@link import('./lifetime-slot').LifetimeSlot}.
 *
 * A refused transition is a **modelled outcome, not a fault**: the slot has
 * already turned the refusal into the sanitized public report, and this renders
 * that report instead of the app. It never reads the refusal itself, which is why
 * the state is read back from the slot rather than caught as a value.
 *
 * `pagehide` (its own `persisted` flag intentionally unread — a `pagehide` never
 * rebuilds, so nothing distinguishes the two cases) retires the runtime through
 * the slot **and invalidates the mounted root**, so a later persisted `pageshow`
 * never inherits it: the map's own words are "unmounts/invalidates the React
 * root" and "build fresh runtimes/root/listeners", and reusing a mounted tree
 * would leave `App`'s own `fetchMe` effect (an empty-dependency `useEffect`)
 * never rerun, because React does not remount a tree it is only asked to update
 * again.
 *
 * **This module is a single, page-lifetime instance — there is exactly one of it
 * for as long as the page exists, and its own root and reporting are never
 * contested by another instance.** It has no `import.meta.hot` dependency and
 * no hot-module-replacement handling: see
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-e-page-lifecycle.md`
 * (section 1 and section 11) for why, and for what a later packet has to
 * design and model-test before adding HMR support here.
 *
 * **What this guarantees and what stays a limit:** every `pageshow` this module
 * hears while its own listener is still attached is answered — restore, or (for
 * `persisted: false`) ignored. A browser that discards the page without ever
 * delivering `pagehide` — a crash, a killed tab — leaves nothing for `retire()`
 * to observe; DI Bag's own disposers never run, and nothing here can make that
 * promise for a process that no longer exists. A `pagehide` the browser does not
 * follow with a same-tab `pageshow` is retirement with no later rejoin, which is
 * exactly ordinary navigation or a closed tab and needs none. **What restoration
 * does not itself prove**: this packet's own root-invalidation fix makes `App`'s
 * mount effects rerun, which is what re-fetches the signed-in identity — but the
 * session, catalog and project runtimes those effects reach into are later
 * packets' own scope, not proved complete here.
 *
 * @throws when the slot refuses without becoming fatal, which its own contract
 * makes impossible: an unreachable union reaches nobody silently.
 */
export async function bootstrapApplication(
  host: Element,
  dependencies: BootstrapDependencies = PRODUCTION,
): Promise<void> {
  /**
   * The React root, created on **first draw** and never before, and taken back
   * down — synchronously, running the tree's own cleanup effects — by
   * {@link invalidateRoot} rather than ever reused across a retirement.
   *
   * The design document's "the bootstrap awaits the first `replace` before creating
   * the React root" is a real ordering and not a preference: a root that exists
   * while the runtime is still being acquired is a root a later edit can render
   * into. Nothing here mounts one until there is something true to draw.
   */
  let root: BootstrapRoot | null = null;
  const rootFor = (): BootstrapRoot => {
    // Proof: on 2026-09-22, creating the root eagerly made its mount status
    // `empty` instead of `live` (5 failed, 7 passed).
    // Proof: on 2026-09-22, assigning here unconditionally mounted a second root
    // for the fatal page: ['live', 'fatal'] instead of ['live'].
    root ??= dependencies.mount(host, ROOT_FAULT_OPTIONS);
    return root;
  };
  /**
   * The fault the *current* root, if any, has drawn — reset whenever the root
   * is taken down, so a later redraw of the same fault (root invalidated, then
   * restored) draws again rather than finding a stale match. Distinct from
   * `reportedFault` below: this is about the screen, not the console.
   */
  let drawnFault: DisclosedFault | null = null;
  /**
   * Takes the mounted root down, if there is one, so the next draw — a
   * persisted `pageshow`'s rebuild, or a later fatal report — mounts fresh
   * rather than rendering into a tree `App`'s own mount effects already ran
   * for. Called from `pagehide` unconditionally: the map's own "unmounts/
   * invalidates the React root".
   */
  const invalidateRoot = (): void => {
    if (root === null) return;
    root.unmount();
    root = null;
    // Proof: on 2026-09-23, dropping this reset made 'hiding and restoring an
    // already-fatal page…' fail: the redraw after restoration never ran,
    // because `drawnFault` still matched the fault the root just taken down
    // had already drawn.
    drawnFault = null;
  };
  /**
   * The fault already logged, so one refusal is reported once — **not** once
   * per root. Separate from `drawnFault`: hiding and restoring an already-
   * reported fatal page must redraw it without reporting it a second time.
   */
  let reportedFault: DisclosedFault | null = null;
  const showFatal = (fault: DisclosedFault): void => {
    // Proof: on 2026-09-22, dropping this guard drew and logged one refusal twice
    // (2 failed, 10 passed).
    if (reportedFault !== fault) {
      reportedFault = fault;
      // Proof: on 2026-09-22, logging the caught refusal beside this disclosure put
      // a value rather than disclosed strings in the console (1 failed, 11 passed).
      console.error("the page's runtime failed", fault.sentence, fault.occurrenceId, fault.lost);
    }
    // Proof: on 2026-09-23, collapsing `drawnFault`/`reportedFault` back into one
    // `shown` variable (reset by `invalidateRoot`, as a single guard would have to
    // be for the redraw above to run at all) made 'hiding and restoring an
    // already-fatal page…' fail the other way: it reported the same fault twice.
    if (drawnFault === fault) return;
    drawnFault = fault;
    // Proof: on 2026-09-22, dropping this render left the fatal page with no tree;
    // its expected length 1 was 0 (2 failed, 10 passed).
    // Proof: on 2026-09-22, putting alice@example.com in the sentence exposed it
    // in the rendered fault props (1 failed, 11 passed).
    rootFor().render(<LifetimeFault fault={fault} />);
  };
  // Every later fatal state reaches the page through the slot rather than through a
  // second policy: a retirement that rejects or outruns its wait is a disclosure
  // boundary exactly as a refused construction is, and the map requires the same
  // sanitized report for both. This module never releases this subscription: it is
  // the page's only instance, for the page's whole life, so there is nothing for it
  // to leak into.
  // Proof: on 2026-09-22, dropping this subscription left a failed retirement
  // with one rendered tree instead of two (1 failed, 11 passed).
  dependencies.slot.subscribe(() => {
    const state = dependencies.slot.snapshot();
    if (state.status === 'fatal') showFatal(state.fault);
  });

  /**
   * One attempt to publish a runtime and draw from it: the first call this
   * bootstrap ever makes, and every rebuild a persisted `pageshow` asks for
   * afterward. Factored out rather than inlined twice, so both share the one
   * fence below it and the one refusal handling above it.
   */
  const attempt = async (): Promise<void> => {
    try {
      await dependencies.slot.replace(dependencies.acquire);
    } catch (refusal: unknown) {
      // A newer request won: controlled cancellation, which the slot models rather
      // than treats as a fault — reachable from this single instance's own repeated
      // pagehide/pageshow cycles (a `pagehide`'s own `retire()` outranking a
      // `pageshow`'s still-queued `replace()`), not from a second instance: this
      // module has exactly one.
      // Proof: on 2026-09-22, dropping this branch made the losing bootstrap reject
      // with 'the slot is empty' instead of drawing nothing (2 failed, 10 passed).
      if (refusal instanceof TransitionSupersededError) return;
      // Nothing else about the refusal is read: the slot disclosed it already, and a
      // value this function could read is a value it could render. Only its type is.
      const refused = dependencies.slot.snapshot();
      if (refused.status !== 'fatal') {
        // The cause is attached and never read here: this Error ends the bootstrap, it
        // is not disclosed to anybody, and `preserve-caught-error` is right that
        // dropping the refusal would lose the only account of what happened.
        throw new Error(`the page's runtime was refused and the slot is ${refused.status}`, {
          cause: refusal,
        });
      }
      showFatal(refused.fault);
      return;
    }
    // The fence after the await: a retirement — including one a subscriber asked for
    // while this transition was settling — withdraws publication **synchronously**, so
    // a bootstrap that drew the app here without looking would draw it from a runtime
    // the page has already given up. Nothing is drawn instead: whoever won owns the
    // page now.
    //
    // It compares the **status** and not the identity of the services this transition
    // returned, and that is rule R5 rather than laziness: a slot that reached `live`
    // holding somebody else's runtime between this `await` and this line is not
    // reachable — transitions are serialized and every replacement passes through
    // `retiring`, which this catches — so an identity check here could not be made to
    // fail by any fault (measured: removing that half left all 11 cases green). The
    // packet that publishes these services through a React context adds it back with
    // the test that can then break it.
    // Proof: on 2026-09-22, removing this fence let the model draw the app while
    // the slot was `retiring` (1 failed, 11 passed).
    if (dependencies.slot.snapshot().status !== 'live') return;
    const Tree = dependencies.app;
    rootFor().render(
      <StrictMode>
        {/* Proof: on 2026-09-22, acquiring inside this tree made the Strict Mode
        runtime count 3 instead of 1 (1 failed, 11 passed). */}
        <ApplicationServicesProvider slot={dependencies.slot}>
          <Tree />
        </ApplicationServicesProvider>
      </StrictMode>,
    );
  };

  /**
   * Retires the current runtime for `pagehide`.
   *
   * The caller does not wait for this to settle, and does not need to: this
   * function's own rejection handler is not a bare silencer — it reads the
   * slot's own post-rejection snapshot and shows the fatal state directly
   * through the same {@link showFatal} the subscription and `attempt()`'s own
   * `catch` use, so a retirement failure is reported exactly once regardless
   * of which of the three paths observes it first.
   *
   * `retire()`'s own contract (`lifetime-slot.ts`) rejects in exactly one
   * modelled way: leaving the slot terminally fatal. Unlike `replace()`, its
   * own ordinal fence sits *after* a `retire` request's own early return, so
   * `TransitionSupersededError` can never reach here — there is nothing for
   * this function to distinguish it from. A rejection that leaves the slot
   * anywhere else is not a modelled outcome at all, and is rethrown with its
   * own cause rather than swallowed, exactly as `attempt()`'s own catch
   * refuses to guess at an unrecognised refusal.
   * Proof: on 2026-09-23, `application-bootstrap.test.tsx`'s own "a retirement
   * refusal that leaves the slot anywhere but fatal is not silently swallowed"
   * — a fake slot whose `retire()` rejects while its own `snapshot()` still
   * reads `live`, a shape the real slot's own contract never produces —
   * observes this `throw` through `process.on('unhandledRejection', …)`.
   * Reverting it to the earlier bare swallow fails that same test: `expected
   * […] to have a length of 1 but got 0`.
   */
  const startRetirement = (): void => {
    dependencies.slot.retire().catch((refusal: unknown) => {
      const state = dependencies.slot.snapshot();
      if (state.status === 'fatal') {
        showFatal(state.fault);
        return;
      }
      throw new Error(`pagehide's own retirement was refused and the slot is ${state.status}`, {
        cause: refusal,
      });
    });
  };

  const onPageHide = (): void => {
    // Proof: on 2026-09-23, dropping this call left the mounted tree in place
    // across a persisted restore, so `App`'s own mount effect (an
    // empty-dependency `useEffect`) never reran on rebuild.
    invalidateRoot();
    startRetirement();
  };
  /**
   * A persisted `pageshow`: rebuild through the same {@link attempt} the first
   * draw used.
   *
   * **No bookkeeping joins this to a `pagehide`'s own retirement, because none
   * is needed.** `dependencies.slot.replace` queues behind whatever transition
   * the slot is already running — that is the slot's own serialization
   * (`docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md`),
   * not a promise this module tracks — so a `replace` issued here sits
   * behind an in-flight `pagehide` retirement exactly as "join, then rebuild"
   * asks, and a slot a failed retirement left terminally fatal refuses this
   * `replace` (and never calls `acquire`) through the same terminal check
   * every other request meets, before {@link attempt}'s own `catch` shows the
   * fault this module already subscribed to.
   */
  const onPageShow = (event: Event): void => {
    if (!isPersistedPageShow(event)) return;
    void attempt();
  };
  dependencies.eventTarget.addEventListener('pagehide', onPageHide);
  dependencies.eventTarget.addEventListener('pageshow', onPageShow);

  await attempt();
}
