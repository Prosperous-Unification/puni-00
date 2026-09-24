/**
 * A one-way line from something a project owns to whoever is listening now.
 *
 * The event counterpart of {@link Store}: a store says what **is**, and a
 * channel says what **happened** — a refusal to announce, a command that was
 * just issued. Delivery subscribes; the service that produces the event is handed
 * only {@link Publisher}, so it can say something and can never learn who heard
 * it, which is what keeps a React setter out of a service's construction inputs.
 *
 * The delivery rules, each one a property the model test in
 * `channel.model.test.ts` checks against its own reference:
 *
 * - **In order, one at a time.** A publication made from inside a listener is
 *   queued behind the one being delivered, so every listener hears events in
 *   the order they were published and no listener is ever entered twice at once.
 * - **The recipients are fixed when an event's delivery starts**, in the order
 *   they subscribed. A listener that subscribes during a delivery hears the next
 *   event and not this one; a listener that is unsubscribed before its turn —
 *   by itself or by another listener — is skipped. Nothing is ever delivered to
 *   a listener after its unsubscribe returned.
 * - **A listener's failure is not swallowed.** Delivery goes on to the other
 *   recipients and the queue behind them, and then the `publish` that began the
 *   delivery throws: the one failure by identity, or an `AggregateError` of all
 *   of them in the order they happened. A `publish` made from inside a listener
 *   returns at once and never throws; its event's failures surface from the
 *   outer one.
 *
 * Function-typed properties for the reason {@link Store} gives.
 */
export interface Channel<T> {
  /** Delivers one event to every current listener, under the rules above. */
  readonly publish: (event: T) => void;
  /** Registers a listener and answers the way to drop it; dropping twice is harmless. */
  readonly subscribe: (listener: (event: T) => void) => () => void;
}

/** The half of a {@link Channel} a producing service is handed. */
export type Publisher<T> = Pick<Channel<T>, 'publish'>;

/** One registration; its own object so the same function may be subscribed twice. */
interface Subscription<T> {
  readonly listener: (event: T) => void;
}

/** Builds an empty channel. It holds no resource, so nothing ever closes it. */
export function createChannel<T>(): Channel<T> {
  const subscriptions = new Set<Subscription<T>>();
  // Wrapped, because `T` may be `void`: an `undefined` event must not read as
  // an empty queue.
  const queue: { readonly event: T }[] = [];
  let delivering = false;
  return {
    subscribe: (listener) => {
      const subscription: Subscription<T> = { listener };
      subscriptions.add(subscription);
      return () => {
        subscriptions.delete(subscription);
      };
    },
    publish: (event) => {
      queue.push({ event });
      if (delivering) return;
      delivering = true;
      const failures: unknown[] = [];
      try {
        for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
          const recipients = [...subscriptions];
          for (const recipient of recipients) {
            if (!subscriptions.has(recipient)) continue;
            try {
              recipient.listener(next.event);
            } catch (failure: unknown) {
              // Caught only to keep delivering to the others; every failure is
              // rethrown below, by identity when it is the only one.
              failures.push(failure);
            }
          }
        }
      } finally {
        delivering = false;
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, 'channel listeners failed');
    },
  };
}
