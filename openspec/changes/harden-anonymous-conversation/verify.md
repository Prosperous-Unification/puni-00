# Verification

## Scope and source

Implementation began from current main `53d43d6c0` to preserve shipped conversion scoping. The owner authorized all six invisible controls, the scoped preview URL-fragment reset, merge and development deployment. No prospect sign-in, email verification, visible challenge or provider-key limit change is included. The preview source is governed by the private companion and fleet repositories.

## Observed runtime checks

- Stable public API/store suite: `bun test ./libs/website/adapters/store-sqlite/src ./apps/website/be-01/src --timeout=30000` — **850 pass, 0 fail**, 43 files, 10,637 assertions, 210.43s; `/tmp/task1-stable-tests.log`.
- Backend/store lint, both typechecks and builds passed; `/tmp/task1-stable-checks.log` and `/tmp/task1-api-lint-final.log`.
- Actual adapter package smoke passed. API package smoke initially refused its old fixture missing TRUSTED_PROXY_PEERS; the fixture now explicitly trusts loopback and the actual bundled smoke passed (`/tmp/harden-api-package-smoke.log`).
- Parent proxy/reset/frontend focused tests: 44 pass before the additional active-reset test; the active-reset test separately passed and retained the full charged reservation. Production retention/old-reader and fragment tests: 11 pass. Final affected Nx matrix and format-all are in progress.
- Private runtime encryption transport: 16 pass, 0 fail. Fleet rendered policy suite: 55 pass, 0 fail. No private or fleet deployment is claimed yet.

Sandbox-only EPERM on loopback/subprocess fixtures was reproduced and rerun with authorized execution facilities. One moving-source run was invalidated by subsequent migration edits and is not accepted as evidence. A pristine-main archive baseline passed 460 tests; its sole missing migration-linter dependency was restored and that test passed independently. Prettier has no parser for .env.example; its textual configuration example is excluded from direct parser checks, while canonical Nx formatting remains required.

## Failure proofs

Every fault below was injected into the production guard or dependency; its named production-path test exited nonzero, then restored code passed. Full task1 mutation transformations and logs are under `.superpowers/sdd/harden-anonymous-conversation/` (ignored scratch); observed details follow.

Runner: `python3 .superpowers/sdd/harden-anonymous-conversation/task1-mutations.py`.

The runner performs one actual production-source/SQL mutation at a time, runs the real mounted API/store test, requires nonzero exit with an observed failing test, and restores the original file in `finally`.33/33 mutations were killed. Full transformations are in that runner; individual logs and machine-readable summary are in `proofs/`. Adjacent `Proof:` comments name the observed fault/test on the guards and ledger dependencies. The following are exact test commands for each injected fault (every run exited1):

- **attempt-cap**: `bun test ./apps/website/be-01/src/conversation/conversation.test.ts -t 'mounted repeated Stop'` → mounted repeated Stop refuses paid attempt eleven before contacting provider [297.39ms]
- **rolling-conversations**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'retained browser|new browser keeps'` → retained browser refuses fourth paid conversation despite changing source [80.27ms]
- **rolling-spend**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'rolling source and browser spend'` → rolling source and browser spend each refuse a reservation beyond thirty cents [55.96ms]
- **browser-scope**: `bun test ./apps/website/be-01/src/conversation/conversation.test.ts -t 'mounted retained browser'` → mounted retained browser survives changed sources and missing browser cookie on existing draft [486.21ms]
- **source-scope**: `bun test ./apps/website/be-01/src/conversation/conversation.test.ts -t 'mounted cleared browser'` → mounted cleared browser cookie cannot renew a source across UTC midnight [879.75ms]
- **scoped-minute**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'durable one-minute'` → durable one-minute source and browser bursts refuse without exhausting drafts [60.41ms]
- **site-minute**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'site twenty-per-minute|preview reset preserves four-call'` → site twenty-per-minute burst survives distinct sources and browsers [195.98ms]
- **site-hour**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'rolling site hour|preview reset preserves hourly'` → rolling site hour and UTC month ceilings count retained accounting [44.51ms]
- **site-month**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'rolling site hour|preview reset preserves hourly'` → rolling site hour and UTC month ceilings count retained accounting [81.04ms]
- **immutable-binding**: `bun test ./apps/website/be-01/src/conversation/conversation.test.ts -t 'mounted retained browser'` → mounted retained browser survives changed sources and missing browser cookie on existing draft [551.99ms]
- **server-browser-registry**: `bun test ./apps/website/be-01/src/conversation/conversation.test.ts -t 'intake mints'` → intake mints a registered host-only browser cookie and ignores a forged browser identity [39.78ms]
- **yesterday-source**: `bun test ./apps/website/be-01/src/conversation/conversation.test.ts -t 'mounted cleared browser'` → mounted cleared browser cookie cannot renew a source across UTC midnight [605.56ms]
- **reset-fence**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'preview reset fences'` → preview reset fences in-flight operation before renewing counters [44.71ms]
- **retention-accounting**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'content deletion|production retention purge'` → content deletion preserves ledger spend and settlement from compatible writers [48.04ms]
- **paid_attempt_conversation_insert**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'content deletion|retired-provider triggers'` → content deletion preserves ledger spend and settlement from compatible writers [43.06ms]
- **paid_attempt_conversation_update**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'content deletion|retired-provider triggers'` → content deletion preserves ledger spend and settlement from compatible writers [65.36ms]
- **paid_attempt_provider_insert**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'content deletion|retired-provider triggers'` → retired-provider triggers preserve insert settlement and deletion accounting [32.37ms]
- **paid_attempt_provider_update**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'content deletion|retired-provider triggers'` → retired-provider triggers preserve insert settlement and deletion accounting [35.37ms]
- **backfill-conversation**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'migration backfills'` → migration backfills conversation and retired-provider spend without content ownership [59.57ms]
- **backfill-provider**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'migration backfills'` → migration backfills conversation and retired-provider spend without content ownership [64.49ms]
- **browser-registry-expiry**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'browser registry refuses expired'` → browser registry refuses expired registrations without waiting for cleanup [37.15ms]
- **browser-registry-cleanup**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'stale browser registrations'` → stale browser registrations expire while draft bindings remain [42.94ms]
- **browser-registry-atomic-issuance**: `bun test ./apps/website/be-01/src/conversation/conversation.test.ts -t 'refused draft caps cannot'` → refused draft caps cannot create orphan browser registrations [107.17ms]
- **site-day**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'preview reset preserves hourly'` → preview reset preserves hourly monthly daily and pause refusals [169.53ms]
- **site-pause**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'preview reset preserves hourly'` → preview reset preserves hourly monthly daily and pause refusals [202.23ms]
- **site-concurrency**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'preview reset preserves four-call'` → preview reset preserves four-call concurrency and site fresh-minute ceiling [78.88ms]
- **browser-registry-refresh**: `bun test ./apps/website/be-01/src/conversation/conversation.test.ts -t 'accepted intake refreshes'` → accepted intake refreshes browser registration through its original thirty-one-day boundary [50.10ms]
- **fresh-admission-clock**: `bun test ./apps/website/be-01/src/conversation/conversation.test.ts -t 'slow request bodies'` → slow request bodies reserve under the fresh admission time and UTC day [106.85ms]
- **live-operation-recovery**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'second process cannot recover'` → a second process cannot recover live calls or bypass four slots before their deadline [61.28ms]
- **expired-operation-recovery**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'second process cannot recover'` → a second process cannot recover live calls or bypass four slots before their deadline [62.57ms]
- **retained-operation-delete**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'cannot delete paid original'` → predecessor cleanup cannot delete paid original operations still in the current UTC month [45.43ms]
- **retained-provider-delete**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'cannot delete current-month retired'` → predecessor cleanup cannot delete current-month retired-provider accounting [57.48ms]
- **orphaned-financial-rollback**: `bun test ./libs/website/adapters/store-sqlite/src/anonymous-admission.test.ts -t 'rollback refuses'` → migration rollback refuses to discard orphaned retained financial records [59.84ms]

### Additional boundary proofs

| Injected fault                         | Observed failing production-path test                                                      | Evidence                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Bypass trusted socket peer             | proxy-trust.test.ts: untrusted socket chooses forwarded source                             | /tmp/harden-proxy-peer-negative.log          |
| Omit required runtime peers            | proxy-trust.test.ts: runtime forwarded deployment                                          | /tmp/harden-proxy-runtime-negative.log       |
| Allow /0 trusted range                 | proxy-trust.test.ts: unrestricted peer startup                                             | /tmp/harden-proxy-range-negative.log         |
| Skip IPv4-mapped normalization         | proxy-trust.test.ts: alternate mapped spellings                                            | /tmp/harden-source-mapped-negative.log       |
| Bypass reset secret comparison         | testing-reset.test.ts: missing/wrong secret                                                | /tmp/harden-reset-auth-negative.log          |
| Bypass reset Origin                    | testing-reset.test.ts: foreign Origin                                                      | /tmp/harden-reset-origin-negative.log        |
| Permit production reset config         | testing-reset.test.ts: production configuration                                            | /tmp/harden-reset-production-negative.log    |
| Permit malformed reset secret          | testing-reset.test.ts: secret shape                                                        | /tmp/harden-reset-shape-negative.log         |
| Remove active reset abort              | testing-reset.test.ts: immediately aborts active provider                                  | /tmp/harden-reset-active-abort-negative.log  |
| Remove URL fragment scrub              | frontend testing-reset.test.ts: clean URL inside callback                                  | /tmp/harden-fragment-scrub-negative.log      |
| Permit production fragment             | frontend testing-reset.test.ts: production refusal                                         | /tmp/harden-fragment-origin-negative.log     |
| Permit malformed fragment              | frontend testing-reset.test.ts: malformed refusal                                          | /tmp/harden-fragment-shape-negative.log      |
| Rethrow secret-bearing transport error | frontend testing-reset.test.ts: sanitized network error                                    | /tmp/harden-fragment-errors-negative.log     |
| Restore day-only original retention    | conversation-retention.test.ts: production purge and old-reader sums across month boundary | /tmp/harden-retention-originals-negative.log |
| Bypass exact ingress policy validation | fleet policy.test.ts: widened policy retains expected name                                 | /tmp/harden-fleet-policy-negative.log        |

## Review

Independent review reproduced inherited live-peer startup recovery, active-cookie expiry, refused-intake registry growth and old-reader accounting gaps. Each has a production correction and regression/proof; scoped stable-source re-review remains required. Recent peer reservations now remain until their deadline. Active browser registrations refresh only on admitted drafts. Recent original financial rows are blanked, retained and delete-guarded; a code rollback keeps migration014 and pauses inference before a predecessor lacking the new policies.

## Release acceptance

Pending exact-SHA canonical host gate, merged public source, governed five-tree private snapshot, source and fleet CI/rehearsal, packaged artifacts, SQLite pre-start backup/full name-hash capture, live served identities, normal anonymous journey, proxy refusals and configured reset.

The preview testing secret was generated in private mode0600 artifacts and encrypted on h4 using the SHA256-verified locked SOPS binary. Every existing runtime value was decrypted/re-encrypted and compared on that host without publication; all remained unchanged. The prepared ciphertext has not been applied. Site ceilings, provider-key caps, production configuration and inference activation remain authoritative.

## Integrated source checks

`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx format:check --all` completed successfully (silent success), followed under `set -e` by the uncached five-project `bunx nx run-many -t test lint typecheck build -p website-fe-01 website-be-01 website-store-sqlite website-contracts website-analytics --skip-nx-cache` matrix: **20 successful tasks**, 3m44s, `/tmp/harden-website-matrix.log`. Main advanced to `a5e9dbe9f` during work; a normal merge preserved its registry changes. Website runtime trees were unchanged by that integration.

Private main concurrently advanced to `36a3b4e` with an already-approved About header link in the canonical app snapshot. The corresponding two public app files were reconciled byte-for-byte to that eligible public source before snapshot refresh, preserving the concurrent site/app navigation rather than overwriting it. Its existing chrome regression passed.

## Combined request hostname release

Public901is merged. Approved public903and private100request-host/footer work are integrated without reverting About navigation, pure pin preparation, exact receipt/runtime origin binding or cross-host rollback refusal. The operator reset now accepts exact `dev.request.puni.dev` and legacy `dev.app.puni.dev` only with the development site, keeping production excluded.

Fresh tests first failed on both new-host acceptance paths. After updating the API and frontend boundaries,30reset tests passed. Injecting prefix matching separately into each production boundary made the hostile suffix refusal fail; both restored. Persistent logs are in `.superpowers/sdd/harden-anonymous-conversation/delivery/preview-origin-*.log`.

Private Fleet fixture is pinned to combined reviewed Fleet10f85c7, with exact six upstream blobs and tree identity. Its synthetic API input supplies trusted peers and the actual gateway-only API policy. The first full-policy fixture test refused the prior empty synthetic ingress policy, then186deployment/pin/registry tests passed with the corrected fixture. Both Fleet39CI checks are green. Frozen public installation restored the missing locked AWS SDK dependency; no unrelated source fix was made.

Live HTTPS still serves private2c3c8e40/publicbe6923; the request hostname returns421before the combined gateway rollout. Final combined exact-SHA host gate, private full matrix/build, published images, migration snapshot/ledger capture, Fleet pin and live acceptance remain pending. Production is held and no new paid calls are authorized for these checks.

## Shared lint contract restored before publication

PublicCIrun42526533579failed the existing durable-contract typed-lint test:1105tool-devsync tests passed and one failed because the canonical evidence probe was globally ignored. The same existing test failed locally before the correction. This is a precise contract restoration, with no website behavior or gate command changes.

The global evidence pattern now allows traversal only into the durable-contract probe directory; the explicit project-service whitelist remains one canonical file. The existing test passes all10assertions: the admitted probe gets typed lint, an injected floating promise is refused and an unlisted sibling gets a project-service fatal error. Other evidence exclusions remain in place. This follows [ESLint's directory traversal rules](https://eslint.org/docs/latest/use/configure/ignore#unignore-files-and-directories).

Fresh commands: `bun test ./tools/tool-devsync/src/eslint-boundaries.test.ts --test-name-pattern 'durable-contract evidence retains'` passed; `bunx eslint --max-warnings=0 openspec/changes/cross-project-dependencies/evidence/task-7-durable-contracts/canonical-properties.ts` passed. Omitting the new traversal/admission exceptions made both production-path commands fail; restored. Logs: `.superpowers/sdd/harden-anonymous-conversation/delivery/lint-scope-*.log`.

Only this source's superseded private build waiter and exactcf384gate jobs were cancelled after that deterministic failure. No other jobs were touched. Publication remains conditional on the corrected exact-SHA normal gate, required CI and full private source/image checks.

## Existing-tab testing reset

Actual browser acceptance on public1cc9d3 found that pasting the reset URL into an already-open exhausted chat changed only the fragment: eight scripted replies, zero remaining turns, one hashchange, no reset POST and the exhausted screen still visible. The startup-only consumer was the cause. Evidence: `delivery/reset-browser-proof/run-n6993keo/same-document-failure.json` under `.superpowers/sdd/harden-anonymous-conversation/`.

The same consumer now observes hash changes, and a successful reset remounts the existing page with a fresh React key so it rereads the allowance. Normal fragments leave unsent input and mounted state intact. Initial fragment scrubbing still precedes analytics; existing exact-origin, token and sanitized-error boundaries are reused.

Fresh parent verification: `bun test ./apps/website/fe-01/src/testing-reset.test.ts ./apps/website/be-01/src/testing-reset.test.ts` passed20tests,96assertions across2files. The maintained frontend regression first failed before implementation, then passed11tests/50assertions. The real mounted browser proof (`python3 .superpowers/sdd/harden-anonymous-conversation/delivery/reset-browser-proof/run.py`) passed twice after the correction, most recently `run-gdju9p87`: two same-document pastes and a fresh startup restored eight remaining turns, retained all16messages and eight ledger rows/5600simulated microUSD, rotated browser identity and made no additional provider call. The test token was scrubbed before each header-only POST and absent from request URLs/storage. All owned processes exited. These are scripted-provider results; no paid network provider call was made.

Observed R5 faults, each restored before the final passing run: removing listener registration failed the maintained same-document test; removing the null guard emitted a captured window error and failed ordinary-fragment navigation; removing the React key left the actual mounted exhausted screen despite a successful reset and eight remaining API turns (`run-48_ytdrc`). Adjacent Proof comments name these checks. Logs: `delivery/hash-reset-{listener,ordinary-guard,key}-negative.log` and `delivery/hash-reset-final-{unit,browser}.log` under the same ignored evidence directory.

The full frontend source suite passed174tests/584assertions and the isolated Vite production build passed. Scoped typed ESLint, Prettier and uncached `website-fe-01:typecheck` passed after mechanical void-callback/typed-array corrections; no runtime behavior changed in that cleanup. Logs: `delivery/hash-reset-{fe-tests,build,lint,format-check,types}.log`.

Only the owned superseded1cc local gate and queued e35 private build were cancelled143 after this reproduction; their remaining child groups were terminated and no process remained in the isolated gate checkout. Neither is a passing gate/build. The corrected exact public source, private snapshot and full normal gate/build/CI remain required before publication.
