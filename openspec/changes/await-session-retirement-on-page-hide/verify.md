# Verification

Observed 2026-09-27 on branch `batch-9/050-10-pagehide-retirement`, from
`batch-9/050-08-delivery-routes` at `850fef10a` merged with `origin/main` at `140f86730`.

Faults, each injected by hand, its test run, the file restored and the test rerun green:

| Fault | Injected                                                                          | Named test                                                                                                                            | Observed                                                                                                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `j1`  | the join waits once, for the retirements handed before it began                   | `waits for a retirement joined while it waits`                                                                                        | `expected [ 'settled', 'joined late' ] to deeply equal [ 'joined late', 'settled' ]`                                                                                                                                         |
| `j2`  | the join drops a joined failure                                                   | `fails when a joined retirement failed, whenever it failed`; the bootstrap's model                                                    | `promise resolved "undefined" instead of rejecting`; model failed after 44 tests: `a session that failed left the slot empty`                                                                                                |
| `j3`  | the join accepts a retirement after it settled                                    | `refuses a retirement handed to it once it has settled`                                                                               | `expected function to throw an error, but it didn't`                                                                                                                                                                         |
| `a1`  | the application runtime's join disposer waits for nothing                         | `retires only once the retirement joined to it has settled`; both `is terminally fatal …` cases; the bootstrap's model                | `expected [ 'application retired', …(1) ] to deeply equal [ 'session given back', …(1) ]`; `promise resolved "undefined" instead of rejecting`; model failed after 44 tests: `a joined session did not hold the application` |
| `c1`  | `useRetirementJoin` hands a retirement to nobody when the application is not live | `refuses a retirement once the application is no longer live`                                                                         | `expected [Function] to throw an error`                                                                                                                                                                                      |
| `c2`  | the region's settlement never fails                                               | `fails the application’s retirement when the session could not be given back as the region went` and the two region fatal-state cases | `promise resolved "undefined" instead of rejecting`                                                                                                                                                                          |
| `c3`  | the region leaves without handing the settlement over                             | `retires the application only once the region’s session has been given back`                                                          | `expected [ 'application retired' ] to deeply equal []`                                                                                                                                                                      |
| `c4`  | the region fails whenever the owner ends fatal (`!failedBefore` dropped)          | `does not fail the application again for a session already drawn as fatal`                                                            | `promise rejected "DiBagDisposalError: …" instead of resolving`                                                                                                                                                              |
| `b1`  | page hide retires before it takes the root down                                   | `takes the root down while the application is live, and retires it after`                                                             | `expected 'empty' to be 'retiring'`                                                                                                                                                                                          |

The bootstrap's generated model (`application-bootstrap.model.test.tsx`, seed 20260924, 300 runs)
gained a `session` command and two invariants — a joined session holds the application's retirement,
and a failed or hung one leaves the slot terminally fatal — with coverage counters that both were
reached. Its budget went from 1ms to 20ms so a joined session can settle inside it, and its
scheduled disposal rejection is now built only when released, which removed unhandled rejections
the longer budget exposed.

Checks: `nx run wbs-fe-01:typecheck --skip-nx-cache` succeeded; ESLint and Prettier over every
touched file clean; `vitest run src/runtime src/app.test.tsx src/app-router.test.tsx
src/delivery-boundaries.test.ts` 143 passing; `src/test-tiers.test.ts` passing with the join's suite
in the fast tier. The full `wbs-fe-01:test`, e2e, the host gate and CI are recorded in the pull
request.
