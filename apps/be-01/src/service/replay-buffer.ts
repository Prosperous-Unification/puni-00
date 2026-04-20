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
