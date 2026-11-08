# Solver wire integrated after independent round 2 review

Astra approved the bounded canonical-stage wire checkpoint in
[the full review](task-7-wire-round2-proofs/puni-connected-solver-wire-round2-review.md.txt).
Original source and two correction commits were integrated as `28ef7499c`,
`53968e93e`, and `bb8bd4922`. The composite 78-path manifest matches, except
that the existing connected-publication export block remains in the domain index.

Static schema import fixes built-artifact loading. Every retained foreign holder
now receives safe-quantization preflight before filtering and terminal classification.
Independent checks passed: contracts 518, Python 276, 15 probes, types/lint,
and an executed artifact that actually invokes local revalidation and connected
preparation. Root's integrated contracts/domain test, typecheck and lint passed
all six uncached Nx targets at `bb8bd4922`.

[Exact reports, probes and logs](task-7-wire-round2-proofs/) include SHA256SUMS.
The permanent artifact fixture only checks the local function's type; the
independent executed-entry probe actually calls it. The 28 mutation outcomes
are 20 acceptance/typed-outcome failures, six diagnostic/ordering failures,
and two valid-input failures. They are not 28 independent unsafe acceptances.

A P3 discrepancy remains for direct raw requests with nested real occupancy:
Python accepts their correct union while TypeScript's backward merge disagrees.
The canonical stage rejects such overlapping real bookings earlier, so this
is not a demonstrated canonical-stage blocker. The failing nested probe,
retained request and CLI outcome are preserved. A later robustness correction
must preserve strict-overlap union and canonical nonoverlap policy.

Active backend fixture compatibility remains required and has its own Sol
worktree. Runtime coordinator/persistence, full feature acceptance, final host
and CI gates, and deployment remain open. No full task 7 checkbox is closed.
