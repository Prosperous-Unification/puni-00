import { DiBag } from 'di-bag';
import { describe, expect, it } from 'vitest';

import {
  createLifetimeSlot,
  PartialAcquisitionError,
  type RetirableRuntime,
  RETIREMENT_BUDGET_MS,
  TransitionSupersededError,
} from './lifetime-slot';

/** What the tests publish: a name, so a snapshot says which runtime is current. */
interface NamedServices {
  readonly name: string;
}

/** A promise a test settles when it chooses, for the disposals that outlive their wait. */
interface Deferred {
  readonly promise: Promise<void>;
  readonly settle: () => void;
  readonly refuse: () => void;
}

function deferred(): Deferred {
  let settle = (): void => undefined;
  let refuse = (): void => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    settle = resolve;
    refuse = () => {
      reject(new Error('the late disposal failed'));
    };
  });
  return { promise, settle, refuse };
}

/** What a built runtime recorded about its own disposal, for the assertions below. */
interface RuntimeRecord {
  readonly runtime: RetirableRuntime<NamedServices>;
  readonly name: () => string;
  /** How many times a factory handed this runtime out; 0 means it never built. */
  readonly builds: () => number;
  readonly closes: () => number;
  readonly budgets: () => readonly number[];
  readonly seenWhileDisposing: () => readonly string[];
}

/**
 * A runtime built the way production builds one — a DI Bag graph with one owned
 * resource — whose disposer this test chooses.
 *
 * Not a stub `close`: the refusals under test are DI Bag's own
 * `DiBagDisposalError` and `DiBagCloseCancelledError`, and a hand-written
 * rejection would prove the slot against a shape the library never produces.
 * The record also keeps the `timeoutMs` each close was given, which is how the
 * production budget is asserted where it is actually used.
 */
function runtimeNamed(
  name: string,
  dispose: () => Promise<void>,
  watch?: () => string,
): RuntimeRecord {
  let closes = 0;
  let builds = 0;
  const budgets: number[] = [];
  const seen: string[] = [];
  const bag = DiBag.createBuilder()
    .withServices({
      owned: DiBag.providerWithDisposal({
        provider: DiBag.createProvider(
          (): NamedServices => {
            builds += 1;
            return { name };
          },
          { factoryReturnKind: 'sync-value' },
        ),
        disposeService: async () => {
          closes += 1;
          if (watch !== undefined) seen.push(watch());
          await dispose();
        },
      }),
    })
    .buildContainer();
  const services = bag.resolve('owned');
  return {
    name: () => name,
    builds: () => builds,
    runtime: {
      services,
      close: (options) => {
        budgets.push(options.timeoutMs);
        return bag.close({ waitTimeoutMs: options.timeoutMs });
      },
    },
    closes: () => closes,
    budgets: () => budgets,
    seenWhileDisposing: () => seen,
  };
}

/** What a half-finished construction did, for the transaction assertions. */
interface PartialAcquisition {
  readonly acquire: () => RetirableRuntime<NamedServices>;
  readonly acquired: () => number;
  readonly released: () => number;
}

/**
 * A construction that acquires one owned resource and then throws.
 *
 * It is a real DI Bag graph, so the partial acquisition is owned exactly as
 * production's is: measured, DI Bag releases it only through `close()` on that
 * bag, which is why {@link PartialAcquisitionError} carries one.
 */
function acquiresThenThrows(dispose: () => Promise<void>): PartialAcquisition {
  let acquired = 0;
  let released = 0;
  return {
    acquired: () => acquired,
    released: () => released,
    acquire: () => {
      const bag = DiBag.createBuilder()
        .withServices({
          first: DiBag.providerWithDisposal({
            provider: DiBag.createProvider(
              (): NamedServices => {
                acquired += 1;
                return { name: 'first resource' };
              },
              { factoryReturnKind: 'sync-value' },
            ),
            disposeService: async () => {
              released += 1;
              await dispose();
            },
          }),
        })
        .buildContainer();
      bag.resolve('first');
      throw new PartialAcquisitionError(new Error('the second resource refused'), (options) =>
        bag.close({ waitTimeoutMs: options.timeoutMs }),
      );
    },
  };
}

const settles = (): Promise<void> => Promise.resolve();
const refuses = (): Promise<void> => Promise.reject(new Error('the disposer refused'));
const neverSettles = (): Promise<void> => new Promise<void>(() => undefined);

describe('one lifetime’s ownership', () => {
  it('publishes the first runtime through the same transaction as any other', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);

    const services = await slot.replace(() => first.runtime);

    // There is no synchronous `open`: the first publication is a replacement on
    // an empty slot, so initial acquisition is bounded, queued and transactional
    // like every other. An `open` beside the queue was how an initial partial
    // acquisition leaked and how a queued replacement overwrote a live runtime.
    expect(services.name).toBe('first');
    expect(slot.snapshot()).toEqual({ status: 'live', services });
  });

  it('releases a first construction that fails halfway, and stays buildable', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const partial = acquiresThenThrows(settles);

    await expect(slot.replace(partial.acquire)).rejects.toBeInstanceOf(PartialAcquisitionError);

    expect(partial.acquired()).toBe(1);
    expect(partial.released()).toBe(1);
    const fatal = slot.snapshot();
    expect(fatal.status === 'fatal' ? fatal.terminal : true).toBe(false);
    const second = runtimeNamed('second', settles);
    await expect(slot.replace(() => second.runtime)).resolves.toEqual({ name: 'second' });
  });

  it('never overwrites a runtime a queued request is about to publish', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    const second = runtimeNamed('second', settles);

    // Both requests reach an empty slot in the same tick. The queue is what makes
    // the second retire the first instead of replacing it in place.
    let firstFactoryCalls = 0;
    const outcomes = await Promise.allSettled([
      slot.replace(() => {
        firstFactoryCalls += 1;
        return first.runtime;
      }),
      slot.replace(() => second.runtime),
    ]);

    expect(outcomes[1].status).toBe('fulfilled');
    expect(slot.snapshot()).toEqual({ status: 'live', services: { name: 'second' } });
    // Either the first was never asked for, or it was given back: never both live.
    expect(first.closes()).toBe(firstFactoryCalls);
  });

  it('cannot be superseded by a subscriber running inside a transition', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    await slot.replace(() => runtimeNamed('first', settles).runtime);
    const second = runtimeNamed('second', settles);
    const third = runtimeNamed('third', settles);
    const handedOut = new Map<string, number>();
    const handOut = (record: RuntimeRecord) => () => {
      handedOut.set(record.name(), (handedOut.get(record.name()) ?? 0) + 1);
      return record.runtime;
    };
    // A holder, not a `let`: the compiler would otherwise narrow a variable only
    // assigned inside the listener to `null` and refuse the await below.
    const reentrant: { promise: Promise<NamedServices> | null } = { promise: null };
    let asked = false;
    slot.subscribe(() => {
      if (asked) return;
      asked = true;
      // The reentry round 3 found: a listener asking for another replacement from
      // inside a state change. It must arrive between steps, never inside one.
      reentrant.promise = slot.replace(handOut(third));
    });

    await slot.replace(handOut(second)).catch(() => undefined);
    if (reentrant.promise !== null) await reentrant.promise.catch(() => undefined);

    const live = slot.snapshot();
    expect(live.status).toBe('live');
    // Every runtime a factory handed out is either the live one or was closed
    // exactly once. That is the invariant the leak broke.
    for (const record of [second, third]) {
      const handed = handedOut.get(record.name()) ?? 0;
      if (handed === 0) continue;
      const isLive = live.status === 'live' && live.services.name === record.name();
      expect(record.closes(), `${record.name()} accounting`).toBe(isLive ? 0 : 1);
    }
  });

  it('gives back a runtime whose own factory asked for another replacement', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    await slot.replace(() => runtimeNamed('first', settles).runtime);
    const second = runtimeNamed('second', settles);
    const third = runtimeNamed('third', settles);
    const reentrant: { promise: Promise<NamedServices> | null } = { promise: null };

    let secondFactoryCalls = 0;
    const superseded = slot.replace(() => {
      secondFactoryCalls += 1;
      reentrant.promise = slot.replace(() => third.runtime);
      return second.runtime;
    });

    await expect(superseded).rejects.toBeInstanceOf(TransitionSupersededError);
    await expect(reentrant.promise).resolves.toEqual({ name: 'third' });
    // It was handed out — a factory cannot be stopped once it is running — so the
    // fence after the factory is what gives it back.
    expect(secondFactoryCalls).toBe(1);
    expect(second.closes()).toBe(1);
  });

  it('is still withdrawn while its disposer runs, so nothing late can be read', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles, () => slot.snapshot().status);
    await slot.replace(() => first.runtime);

    await slot.retire();

    // Asserted from inside the disposal, which is the only place the order can
    // be seen: a slot that withdrew after starting the close would say `live`.
    expect(first.seenWhileDisposing()).toEqual(['retiring']);
    expect(slot.snapshot()).toEqual({ status: 'empty' });
  });

  it('withdraws the old runtime before its disposal starts, then publishes the replacement', async () => {
    const seen: string[] = [];
    const slot = createLifetimeSlot<NamedServices>();
    slot.subscribe(() => {
      seen.push(slot.snapshot().status);
    });
    await slot.replace(() => runtimeNamed('first', settles).runtime);

    const replaced = await slot.replace(() => runtimeNamed('second', settles).runtime);

    // Three notifications, not four: notification is deferred to a microtask and
    // coalesced, so `constructing` is a state a `snapshot()` can read but not
    // necessarily one every subscriber is woken for. What matters is the order —
    // `retiring` is published before the replacement — and that no subscriber ever
    // runs inside a transition step. See {@link createLifetimeSlot}.
    expect(seen).toEqual(['live', 'retiring', 'live']);
    expect(replaced.name).toBe('second');
    expect(slot.snapshot()).toEqual({ status: 'live', services: replaced });
  });

  it('joins one retirement for every trigger of the same runtime', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const pending = deferred();
    const first = runtimeNamed('first', () => pending.promise);
    await slot.replace(() => first.runtime);

    const both = Promise.all([slot.retire(), slot.retire()]);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    // Both triggers are in flight against a disposal that has not finished, which
    // is what a route unmount racing a page hide really looks like.
    expect(first.closes()).toBe(1);
    expect(slot.snapshot().status).toBe('retiring');
    pending.settle();
    await both;

    expect(first.closes()).toBe(1);
    expect(slot.snapshot()).toEqual({ status: 'empty' });
  });

  it('gives the retirement the production budget when it is built with none', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    await slot.replace(() => first.runtime);

    await slot.retire();

    // The number as the close really received it, not as the constant reads: a
    // changed default would pass an assertion on the constant alone.
    expect(first.budgets()).toEqual([RETIREMENT_BUDGET_MS]);
    expect(RETIREMENT_BUDGET_MS).toBe(5_000);
  });

  it('leaves exactly one runtime live when two replacements arrive together', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    const second = runtimeNamed('second', settles);
    const third = runtimeNamed('third', settles);
    await slot.replace(() => first.runtime);

    const outcomes = await Promise.allSettled([
      slot.replace(() => second.runtime),
      slot.replace(() => third.runtime),
    ]);

    // The loser is told it lost. Handing it the winner's services would be worse
    // than throwing: a superseded project effect would publish another project's.
    expect(outcomes[0].status).toBe('rejected');
    expect(outcomes[0].status === 'rejected' ? outcomes[0].reason : null).toBeInstanceOf(
      TransitionSupersededError,
    );
    expect(outcomes[1].status).toBe('fulfilled');
    expect(slot.snapshot()).toEqual({ status: 'live', services: third.runtime.services });
    // The abandoned-ownership assertion: the superseded request never built, so
    // there is no acquired runtime with nobody holding its close.
    expect(second.closes()).toBe(0);
    expect(first.closes()).toBe(1);
    expect(third.closes()).toBe(0);
  });

  it('retires the runtime a replacement published when a later retirement arrives', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    const second = runtimeNamed('second', settles);
    await slot.replace(() => first.runtime);

    await slot.replace(() => second.runtime);
    await slot.retire();

    expect(first.closes()).toBe(1);
    expect(second.closes()).toBe(1);
    expect(slot.snapshot()).toEqual({ status: 'empty' });
  });

  it('refuses the replacement when the required retirement fails, and says so sanitized', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    await slot.replace(() => runtimeNamed('first', refuses).runtime);
    const second = runtimeNamed('second', settles);
    let built = 0;

    await expect(
      slot.replace(() => {
        built += 1;
        return second.runtime;
      }),
    ).rejects.toThrow('DI_BAG_DISPOSAL_FAILED');

    expect(built).toBe(0);
    const fatal = slot.snapshot();
    expect(fatal.status).toBe('fatal');
    // The sanitized public report and nothing from the refusal itself: a cleanup
    // failure is a disclosure boundary exactly as a caught render fault is.
    expect(fatal.status === 'fatal' ? fatal.fault.sentence : '').not.toContain('DI_BAG');
    expect(fatal.status === 'fatal' ? fatal.fault.occurrenceId : '').not.toBe('');
    expect(fatal.status === 'fatal' ? fatal.terminal : false).toBe(true);
  });

  it('refuses every later transition of a slot whose retirement failed', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    await slot.replace(() => runtimeNamed('first', refuses).runtime);
    await expect(slot.replace(() => runtimeNamed('second', settles).runtime)).rejects.toThrow(
      'DI_BAG_DISPOSAL_FAILED',
    );
    const third = runtimeNamed('third', settles);

    await expect(slot.replace(() => third.runtime)).rejects.toThrow('DI_BAG_DISPOSAL_FAILED');

    expect(third.closes()).toBe(0);
    expect(slot.snapshot().status).toBe('fatal');
  });

  it('refuses a request that was already queued when the disposal failed', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    await slot.replace(() => runtimeNamed('first', refuses).runtime);
    const second = runtimeNamed('second', settles);
    const third = runtimeNamed('third', settles);

    // Both are accepted before anything fails, so neither is refused at the door:
    // the first does the disposal and fails, and the second is already in the queue.
    const outcomes = await Promise.allSettled([
      slot.replace(() => second.runtime),
      slot.replace(() => third.runtime),
    ]);

    expect(outcomes.map(({ status }) => status)).toEqual(['rejected', 'rejected']);
    expect(second.closes()).toBe(0);
    expect(third.closes()).toBe(0);
    const fatal = slot.snapshot();
    expect(fatal.status).toBe('fatal');
    expect(fatal.status === 'fatal' ? fatal.terminal : false).toBe(true);
  });

  it('fails the transition when the retirement outruns its budget, and keeps watching the disposal', async () => {
    // 50ms and not the production budget: the fault is the disposer that never
    // settles, and waiting the real five seconds for it proves nothing more.
    const slot = createLifetimeSlot<NamedServices>(50);
    await slot.replace(() => runtimeNamed('first', neverSettles).runtime);
    let built = 0;

    await expect(
      slot.replace(() => {
        built += 1;
        return runtimeNamed('second', settles).runtime;
      }),
    ).rejects.toThrow('DI_BAG_CLOSE_TIMEOUT');

    expect(built).toBe(0);
    expect(slot.snapshot().status).toBe('fatal');
    // A timeout is not cancellation: the disposal is still running, and the slot
    // still holds the promise that says how it ends.
    expect(slot.lateCleanup()).toBeInstanceOf(Promise);
    expect(slot.lateOutcome()).toBe('pending');
  });

  it('observes a late disposal that finishes after the wait expired, without publishing anything', async () => {
    const slot = createLifetimeSlot<NamedServices>(50);
    const pending = deferred();
    await slot.replace(() => runtimeNamed('first', () => pending.promise).runtime);
    await expect(slot.replace(() => runtimeNamed('second', settles).runtime)).rejects.toThrow(
      'DI_BAG_CLOSE_TIMEOUT',
    );

    pending.settle();
    await slot.lateCleanup();

    expect(slot.lateOutcome()).toBe('settled');
    // Eventual completion is not permission to resume: the refused replacement
    // stays unbuilt and the reader stays on the fatal state.
    expect(slot.snapshot().status).toBe('fatal');
  });

  it('observes a late disposal that fails after the wait expired', async () => {
    const slot = createLifetimeSlot<NamedServices>(50);
    const pending = deferred();
    await slot.replace(() => runtimeNamed('first', () => pending.promise).runtime);
    await expect(slot.retire()).rejects.toThrow('DI_BAG_CLOSE_TIMEOUT');

    pending.refuse();
    await expect(slot.lateCleanup()).rejects.toThrow('DI_BAG_DISPOSAL_FAILED');

    expect(slot.lateOutcome()).toBe('failed');
    expect(slot.snapshot().status).toBe('fatal');
  });

  it('is fatal but not terminal when the replacement’s construction throws', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    await slot.replace(() => first.runtime);

    await expect(
      slot.replace((): RetirableRuntime<NamedServices> => {
        throw new Error('the replacement could not be built');
      }),
    ).rejects.toThrow('the replacement could not be built');

    const fatal = slot.snapshot();
    expect(fatal.status).toBe('fatal');
    // Nothing is held: the old runtime was retired and the new one never existed.
    expect(first.closes()).toBe(1);
    expect(fatal.status === 'fatal' ? fatal.terminal : true).toBe(false);
    expect(fatal.status === 'fatal' ? fatal.fault.occurrenceId : '').not.toBe('');
    // So a later transition may build, unlike a failed retirement.
    const third = runtimeNamed('third', settles);
    await expect(slot.replace(() => third.runtime)).resolves.toEqual({ name: 'third' });
  });

  it('withdraws publication synchronously, before the first await', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    await slot.replace(() => first.runtime);

    const replacing = slot.replace(() => runtimeNamed('second', settles).runtime);

    // Read before any await: the map requires withdrawal to be synchronous, and a
    // slot that withdrew inside its queued transition would still say `live` here.
    expect(slot.snapshot()).toEqual({ status: 'retiring' });
    await replacing;
  });

  it('does not build for a request that a newer one overtook during the disposal', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const pending = deferred();
    const first = runtimeNamed('first', () => pending.promise);
    await slot.replace(() => first.runtime);
    let secondBuilds = 0;
    let thirdBuilds = 0;

    const superseded = slot.replace(() => {
      secondBuilds += 1;
      return runtimeNamed('second', settles).runtime;
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    // The third request arrives while the first runtime is still letting go: the
    // interval a fence checked only at the top of a transition cannot see.
    const winner = slot.replace(() => {
      thirdBuilds += 1;
      return runtimeNamed('third', settles).runtime;
    });
    pending.settle();

    await expect(superseded).rejects.toBeInstanceOf(TransitionSupersededError);
    expect(await winner).toEqual({ name: 'third' });
    // Factory invocation counts, not close counts: a runtime that was never built
    // cannot leak, and a close count of zero does not prove it was never built.
    expect(secondBuilds).toBe(0);
    expect(thirdBuilds).toBe(1);
    expect(first.closes()).toBe(1);
  });

  it('releases what a half-finished construction acquired, and stays buildable', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    await slot.replace(() => first.runtime);
    const partial = acquiresThenThrows(settles);

    // The wrapper, not the cause: it is what says something was acquired, and the
    // real reason stays reachable through `cause` for the reporter.
    const refusal = await slot.replace(partial.acquire).catch((thrown: unknown) => thrown);
    expect(refusal).toBeInstanceOf(PartialAcquisitionError);
    expect(refusal instanceof PartialAcquisitionError ? (refusal.cause as Error).message : '').toBe(
      'the second resource refused',
    );

    // The first resource was acquired and is closed: a fatal state disposes
    // nothing by itself, and an orphan graph nobody can reach is the worse half.
    expect(partial.acquired()).toBe(1);
    expect(partial.released()).toBe(1);
    const fatal = slot.snapshot();
    expect(fatal.status).toBe('fatal');
    expect(fatal.status === 'fatal' ? fatal.terminal : true).toBe(false);
    const third = runtimeNamed('third', settles);
    await expect(slot.replace(() => third.runtime)).resolves.toEqual({ name: 'third' });
  });

  it('is terminal when the half-finished construction cannot be released', async () => {
    const slot = createLifetimeSlot<NamedServices>(50);
    await slot.replace(() => runtimeNamed('first', settles).runtime);
    const partial = acquiresThenThrows(refuses);

    await expect(slot.replace(partial.acquire)).rejects.toThrow('DI_BAG_DISPOSAL_FAILED');

    const fatal = slot.snapshot();
    expect(fatal.status === 'fatal' ? fatal.terminal : false).toBe(true);
    const third = runtimeNamed('third', settles);
    await expect(slot.replace(() => third.runtime)).rejects.toThrow('DI_BAG_DISPOSAL_FAILED');
    expect(third.closes()).toBe(0);
  });

  it('publishes a service contract that is itself null', async () => {
    // `S` is unconstrained, and no service value is ever a sentinel: the queued
    // request and the transition's outcome are both tagged, so a lifetime whose
    // published contract is literally `null` behaves like any other.
    const slot = createLifetimeSlot<null>();
    const bag = DiBag.createBuilder()
      .withServices({
        owned: DiBag.createProvider((): null => null, { factoryReturnKind: 'sync-value' }),
      })
      .buildContainer();

    await expect(
      slot.replace(() => ({
        services: bag.resolve('owned'),
        close: (options) => bag.close({ waitTimeoutMs: options.timeoutMs }),
      })),
    ).resolves.toBe(null);
    expect(slot.snapshot()).toEqual({ status: 'live', services: null });
  });

  it('is terminal when a half-finished construction outruns its release budget', async () => {
    const slot = createLifetimeSlot<NamedServices>(50);
    await slot.replace(() => runtimeNamed('first', settles).runtime);
    const pending = deferred();
    const partial = acquiresThenThrows(() => pending.promise);

    await expect(slot.replace(partial.acquire)).rejects.toThrow('DI_BAG_CLOSE_TIMEOUT');

    const fatal = slot.snapshot();
    expect(fatal.status === 'fatal' ? fatal.terminal : false).toBe(true);
    // The release is still running, and the slot still holds the promise that
    // says how it ends — a timeout is not cancellation here either.
    expect(slot.lateOutcome()).toBe('pending');
    pending.settle();
    await slot.lateCleanup();
    expect(slot.lateOutcome()).toBe('settled');
    expect(slot.snapshot().status).toBe('fatal');
  });
});
