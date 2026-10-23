import type { Intervals } from '../../ports/timers';
import type { PlanCommandRunner } from './plan-commands.feature';

/** How often the coordinator looks for expired leases (`wbs-claim-leases` L7). */
export const CLAIM_LEASE_SWEEP_INTERVAL_MS = 30_000;

/** The most projects one tick releases; the rest wait for the next tick (L7). */
export const CLAIM_LEASE_SWEEP_PROJECTS_PER_TICK = 50;

export interface ClaimLeaseSweepOptions {
  /** Releases one project's expired claims in a unit of work of its own. */
  readonly runner: Pick<PlanCommandRunner, 'releaseExpiredLeases'>;
  /**
   * The projects holding a lease run out at `at`, at most `limit`: the public
   * claim store's read, outside any turn.
   */
  readonly projectsWithExpiredLeases: (at: number, limit: number) => Promise<string[]>;
  /** The clock the projects to visit are chosen by; each release reads its own inside its turn. */
  readonly now: () => number;
  /** How this runtime repeats work; required, as `RetentionTimer`'s is. */
  readonly intervals: Intervals;
  readonly intervalMs: number;
  readonly projectsPerTick: number;
  /** Reported per tick that released something. */
  readonly onSweep?: (released: number) => void;
  /**
   * A tick or one project's release that threw, with that project's id when
   * it was one project's. Required: a dead sweep strands capacity exactly as
   * the missing one did, and looks identical to a healthy one from outside.
   */
  readonly onError: (error: unknown, projectId: string | null) => void;
}

/**
 * The coordinator that gives back claims nobody renewed (`wbs-claim-leases`
 * L7): at start and every `intervalMs`, it reads up to `projectsPerTick`
 * projects holding an expired lease and releases each through
 * {@link PlanCommandRunner.releaseExpiredLeases}, one unit of work per project,
 * so no turn is held across projects.
 *
 * One tick runs at a time. A tick asked for while one runs (the timer, or a
 * revocation's {@link requestSweep}) is coalesced into one follow-up, so a
 * revocation that lands mid-tick is never lost behind it.
 */
export class ClaimLeaseSweep {
  private cancel: (() => void) | null = null;
  private inFlight: Promise<void> | null = null;
  private requested = false;

  constructor(private readonly opts: ClaimLeaseSweepOptions) {}

  /** Starts the schedule and runs a first tick now. */
  start(): void {
    if (this.cancel !== null) return;
    // Proof: with this schedule replaced by a no-op, `sweeps at start and on
    // every interval…` and `reports a failed tick and keeps the schedule`
    // (claim-lease-sweep.test.ts) failed (2 pass, 2 fail); watched 2026-10-23.
    this.cancel = this.opts.intervals.every(this.opts.intervalMs, () => {
      this.requestSweep();
    });
    this.requestSweep();
  }

  /** Whether a schedule is in place: what boot's test reads. */
  isRunning(): boolean {
    return this.cancel !== null;
  }

  /**
   * Asks for a tick now: run one, or, while one runs, one more after it. What a
   * revocation calls so its claims go without waiting for the interval. Nothing
   * before {@link start} or after {@link stop}: no tick outlives the source.
   */
  requestSweep(): void {
    if (this.cancel === null) return;
    // Proof: with this guard bypassed, `coalesces requests during a tick into
    // one follow-up` (claim-lease-sweep.test.ts) started a tick per request
    // (3 pass, 1 fail); watched 2026-10-23.
    if (this.inFlight !== null) {
      this.requested = true;
      return;
    }
    this.inFlight = this.tick().finally(() => {
      this.inFlight = null;
      if (this.requested) {
        this.requested = false;
        this.requestSweep();
      }
    });
  }

  /** Stops the schedule and waits for a tick already running, and its follow-up. */
  async stop(): Promise<void> {
    if (this.cancel !== null) {
      this.cancel();
      this.cancel = null;
    }
    this.requested = false;
    await this.settled();
  }

  /** Waits until no tick runs or is requested: for tests and shutdown. */
  async settled(): Promise<void> {
    while (this.inFlight !== null) await this.inFlight;
  }

  private async tick(): Promise<void> {
    let projects: string[];
    try {
      projects = await this.opts.projectsWithExpiredLeases(
        this.opts.now(),
        this.opts.projectsPerTick,
      );
    } catch (error) {
      // Reported and the schedule kept: one failed tick is a busy database or
      // a transient I/O error; stopping would strand every later lease.
      // Proof: rethrowing here failed `reports a failed tick and keeps the
      // schedule` (3 pass, 1 fail); watched 2026-10-23.
      this.opts.onError(error, null);
      return;
    }
    let released = 0;
    for (const projectId of projects) {
      // One project's failure is its own: the rest of the tick still runs.
      // Proof: with one try around the whole loop, `releases the next project
      // on the same tick when one project's release throws`
      // (claim-lease-sweep.test.ts) released nothing after the first
      // (4 pass, 1 fail); watched 2026-10-23.
      try {
        released += await this.opts.runner.releaseExpiredLeases(projectId);
      } catch (error) {
        this.opts.onError(error, projectId);
      }
    }
    if (released > 0) this.opts.onSweep?.(released);
  }
}
