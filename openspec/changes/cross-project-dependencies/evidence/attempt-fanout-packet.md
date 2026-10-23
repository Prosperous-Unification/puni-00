# Task 5.2 attempt fanout packet

Base: `3f51111b6b0e077884adee449b48ddfcdf6c3194`.

Production delta: read validated, ordered step attempts for each authorized dependency-component member on the borrowed DB, assert the snapshot is still open immediately after the awaited read, and include the detached rows in the component fingerprint. The change does not alter event routing, organization scope, or execution eligibility.

Red/green: the new isolated and shared mounted SS test failed before implementation after `startAttempt`: B was startable but its expected first event count was 0. With the production delta, start, failed end and removal each produced one event in both B and C. The unrelated foreign organization had none; relationship rows stayed equal.

R5 faults: replacing only fingerprint attempts with `[]` failed both mounted modes at B's first expected event ([log](attempt-fanout-fingerprint-fault.log)); removing the post-await lifetime assertion let the expired a2 read resolve instead of rejecting ([log](attempt-fanout-lifetime-fault.log)). An injected attempt repository read failure returned 500 with attempt, event, sequencer and journal tables unchanged. A rejected two-command batch rolled back the first attempt without B/C publication. Adjacent `Proof:` comments name these faults.

Verification: focused mounted event and DB capture command passed 31 tests and 276 assertions; configured `wbs-store-sqlite:typecheck`, `wbs-be-01:typecheck`, `wbs-store-sqlite:lint`, `wbs-be-01:lint` passed. Nx daemon fallback's first bare typecheck emitted no target execution and was not counted; the later configured runs used `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` and printed targets. The first configured store typecheck found a test-only `this` annotation issue; it was corrected and rerun green. Format and committed diff checks are recorded at commit time.

Limits: full CI, exact-SHA h2puni gate, broader task 5.2 writer audit and socket/browser acceptance remain unverified. Independent Astra High review is pending.
