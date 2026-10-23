# Source observer deadline propagation

Both public source observers accept an optional finite future deadline. They derive
a local read view using min(original, supplied), without mutating or storing it in
the token WeakMap. Every nested inventory/image/Docker operation uses that view.
Final callback-expiry checks compare the WeakMap against the original scope, so a
successful bounded observation neither loses live authority nor extends it.

The tighter deadline is checked before and after shared owner/evidence reads.
Native filesystem syscalls are checked at awaited boundaries; their shared APIs
were not widened and no detached Promise.race was introduced. Docker children
receive runDockerBefore's abort signal and use the existing termination contract.

Initial RED cases reproduced ignored invalid supplied deadlines and a stalled child
outliving its shorter observation limit. For both observers, production-path tests
now cover expired/NaN/Infinity before Docker reads, real local stalled ps/image child
abort and awaited reaping, successful reuse of the unmodified original scope, longer
supplied limits refusing at original expiry, and gated observations after callback
expiry. The existing ordinary/source owner behavior remains covered.

Five independent watched faults failed: input validation, tighter local scope,
original upper limit, original WeakMap authority and final expiry. Every mutation
was restored. Evidence and final focused/static command results are recorded under
evidence/source-observer-deadline/. No full unit suite or host operation ran here.

Final focused source/owner/native/typed run: **324 passed, zero failed, 911
assertions** across 14 files (29.93 s). The complete restoration success path at
this stack head also passed, with 2135 assertions (4.24 s). Normal Nx lint,
typecheck and build, explicit test typecheck and focused OpenSpec validation
passed. Normal commit hooks are required before independent combined review.

Independent review later found that the shared transport race could reject before
its aborted worker settled. The original child tests waited after rejection and
did not prove joined observer cleanup. The correction and stronger gated proofs
are recorded in verify-source-observer-join.md; that packet is required with this
one before physical retry.
