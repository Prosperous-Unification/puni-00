import type { EventLogRepo } from '../repository/event-log';
import { runRetention } from './retention-job';

export interface RetentionTimerOptions {
  repo: EventLogRepo;
  maxPerSubscription: number;
  intervalMs: number;
  /** Reported per sweep; the process decides whether that is worth a log line. */
  onSweep?: (removed: number) => void;
  /**
   * A sweep that threw. Required: the event log growing without bound is exactly
   * the failure this timer exists to prevent, and a silently dead timer looks
   * identical to a healthy one from outside.
   */
  onError: (err: unknown) => void;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

/**
 * Prunes the event log on a schedule, for as long as the process runs.
 *
 * Without it `runRetention` had no caller at all: the log grew by one row per
 * edit, forever, in the same SQLite file the domain lives in. It also makes the
 * replay orchestrator's `out_of_range` reachable — a refusal that could never
 * happen would be a branch nothing ever took.
 */
export class RetentionTimer {
  private handle: unknown = null;
  private inFlight: Promise<void> | null = null;
  private readonly set: (fn: () => void, ms: number) => unknown;
  private readonly clear: (handle: unknown) => void;

  constructor(private readonly opts: RetentionTimerOptions) {
    this.set = opts.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    // The handle is opaque to callers by design — only this pairing of
    // `setInterval` and `clearInterval` knows where it came from.
    this.clear =
      opts.clearInterval ??
      ((handle) => {
        clearInterval(handle as ReturnType<typeof setInterval>);
      });
  }

  /**
   * Proof: the body of this replaced with `this.handle = 'never-scheduled'` and
   * three of the four tests failed — the schedule is what they observe, not a
   * flag saying it was requested.
   */
  start(): void {
    if (this.handle !== null) return;
    this.handle = this.set(() => {
      // A tick arriving while a sweep is still running is dropped, not queued.
      // Overwriting `inFlight` meant `stop()` waited for the newest sweep and
      // `process.exit(0)` could land inside an older DELETE — against a file
      // the other deployment colour is also writing to.
      if (this.inFlight !== null) return;
      this.inFlight = this.sweep().finally(() => {
        this.inFlight = null;
      });
    }, this.opts.intervalMs);
  }

  /**
   * Whether a schedule is currently in place.
   *
   * Exists so a test can assert that the *process* started the timer, not just
   * that the class can start one. `runRetention` sat with no production caller
   * for a whole change; a `start()` nobody calls is the same failure one layer up.
   */
  isRunning(): boolean {
    return this.handle !== null;
  }

  /** Stops the schedule and waits for a sweep already running. */
  async stop(): Promise<void> {
    if (this.handle !== null) {
      this.clear(this.handle);
      this.handle = null;
    }
    await this.inFlight;
  }

  private async sweep(): Promise<void> {
    try {
      const removed = await runRetention(this.opts.repo, {
        maxPerSubscription: this.opts.maxPerSubscription,
      });
      this.opts.onSweep?.(removed);
    } catch (err) {
      // Caught, reported, and the schedule left running: one failed sweep is a
      // locked database or a transient I/O error, and stopping would turn a
      // recoverable blip into permanent unbounded growth.
      this.opts.onError(err);
    }
  }
}
