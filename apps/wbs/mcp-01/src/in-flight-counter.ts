/**
 * How many calls per key are running on this replica, with a fixed ceiling
 * (`wbs-mcp-agent-surface` M10: in-flight tool calls per organization).
 *
 * Shared by every request of the replica. {@link acquire} and the release it returns are
 * synchronous, so no other request runs between the check and the count; a key whose count
 * returns to zero is dropped, so the map holds only keys with a call running.
 */
export class InFlightCounter {
  readonly #counts = new Map<string, number>();

  /** @throws when `limit` is not a positive integer: such a counter admits nothing. */
  constructor(readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new Error('an in-flight limit must be a positive integer');
  }

  /**
   * Counts one more call for `key`, or returns null at the limit and counts nothing. The
   * returned release ends that call's count; a second release of it changes nothing, so a
   * `finally` that runs after an earlier release cannot free another call's slot.
   */
  acquire(key: string): (() => void) | null {
    const count = this.#counts.get(key) ?? 0;
    // Proof: `count > this.limit` here failed in-flight-counter.model.test.ts with
    // `[Send(org-a, 1), Send(org-a, 3)]`: be-01 held four; watched 2026-10-27.
    if (count >= this.limit) return null;
    this.#counts.set(key, count + 1);
    let released = false;
    return () => {
      // Proof: without this guard, `admits up to the limit per key, and a second release frees
      // nothing` (in-flight-counter.test.ts) admitted a third call; watched 2026-10-27.
      if (released) return;
      released = true;
      const remaining = (this.#counts.get(key) ?? 0) - 1;
      // Unreachable while every count comes from an acquire released once; a count gone
      // negative would admit calls beyond the limit, so it throws instead.
      if (remaining < 0) throw new Error(`in-flight count for ${key} went negative`);
      // Proof: deleting the key on every release failed in-flight-counter.model.test.ts with
      // `[Send(org-a, 1), Send(org-a, 1)]`: ending both calls, the second release found no count
      // and threw; watched 2026-10-27.
      if (remaining === 0) this.#counts.delete(key);
      else this.#counts.set(key, remaining);
    };
  }

  /** The calls running for `key`. */
  countOf(key: string): number {
    return this.#counts.get(key) ?? 0;
  }

  /** How many keys have a call running, for tests of the bound. */
  get size(): number {
    return this.#counts.size;
  }
}
