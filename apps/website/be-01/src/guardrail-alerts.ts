import type { ProviderFetch } from './conversation/stream';

/**
 * The guardrail alert kinds. Every `detail` and webhook body carries only kinds, counts, UTC days
 * or hours and micro-USD amounts: never an address, a source hash, an email, claim material or
 * visitor or model text.
 */
export type GuardrailAlertKind =
  | 'site_spend_half'
  | 'inference_paused'
  | 'operator_locked'
  | 'draft_cap_half'
  | 'draft_cap_full'
  | 'proposal_cap_half'
  | 'proposal_cap_full'
  | 'provider_failures'
  | 'refusals'
  | 'rate_limited';

/** One webhook attempt's deadline. */
export const alertDeliveryMilliseconds = 10_000;

/**
 * Counts events in a trailing window held in memory as per-minute buckets, so a flood of
 * thousands costs a few integers and never a row. Returns the count including this event.
 */
export class FloodCounter {
  private readonly buckets = new Map<number, number>();

  constructor(private readonly windowMinutes: number) {}

  record(now: number): number {
    const minute = Math.floor(now / 60_000);
    for (const bucket of this.buckets.keys())
      if (bucket <= minute - this.windowMinutes) this.buckets.delete(bucket);
    this.buckets.set(minute, (this.buckets.get(minute) ?? 0) + 1);
    let total = 0;
    for (const count of this.buckets.values()) total += count;
    return total;
  }
}

/**
 * Reads `GUARDRAIL_WEBHOOK_URL`: unset or empty is no webhook; anything but an absolute `https`
 * URL throws, so a typo never silently drops alerts.
 */
export function readWebhookUrl(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    if (error instanceof TypeError)
      throw new Error('GUARDRAIL_WEBHOOK_URL must be an https URL', { cause: error });
    throw error;
  }
  // Proof: accepting http here let the http webhook config test pass without throwing.
  if (url.protocol !== 'https:') throw new Error('GUARDRAIL_WEBHOOK_URL must be an https URL');
  return url.toString();
}

/** The startup line about the webhook; never the URL, which is a secret. */
export function describeAlertWebhook(webhookUrl: string | undefined): string {
  return `guardrail alerts: webhook ${webhookUrl === undefined ? 'unset' : 'set'}`;
}

/**
 * Makes the one webhook attempt for an alert: an ntfy-style `POST` with a `text/plain` body and a
 * `Title` header within {@link alertDeliveryMilliseconds}. Delivery is the one optional outcome:
 * any failure (status, network, deadline) returns `failed`, never throws, and is recorded on the
 * alert row instead.
 */
export async function deliverAlert(
  send: ProviderFetch,
  webhookUrl: string,
  kind: GuardrailAlertKind,
  detail: string,
): Promise<'sent' | 'failed'> {
  try {
    const response = await send(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8', Title: `PUNI guardrail: ${kind}` },
      body: `${kind}: ${detail}`,
      signal: AbortSignal.timeout(alertDeliveryMilliseconds),
    });
    return response.ok ? 'sent' : 'failed';
  } catch (error) {
    // The modelled optional outcome: an unreachable or slow webhook is a `failed` delivery.
    if (error instanceof Error) return 'failed';
    throw error;
  }
}
