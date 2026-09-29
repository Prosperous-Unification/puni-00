/** The two ways to ask a {@link singleFlight} read to run. */
export interface SingleFlight {
  /** Starts the read, or joins the one in flight: a mount, poll or focus. */
  join: () => Promise<void>;
  /**
   * A read that starts after this call: after a write, whose answer an
   * in-flight read may predate. While one is in flight, every such call
   * shares one read queued behind it.
   */
  fresh: () => Promise<void>;
}

/**
 * Keeps at most one `read` in flight, plus at most one queued behind it, so
 * a focus landing on a poll, a mount or a write's re-read costs one read.
 *
 * Proof, observed 2026-09-29: with `join` starting a read whatever was in
 * flight, `joins the read in flight` in `single-flight.test.ts` counted two
 * reads; with `fresh` joining the read in flight instead of queueing,
 * `queues one fresh read behind the read in flight` counted one.
 */
export function singleFlight(read: () => Promise<void>): SingleFlight {
  let running: Promise<void> | null = null;
  let queued: Promise<void> | null = null;
  const start = (): Promise<void> => {
    const started = read().finally(() => {
      running = null;
    });
    running = started;
    return started;
  };
  return {
    join: () => running ?? start(),
    fresh: () => {
      if (running === null) return start();
      // The earlier read's failure reaches its own callers; here it only
      // orders this read after that one.
      queued ??= running
        .catch(() => undefined)
        .then(() => {
          queued = null;
          return running ?? start();
        });
      return queued;
    },
  };
}
