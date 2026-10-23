# Task 7.4 bounded mounted publication, replay and Retry — 2026-10-23

Base: `a4668b95621f3ed4b82c441dc45627188eacd042`. Isolated checkout:
`/tmp/puni-publication-74`. Production implementation and shared fixtures are
unchanged. Parent 7.4 remains unchecked; production activation remains dormant.

`apps/wbs/be-01/src/services-connected-publication.db.test.ts` mounts `buildApp`
through `testApp`, supplying composed `buildServices` and a migrated SQLite source
with synthetic dependency authority. Authentication is a fixture. The injected
process adapter supplies raw wire stdout and an exit promise; no OS solver child
or Python solver is run. Parsing, objective validation, real publication,
source-owned outcome persistence, captured cache decoding, tree DTO and manual
Retry route use their installed implementations.

## Acceptance exercised

Two target items share a capacity-one team and both depend on a fixed foreign
predecessor. Fast places long at `[1,3]` and short at `[3,4]`. Raw successful
responses improve priority by placing long at `[2,4]` and short at `[1,2]`.
Tests assert those literal target offsets and unchanged foreign `[0,1]`, two
scope-bearing version-2 optimized durable rows, two optimization success events,
released queue/slots, ready DTOs and identical complete replay on repeated GETs.
The dates here are workday offsets from the persisted 2026-10-05 anchor.

A separate run supplies invalid movement objective values only for Pri. The
mounted path persists `invalid-output`; Time remains ready. Repeated GETs leave
the complete generation/queue/slot/cache/event ledger unchanged. A stale Retry
hash returns 409 without mutation; the current hash returns 202, launches only
Pri, restores ready, and preserves the complete healthy Time cache row.

Structured JSON tampering changes either the persisted candidate's long offset
to overlap the short item or the persisted comparison movement to 999. Each
becomes corrupt with Time ready, retains the complete Fast composite, and leaves
that same ledger untouched across repeated GETs. The corrupt evidence never
becomes automatic work.

## Watched production-path fault proofs

Each fault was applied alone, run against the four mounted tests, and restored
in `finally`. Every run returned 1 with 3 passing tests and exactly the intended
one failing. Adjacent `Proof:` comments link the affected acceptance assertions.
Outputs are under `evidence/task-7.4-mounted-publication/`; literal NUL key
separators are rendered as `\u0000` for readable text diffs.

| Fault                                                                                        | Observed failure                                                    | Evidence                  |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------- |
| Return `{ok:true,published:true}` immediately from connected wire revalidation               | Invalid movement becomes ready rather than failed in the Retry test | `validator.log`           |
| Force real connected publication's `worse` predicate true                                    | Selected target offsets remain Fast rather than improved            | `publication.log`         |
| Replace cached candidate response with the fixture's valid raw candidate before revalidation | Candidate tamper becomes ready rather than corrupt                  | `cached-revalidation.log` |
| Remove stored comparison equality                                                            | Comparison tamper becomes ready rather than corrupt                 | `cached-comparison.log`   |
| Pass `undefined` instead of the optimizer into mounted project routes                        | Retry returns unavailable 503 instead of stale-hash 409             | `retry-route.log`         |

These are scoped proofs, not independent evidence for every underlying guard.
For example, skipping wire validation still leaves the real resource replay
protecting the overlapping persisted candidate; comparison and candidate checks
protect different evidence. The candidate-substitution fault deliberately
replaces untrusted cached response evidence with a known valid response; it does
not claim removal of every decoder check independently admits corruption.

## Remaining fractional mounted limit

The lower-level `integer-valid response that reconciles a fixed foreign start
is invalid output` test passes in the focused run. Its C pin is independently
padded to `1.208333334`. A genuine mounted topology was attempted: predecessor
work 0.2, local work 1, and foreign C's preceding step 1.208333334. Capture
retains C second-step start 1.208333334 and its authored internal first-to-second
edge. The integer candidate at `10/48` is valid, and that internal edge keeps C
fixed, so the installed path correctly remains ready. Removing the forcing edge
or synthesizing the captured pin would change the evidence being tested. That
attempt was removed; this packet makes no mounted fractional-drift claim and
establishes no production defect. Its mounted acceptance remains open.

## Verification

- New mounted suite: 4 pass, 0 fail, 74 assertions; see `mounted-tests.log`.
- Focused six suites: 155 pass, 0 fail, 914 assertions in 43.49s, before the final
  foreign-finish and healthy-sibling assertions. Command:
  `bun test apps/wbs/be-01/src/services-connected-publication.db.test.ts apps/wbs/be-01/src/services-connected.db.test.ts apps/wbs/be-01/src/service/connected-optimization-publication.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-optimization-cache.db.test.ts libs/wbs/domain/contracts/solver/src/connected-solver-outcome.test.ts libs/wbs/domain/domain/src/connected-publication.test.ts --timeout=10000`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck`:
  passed, including all three module typechecks and forced backend TS build.
- `bunx openspec validate --all --json`: 271/271 passed (253 changes, 18 specs).
  Exploratory `--strict` validation of this change exits 1 on its pre-existing
  long-requirement warnings; no specification was changed here.
- Plain Nx initially printed sandbox socket refusal and returned 0 without
  running lint. That exit is not accepted as validation; disabled daemon/plugin
  isolation commands are used for the actual checks.
- Final Prettier check of the changed test and both verification documents passed;
  `git diff --check` passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:lint`:
  passed in 55.9s after correcting two unsafe JSON event parse accesses in this
  test. Changed-file ESLint also passed. Earlier full lint attempts failed while
  those test errors were present; final output is `lint.log`.

No full Nx gate, host gate, build, browser, OS solver, deployment or activation
was run. This bounded test-only packet is not a release or a completion claim
for parent 7.4.
