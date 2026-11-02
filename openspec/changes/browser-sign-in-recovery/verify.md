# Verification Report

**Change:** `browser-sign-in-recovery`\
**Verified at:** 2026-11-02 06:15:37 UTC\
**Implementation:** `98e7b00ff247c36962d8c22b0e39d377e789cf17..545a118e976f51793afe88d4ab84d719f0724b31`\
**Pull request:** [#810](https://github.com/Prosperous-Unification/puni-00/pull/810), merged 2026-11-02 06:11:20 UTC\
**Runtime merge:** `d50767b7774af4ff6d49387f1582fc04f0e3c253`

PR810 merged normally after the exact implementation head `545a118e976f51793afe88d4ab84d719f0724b31` passed the full canonical gate, full frontend target and required CI. Dev's running `bootCommit` proves runtime merge `d50767b7774af4ff6d49387f1582fc04f0e3c253`; public HTTPS diagnostic recovery, explicit cookie reset and fresh password validation passed. All 26 authored feature paths are byte-identical between the tested implementation and runtime merge. Earlier component, failed-gate and failed-CI receipts retain their stated historical scope. Credentialed Auth0 sign-in remains explicitly unverified. This final record is prepared for a docs-only follow-up; its eventual publication merge is verified separately.

## 1. Main integration and structural validation

Main advanced through PR798 to `98e7b00ff247c36962d8c22b0e39d377e789cf17`, changing only `bun.lock`, `package.json` and `tools/tool-devsync/src/toolchain-pins.test.ts`: `application-exception` 0.7.0 → 0.8.1 and `di-bag` 0.5.1 → 0.5.2. Main was merged normally, the new locked dependencies installed frozen, and normal hooks ran for merge commit `551421f4ccfdafae02e514fb1dbcc0f5877797b1`, now pushed to the same PR810.

At integrated predecessor `551421f4ccfdafae02e514fb1dbcc0f5877797b1`, the auth feature patch was byte-identical: `git diff c894bc45e f3799c1e7` and `git diff 98e7b00ff 551421f4c` both have SHA256 `25adb56e46f0f7003c98e9a3ed1245b34b4a4d454989fd02d2f21926478b6ede`. Auth source is unchanged. An independent integration reviewer confirmed this equality and the fresh focused receipts, found no material integration issues, and conditionally retained the existing code approval for `551421f4ccfdafae02e514fb1dbcc0f5877797b1`, pending that head's canonical gate and CI at the time. The reviewer changed no files and reran no suites.

The tested implementation head includes poller repair `e62817f8a8f2b7c7a5604d4b0f6b139769d93f03`, test-fixture PATH correction `d524552b2b967196ec385ba076a386121e424c0a` and the normal task-record commit `545a118e976f51793afe88d4ab84d719f0724b31`. Auth source and application libraries are unchanged from 5514; the entire latest patch includes the auxiliary repair and is not claimed byte-identical to the historical auth-only hash. Scoped repair review found its Minor PATH finding addressed and no new material issues; the required updated canonical/CI conditions were subsequently satisfied. Original auth reviews and guard-mutation proofs retain their unchanged-source scope.

### Later main advance compatibility

While current gates ran, main advanced to `f94d5b3a23f4f1fee662eee4ea8583a630f3d048` through website analytics PR812 and documentation PR815. A fresh fetch and actual diffs from `98e7b00ff` found 41 changed main paths, 26 feature paths and no overlapping paths. Manifest/lock changes only add dependency-free `mmdb-lib@3.0.3`; existing resolutions remain unchanged. Runtime changes stay within website analytics, wiki policies add its exact binary declaration, and the Burokrat pilot-test change adds comments only. Independent read-only integration review inspected those diffs and found no material auth/poller compatibility issue. Existing component receipts retain their stated scope; this inspection does not establish a passing combined-tree gate. No merge/rebase, source edits, extra suites or replacement gates were performed; the required terminal canonical/CI passes were subsequently confirmed on the tested implementation head.

### OpenSpec validation

- [x] Locked `bunx --no-install openspec validate --all --json` completed successfully.

```text
totals: items=315, passed=315, failed=0
changes: 296 passed, 0 failed
specs: 19 passed, 0 failed
Invalid entries: []
```

Locked validation was refreshed after the terminal canonical pass, with this verification record present: `/tmp/browser-recovery-openspec-premerge-545a118e9.json` reports all 315 entries passed and zero failed. Historical receipts: `/tmp/browser-recovery-openspec-all.json` and `/tmp/browser-recovery-openspec-final.json`. The latest-head canonical gate also reports 315 passed and zero failed in `/tmp/browser-recovery-h2-gate-545a118e9.log`; the terminal full gate pass is recorded below. The 5514 gate's identical OpenSpec pass remains historical because that overall gate failed.

The docs-only follow-up was then prepared from fresh merged main `d50767b7774af4ff6d49387f1582fc04f0e3c253`, with its frozen dependencies installed (only the new website `mmdb-lib` package was added locally). Fresh locked validation reports 316/316 passed: 297 changes and 19 specs, zero failures; the additional entry is the website change already on main. Receipt: `/tmp/browser-recovery-docs-openspec-final.json`. Both changed Markdown files passed locked Prettier checks. These are documentation checks, not a repeated combined-tree runtime gate.

## 2. Task completion and requirement coverage

All nine implementation, prerequisite, verification and integration/deployment tasks are complete. This record is prepared for publication; the docs follow-up merge is checked separately through GitHub.

| Task    | Current evidence                                                                                                                                                    | Remaining work |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1.1–1.2 | Reset contract/binding, both production compositions, fixed cookie expirations, unchanged populated SQLite authority, mounted negatives and five observed mutations | None           |
| 2.1–2.2 | State-bound recovery, invalid/replayed/concurrent callbacks, unchanged durable authority, real proof-store outage, three observed mutations                         | None           |
| 3.1–3.2 | Shape-derived API, explicit card action and pending fences, accessible controls, error variants, real Chromium HTTPS expiration and auth runbook                    | None           |
| 4.0     | Independent borrowed-source target candidates restored; real-Git RED/mutation/final passes and scoped review complete                                               | None           |
| 4.1     | Affected component checks, exact-head canonical/full frontend and final format/OpenSpec validation passed                                                           | None           |
| 4.2     | Final reviews and required gates passed; PR810 merged normally; exact dev bootCommit and public HTTPS recovery/reset/fresh validation passed                        | None           |

| Requirement                   | Production implementation                                                                                         | Test evidence                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit browser cookie reset | `controller/auth-reset-endpoints.ts`, shared `http/auth-reset-shapes.ts`, unconditional `app.ts` composition      | Mounted `browser reset` scenarios and populated SQLite reset-preservation test                                                           |
| Reset admission               | Shared Origin policy and adapter body/query guards; carrier-presence checks in reset binding                      | Missing/foreign Origin, both empty/nonempty API carriers, malformed/extra bodies/queries, unsupported methods; five guard-removal proofs |
| Proved SSO recovery           | `controller/auth-oidc-endpoints.ts` consumes the matching transaction before predecessor proof and fixed redirect | Fifteen mounted recovery/admission/outage cases, original retirement regressions and three mutation proofs                               |
| Explicit fresh sign-in        | `lib/api.ts` and `components/auth/auth-form.tsx`                                                                  | API/AuthForm tests, synchronous pending negatives and real HTTPS browser journey                                                         |

## 3. Delta spec sync

| Capability               | Status          | Note                                                                                          |
| ------------------------ | --------------- | --------------------------------------------------------------------------------------------- |
| browser-sign-in-recovery | Pending archive | Delta spec is retained with this change. Main-spec synchronization/archive was not requested. |

## 4. Observed failure proofs

The following are original observed proof history from the predecessor feature commits. Each production fault below was injected independently, observed failing on its real mounted or rendered path, then restored. The corresponding auth source is unchanged after main integration; these mutations were not rerun against the new dependency pins. Adjacent `Proof:` comments identify the production guards. Test names refer to the committed tests, not copies of their implementation.

| Check                                      | Injected fault                                                        | Negative that observed the failure                                                                     | Observed result                                                       |
| ------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Reset exact Origin                         | Remove the shared shape Origin policy                                 | `refuses reset without the exact Origin`                                                               | Expected 403, received 204; 1 failed                                  |
| Reset Authorization carrier                | Remove Authorization presence check                                   | `refuses API carriers without clearing browser cookies`                                                | Expected 400, received 204; 1 failed                                  |
| Reset retired carrier                      | Remove `x-wbs-token` presence check                                   | Same mounted carrier negative                                                                          | Expected 400, received 204; 1 failed                                  |
| Reset empty query                          | Bypass adapter undeclared-query guard                                 | `refuses reset bodies, queries and unsupported methods`                                                | Expected 400, received 204; 1 failed                                  |
| Reset empty body                           | Bypass adapter undeclared-body guard                                  | Same mounted malformed-request negative                                                                | Expected 400, received 204; 1 failed                                  |
| Callback transaction outcome               | Bypass both transaction refusal branches                              | `a forged callback cannot trigger browser recovery or consume an honest transaction: mismatched state` | Expected 400, received 302; 1 failed                                  |
| Callback binding admission before recovery | Move recovery before binding/state admission                          | Same scenario, missing binding                                                                         | Expected 400, received 302; 1 failed                                  |
| Proof-store failure propagation            | Catch proof error as null after dropping the actual association table | `predecessor-store failure remains a server failure`                                                   | Expected 500, received 302; 1 failed                                  |
| Validated reset acknowledgment             | Force UI success after refused, malformed and network replies         | `reset failure remains visible and retryable` variants                                                 | All3 failed because the required errors disappeared                   |
| Synchronous reset fence                    | Remove pending ref guard                                              | `reset prevents duplicate requests and sign-in while pending`                                          | Expected 1 request, received 2; 1 failed                              |
| Password submit fence                      | Remove password pending ref guard                                     | Same rendered pending negative                                                                         | Expected 1 request, received 2; 1 failed                              |
| Pending password control                   | Remove pending from the disabled predicate                            | Same rendered pending negative                                                                         | Password button unexpectedly enabled; 1 failed                        |
| Pending method/SSO navigation              | Bypass final `SignInLink` disabled-button branch                      | Same rendered pending negative                                                                         | Live Google authorization href exposed; 1 failed                      |
| Browser acceptance oracle                  | Inject an asynchronous uncaught page exception before final assertion | Actual HTTPS browser harness                                                                           | Expected no page errors, received injected error; exit 1 without PASS |

Reset transcripts are `/tmp/reset-proof-{origin,authorization,retired-token,query,body}.log`. Callback transcripts are `/tmp/sso-recovery-proof-{state,binding,proof-store}.log`. Final UI proofs are `/tmp/task3-proof-{response,pending,submit,password-disabled,disabled-link}.log`. Browser oracle proof is `/tmp/task3-browser-proof-pageerror.log`.

No new filesystem boundary distinguishes absence from unreadability. The callback outage uses the real SQLite association-table failure, with a seeded lifecycle so a modeled missing identity cannot hide the dependency failure.

### Poller candidate independence: new observed proofs

The real-Git tests use backing commits A/B and a borrowed source whose HEAD is A while requested target B exists only at its remote ref. After the production loader executes B, both backing and source object stores are moved away; retained candidate `git show` and `git fsck --full` must still succeed with empty stderr. A second test injects repack exit 17 and requires refusal, no deployer stdout and removal of all candidate directories. Removing an alternates pointer alone is not the independence oracle.

Focused command:

```sh
bun test --preload ./tools/test/scratch/preload.ts ./tools/tool-devsync/src/poller.test.ts --timeout=30000 --test-name-pattern='borrowed'
```

Initial RED before production edits: 0 pass, two fail, six assertions, exit 1 (`/tmp/poller-fix-red.log`). Initial GREEN: two pass, zero fail, nine assertions, 427ms (`/tmp/poller-fix-green.log`). Each mutation below independently reran the same real-loader tests, then restored the shell. An adjacent production `Proof:` comment records the observed breaks.

| Check                                          | Injected fault                                                                           | Production-path negatives and observed result                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Borrowed-source dissociation branch            | Replace the new alternates predicate with `if false; then`                               | `keeps borrowed non-HEAD target objects readable without either source object store` and `refuses and cleans a borrowed candidate when required object copying fails`: 0 pass/two fail, exit 1, 586ms. Candidate `git show` failed with exit 128; the exit 17 refusal was lost and deployer executed. Receipt: `/tmp/poller-fix-mutation-branch.log` |
| Required object copying before pointer removal | Replace only `git -C "$CANDIDATE_NEXT" repack -a -d` with `:`, retaining pointer removal | Same two tests: 0 pass/two fail, exit 1, 561ms. Candidate `git show` still failed with exit 128 without the pointer, and required-copy refusal was lost. Receipt: `/tmp/poller-fix-mutation-copy.log`                                                                                                                                                |

Alternates presence is the predicate; no new absence/unreadability distinction or recovery default is introduced. Existing independent-source tests cover absence; Git failures during trusted clone/checkout/repack remain fatal. The test-only PATH review correction now throws before fixture setup for missing or empty PATH. Absolute-Bun before/after diagnostics and empty-PATH receipts are `/tmp/poller-fix-round1-{missing-path-before,missing-path-after,empty-path}.log`; the before fault was a late missing-bash failure, the after cases fail immediately with `PATH is required for the object-copy failure fixture`.

## 5. Completed commands and actual results

### Reviewed poller prerequisite restoration

The loader preserves its original clone arguments, checks out the exact requested target, then conditionally copies inherited borrowed objects with `git repack -a -d` before removing alternates. Required failures remain fatal under existing cleanup. Independent clones add no repack or borrowing. This restores the precise existing candidate-independence runbook contract under R4's documented-spec restoration exception; it adds no new OpenSpec change or auth behavior.

```sh
bun test --preload ./tools/test/scratch/preload.ts ./tools/tool-devsync/src/poller.test.ts --timeout=30000
bunx nx run tool-devsync:lint
bunx nx run tool-devsync:typecheck
shellcheck -s bash bin/dev-poll-sync.sh
bash -n bin/dev-poll-sync.sh
bunx prettier --check tools/tool-devsync/src/poller.test.ts docs/runbook-dev-deploy.md
```

The initial full poller file reported 33 pass, zero fail, 117 assertions in 8.93s (`/tmp/poller-fix-full.log`). Tool-devsync lint exited with status 0 uncached in 21.5s with zero errors and two existing unused-eslint-disable warnings in untouched `service-kinds.test.ts:9` and `service-kinds.ts:8`; no warnings were suppressed. Typecheck exited with status 0 uncached in 1.1s. Shellcheck, bash syntax, formatting and whitespace checks each exited with status 0. Receipts: `/tmp/poller-fix-{lint,typecheck}.log` and the detailed ignored task report `.superpowers/sdd/browser-sign-in-recovery/task-4-poller-fix-report.md`.

After addressing the Minor PATH fixture finding, the same full poller command reported 33 pass, zero fail, 117 assertions in 7.75s (`/tmp/poller-fix-round1-full.log`). File ESLint, Prettier and normal hooks passed; production-shell/typecheck checks were not repeated for that test-only correction. Review marked round 1 addressed with no new material findings. Normal commits used no hook bypass. Tool Wiki hooks reported inactive/not certified because the external activation root was not provisioned; migration/doc-cap hooks explicitly skipped when no staged paths matched.

### Auth component receipts on integrated predecessor 5514

These terminal scoped passes ran on `551421f4ccfdafae02e514fb1dbcc0f5877797b1`. Auth source and application libraries remain unchanged at latest head `545a118e9`, so they retain that component scope. They were not rerun on 545; the later exact-head full suites are recorded below.

| Scope                              | Terminal result                          | Receipt                                    |
| ---------------------------------- | ---------------------------------------- | ------------------------------------------ |
| Mounted reset/contract             | 6 pass, 0 fail, 127 assertions; 4.34s    | `/tmp/browser-recovery-main-reset.log`     |
| Callback recovery/admission/outage | 16 pass, 0 fail, 357 assertions; 8.52s   | `/tmp/browser-recovery-main-sso.log`       |
| Durable reset preservation         | 1 pass, 0 fail, 7 assertions; 8.10s      | `/tmp/browser-recovery-main-durable.log`   |
| API/AuthForm                       | 53 tests across two files passed; 13.90s | `/tmp/browser-recovery-main-ui.log`        |
| Toolchain pins                     | 5 pass, 0 fail, 6 assertions; 29ms       | `/tmp/browser-recovery-main-pins.log`      |
| Backend/frontend typecheck         | Four tasks passed; 33.1s, cache skipped  | `/tmp/browser-recovery-main-typecheck.log` |

### Local HTTPS auth component acceptance on 5514

`bun .superpowers/sdd/browser-sign-in-recovery/scratch/harness.ts` terminated with exit 0 in root-owned session 72916 using the new dependency pins. Receipt: `/tmp/browser-recovery-main-https.log`; real loopback TLS origin `https://localhost:35917`.

```text
PASS real HTTPS browser: bound SSO recovery, explicit reset, three HttpOnly Secure expirations, unrelated cookie preserved, fresh password invalid_credentials
```

The same reviewed harness exercises real composed-app callback/reset APIs; only fake-provider authorization navigation is intercepted. It observed reset POST 204 with exact Origin `https://localhost:35917` and three hardened expiration headers, then fresh password 401 with no Set-Cookie. Its assertions enforce the exact cookie-jar difference, preservation of the unrelated cookie and no page errors. This proves local composed-app acceptance on 5514 with the new dependencies. Auth source and application libraries are unchanged at 545, so this remains scoped auth component evidence; no new HTTPS run was performed on 545. That local receipt did not establish deployed-listener or credentialed Auth0 acceptance. Public diagnostic acceptance is recorded below; credentialed Auth0 remains unverified.

### Historical predecessor commands

The table and regression receipts below predate main integration and apply to `f3799c1e745863cebc4997707963ee757d82f4dc` or its feature ancestors. Their build, lint, format and broad test passes are not current-head completion evidence.

| Command/scope                                                                                   | Observed result                                                                                     |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Initial auth baseline (password endpoints, mounted OIDC adapter, shared OIDC contract)          | 23 pass, 0 fail, 250 assertions                                                                     |
| Final mounted reset/contract scenarios                                                          | 6 pass, 0 fail, 127 assertions                                                                      |
| Populated durable reset preservation                                                            | 1 pass, 0 fail, 7 assertions                                                                        |
| Reset auth/contract/mount regression                                                            | 117 pass, 0 fail, 22,771 assertions; focused reset rerun after final Promise-only typing correction |
| Organization inventory and generated MCP document                                               | 25 pass, 0 fail, 494 assertions                                                                     |
| Serial callback/auth regression                                                                 | 177 pass, 0 fail, 1,329 assertions                                                                  |
| Final callback recovery/admission/outage and public protocol inventory                          | 16 pass, 0 fail, 357 assertions                                                                     |
| Previously timed-out worker cases, serial rerun with unchanged deadlines                        | 3 pass, 0 fail, 33 assertions                                                                       |
| API/AuthForm and session-runtime regression                                                     | 71 pass across five files                                                                           |
| Final API/AuthForm after accessibility correction                                               | 53 pass across two files                                                                            |
| Backend/module typecheck                                                                        | Exit 0, final23.9s                                                                                  |
| Frontend/module typecheck                                                                       | Exit 0, final12.5s, uncached                                                                        |
| Complete frontend lint                                                                          | Exit 0, final3m12s, uncached; only NO_COLOR/FORCE_COLOR environment warning                         |
| Named source lint and normal commit hooks                                                       | Passed; no hook bypass                                                                              |
| `NX_DAEMON=false bunx nx format:check --all`                                                    | Exit 0; complete repository scope                                                                   |
| `NX_DAEMON=false bunx nx run-many -t build -p wbs-be-01,wbs-fe-01 --parallel=1 --skip-nx-cache` | 12 successful tasks,18.4s, cache skipped                                                            |

Actual affected-build terminal output:

```text
NX Successfully ran target build for 2 projects and 10 tasks they depend on
Run duration: 18.4s
Cache: Skipped (--skip-nx-cache)
```

Initial callback regression was not green:184 pass/4 fail/1 error. It exposed the missing public-protocol inventory entry for reset and three process-worker timing failures while typecheck/lint overlapped. The inventory was corrected, subsequent auth suites passed, and the exact three failed workers passed serially without changing their deadlines. No environmental cause is asserted beyond those observations. Original log: `/tmp/sso-recovery-regression.log`; serial receipts: `/tmp/sso-recovery-final-auth.log` and `/tmp/sso-recovery-worker-serial.log`.

Initial frontend checks found a test callback typed `() => never`, inaccessible pending anchors, a shorthand void callback and an untyped spy. These were corrected; final typecheck/lint passed. Final pending navigation renders disabled kit buttons and its own bypass mutation failed before restoration.

### Historical real HTTPS browser acceptance

```sh
bun .superpowers/sdd/browser-sign-in-recovery/scratch/harness.ts
```

The ignored owned harness boots actual app services using `BootedBrowserProcess`, migrated disposable SQLite and Vite behind a loopback TLS proxy. Only external fake-provider authorization navigation is intercepted; callback and reset API responses are real. It injects diagnostic stale Secure/HttpOnly cookies after the initial signed-out read, follows a browser-bound SSO transaction to recovery, explicitly resets, compares the privileged cookie jar, then submits a fresh password attempt through the UI.

Historical receipt: `/tmp/task3-browser-final.log`, Bun1.4.4 and Chromium153.0.8010.12, TLS `https://localhost:38481`.

```text
callback: 302, Location=/?auth_error=browser_session_unverified
reset: POST /api/auth/reset, Origin=https://localhost:38481, status 204
removed: __Host-wbs_access, __Host-wbs_organization, __Host-wbs_session
preserved: unrelated diagnostic cookie
fresh password: 401 invalid_credentials
pageerrors: none
PASS real HTTPS browser: bound SSO recovery, explicit reset, three HttpOnly Secure expirations, unrelated cookie preserved, fresh password invalid_credentials
```

The harnesses and screenshots under ignored `.superpowers/sdd/browser-sign-in-recovery/scratch/` are temporary diagnostic artifacts, scheduled for removal after publication. Their paths identify the receipts used, not retained repository artifacts; reusable coverage is in the committed tests. Real credentialed Auth0 acceptance is explicitly unverified; no real account secrets or prior authorization code were used.

### Full frontend suite — current head passed; predecessor details retained

```sh
NX_DAEMON=false bunx nx run wbs-fe-01:test --skip-nx-cache
```

Historical predecessor unified exec session 48990 terminated with exit 0 after 36m 53s, with cache skipped. Complete log: `/tmp/browser-recovery-full-frontend.log`. The Node prerequisite passed 87 files and 1,079 tests; UTC DOM passed 237 files and 4,716 tests; Pacific/Auckland passed four files and five tests. All suites reached their terminal pass without changed test deadlines.

```text
NX Successfully ran target test for project wbs-fe-01 and 1 task it depends on
Run duration: 36m 53s
Cache: Skipped (--skip-nx-cache)
```

Current-head canonical session 98637 reported `✔ nx run wbs-fe-01:test`, then successfully completed all 196 tasks in its 53-project workspace group, uncached in 62m22s. The pinned `apps/wbs/fe-01/project.json` requires `test:unit` first and chains UTC DOM then Pacific/Auckland zoned Vitest with `&&`; this proves the full current frontend target completed. Successful task bodies were suppressed by Nx, so no fresh per-suite test counts are claimed. The earlier counts above remain historical. No duplicate local full frontend run was started. The later Twilight, source-lint and solver-smoke phases also passed, as recorded below. The frontend target alone would not establish a full canonical gate pass.

### Historical 5514 gate failure and diagnosed prerequisite

Canonical session 96578 on `551421f4ccfdafae02e514fb1dbcc0f5877797b1` naturally terminated with exit 1. Its first 53-project group ran uncached for 61m56s, with 195 successful tasks including backend/frontend tests, lint, typecheck, build and `wbs-fe-01:test`. Only `tool-devsync:test` failed: 981 pass, one fail, 3,967 assertions, 911.90s. The existing `durable dev poller > runs the deployer from a complete, clean, uninstalled target-revision tree` expected exit 0/empty stderr but received exit 46 and `target objects still borrow source repository`. Receipt: `/tmp/browser-recovery-h2-gate-551421f4c.log`. This was not a full gate pass; no subsequent Twilight/solver full-gate pass is established.

The source gate clone was not shallow, but inherited an alternates pointer to `/home/puni1/wbs-dev/src/.git/objects`. Root's real-Git probes confirmed that the loader's `clone --local --no-checkout` inherits source alternates. Early clone-time `--dissociate` alone lost target B (available only through a borrowed remote ref while HEAD was A), producing checkout exit 128. Task 4.0 therefore copies objects only after exact target checkout, preserving the existing clone arguments. Its independent real-Git tests remain necessary even with an independent gate checkout.

The h2 gate checkout's own object store was also fully copied under the heavy lock. First operator invocation 6434 refused with exit 64 for missing `--` and made no state change; corrected invocation 72480 terminated with exit 0 after repack, alternates removal and `git fsck --full`. The resulting independent store has 128,915 objects in one 91.26MiB pack and no alternate. Checkout stayed on f379 (restored by the prior failed gate wrapper); no target was checked out manually. This operator repair does not replace the product fix or its borrowed-source regression coverage.

### Canonical host gate — latest head passed

```sh
ssh h2puni 'cd /home/puni1/wbs-browser-recovery-gate-20261102 && HEAVY_LOCK_WAIT_SECONDS=7200 bin/h2puni-gate.sh 545a118e976f51793afe88d4ab84d719f0724b31'
```

A dedicated clean clone is used, separate from the dev poller's checkout. The wrapper owns checkout/install/full format/test/lint/typecheck/build/solver-smoke under the host-wide lock. The target was fetched without checking it out first.

Latest unified exec session 98637 writes `/tmp/browser-recovery-h2-gate-545a118e9.log` and has printed:

```text
heavy lock: waited 0s behind 0 tickets
h2puni gate: running on 545a118e976f51793afe88d4ab84d719f0724b31
```

Frozen Bun installation reported no dependency changes, retaining `application-exception` 0.8.1 and `di-bag` 0.5.2. OpenSpec reports 315 passed and zero failed. Its first workspace group passed all 196 tasks across 53 projects uncached in 62m22s, including the full frontend target. The separate Twilight group first reported passing Dash test/typecheck/build. This independent full Dash target did not reproduce the earlier CI race failure. Successful task bodies are suppressed, so no fresh Dash test count is claimed. Session 98637 subsequently terminated with exit 0. The complete log confirms both groups passed: 196 workspace tasks in 62m22s, then all 10 Twilight tasks in 49m44s. Burokrat source lint passed in 28.3s, Dash lint in 39.6s, and the final solver-image-smoke target passed in 3m56s. The real Docker smoke authenticated the supervisor and produced feasible baseline/shared-person answers; exceptional cleanup and coordinator-EOF/restart-orphan tests passed 3/3 with 15 assertions in 10.75s. This is a terminal full canonical gate pass on printed SHA `545a118e976f51793afe88d4ab84d719f0724b31`. Its earlier partial progress no longer limits this result; old failed/stopped gates remain historical.

Historical attempt 1, session 12414, terminated with exit 75 after its 30-minute queue budget, without a printed running SHA or any checks. Receipt: `/tmp/browser-recovery-h2-gate-f3799c1e7.log`.

Historical attempt 2, session 49975, acquired the lock after 5,109 seconds and printed exact predecessor SHA `f3799c1e745863cebc4997707963ee757d82f4dc`. Its frozen installation, 315/315 OpenSpec validation and partial targets passed, but it never reached a full gate pass. After main integration, its owned process group was deliberately stopped: PID 1633257, SHA, cwd and group were checked before TERM; all 12 captured descendants stopped and the session terminated with exit 143. The lock was observed free and dedicated tree clean before the 5514 run. Historical receipt: `/tmp/browser-recovery-h2-gate-f3799c1e7-attempt2.log`.

The historical explicit inactive Tool Wiki receipt established no certification. Old session 96578 and old session 59841 are terminal and must not be polled again.

### GitHub CI — latest head passed after failed-only rerun

Attempt 1's `gate twilight` job 125082657745 failed at 04:21:46 UTC. Its retained `nx-gate.log` artifact 13115659375 reports Dash 4149 passed / 1 failed / 17726 assertions and Burokrat 2544 passed / 0 failed / 16042 assertions. The sole failed test was `admission process race > independent processes contend for capacity one with a shared current owner`: one child exhausted the unchanged 100-attempt, 2ms SQLite busy retry budget at `BEGIN IMMEDIATE`. Both children were awaited and the fixture removed. Exact logs: `/tmp/browser-recovery-twilight-545a118e9.log` and `/tmp/browser-recovery-twilight-full-545a118e9.log`. Dash source and package/lockfile have no diff from integrated main. The exact unmodified `bun test apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/admission-races.db.test.ts` suite then terminated exit 0 with 3 passed / 0 failed / 24 assertions in 29.50s (`/tmp/browser-recovery-dash-admission-545a118e9.log`). The contention was not reproduced locally; no specific scheduling cause is claimed. No retry budget, deadline, assertion or source was changed. This focused pass does not replace required CI or the canonical gate. Attempt 1 subsequently completed with overall failure and a successful workspace job; its failed jobs were explicitly rerun without source or test-budget changes.

Run [41384601162](https://github.com/Prosperous-Unification/puni-00/actions/runs/41384601162) attempt 1 is terminal FAILURE on `545a118e976f51793afe88d4ab84d719f0724b31`; old watcher 42781 terminated exit 1 (`/tmp/browser-recovery-pr810-checks-545a118e9.log`). Its workspace job 125082657694 succeeded at 05:06:03 UTC after 1h22m25s. Fresh step evidence confirms format, runtime test/lint/typecheck/build, solver smoke, heavy lock, gate pinning, dev entrypoint, secrets, private nesting, doc caps, Compose, migration/corpus lint, OpenSpec and pinned schema graph all succeeded. The three existing disabled Tool Wiki steps skipped and establish no certification. After that terminal result, `gh run rerun 41384601162 --failed` succeeded. Attempt 2 completed SUCCESS on the same head. Twilight job 125105617167 passed its test/typecheck/build/lint step at 06:02:40 UTC, then started the packed-package suite at 06:02:48 UTC. Its successful runtime artifact 13119569199 (`nx-gate-log-twilight-2`) is retained as `/tmp/browser-recovery-twilight-attempt2-545a118e9.log`: Dash 4,150 passed / zero failed / 17,735 assertions across 121 files in 1,450.93s, and Burokrat 2,544 passed / zero failed / 16,042 assertions across 101 files in 3,309.68s. The unchanged complete Dash rerun includes the earlier failed race; no retries, deadlines or assertions were changed. The packed-package suite and all post-job steps passed; Twilight job 125105617167 completed SUCCESS at 06:08:03 UTC after 1h1m1s. The run and required aggregate gate also completed SUCCESS. Watcher session 84621 terminated exit 0, log `/tmp/browser-recovery-pr810-checks-545a118e9-attempt2.log`. Successful workspace/browser checks were preserved; only failed work and its dependent aggregate were requested again. A fresh PR rollup confirmed every applicable check complete, both required `gate` and `pixels` SUCCESS, head `545a118e976f51793afe88d4ab84d719f0724b31`, merge state CLEAN and MERGEABLE. All four latest-head browser shards and the required aggregate `pixels` check passed. Required overall `gate` CI passed. The independent canonical workspace phase has now established the current full frontend target pass; these browser results alone do not establish the UTC DOM/Auckland unit-suite result. [CodeQL 41384597251](https://github.com/Prosperous-Unification/puni-00/actions/runs/41384597251) succeeded. [Trusted-wiki 41384599621](https://github.com/Prosperous-Unification/puni-00/actions/runs/41384599621) was skipped through existing `if: false` conditions; no Tool Wiki certification is established.

### Historical 5514 GitHub CI — passed

Run [41376474136](https://github.com/Prosperous-Unification/puni-00/actions/runs/41376474136) passed on `551421f4ccfdafae02e514fb1dbcc0f5877797b1`; old watcher 59841 terminated with exit 0. Fresh GitHub PR evidence before the updated push confirmed both required `gate` and `pixels` SUCCESS for that head. All four browser shards passed, CodeQL run 41376469451 succeeded and trusted-wiki run 41376470976 skipped under existing conditions. This historical CI success coexists with the independent 5514 canonical gate failure and establishes no pass for latest `545a118e9`.

### Historical predecessor GitHub CI — passed

Historical run [41363907266](https://github.com/Prosperous-Unification/puni-00/actions/runs/41363907266) passed on predecessor implementation head `f3799c1e745863cebc4997707963ee757d82f4dc`. Both required contexts, `gate` and `pixels`, are terminal SUCCESS; GitHub reported merge state CLEAN for that predecessor head. All four browser shards and CodeQL analyses/aggregate also passed. Historical CI watcher 96098 terminated with exit 0; receipt: `/tmp/browser-recovery-pr810-checks.log`.

| CI check                                                                                                       | Terminal evidence                                   |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [Workspace](https://github.com/Prosperous-Unification/puni-00/actions/runs/41363907266/job/125020023509)       | SUCCESS, 1h 22m 52s, completed 2026-11-02T01:12:03Z |
| [Twilight](https://github.com/Prosperous-Unification/puni-00/actions/runs/41363907266/job/125020023601)        | SUCCESS, 1h 4m 57s, including packed package suite  |
| [Required gate](https://github.com/Prosperous-Unification/puni-00/actions/runs/41363907266/job/125041849578)   | SUCCESS, 2s                                         |
| [Required pixels](https://github.com/Prosperous-Unification/puni-00/actions/runs/41363907266/job/125024077762) | SUCCESS, 3s, all four shards passed                 |

Workspace's terminal step list confirms format, test/lint/typecheck/build, solver image smoke, heavy-lock/head-pinning/dev entrypoint tests, secrets scan, private nesting, doc caps, Compose, migration lint, corpus version lint, OpenSpec and pinned schema-graph integration all succeeded.

Expected skips are explicit: `gate docs` was skipped for the runtime plan. The separate trusted-wiki `lint` job and three workspace Tool Wiki diagnostic/provision/audit steps were skipped through existing `if: false` workflow conditions. This change did not alter those conditions, and this run establishes no Tool Wiki certification. These historical CI results establish no pass for the integrated current head and do not substitute for the latest-head passes recorded above.

## 6. Review, merge and deployment signal

- [x] All3 implementation slices received separate spec/quality approval.
- [x] Original auth whole-branch/integration reviews approved the unchanged auth patch; scoped poller repair review marked its Minor PATH finding addressed with no new material findings. The latest-head canonical gate and CI conditions are now satisfied.
- [x] Auth, main integration, reviewed poller prerequisite repair/PATH correction and task record are pushed to PR810 at `545a118e976f51793afe88d4ab84d719f0724b31`.
- [x] Canonical full gate reached terminal PASS on printed latest SHA `545a118e976f51793afe88d4ab84d719f0724b31` (session 98637 exit 0; all phases confirmed).
- [x] Required GitHub CI passed on the current PR810 implementation head; fresh rollup confirmed `gate` and `pixels` SUCCESS.
- [x] Current-head full frontend suite reached a terminal pass, including its Node prerequisite, UTC DOM and Auckland zoned suites, in the uncached canonical workspace group.
- [x] Local HTTPS auth component acceptance passed on `551421f4c` with the same auth source/application libraries as latest `545a118e9`; no repeated HTTPS run on `545a118e9` is claimed. Deployed listener and real Auth0 remain outside this proof.
- [x] Premerge evidence is finalized locally in this verification record and in the updated PR810 description; locked OpenSpec validation passed all 315 entries and both local files passed formatting.
- [x] PR810 is merged normally; GitHub confirms merge `d50767b7774af4ff6d49387f1582fc04f0e3c253` at 2026-11-02 06:11:20 UTC.
- [x] Dev bootCommit proves the exact runtime merge, and public HTTPS recovery/reset/fresh-validation acceptance passed.
- [x] Verification documentation is prepared for publication through a docs-only follow-up from fresh main after observed merge/deployment evidence was recorded. Actual follow-up merge is verified separately through GitHub in the final goal audit.

### Runtime merge and public HTTPS acceptance

GitHub confirmed PR810 MERGED at 06:11:20 UTC as `d50767b7774af4ff6d49387f1582fc04f0e3c253`. The normal squash merge matched reviewed head `545a118e976f51793afe88d4ab84d719f0724b31`; no bypass or force push was used. A committed-tree diff confirmed all 26 authored feature paths match between that tested head and the runtime merge. The later main integration changes retain the compatibility scope described above.

```sh
ssh h2puni 'docker exec wbs-dev-src curl -fsS http://127.0.0.1:3100/health'
bun .superpowers/sdd/browser-sign-in-recovery/scratch/live.ts
```

The first post-merge health observation still named predecessor `f94d5b3a`; after the normal poller tick, both disk and running identity reached the merge. Fresh persisted receipt `/tmp/browser-recovery-dev-health-merged.json` confirms:

```json
{
  "status": "ok",
  "commit": "d50767b7774af4ff6d49387f1582fc04f0e3c253",
  "bootCommit": "d50767b7774af4ff6d49387f1582fc04f0e3c253"
}
```

Public acceptance session 95786 terminated exit 0 after that boot proof. Receipt `/tmp/browser-recovery-public-https.log` confirms the actual public origin `https://dev.wbs.bulletpoints.club`: browser-bound callback 302 to the fixed recovery path, reset POST 204 with exact Origin and three independent expiry headers, removal of exactly `__Host-wbs_access`, `__Host-wbs_session` and `__Host-wbs_organization`, preservation of the unrelated diagnostic cookie, a fresh password attempt receiving 401 `invalid_credentials`, visible ordinary credential feedback and no page errors.

Only external provider authorization navigation was substituted with a diagnostic callback using a fresh valid login transaction. Callback/reset/password requests reached the actual deployed listener. The code was synthetic; no user code, account secret or credentialed provider login was used. This proves public diagnostic recovery and fresh validation, not successful account authentication or credentialed Auth0 acceptance. Temporary public screenshots identify the recovery and fresh-password states in the owned scratch directory and follow the cleanup scope stated above.

**Current decision:** IMPLEMENTATION MERGED AND PUBLIC RECOVERY VERIFIED. Required gates and final reviews passed before the normal merge; dev's running identity and public behavior were observed afterward. This record and completed tasks are prepared for a docs-only follow-up from merged main. The follow-up's eventual merge is not asserted inside its own premerge record. Credentialed Auth0 acceptance and Tool Wiki certification remain explicitly unverified; delta-spec archive/sync was not requested.
