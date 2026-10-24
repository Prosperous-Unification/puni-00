# Joined source observer cancellation

Independent review reproduced a gap in the previous deadline packet: the shared
runDockerBefore races its timeout against the runner, so rejection could precede
runner cleanup and owner-boundary completion. The earlier child tests awaited
child.exited after catching that rejection, which did not prove that the observer
itself joined cleanup. Initial new RED cases fail on that exact early return.

Derived source observer read scopes now select a source-only abort-and-await
helper. Its deadline aborts a local controller, but it directly awaits the entire
original owner-wrapped Docker promise before returning or throwing. Production
transport's SIGKILL, pipe reads and child wait are therefore joined, along with
owner readback and any transport cleanup. Original exclusion and parked scopes
retain their transport strategy; no original scope is mutated. Native filesystem
calls remain awaited and checked at shared owner/evidence-read boundaries.

There is no second detached cleanup cutoff. An injected runner must honor abort
and settle; an uncooperative runner cannot promise both finite completion and no
background work. The timeout remains primary. A worker failure during the join
adds only closed command/category context and a SHA256 of at most 4096 message
characters. Raw errors, causes, stdio, Config.Env and enumerable fields are not
retained in the aggregate, and own descriptors are read without invoking getters.

Six gated production-path tests cover both public observers with successful,
failing and accessor-bearing cleanup. After abort, the observer remains pending
while the cleanup gate is closed. After opening it, rejection proves the child is
already reaped, the live owner check is complete and the full owner readback has
settled, without a test-side child wait before these assertions. The unchanged
original token then remains usable. Deep error-graph inspection excludes private
sentinels and verifies the original timeout cause is retained. Six tests passed
with 80 assertions before final focused checks.

Four independent watched faults failed the intended tests: observer join,
cleanup privacy, primary failure identity and getter-free diagnostic projection.
All mutations were restored. Evidence and final commands are recorded under
evidence/source-observer-join/. No full unit suite or host operation ran here.

Focused source/owner/native/typed run: **330 passed, zero failed, 991 assertions**
across 14 files. After final test resolver typing and catch-boundary lint fixes,
the complete source observer suite passed **53 tests, 200 assertions**; the final
six gated cases passed **80 assertions**. All four fault proofs were reconfirmed
on the final implementation. Uncached Nx lint/typecheck/build, explicit test
typecheck and focused OpenSpec validation passed. Normal hooks remain required
for the correction commit before independent rereview.
