import { type ReactNode, StrictMode } from 'react';
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
import { type Acquire, type LifetimeSlot, TransitionSupersededError } from './lifetime-slot';

/** What the page's bootstrap is wired from; production passes none of it. */
export interface BootstrapDependencies {
  /** How the page's runtime is built. Defaults to the production installation. */
  readonly acquire: Acquire<ApplicationServices>;
  /** The slot that owns it. Defaults to the page's one slot. */
  readonly slot: LifetimeSlot<ApplicationServices>;
  /** React's root factory, so a test can watch what this renders into it. */
  readonly mount: (host: Element, options: RootOptions) => { render: (tree: ReactNode) => void };
}

const PRODUCTION: BootstrapDependencies = {
  acquire: acquireApplicationRuntime,
  slot: applicationSlot,
  mount: (host, options) => createRoot(host, options),
};

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
 * @throws when the slot refuses without becoming fatal, which its own contract
 * makes impossible: an unreachable union reaches nobody silently.
 */
export async function bootstrapApplication(
  host: Element,
  dependencies: BootstrapDependencies = PRODUCTION,
): Promise<void> {
  /**
   * The React root, created on **first draw** and never before.
   *
   * The design document's "the bootstrap awaits the first `replace` before creating
   * the React root" is a real ordering and not a preference: a root that exists
   * while the runtime is still being acquired is a root a later edit can render
   * into. Nothing here mounts one until there is something true to draw.
   */
  let root: { render: (tree: ReactNode) => void } | null = null;
  const rootFor = (): { render: (tree: ReactNode) => void } => {
    // Proof: on 2026-09-22, creating the root eagerly made its mount status
    // `empty` instead of `live` (5 failed, 7 passed).
    // Proof: on 2026-09-22, assigning here unconditionally mounted a second root
    // for the fatal page: ['live', 'fatal'] instead of ['live'].
    root ??= dependencies.mount(host, ROOT_FAULT_OPTIONS);
    return root;
  };
  /** The fault already on screen, so one refusal is shown and logged once. */
  let shown: DisclosedFault | null = null;
  const showFatal = (fault: DisclosedFault): void => {
    // Proof: on 2026-09-22, dropping this guard drew and logged one refusal twice
    // (2 failed, 10 passed).
    if (shown === fault) return;
    shown = fault;
    // Proof: on 2026-09-22, logging the caught refusal beside this disclosure put
    // a value rather than disclosed strings in the console (1 failed, 11 passed).
    console.error("the page's runtime failed", fault.sentence, fault.occurrenceId, fault.lost);
    // Proof: on 2026-09-22, dropping this render left the fatal page with no tree;
    // its expected length 1 was 0 (2 failed, 10 passed).
    // Proof: on 2026-09-22, putting alice@example.com in the sentence exposed it
    // in the rendered fault props (1 failed, 11 passed).
    rootFor().render(<LifetimeFault fault={fault} />);
  };
  // Every later fatal state reaches the page through the slot rather than through a
  // second policy: a retirement that rejects or outruns its wait is a disclosure
  // boundary exactly as a refused construction is, and the map requires the same
  // sanitized report for both.
  // Proof: on 2026-09-22, dropping this subscription left a failed retirement
  // with one rendered tree instead of two (1 failed, 11 passed).
  dependencies.slot.subscribe(() => {
    const state = dependencies.slot.snapshot();
    if (state.status === 'fatal') showFatal(state.fault);
  });
  try {
    await dependencies.slot.replace(dependencies.acquire);
  } catch (refusal: unknown) {
    // A newer request won: controlled cancellation, which the slot models rather
    // than treats as a fault. Whoever won owns the page now, so this bootstrap
    // draws nothing at all — not the app, and not a fatal page it has no fault for.
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
  rootFor().render(
    <StrictMode>
      {/* Proof: on 2026-09-22, acquiring inside this tree made the Strict Mode
      runtime count 3 instead of 1 (1 failed, 11 passed). */}
      <App />
    </StrictMode>,
  );
}
