# Verification

Base: `be6923c10565a2f3c0582794b6baef12569b494d`. Branch: `feat/request-host-analytics-20261108`. Evidence directory: `/tmp/puni-request-domain-20261108/public-evidence/`.

## Checks

| Command                                                                                                                                                             | Observed outcome                                                                                                                                                                                                | Evidence                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `bun install --frozen-lockfile`                                                                                                                                     | Initial default cache failed with EROFS; retry with `BUN_INSTALL_CACHE_DIR=/tmp/puni-request-domain-20261108/bun-cache` passed, 1806 installs checked with no dependency changes                                | `install.log`, `install-local-cache.log`              |
| `NX_DAEMON=false NX_NO_CLOUD=true bunx --no-install nx run website-analytics:test --skipNxCache`                                                                    | Before implementation: 4 passed, 113 failed; after implementation: 117 passed, zero failed                                                                                                                      | `red-host-tests.log`, `green-host-tests.log`          |
| `NX_DAEMON=false NX_NO_CLOUD=true bunx --no-install nx run-many -t test lint typecheck build --projects=website-analytics,website-fe-01 --parallel=2 --skipNxCache` | All 11 tasks passed, including three prerequisite builds                                                                                                                                                        | `affected-checks.log`                                 |
| `bun apps/website/fe-01/browser/analytics-region.mjs`                                                                                                               | Sandbox denied Chromium process startup; authorized retry outside sandbox passed both canonical-host cases, every request intercepted, including the new request host Origin and unchanged site/API destination | `browser-region.log`, `browser-region-unconfined.log` |
| `NX_DAEMON=false NX_NO_CLOUD=true bunx --no-install nx run tool-git-hooks:install`                                                                                  | Installed normal pre-commit, prepare-commit-msg and commit-msg hooks                                                                                                                                            | `hooks-install.log`                                   |
| `bunx --no-install openspec validate request-host-analytics --json`                                                                                                 | Valid; no issues                                                                                                                                                                                                | `openspec.json`                                       |

Scoped Nx formatting passed. The final uncached affected test/lint/typecheck/build run passed all 11 tasks: 117 analytics tests and 163 frontend tests, zero failures (`affected-final.log`). `git diff --check` passed. Normal hooks are installed and will run at commit; the parent workflow retains the commit receipt and review.

## Failure proofs

| Production fault                                                                                                           | Negative observation                                                                          | Evidence                   |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------- |
| Keep original legacy development and production host pairs while canonical fixtures and exact host tests use request hosts | New-host acceptance and legacy refusal failed before implementation; 113 failures             | `red-host-tests.log`       |
| Replace hostname membership admission with `false` inside `assertHost`, retaining protocol, port and credential guards     | Five tests failed, including both environment cases for initialization and navigation refusal | `negative-host-guard.log`  |
| Restore `dev.app.puni.dev` in the development approved host pair                                                           | 111 tests failed, including exact canonical-host acceptance and legacy-host refusal           | `negative-broken-host.log` |

Every injected production fault was restored in a `finally` block before subsequent checks. Adjacent `Proof:` comments identify the observed faults. Existing cookie ancestor, namespace and measurement-ID guards are unchanged; existing shared-cookie browser tests now exercise request hosts.

## Scope and unverified checks

The public implementation changes only analytics host pairs and affected website frontend/browser fixtures, plus this four-artifact change record. No new domain term or architectural decision is introduced; a design document is unnecessary for this two-value configuration change.

The complete official-Google-tag browser suite and arrival-choice screenshots were not run: this change uses existing controller/consent behavior with renamed fixture origins; affected controller, native regional privacy and mounted frontend tests provide scoped coverage. Google ingestion and account reports, private-site built Home, DNS/TLS, gateway redirects, real draft journeys, snapshot projection and shared-host/full CI gates remain integration checks owned by the parent workflow. No paid models were called.

Production deployment remains held. No push, merge, private modification, Fleet modification or deployment was performed. The new analytics configuration deliberately refuses legacy hosts; gateways must redirect them before executing new JavaScript.
