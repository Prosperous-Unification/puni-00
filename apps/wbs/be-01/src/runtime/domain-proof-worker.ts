import type { DomainProofChecks } from '@wbs/core/ports/domain-challenges';
import { checkDomainProofs } from '@wbs/core/service/domain-proof.service';

/**
 * Checks at most `limit` due proofs, oldest first with claim ID breaking ties.
 * The repository still reads and validates every verified claim before this
 * bound limits DNS lookups and commits; database reads remain unbounded.
 * `now` is checked again by the repository at commit.
 * @throws {RangeError} when limit is not an integer from 1 through 32.
 */
export function runDomainProofWorker(
  checks: DomainProofChecks,
  at: number,
  now = Date.now,
  limit = 32,
) {
  // Proof: removing integer, lower or upper validation separately let NaN,
  // zero or 33 survive `rejects sweep limits outside one through 32`.
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 32)
    throw new RangeError('domain proof sweep limit must be an integer from 1 through 32');
  return checkDomainProofs(
    {
      resolver: checks.resolver,
      readDueProofs: async (dueAt) => {
        const proofs = await checks.readDueProofs(dueAt);
        // Proof: removing oldest-first ordering made `checks older due
        // proofs` select claim-00 instead of claim-01. Removing the ID tie-break
        // made `checks 65 due proofs` select the reverse-inserted newer IDs.
        return (
          proofs
            .toSorted(
              (left, right) =>
                left.lastCheckedAt - right.lastCheckedAt || left.id.localeCompare(right.id),
            )
            // Proof: removing this bound made both matching and missing-TXT
            // `checks 65 due proofs` runs check 65 on their first pass, not 32.
            .slice(0, limit)
        );
      },
      finishProofCheck: (...args) => checks.finishProofCheck(...args),
    },
    at,
    now,
  );
}

/** The process-owned scheduler; completion rejects on unexpected sweep failure. */
export interface DomainProofWorker {
  readonly completed: Promise<void>;
  /** Aborts future work and joins the current sweep before storage may close. */
  stop(): Promise<void>;
}

/** Scheduling dependencies; the sweep must honor cancellation before committing. */
export interface DomainProofSchedule {
  sweep(signal: AbortSignal, limit: number): Promise<void>;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

/** Waits without holding shutdown open; abort is a controlled wakeup. */
function waitForSweep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const wake = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', wake);
      resolve();
    };
    const timer = setTimeout(wake, milliseconds);
    // Proof: omitting this listener made `joins cancellation of the
    // production timer` time out at 200 ms instead of completing stop.
    signal.addEventListener('abort', wake, { once: true });
  });
}

/**
 * Sweeps immediately, at most 32 claims per pass, then waits one hour after
 * each completed pass. Each process serializes its own sweeps; deployment
 * colors can still race and require the repository's currentness checks.
 */
export function startDomainProofWorker(schedule: DomainProofSchedule): DomainProofWorker {
  const cancellation = new AbortController();
  const wait = schedule.wait ?? waitForSweep;
  const isStopped = () => cancellation.signal.aborted;
  const completed = (async () => {
    while (!isStopped()) {
      // Proof: omitting the sweep made `sweeps immediately` observe 0 calls
      // instead of 1. Omitting await made `joins a running sweep` observe a timer
      // before its held lookup completed (expected 0 waits, received 1).
      await schedule.sweep(cancellation.signal, 32);
      // Proof: removing this check made `aborts and joins in-flight work`
      // schedule a wait after shutdown (expected 0 waits, received 1).
      if (isStopped()) return;
      await wait(3_600_000, cancellation.signal);
    }
  })();
  return {
    completed,
    stop: () => {
      // Proof: omitting abort made `aborts and joins in-flight work` observe
      // an un-aborted lookup signal after stop.
      cancellation.abort();
      // Proof: returning a resolved promise made `aborts and joins in-flight
      // work` observe stop complete before its held lookup joined.
      return completed;
    },
  };
}
