import { DiBagCloseCancelledError } from 'di-bag';

import { type DisclosedFault, discloseFault } from '@/components/chrome/fault-disclosure';

/**
 * How long a required disposal is waited for before the transition fails.
 *
 * One deterministic number for every lifetime, because the budget is an
 * implementation choice and not a reader's: a page whose old project will not
 * let go has to say so rather than sit blank. Five seconds is the same order as
 * the reread this page already waits through, and it is long enough that a
 * socket close and an aborted fetch settle inside it.
 *
 * A timeout is **not** cancellation: DI Bag goes on disposing after the wait
 * expires, and {@link createLifetimeSlot} keeps observing that work.
 */
export const RETIREMENT_BUDGET_MS = 5_000;

/** A built lifetime: its narrow public services, and the close that gives them back. */
export interface RetirableRuntime<S> {
  readonly services: S;
  /** Bounded on purpose; the caller's wait ends, the disposal does not. */
  readonly close: (options: { timeoutMs: number }) => Promise<void>;
}

/**
 * How a lifetime is built: synchronously, and **transactionally**.
 *
 * A construction that fails after acquiring anything must throw
 * {@link PartialAcquisitionError} carrying the close for what it took. DI Bag
 * releases a partially acquired graph only through `close()` on the bag that
 * acquired it (measured: a factory that pushed a disposer and then threw left it
 * unrun until `bag.close()`), so a builder that resolves services one by one has
 * to keep that bag reachable. A builder that throws anything else is taken at
 * its word: it acquired nothing.
 */
export type Acquire<S> = () => RetirableRuntime<S>;

/**
 * A construction that failed after acquiring something.
 *
 * `release` is the bounded close for whatever it took, and the slot awaits it
 * before publishing the fatal state — an orphan graph nobody can reach is worse
 * than a failed transition, and marking the slot fatal disposes nothing by
 * itself.
 */
export class PartialAcquisitionError extends Error {
  constructor(
    override readonly cause: unknown,
    readonly release: (options: { timeoutMs: number }) => Promise<void>,
  ) {
    super('the lifetime could not be built, and what it acquired must be released');
    this.name = 'PartialAcquisitionError';
  }
}

/**
 * A request that a newer one replaced before it could publish.
 *
 * Modelled and thrown rather than resolved with somebody else's services: three
 * project selections in one page still leave one runtime live, and the losers are
 * told they lost instead of being handed a runtime they do not own.
 */
export class TransitionSupersededError extends Error {
  constructor(requested: number, newest: number) {
    super(`lifetime transition ${String(requested)} was superseded by ${String(newest)}`);
    this.name = 'TransitionSupersededError';
  }
}

/**
 * What one lifetime slot holds, as one value delivery can select from.
 *
 * | From              | Event                                                  | To                       |
 * | ----------------- | ------------------------------------------------------ | ------------------------ |
 * | `empty`           | `replace` accepted                                     | `constructing`           |
 * | `live`            | `replace` or `retire` accepted (**synchronously**)      | `retiring`               |
 * | `retiring`        | the withdrawn runtime's disposal succeeded, build asked  | `constructing`           |
 * | `retiring`        | that disposal succeeded, `retire`                        | `empty`                  |
 * | `retiring`        | that disposal rejected or outran its budget              | `fatal`, terminal        |
 * | `retiring`        | the request was overtaken while that disposal ran        | refused as superseded    |
 * | `constructing`    | the build succeeded and is still the newest request      | `live`                   |
 * | `constructing`    | the build succeeded but a re-entrant request overtook it  | closed, then superseded  |
 * | `constructing`    | the build failed; what it acquired was released           | `fatal`, not terminal    |
 * | `constructing`    | the build failed and that release rejected or timed out   | `fatal`, terminal        |
 * | `fatal`, terminal | any request                                            | refused with the refusal |
 * | `fatal`, not t.   | `replace`                                              | `constructing`           |
 *
 * `fatal` is what a reader is shown: the sanitized public report — the same
 * sentence and occurrence handle the root fault path discloses — because a
 * cleanup failure is a disclosure boundary exactly as a render fault is.
 *
 * `terminal` says whether this slot may hold a runtime again, and the two cases
 * are genuinely different:
 *
 * - a **disposal** that failed or outran its wait may still be holding what it
 *   was asked to give back — a socket, a timer, a lock — so the slot refuses
 *   every later transition with that same refusal;
 * - a **construction** that failed, whose acquisitions were then released, holds
 *   nothing at all, so a later transition may build again.
 */
export type LifetimeState<S> =
  | { readonly status: 'empty' }
  | { readonly status: 'live'; readonly services: S }
  | { readonly status: 'retiring' }
  | { readonly status: 'constructing' }
  | { readonly status: 'fatal'; readonly fault: DisclosedFault; readonly terminal: boolean };

/** How the disposal that outlived its bounded wait ended, as far as the slot has seen. */
export type LateCleanup = 'none' | 'pending' | 'settled' | 'failed';

/**
 * The one slot that owns the current runtime of one lifetime.
 *
 * A store (rule F2): `subscribe` and a `snapshot` that is stable until the slot
 * changes. It imports no React and holds no component state.
 *
 * **There is no synchronous first publication.** A lifetime's first runtime is a
 * `replace` on an empty slot, which is awaited like any other: initial
 * acquisition is bounded, transactional and queued exactly as a replacement is,
 * because an `open` beside the queue was how an initial partial acquisition
 * leaked and how a queued replacement came to overwrite a runtime nobody closed.
 * The page's bootstrap awaits it before it creates the React root, which is what
 * DI Bag's own React guide prescribes anyway.
 */
export interface LifetimeSlot<S> {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => LifetimeState<S>;
  /**
   * Retire what is current and publish the replacement **only if** that
   * disposal succeeded and no newer request arrived meanwhile.
   *
   * Publication is withdrawn **synchronously**, before this returns its promise.
   * Transitions then run one at a time, in request order, and the request's
   * generation is rechecked after every await and after the factory returns.
   *
   * @throws the disposal's failure, leaving the slot terminally fatal and the
   * replacement never built — DI Bag's own React recipe reports and continues,
   * and rule R5 refuses. Throws {@link TransitionSupersededError} when a newer
   * request won, and the construction's own failure when the build throws.
   */
  readonly replace: (acquire: Acquire<S>) => Promise<S>;
  /** Withdraw and retire, leaving the slot empty on success and fatal on failure. */
  readonly retire: () => Promise<void>;
  /**
   * The disposal that outlived its bounded wait, for the caller that wants to
   * know how it ended. `null` until a bounded wait has expired.
   */
  readonly lateCleanup: () => Promise<void> | null;
  /** How that late disposal ended, as far as this slot has observed it. */
  readonly lateOutcome: () => LateCleanup;
}

/**
 * The still-running disposal behind a bounded-wait rejection, or `null`.
 *
 * DI Bag's `DiBagCloseCancelledError` carries the shared shutdown promise; a
 * timeout that dropped it would leave the page unable to say whether the old
 * runtime ever let go, and would leave that promise unhandled.
 */
function lateCleanupOf(refusal: unknown): Promise<void> | null {
  if (!(refusal instanceof DiBagCloseCancelledError)) return null;
  // Proof: on 2026-09-22, returning null made 'fails the transition when the retirement
  // outruns its budget, and keeps watching the disposal' receive null instead of a Promise.
  return refusal.cleanupPromise;
}

/** What one queued transition was asked for; a tagged request, never a nullable builder. */
type Request<S> =
  { readonly kind: 'retire' } | { readonly kind: 'replace'; readonly acquire: Acquire<S> };

/** What one transition did; a tagged outcome, so no service value is ever a sentinel. */
type Outcome<S> =
  { readonly kind: 'retired' } | { readonly kind: 'published'; readonly services: S };

/**
 * One lifetime's ownership, as a serialized state machine.
 *
 * Three rules hold the ownership invariant, and each has its own mutation:
 *
 * 1. **Withdrawal is synchronous.** `replace` and `retire` withdraw publication
 *    and number the request before they return, so a reader cannot see a runtime
 *    the page has given up on, and a second trigger finds nothing current.
 * 2. **One transition at a time**, so two disposals never overlap.
 * 3. **Subscribers never run inside a transition.** `publish` mutates the state
 *    synchronously — `snapshot()` is correct the instant a request is accepted —
 *    but notifies from a microtask, coalescing. A subscriber that asks for
 *    another replacement therefore always arrives *between* steps, where the
 *    generation checks can see it, instead of in the middle of one. The
 *    generation is rechecked after the disposal **and after the factory
 *    returns**, because a factory can re-enter too, and a runtime built for a
 *    request that lost while its factory ran is given back rather than published.
 */
export function createLifetimeSlot<S>(
  /**
   * The bounded wait this slot gives a disposal, in milliseconds.
   *
   * Production takes {@link RETIREMENT_BUDGET_MS}; a test names a short one so
   * the never-settling-disposer proofs do not sit for five seconds. There is no
   * other reason to pass it, and no lifetime here differs.
   */
  // Proof: on 2026-09-22, defaulting to 4,000 made 'gives the retirement the production
  // budget when it is built with none' receive [4000] instead of [5000].
  budgetMs: number = RETIREMENT_BUDGET_MS,
): LifetimeSlot<S> {
  let state: LifetimeState<S> = { status: 'empty' };
  /** The published runtime, while there is one. */
  let held: RetirableRuntime<S> | null = null;
  /** Withdrawn and awaiting disposal; whoever reaches it first disposes it. */
  let withdrawn: RetirableRuntime<S> | null = null;
  let late: Promise<void> | null = null;
  let lateEnded: LateCleanup = 'none';
  /**
   * The refusal that made this slot terminally fatal, rethrown to every later
   * trigger.
   *
   * A holder rather than a `let`, and that is load-bearing: `refuse()` assigns it
   * from another function, so the compiler narrows a plain variable to `null` for
   * the whole of `transition` and `no-unnecessary-condition` then refuses the
   * second check below as impossible — the very check whose removal let a queued
   * request publish into a terminal slot.
   */
  const terminal: { refusal: unknown } = { refusal: null };
  /**
   * The refusal so far, read through a call.
   *
   * Not `terminal.refusal` inline: the compiler narrows that property to `null`
   * for the whole of `transition` — `refuse()` assigns it from another function —
   * and `no-unnecessary-condition` then refuses the second check in `transition`
   * as impossible. It is not impossible: it is the check whose removal let a
   * request that was already queued publish into a terminal slot.
   */
  const refusalSoFar = (): unknown => terminal.refusal;
  /** The transition currently running, so the next one queues behind it. */
  let running: Promise<unknown> | null = null;
  /** The newest accepted request; an older one that has not published yet is superseded. */
  let newest = 0;
  /** True while a notification is already queued, so one microtask serves many changes. */
  let notifying = false;
  const listeners = new Set<() => void>();

  /**
   * Changes the state now and tells subscribers later.
   *
   * The deferral is the reentry rule, not an optimisation: a listener invoked
   * from inside a transition could request another replacement between the
   * generation check and the factory call, and the runtime the factory then
   * built would belong to nobody.
   */
  const publish = (next: LifetimeState<S>): void => {
    state = next;
    // Proof: on 2026-09-22, notifying synchronously made 'cannot be superseded by a
    // subscriber running inside a transition' report zero closes for the third runtime.
    if (notifying) return;
    notifying = true;
    void Promise.resolve().then(() => {
      notifying = false;
      for (const listener of [...listeners]) listener();
    });
  };

  /** Records a bounded wait that expired, and keeps watching what it stopped waiting for. */
  const observeLate = (refusal: unknown): void => {
    late = lateCleanupOf(refusal);
    if (late === null) return;
    lateEnded = 'pending';
    // Proof: on 2026-09-22, dropping this observation made 'observes a late disposal that
    // finishes after the wait expired' receive 'pending' instead of 'settled'.
    void late.then(
      () => {
        lateEnded = 'settled';
        for (const listener of [...listeners]) listener();
      },
      () => {
        lateEnded = 'failed';
        for (const listener of [...listeners]) listener();
      },
    );
  };

  /** Makes this slot terminally fatal, and hands the refusal on. */
  const refuse = (refusal: unknown): never => {
    // Proof: on 2026-09-22, dropping this assignment made 'refuses every later transition
    // of a slot whose retirement failed' resolve with the third runtime instead of rejecting.
    terminal.refusal = refusal;
    observeLate(refusal);
    publish({ status: 'fatal', fault: discloseFault(refusal), terminal: true });
    // The boundary: `refusal` is a value DI Bag already threw, rethrown unchanged
    // so the caller sees the real failure rather than a paraphrase of it.

    throw refusal;
  };

  /** Disposes the withdrawn runtime, once, under the slot's budget. */
  const disposeWithdrawn = async (): Promise<void> => {
    const disposing = withdrawn;
    if (disposing === null) return;
    withdrawn = null;
    try {
      await disposing.close({ timeoutMs: budgetMs });
    } catch (refusal) {
      refuse(refusal);
    }
  };

  /** One queued transition, generation-checked after every await and after the factory. */
  const transition = async (request: Request<S>, ordinal: number): Promise<Outcome<S>> => {
    const ahead = running;
    const mine = (async (): Promise<Outcome<S>> => {
      // One transition at a time, in request order: the queue is what keeps two
      // disposals from overlapping and what makes the fences below meaningful.
      // Proof: on 2026-09-22, dropping this wait made the model report r3 acquired once,
      // never closed and not live in 'holds every invariant it claims'.
      if (ahead !== null) await ahead.catch(() => undefined);
      // Proof: on 2026-09-22, dropping this check made 'refuses a request that was already
      // queued when the disposal failed' receive rejected then fulfilled.
      if (refusalSoFar() !== null) throw terminal.refusal;
      // A disposal that fails throws from here, through `refuse`, so a second
      // terminal check after it would be one no mutation could break.
      await disposeWithdrawn();
      if (request.kind === 'retire') {
        if (state.status === 'retiring') publish({ status: 'empty' });
        return { kind: 'retired' };
      }
      // Fence after the disposal: a request overtaken *while* the old runtime was
      // letting go must not build.
      // Proof: on 2026-09-22, making this condition unconditional made the model report
      // 'the latest request did not win' and all 25 runtime tests failed.
      // Proof: on 2026-09-22, dropping this fence made 'does not build for a request that a
      // newer one overtook during the disposal' receive one doomed factory call, not zero.
      if (ordinal !== newest) throw new TransitionSupersededError(ordinal, newest);
      publish({ status: 'constructing' });
      let built: RetirableRuntime<S>;
      try {
        built = request.acquire();
      } catch (failure) {
        // Proof: on 2026-09-22, dropping this release made the model report r1 acquired once,
        // never closed and not live in 'holds every invariant it claims'.
        if (failure instanceof PartialAcquisitionError) {
          try {
            await failure.release({ timeoutMs: budgetMs });
          } catch (releaseRefusal) {
            // Proof: on 2026-09-22, swallowing this refusal made 'is terminal when the
            // half-finished construction cannot be released' receive the construction error.
            refuse(releaseRefusal);
          }
        }
        // Nothing is held now: the old runtime was disposed and everything this
        // construction acquired has been released. Fatal for the reader, not
        // terminal for the slot — see {@link LifetimeState}.
        // Proof: on 2026-09-22, dropping this publication made 'is fatal but not terminal
        // when the replacement’s construction throws' receive 'constructing', not 'fatal'.
        publish({ status: 'fatal', fault: discloseFault(failure), terminal: false });

        throw failure;
      }
      // Fence after the factory: a factory may itself ask for another
      // replacement, so what it built is given back rather than published.
      // Proof: on 2026-09-22, dropping this fence made the model report r2 acquired once,
      // never closed and r3 live in 'holds every invariant it claims'.
      if (ordinal !== newest) {
        withdrawn = built;
        publish({ status: 'retiring' });
        await disposeWithdrawn();
        throw new TransitionSupersededError(ordinal, newest);
      }
      held = built;
      publish({ status: 'live', services: built.services });
      return { kind: 'published', services: built.services };
    })();
    running = mine;
    try {
      return await mine;
    } finally {
      if (running === mine) running = null;
    }
  };

  /**
   * Accepts a request: withdraws publication **now** and numbers the request so
   * the fences can tell it from a newer one.
   */
  const accept = (): number => {
    newest += 1;
    // Proof: on 2026-09-22, dropping this withdrawal made 'withdraws publication
    // synchronously, before the first await' still observe the live runtime.
    if (held !== null) {
      withdrawn = held;
      held = null;
      publish({ status: 'retiring' });
    }
    return newest;
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => state,
    replace: async (acquire) => {
      const ordinal = accept();
      const outcome = await transition({ kind: 'replace', acquire }, ordinal);
      if (outcome.kind !== 'published') {
        throw new Error('a replacement transition retired instead of publishing');
      }
      return outcome.services;
    },
    retire: async () => {
      const ordinal = accept();
      await transition({ kind: 'retire' }, ordinal);
    },
    lateCleanup: () => late,
    lateOutcome: () => lateEnded,
  };
}
