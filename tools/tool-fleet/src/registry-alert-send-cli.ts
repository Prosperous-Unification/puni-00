import {
  createRegistrySlackTransport,
  postRegistryAlert,
  type RegistryAlertTransport,
} from './registry-alert-slack';
import {
  changeRegistryAlerts,
  readRegistryAlertContext,
  reconcileRegistryMaintenanceAlert,
  type RegistryAlertContext,
  type RegistryAlertSnapshot,
  withRegistryAlertSender,
} from './registry-alert-store';
import { RegistryAlertTime, renderRegistryAlert } from './registry-monitoring-events';

/** Internal ordinary-test clock/transport/deadline seams; no input/argv/env selects these in the installed command. */
export interface RegistryAlertSendOptions {
  now?: () => string;
  transport?: RegistryAlertTransport;
  signal?: AbortSignal;
  requestMilliseconds?: number;
}
/** Apply admission to an already validated snapshot under its state lock. The sender durably publishes this transition before any HTTP request. */
export function prepareRegistryAlertAttempt(snapshot: RegistryAlertSnapshot, at: string) {
  const instant = Date.parse(RegistryAlertTime.assert(at));
  // Proof: R5[admission-clock] the declared isolated fault defeated this boundary; observed by "regressed admission clock".
  if (snapshot.lastAttemptAt !== null && instant < Date.parse(snapshot.lastAttemptAt))
    throw new Error('Alert sender clock regressed');
  const event = snapshot.events.find((entry) =>
    ['pending', 'sending', 'uncertain'].includes(entry.state),
  );
  if (event === undefined) {
    // Proof: removing terminal failure refusal returned idle after three uncertain persisted attempts.
    if (snapshot.events.some((entry) => entry.state !== 'acknowledged'))
      throw new Error('Alert delivery has retained terminal failures');
    return { state: 'idle' as const };
  }
  // Proof: removing this relation sent a real local HTTP request under first-attempt clock rollback before later chronology refusal.
  if (instant < Date.parse(event.at)) throw new Error('Alert observation is from the future');
  // Proof: R5[destination-backoff-admission] dropping destination backoff admitted the fourth HTTP post before Retry-After expired; observed by "destination Retry-After survives exhausted".
  if (snapshot.destinationNotBefore !== null && instant < Date.parse(snapshot.destinationNotBefore))
    return { state: 'deferred' as const };
  if (event.state === 'sending') event.state = 'uncertain';
  if (
    // Proof: R5[elapsed-horizon-admission] removal returned sending beyond ten minutes inside the held transaction, before later schema validation; observed by "locked horizon admission".
    (event.firstAt !== null && instant - Date.parse(event.firstAt) >= 600000) ||
    // Proof: R5[attempt-count-admission] removal returned sending at three spent attempts inside the held transaction, before later schema validation; observed by "locked attempt admission".
    event.attempts >= 3
  ) {
    event.state = 'exhausted';
    return { state: 'exhausted' as const };
  }
  if (
    // Proof: R5[event-next-at-admission] removal admitted the event after destination spacing passed but before its own next-at; observed by "event next-at admission".
    (event.nextAt !== null && instant < Date.parse(event.nextAt)) ||
    // Proof: R5[destination-spacing-admission] removal admitted a fresh second event to the owned receiver at half a second; observed by "destination one-second spacing".
    (snapshot.lastAttemptAt !== null && instant - Date.parse(snapshot.lastAttemptAt) < 1000)
  )
    return { state: 'deferred' as const };
  event.attempts += 1;
  event.firstAt ??= at;
  // Proof: omitting sending publication made the actual receiver observe a pending event at acceptance.
  event.state = 'sending';
  event.nextAt = new Date(instant + 1000).toISOString();
  snapshot.lastAttemptAt = at;
  return { state: 'sending' as const, event: structuredClone(event), firstAt: event.firstAt };
}
/** One durable attempt per invocation; separate send lock prevents overlapping requests while source state remains writable. */
export async function sendRegistryAlert(
  context: RegistryAlertContext,
  options: RegistryAlertSendOptions = {},
): Promise<{ state: 'idle' | 'deferred' | 'acknowledged' | 'retry' }> {
  const now = () => RegistryAlertTime.assert((options.now ?? (() => new Date().toISOString()))());
  return withRegistryAlertSender(context, async () => {
    options.signal?.throwIfAborted();
    // Proof: R5[periodic-canonical-reconciliation] omitting the periodic scan left the killed producer failure undelivered without a maintenance retry; observed by "periodic sender recovers a killed producer".
    await reconcileRegistryMaintenanceAlert(context);
    const prepared = await changeRegistryAlerts(context, (snapshot) =>
      prepareRegistryAlertAttempt(snapshot, now()),
    );
    if (prepared.state === 'idle' || prepared.state === 'deferred')
      return { state: prepared.state };
    if (prepared.state === 'exhausted')
      throw new Error('Alert delivery attempt or horizon exhausted');
    const event = prepared.event,
      payload = renderRegistryAlert(event);
    const controller = new AbortController();
    const signal =
      options.signal === undefined
        ? controller.signal
        : AbortSignal.any([controller.signal, options.signal]);
    const milliseconds = options.requestMilliseconds ?? 10000;
    // Proof: R5[request-deadline-range] the declared isolated fault defeated this boundary; observed by "invalid request deadline 0 ".
    if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0 || milliseconds > 10000)
      throw new Error('Invalid alert request deadline');
    const remaining = Date.parse(prepared.firstAt) + 600000 - Date.parse(now());
    // Proof: removing cancellation exceeded the real HTTP assertion under an external test watchdog; ignoring remaining horizon exceeded its separate250ms assertion.
    const deadline = setTimeout(
      () => {
        controller.abort(new Error('Alert request deadline exceeded'));
      },
      Math.max(1, Math.min(milliseconds, remaining)),
    );
    let acknowledgement;
    try {
      const transport = options.transport ?? (await createRegistrySlackTransport(context));
      acknowledgement = await postRegistryAlert(transport, payload, signal);
    } catch {
      acknowledgement = { state: 'uncertain' as const };
    } finally {
      clearTimeout(deadline);
    }
    const settled = await changeRegistryAlerts(context, (snapshot) => {
      const current = snapshot.events.find((entry) => entry.id === event.id);
      if (
        // Proof: R5[acknowledgement-phase-binding] removal confirmed a changed durable lifecycle after the actual HTTP response; observed by "stale acknowledgement cannot confirm changed phase".
        current?.state !== 'sending' ||
        // Proof: R5[acknowledgement-attempt-binding] removal confirmed a different attempt than the one actually posted; observed by "stale acknowledgement cannot confirm changed attempt".
        current.attempts !== event.attempts ||
        // Proof: R5[acknowledgement-payload-binding] removal confirmed changed payload bytes that were never posted; observed by "stale acknowledgement cannot confirm changed payload".
        current.payloadSha256 !== event.payloadSha256 ||
        // Proof: R5[acknowledgement-horizon-binding] removal confirmed changed original-horizon metadata after submission; observed by "stale acknowledgement cannot confirm changed horizon".
        current.firstAt !== prepared.firstAt
      )
        throw new Error('Alert acknowledgement attempt binding mismatch');
      const instant = Date.parse(now());
      // Proof: R5[acknowledgement-clock] the declared isolated fault defeated this boundary; observed by "regressed acknowledgement clock".
      if (snapshot.lastAttemptAt === null || instant < Date.parse(snapshot.lastAttemptAt))
        throw new Error('Alert acknowledgement clock regressed');
      if (acknowledgement.state === 'acknowledged') {
        current.state = 'acknowledged';
        return 'acknowledged' as const;
      }
      if (acknowledgement.state === 'rejected') {
        current.state = 'rejected';
        return 'rejected' as const;
      }
      if (acknowledgement.state === 'retry') {
        const next = instant + acknowledgement.seconds * 1000;
        if (
          // Proof: R5[destination-backoff-monotonicity] unconditional replacement shortened an already persisted stronger destination deadline; observed by "a shorter Retry-After".
          snapshot.destinationNotBefore === null ||
          next > Date.parse(snapshot.destinationNotBefore)
        )
          // Proof: R5[destination-backoff-publication] omitting persisted backoff let a restarted sender post the next event early; observed by "destination Retry-After survives exhausted".
          snapshot.destinationNotBefore = new Date(next).toISOString();
        current.nextAt = new Date(next).toISOString();
        // Proof: R5[retry-delay-exceeds-horizon-terminal] omission reported uncertainty instead of the required exhausted retry outcome; observed by "rate limit honors persisted Retry-After".
        if (next >= Date.parse(prepared.firstAt) + 600000) {
          current.state = 'exhausted';
          return 'exhausted' as const;
        }
        current.nextAt = new Date(next).toISOString();
      }
      // Proof: R5[third-uncertain-response-terminal] omission persisted uncertainty after the third unsuccessful response; observed by "uncertain attempts retain one identity".
      current.state = current.attempts >= 3 ? 'exhausted' : 'uncertain';
      return current.state;
    });
    if (settled === 'acknowledged') return { state: 'acknowledged' };
    throw new Error(
      settled === 'rejected'
        ? 'Alert destination rejected notification'
        : settled === 'exhausted'
          ? 'Alert delivery exhausted; uncertainty retained'
          : 'Alert delivery is uncertain; bounded retry retained',
    );
  });
}
/** Fixed installed command accepts no arguments and no insecure endpoint/config overrides. */
export async function registryAlertSendMain(
  context?: RegistryAlertContext,
  options: RegistryAlertSendOptions = {},
): Promise<void> {
  if (process.argv.length !== 2 && context === undefined)
    throw new Error('Registry alert sender accepts no arguments');
  await sendRegistryAlert(context ?? (await readRegistryAlertContext()), options);
}
if (import.meta.main) {
  try {
    await registryAlertSendMain();
  } catch {
    console.error('Registry alert delivery failed; inspect durable alert state');
    process.exitCode = 1;
  }
}
