/** The requests one provisioning token may make per rolling window. */
export const SCIM_REQUESTS_PER_WINDOW = 300;

/** The rolling window {@link SCIM_REQUESTS_PER_WINDOW} counts over. */
export const SCIM_WINDOW_MS = 60_000;

/** Admitted, or refused with the whole seconds until a slot frees. */
export type ScimAdmissionOutcome =
  { readonly admitted: true } | { readonly admitted: false; readonly retryAfterSeconds: number };

/**
 * Per-token SCIM admission (`organization-scim`): at most
 * {@link SCIM_REQUESTS_PER_WINDOW} admitted requests per token in any
 * {@link SCIM_WINDOW_MS}, measured with the injected clock. A request at `t`
 * stops counting at `t + window`; a refused request counts for nothing.
 *
 * Counters live in this process only, so two colours mid-swap admit at most
 * twice the limit (design.md, "Admission"). Memory is one timestamp per
 * admitted request in the window per token; a token's queue is dropped once
 * it empties.
 */
export class ScimAdmission {
  private readonly admitted = new Map<string, number[]>();

  constructor(
    private readonly now: () => number,
    private readonly limit = SCIM_REQUESTS_PER_WINDOW,
    private readonly windowMs = SCIM_WINDOW_MS,
  ) {}

  admit(tokenId: string): ScimAdmissionOutcome {
    const at = this.now();
    const times = (this.admitted.get(tokenId) ?? []).filter((time) => time + this.windowMs > at);
    // Proof: `>` in place of `>=` made `admits 300 requests in a rolling
    // minute and refuses the 301st with Retry-After` (unit) and mounted
    // `answers the 301st request in a rolling minute 429 …` admit the 301st;
    // watched 2026-10-12.
    if (times.length >= this.limit) {
      this.admitted.set(tokenId, times);
      const oldest = times.at(0);
      if (oldest === undefined) throw new Error('a full SCIM admission window holds no request');
      return {
        admitted: false,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - at) / 1000)),
      };
    }
    times.push(at);
    this.admitted.set(tokenId, times);
    return { admitted: true };
  }
}
