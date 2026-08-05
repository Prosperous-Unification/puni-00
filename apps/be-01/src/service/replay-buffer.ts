export interface BufferEntry {
  seq: number;
  message: unknown;
  at: number;
}

export interface ReplayBufferOptions {
  maxPerSubscription: number;
  maxAgeMs: number;
  now?: () => number;
}

export class ReplayBuffer {
  private readonly store = new Map<string, BufferEntry[]>();
  private readonly now: () => number;

  constructor(private readonly opts: ReplayBufferOptions) {
    this.now = opts.now ?? Date.now;
  }

  record(subscription: string, seq: number, message: unknown): void {
    const at = this.now();
    const list = this.store.get(subscription) ?? [];
    list.push({ seq, message, at });
    this.evict(list);
    this.store.set(subscription, list);
  }

  since(subscription: string, sinceSeq: number): BufferEntry[] {
    const list = this.store.get(subscription);
    if (!list) return [];
    this.evict(list);
    return list.filter((e) => e.seq > sinceSeq);
  }

  /**
   * Whether the buffer still holds `fromSeq` and so can serve a replay starting
   * there.
   *
   * Asked instead of `oldestSeq() === null`, because an empty buffer is not
   * evidence: a process that started a second ago has one, and so does a
   * subscription nobody has edited. Only the oldest sequence distinguishes
   * "starts too late" from "holds nothing yet".
   */
  covers(subscription: string, fromSeq: number): boolean {
    const list = this.store.get(subscription);
    // Evicted before the question is answered, not after. `oldestSeq` used to
    // read `list[0]` as it stood, so a buffer holding nothing but expired
    // entries reported that it covered the range — and `since`, which does
    // evict, then returned an empty list. The caller was refused a replay the
    // event log could have served in full.
    if (list !== undefined) this.evict(list);
    const oldest = this.oldestSeq(subscription);
    return oldest !== null && oldest <= fromSeq;
  }

  oldestSeq(subscription: string): number | null {
    const list = this.store.get(subscription);
    if (!list || list.length === 0) return null;
    return list[0]?.seq ?? null;
  }

  private evict(list: BufferEntry[]): void {
    const cutoff = this.now() - this.opts.maxAgeMs;
    while (list.length > 0 && list[0].at < cutoff) list.shift();
    while (list.length > this.opts.maxPerSubscription) list.shift();
  }
}
