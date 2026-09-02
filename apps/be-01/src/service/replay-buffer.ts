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
    this.sweepOneOther(subscription);
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

  /**
   * Where the rotating sweep is up to — see {@link sweepOneOther}.
   *
   * A name and not an index: the map's keys move as subscriptions are added and
   * dropped, and an index into a changing key list skips entries silently.
   */
  private sweptLast: string | null = null;

  /**
   * Evicts one subscription **other** than the one just written to, and drops
   * it when nothing is left.
   *
   * **Eviction was only ever lazy, and lazy means never for an abandoned key.**
   * `record`, `since` and `covers` each evict the subscription they are about,
   * so a project that is edited a thousand times and then closed keeps a
   * thousand `tree_replaced` entries — whole plans, hundreds of rows each —
   * with every one of them long past `maxAgeMs` and nothing left that would
   * ever ask about them again. The map kept the name too.
   *
   * One key per write, which is `login-throttle.ts`'s bargain in this same
   * wave: bounded work per operation, and a sweep that visits every
   * subscription once per K writes across K live subscriptions. An abandoned
   * project therefore drains within one lap of whatever traffic is left, rather
   * than never.
   *
   * It changes no answer. `since` and `covers` already evict before answering,
   * and `oldestSeq` has no production caller — so what this releases is memory
   * that no reader could reach.
   */
  private sweepOneOther(justWritten: string): void {
    const keys = [...this.store.keys()].filter((key) => key !== justWritten);
    if (keys.length === 0) {
      this.sweptLast = null;
      return;
    }
    const after = this.sweptLast === null ? -1 : keys.indexOf(this.sweptLast);
    // `+ 1` past the last one swept, wrapping — and past `-1` when that key is
    // gone, which starts the lap again rather than stopping.
    // In range because `keys.length > 0` above, so no `undefined` check here:
    // `noUncheckedIndexedAccess` is off in this repo and one would be a branch
    // nothing can reach.
    const next = keys[(after + 1) % keys.length];
    this.sweptLast = next;
    const list = this.store.get(next);
    // A key taken from `store.keys()` a line ago, so this narrows a type rather
    // than modelling a state — nothing runs between the two.
    if (list === undefined) return;
    this.evict(list);
    if (list.length === 0) this.store.delete(next);
  }

  private evict(list: BufferEntry[]): void {
    const cutoff = this.now() - this.opts.maxAgeMs;
    while (list.length > 0 && list[0].at < cutoff) list.shift();
    while (list.length > this.opts.maxPerSubscription) list.shift();
  }
}
