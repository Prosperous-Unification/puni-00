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

## Final checks

- Focused production-path suite: **535 passed, 0 failed, 45,147 assertions**, 21 files, 144.07 s. Includes ordinary callers, source/solver/backend/gateway/ingress exclusion, closed records/publication, terminal and created-attempt restoration, post-start policy drift, actual bundled CLI and actual delayed socket/cancellation.
- `NX_DAEMON=false bunx nx run-many --projects=tool-remote-scripts -t lint typecheck build --parallel=1`: **passed**. All three project tasks ran fresh; three unchanged dependency builds used local cache. Duration 18.6 s.
- `bunx --no-install openspec validate --all --json`: **277/277 passed**, 259 changes and 18 specs, zero failures.
- Changed-file Prettier check, normal commit hooks and final clean status: recorded by the final commit operation; no hook bypass is used.

The exact focused Bun argument vector is [retained here](evidence/solver-restoration/focused-command.json).

The initial broad replay exposed a duplicate-ID test fixture collision; the fixture was corrected, its unmodified production case passed, and its omission proof was repeated before the final green suite. A loaded positive replay also exceeded the inherited 10-second test budget; the scoped 20-second budget follows the measured repository rule without changing production deadlines.

## Watched production omissions

[Forty observed omission results](evidence/solver-restoration/omissions.json)
retain the selected test, failing assertion and exit 1. Every mutant was restored
before fresh normal checks; syntax/load failures were excluded as proofs.

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
