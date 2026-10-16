## Runtime ownership

A single asynchronous loop performs a sweep, then waits an abortable one-hour delay. Awaiting the sweep enforces serialization. Its stop operation aborts the loop and joins its completion promise. The completion promise preserves unexpected failure. Boot starts this owned resource after schema admission and releases it before storage. Production entrypoint failure policy awaits exact caller review.

## Bounded progress

Each sweep passes a 32-claim limit to the core service. The runtime sorts the fully validated repository snapshots by lastCheckedAt, then ID before selecting the batch. Repository reads and validation remain unbounded: all verified claims are read and validated before any due snapshots are returned. Applying SQL LIMIT before validation could hide malformed trusted rows outside the batch. Successful or failed current completions advance lastCheckedAt and disappear from eligibility for seven days, allowing later batches to progress. Continually mutated snapshots can remain stale; no fairness guarantee overrides transactional currentness.

## Cancellation and DNS failure

An optional caller signal propagates to bounded DNS lookup and is rechecked before each write. Cancellation returns a controlled partial outcome rather than a failed proof. A core port error identifies expected DNS unavailability; unexpected failures propagate, including adapter cleanup failures. Repository finishProofCheck remains the authority for activation, release, rotation and time currentness.

## Cancellation at queued completion

A service check immediately before finishProofCheck cannot prevent cancellation while the repository waits for its write gate. The reviewed port adds an optional cancellation signal to finishProofCheck and a `cancelled` completion outcome alongside checked/stale. The repository checks that signal inside the immediate transaction, after acquiring the gate and before any update. Core returns partial counts for cancelled completion. No asynchronous boundary exists between that final cancellation check and its synchronous SQLite update.

The held-gate RED fixture at `/tmp/domain-proof-worker.queued-cancellation.db.test.ts` reproduced the defect: on day fourteen, cancellation while finish waited for the gate still changed last_checked_at from 1000000 to 1210600000 and status from verified to suspended. The transaction-entry signal check is implemented and covered by matching and missing-TXT repository integration tests in domain-proof-worker.db.test.ts. Stop remains pending until the held write turn releases. These are repository integration tests, not HTTP-mounted tests. A separate test cancels during an admitted transaction's synchronous commit clock and proves the committed check remains counted truthfully.

The current core outer watchdog races only its five-second deadline, not parent abort. Parent cancellation reaches the resolver, which joins resource cleanup before settling. Unexpected cleanup failure remains an exception even after parent abort. The watchdog may return before a noncompliant injected resolver joins; the production adapter's shorter 4.9-second hard work-and-cleanup bound is the ownership requirement. Adapter subclass wiring is pending the reviewed DNS successor.
