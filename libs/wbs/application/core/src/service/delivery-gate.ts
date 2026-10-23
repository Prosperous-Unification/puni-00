import type { DeliveryReader, DeliveryReading } from '@shared/delivery';

import type { Timers } from '../ports/timers';

/**
 * How {@link DeliveryGate} shares the anonymous provider quota. The defaults are the
 * `track-work-delivery` design assumptions: one GitHub read costs up to 32 of the
 * 60 anonymous requests per hour per server IP.
 */
export interface DeliveryGateLimits {
  /** How long one URL's reading is served from memory. */
  readonly cacheTtlMs: number;
  /** Provider reads one organization may start per {@link organizationWindowMs}. */
  readonly organizationReads: number;
  readonly organizationWindowMs: number;
  /** Provider reads in flight across the process. */
  readonly concurrentReads: number;
  /** How long a read waits for a free slot before the gate answers busy. */
  readonly busyWaitMs: number;
}

export const DELIVERY_GATE_LIMITS: DeliveryGateLimits = {
  cacheTtlMs: 60_000,
  organizationReads: 30,
  organizationWindowMs: 10 * 60_000,
  concurrentReads: 4,
  busyWaitMs: 5_000,
};

/** A served reading, or why no provider read was started. */
export type DeliveryAdmission =
  | {
      readonly kind: 'served';
      readonly reading: DeliveryReading;
      /** The gate clock when the reading was answered, cached or not. */
      readonly servedAt: number;
    }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number }
  | { readonly kind: 'busy' };

/** Which bucket pays for a read: an organization, or the whole deployment before activation. */
export type DeliveryPayer = { readonly organizationId: string } | 'legacy';

interface Bucket {
  tokens: number;
  at: number;
}

/**
 * Shares one process's provider quota between organizations in front of a
 * {@link DeliveryReader}: a reading cache keyed by reference URL, a token bucket
 * per payer, and a cap on concurrent provider reads with a bounded wait.
 *
 * A cache hit costs no token, so a refresh inside the TTL answers the cached
 * reading with its original `observedAt`; refresh never invalidates. Every
 * returned reading is cached, unavailable ones included; thrown failures and
 * cancellation are not. A read that never reached the provider (busy, cancelled
 * while waiting) refunds its token.
 *
 * State lives in this process only, so blue and green mid-swap admit at most
 * twice the limits, as SCIM admission does.
 */
export class DeliveryGate {
  private readonly readings = new Map<string, { reading: DeliveryReading; at: number }>();
  private readonly buckets = new Map<string, Bucket>();
  private readonly waiting: (() => void)[] = [];
  private inFlight = 0;

  constructor(
    private readonly reader: DeliveryReader,
    private readonly now: () => number,
    private readonly schedule: Timers['schedule'],
    private readonly limits: DeliveryGateLimits = DELIVERY_GATE_LIMITS,
  ) {}

  /** @throws AbortError when `signal` aborts; unexpected reader failures propagate. */
  async read(payer: DeliveryPayer, url: string, signal: AbortSignal): Promise<DeliveryAdmission> {
    signal.throwIfAborted();
    const key = url.replace(/\/+$/, '');
    const cached = this.readings.get(key);
    const at = this.now();
    // Proof: skipping this cache made 'serves a second read inside the TTL from the cache' and 'serves the cached reading inside the TTL with its original observedAt' read the provider twice (2026-10-24).
    if (cached !== undefined && at - cached.at < this.limits.cacheTtlMs)
      return { kind: 'served', reading: cached.reading, servedAt: at };
    const payerKey = payer === 'legacy' ? 'legacy' : `organization:${payer.organizationId}`;
    const bucket = this.refill(payerKey, at);
    // Proof: admitting an empty bucket made 'refuses the 31st provider read of one organization with retryAfterSeconds' read the provider and 'answers 429 delivery_rate_limited once the organization spent its provider reads' answer 200 instead of 429 (2026-10-24).
    if (bucket.tokens < 1) {
      const perMs = this.limits.organizationReads / this.limits.organizationWindowMs;
      return {
        kind: 'rate-limited',
        retryAfterSeconds: Math.max(1, Math.ceil((1 - bucket.tokens) / perMs / 1000)),
      };
    }
    bucket.tokens -= 1;
    const entry = await this.enter(signal);
    if (entry !== 'admitted' || signal.aborted) {
      // Proof: dropping this refund made 'a waiting read takes the next free slot and busy refunds its token' refuse the waiting read (2026-10-24).
      bucket.tokens = Math.min(this.limits.organizationReads, bucket.tokens + 1);
      if (entry === 'admitted') this.leave();
      signal.throwIfAborted();
      return { kind: 'busy' };
    }
    try {
      const reading = await this.reader.read(url, signal);
      const servedAt = this.now();
      this.remember(key, reading, servedAt);
      return { kind: 'served', reading, servedAt };
    } finally {
      this.leave();
    }
  }

  private refill(payerKey: string, at: number): Bucket {
    const capacity = this.limits.organizationReads;
    const bucket = this.buckets.get(payerKey) ?? { tokens: capacity, at };
    bucket.tokens = Math.min(
      capacity,
      bucket.tokens + (Math.max(0, at - bucket.at) * capacity) / this.limits.organizationWindowMs,
    );
    bucket.at = at;
    this.buckets.set(payerKey, bucket);
    return bucket;
  }

  private remember(key: string, reading: DeliveryReading, at: number): void {
    for (const [candidate, entry] of this.readings)
      if (at - entry.at >= this.limits.cacheTtlMs) this.readings.delete(candidate);
    this.readings.set(key, { reading, at });
  }

  /** Holds a slot, or answers why none was taken: the bounded wait ran out or `signal` aborted. */
  private enter(signal: AbortSignal): Promise<'admitted' | 'busy' | 'cancelled'> {
    // Proof: skipping the slot cap made 'answers busy when every provider read slot stays taken' (unit and delivery.controller.db.test.ts) start the late read and time out instead of answering busy (2026-10-24).
    if (this.inFlight < this.limits.concurrentReads) {
      this.inFlight++;
      return Promise.resolve('admitted');
    }
    return new Promise((resolve) => {
      const settle = (outcome: 'admitted' | 'busy' | 'cancelled') => {
        const index = this.waiting.indexOf(admit);
        if (index >= 0) this.waiting.splice(index, 1);
        cancelTimer();
        signal.removeEventListener('abort', cancel);
        if (outcome === 'admitted') this.inFlight++;
        resolve(outcome);
      };
      const admit = () => {
        settle('admitted');
      };
      const cancel = () => {
        settle('cancelled');
      };
      const cancelTimer = this.schedule(this.limits.busyWaitMs, () => {
        settle('busy');
      });
      signal.addEventListener('abort', cancel, { once: true });
      this.waiting.push(admit);
    });
  }

  private leave(): void {
    this.inFlight--;
    this.waiting.at(0)?.();
  }
}
