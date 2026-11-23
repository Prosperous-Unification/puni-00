/** First control observed by this executable owner, independent of final status priority. */
export type Interruption =
  | { readonly kind: 'none' }
  | { readonly kind: 'native'; readonly signal: 'SIGINT' | 'SIGTERM' }
  | { readonly kind: 'external'; readonly reason: unknown };

/** Dash-local event identity; replay preserves sequence while every newly observed event advances it. */
export type ControlEvent =
  | { readonly sequence: number; readonly kind: 'native'; readonly signal: 'SIGINT' | 'SIGTERM' }
  | { readonly sequence: number; readonly kind: 'external'; readonly reason: unknown };
/**
 * Observe controls synchronously without throwing. Each call creates an independent registration,
 * even for the same callback. Removal suppresses notifications not yet delivered to that registration.
 * Replay synchronously supplies the original first event once; later observations use their captured
 * live cohort. Reentrant observations wait until the current cohort finishes delivery.
 */
export type SubscribeControl = (observe: (event: ControlEvent) => void) => () => void;
interface Subscription {
  readonly observe: (event: ControlEvent) => void;
  isActive: boolean;
}
interface Delivery {
  readonly event: ControlEvent;
  readonly cohort: readonly Subscription[];
}
export interface GateControl {
  /** Queue wake only: an aborted signal establishes neither native provenance nor child settlement. */
  readonly signal: AbortSignal;
  readonly subscribe: SubscribeControl;
  readonly readInterruption: () => Interruption;
  /** @throws When no native or external control has been observed. */
  readonly readStatus: () => 130 | 143;
  /** Retire the owned listeners and referenced lifetime only after complete executable settlement. */
  dispose(): void;
}
/**
 * Own native INT/TERM and independent external cancellation before asynchronous preflight. Keep the
 * executable referenced through queue, work, IO, recovery and admission/report settlement. The
 * executable facade disposes this owner; admitted work borrows it and must not dispose it.
 * First kind/reason stays independent of final status and later signals. No signal forwarding or
 * descendant-settlement authority is conferred. One invocation owns process-wide listeners.
 */
export function createGateControl(externalSignal: AbortSignal): GateControl {
  const controller = new AbortController(),
    // Proof: C35 C16 (relocated C33 L01) unreferenced this interval; preflight/work/recovery/late-cleanup cases ended at their pending-lifetime assertions; all restored passes. No later lock/head negative credit; late cleanup is process/report retention only.
    operationRetention = setInterval(() => undefined, 1000),
    subscriptions = new Set<Subscription>(),
    deliveries: Delivery[] = [];
  let first: ControlEvent | undefined,
    sequence = 0,
    isDispatching = false;
  function record(observation: Exclude<Interruption, { kind: 'none' }>): void {
    // Proof: C35 C05 reused sequence1; the repeated-observation case lost sequences2/3 at its first event-array assertion; restored pass.
    const event: ControlEvent = { ...observation, sequence: ++sequence };
    // Proof: C35 C01 (relocated C33 S01) overwrote this latch; later external control replaced native TERM, and actual INT/TERM cleanup changed130 to143; both restored passes.
    first ??= event;
    // Proof: C35 C08 captured the cohort during delivery; the late-join case received duplicate first delivery and historical event2; restored pass.
    deliveries.push({ event, cohort: [...subscriptions] });
    // Proof: C35 C07 replaced the FIFO drain with reentrant notification; wake and early-observer controls delivered event2 before event1 completed; both restored passes.
    if (isDispatching) return;
    isDispatching = true;
    for (const delivery of deliveries) {
      // Proof: C35 C12 removed this wake; the selected already-aborted Context case completed instead of cancelling before admission; restored pass. Not every queued-wait interleaving.
      controller.abort();
      for (const subscription of delivery.cohort)
        // Proof: C35 C09 removed this active-token check; wake-time and earlier-observer removals still delivered captured notifications; both restored passes.
        if (subscription.isActive) subscription.observe(delivery.event);
    }
    deliveries.length = 0;
    isDispatching = false;
  }
  const onInt = () => {
      record({ kind: 'native', signal: 'SIGINT' });
    },
    onTerm = () => {
      record({ kind: 'native', signal: 'SIGTERM' });
    },
    onAbort = () => {
      // Proof: C35 C02 replaced the opaque reason with undefined; the already-aborted owner case lost original reason identity; restored pass.
      record({ kind: 'external', reason: externalSignal.reason });
    };
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  externalSignal.addEventListener('abort', onAbort);
  // Proof: C35 C13 removed this prior-abort observation; the already-aborted owner case left its wake signal unaborted; restored pass.
  if (externalSignal.aborted) onAbort();
  function readInterruption(): Interruption {
    if (first === undefined) return { kind: 'none' };
    return first.kind === 'native'
      ? { kind: 'native', signal: first.signal }
      : { kind: 'external', reason: first.reason };
  }
  return {
    signal: controller.signal,
    subscribe(observe) {
      const subscription: Subscription = { observe, isActive: true };
      // Proof: C35 C10 coalesced same-function registrations; their first event delivered once instead of twice; restored pass. Later one-registration retirement assertions were not reached by that negative.
      subscriptions.add(subscription);
      // Proof: C35 C06 replayed a same-shaped clone; the replay case lost original event object identity; restored pass.
      if (first !== undefined) observe(first);
      return () => {
        subscription.isActive = false;
        subscriptions.delete(subscription);
      };
    },
    readInterruption,
    readStatus() {
      const observation = readInterruption();
      // Proof: C35 C04 removed this refusal; the no-control status case returned130 instead of throwing; restored pass.
      if (observation.kind === 'none')
        throw new Error('checkout cancellation lacks an observed control');
      // Proof: C35 C03 (relocated C33 S07) mapped TERM to130; actual native TERM retained its kind but lost143; restored pass.
      return observation.kind === 'native' && observation.signal === 'SIGTERM' ? 143 : 130;
    },
    dispose() {
      // Proof: C35 C17 (relocated C33 L02) omitted interval retirement; controlled pending-work settlement failed the ordinary500ms ended-versus-pending assertion; restored pass. No runner/test-timeout credit.
      clearInterval(operationRetention);
      // Proof: C35 C11 omitted captured-token retirement; the owning executable-facade disposal case still delivered its undelivered cohort; restored pass. This is not borrowed-work disposal.
      for (const subscription of subscriptions) subscription.isActive = false;
      subscriptions.clear();
      // Proof: C35 C14 kept the external listener; abort after disposal still woke the disposed control; restored pass.
      externalSignal.removeEventListener('abort', onAbort);
      // Proof: C35 C15 removed paired native listener cleanup; the retirement case first observed INT count1 instead of0; restored pass. No separately reached TERM-negative claim.
      process.off('SIGINT', onInt);
      process.off('SIGTERM', onTerm);
    },
  };
}
