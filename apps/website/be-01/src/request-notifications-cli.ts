import {
  claimRequestNotification,
  finishRequestNotification,
  openMaintenanceDatabase,
} from '@website/store-sqlite';

import type { ProviderFetch } from './conversation/stream';

interface NotificationConfiguration {
  webhook: string;
  inbox: string;
}

/** Counts provider acceptance separately from failures scheduled for retry and erasure cancellation. */
export interface RequestNotificationSummary {
  accepted: number;
  failed: number;
  cancelled: number;
}

/** Validates explicit destination settings before opening the database; never includes values in errors. */
function readNotificationConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): NotificationConfiguration {
  const origin = environment['APP_ORIGIN'];
  // Proof: removing origin admission failed malformed-origin refusal before any database creation.
  if (origin !== 'https://request.puni.dev' && origin !== 'https://dev.request.puni.dev')
    throw new Error('APP_ORIGIN must be a canonical website request origin');
  const webhook = environment['REQUEST_WEBHOOK_URL'];
  if (!webhook) throw new Error('REQUEST_WEBHOOK_URL is required');
  // Proof: removing this parse check exposed a raw URL TypeError in the malformed-configuration test.
  if (!URL.canParse(webhook)) throw new Error('REQUEST_WEBHOOK_URL must be an HTTPS URL');
  const destination = new URL(webhook);
  // Proof: separately removing scheme, userinfo and fragment checks failed configuration-refusal cases.
  if (
    destination.protocol !== 'https:' ||
    destination.username !== '' ||
    destination.password !== '' ||
    destination.hash !== ''
  )
    throw new Error('REQUEST_WEBHOOK_URL must be HTTPS without userinfo or fragment');
  return { webhook: destination.toString(), inbox: `${origin}/operator` };
}

/**
 * Attempts one HTTPS notification within ten seconds. Status failures, network TypeErrors and
 * DOM cancellation/deadline errors are modeled delivery failures; unexpected defects throw.
 * Redirects refuse so a receiver cannot forward a secret target or inbox metadata elsewhere.
 */
async function deliverRequestNotification(
  configuration: NotificationConfiguration,
  submissionId: string,
  send: ProviderFetch,
): Promise<'accepted' | 'failed'> {
  try {
    const response = await send(configuration.webhook, {
      method: 'POST',
      // Proof: allowing redirects fails the native HTTPS receiver's no-forwarding assertion.
      redirect: 'error',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Title: 'PUNI: new proposal request',
      },
      body: `New PUNI proposal request: ${submissionId}\nReview: ${configuration.inbox}`,
      // Proof: removing the deadline failed the silent-receiver test instead of returning a retryable failure.
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    // Proof: unconditional acceptance failed the HTTP-503 retry/durable-state test.
    return response.ok ? 'accepted' : 'failed';
  } catch (error) {
    if (
      // Proof: treating every Error as a network failure hid a defect in the actual child-command test.
      error instanceof TypeError ||
      (error instanceof DOMException &&
        (error.name === 'AbortError' || error.name === 'TimeoutError'))
    )
      return 'failed';
    throw error;
  }
}

/**
 * Delivers at most twenty due obligations from an existing, verified website database. Each
 * lease commits before networking, then provider acceptance or retry timing commits afterward.
 * A crash between remote acceptance and local acknowledgement can duplicate the same request ID.
 * Call once per minute using the pinned API package and retained volume; intake never waits on it.
 *
 * @throws for invalid configuration, absent/unverified storage and unexpected DB/transport defects.
 * Failed deliveries remain queued and appear in the summary; CLI callers exit nonzero for them.
 */
export async function runRequestNotifications(
  databasePath: string,
  environment: Readonly<Record<string, string | undefined>>,
  send: ProviderFetch = (url, init) => fetch(url, init),
  now: () => number = Date.now,
): Promise<RequestNotificationSummary> {
  const configuration = readNotificationConfiguration(environment);
  const database = openMaintenanceDatabase(databasePath, 'Request notification delivery');
  const summary: RequestNotificationSummary = { accepted: 0, failed: 0, cancelled: 0 };
  try {
    // Proof: permitting a twenty-first send failed the bounded-batch test.
    for (let offset = 0; offset < 20; offset++) {
      const lease = claimRequestNotification(database, now());
      if (lease === null) break;
      const delivery = await deliverRequestNotification(configuration, lease.submissionId, send);
      const recorded = finishRequestNotification(database, lease, delivery, now());
      if (recorded === 'cancelled') summary.cancelled++;
      else summary[delivery]++;
    }
    return summary;
  } finally {
    database.close();
  }
}

if (import.meta.main) {
  const arguments_ = Bun.argv.slice(2);
  const databasePath = arguments_[0];
  if (arguments_.length !== 1 || !databasePath) {
    console.error('Usage: request-notifications DATABASE');
    process.exitCode = 1;
  } else {
    try {
      const summary = await runRequestNotifications(databasePath, process.env);
      console.log(JSON.stringify({ event: 'request_notifications', ...summary }));
      if (summary.failed > 0) process.exitCode = 1;
    } catch {
      // Proof: printing the caught error exposed the target in the actual child-command defect test.
      // Abort the command with a fixed diagnostic: transport exceptions may contain the secret URL.
      console.error(
        'Request notification command failed; verify configuration, storage and delivery',
      );
      process.exitCode = 1;
    }
  }
}
