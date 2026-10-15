# Verify: organization-enterprise-sso (WBS 010.5.5)

Branch `batch-10/010-5-5-enterprise-sso-impl`, based on `origin/batch-10/integration-7`
(c8285f9a3, carrying #337 spec, #330 production wiring, #326 social sign-in), with `origin/main`
merged in on 2026-10-12. Every fault below was injected into production code, the named test was
watched failing, the file was restored (`git diff` clean) and a `Proof:` comment was written beside
the check. Dates are 2026-10-12.

## Commands and results

| Command                                                                                                                                                                                  | Result                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t lint:fast typecheck -p wbs-be-01 wbs-core wbs-store-sqlite wbs-contracts wbs-auth wbs-mcp-01 wbs-fe-01 tool-git-hooks`                                              | `Successfully ran targets lint:fast, typecheck for 8 projects and 3 tasks they depend on`                     |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run-many -t test -p wbs-be-01 wbs-core wbs-store-sqlite wbs-contracts wbs-auth wbs-mcp-01 wbs-fe-01 tool-git-hooks --skip-nx-cache` | `Successfully ran target test for 8 projects and 1 task they depend on` (exit 0, after merging `origin/main`) |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                 | 182 items, 182 passed, 0 failed                                                                               |
| `bunx prettier --check` on every touched file                                                                                                                                            | clean                                                                                                         |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                               | not run from the lane; the orchestrator runs the host gate                                                    |

## Failure proofs

| Task   | Injected fault                                                                                                      | Test that failed                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1    | `organization_sso_connection_proven` made a plain index                                                             | `lets exactly one of two organizations prove the same Auth0 connection` (`enterprise-sso-migration.db.test.ts`)                                                                                                                     |
| 1.1    | audit rebuild's `CHECK (violations = 0)` replaced by `CHECK (1)`                                                    | `accepts the enterprise SSO audit rebuild` (`migration-lint.test.ts`, "contains destructive statement: DROP TABLE")                                                                                                                 |
| 1.1    | binding CHECK replaced by `CHECK (1)`                                                                               | `binds a SCIM user's pair all together or not at all`                                                                                                                                                                               |
| 1.1    | UPDATE trigger narrowed to `UPDATE OF id`                                                                           | `refuses to change or delete an audit row`                                                                                                                                                                                          |
| 1.1    | each `down.sql` guard made constantly true                                                                          | `refuses to roll back over any enterprise SSO record`, `… a recorded sign-in time`, `… the audit widening over a new-kind row`                                                                                                      |
| 1.1    | a writer `tx.update(organizationAudit)` added                                                                       | `never update or delete a row` (`organization-audit-append-only.test.ts`)                                                                                                                                                           |
| 1.2    | `SessionPolicyRepository.set` audit appended in its own transaction after commit                                    | `rolls every act back when its audit row cannot be written` (`enterprise-sso-stores.db.test.ts`)                                                                                                                                    |
| 1.2    | claim-status recheck dropped; claim organization predicate dropped                                                  | `refuses a pending or suspended claim`; `answers a foreign claim as absent`                                                                                                                                                         |
| 1.2    | live-count check, proven-connection check, revocation predicate dropped                                             | `… refuses a third live token`; `refuses a token without a proven connection`; `answers null for a revoked, unknown or malformed token`                                                                                             |
| 1.2    | SCIM id lookup organization predicate dropped; final-super-admin guard dropped                                      | `answers another organization's user as absent…`; `refuses to deprovision the last super-admin…`                                                                                                                                    |
| 1.2    | audit secret check skipped                                                                                          | `refuses a detail carrying a token, digest or full subject`                                                                                                                                                                         |
| 2.1    | claim-status recheck dropped in `create`                                                                            | `refuses a pending or suspended domain and stores nothing` (`sso-connection.controller.db.test.ts`)                                                                                                                                 |
| 2.1    | delegation guard / release check dropped                                                                            | `refuses a delegated caller…`; `refuses releasing a domain while a connection names it`                                                                                                                                             |
| 2.2    | `verified` predicate dropped in `routeByDomain`; two hints admitted; `max_age` dropped                              | `sends no connection for an unrouted domain or a suspended claim`; `refuses two hints…`; `passes max_age and prompt through to /authorize`                                                                                          |
| 2.3    | prefix compared without trailing `\|`                                                                               | `leaves the connection unproven and links nothing for samlp\|acme-saml-2\|alice@acme.test` (core: `refuses a longer connection name sharing the prefix`)                                                                            |
| 2.3    | any member proves; domain comparison dropped; unique violation rethrown; refused link not rolled back               | `links a non-super-admin matching pair…`; `does not prove through an address off the connection domain`; `lets one of two organizations prove the same Auth0 connection`; `rolls the proof back with a link refused as a collision` |
| 2.4    | `email_verified` honoured for every enterprise identity                                                             | `trusts no foreign-domain email from a proven connection, and answers no account_exists` (and the unproven, link and composed tests)                                                                                                |
| 3.1    | prefix test skipped in `credentialRuleRefusal` (membership-only)                                                    | `refuse a social identity in an enforced organization` (core) and mounted `refuses a social identity in the enforced organization only`                                                                                             |
| 3.1    | selection admission skipped                                                                                         | `refuses a social identity in the enforced organization only`                                                                                                                                                                       |
| 3.1    | any pair linked to the user evaluated instead of the authenticating pair                                            | `does not lend a linked SSO pair to a social credential`                                                                                                                                                                            |
| 3.1    | `/api/auth/me` spreading the principal                                                                              | `issues the hardened browser cookie for a password account in OIDC mode`                                                                                                                                                            |
| 3.2    | lockout guard dropped in `setEnforced`; null actor subject passed by the route                                      | `enables enforcement for a super-admin signed in through the connection`                                                                                                                                                            |
| 3.2 fe | href built client-side; unknown code/reason given copy; path guard off; locked flag ignored; failed read as empty   | see `credential-refusal-state.test.tsx`, `membership-choices.test.tsx`, onboarding and spaces tests (F1–F9 in the fe commit)                                                                                                        |
| 4.1    | raw secret to the store; `MOST_LIVE_PROVISIONING_TOKENS = 3`; delegation guard dropped; MCP exclusion dropped       | `shows the secret once…` (500); `refuses a third live token…`; `refuses a delegated caller…`; `keeps provisioning-token administration out of the generated MCP tools`                                                              |
| 4.2    | revoked tokens looked up as live; admission skipped; `>` for `>=`; boot wiring removed                              | `replays a revoked token on every verb…`; mounted 429 test; `scim-admission.test.ts`; `serves SCIM provisioning from the shared database once activated`                                                                            |
| 4.3    | organization predicate dropped; PUT to PATCH; other filters listed; bare `decodeURIComponent`                       | cross-organization PATCH 200; PUT 400; filter 200; `%E0%A4%A` 500                                                                                                                                                                   |
| 4.4    | login-callback activation removed; activation on email alone                                                        | `activates a pending membership at the first SSO sign-in, even unverified`; `does not activate through a social sign-in with the same email` (`pending-membership.controller.db.test.ts`)                                           |
| 4.4    | domain comparison dropped in `ScimUserRepository.activate` (Fable review)                                           | `does not let one connection's IdP activate another domain's pending record` (`enterprise-sso-stores.db.test.ts`)                                                                                                                   |
| 4.2    | SCIM body read before authentication (Fable review)                                                                 | `reads no body before the bearer token authenticates` (`scim-body.controller.db.test.ts`)                                                                                                                                           |
| 4.2    | body read without the 64 KiB bound                                                                                  | `refuses a body over the bound 413 and stores nothing`                                                                                                                                                                              |
| 4.5    | membership deleted in its own transaction before the audited one; last-super-admin return dropped; deletion skipped | rollback test; last-super-admin test (200); both access-ending tests                                                                                                                                                                |
| 5.1    | `opened_at` set on refresh; lifecycle opened with a null reauthentication time                                      | `keeps both times across a refresh` (`browser-sign-in-times.db.test.ts`); `records when a prompted sign-in reauthenticated` (`oidc-identity.controller.db.test.ts`)                                                                 |
| 5.1    | callback time on every `prompt=login`; `auth_time` without `max_age`                                                | `does not reauthenticate through a different connection`; `reads auth_time only under max_age` (`reauthentication-time.test.ts`)                                                                                                    |
| 5.1    | body validation skipped                                                                                             | `refuses out-of-range, fractional and inverted bounds` (500 instead of 400)                                                                                                                                                         |
| 5.1    | `reauthenticate` left out of the hint count                                                                         | `routes a reauthentication login by organization`                                                                                                                                                                                   |
| 5.2    | null `opened_at` treated as now                                                                                     | `refuses an unknown time` (core) and mounted `refuses an unknown time and a delegation without an authentication time`                                                                                                              |
| 5.2    | either bound compared with `>=`                                                                                     | `admits the exact bound and refuses one millisecond more` (core, fake clock); mounted pair of exact-bound tests                                                                                                                     |
| 5.2    | policy read in a second query                                                                                       | `reads the credential rules in the membership query` (4 statements instead of 3)                                                                                                                                                    |
| 5.2    | session `authentication` omitted at direct-context issue                                                            | `refuses a direct context under a session policy only once the password session is too old`                                                                                                                                         |
| 5.3    | `sso_connection_proven` audit write skipped                                                                         | `writes one row per act and none per refusal, holding no secret`                                                                                                                                                                    |

## Not run, unverifiable or owed

- 4.6 and the first proof sign-in against a real Auth0 enterprise connection: Dany-only. Every
  test uses fake providers and the A29 fixture subject `samlp|acme-saml|alice@acme.test`.
- A link callback never writes `reauthenticated_at`: no code path writes it, and the mounted
  sign-in time tests pin the login-callback writer; no fault is constructible without adding a
  writer, so none was injected.
- mcp-01's own refresh path does not yet refuse in organizations with a policy (design.md
  "Session policy"); be-01 refuses every such delegation on use.
- fe-01: no "link your company sign-in" button (wording only); plan and saved-plan surfaces show
  the two refusals as sentences without sign-in actions; no organization switcher exists to lock.
- `browser-lifecycle.mounted-process.db.test.ts` worker tests and one
  `organization-selection.controller.db.test.ts` subprocess test timed out in some intermediate
  runs under host load (also on the base); the final run above passed them.

## Task 3.2 company-link completion — 2026-10-13 (WBS 010.5.7)

Isolated branch `feat/sso-company-link` starts at verified remote `main`
`860b492a14749fecc50109a7a6c37728b23c419c`. The existing backend lockout guard,
locked membership entry, and shared sign-in/refusal presentation are retained.
This slice completes the missing company-link action and consumes the two
enterprise callback outcomes. The Auth0 endpoint and contract are unchanged.
Task 4.6 remains open for Dany's live IdP proof; task 5.4 remains open for the
orchestrator's canonical exact-SHA gate and overall verification closure.

### Test-first observations

The two new callback cases first failed because `OnboardingScreen` rendered no
status for `sso_prefix_mismatch` or `sso_connection_taken`. The company component's
eight initial cases failed against its empty scaffold. The shared refusal suite
then failed its new slug-source case and six malformed login-path cases before
wiring the company link. The tests pass after implementation.

### Company-link failure proofs

Each fault was independently injected into production code and restored after
the named test failed. Each run exited 1 with assertion failures, rather than a
compile or import error. Temporary logs live outside the repository.

| Injected fault                                             | Production-path test that failed                                                  | Observed failures                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Remove the pending ref admission guard                     | `prevents repeated form submissions while a request is pending`                   | 1; two requests instead of one                                                             |
| Skip the current-sign-in choice check                      | `requires an explicit current sign-in choice before posting`                      | 1; request sent instead of choice message                                                  |
| Skip the fresh-password check                              | `requires a fresh password for a WBS password sign-in`                            | 1; empty password sent                                                                     |
| Retain the password when changing sign-in mode             | `posts the password with the company slug and clears it when choosing a provider` | 1; password remains on returning to password mode                                          |
| Include password in provider mode                          | `posts only the company slug for a provider sign-in and leaves for Auth0`         | 1; request leaks an unwanted password field                                                |
| Remove the company query validation condition              | six `refuses a malformed company login path` cases                                | 6; missing, empty, malformed, duplicate, method and reauthentication hints render the form |
| Use `refusal.organizationId` instead of the extracted slug | `links the company slug selected by the server instead of its organization id`    | 1; wrong organization submitted                                                            |
| Remove the shared HTTPS authorization target check         | `refuses an insecure authorization target through the fault boundary`             | 1; navigation occurs instead of the fault boundary                                         |

### Commands and observed results

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: checked 1573 installs across 1447 packages, exit 0.
- Focused Vitest command for `credential-refusal-state`, `company-sign-in-link`, `auth0-link`, `spaces-page`, `space-page`, `membership-choices`, `organization-page`, and `onboarding-screen`, with `--no-file-parallelism --maxWorkers=1`: 8 files, 82 tests passed, exit 0. This covers every shared refusal caller and the switcher regression.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: frontend and module typechecks passed, exit 0.
- `NX_DAEMON=false bunx nx run wbs-fe-01:build`: 1076 modules transformed; frontend build passed, exit 0.
- `BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/puni-sso-company-link/.bun-cache bunx @fission-ai/openspec@1.12.0 validate --all --json`: 184 items passed, 0 failed, exit 0.

Nx reports its sandbox socket fallback; Vitest reports the existing Vite native
config warning for `__dirname`. The first full frontend lint returned nonzero
without ESLint diagnostics; focused lint exposed four fixable test-style errors
(import order and void arrow expressions), subsequently corrected. Final lint
and format results are recorded below before the branch is handed off.

Not run by this worker: canonical host gate, full repository suite, live Auth0
customer proof, deploy, and WBS updates. The orchestrator owns the canonical gate.

Final observations after restoring all faults and correcting test style:

- Focused frontend regression rerun: 8 files, 82 tests passed, exit 0.
- `NX_DAEMON=false NX_NO_CLOUD=true bunx nx run wbs-fe-01:lint`: full frontend lint passed, exit 0 (65 seconds).
- Focused ESLint on all six touched frontend files: exit 0.
- `NX_DAEMON=false NX_NO_CLOUD=true bunx nx run wbs-fe-01:typecheck`: frontend and module typechecks passed again, exit 0.
- Prettier check on all ten touched files and `git diff --check`: clean.
- OpenSpec validation rerun after task/spec/design/verify edits: 184 passed, 0 failed, exit 0.

### Review follow-up: sign-in-mode refusal wording

The independent review found no P1/P2 issue and requested clearer provider-mode
401 wording. A new production-path component regression first failed with
`That password is not correct.` when provider mode had submitted no password.
The form now explains that the current sign-in could not be verified and offers
the WBS password choice or a fresh sign-in. Password-mode 401 and all 429 copy
keep their existing meaning. This changes modeled refusal presentation only;
no new authority or admission guard is introduced. The test-first failure also
proves that removing the mode-specific copy reintroduces the observed defect.

Review follow-up verification: the three directly affected suites
(`company-sign-in-link`, `credential-refusal-state`, `auth0-link`) pass 36 tests.
Frontend/module typecheck and frontend build pass again. OpenSpec validates all
184 items. Lint initially flagged a redundant error-code comparison: the typed
401 response already guarantees `invalid_credentials`; that comparison was
removed before the final rerun.

Final full frontend lint passes (exit 0), and the three touched files pass
Prettier and `git diff --check`. The canonical host gate, integration, and deploy
remain outside this worker's scope.

## Task 2.5 company connection setup — 2026-10-13 (WBS 010.5.7)

Branch `round14/sso-connection-setup` starts at exact reviewed #390 head
`7db722008350fc18d53de6a726d949f78555c44f`, freshly confirmed by
`git ls-remote origin refs/heads/round14/sso-downstream-integration`. Work lives
in an isolated `/tmp/puni-sso-setup` clone. Local checks use the existing reviewed
downstream dependency tree via a `node_modules` symlink; this is
not a fresh frozen install or the canonical host gate. No backend, contract or
migration changed. Edit/enforce/delete, SCIM and session-policy panels remain
outside this bounded setup slice.

The page composition test first failed because Company sign-in was absent.
Twenty initial component cases failed against the empty component scaffold.
Additional eligibility and impossible-strategy negatives were watched failing
under the separately injected faults below. All faults were restored before
final verification. Each mutation run exited 1 with assertion failures, not
compile/import errors. Logs are `/tmp/sso-mutation-*.log` outside the repository.

| Injected production fault                 | Observed production-path failure                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Omit setup panel                          | `composes company sign-in setup on the organization page`: region missing                          |
| Remove verified claim predicate           | `offers only verified domains`: pending and suspended options appear                               |
| Remove unused claim predicate             | `excludes domains already used by a connection`: used option appears                               |
| Skip selected claim eligibility           | `refuses a forged unused-domain selection before posting`: request sent                            |
| Remove create pending admission           | `blocks repeated submissions while create is held`: duplicate request                              |
| Replace claim id with `wrong-id`          | `creates with the claim id and exact fields, then refreshes both lists`: wrong request body        |
| Skip successful create refresh            | Same create test: recorded server row missing                                                      |
| Ignore write-time forbidden               | `removes controls when create loses super-admin authority`: unavailable alert missing              |
| Omit read access-loss callback            | Five `hands read authority loss` cases: page callback missing                                      |
| Treat forbidden read as ready             | Two `offers no create or proof controls after a forbidden` cases: unavailable alert missing        |
| Treat failed read as ready                | `clears controls on query failure and recovers with explicit refresh`: failure alert missing       |
| Remove impossible strategy check          | `throws on an impossible strategy selection`: no error thrown                                      |
| Route proof with connection id            | `uses server proof and enforcement labels and each row slug for proof`: wrong organization body    |
| Permit create while a proof start is held | `freezes the only proof target while its start request is held`: extra create request              |
| Force parent proving state false          | `freezes the only proof target while its start request is held`: target button remains enabled     |
| Render a second proof form                | `uses server proof and enforcement labels and each row slug for proof`: duplicate sign-in selector |

Browser verification uses the committed `e2e/organization.spec.ts` with a
throwaway Vite-only Playwright config at `tmp/organization.playwright.config.ts`:
all API calls are route fixtures, so no organization activation or backend is
required. The command is `bunx playwright test --config
tmp/organization.playwright.config.ts`; its server command is
`VITE_BE_URL=http://127.0.0.1:3100 VITE_GW_URL=ws://127.0.0.1:3200 bunx vite
--host 127.0.0.1 --port 6297`, cwd `apps/wbs/fe-01`, baseURL
`http://127.0.0.1:6297`, one worker, Chromium. Eight tests passed: populated
setup and password-link drawing with no horizontal overflow, denied setup,
held proof using the second row's distinct slug, and Tab traversal, each at
1280px and 375px. This proves fixture behavior and layout, not a live IdP link.

Intermediate frontend typecheck and build passed (1079 modules transformed).
Initial full frontend lint returned nonzero without diagnostics; focused
ESLint exposed void-expression/import style issues, corrected by autofix.
The Vite-only fixture initially lacked the required Vite URLs; explicit fixture
URLs fixed startup. Nx used its sandbox socket fallback; Vite/Vitest printed
the existing `__dirname` native-config warning. Final results follow below.

Not run by this worker: canonical host gate, fresh frozen dependency install,
full repository suite, live Auth0/customer proof, merge, deploy, or WBS write.
Task 4.6 and overall task 5.4 remain open. Root owns exact-head review and release.

Final verification after restoring every injected fault:

- Four affected Vitest suites (`sso-connections-panel`, `organization-page`, `company-sign-in-link`, `credential-refusal-state`): **68 tests passed**, exit 0.
- Browser fixture command above: **8 tests passed**, exit 0, including phone and keyboard coverage.
- `NX_DAEMON=false NX_NO_CLOUD=true bunx nx run wbs-fe-01:lint`: **passed**, exit 0 (69 seconds); focused ESLint passed again after final test additions.
- `NX_DAEMON=false NX_NO_CLOUD=true bunx nx run wbs-fe-01:typecheck`: **passed**, exit 0, including module typechecks.
- `NX_DAEMON=false NX_NO_CLOUD=true bunx nx run wbs-fe-01:build`: **passed**, exit 0, 1079 modules transformed.
- `bunx @fission-ai/openspec@1.13.0 validate --all --json`: **186 passed, 0 failed**, exit 0.
- Prettier checks on touched files and `git diff --check`: clean. Full Nx format result is recorded in the handoff.

### Astra review follow-up: create starts before proof

Review of `598ce7f6441d4369215aaf18b602a3128fde3a72` found the opposite pending order was not excluded: an idle selected proof form remained enabled while create was held, so its link could start before create's refresh unmounted it. The new production test `blocks the selected proof form while a create request is held` first failed on the enabled sign-in selector.

The parent now passes its create-pending state as the company's optional `disabled` prop. The form disables its selector, password and submit control, and separately guards the submit path so a forced form event cannot post. The regression releases a conflicting create, reselects proof and proves it can start afterward. Browser fixtures cover this create-first ordering at 1280px and 375px.

Three independent production faults were watched failing with assertion failures, then restored:

| Injected fault                           | Observed failure in the new component test  |
| ---------------------------------------- | ------------------------------------------- |
| Omit the parent's disabled prop          | Sign-in selector enabled during held create |
| Ignore disabled in link submit admission | Forced form event sends a fourth request    |
| Ignore disabled on link controls         | Sign-in selector enabled during held create |

Logs: `/tmp/sso-mutation-create-proof-{prop,submit,controls}.log`. No remote action is authorized in this follow-up; root owns the separately requested push approval and exact-head review.

Follow-up validation after restoring all three faults:

- Four affected component suites: **69 passed**, exit 0.
- The same isolated browser fixture command: **10 passed**, exit 0, including both held-request orders at both widths.
- Full frontend lint: **passed**, exit 0 (75 seconds).
- Module/frontend typecheck and frontend build: **passed**, exit 0; 1079 modules transformed.
- OpenSpec: **186 passed, 0 failed**, exit 0.
- No push, PR creation, canonical gate, merge, deploy or live IdP proof was attempted in this follow-up.
- `NX_DAEMON=false NX_NO_CLOUD=true bunx nx format:check --all`: **passed**, exit 0; touched-file Prettier and `git diff --check` also passed.

### Session policy administration panel (WBS010.5.7)

Implemented in an isolated clone of `feat/org-context-c2` at `b3249f5d42ff05d9b2331e776ee57deab6940542`; this entry concerns the new organization-page UI only. The mounted panel suite exercised GET and PUT through the typed scoped client; its first run failed because the component import did not exist. The page composition test failed until the panel was mounted.

Fault injection used the production source and the mounted panel tests. Each fault was restored before final verification; logs are `/tmp/session-policy-fault-*.log`.

| Injected fault                                   | Observed failure                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Accept a bound below 300                         | Invalid-bound test sent a PUT instead of refusing locally                       |
| Keep controls after write-time `forbidden`       | Authority-loss test found Save controls instead of the refusal state            |
| Remove both pending admission guards             | Forced submit during a held PUT sent a second PUT                               |
| Change the captured expected-organization header | Scoped read/write test received `wrong-org` instead of `org-a` on both requests |
| Display submitted bounds after successful PUT    | Reconciliation test did not display the server's 7200-second value              |

The C2 resource client's late-response cancellation and the panel's mounted late-read case cover previous-organization data after runtime withdrawal. Browser/host-gate execution and final exact-head checks are recorded by the integration owner.

Final worker checks on the restored UI source: the two affected mounted Vitest suites passed **37/37** (exit 0); `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json` passed (exit 0); `bunx @fission-ai/openspec@1.13.0 validate --all --json` passed **187/187** (exit 0); `bunx nx format:check --all`, touched-file Prettier and `git diff --check` passed (exit 0). The first full frontend lint run exited 1 with its diagnostics suppressed by Nx; direct ESLint identified two test-only style errors, which were fixed before the final rerun. No browser run was made for this panel: the committed browser fixtures do not yet exercise session-policy setup. No host gate was run by this worker; root owns the exact-head gate and integration review.

After the final test style correction, `NX_DAEMON=false NX_NO_CLOUD=true bunx nx run wbs-fe-01:lint` passed (exit 0, 1m 23s). The focused mounted suites passed 37/37 and frontend TypeScript compilation passed again (both exit 0). The lint output's Nx plugin-socket fallback was a warning; it did not suppress the successful lint result.

### Astra review follow-up: overlapping reads and field errors

Review of `2fd7fd2b18c4e41e2ff985e053275c819b4f5fda` found two UI gaps. The first mounted regression now holds the first GET from a root `StrictMode` mount, lets its second GET reach ready, performs a successful or forbidden PUT, then releases the old GET. The returned policy or authority refusal remains visible. A separate unmount test holds a GET refusal across effect cleanup and confirms that its access-loss callback does not fire. Request versions advance for each read, effect cleanup, and mutation admission. The typed client still fences a withdrawn organization runtime independently.

The second regression checks each field with an invalid bound. The associated inline alert names either maximum session length or reauthentication, and the input names that alert through `aria-describedby` and `aria-invalid`. A cross-bound error is associated with the reauthentication input. Invalid inputs send no PUT.

Mounted negative probes, restored afterward; logs are `/tmp/session-policy-review-fault-*.log`:

| Injected fault                                                         | Observed failure                                                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Remove the read response version fence                                 | A held first StrictMode GET replaced the second read's absent state with the old 28800-second policy |
| Remove effect cleanup invalidation                                     | A held GET refusal called `onAccessLost` after unmount                                               |
| Break read and cleanup version advancement, leaving mutation admission | Both after-PUT cases still passed; mutation admission alone prevented the stale GET                  |
| Also remove mutation admission advancement                             | Stale GET overwrote both successful and forbidden PUT states; 2 mounted cases failed                 |
| Replace the maximum-bound error with generic copy                      | Maximum-bound mounted case failed its field-name assertion                                           |
| Point reauthentication input at an absent error id                     | Reauthentication mounted case failed its `aria-describedby` assertion                                |

Final review-follow-up checks on restored source: the mounted session-policy and organization-page suites passed **42/42** (exit 0); frontend TypeScript compilation passed (exit 0); full `wbs-fe-01:lint` passed (exit 0); OpenSpec validation passed **187/187** (exit 0); `nx format:check --all` passed (exit 0). Focused ESLint and touched-file Prettier passed with no diagnostics. The review changes are limited to the panel, its mounted tests and the existing OpenSpec artifacts. Browser fixtures, host gate and push remain with the integration owner.

### Company sign-in enforcement UI slice (WBS010.5.7)

The isolated worker branch starts at PR #407's `bac4fea4` and adds only browser enforcement controls to `SsoConnectionsPanel` and its existing enterprise change artifacts. A typed, scoped PATCH sends `{enforced}` to the selected connection **id**; the selected row's `loginSlug` is used only in the lockout login link. Server records remain authoritative. The backend's lockout refusal decides current-credential eligibility; the UI never infers it from proof, membership or identity links. Read generations advance on effect cleanup and mutation admission. Mutation ownership is separate, so create's post-success refresh releases its pending state.

Mounted tests covered a two-row selected id, exact boolean and expected-organization header, unproven enable prompt, held disable without optimistic state, unproven/lockout/not-found reconciliation, forbidden control withdrawal, organization loss, transport retry copy, pending cross-row admission, runtime withdrawal, same-render refresh/PATCH admission serialization, StrictMode held GET after successful and forbidden PATCH, and unmount cleanup. Final check counts and commands are recorded below.

Watched production-path fault probes used temporary source mutations and restored the file after each run; logs are `/tmp/sso-enforcement-fault-*.log`:

| Injected fault                                                     | Observed mounted negative                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| PATCH selected `loginSlug` instead of connection id                | Selected-id/returned-row test failed                                |
| PATCH old boolean instead of the requested inverse                 | Held-disable body test failed                                       |
| Remove unproven disabled predicate                                 | Two-row eligibility test failed                                     |
| Remove pending admission and disabled control                      | Held-first-PATCH second-row test failed                             |
| Remove read response generation fence                              | StrictMode held-GET success test failed                             |
| Bypass forbidden PATCH withdrawal                                  | Forbidden-control test failed                                       |
| Remove effect cleanup invalidation                                 | Held-GET refusal called access-loss callback after unmount          |
| Replace scoped resource client with stable global client           | Selected-row test failed its expected-organization header assertion |
| Replace the server-returned row with the old local row             | Server-returned-slug test failed                                    |
| Skip conflict re-read                                              | Unproven refusal left the stale proven enable control               |
| Use connection id in the lockout login link                        | Selected-row login-route href test failed                           |
| Remove the scoped client's post-response runtime currentness fence | Late PATCH published enforcement after runtime withdrawal           |
| Remove the same-render read admission guard                        | PATCH was sent while a refresh GET was held                         |

The browser fixture was extended for 1280px and 375px pending enforcement, alongside existing layout and keyboard traversal checks. The ordinary three-tier browser runner remained **unverified** in the first isolated attempt: it failed because `AUTH_MODE` was absent; with local test environment supplied, be-01 failed because `wbs-solver-launcher` was not on PATH. The documented `bun run tools/dev/solver-setup-cli.ts` then failed installing the hash-locked Python solver dependencies because `pypi.org` DNS resolution was unavailable (`absl-py==2.5.0`). No browser assertion ran. The integration owner's PR CI and canonical host gate can provide browser evidence later. External Auth0/customer prefix proof and SCIM remain open.

Final restored-source checks for this slice: `bunx vitest run src/components/organization/sso-connections-panel.test.tsx src/components/organization/organization-page.test.tsx --no-file-parallelism --maxWorkers=1` passed **65/65**; `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json` passed; `NX_DAEMON=false NX_NO_CLOUD=true bunx nx run wbs-fe-01:lint` passed; `NX_DAEMON=false NX_NO_CLOUD=true bunx nx format:check --all` passed; `bunx @fission-ai/openspec@1.13.0 validate --all --json` passed **187/187**. `bunx playwright test apps/wbs/fe-01/e2e/organization.spec.ts --config apps/wbs/fe-01/playwright.config.ts --list` collected the new pending-enforcement case at both 1280px and 375px and the existing keyboard cases. Ordinary browser execution remains unverified for the solver setup reason above. No host gate or push was run by this worker; the integration owner controls those after review.

### Astra review follow-up: same-render proof admission

Review of `c47aa8429da4a7c45b7c013040b43d2bb1da9319` found that an already-open `CompanySignInLink` could submit in the same React render as Enable or Refresh. The parent had set a synchronous pending/read ref, but the child still saw the prior `disabled` prop. Two mounted regressions first observed one link POST each beside a held PATCH or GET. The child now calls the parent's `canStart` predicate before claiming its own pending state or POSTing; the predicate reads current create/enforcement, read and proof refs. Both regressions pass. Removing the child guard again failed both tests (`/tmp/sso-enforcement-review-fault-proof-admission.log`); source was restored.

Astra's standalone Vite browser fixture (`bunx playwright test --config /tmp/sso-review-c47aa/playwright.config.ts`) passed **12/12** organization page checks at 1280px and 375px, including pending enforcement, proof flow, keyboard traversal and horizontal layout. This fixture stubs API routes; the ordinary three-tier browser runner still could not start its backend because locked solver setup required unavailable PyPI DNS.

Final restored-source review checks: mounted `CompanySignInLink`, `SsoConnectionsPanel` and organization-page suites passed **77/77**; frontend TypeScript build, full `wbs-fe-01:lint`, `nx format:check --all`, touched-file Prettier and `git diff --check` passed; OpenSpec validation passed **187/187**. The two new mounted cases and the 12 browser checks ran on the repaired source. The exact head will be committed locally with normal hooks; push and host gate remain with the integration owner.

## Browser provisioning tokens — 2026-10-15

Tasks 6.1–6.3 add a separate organization panel. The fixture seeds a proven connection in a disposable database; it does not establish Auth0 entitlement, configure an upstream provider or prove a customer IdP accepts SCIM.

Initial red: the empty component scaffold failed all nine initial mounted tests. Before composition, `composes provisioning token administration on the organization page` failed because the region was absent. The implementation then passed the mounted panel/page suite (39 tests). The mounted backend token suite passed nine tests with 78 assertions. `bunx @fission-ai/openspec@1.12.0 validate organization-enterprise-sso --json` reported valid with no issues.

Watched production-path faults (each restored):

| Injected fault                                                           | Observed negative                                                                       |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Bypass exact token-ID comparison                                         | Wrong-confirmation test failed because DELETE occurred without its error.               |
| Remove pending guards in form and mutation                               | Forced held-form submission observed two DELETEs, expected one.                         |
| Remove list generation fence                                             | Held StrictMode GET restored `token-a` after issue; stale-read test failed.             |
| Remove the captured scope from `useResourceClient`'s client construction | Scoped read/write test observed a missing expected-organization header.                 |
| Omit secret clearing                                                     | Refresh test retained `ephemeral-secret`; test failed.                                  |
| Break the shared client's currentness fences                             | Held issued reply published `withdrawn-secret` after authority withdrawal; test failed. |
| Replace returned `previousExpiresAt` with zero                           | Rotation test failed to find the server's exact expiry.                                 |
| Remove refresh pending admission                                         | Same-render Refresh→Issue test observed a POST, expected none.                          |
| Omit page composition                                                    | Mounted page test failed to find the Provisioning tokens region.                        |

Two false-green test harness conditions were corrected before accepting the proofs: the duplicate test initially counted only the first mocked fetch, and the withdrawn-reply test initially withdrew before the async client reached fetch. The corrected tests count every write and wait until the request is held at fetch before withdrawing authority. The first unscoped fault rebuilt the client every render and did not terminate; it was cancelled, restored, and replaced with removal of the captured scope at the existing memoized client boundary.

The first real browser attempt was unavailable because the sandbox denied the localhost listener (`EPERM listen`); it is rerun with socket access. Final browser, lint, typecheck and exact-SHA gate evidence follows after those runs.

Final focused evidence:

- `bunx vitest run src/components/organization/provisioning-tokens-panel.test.tsx src/components/organization/organization-page.test.tsx --maxWorkers=1` (from fe-01): 39 passed, zero failed.
- `bun test apps/wbs/be-01/src/controller/provisioning-token.controller.db.test.ts`: nine passed, zero failed, 78 assertions.
- `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`: exit 0.
- Normal commit hooks on checkpoint `1023ef5388cb4c722ae74cfd6a57fd4710b36116`: format, staged lint, secrets, private nesting and tool-wiki command passed. Tool-wiki explicitly reported inactive external activation, not certified. No migration hook applied because no SQL changed.
- Socket-enabled `bunx playwright test --config apps/wbs/fe-01/playwright.organization.config.ts -g 'browser provisioning'`: one passed. The first socket-enabled attempt correctly showed the fixture must explicitly select its organization; after adding that selection it passed in 11.8 seconds. The real mounted production boot answered `provisioning_active` while tokens lived and 204 after browser revocation of both tokens; metadata and the rotation expiry came from the backend. At 375px the document had no horizontal overflow.

The pending aggregate #467 and source #463 were still open at this checkpoint. This slice proves connection deletion through the existing API, without claiming the pending Company sign-in deletion controls have merged. The canonical h2puni gate on the final SHA and review remain separate required checks; no gate pass is claimed here.

Final fixture expansion: the complete organization Playwright config passed both tests (23.4 seconds), including keyboard focus and secret absence after reload. Whole-store OpenSpec validation passed 200 entries: 182 changes and 18 specs. After a mounted red for absent revocation-time metadata, rows also display the server revocation timestamp.

## Review repairs — 2026-10-15

Independent review of `1e280fe47922678b641d9ebc87a9bb94517f035a` found three P2 issues: a successful write's secret was discarded when its metadata read failed; code-only display lacked keyboard retrieval; overlap predecessors incorrectly offered rotation and the not_found wording asserted they were no longer live.

The secret now survives metadata transport and response failures, alongside the rendered failure. Explicit refresh, another mutation, authority refusal, dismissal and unmount still discard it. A labeled read-only input selects its full value on focus; the application needs no clipboard API. A non-null server expiry hides Rotate while retaining Revoke, and not_found now describes unavailability for the action.

Red evidence: both issue and rotate metadata-failure tests failed before secret preservation; the keyboard field test failed before the focusable field existed; the overlap-control and corrected-refusal tests failed against the previous implementation.

Watched production negatives, restored before final checks:

| Fault                                    | Observed failure                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| Reintroduce clearing on metadata failure | Four issue/rotate network/503 cases lost recoverable-secret.                            |
| Remove input focus selection             | Keyboard test selected an empty range instead of the whole secret.                      |
| Render Rotate despite non-null expiry    | Overlap predecessor test found the prohibited Rotate button; Revoke remained available. |
| Omit authority-refusal secret clearing   | Three post-issue metadata refusals retained authority-secret.                           |

The real browser fixture performed native keyboard copy from the selected field and verified the actual clipboard value. No upstream IdP was contacted. Final focused suite, browser suite, lint, typecheck, hooks and OpenSpec evidence are recorded after their final runs. The root coordinator owns the h2puni gate; this worker did not run it.

Final review-repair checks:

- Mounted panel and page suite: 48 passed, zero failed (30.91 seconds).
- Complete real organization browser/API fixture: two passed (40.9 seconds), including native keyboard copy verified through the actual clipboard, hidden overlap rotation, retained revoke, 375px layout, reload secret absence and deletion-blocker release.
- Changed frontend files: ESLint exit 0; full frontend TypeScript build exit 0 after removing unsupported Testing Library `exact` options from three new queries (string names are already exact).
- OpenSpec `validate --all --json`: 200 passed, zero failed (182 changes and 18 specs).
- No backend production changes or migrations were made for these review repairs. The previously recorded mounted backend result remains the backend evidence; it was not rerun for this browser-only repair.
