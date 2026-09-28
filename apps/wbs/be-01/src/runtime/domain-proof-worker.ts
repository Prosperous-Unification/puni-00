import type { Intervals } from '@wbs/core';
import type { DomainProofChecks } from '@wbs/core/ports/domain-challenges';
import { checkDomainProofs } from '@wbs/core/service/domain-proof.service';

/** One injected run of the domain worker; `now` is checked at commit. */
export function runDomainProofWorker(checks: DomainProofChecks, at: number, now = Date.now) {
  return checkDomainProofs(checks, at, now);
}

/** How often be-01 runs retained domain proof checks when the worker is enabled. */
export const DOMAIN_PROOF_INTERVAL_MS = 60 * 60 * 1000;

export interface DomainProofScheduleOptions {
  readonly checks: DomainProofChecks;
  /** How this runtime repeats work; required so no timer default hides here. */
  readonly intervals: Intervals;
  readonly intervalMs: number;
  /** Read once per run as the check instant, and again inside each commit. */
  readonly now: () => number;
  readonly onChecked?: (counts: { checked: number; stale: number }) => void;
  /**
   * A run that threw, for example on corrupt retained proof state. Required:
   * a silently dead worker looks healthy until domains quietly stop being
   * rechecked.
   */
  readonly onError: (error: unknown) => void;
}

/**
 * The periodic retained-proof worker (task 5.3), started only when
 * `WBS_DOMAIN_PROOF_WORKER=on`. A tick during a run is dropped, not queued,
 * and {@link stop} waits for the run in flight so the process never exits
 * inside a proof commit.
 */
export class DomainProofSchedule {
  private cancel: (() => void) | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(private readonly opts: DomainProofScheduleOptions) {}

  start(): void {
    if (this.cancel !== null) return;
    this.cancel = this.opts.intervals.every(this.opts.intervalMs, () => {
      // Proof: 2026-09-28, removing this guard made `drops a tick while a run
      // is in flight and stop waits for that run` observe two reads.
      if (this.inFlight !== null) return;
      this.inFlight = this.run().finally(() => {
        this.inFlight = null;
      });
    });
  }

  isRunning(): boolean {
    return this.cancel !== null;
  }

  /** Cancels the schedule and waits for a run already in flight. */
  async stop(): Promise<void> {
    if (this.cancel !== null) {
      this.cancel();
      this.cancel = null;
    }
    // Proof: 2026-09-28, returning without this wait made `drops a tick while
    // a run is in flight and stop waits for that run` find the run unfinished.
    await this.inFlight;
  }

  private async run(): Promise<void> {
    try {
      // Awaited before the optional call: `onChecked?.(await …)` skips its
      // argument, and so the whole run, when no reporter is given.
      const counts = await checkDomainProofs(this.opts.checks, this.opts.now(), this.opts.now);
      this.opts.onChecked?.(counts);
    } catch (error) {
      // Reported and the schedule kept: one failed run is a locked database or
      // a corrupt row the error names, and stopping would leave every other
      // domain unchecked.
      this.opts.onError(error);
    }
  }
}
