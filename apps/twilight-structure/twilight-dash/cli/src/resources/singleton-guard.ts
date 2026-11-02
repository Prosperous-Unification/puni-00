import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  guardHoldFile,
  holdLegacyLock,
  holdLogFile,
  legacyHoldDirectory,
  type LegacyLock,
} from './legacy-lock';
import { GUARD_LABEL, type ResourceRuntime } from './runtime';

/**
 * How long the guard's holder queues on the shell lock per attempt: a legacy run ahead of it is
 * at most a gate's length, and a spent attempt is simply started again on the next tick.
 */
const GUARD_ATTEMPT_SECONDS = 3600;
const SWITCH_HOLD = 'dash-switch-mode';
/** A host job id as `pollHostJob` writes it (`randomUUID`). */
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The concurrent-mode singleton guard (`dash-host-jobs` J12), driven by `resources watch` once a
 * tick. While the pool is concurrent with the guard on and a ticket is queued or a host job's
 * compute is unreleased, the guard holds the canonical flock as a legacy holder labelled
 * {@link GUARD_LABEL}, so a stale launcher on an older checkout queues behind every host job;
 * when that demand ends it lets go, so legacy callers run on an idle host. The holder is the
 * shell lock's own, in its own session, and outlives this `watch`: a restarted `watch` adopts a
 * live recorded holder rather than queue a second one.
 *
 * Each tick also ends the legacy holds nobody else will: an observe-mode job's once its compute
 * is released, and a dead `switch-mode`'s.
 */
export class SingletonGuard {
  private attempt: AbortController | null = null;

  constructor(
    private readonly runtime: ResourceRuntime,
    private readonly lock: () => LegacyLock,
    private readonly environment: Readonly<Record<string, string | undefined>>,
    private readonly report: (line: string) => void,
  ) {}

  /**
   * One reconciliation. Acquisition is started, never awaited: the guard queues on the shell
   * lock in the background and is recorded once it holds.
   * @throws when a hold file names a host job the ledger does not know: only Dash writes them.
   */
  tick(): void {
    // A ticket whose launcher died must not keep demand alive, nor a switch waiting (review K3).
    // Proof: without it `a ticket of a dead launcher holds neither the switch nor the guard`
    // (host-pool-mode.test.ts) kept the guard holding with nothing queued (2026-11-02, K3).
    this.runtime.reclaimDeadTickets(this.report);
    // A hold Dash cannot account for stops the guard where it stands (review H7): releasing or
    // acquiring beside it could end a hold someone still relies on.
    if (this.releaseSettledHolds().corrupt !== null) return;
    const { required, demand, holder } = this.runtime.guardObligation();
    const file = guardHoldFile(this.runtime.configuration.root);
    if (required && demand) {
      if (holder?.live === true || this.attempt !== null) return;
      if (holder !== null) {
        // Proof: without it `a guard holder lost mid-run marks the running jobs`
        // (host-pool-mode.test.ts) found no job marked (2026-11-02, review H5).
        const marked = this.runtime.recordGuardLost(holder.pid);
        this.report(
          `resources: singleton guard holder pid ${String(holder.pid)} is gone while host jobs need it; the canonical flock was not held for ${marked.length === 0 ? 'no newly marked job' : marked.join(', ')}; admission waits, and the guard queues again`,
        );
      }
      // A hold file without a live holder is a dead holder's; a new one takes its place.
      rmSync(file, { force: true });
      rmSync(holdLogFile(file), { force: true });
      this.acquire(file);
      return;
    }
    if (this.attempt !== null) {
      this.attempt.abort();
      this.attempt = null;
    }
    if (holder !== null) {
      // The record goes first, the flock after it, so admission never sees a guard the flock
      // no longer backs (see `ResourceRuntime.clearGuardHolder`).
      if (!this.runtime.clearGuardHolder()) return;
      rmSync(file, { force: true });
      rmSync(holdLogFile(file), { force: true });
      this.report(
        `resources: singleton guard released the canonical flock (pid ${String(holder.pid)})`,
      );
      return;
    }
    if (existsSync(file)) rmSync(file, { force: true });
  }

  /** Withdraw a queued attempt; a guard already held stays held for the next `watch`. */
  stop(): void {
    this.attempt?.abort();
    this.attempt = null;
  }

  private acquire(file: string): void {
    const abort = new AbortController();
    this.attempt = abort;
    const lock = this.lock();
    void holdLegacyLock(
      lock,
      {
        holdFile: file,
        label: GUARD_LABEL,
        waitSeconds: GUARD_ATTEMPT_SECONDS,
        pollSeconds: 5,
        signal: abort.signal,
        report: this.report,
      },
      this.environment,
    ).then(
      (outcome) => {
        if (this.attempt === abort) this.attempt = null;
        if (outcome.kind === 'held') {
          // Proof: recording nothing made `two eligible Dash jobs overlap while the guard
          // holds` (host-pool-mode.test.ts) time out waiting for admission (2026-11-02).
          if (this.runtime.recordGuardHolder(outcome.hold.pid, lock.lockPath))
            this.report(
              `resources: singleton guard holds the canonical flock ${lock.lockPath} (pid ${String(outcome.hold.pid)})`,
            );
          else outcome.hold.release();
        } else if (outcome.kind === 'refused')
          this.report(
            `resources: singleton guard got no turn on the shell lock (exit ${String(outcome.exitCode)}); queueing again`,
          );
      },
      (cause: unknown) => {
        if (this.attempt === abort) this.attempt = null;
        this.report(
          `resources: singleton guard attempt failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      },
    );
  }

  /**
   * End the holds whose owners are done: settled observe-mode jobs and dead switches, with their
   * logs; `resources sweep` calls this as the operator's one-shot release (review H1). A name
   * Dash did not write, or a job hold for a job the ledger does not know, is recorded as the
   * pool's hold corruption and nothing is released (review H7); a clean scan clears it.
   */
  releaseSettledHolds(): { released: string[]; corrupt: string | null } {
    const directory = legacyHoldDirectory(this.runtime.configuration.root);
    const names = existsSync(directory) ? readdirSync(directory).sort() : [];
    const settled: string[] = [];
    let corrupt: string | null = null;
    for (const name of names) {
      const base = name.endsWith('.log') ? name.slice(0, -'.log'.length) : name;
      if (base === 'dash-singleton') continue;
      if (base === SWITCH_HOLD) {
        // Proof: without it `watch ends an orphaned observe-mode hold once the job settles, and
        // a dead switch-mode hold` (host-pool-mode.test.ts) kept the shell lock held (2026-11-02).
        if (this.runtime.hostPoolTransition().switching?.live !== true) settled.push(name);
        continue;
      }
      if (!JOB_ID.test(base)) {
        corrupt = join(directory, name);
        break;
      }
      let compute: string;
      try {
        compute = this.runtime.inspectHostJob(base).compute.state;
      } catch (cause) {
        if (!(cause instanceof Error && cause.message === 'host job not found')) throw cause;
        corrupt = join(directory, name);
        break;
      }
      // Proof: without it `watch ends an orphaned observe-mode hold once the job settles`
      // (host-pool-mode.test.ts) left legacy callers queued behind a settled job (2026-11-02).
      if (compute === 'released') settled.push(name);
    }
    // Proof: without it `a stray file in the legacy hold directory stops concurrent admission`
    // (host-pool-mode.test.ts) saw the guard release beside it (2026-11-02, review H7).
    if (this.runtime.hostPoolTransition().holdCorruption !== corrupt)
      this.runtime.recordHoldCorruption(corrupt);
    if (corrupt !== null) {
      this.report(
        `resources: the legacy hold directory holds ${corrupt}, which Dash did not write; nothing is released and concurrent admission refuses until it is checked and removed`,
      );
      return { released: [], corrupt };
    }
    for (const name of settled) {
      rmSync(join(directory, name), { force: true });
      if (!name.endsWith('.log'))
        this.report(`resources: released the shell lock hold ${join(directory, name)}`);
    }
    return { released: settled, corrupt: null };
  }
}
