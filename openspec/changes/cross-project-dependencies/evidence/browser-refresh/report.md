# Bounded task 5.2 browser reconciliation

2026-10-23; isolated `/tmp/puni-52-browser`, base
`31e66aa0a3e8a7acea8efa93cfcec70e9879ff22`.

This packet proves the installed composition → project-stream → plan-feed →
plan-refresh → delivered plan → ProjectPage/table reader. No production protocol,
authoring, admission, activation or refresh implementation changes were needed.
Parent task 5.2 remains unchecked.

## Mounted boundary

`cross-project-refresh.test.tsx` mounts `ProjectPageOverOwner` through the real
application runtime and `httpProjectApi`, with generated shared HTTP decoding,
production project composition/stream/refresh, and an injected socket transport.
The wire snapshot starts with the existing runner-free connected tree presenter;
its reading and sequence are controlled transport fixtures, not a claim that this
suite executes a backend progress command. It proves owned versus unrelated/foreign
subscription filtering, no optimistic reading on a frame, response installation,
a held old response overtaken by another invalidation, the trailing covering read,
visible failure with retained rows, and reconnect cursors tied to installed coverage.

## Real Chromium boundary

One Chromium case uses a fresh migrated composed `OrganizationHarness`, synthetic
stored dependency authority and A→B→C external rows without shared people. Actual
mounted commands, connected SQLite reads, the production PushClient, a production
`buildGateway` subprocess, cookie-authenticated sockets and the browser's default
production socket opener carry the change. Backend and gateway explicitly allow
`http://localhost:7600`; no origin validation is bypassed. Existing localhost fixture
defaults are preserved and rerun by the backend regression tests.

The focused HTML entry acquires the production application runtime and mounts
`ProjectPage` over `pageWiring`/`projectSourceOver`. Its extra subscription only reads
the delivered store to expose `data-installed-seq`; it neither substitutes nor calls
subscribe/refresh/change callbacks. This establishes page reconciliation, **not**
full organization-router/session selection or operational activation acceptance.

B, C, unrelated and foreign observers install baseline trees and receive admitted
resume acknowledgements before A completes. B's real covering response is held:
its glyph stays unknown until release, then becomes waiting. C makes its own GET,
installs its own covering sequence and correctly stays unknown: A completion does
not complete B. Unrelated and foreign observers receive no sequenced frames and
perform no additional tree reads. [The screenshot](B-installed-waiting.png) shows B
only after installation.

The same case disconnects B, clears A's progress through the real command while B
is absent, then reconnects/replays into an installed unknown reading. Chromium's
offline emulation leaves established sockets open, so DevTools closes only the
native application `/ws` socket; the Vite development socket is preserved. No
WebSocket factory, subscribe callback or refresh callback is replaced. Finally a
503 response fault displays the stale-tree banner with the old tree retained;
Retry reads the composed backend and installs waiting, clearing the banner. Race
permutations stay in Vitest; this is one causal Chromium acceptance case.

## Watched independent faults

Each fault was applied alone to the named production path, the mounted suite was
run, its nonzero failure observed, then the exact original file restored before
the next fault. Adjacent test `Proof:` comments name the observations.

| Fault                                                      | Observed failure                                                                                    | Retained log                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Suppress `owner.invalidate` in plan-feed's stream callback | Owned event made no second GET; visible failure never appeared                                      | [invalidate](invalidate-suppressed.log)           |
| Replace the delivered installed tree with `null`           | First row/editor never appeared through the mounted page                                            | [tree delivery](tree-install-suppressed.log)      |
| Remove `frame.subscription !== subscription` guard         | Unrelated/foreign frames caused 3 GETs instead of 1                                                 | [subscription](subscription-equality-removed.log) |
| Accept every generation in `resourceRead`                  | Superseded response displayed waiting while covering response was held                              | [generation](generation-guard-removed.log)        |
| Advance `sinceSeq` when the frame arrives                  | Reconnect sent 13 instead of installed 11 during overlap, and 12 instead of 11 after failed refresh | [resume coverage](resume-on-receipt.log)          |

The frontend's new subprocess target declares backend/gateway runtime globs and
implicit project dependencies. [Restored affected routing](affected-restored.log)
includes `wbs-fe-01` when only the gateway subprocess fixture changes. Removing
just the implicit edges [still routes correctly](affected-edge-removed.log) due to
the explicit target inputs; removing both [loses the frontend](affected-runtime-inputs-removed.log).
The latter is the observed routing negative; the former is a surviving redundant
fault, not claimed as a detected failure.

## Fresh checks

Commands run from the clone root unless the frontend cwd is stated:

```sh
BUN_TMPDIR=/tmp bun install --frozen-lockfile
# cwd apps/wbs/fe-01; also used for each independent mounted fault above
TZ=UTC bunx --no-install vitest run src/components/wbs/cross-project-refresh.test.tsx src/lib/plan-refresh-stream.test.ts src/lib/plan-refresh.test.ts src/lib/project-stream.test.ts --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx --no-install nx run wbs-fe-01:e2e-cross-project --output-style=static
bun test ./apps/wbs/be-01/src/controller/cross-project-delivery.controller.db.test.ts ./apps/wbs/be-01/src/controller/cross-project-events.controller.db.test.ts --timeout=30000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx --no-install nx run-many --targets=typecheck --projects=wbs-fe-01,wbs-be-01,wbs-gw-01 --parallel=2 --output-style=static
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx --no-install nx run wbs-fe-01:lint --skip-nx-cache --output-style=static
bunx --no-install openspec validate cross-project-dependencies --json
```

- Frozen install: passed, 1801 installs across 1648 packages.
- [Mounted/refresh/stream regression](mounted-restored.log): **61 passed**, four files.
- [Configured Chromium target](browser-restored.log): **1 passed**, 22.2 seconds in the case.
- [Backend/default-origin regressions](backend-regression.log): **10 passed**, 142 assertions.
- [Configured frontend/backend/gateway typechecks](typecheck-restored.log): **five tasks successful**;
  two unchanged backend/gateway tasks reused matching cache output from the preceding run.
- Changed TypeScript ESLint: passed for all seven new/changed TypeScript fixture/test/config files.
- OpenSpec: one change valid, existing long-requirement warnings retained.
- [Full configured frontend lint](lint-restored.log): **passed uncached**, 1 minute 40 seconds.

Initial sandbox listener refusal was resolved with the permitted local-listener
run. Earlier browser fixture failures (organization-router boundary, response
observation timing, invalid reset spelling, closing Vite's socket and fixture
string quoting) were corrected before the retained successful run. No earlier
failure is counted as acceptance. The full frontend lint wrapper was also rerun
after local test/style corrections.

Full frontend/backend/gateway test suites, builds, all-change OpenSpec validation,
canonical h2/h4 gates, full organization-router activation, the complete 5.2 writer
matrix and rollout were not run or established. No push, merge or release was made.

## Astra review corrections

The initial packet accidentally left `cross-project-refresh.real.spec.ts` inside
ordinary Playwright collection. Its fixed localhost stack belongs only to the
dedicated config. The ordinary Chromium project's `testIgnore` now excludes that
case alongside the existing dedicated organization fixture.

The new `runs cross-project refresh acceptance only under its dedicated browser
config` test was run before the exclusion existed: it failed `expected false to
be true`. [The captured red](config-routing-missing-ignore.log) is the watched
missing-guard proof. [The full restored config suite](config-routing-restored.log)
passes **19/19**; its existing spawned Bun listener needs the permitted listener
run. Ordinary `playwright test --config apps/wbs/fe-01/playwright.config.ts --list`
[initially collected 626 tests in 63 files](ordinary-list-before-fix.log), including
the incompatible case; [after the fix it collects 625 in 62](ordinary-list-restored.log)
and excludes it. [The dedicated config list](dedicated-list-restored.log) still
selects exactly the one connected case. No full ordinary browser run is claimed.

The browser silence proof now also sends ping through each unrelated/foreign
observer's own real native socket and waits for its corresponding pong before
checking sequenced-frame and tree-request silence. B/C reads alone did not order
those separate sockets. This reuses the existing protocol and production opener;
the DevTools helper only sends the native ping or closes the native application
socket. The corrected case and configured checks were rerun before the corrective
commit: [Chromium](browser-review-restored.log) passed **1/1** (18.5 seconds in
the case), and [configured frontend lint/typecheck](checks-review-restored.log)
passed all **three tasks**, uncached. Changed-file ESLint, Prettier and whitespace
checks also passed.
