# P2a compatible supervisor restoration: local source evidence

Base: reviewed terminal-contract root `1d72ba511bfb2b08aa3b8ddf8906746ea35546cc`.
Local implementation and checks: 2026-10-24, pinned Bun 1.4.2, isolated
`/tmp/puni-solver-restoration`. No production host operation was performed.

## Bounded behavior

`restoreSolverAfterDependencyExclusion()` accepts independent solver pins and
shares the existing full source/managed exclusion core. It observes complete
configured immutable images through actual owner-bound backend capability probes,
retains private intent and returns through every finalizer before releasing solver
runtime exclusion. Source and solver tokens expire. A separate private monitor
then freshly checks complete parked inventory, source image/tag/entrypoint and
stopped state, managed backend/gateway and SQLite identities, retained records and
closed ingress; it supplies no namespace or storage admission.

The reviewed created-attempt correction removes only captured terminal/inert
solver attempts by exact full ID, without force or volume flags, after fresh
snapshot/inventory checks and durable removal intent. Every removal is read back.
Terminal receipts and deadline timers remain. Only after the expected cohort is
empty does owner-only descriptor-relative private policy replacement permit the
fixed compatible supervisor to start. Strict service/process/cgroup, tuple/image,
actual bounded socket connection, fresh parked monitoring and exact final policy
readback precede the bounded return:

```json
{
  "state": "solver-restored-participants-fenced",
  "activation": "not-performed",
  "exposure": "closed"
}
```

The runtime independently verifies policy/intent/pending hashes and exact bytes,
closed owner scope, absent committed marker, actual fixed executable/kernel inode,
bundled module/argv, independent tuple pins and complete immutable image coverage
under its process-lifetime lock. An observed retained owner makes admission
verification failure terminal exit 78 with a sanitized cause. Lock contention and
post-admission startup failures remain exit 1. An ordinary-policy substitution
cannot reopen admission after a restoring precheck. Ordinary installers/deployers
and ordinary-policy preflight remain closed; `active` remains unsupported.

There is no caller maintenance callback, storage activation, migration,
application startup, ingress reopening, marker retirement, automatic repair or
old-tuple restoration. P2b/P3, S4, parent 10.2, independent source review and
separately authorized actual-host adoption/acceptance remain open.

## Initial source checks at `712eff63e`

- Focused production-path suite: **535 passed, 0 failed, 45,147 assertions**, 21 files, 144.07 s. Includes ordinary callers, source/solver/backend/gateway/ingress exclusion, closed records/publication, terminal and created-attempt restoration, post-start policy drift, actual bundled CLI and actual delayed socket/cancellation.
- `NX_DAEMON=false bunx nx run-many --projects=tool-remote-scripts -t lint typecheck build --parallel=1`: **passed**. All three project tasks ran fresh; three unchanged dependency builds used local cache. Duration 18.6 s.
- `bunx --no-install openspec validate --all --json`: **277/277 passed**, 259 changes and 18 specs, zero failures.
- Changed-file Prettier check, normal commit hooks and final clean status: recorded by the final commit operation; no hook bypass is used.

The exact focused Bun argument vector is [retained here](evidence/solver-restoration/focused-command.json).

The initial broad replay exposed a duplicate-ID test fixture collision; the fixture was corrected, its unmodified production case passed, and its omission proof was repeated before the final green suite. A loaded positive replay also exceeded the inherited 10-second test budget; the scoped 20-second budget follows the measured repository rule without changing production deadlines.

## Watched production omissions

[Forty-two verified omission results](evidence/solver-restoration/omissions.json)
retain the selected test, failing assertion and exit 1. The original fortieth
final-policy attempt was incorrectly classified: its raw output showed only a
10-second timeout, without an assertion. That attempt is explicitly **unverified**,
is excluded from the verified count and is retained with the incorrect prior
claim in [the correction history](evidence/solver-restoration/omission-history.json)
and [unaltered raw timeout receipt](evidence/solver-restoration/final-policy-original-timeout.log).
A fresh omission under the current 20-second scoped budget finished in 6.45 s
and observed the actual forbidden-success assertion `Expected: true / Received:
false`; [raw assertion receipt](evidence/solver-restoration/final-policy-assertion.log).
The verified record count is aggregate evidence: the other 39 original
assertions at `712eff63e` (not claimed as reruns on the corrected source), that
fresh corrected assertion, and the two new installed-config/privacy and
publisher-order guard assertions. The correction packet replayed the latter
three omissions against its own source.
Every mutant was restored before fresh normal checks. Timeouts, syntax and load
failures are not assertion proofs.

| Boundary                  | Injected omission or fault                                                                                                                         | Observed refusal/proof                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Closed trusted records    | Open restoring/pending objects; unsupported intent operation; empty/invalid/unsorted images; non-contract record path; private/size/identity check | Phase-aware reader, decoder and actual admission cases fail under the corresponding omission.                                        |
| Independent compatibility | Omit required semantic support after actual capability observation                                                                                 | Incapable image reaches forbidden success; composed incapable test fails.                                                            |
| Runtime bindings          | Omit intent hash, exact owner bytes/scope, committed-marker refusal or complete image coverage                                                     | Wrong hash/owner/scope/marker or omitted configured mapping cannot enter the callback normally; selected omissions fail their tests. |
| Runtime freshness         | Omit tuple/policy/intent/pending readbacks                                                                                                         | Same-byte inode substitution or coherent identity drift reaches forbidden callback entry under omission.                             |
| Owner publication         | Omit original/fixed-path/private-mode/readback checks or staged/directory sync                                                                     | Changed original, foreign snapshot path, public-mode staging, no-op rename or injected sync failure cannot claim publication.        |
| Parked state              | Omit full membership, retained bytes or paired SQLite identity comparisons                                                                         | New unique unrelated participant, changed source evidence or replaced DB inode is admitted only by the mutant.                       |
| Exact cleanup             | Omit independent absence verification                                                                                                              | A no-op exact-ID rm reaches forbidden success.                                                                                       |
| Readiness                 | Omit process binding, mapping, actual connect, repeated start identity or final retained-policy readback                                           | Foreign cgroup, wrong immutable mapping, refused socket, changed ticks or post-start policy substitution reaches forbidden success.  |
| Actual executable         | Omit the self-identity comparison                                                                                                                  | A wrong executable survives admission instead of refusing; actual built CLI test fails.                                              |
| Terminal closure          | Omit restoring exit-78 conversion, observed-owner requirement, private cause filter or no-ordinary-fallback check                                  | Actual CLI exits with the wrong class, exposes malformed-config sentinel, or a substituted ordinary phase enters the callback.       |

The new-participant fixture uses a distinct full ID; its unmodified test passed
before repeating the membership omission. The repeated omission then failed at
`Expected: true / Received: false` because the missing check permitted success,
rather than at an unrelated duplicate-inventory guard.

Two additional RED→GREEN privacy regressions exercised real production paths:
raw rejected systemd Environment retention exposed `PRIVATE_HOST_SENTINEL` before
host responses were hashed; malformed capability transport exposed
`PRIVATE_CAPABILITY_SENTINEL` before the producer's private diagnostic boundary.
The actual built CLI also refuses malformed configuration without exposing
`PRIVATE_CONFIG_SENTINEL`.

## Physical limits and retained work

The actual local built-CLI test copies the real pinned Bun, builds the real
supervisor bundle and derives executable/kernel inode/module/argv in that process.
A test-only build plugin validates and translates fixed paths into private
fixture files; no production selector or claimed execution context exists. Wrong
executable/module/arguments and malformed config exit 78 before listener or Docker
startup trace; valid startup holds the kernel runtime lock until termination.
Docker capability/lifecycle output is supplied by private fixture executables,
and coordinator service/cgroup observations are injected production-port fixtures.
They do not prove live systemd/Docker adoption or host serving.

The whole-project Nx test target, real Caddy/Docker/systemd acceptance, repository
CI and the exact-SHA h2/h4 gate were not run in this source-only implementation.
The required scoped lint/typecheck/build, focused production-path tests and locked
OpenSpec validation are separate from those later host/CI checks. The composition
cases have a measured 20-second per-case budget under
[the existing budget policy](../../../docs/test-budgets.md); their production
operation deadlines and all refusal checks remain bounded.

## Independent review corrections on `712eff63e`

The review's malformed installed-config injection during capability observation
was reproduced through the actual full coordinator. The same issue was confirmed
in the direct compatibility producer and in a finalizer-only injection after both
post-probe tuple observations had returned. JSON parse text and schema key names
could expose fixture sentinels; UTF-8 failures lacked safe configuration context.
The native installed-config boundary now covers UTF-8 decoding, JSON parsing,
full supervisor schema validation and image extraction, exposing only fixed field
context and the exact captured-byte SHA256. No raw cause is retained. Unknown
failures still reject; no empty support or installed-hash fallback is introduced.

A coherently rehashed pending publication with `[dev, prod]` layouts also entered
the runtime callback before correction. The shared decoder now requires the
existing publisher's exact `[prod, dev]` order and retains all closed-field,
uniqueness, full-scope and digest checks. Normal publication was already sorted.

The confirmed regression selection first observed **9 failing tests** against the
reviewed source, then **9 passing tests / 11,785 assertions** after correction.
Removing the configuration privacy boundary again made all seven direct,
coordinator and finalizer JSON/schema/UTF-8 cases fail; removing the order guard
made the shared decoder and coherently rehashed runtime cases fail. Those watched
assertions are included in the 42-result record above.

Final correction checks:

- Focused 21-file production-path suite: **543 passed, 0 failed, 56,925 assertions**, 195.30 s. The actual built CLI retained its existing terminal exit-78 versus ordinary exit-1 assertions.
- `NX_DAEMON=false bunx nx run-many --projects=tool-remote-scripts -t lint typecheck build --parallel=1`: **passed**, fresh project tasks, three unchanged dependency builds cached, 18.6 s. Module-boundary lint ran with the generated project graph; the earlier graph-less autofix warnings are not counted as boundary verification.
- `bunx --no-install openspec validate --all --json`: **277/277 passed**, zero failures.
- Three fresh omission executions produced actual assertions: final policy (1 test), installed-config privacy (7 tests), exact publisher order (2 tests). None was a timeout or load failure.
- Changed-file formatting and normal commit hooks are checked for the correction commit; no hook bypass is used.

Independent Astra rereview approved exact
`085c2773cd39c9a5e1f2b59610e36e642fc750df`: **236 passed, 0 failed,
55,963 assertions** across eight files; both original independent repros passed.
All three fresh omission logs were inspected. Physical adoption/acceptance remains
open. This packet changes no activation, participant exposure, ownership lifetime
or P2b/P3 behavior.

## Root integration replay

The reviewed restoration stack was integrated through
`05e6dc1df1760c593703f2005d5abe5f60a615c9`. The expanded 27-file selection
reported **611 passed, one failed, 57,139 assertions** in 191.01 seconds. The sole
failure was the existing 20-second `source-record` test deadline while a concurrent
Nx lint run was active. That failed run is not counted as passing.

The same case then passed unchanged in 6.52 seconds with 1,841 assertions after
Nx finished. The entire affected backend/restoration file was rerun without the
competing Nx tasks: **93 passed, 0 failed, 55,463 assertions**, 118.01 seconds.
No test deadline or production check was changed. This supports resource
contention as the timeout explanation; it does not replace the required final
integrated host gate.

Fresh uncached configured lint, typecheck and build completed successfully at
that integration SHA: six real Nx tasks, 44.2 seconds. Bun was the independently
verified isolated pinned 1.4.2 executable. The full Caddy prerequisite and full
host gate were not part of these local commands. Later source-mount monitoring
changes require their own integration replay.
