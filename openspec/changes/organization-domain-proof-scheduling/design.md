## Runtime ownership

A single asynchronous loop performs a sweep, then waits an abortable one-hour delay. Awaiting the sweep enforces serialization. Its stop operation aborts the loop and joins its completion promise. The completion promise preserves unexpected failure. Boot starts this owned resource after schema admission and releases it before storage. Production entrypoint failure policy awaits exact caller review.

## Bounded progress

Each sweep passes a 32-claim limit to the core service. The runtime sorts the fully validated repository snapshots by lastCheckedAt, then ID before selecting the batch. Repository reads and validation remain unbounded: all verified claims are read and validated before any due snapshots are returned. Applying SQL LIMIT before validation could hide malformed trusted rows outside the batch. Successful or failed current completions advance lastCheckedAt and disappear from eligibility for seven days, allowing later batches to progress. Continually mutated snapshots can remain stale; no fairness guarantee overrides transactional currentness.

## Cancellation and DNS failure

An optional caller signal propagates to bounded DNS lookup and is rechecked before each write. Cancellation returns a controlled partial outcome rather than a failed proof. A core port error identifies expected DNS unavailability; unexpected failures propagate, including adapter cleanup failures. Repository finishProofCheck remains the authority for activation, release, rotation and time currentness.
