# Verification plan and design evidence

**Change:** automatic-trusted-activation. **Date:** 2026-10-07.
**Disposition:** design only; implementation, bootstrap and activation are NOT VERIFIED.
This planning ledger is explicitly requested with the design packet; it is not the
post-implementation verification report described by the schema's verify artifact.

## Baseline and observed constraints

Local design branch: `plan/automatic-trusted-activation`, based on main
`4bb71e5fdf7f753b9a67ce7dd56abff387ce3a29`.
No runtime source, workflow, external configuration, release or activation is changed.
The ADR number follows the highest known workspace ADR (0036), including parallel branch work.

Coordinator-provided read-only observations, not independently repeated by this author:

| Observation                                                                                           | Evidence limit                                                                       |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Live WBS: 193 entries; exactly 030.6 blocked/held; 030.2 DONE; project revision 12, entry revision 24 | Refresh before any WBS mutation; this packet changes no live WBS                     |
| Three expected activation-variable names exist                                                        | Values, referenced bytes, integrity and usability unverified                         |
| Repository secret inventory empty                                                                     | Does not establish organization/environment secret inventory or external credentials |
| Default workflow token read-only                                                                      | Does not establish a usable publisher, reviewer or administrator                     |
| Organization ruleset requires trusted-wiki workflow                                                   | A controller App check cannot silently replace that requirement                      |

Inspected source: activation runbook and trusted workflow; review protocol/local invoker;
`assertReviewBinds`; external receipt verification in integration admission; immutable
publication and sole-parent final integration binding. Local invoker evidence remains
`local-cooperative`; a schema-valid imported record is not authenticated external execution.
This is source inspection, not a fresh runtime pass.

## Structural validation

Original packet checks on 2026-10-07 (commit `54d9e2833ebc475b15f3efcbf8ec1cfef72ddc6d`):

| Command/check                                                                                                                                                                                                | Observed output                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `bunx @fission-ai/openspec@1.12.0 validate automatic-trusted-activation --strict --json`                                                                                                                     | 1/1 valid, zero issues                                                    |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                                     | 143/143 valid: 125 changes, 18 specs, zero failures                       |
| `bun /home/df/wd/puni/puni-00/node_modules/prettier/bin/prettier.cjs --check CONTEXT.md docs/adr/0037-activation-authority-is-independent-of-the-candidate.md openspec/changes/automatic-trusted-activation` | All matched files use Prettier code style                                 |
| Read-only Python word/link/structure inspection                                                                                                                                                              | Intent 301 words; four local links resolve; 10 requirements, 23 scenarios |
| `git diff --check`                                                                                                                                                                                           | Exit 0, no output                                                         |

Creating planning artifacts or OpenSpec reporting planning complete does not imply
implementation completion. All runtime fault proofs below remain unobserved.

## Subject-identity correction

The initial canonical tuple omitted the workflow subject. Source inspection of the 1.1
implementation found both canonical hashing and current-request validation unable to distinguish
two PRs sharing commit and trust fields. This follow-up binds typed subjects and target refs,
separates authenticated delivery metadata from request identity, and requires subject-scoped
supersession plus authoritative reconciliation and a durable A → B → A generation fence.

The spec adds eight scenarios; the existing merge-group scenario now includes qualified identity,
member identity/head and member order. Tasks 1.1/1.2/4.1 and F3/F10/F11/F12 require independent
mounted faults. These are planned corrections, not observed runtime proofs. The 1.1 schema and
current-request comparison must be corrected before relying on persisted 1.2 state. Existing
stored requests without the new bindings must be explicitly migrated or rejected; no default
subject, inherited approval or silent reinterpretation of an old request hash is allowed.

Fresh follow-up checks on 2026-10-07 used the same commands recorded above: strict OpenSpec
1/1 with zero issues; all-item OpenSpec 143/143 (125 changes and 18 specs); explicit-path
Prettier passed; `git diff --check` exited 0. Read-only word/link/structure inspection found
301 intent words, four resolving local links, 10 requirements and 31 scenarios. No runtime
test, mutation, provider invocation, activation or external setting was exercised.

## Durable lifecycle correction

The exclusive checking/reviewing stage model did not express concurrent obligations or the
proof required for later stages. This amendment uses one evaluating phase, immutable attempts,
complete authenticated evidence joins and guarded transitions; durable reservations and
acknowledgements model external effects without claiming exactly-once execution.

Source inspection of the in-progress 1.2 owner also identified generation reset after closing
an active request and conflation of bootstrap authority generation with durable request audit
generation. The contract now requires independent subject high-water/tombstone state and
subject-version-fenced authoritative reads. PR, merge-group and protected-revision routes are
distinct; controller-driven branch advancement waits through actual merge-SHA certification.
These observations are design findings, not observed runtime negatives or completed fixes.

Fresh lifecycle-amendment checks on 2026-10-07 used the recorded commands: strict OpenSpec
1/1 with zero issues; all-item OpenSpec 143/143 (125 changes, 18 specs); explicit-path Prettier
passed; `git diff --check` exited 0. Read-only inspection confirmed 301 intent words, four
resolving local links, 13 requirements, 43 scenarios and 17 uniquely numbered ordered tasks.
The mounted tests below remain NOT RUN.

## Task completion and delta sync

All tasks remain unchecked and block archive. The new `automatic-trusted-activation`
capability is pending implementation and sync. No existing spec is marked fulfilled.
WBS 030.6 remains unresolved until task 5.3's real unattended proof and task 5.4 reconciliation.

## R5 failure-proof matrix

Every row below describes full-family acceptance. NOT RUN means that family has not completed;
partial local trials, where present, are recorded after the matrix.
Implementation must split grouped faults into independently watched trials, name the concrete
production file/line, retain RED assertion and restored GREEN, and add adjacent Proof comments.
A mutation failing setup, syntax, typechecking or another unrelated guard is disqualified;
adjust the witness until the intended assertion observes the removed protection.

| ID  | Safety boundary                   | Planned injected fault                                                                                                                                           | Planned observing test                                                                                                                                                                                                                     | Observed result |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| F1  | Bootstrap and trusted-state reads | Default absent/unreadable/malformed state or missing authority to usable                                                                                         | bootstrap refuses unavailable authority; unreadable state never becomes absent                                                                                                                                                             | NOT RUN         |
| F2  | Independent provenance            | Accept local-cooperative relabel, nonexistent journal invocation or wrong issuer                                                                                 | installed reviewer proves the exact invocation                                                                                                                                                                                             | NOT RUN         |
| F3  | Exact request identity            | Omit repository/typed-subject/target-ref/head/base/policy/mapping/toolkit/generation joins; default old schema; ignore ordered group members                     | same commits do not alias different PR subjects; PR and protected revision cannot share approval; retargeting the same base changes admission; ordered group members bind the request; old request schema cannot acquire default authority | NOT RUN         |
| F4  | Complete review                   | Accept wrong executor/obligation, missing/reordered phase, reads, raw response, telemetry or unresolved finding                                                  | installed reviewer proves the exact invocation                                                                                                                                                                                             | NOT RUN         |
| F5  | Required checks                   | Suppress failed exit and skip refusals separately                                                                                                                | installed checks preserve failed and skipped outcomes                                                                                                                                                                                      | NOT RUN         |
| F6  | Worker isolation                  | Expose harmless publisher sentinel or journal write capability                                                                                                   | candidate cannot read publisher or mutate journal                                                                                                                                                                                          | NOT RUN         |
| F7  | Archive trust and containment     | Remove issuer/digest/role/runtime/path join separately; substitute candidate URL                                                                                 | prepared candidate passes production admission; required workflow rejects unbound green status                                                                                                                                             | NOT RUN         |
| F8  | Immutable publication             | Permit conflicting occupied key or trust unverified existing bytes                                                                                               | lost publish response resumes exact bytes                                                                                                                                                                                                  | NOT RUN         |
| F9  | Required workflow authority       | Trust forged status or skip required workflow's artifact verification                                                                                            | required workflow rejects unbound green status                                                                                                                                                                                             | NOT RUN         |
| F10 | Durable effect recovery           | Remove stage/version fencing, delivery payload conflict refusal, subject-scoped supersession, authoritative reconciliation or A → B → A generation advancement   | webhook and polling converge on one request; conflicting delivery reuse is refused; delayed events cannot supersede another subject; returning candidate never revives its old worker; lost publish response resumes exact bytes           | NOT RUN         |
| F11 | Lease and retry bounds            | Allow obsolete worker; disable attempt/time bound separately                                                                                                     | expired worker is fenced; retry exhaustion stays failed                                                                                                                                                                                    | NOT RUN         |
| F12 | Protected current merge           | Remove head/base/target/subject checks; omit subject at receipt, descriptor, admission or merge boundary; ignore qualified group identity or ordered composition | head and base races refuse stale merge; merge-group recomposition requires new evidence                                                                                                                                                    | NOT RUN         |
| F13 | Actual merged commit              | Reuse head/group/ancestor/equal-tree certificate; weaken sole-parent refusal                                                                                     | merged revision cannot borrow PR certificate                                                                                                                                                                                               | NOT RUN         |
| F14 | Host and retention                | Accept missing/unreadable/corrupt host bytes or delete referenced evidence early                                                                                 | host consumes CI archive; live admission prevents early deletion                                                                                                                                                                           | NOT RUN         |
| F15 | Bootstrap transition              | Admit partial variable tuple or incompatible workflow/trust transition                                                                                           | bootstrap transition never admits partial variables                                                                                                                                                                                        | NOT RUN         |
| F16 | Completion evidence               | Accept simulated provider, missing merged/host proof or stale WBS revision                                                                                       | closure requires complete current evidence                                                                                                                                                                                                 | NOT RUN         |

### Lifecycle-specific trials within F3–F14

Each subrow is an independently watched production-path trial, not a substitute for the family
rows above. No runtime or external-effect proof was executed for this documentation amendment.

| Family  | Planned fault                                                                                                                        | Planned observing test                                                                                                                                         | Observed result |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| F3      | Use bootstrap authority generation as current subject audit generation; omit independent authority pin validation                    | current request separates authority and audit generation                                                                                                       | NOT RUN         |
| F4/F5   | Omit check or audit obligation; accept foreign receipt; replace failed attempt; split receipt/join transaction                       | checks and audit complete in either order; incomplete receipt set cannot verify; attempt evidence cannot be replaced                                           | NOT RUN         |
| F8/F10  | Dispatch without reservation; accept another payload/target acknowledgement; split acknowledgement/stage commit                      | unreserved effect cannot dispatch; foreign acknowledgement cannot advance stage; lost publish response resumes exact bytes                                     | NOT RUN         |
| F9      | Treat posted controller status as sufficient required-workflow success                                                               | required workflow rejects unbound green status                                                                                                                 | NOT RUN         |
| F10     | Reset high-water on close; accept an old asynchronous source response; use a stale global dispatch version for parallel completion   | close and reopen retain generation history; older source response refetches after subject advancement; checks and audit complete in either order               | NOT RUN         |
| F11     | Omit new-dispatch fence at publisher or permit obsolete acknowledgement to grant current authority                                   | in-flight completion after takeover cannot grant admission                                                                                                     | NOT RUN         |
| F12     | Route a merge group into ordinary PR merge; resend merge blindly after response loss                                                 | merge group admission never invokes ordinary PR merge; merge acknowledgement and revision request commit together                                              | NOT RUN         |
| F10/F13 | Split actual merge acknowledgement from child request creation; substitute linked SHA; recursively merge child; release branch early | merge acknowledgement and revision request commit together; protected revision never recursively merges; branch waits for actual merged revision certification | NOT RUN         |
| F14     | Mark host-ready without exact child archive/revision acknowledgement                                                                 | host-ready requires exact acknowledgement                                                                                                                      | NOT RUN         |

## Installed acceptance and authority prerequisites

Unverified: concrete independent provider, authenticated journal, issuer/store, control runtime,
short-lived credentials, exact App permissions, administrative bootstrap access, resource and
retention budgets. The design does not claim these exist or request disclosure of secret bytes.

After provisioning, retain exact request identities, external invocation/journal verification,
immutable archive descriptor, required workflow run URL/ID and SHA, actual merge SHA,
merged-activation identity, host digest/revision proof and evidence of no per-PR human steps.
Exercise two concurrent candidates and a crash after publication. Failing/degraded evidence
must remain visibly failed and must not authorize bypass.

## Full gate and completion limits

### Local partial implementation checkpoint (2026-10-07)

This checkpoint is repo-side only and does not satisfy any complete task box or the
full-family F1–F16 matrix. The new controller is not wired to an authenticated external
provider, journal, publisher, required workflow, merge or host. Local options and SQLite
fixtures are deliberately not represented as independent provenance. Tasks 1.1, 1.2 and
2.4 remain open: receipt joins, effect outbox/remote acknowledgements, provider authority,
activation and later stages are absent. There was no push, variable write or activation.

The mounted local command after formatting was:

```sh
bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/bootstrap.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/request.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/ingress.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/controller.db.test.ts
```

The final four-file run passed 29/29 tests and 152 assertions, exit 0. Direct
`bunx tsc --noEmit --project apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`
exited 0. Scoped ESLint exited 0, but its `@nx/enforce-module-boundaries` rule
reported no cached ProjectGraph and skipped; the declared Nx source-lint target is
still required. Changed-path Prettier `--write` exited 0 before those test/type outputs.

Accepted local RED/restored GREEN faults, each against the named controller or request
test and with an adjacent source `Proof:` comment:

| Boundary                      | Injected fault and observed RED                                                                                                                                                                                                                            | Restored GREEN   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Canonical authority           | Removed `requireCurrentRequest` authority-identity comparison; `request binds repository head base and trust` accepted the wrong pin, 0/1 (`/tmp/activation-authority-guard-red.log`).                                                                     | Four-file 29/29. |
| Subject generation read       | Allocated from active row only; close/reopen hit duplicate request PK, 0/1 (`/tmp/activation-high-water-red.log`).                                                                                                                                         | Four-file 29/29. |
| Subject generation write      | Omitted durable high-water upsert; restart/close/reopen hit duplicate request PK, 0/1 (`/tmp/activation-high-water-write-red.log`).                                                                                                                        | Four-file 29/29. |
| Source observation version    | Bypassed post-await version comparison; delayed A overwrote newer B and exact identity assertion failed, 0/1 (`/tmp/activation-stale-observation-red.log`).                                                                                                | Four-file 29/29. |
| Timer source authority        | Used timer-listed stale A directly; expected current head `666…` but persisted `111…`, 0/1 (`/tmp/activation-stale-poll-red.log`).                                                                                                                         | Four-file 29/29. |
| First close tombstone         | Suppressed the no-active closed upsert; an older held ready response then created A after close, 0/1 (`/tmp/activation-closed-tombstone-red.log`).                                                                                                         | Four-file 29/29. |
| Lost close polling            | Omitted durable active subjects from the timer union; a lost close left `current=true`, 0/1 (`/tmp/activation-lost-close-poll-red.log`).                                                                                                                   | Four-file 29/29. |
| Evaluation plan join          | Removed request/policy binding together, then separately removed each comparison; foreign obligations advanced the request instead of refusing, each 0/1 (`/tmp/activation-evaluation-plan-binding-red.log`, `...-request-red.log`, `...-policy-red.log`). | Four-file 29/29. |
| Required obligations          | Independently omitted check and audit kind checks; incomplete plans advanced, each 0/1 (`/tmp/activation-evaluation-check-red.log`, `...-audit-red.log`).                                                                                                  | Four-file 29/29. |
| Duplicate obligation boundary | Omitted duplicate guard; exact modeled refusal became raw SQLite UNIQUE error, 0/1 (`/tmp/activation-evaluation-duplicate-red-try2.log`).                                                                                                                  | Four-file 29/29. |
| Atomic freeze                 | Split COMMIT after first check INSERT; second audit INSERT failure left a durable check row, violating empty-row assertion, 0/1 (`/tmp/activation-evaluation-split-commit-red.log`).                                                                       | Four-file 29/29. |

Additional exact 1.1/controller boundary omissions were watched independently on the
production reader/current-request methods: malformed pin
`/tmp/activation-bootstrap-malformed-pin-red.log` (named pin refusal became digest
mismatch); protected subject/ref `/tmp/activation-protected-target-red.log`;
stored-request digest `/tmp/activation-request-digest-red.log`; canonical bytes
`/tmp/activation-request-canonical-red.log`; current target and subject
`/tmp/activation-current-target-red.log` and `/tmp/activation-current-subject-red.log`.
Each exited 1 at its intended mounted assertion; restored source passed the final
four-file suite. The previous bootstrap absent/unreadable/schema/canonical/digest and
journal/publisher issuer faults are retained in
`/tmp/automatic-activation-1.1-bootstrap-*-red.log`; each source guard has an adjacent
Proof comment. Version-1 store admission, delivery payload conflict and delivery subject
join omissions were watched in `/tmp/activation-old-schema-red.log`,
`/tmp/activation-delivery-digest-red.log` and `/tmp/activation-delivery-subject-red.log`;
each exited 1 at the named controller test assertion and was restored.

The earlier duplicate-guard trial (`/tmp/activation-evaluation-duplicate-red.log`)
stayed GREEN because the SQLite primary key still refused a duplicate. It is
disqualified; the accepted try2 asserts the typed boundary error. A malformed
first fixture path that produced ENOTDIR instead of the intended absent case is
also disqualified. The local high-water row deletion, later audit-generation,
subject A→B→A and second-insert rollback fixtures each passed after correction.

Declared Nx `twilight-burokrat:lint:source` and `:typecheck` printed success summaries,
exit 0. The first declared build failed R19 because this worktree lacked its local
`node_modules/typescript`. A frozen Bun install initially failed EROFS in its default
temporary directory; with task-specific writable `/tmp` temp/cache it passed
`Checked 1602 installs across 1447 packages (no changes)`. The subsequent
declared `twilight-burokrat:build` printed its success summary, exit 0. All three
declared targets were rerun on corrected source/test bytes with explicit success.
Pinned OpenSpec strict passed 1/1 and all passed 143/143 (125 changes, 18 specs),
and changed-path Prettier check passed. The Nx commands fell back to in-process
plugins after a sandbox socket warning; their explicit task summaries, not a bare
exit, are the evidence. Final diff, hooks, host gate and CI remain unrecorded at
this checkpoint. This does not authorize publication or task closure.

For the earlier docs-only design amendments, runtime tests and lint/typecheck/build were
not run; the partial implementation checks above are separate. Still not run:
`bin/h2puni-gate.sh <sha>`, full Nx format, live provider/check/merge/host acceptance,
secrets/migration CI checks. No full-gate pass or implementation completion is claimed.
Before implementation completion, run the canonical host gate and retain the printed
`h2puni gate: running on <sha>` plus actual format/test/lint/typecheck/build and OpenSpec
outputs. Do not invoke raw full Nx gates on h2puni.

No remote publication, permission/secret/variable change, release or activation was attempted.

### Local source-order and worker-fence correction (2026-10-07)

Independent review of the preceding checkpoint found that an accepted unchanged-ready
observation and a repeated closed observation did not advance the subject observation
version. A held older source answer could therefore overwrite the newer source answer.
Both mounted two-owner tests failed on that exact request/closed assertion before the
fix. Independent omission runs after the correction reproduced the same failures:
`/tmp/activation-r5-unchanged-ready-fence-red.log` and
`/tmp/activation-r5-repeated-closed-fence-red.log`, each 0/1 at the persisted
request/closed assertion. Restored tests passed 2/2, 9 assertions. The version now advances
for every accepted authoritative observation, while unchanged request identity and
audit generation remain unchanged. This correction remains local and partial.

The same review found missing watched proof for worker-claim/evaluation fences.
Each row below removes only the named production condition, runs the named mounted
controller test, restores the source hash, and reruns GREEN. The claim tests compare
projected request state before/after the refusal; evaluation tests additionally compare
the obligation projections. These assertions do not claim a full raw-row comparison.

| Fence              | Accepted omission RED (each 0/1)                                                                       | Restored witness                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Claim current      | `/tmp/activation-r5-claim-current-red.log`: superseded refusal became stage refusal                    | `claim refuses a superseded request`                                          |
| Claim stage        | `/tmp/activation-r5-claim-stage-red.log`: evaluating request gained another lease                      | `claim refuses an evaluating request`                                         |
| Claim active lease | `/tmp/activation-r5-claim-lease-held-red.log`: second worker gained unexpired lease                    | `claim refuses another worker`                                                |
| Evaluation current | `/tmp/activation-r5-begin-current-red.log`: superseded refusal became lease refusal                    | `evaluation refuses superseded current`                                       |
| Evaluation stage   | `/tmp/activation-r5-begin-stage-red.log`: stage refusal became obligation primary-key error            | `evaluation refuses its already evaluating stage`                             |
| Epoch              | `/tmp/activation-r5-begin-epoch-red.log`: predecessor epoch advanced with current owner/version        | `evaluation fences an old epoch`                                              |
| Owner              | `/tmp/activation-r5-begin-owner-red.log`: wrong owner advanced with current epoch/version              | `evaluation fences a wrong owner`                                             |
| Version            | `/tmp/activation-r5-begin-version-red.log`: wrong version advanced with current epoch/owner            | `evaluation fences a wrong version`                                           |
| Expiry             | `/tmp/activation-r5-begin-expiry-red.log`: lease advanced at exact expiry                              | `evaluation fences a lease at its exact expiry`                               |
| Null expiry        | `/tmp/activation-r5-begin-null-expiry-red.log`: missing persisted expiry advanced                      | `evaluation fences a missing persisted lease expiry`                          |
| Authority          | `/tmp/activation-r5-begin-authority-red.log`: old request evaluated under another valid bootstrap pin  | `evaluation refuses a current lease under a different valid pinned authority` |
| Bootstrap reread   | `/tmp/activation-r5-begin-bootstrap-reread-red.log`: disappeared pin file no longer refused evaluation | `evaluation rereads the pinned bootstrap`                                     |

The first null-expiry omission trial stayed GREEN because JavaScript compared `null <= now`
as true. It is disqualified. The expiry predicate was made explicit and the repeated
single-condition omission then advanced the malformed lease as shown above. Claim/evaluation
current and evaluation stage omissions changed the typed refusal without granting authority;
they prove refusal specificity, not successful advancement. The exact four-file Bun
command above on corrected bytes passed 43/43 tests and 194 assertions, exit 0
(`/tmp/activation-1.2-correction-four-green.log`). Declared
`twilight-burokrat:lint:source`, `:typecheck` and `:build` each printed Nx's
explicit success summary and exited 0. Initial lint failed at a redundant null
conditional after the expiry correction; direct ESLint identified the rule, and
the final explicit expiry helper passed the declared target. Nx used its in-process
plugin fallback after the sandbox denied its socket. Tasks 1.1/1.2 and all
external-provider acceptance remain open.

### Local 2.4 evidence-join checkpoint (2026-10-07)

This is a repo-side controller contract exercised with a fake verifier. It does not
authenticate a real journal, prove independent execution, dispatch a check/audit, or
unblock 030.6. Task 2.4 remains unchecked pending installed provider/attempt recovery
acceptance. On corrected source, the following command passed 73/73 tests,
329 assertions, exit 0 (`/tmp/activation-24-four-green.log`):

```sh
bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/bootstrap.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/request.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/ingress.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/controller.db.test.ts
```

The controller now stores exact authenticated receipt bytes and immutable per-obligation
attempts in schema v3 (with explicit v2 migration), retains failed/skipped evidence,
and joins only the frozen check/audit plan before a deterministic selected-set identity
and verified transition. The verifier returns bindings after authenticating bytes outside
the SQLite writer; the writer rechecks current request/generation, pinned authority,
issuer, obligation/attempt, evaluating stage and lease. Independent check/audit completions
do not compare a stale global request version. All receipt, selection and request writes
share one transaction. Identical receipt replay is idempotent; conflicting bytes refuse.

Accepted named RED/restored GREEN faults against the mounted controller test path:

| Boundary             | Watched omission RED logs and assertion                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Exact bytes/provider | `/tmp/activation-24-empty-bytes-red.log`, `missing-verifier-red.log`, `digest-red.log`: lost named refusal or accepted altered digest.                                                                                                                                                                                                                                                     |
| Trusted request      | `/tmp/activation-24-current-red.log`, `generation-red.log`, `authority-red.log`, `pin-reread-red.log`, `issuer-red.log`, `request-red.log`: foreign/stale authority reached a later refusal or was accepted.                                                                                                                                                                               |
| Frozen obligation    | `/tmp/activation-24-obligation-red.log`, `kind-red.log`, `executor-red.log`, `protocol-red.log`, `command-red.log`, `phase-red.log`, `attempt-red.log`, `nonpending-red.log`, `frozen-plan-red.log`: wrong/missing obligation binding or incomplete frozen set lost its named refusal. The frozen-plan baseline itself first failed because a deleted audit row let the sole check verify. |
| Lifecycle/lease      | `/tmp/activation-24-receipt-stage-red.log`, `receipt-epoch-red.log`, `receipt-owner-red.log`, `receipt-null-expiry-red.log`, `receipt-expiry-red.log`: failed/stale/malformed completion lost its refusal. Epoch alteration is a staged durable recovery transition; the recovery owner is not installed.                                                                                  |
| Whole evidence join  | `/tmp/activation-24-incomplete-red.log`, `failed-red.log`, `cold-red.log`, `obligation-record-red.log`, `selected-set-red.log`, `immutable-red-try2.log`: early verified/failed reset, informed-before-cold, omitted recording, wrong set identity or conflicting replay reached an exact assertion.                                                                                       |
| Atomicity/schema     | `/tmp/activation-24-split-commit-red.log` reached a full row-snapshot mismatch after second-receipt failure; `/tmp/activation-24-update-cas-red.log` returned success after an ignored verified update; `/tmp/activation-24-v2-migration-red.log` lost persisted v2 evaluation on reopen.                                                                                                  |

Each accepted fault exited 1 in the named mounted test; the v2 migration omission
failed when the reopened owner lacked its attempt storage, while the other accepted
faults reached their specified refusal, selected-state or snapshot assertions.
Source was restored before the 73/329 GREEN run. The first immutable-guard trial
(`/tmp/activation-24-immutable-red.log`) stayed GREEN because the remaining byte and
authentication comparisons still refused the conflict. It is disqualified; the accepted
try2 omitted the complete conflict predicate. A first test attempt used the existing
`claim` API to simulate takeover of an evaluating request; that API rightly refused
the stage. The corrected lease-epoch test stages only the future recovery transition
in SQLite and does not count as installed recovery-owner proof. Other negative tests
exercise missing/failed/skipped evidence, cold/informed order, held-verifier supersession,
parallel completion, same-byte replay and full rollback. The host gate and CI
remain unverified.

For this checkpoint the declared `twilight-burokrat:lint:source`, `:typecheck`
and `:build` targets each printed explicit Nx success summaries on corrected bytes.
The first typecheck found a test fake-verifier callback that returned an object where
the port requires a Promise; after the test-only correction, typecheck and build
were rerun successfully. Nx used its in-process plugin fallback after the sandbox
denied its socket. The provider/issuer, isolated worker, immutable publisher,
required workflow, merge and host acceptance are not installed here. No task box
or WBS status is advanced by this local fake-verifier checkpoint.

The pinned `@fission-ai/openspec@1.12.0` strict validation passed 1/1 and
`validate --all --json` passed 143/143 (125 changes, 18 specs). Changed-path
Prettier and `git diff --check` passed after formatting this ledger.

### 2.4 selected-evidence review correction (2026-10-07)

Independent exact-SHA review of `94b1d9a491f2abaea24a29c64fb5bee93021a19c`
found that deleting the earlier check's immutable attempt still let a later audit
verify. A separate review found the check/audit persisted-shape guards lacked
watched omissions. The mounted regression first failed 0/2 because both absent
attempt evidence and conflicting retained authentication bytes were accepted
(`/tmp/activation-24-selected-attempt-baseline-red.log`). The owner now joins
every selected passed obligation to its retained attempt, exact receipt bytes and
authenticated frozen bindings before it can verify. After that correction the
two cases passed 2/2; the exact four-file command above passed 77/77,
341 assertions, exit 0 on final formatted bytes
(`/tmp/activation-24-review-correction-four-final.log`).

Three independent restored-source omissions reached the exact mounted refusal
assertions: skipping the selected-attempt join accepted both missing and corrupt
evidence (0/2, `/tmp/activation-24-selected-attempt-join-red.log`); skipping the
check-row phase guard accepted a check with an audit phase (0/1,
`/tmp/activation-24-check-shape-guard-red.log`); skipping the audit-row command
guard accepted an audit with a check command (0/1,
`/tmp/activation-24-audit-shape-guard-red.log`). Each returned to the same
restored focused GREEN (5/5, 15 assertions,
`/tmp/activation-24-join-correction-green.log`). These extra columns matter:
reconstruction omits the irrelevant cross-kind field, so parsing the projected
obligation alone would not reject the malformed stored row. The transaction
rollback tests compare the complete stored request, obligations and attempts
before and after each refusal. No external provenance or provider acceptance is
claimed; task 2.4 remains open.

Exact-SHA review of the correction found the initial corrupt-authentication test
used schema-invalid `{ forged: true }`, which the parser refused before reaching
the exact-binding predicate. That trial is not evidence for the predicate. The
corrected test retains schema-valid authentication with only the prior check's
executor changed. Removing only `authenticated.executorId !== entry.executor_id`
made the real audit verification succeed, failing the intended refusal 0/1
(`/tmp/activation-24-valid-binding-executor-red.log`); restored source passed
the focused join cases 6/6, 18 assertions
(`/tmp/activation-24-valid-binding-green.log`). A separate test retains the
malformed-authentication parser refusal. The final four-file command above passed
78/78, 344 assertions, exit 0 on corrected bytes
(`/tmp/activation-24-binding-four-final.log`).

### Review pairing design amendment (2026-10-07)

The bounded 2.1 design review found that phase-only frozen obligations do not identify
which cold completion an informed review may use. The amendment freezes stable `reviewId`
on the selected cold/informed pair and keeps actual `invocationId` in immutable shared-attempt
registration/evidence. It adds no runtime code, installed provider or execution claim.
The internal verifier contract reuses existing review/phase evidence without relabeling
local-cooperative journal validation as external provenance. Historical evidence remains
historical; missing legacy pairing cannot acquire defaults.

| Planned proof                 | Required watched fault and observable failure                                                                                                                             | Status  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Pair and phase                | Omit pair/cardinality or authenticated-phase binding; a duplicate/missing partner, relabeled phase or another review's cold completion is accepted                        | NOT RUN |
| Registered invocation         | Omit request/review/attempt/invocation or immutable-registration join; an unregistered or conflicting execution reaches receipt acceptance                                | NOT RUN |
| Retry identity                | Reset the selected plan or reuse prior cold evidence for a new invocation; exact frozen-plan/prior-evidence or refusal assertion fails                                    | NOT RUN |
| Retained protocol evidence    | Omit cold-artifact, issuer/executor/protocol/prompt, retained response/read/telemetry or finding checks independently; incomplete/mismatched evidence advances            | NOT RUN |
| Post-await ownership          | Omit own registration/attempt fence after held authentication; stale completion writes, while an unrelated completion remains a required positive witness                 | NOT RUN |
| Atomic informed completion    | Split new receipt insertion from later join and inject transition failure; full affected-row snapshot retains partial new evidence instead of only earlier cold evidence  | NOT RUN |
| Legacy refusal                | Infer pairing/invocation from old rows; unpaired legacy state becomes eligible instead of refusing without historical writes                                              | NOT RUN |
| Versioned legacy preservation | Permit v2/v3 evaluating/verified history to resume, rewrite its frozen plan, or split migration schema/version writes; refusal or complete old-version/row snapshot fails | NOT RUN |

Each new safety guard needs an adjacent Proof naming its own observed production-path fault.
Malformed parser input alone cannot prove a later binding comparison; use schema-valid
mismatches to reach that comparison. Local fake-verifier proofs do not close installed 2.1,
2.2, 2.4, bootstrap or unattended 030.6 acceptance. All task boxes remain open.

Fresh docs-only checks on 2026-10-07:

| Command                                                                                  | Observed result                                                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `bunx @fission-ai/openspec@1.12.0 validate automatic-trusted-activation --strict --json` | 1/1 valid, zero issues; `/tmp/activation-pairing-strict.json`            |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                 | 143/143 valid: 125 changes, 18 specs; `/tmp/activation-pairing-all.json` |

Changed-path Prettier passed (`/tmp/activation-pairing-format.log`) and `git diff --check`
exited 0. Normal commit hooks remain required for the local commit.
No runtime tests/mutations, provider authentication, host gate, CI or publication were run
for this docs-only amendment. The proof rows above are requirements, not inherited runtime
acceptance from the implementation branch.

### 2.1 paired-plan and invocation-registration foundation (2026-10-07)

This local slice adds v4 storage for an immutable review pair and its selected
invocation registration. It does not implement the external verifier, dispatch,
recovery, or admission; task 2.1 remains open. Fresh v4 requests freeze exactly
one cold and one informed obligation per `reviewId`. Old v2/v3 rows migrate as
readable `pairing_version=0` history and refuse receipt continuation. A new
authoritative observation replans into a new audit generation rather than
inventing a legacy pair. A failed v3 pairing migration retained the complete
prior schema, user version and request rows.

| Mounted boundary and injected fault                                                                            | Observed RED and restored GREEN                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing informed or duplicated cold phase: omit the corresponding `beginEvaluation` pair check                 | Evaluation froze an incomplete/ambiguous plan, 0/1 each (`/tmp/activation-21-pair-omission-red.log`, `/tmp/activation-21-duplicate-pair-omission-red.log`); restored selected-pair tests passed.                                                                                                                                                                                                            |
| Registration conflicts and reserved attempt: omit the existing-invocation comparison or the attempt comparison | Conflicting invocation returned as if registered, 0/1 (`/tmp/activation-21-registration-conflict-omission-red.log`); unreserved attempt 1 registered, 0/1 (`/tmp/activation-21-registration-attempt-omission-red.log`); restored registration case passed 1/1, 5 assertions.                                                                                                                                |
| Cross-review invocation reuse: omit named guard                                                                | SQLite UNIQUE still refused the write, but the modeled `review invocation already registered` refusal became an unmodeled constraint error, 0/1 (`/tmp/activation-21-cross-register-omission-red.log`). This proves error specificity, not that the guard alone prevents reuse.                                                                                                                             |
| Registration current, stage, epoch, authority: omit one check at a time                                        | Each injected fault registered an invocation in the named stale state, 0/1 each (`/tmp/activation-21-register-{current,stage,lease,authority}-omission-red.log`); restored three-state tests passed 3/3 and valid-alternate-authority test 1/1. The current fixture keeps the old row's stage at evaluating after supersession to isolate that guard.                                                       |
| Unregistered receipt, wrong review, wrong invocation: omit each `recordReceipt` join/comparison independently  | Each receipt was fulfilled instead of rejected, 0/1 (`/tmp/activation-21-registration-omission-red.log`, `/tmp/activation-21-review-binding-omission-red.log`, `/tmp/activation-21-invocation-binding-omission-red.log`); restored receipt cases passed. The wrong-review fixture registers both pairs, so the omitted comparison reaches acceptance rather than merely another missing-registration error. |
| Informed receipt borrows another review's cold: broaden the cold query                                         | The second review's informed receipt was accepted before its cold phase, 0/1 (`/tmp/activation-21-cold-scope-omission-red.log`); restored test passed 1/1. An earlier broad text replacement failed on SQL argument count and was disqualified; it is not safety evidence.                                                                                                                                  |
| Legacy receipt: omit the explicit `pairing_version` refusal                                                    | v2/v3 tests lost the named refusal and failed later malformed-plan validation, 0/2 (`/tmp/activation-21-legacy-receipt-omission-red.log`). This proves the explicit boundary/error, not that parser fallback would grant legacy authority. Restored tests passed 2/2, 8 assertions.                                                                                                                         |

The additional legacy entry-point watch independently removed the claim,
evaluation and registration pairing guards. Each mounted test then acquired a
lease, froze obligations or registered an invocation on a persisted unpaired
row, 0/1 each (`/tmp/activation-21-legacy-{claim,evaluation,register}-omission-red.log`);
the same three tests passed with restored source. These fixtures mark only the
persisted pairing version to isolate each controller entry point.

The first unregistered-receipt baseline failed because it was accepted before
the new owner (`/tmp/activation-21-unregistered-red.log`); the first cross-review
cold fixture likewise failed at acceptance
(`/tmp/activation-21-cross-review-cold-red.log`). Both were restored green.
The focused controller suite before final formatting passed 78/78, 307 assertions
(`/tmp/activation-21-foundation-current-all.log`). Final formatted-byte checks
are recorded below. All receipt authentication here is injected fake evidence,
not independent external provenance.

Final-byte command and results for this bounded foundation:

```sh
bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/bootstrap.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/request.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/ingress.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/controller.db.test.ts
```

The command passed 95/95 tests, 390 assertions, exit 0
(`/tmp/activation-21-foundation-four-final.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck`, and `:build` each printed
`Successfully ran target` with exit 0 on corrected source/test bytes
(`/tmp/activation-21-foundation-{lint,type,build}-unsandboxed.log`). An earlier
sandboxed Nx exit 0 printed only worker-socket denial and no task-success
summary, so it was unverified. The first authoritative lint failed on a test's
numeric union inside a template literal; explicit version-2/version-3 pragma
strings fixed that test-only diagnostic before the successful lint rerun.
Pinned OpenSpec strict validation passed 1/1 and all validation passed
143/143, both exit 0 (`/tmp/activation-21-foundation-openspec-{strict,all}.json`).
Three-path Prettier check and `git diff --check` each exited 0 after the final
test formatting (`/tmp/activation-21-foundation-format-check.log`). The
four-file and three Nx targets above were rerun on those final source/test bytes.
Normal commit hooks, independent review, live provider acceptance, CI and host
gate remain separate.

### 2.1 foundation review correction (2026-10-07)

Independent exact-SHA review of `b1b8eacdedefd28d3ced5576313cddba9bdbc60d`
found two real gaps. A schema-valid retained cold authentication could change its
`reviewId` and `invocationId` and still let the later receipt verify. The new
mounted case first failed because the call fulfilled
(`/tmp/activation-21-retained-pair-baseline-red.log`). The selected-evidence
join now resolves each passed audit to the retained review registration and
compares both authenticated fields to the frozen row/registered invocation.
Independent omissions of retained review, retained invocation and registration
join each made the corresponding public `recordReceipt` refusal fail 0/1
(`/tmp/activation-21-retained-{review,invocation,registration}-omission-red.log`);
the three restored cases passed 3/3, 9 assertions
(`/tmp/activation-21-retained-pair-green.log`). The missing-registration test
submits a check after removing the previously completed cold's registration, so
it reaches the selected-evidence join and the attempted check write rolls back.

A late v4 failure after v2-to-v3 migration previously left an intermediate v3
schema (`/tmp/activation-21-late-migration-baseline-red.log`). The upgrade from
the observed starting v2 or v3 version now runs in one SQLite transaction. For
both versions, a controlled final-table conflict after earlier schema writes
left the complete original schema, `user_version` and request rows equal to the
pre-attempt snapshot, 2/2, 6 assertions
(`/tmp/activation-21-late-migration-green.log`). Independent watched faults
split the transaction after v2 attempt-table creation or after v3's first
pairing column; each failed the full schema equality with committed residue,
0/1 (`/tmp/activation-21-migration-split-{v2,v3}-red.log`). The earlier v3
fixture that failed at its first `ALTER` was insufficient and is superseded by
these late-failure witnesses.

Further independent R5 watches at the public controller boundary covered
registration owner, exact expiry, null expiry and pinned bootstrap reread.
Each omission registered an invocation when it should have refused, 0/1
(`/tmp/activation-21-register-{owner,expiry,null-expiry,bootstrap}-omission-red.log`);
restored cases passed 4/4, 8 assertions. Removing only the cold-attempt
predicate admitted informed evidence using a passed cold from another attempt,
0/1 (`/tmp/activation-21-cold-attempt-omission-red.log`), restored 1/1.
Removing the same-tuple legacy pairing check reused the unpaired request
identity instead of allocating a new audit generation, 0/1
(`/tmp/activation-21-legacy-replan-omission-red.log`), restored 1/1.

These are local fake-verifier and controlled historical/corruption fixtures.
They do not establish external journal provenance, dispatch recovery, or task
2.1 completion. The literal four-file Bun command in the foundation section
passed 105/105 tests, 418 assertions, exit 0 on corrected formatted bytes
(`/tmp/activation-21-correction-four-final.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck` and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-21-correction-{lint,type,build}.log`). Pinned OpenSpec
strict passed 1/1 and all passed 143/143, zero failures
(`/tmp/activation-21-correction-{strict,all}.json`); changed-path Prettier
and diff check passed. Normal hooks and independent exact-SHA review are still
required for this correction checkpoint.

### 2.1 local trusted-review consumption boundary (2026-10-07)

The public `recordReceipt(lease, obligationIdentity, submissionBytes)` now uses
the locator only to read the persisted frozen obligation. A check uses
`authenticateCheck`; an audit requires `verifyReview` and cannot fall back to
check authentication. A private post-await transaction rechecks current
request, authority, stage, lease, frozen obligation, selected review
registration and retained passed evidence before committing. The review port
returns one authenticated invocation/phase binding plus full `ReviewEvidence`,
cold and informed outputs, findings and disposition. Its exact submission and
source digests are checked, and the complete canonical source is retained in
the immutable attempt authentication bytes; a later selection revalidates it.
This is a local composition with a fake trusted port in tests, not installed
external verifier or independent provenance acceptance.

The first mounted RED was the prior generic audit route: with no review port,
an audit fulfilled through `authenticateReceipt`, 0/1
(`/tmp/activation-21-generic-audit-bypass-red.log`). Restored, the same public
case refuses before the generic/check callback, 1/1, 4 assertions. All 57
direct controller test submissions migrated to the single three-argument
public API; no old public authenticated-audit method remains. The full
controller DB suite on these bytes passed 111/111, 407 assertions, exit 0 with
`bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/controller.db.test.ts`
(`/tmp/activation-21-full-aggregate.log`).

| Watched production dependency                                              | Observed RED and restored behavior                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen expected binding / phase                                            | Omitting canonical expected-binding comparison let cold relabel an informed receipt; public test failed rejected-vs-fulfilled 0/1 (`/tmp/activation-21-final-r5-binding-red.log`); restored mounted rejection passed.                                                                                                                                                                                                                                    |
| Exact submission digest                                                    | Omitting its comparison accepted unrelated submission bytes, 0/1 (`/tmp/activation-21-final-r5-submission-red.log`); restored rejection passed.                                                                                                                                                                                                                                                                                                          |
| External journal identity, scope, cold artifact, and nonempty raw response | Each condition was independently removed while its installed malformed-source case was run; each became fulfilled rather than rejected, 0/1 (`/tmp/activation-21-final-r5-{journal,local_scope,cold_artifact,missing_raw}-red.log`); restored cases passed. A foreign pinned journal issuer independently refused at the expected-binding check.                                                                                                         |
| Phase-to-review source aggregation and unresolved findings                 | Omitting the source aggregate admitted a review receipt with no retained reads, 0/1 (`/tmp/activation-21-final-r5-source-aggregate-red.log`); omitting the passed-finding condition admitted unresolved findings as passed, 0/1 (`/tmp/activation-21-final-r5-findings-red.log`); restored cases passed.                                                                                                                                                 |
| Retained exact source after restart                                        | Changing a valid review receipt ID in the stored source was refused after restart. Omitting only the source-evidence digest let the corrupted source verify, 0/1 (`/tmp/activation-21-final-r5-source-digest-red.log`); restored case passed.                                                                                                                                                                                                            |
| Post-await registration                                                    | Holding review verification, completing an unrelated check, then moving the selected registration refused the audit with complete post-check rows unchanged. Omitting the direct invocation comparison changed the named refusal to a later selected-evidence refusal, 0/1 (`/tmp/activation-21-final-r5-registration-red.log`); it did not grant authority. The separate held authority-change case refused after the pin changed, with rows unchanged. |

Malformed and rejected trusted verifier responses each refused without
calling the check authenticator or writing evidence (2/2, 10 assertions,
`/tmp/activation-21-no-fallback.log`). An authenticated review with findings
and `failed` disposition persisted exact cold/informed source and marked the
request failed; a claimed `passed` review with those findings was refused.
The present complete-invocation adapter requires both phase outputs, so an
authenticated _early cold_ failed/skipped result without informed output is
not yet represented. This subacceptance, live provider transport, durable
dispatch/recovery and task 2.1 remain open.

On lint-corrected source/test bytes, declared Nx
`twilight-burokrat:lint:source`, `:typecheck`, and `:build` each exited 0 and
printed `Successfully ran target` respectively
(`/tmp/activation-21-adapter-{lint,type,build}-final.log`). The first lint run
failed on import order and two test-only async callbacks without awaits;
those exact diagnostics were fixed before the successful rerun. The literal
four-file Bun command from the foundation section then passed 121/121, 476
assertions, exit 0 (`/tmp/activation-21-adapter-four-commitable.log`). Pinned
OpenSpec strict passed 1/1 and all passed 143/143, zero failures
(`/tmp/activation-21-adapter-{strict,all}-commitable.json`); changed-path
Prettier and diff check exited 0. No host gate, CI, provider credential,
dispatch worker or remote publication was run for this local slice.

### 2.1 selected cold/informed cross-record correction (2026-10-07)

Independent review of `5a92756a053a18022c577b4efef24450596f064f`
found that an informed verifier could replace the already selected cold
judgment with another internally consistent cold judgment and artifact.
The first mounted test failed rejected-vs-fulfilled, 0/1
(`/tmp/activation-21-paired-cold-baseline-red.log`), matching the independent
reproduction `/tmp/activation-5a9275-astra-paired-cold.log`. The informed
receipt transaction now loads the exact passed cold obligation and immutable
attempt for the same request/review/attempt/registered invocation, validates
that retained source against the pinned expectation, and compares the
incoming complete cold output and artifact to those committed bytes. The
schema-valid alternate cold is refused with the full pre-attempt row snapshot
unchanged, 1/1, 4 assertions (`/tmp/activation-21-paired-cold-green.log`).
Independently removing only the persisted cold/source comparison made that
same case fulfill, 0/1 (`/tmp/activation-21-paired-cold-join-omission-red.log`);
the source SHA-256 restored to
`b6047946a7406f886803ce7618a03ee37b5933b1bd36f9477bf5a49ee87df088`.
Existing retained-cold foreign-review/invocation corruption cases now refuse
earlier at this new committed-source join; their unchanged-state assertions
remain in place. The literal four-file Bun command above passed 122/122, 480
assertions, exit 0 on correction bytes
(`/tmp/activation-21-paired-four-green.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck` and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-21-paired-{lint,type,build}.log`). Pinned OpenSpec strict
passed 1/1 and all passed 143/143, zero failures
(`/tmp/activation-21-paired-{strict,all}.json`); changed-path Prettier and
diff check exited 0. Real external provenance and early cold terminal
evidence remain open.

### 2.1 local authenticated early-cold terminal evidence (2026-10-07)

The existing complete-review source format remains unchanged. A distinct
trusted-port cold-only variant carries a real decoded cold output, a nonempty
terminal reason and `failed` or `skipped` status; its exact submission digest,
source digest, pinned issuer, request/review/obligation/attempt, registered
invocation, executor and protocol remain bound at the public `recordReceipt`
owner. The canonical terminal source is retained with the immutable attempt;
the informed obligation remains pending and the request becomes failed in the
same transaction. No informed output or complete ReviewEvidence is invented.
The initial mounted test was RED 0/2 at the full-review schema's missing
informed/evidence rejection (`/tmp/activation-early-cold-baseline-red.log`),
then GREEN 2/2 (`/tmp/activation-early-cold-first-green.log`). Restarted exact
replay preserves all rows; conflicting bytes refuse without writes
(`/tmp/activation-early-cold-replay.log`). A missing trusted review verifier
refuses without calling the generic check authenticator; a held verifier
refuses after either registration or pinned-bootstrap movement. These are
local fake-port boundary proofs, not external provider provenance.

| Watched production fault                                                     | RED on mounted test                                                                                                                                                                     | Restored GREEN                                                      |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Skip cold-only source-digest comparison                                      | Unbound source fulfilled instead of refusing, 0/1 (`/tmp/activation-early-cold-digest-red.log`).                                                                                        | 1/1 (`/tmp/activation-early-cold-digest-restored-green.log`).       |
| Omit nonempty cold raw-response guard while retaining schema-valid telemetry | Empty raw source fulfilled, 0/1 (`/tmp/activation-early-cold-raw-red.log`).                                                                                                             | 1/1 (`/tmp/activation-early-cold-raw-restored-green.log`).          |
| Widen terminal-only status to `passed`                                       | Relabeled cold terminal fulfilled, 0/1 (`/tmp/activation-early-cold-status-red.log`).                                                                                                   | 1/1 (`/tmp/activation-early-cold-status-restored-green.log`).       |
| Omit early cold-phase guard                                                  | Informed terminal still refused by the later transaction guard, but lost the named early refusal, 0/1 (`/tmp/activation-early-cold-phase-red.log`). This fault did not grant authority. | 1/1 (`/tmp/activation-early-cold-phase-restored-green.log`).        |
| Omit post-await registered invocation comparison                             | Held terminal accepted after registration replacement, 0/1 (`/tmp/activation-early-cold-registration-red.log`).                                                                         | 1/1 (`/tmp/activation-early-cold-registration-restored-green.log`). |
| Split transaction immediately after terminal attempt insert                  | Injected later failed-stage write left a durable attempt and failed the full row snapshot, 0/1 (`/tmp/activation-early-cold-split-red.log`).                                            | 1/1 (`/tmp/activation-early-cold-split-restored-green.log`).        |

Every source mutation above was restored to SHA-256
`a7a82b4765fa24f54ec6b6c685b157c1ba0124df776fc14bcd1a80abe0b737e3`
before the next watch. The mounted cold-only matrix passed 12/12, 42
assertions with
`bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/controller.db.test.ts --test-name-pattern 'cold terminal|cold-only terminal|authenticated cold-only'`
(`/tmp/activation-early-cold-final-focused.log`); the final-byte suite and static
checks are recorded below. Task 2.1 stays open because no installed external
verifier, durable dispatch/recovery, or host acceptance was exercised.

After formatting and the lint-driven test fixture correction, the literal
four-file Bun command from the previous 2.1 section passed 134/134, 522
assertions, exit 0 (`/tmp/activation-early-cold-final-four2.log`). Declared
Nx `twilight-burokrat:lint:source`, `:typecheck` and `:build` each exited 0
with an explicit `Successfully ran target` summary
(`/tmp/activation-early-cold-final-{lint2,type,build}.log`). The first lint
attempt failed on test import order and a redundant `String()` conversion;
direct ESLint diagnosed both, the test-only fixes were applied, and the
declared target passed on corrected bytes. Pinned OpenSpec strict and all
validation passed 1/1 and 143/143 respectively, zero failures
(`/tmp/activation-early-cold-final-{strict4,all4}.json`). No host gate, CI,
provider credentials, remote publication, dispatch worker or activation was
run for this local checkpoint.

### 2.1 cold-only source-guard follow-up (2026-10-07)

Independent exact-`ee972a37f50771f8b8c4c1cffcd60e28a99a1ccb` review
passed the four-file suite 134/134, 522 assertions
(`/tmp/activation-ee972a-astra-four.log`) and found five new cold-only
source checks without independent watched faults. Each follow-up fixture
supplies a schema-valid altered cold source with a recomputed authenticated
source digest through the same public `recordReceipt` owner. It asserts the
full preattempt row snapshot on refusal.

| Removed cold-only predicate                               | Mounted RED                                                                                                                                                                                         | Restored GREEN                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Cold invocation equals registered invocation              | Foreign cold invocation fulfilled, 0/1 (`/tmp/activation-early-cold-p2-invocation-red.log`).                                                                                                        | 1/1 (`/tmp/activation-early-cold-p2-invocation-green.log`).           |
| Cold protocol blob equals frozen protocol                 | Foreign protocol fulfilled, 0/1 (`/tmp/activation-early-cold-p2-protocol-red.log`).                                                                                                                 | 1/1 (`/tmp/activation-early-cold-p2-protocol-green.log`).             |
| Cold telemetry is verified                                | Unverified telemetry changed the named refusal to a TypeError on the subsequent missing receipt access, 0/1; it did not grant authority (`/tmp/activation-early-cold-p2-telemetry-status-red.log`). | 1/1 (`/tmp/activation-early-cold-p2-telemetry-status-green.log`).     |
| Telemetry receipt invocation equals registered invocation | Foreign receipt invocation fulfilled, 0/1 (`/tmp/activation-early-cold-p2-telemetry-invocation-red.log`).                                                                                           | 1/1 (`/tmp/activation-early-cold-p2-telemetry-invocation-green.log`). |
| Cold observed reads are nonempty                          | Empty observed reads fulfilled, 0/1 (`/tmp/activation-early-cold-p2-observed-red.log`).                                                                                                             | 1/1 (`/tmp/activation-early-cold-p2-observed-green.log`).             |

Each fault was independently restored to historical source SHA-256
`aaf41b1d2b6885fd7929a39ca74abec769e1fd9ad94c4d0e716e4b7127c30c46`
before the next watch. Adjacent `Proof:` comments identify the observed
failure at each predicate. The follow-up changes only tests, proof comments
and this ledger; full final-byte validation is recorded below. The external
provider, dispatch recovery, host gate and task 2.1 acceptance remain open.

On the follow-up source/test bytes, the literal four-file Bun command above
passed 139/139, 537 assertions, exit 0
(`/tmp/activation-early-cold-p2-final-four.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck` and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-early-cold-p2-final-{lint,type,build}.log`). Pinned OpenSpec
strict passed 1/1 and all passed 143/143, zero failures; final ledger-byte
rerun logs are `/tmp/activation-early-cold-p2-docs-{strict,all}.json`.
Changed-path Prettier and diff check passed. Normal commit hooks and
independent exact-SHA review are pending for this follow-up.

### 1.2/3.3 evaluating lease and review-dispatch reservation foundation (2026-10-07)

This local slice adds an explicit evaluating-lease renewal/takeover; `claim`
remains observed-only. One `BEGIN IMMEDIATE` transaction registers the review
invocation and reserves a dispatch effect. The additive v5 row freezes the
current request/plan, review pair, attempt/invocation, pinned authority,
logical reviewer target, canonical payload/digest, creation time, deadline
and retry budget. The logical target is derived from the pinned bootstrap as
`{kind:'reviewer',providerId,executorId}`. It is not a URL, journal endpoint,
external send or proof of authenticated provider mapping. Mutable reservation
state, owner epoch and version are separate columns. A later recovery slice
must resolve this target through an independently pinned adapter before any
send; changed mapping cannot silently rebind a prior reservation.

Mounted TDD first failed at missing `recoverEvaluationLease` (0/1,
`/tmp/activation-dispatch-lease-baseline-red.log`) and missing
`reserveReviewDispatch` (0/1,
`/tmp/activation-dispatch-reserve-baseline-red.log`). The corresponding first
GREENs were 1/1, 4 assertions
(`/tmp/activation-dispatch-lease-first-green.log`) and 1/1, 5 assertions
(`/tmp/activation-dispatch-reserve-first-green.log`). The new mounted cases
also assert exact replay; conflicting deadline, retry budget, invocation,
target or payload cannot replace the frozen effect; target survives reopen;
changed bootstrap/provider refuses; a real dispatch INSERT failure restores
both registration and reservation; v4 migration rolls back its newly created
table when a later index conflicts, then upgrades to v5 once the fault is
removed. Legacy v2/v3 fixtures explicitly remove the new table when modeling
their old schema; their read-only history tests remain green.

Each row below removed only the named production condition on the mounted
controller. All REDs were exit 1 on the named assertion, then the same
test was rerun exit 0, 1/1 after exact source restoration. Logs use
`/tmp/activation-dispatch-r5-<fault>-{red,green}.log`.

| Fault                    | Observed mounted RED                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lease-pairing`          | Unpaired evaluating history was renewed.                                                                                                                  |
| `lease-current`          | Superseded row with stale evaluating stage was renewed.                                                                                                   |
| `lease-stage`            | Observed request gained a recovery lease before obligations froze.                                                                                        |
| `lease-owner`            | Another worker took a live evaluating lease.                                                                                                              |
| `lease-null-expiry`      | Null-expiry lease was renewed.                                                                                                                            |
| `lease-generation`       | Stale subject generation was renewed.                                                                                                                     |
| `lease-bootstrap`        | Changed bootstrap file was ignored.                                                                                                                       |
| `lease-authority`        | A second valid pin renewed the old-authority request.                                                                                                     |
| `reserve-caller-target`  | Caller-supplied target survived strict input validation.                                                                                                  |
| `reserve-deadline`       | Elapsed deadline was reserved.                                                                                                                            |
| `reserve-target`         | Persisted foreign target was accepted on replay.                                                                                                          |
| `reserve-payload`        | Persisted changed payload was accepted on replay.                                                                                                         |
| `reserve-budget`         | Same effect key accepted a different frozen retry budget.                                                                                                 |
| `reserve-authority`      | Changed stored authority row was reserved.                                                                                                                |
| `reserve-pair-executor`  | Cold phase with foreign executor was reserved.                                                                                                            |
| `reserve-generation`     | Stale subject generation was reserved.                                                                                                                    |
| `reserve-plan`           | Missing frozen plan changed the named refusal to SQLite NOT NULL; partial registration still rolled back, so this is diagnostic specificity only.         |
| `reserve-subject-absent` | Missing subject row changed the named refusal to ArkType null validation; no authority was granted.                                                       |
| `reserve-split`          | Forced COMMIT after invocation registration left one registration when the subsequent real dispatch INSERT failed; restored transaction leaves zero rows. |
| `migration-split`        | Forced COMMIT after v5 table creation left that table after the later real index conflict; restored migration preserves the complete v4 schema/version.   |

The first retry-budget omission stayed GREEN because the fixture changed only
the deadline, so that trial is disqualified; an independent changed-budget
assertion produced the accepted RED above. All 20 accepted mutations were
restored to historical source SHA-256
`b281e8092a4ad8b7fb1b820116b155d05e60c3a35e8bf7b942e8851aeffbced5`
before subsequent proof comments/formatting. The 1.2/3.3 tasks remain open:
there is no dispatch send, provider adapter, response-loss reconciliation,
external credential or authenticated receipt from a live reviewer.

On the final formatted source/test bytes, the literal four-file Bun command
in the earlier controller section passed 153/153, 594 assertions, exit 0
(`/tmp/activation-dispatch-final-four3.log`). The first declared Nx lint
attempt printed socket-denial warnings and no task-success summary despite
exit 0, so it was not counted. Explicit no-daemon/no-plugin-isolation Nx lint
then found `prefer-optional-chain` in the new absent-plan guard; direct ESLint
confirmed that single diagnostic. After the behavior-preserving expression
correction, the declared `twilight-burokrat:lint:source`, `:typecheck` and
`:build` each printed `Successfully ran target`, exit 0 on final bytes
(`/tmp/activation-dispatch-final-lint4.log`,
`/tmp/activation-dispatch-final-type2.log`,
`/tmp/activation-dispatch-final-build2.log`). Pinned
`@fission-ai/openspec@1.12.0` validation passed strict 1/1 and all 143/143,
zero failures (`/tmp/activation-dispatch-final-{strict,all}2.json`). The
unqualified `bunx openspec` command was unavailable and was replaced by the
repository's pinned command; no validation result is inferred from that
unqualified exit. Final-byte changed-path Prettier and `git diff --check`
passed (`/tmp/activation-dispatch-final-format2.log`); normal-hook result is
recorded with the local commit checkpoint.

### Reservation binding correction after exact `020d97a7` review (2026-10-07)

Independent exact-SHA review passed the prior 153/153, 594-assertion suite
(`/tmp/activation-020d97-astra-four.log`) but reproduced two functional
omissions (`/tmp/activation-020d97-astra-reservation-bindings.log`). The
first positive fixture had persisted audit phase protocol `e×64` while the
pinned reviewer protocol was `a×64`; reservation wrote an `a×64` payload that
could never authenticate those frozen obligations. The second changed a
persisted cold obligation identity to `7×64` after plan freeze; a non-null
plan hash alone let reservation proceed. The mounted pre-fix cases both failed
at intended no-reservation assertions, 0/2
(`/tmp/activation-dispatch-p2-baseline-red.log`).

The corrected owner reconstructs the complete persisted obligation set in
the same strict shape and row order used by receipt verification, then checks
its canonical hash against the committed plan identity. It also joins each
frozen phase protocol and executor to the pinned reviewer before reservation.
The selector is not rerun. The valid dispatch fixture now freezes the pinned
protocol for both phases; the hash-consistent foreign-protocol fixture remains
a distinct refusal. Both refusal tests compare complete request, obligation,
registration and dispatch rows before/after. The first corrected mounted run
passed 3/3, 9 assertions (`/tmp/activation-dispatch-p2-first-green.log`).

| Independent removed join   | Mounted RED                                                                                                         | Restored GREEN                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Persisted full-plan digest | Changed cold identity still reserved, 0/1 (`/tmp/activation-dispatch-p2-frozen-plan-red.log`).                      | 1/1 (`/tmp/activation-dispatch-p2-frozen-plan-green.log`).     |
| Pinned review protocol     | Hash-consistent foreign-protocol pair still reserved, 0/1 (`/tmp/activation-dispatch-p2-pinned-protocol-red.log`).  | 1/1 (`/tmp/activation-dispatch-p2-pinned-protocol-green.log`). |
| Pinned review executor     | Hash-consistent foreign-executor phase still reserved, 0/1 (`/tmp/activation-dispatch-p2-pinned-executor-red.log`). | 1/1 (`/tmp/activation-dispatch-p2-pinned-executor-green.log`). |

All three source mutations were restored to historical SHA-256
`f351af4200546258a047dec73f363ce50c37d652b445cc9831e5ffa4f638ae55`
before later formatting and ledger edits. The former changed-executor fixture
from the first checkpoint now reaches the earlier full-plan guard, so it is
attributed to that guard; the new hash-consistent executor fixture isolates
the pinned-executor predicate. No external reviewer, send, retry or response
reconciliation is claimed. The 1.2/3.3 tasks stay open.

On the corrected formatted bytes, the exact four-file Bun command passed
156/156, 600 assertions, exit 0 (`/tmp/activation-dispatch-p2-final-four.log`).
Declared Nx `twilight-burokrat:lint:source`, `:typecheck` and `:build` each
printed `Successfully ran target`, exit 0
(`/tmp/activation-dispatch-p2-final-{lint,type,build}.log`). Pinned OpenSpec
strict passed 1/1 and all passed 143/143, zero failures
(`/tmp/activation-dispatch-p2-final-{strict,all}.json`); changed-path
Prettier and `git diff --check` passed. CI, canonical host gate, live provider,
send/reconciliation and trusted activation were not run for this local slice.

### Local review-dispatch recovery foundation (2026-10-07)

The v6 additive progress/fact tables keep the v5 immutable reservation intact.
The installed controller writes a `dispatching` intent, queries the exact effect
key through a fake authenticated port, and increments a bounded attempt before
awaiting a send. An unavailable or malformed query cannot authorize a send.
An accepted remote fact is retained separately from acknowledgement; a stale
worker may retain that fact but only the current evaluating lease can
acknowledge it. The takeover fake checks owner epoch and payload digest at
acceptance; the mounted source checks target binding separately. This is a local port contract, not evidence that a
live provider implements it. No endpoint or live credential is installed.

Mounted cases cover accepted-query reconciliation after a lost send response
and reopen without a second send, provider query failure/unavailability versus
authenticated absence, target/payload/invocation binding, conflicting and
corrupt retained facts, same-owner concurrent queries, takeover during a held
query and immediately before fake acceptance, stale-worker fact retention,
deadline/budget exhaustion with later accepted-fact reconciliation, and a fact
commit followed by an injected acknowledgement-write failure. After the
reservation checkpoint, a new mounted RED found that advanced subject
generation and changed frozen plan/registered invocation could reach send;
recovery now rechecks all three before provider work. A version-5 fixture
upgrades an existing reservation as `reserved` with zero attempts and no fact;
a late v6 table conflict preserves the exact prior schema/version/reservation.
Missing and malformed progress rows refuse before querying.

Each accepted fault below ran the named production-path fixture RED with only
the stated predicate/dependency broken, then the same fixture GREEN on restored
bytes. Logs are `/tmp/activation-dispatch-r5-<fault>-{red,green}.log`.

| Fault                                                  | Observed RED                                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `unavailable`                                          | Unknown disposition caused one send rather than zero.                                                 |
| `accepted_query`, `query_bypass`                       | Already accepted effect reached an unexpected resend.                                                 |
| `query_schema`                                         | Malformed query output reached the send path.                                                         |
| `same_owner_version`                                   | Two same-owner queries both acquired send permission.                                                 |
| `remote_target`, `remote_payload`, `remote_invocation` | A foreign accepted fact passed its corresponding binding.                                             |
| `deadline`, `budget`                                   | A send occurred past its bound instead of `exhausted`.                                                |
| `replay_digest`                                        | Changed schema-valid retained evidence replayed as acknowledged.                                      |
| `intent`                                               | Provider query ran while the durable effect remained reserved.                                        |
| `attempt_preawait`                                     | A started send did not increment its durable attempt count.                                           |
| `fact_conflict`                                        | Conflicting remote acceptance was acknowledged using the earlier fact.                                |
| `missing_fact`                                         | Acknowledged progress replayed after its retained fact was deleted.                                   |
| `adapter_fence`                                        | Breaking the fake adapter's acceptance fence let the old worker send after takeover.                  |
| `recovery_generation`                                  | Stale subject generation reached the provider.                                                        |
| `recovery_plan`, `recovery_registration`               | Changed frozen plan or invocation registration reached the provider.                                  |
| `progress_schema`                                      | Malformed progress reached the send path.                                                             |
| `progress_fallback`                                    | Synthesized missing progress reached a provider query.                                                |
| `v5_split`                                             | Moving v6 progress DDL outside the upgrade transaction left a partial table after the later conflict. |

The `adapter_fence` mutation broke the fake dependency; it did not claim an
installed external adapter. The first adapter-fence trial failed at a progress
state assertion before measuring acceptance and is disqualified; the corrected
test observes `accepted=1` versus expected zero. The 22 accepted fault names
above restored byte-exact to pre-format source SHA-256
`75e501277c1b1a6c8600ddc6a1c1c89ea4a6171dc20991892cef84e1b048b02f`.
The current controller-only regression passed 166/166, 623 assertions,
exit 0 (`/tmp/activation-recovery-final-controller-preformat.log`); final
four-file, static, OpenSpec, formatting and hook results follow the final-byte
checks. Tasks 1.2 and 3.3 remain open: this fake port has no live authenticated
provider mapping, dispatch capability, or external recovery acceptance.

On the formatted source/test bytes, the literal four-file Bun command above
passed 176/176, 708 assertions, exit 0
(`/tmp/activation-recovery-final-four2.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck`, and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-recovery-final-{lint2,type,build}.log`). Direct ESLint had
first identified 11 uses of a synchronous Bun matcher with `await` and two
optional-chain diagnostics; those were corrected before the final Nx run. The
earlier failed lint is not counted green. Pinned OpenSpec strict passed 1/1
and all passed 143/143 with zero failures
(`/tmp/activation-recovery-final-{strict,all}.json`). Changed-path Prettier
and `git diff --check` passed on final bytes. Normal-hook result is recorded
with the local commit. Canonical host gate, CI, real provider dispatch, and
trusted activation were not run.

### Recovery canonical binding correction after exact `92f50e30` review (2026-10-07)

Independent review reproduced a functional P2: changing the stored dispatch
payload's request head to `8×40` and recomputing its digest still reached a
query and send under the original effect
(`/tmp/activation-92f50e-astra-payload-repro.log`). The mounted correction
case first failed at the expected canonical-reservation refusal. Reservation
and recovery now share one derivation of the deterministic effect key and
canonical payload from the persisted request, frozen plan/pair, registered
invocation and pinned bootstrap. Recovery independently compares the stored
effect key, payload bytes and phase identities to those derived bytes. It
retains the separate stored payload-digest check, so a digest-only change also
refuses. A coherently renamed effect fixture validates the key comparison.

The review also found that the 22 earlier watched faults did not exercise the
new recovery preflight, acknowledgement and fact effect/request joins. The
additional mounted fixtures compare the complete request, obligations,
registration, reservation, progress and fact rows on preflight refusal, and
assert zero provider queries. Their accepted source omissions and restored
GREEN runs are `/tmp/activation-dispatch-r5-<fault>-{red,green}.log`:

| Fault                                                        | Observed RED                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `canonical_payload`, `canonical_effect`                      | Coherently changed head or renamed effect reached send.                                                                         |
| `preflight_request`, `preflight_current`, `preflight_stage`  | Foreign stored request, noncurrent request or failed stage reached send.                                                        |
| `preflight_lease`, `preflight_authority`, `preflight_target` | Changed epoch, authority row or reviewer target reached send.                                                                   |
| `preflight_payload_digest`                                   | Changed digest with original canonical payload reached send.                                                                    |
| `fact_effect`, `fact_request`                                | Foreign accepted fact was retained before a later acknowledgement refusal; this proves retention boundary, not authority grant. |
| `ack_version`, `ack_owner`                                   | A changed progress version or owner was acknowledged.                                                                           |
| `ack_current`, `ack_lease`                                   | Omission changed a retained-fact, nonacknowledged outcome to a later current-owner exception; authority was not granted.        |
| `ack_authority`                                              | Removing post-await current/authority revalidation acknowledged after stored bootstrap authority changed.                       |

The first request and payload-digest preflight faults were masked by later
guards and are disqualified. Corrected fixtures changed the persisted
reservation request identity and digest independently; each then reached
send only with its named guard omitted. All prior 22 rows remain valid. The
current loop reconciles a remote fact after a lost response while its request
remains current/evaluating, and permits an in-flight stale worker to retain an
already returned fact. It has no later query entry point for an orphaned
failed/superseded effect after restart; that broader reconciliation owner
remains open under 1.2/3.3. No live provider acceptance is inferred.

On the corrected formatted bytes, the literal four-file Bun command above
passed 194/194, 768 assertions, exit 0
(`/tmp/activation-recovery-p2-final-four.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck`, and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-recovery-p2-final-{lint,type,build}.log`). Pinned OpenSpec
strict passed 1/1 and all passed 143/143 with zero failures
(`/tmp/activation-recovery-p2-final-{strict,all}.json`). Changed-path
Prettier and `git diff --check` passed. Normal-hook result is recorded with
the local correction commit. CI, canonical host gate, live provider, and
trusted activation remain unrun.

### Recovery phase-attempt proof follow-up (2026-10-07)

Independent exact-`ba0c681a` review passed 194/194, 768 assertions
(`/tmp/activation-ba0c68-astra-four.log`) and cleared the canonical payload
fix and its 38 accepted faults. It found one remaining R5 gap: the new
recovery pair branch checks cold and informed attempt against the reserved
attempt, while frozen-plan hashing deliberately excludes attempt. Mounted
post-reservation fixtures independently advance only the cold or informed
persisted attempt, preserving the old registration and plan. Each restored
case refuses before a provider query and leaves the complete request,
obligation, registration, reservation, progress and fact snapshot unchanged.
Removing only the corresponding equality sends the changed attempt, 0/1
each (`/tmp/activation-dispatch-r5-pair_{cold,informed}_attempt-red.log`);
restored GREEN logs use the matching `-green.log` names. These are two new
accepted faults, not part of the prior 38. External provider and the broader
orphan-effect reconciliation remain open.

On the formatted source/test bytes, the literal four-file Bun command above
passed 196/196, 776 assertions, exit 0
(`/tmp/activation-recovery-attempt-final-four.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck`, and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-recovery-attempt-final-{lint,type,build}.log`). Pinned
OpenSpec strict passed 1/1 and all passed 143/143 with zero failures
(`/tmp/activation-recovery-attempt-final-{strict,all}.json`); changed-path
Prettier and `git diff --check` passed. Normal-hook result is recorded with
the local commit. CI, host gate, live provider, and trusted activation remain
unrun.

### Query-only orphan review-effect reconciliation (2026-10-07)

This local 1.2/3.3 slice adds `reconcileOrphanReviewDispatch` for effects whose
request is already failed or superseded. Its port has only `query`; it cannot
renew a lease or send. The controller reads a canonical historical-authority
registry whose file digest is independently pinned in controller options,
selects exactly the reservation's original authority, and verifies that
authority's original bootstrap bytes. Missing, unreadable, malformed,
unpinned, or unlisted history refuses before the provider call. There is no
fallback to the current bootstrap. The mounted authority-rotation case keeps
the original pinned bootstrap in history while the current deployment pin
changes; the query still receives the original reviewer target.

The first mounted test failed at the absent public method, 0/1
(`/tmp/activation-orphan-first-red.log`), and passed 1/1, 7 assertions after
implementation (`/tmp/activation-orphan-first-green2.log`). The installed
path first reserves and initiates an effect through the existing fake recovery
owner, then fails or supersedes its request and reopens the controller. An
accepted query retains exactly one remote fact. Full request (including lease
fields), obligation, registration, reservation, and progress rows remain
equal; the superseding request stays unchanged. Authenticated absence and
unavailability leave all rows unchanged. An effect with zero prior sends and
no fact refuses before query. Malformed output and foreign effect, request,
target, payload, or invocation refuse; two concurrent identical queries and
replay converge on one fact, while conflicting bytes refuse. A modeled INSERT
failure and a trigger that removes the inserted fact both roll back/report
failure. A held query rechecks historical authority after its await.

Each accepted watched fault below removed only the named condition or injected
the prohibited action into the controller path. Each RED failed its named
mounted test and the exact source bytes were restored before the matching
GREEN (`/tmp/activation-orphan-r5-<fault>-{red,green}.log`):

| Fault                                                                                             | Observed RED                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `history_fallback`, `history_absent`, `history_unreadable`, `history_malformed`, `history_digest` | Fallback queried with current bootstrap; digest omission queried with unpinned registry bytes. The absent, unreadable and malformed omissions changed the precise trusted-state refusal without granting query authority. |
| `terminal_stage`, `never_initiated`                                                               | A nonterminal request or never-sent reservation reached query.                                                                                                                                                            |
| `original_authority`, `original_plan`, `original_registration`                                    | Changed original authority, frozen check command, or registered invocation reached query.                                                                                                                                 |
| `original_target`, `original_payload`                                                             | Changed reviewer target or coherently changed payload/digest reached query.                                                                                                                                               |
| `no_send`, `no_revival`                                                                           | An injected send appeared in the mounted call log, or the old superseded request changed back to evaluating.                                                                                                              |
| `post_await_history`, `retained_absent`                                                           | A changed history after held query allowed fact retention, or disappearing fact was reported as retained.                                                                                                                 |

Two trial omissions of the shared foreign-fact effect/request checks stayed
GREEN: the later retained-fact revalidation rejected those bytes and the outer
transaction rolled back. They are disqualified, not counted as accepted
orphan proofs. Earlier current-evaluating recovery has separate accepted
retention-boundary faults; the orphan foreign-fact tests independently verify
the final no-write outcome. Two earlier cold/informed selected-attempt
omissions also produced RED under `ddc391e8`, but independent review found
their required refusal incorrect for historical effects: later attempts may
legitimately advance. Those logs are now disqualified. The orphan foundation
has 16 accepted watched RED/restored GREEN pairs. The fake query port establishes only local
controller behavior; no live provider, authenticated historical registry
issuer, external dispatch capability, host gate, CI, or trusted activation is
claimed. Tasks 1.2 and 3.3 remain open.

The four-file Bun command above passed 227/227 tests, 930 assertions, exit 0
on the final formatted source/test bytes
(`/tmp/activation-orphan-final-four2.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck`, and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-orphan-final-{lint2,type,build}.log`). The first Nx lint
run failed on an unnecessary condition and a void-expression callback; these
were corrected and its failed output is excluded. Pinned OpenSpec strict
passed 1/1 and all passed 143/143, zero failures on this ledger
(`/tmp/activation-orphan-final-{strict3,all3}.json`). Changed-path Prettier
and `git diff --check` passed. Normal-hook status belongs to the local
commit. No host gate or CI was run.

### Orphan history and remote-absence correction after `ddc391e8` review (2026-10-07)

Independent exact-`ddc391e8` review reproduced two P2s
(`/tmp/activation-ddc391-astra-orphan-history.log`). The orphan query had
compared the **currently selected** cold/informed attempts to the old
reservation attempt, so an already initiated attempt 0 could not be queried
after both phases advanced to attempt 1. The original reservation and
registration still bind attempt 0; the query-only owner now retains that
historical fact without changing the terminal request, obligations, lease,
replacement, or progress. The current-evaluating **send** owner keeps its
attempt fences. The second P2 was a remote `absent` result reported despite
an accepted fact already retained locally. The absent path now rechecks the
original pinned authority and retained fact after the provider await, in a
short transaction; a concurrent accepted-fact insert causes a conflict
refusal with all rows preserved.

All three mounted tests failed on the old algorithm (0/3,
`/tmp/activation-orphan-p2-red.log`): old sent attempt, retained-fact versus
remote absence, and held absent query raced with accepted-fact insertion.
The corrected targeted group passed 32/32, 161 assertions
(`/tmp/activation-orphan-p2-current-green.log`). Independently removing only
the new absent-versus-fact predicate caused the held-query case to return
absence (0/1 RED); restored source passed 1/1 GREEN
(`/tmp/activation-orphan-r5-absent_conflict-{red,green}.log`). This raises the
accepted orphan R5 total from 16 to 17. The old two attempt-refusal logs and
two masked foreign-fact omission trials remain explicitly disqualified.

On the corrected formatted source/test bytes, the literal four-file Bun
command above passed 228/228 tests, 937 assertions, exit 0
(`/tmp/activation-orphan-p2-final-four.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck`, and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-orphan-p2-final-{lint,type,build}.log`). Pinned OpenSpec
strict passed 1/1 and all passed 143/143, zero failures
(`/tmp/activation-orphan-p2-final-{strict,all}.json`). Changed-path Prettier
and `git diff --check` passed. Normal-hook result belongs to the local
correction commit. Tasks 1.2/3.3 and live provider acceptance remain open;
no push, host gate, CI or activation is claimed.

### Selected-check manifest preparation, bounded 2.2 foundation (2026-10-07)

`prepareSelectedCheck` is a read-only controller boundary. It selects the persisted
pending check under the current request, frozen plan, pinned bootstrap and evaluating
lease; resolves a versioned content-addressed invocation manifest by the frozen
`commandIdentity`; then repeats the selection after the resolver await. The returned
descriptor has no launch capability. The separately controlled registry reader rejects
missing/unreadable state and symlinked entries; its writer accepts identical bytes
at an occupied identity and rejects conflicting bytes. No candidate project file is
used as a fallback. The first mounted positive test failed with the method absent
and passed after implementation. Registry refusal tests also first failed when the
named resolver errors were collapsed, then passed after preserving their distinction.

Twenty-three accepted watched production-path omission faults reached named mounted
assertions, were restored, and passed the matching tests. RED logs are
`/tmp/activation-22-<fault>-red.log`:

| Guard/dependency                          | Faults and observed RED                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest schema and exact immutable bytes | `schema`, `argv`, `env`, `timeout`, `path`, `canonical`, `digest`: each omitted condition let the mounted preparation return the malformed or substituted descriptor.                                                                                                                                                                                                |
| Trusted registry                          | `symlink`: removing `O_NOFOLLOW` accepted a link outside the registry; `registry-conflict`: omitting occupied-byte comparison returned success for changed stored bytes.                                                                                                                                                                                             |
| Current selected state                    | `current`, `stage`, `pairing`, `lease-epoch`, `lease-owner`, `lease-null`, `lease-expired`, `authority`, `generation`, `generation-absent`, `plan`, `obligation`, `attempt`, `bootstrap-reread`: each removed fence let held resolution return an obsolete descriptor. The plan case changed another frozen obligation while the selected check row remained intact. |

The real symlink fixture passed 1/1, 8 assertions on restored source; its
`O_NOFOLLOW` omission failed 0/1 at the no-rejection assertion. The occupied-file
conflict fixture passed 1/1, 6 assertions; its exact-byte comparison omission failed
0/1 by returning the identity. No omission trial in this group was counted while
remaining GREEN. The manifest source was restored to SHA-256 `90a97dae62f082a69ce47f2379d812283eb784d073801af727d546c8a56f8a6c`
after the registry faults; the final formatted manifest/controller SHA-256 values are
`35ae196c3370f042a3397d6963c8c77dee901cecce1f34c4fb278b483314dc7f` and
`664927dbd7e087a4a69f329d343b4ce2844bfc81545ff8ead7fd45eeeba6dda3`.
The selected-check group passed 12/12, 79 assertions before the
symlink case was appended. On the formatted final source/test bytes, the literal
four-file Bun command covering `bootstrap.test.ts`, `request.test.ts`,
`ingress.test.ts` and `controller.db.test.ts` passed 240/240 tests, 1,046
assertions, exit 0 (`/tmp/activation-22-final-four2.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck` and `:build` each printed
`Successfully ran target`, exit 0 (`/tmp/activation-22-final-{lint3,type2,build2}.log`).
The first sandboxed lint invocation exited 0 with socket warnings but no target
success summary, so it is excluded; the explicit no-daemon/no-plugin-isolation rerun
established the target result. Pinned OpenSpec strict passed 1/1 and all passed
143/143, zero failures on the final ledger (`/tmp/activation-22-final-{strict4,all4}.json`). Changed-path
Prettier formatted source/test/ledger and `git diff --check` exited 0. Normal-hook
result belongs to the local commit. Task 2.2 remains open: no check reservation, worker, bwrap execution,
measured receipt, external verifier, host gate, CI or activation is claimed.

### Manifest boundary correction after `f8d8a900` review (2026-10-07)

Independent exact-`f8d8a900` review ran the four-file suite 240/240,
1,046 assertions and reproduced three functional defects: opening a real FIFO
with blocking `O_RDONLY` timed out before `fstat` could reject it; the writer
accepted an over-1 MiB canonical manifest that the reader refused; and the
relative cwd schema admitted NUL in main and skip-probe cwd. Probes are
`/tmp/activation-f8d8a9-astra-{registry-probe,manifest-boundary}.log`.
Mounted old-byte tests for NUL cwd and oversized writer failed 0/2
(`/tmp/activation-22-p2-initial-red.log`); the corrected tests passed 2/2,
24 assertions. Real FIFO, root-symlink and oversized-reader fixtures pass
promptly on the corrected reader. The registry now opens entries nonblocking
and no-follow before requiring a regular file, and writer/reader share the
same UTF-8 byte cap. A redundant root-is-symlink disjunct was removed because
`lstat(...).isDirectory()` already excludes symlinks.

Ten more independent watched omissions produced RED and restored GREEN in
`/tmp/activation-22-p2-<fault>-{red,green}.log`:

| Fault                                           | Observed RED and limit                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd_nul`, `skip_cwd_nul`                       | Main and skip-probe cwd NUL each returned a descriptor when the shared NUL predicate was omitted.                                           |
| `timeout_upper`, `output_lower`, `output_upper` | The mounted manifest returned a descriptor with 600001 ms, zero output bytes, or 10485761 output bytes when its isolated bound was removed. |
| `writer_size`, `reader_size`                    | Writer returned an identity and created an oversized entry; reader returned a descriptor for an oversized canonical entry.                  |
| `root_directory`                                | A symlinked registry root supplied a descriptor when the directory check was omitted.                                                       |
| `regular_file`                                  | Omission changed the real FIFO's named unreadable refusal to malformed; this is diagnostic specificity only, with no granted authority.     |
| `fifo_nonblock`                                 | Omission hung the real FIFO fixture until the bounded subprocess timeout exited 124. Restored test refused promptly.                        |

Each restored test passed 1/1. The FIFO old-byte timeout is a bounded
negative, not a claim that a hanging test's exit code proves a successful
assertion. The FIFO omission was rerun exactly as
`timeout 2 bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/controller.db.test.ts --test-name-pattern 'selected check registry refuses a FIFO'`;
the terminal exit was **124**, and the redirected RED log contains only Bun
startup because the blocking open prevented the assertion from running.
The exact command and terminal exit are retained at
`/tmp/activation-22-p2-fifo_nonblock-receipt.txt`, with startup output at
`/tmp/activation-22-p2-fifo_nonblock-red-explicit.log`. After restoring the
committed source SHA-256 `57d1740ac3fa2b8cee36fa70807a2567f0858e606877275faf0536bf9d9386f6`,
the same focused test passed 1/1, three assertions, exit 0
(`/tmp/activation-22-p2-fifo_nonblock-green-explicit.log`). All 33 accepted
faults (the original 23 plus these 10) were
restored; the regular-file fault proves diagnostic specificity only. On the
corrected source/test bytes, the four-file Bun command passed 244/244 tests,
1,067 assertions, exit 0 (`/tmp/activation-22-p2-final-four2.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck` and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-22-p2-final-{lint2,type,build}.log`). An earlier lint run
failed on test import ordering; the import was sorted before these final
checks. Pinned OpenSpec strict passed 1/1 and all passed 143/143, zero
failures (`/tmp/activation-22-p2-final-{strict2,all2}.json`). Changed-path
Prettier and diff checks passed. Normal-hook result belongs to the local
correction commit.
No worker launch, live provider, host gate, CI or trusted activation is claimed.

### Check-dispatch reservation foundation (local, 2026-10-07)

Task 2.2 remains open. This slice adds a version-7, additive, **inert** check
invocation/reservation/progress store and `reserveCheckDispatch`. It resolves the
frozen selected-check manifest outside SQLite, then in one transaction repeats
current request/generation, pinned authority, evaluating lease, persisted plan,
check obligation and attempt selection before registering the invocation and
reserving the canonical effect. The effect key binds `check-dispatch`, request,
obligation and attempt; the immutable payload binds the full request, selected
plan/obligation, invocation, exact manifest bytes and command digest, executor,
protocol, toolchain and sandbox profile, pinned controller authority, typed
`local-check-worker` target, deadline and retry budget. The target executor is
the check executor even when the reviewer executor differs. The progress row is
initially `reserved`, zero sends, and owned by the current lease. The API has no
worker launch, query, send or receipt capability. The pinned bootstrap identity
is controller authority, not a certification of a worker installation.

The installed first tests failed on the absent `reserveCheckDispatch` API
(`/tmp/activation-22-reservation-first-red.log`) and fresh schema version 6
instead of 7 (`/tmp/activation-22-v7-first-red.log`). Mounted tests now cover
exact replay after reopen, changed invocation/deadline/budget conflicts, strict
caller input, absent/malformed/substituted manifest, held resolver movement of
current/stage/lease epoch-owner-expiry/authority/generation/plan/check state and
attempt, elapsed deadline, corrupted persisted reservation/progress, injected
failures before and after registration/reservation/progress writes, and a
populated v6 upgrade preserving review history. A late v7 DDL failure restores
all v6 schema/version/data. Every refusal snapshots full relevant request,
obligation, attempt, reservation and progress rows. No provider work occurs.

Twenty-five accepted watched source faults each produced a named RED, were
restored, and passed the same focused GREEN. Logs use
`/tmp/activation-22-reservation-r5-<fault>-red.log` and `-green.log`, except
corrected deadline/budget conflict REDs use `-red2.log`:

| Faults                                                                                                                                                                                                 | Observed RED                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `input_override`, `final_selection`, `selected_tuple`, `deadline`, `manifest_hash`                                                                                                                     | Caller target override was accepted; held selection/attempt reserved the stale tuple; elapsed deadline registered rows; changed manifest reached reservation.               |
| `target_bytes`, `payload_bytes`, `payload_digest`, `manifest_bytes`, `toolchain_identity`, `sandbox_profile_identity`, `protocol_identity`, `command_identity`, `deadline_conflict`, `budget_conflict` | Removing only the named stored-field comparison accepted its changed-column exact replay.                                                                                   |
| `split_registration`, `split_reservation`, `migration_split`                                                                                                                                           | A later injected insert/DDL failure retained partial rows or schema instead of the original full snapshot.                                                                  |
| `progress_absent`, `progress_shape`                                                                                                                                                                    | Missing-progress omission changed the named refusal to a later ArkType null error, diagnostic specificity only; malformed progress was accepted when its parse was omitted. |
| `effect_kind`, `target_executor`, `payload_request`, `progress_owner_epoch`, `omit_progress_insert`                                                                                                    | The mounted exact effect-key, check target, canonical full-request payload, or initial progress assertion failed.                                                           |

The initial `deadline_conflict` and `budget_conflict` mutations stayed GREEN
because canonical payload equality still rejected the altered input; those runs
are disqualified. Separate changed persisted-column fixtures made the isolated
comparisons breakable and are the accepted `-red2.log` rows. No accepted fault
claims a worker dispatch, external provenance or exactly-once effect. Final-byte
suite, declared Nx targets, pinned OpenSpec, format/diff and hook receipts follow
in the local checkpoint; host gate/CI remain unrun for this unpublished slice.

On the formatted reservation source/test bytes, the literal four-file Bun command
for `bootstrap.test.ts`, `request.test.ts`, `ingress.test.ts` and
`controller.db.test.ts` passed **269/269**, 1,189 assertions, exit 0
(`/tmp/activation-22-reservation-final-four.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck` and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-22-reservation-final-{lint,type,build}.log`). Changed-path
Prettier check and `git diff --check` passed. Pinned
`@fission-ai/openspec@1.12.0` strict passed 1/1 and all passed 143/143
(`/tmp/activation-22-reservation-final-{strict,all}.json`). An initial
`bunx openspec` attempt exited 1 because that package name has no executable;
it is excluded in favor of the repository-pinned command. Normal hook output
belongs to the local commit. No h2puni gate, CI, authenticated check worker,
provider mapping, publisher, or trusted activation is claimed.

### Check-dispatch partial-bundle correction after `30908aac` review

Astra reproduced a P2 in exact `30908aac`: the replay path inserted a missing
`activation_check_attempt` before it inspected an existing dispatch/progress,
and reconstructed a missing dispatch/progress when an attempt remained. Thus
partial trusted state was silently repaired. Mounted pre-fix tests failed for
all six nonempty proper subsets of the attempt, dispatch and progress bundle
(`/tmp/activation-22-bundle-first-red.log`). The corrected path reads all
three companion rows **before any insert**, permits only all absent for a new
reservation or all present for an exact validated replay, and refuses every
partial subset with `check dispatch bundle incomplete`. Each named refusal
compares the complete request/obligation/attempt/dispatch/progress snapshot
before and after; targeted corrected tests passed 8/8, 24 assertions
(`/tmp/activation-22-bundle-green.log`). Malformed present progress still
fails its independent shape check.

Independently omitting only the new complete-bundle guard caused missing-attempt
and missing-dispatch-plus-progress replays to **return without error**, not just
to change diagnostics. Watched RED and restored GREEN are retained at
`/tmp/activation-22-bundle-r5-{attempt,dispatch_and_progress}-{red,green}.log`.
The exact controller source was restored after each fault (SHA-256
`76926fec9fb98ec8a9b24f6dcc106fd8634bc929c9ca395b4e95a1057b4728a0`
before subsequent formatting). The previous `progress_absent` diagnostic-only
watch in the 30908aac ledger is historical: the new complete-bundle guard now
rejects absence earlier, so that later named check was removed. It is not
counted as a final-byte safety proof. No worker dispatch or external authority
is introduced by this correction.

The same exact-SHA review found six newly introduced replay joins without
isolated proof. Mounted changed-column fixtures now independently corrupt
`request_identity`, `plan_identity`, `obligation_identity`, `attempt`,
`invocation_id` or `authority_identity` while retaining the effect key and
snapshotting the full trusted bundle. All six refuse exact replay with
`reservation conflicts` and leave the snapshot unchanged. Removing only each
matching production comparison made its named test return successfully (0/1
RED); restoring the source made each focused test pass (1/1 GREEN). Logs are
`/tmp/activation-22-replay-r5-<column>-{red,green}.log`. This supplements the
previous ten watched target/payload/manifest/dimension/deadline/budget replay
joins; no other newly added compared replay field is untested. The source
mutation script restored SHA-256
`76926fec9fb98ec8a9b24f6dcc106fd8634bc929c9ca395b4e95a1057b4728a0`
before the new adjacent Proof wording. Final-byte checks follow in the local
correction commit.

On the corrected, formatted source/test bytes, the literal four-file Bun
command passed **281/281**, 1,225 assertions, exit 0
(`/tmp/activation-22-correction-final-four.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck` and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-22-correction-final-{lint,type,build}.log`). Pinned
OpenSpec strict passed 1/1 and all passed 143/143, zero failures
(`/tmp/activation-22-correction-final-{strict,all}.json`). Changed-path
Prettier check and `git diff --check` passed. Normal-hook output belongs to
the local correction commit. Host gate and CI remain unrun for this unpublished
local slice; external worker, publisher and activation acceptance remain open.

### Check-worker admission recovery foundation (local fake, task 2.2 still open)

This slice adds an additive version-8 accepted-fact table and an inert
`recoverCheckDispatch` owner for an already reserved selected check. It records
durable query/send intent and bounded attempts, queries the same effect key
before any send, and retains fake acceptance separately from progress
acknowledgement. An acknowledged fact does **not** complete the check
obligation or create a measured `CheckReceipt`. The fake receiver has an
independently configured executor, toolchain and sandbox profile; no real
worker, external provider or bwrap launch is installed. The current recovery
entry point covers active evaluating requests only; query-only reconciliation
after a failed or superseded request is still open.

The first mounted test failed because `recoverCheckDispatch` was absent
(`/tmp/activation-22-check-recovery-first-red.log`); the initial fake
acceptance path then passed 1/1, five assertions
(`/tmp/activation-22-check-recovery-first-acceptance.log`). The restored
four-file Bun run before final Proof and ledger edits passed 318/318,
1,394 assertions, exit 0
(`/tmp/activation-22-check-recovery-preproof-four.log`). Mounted tests cover:

| Boundary                | Observed assertion                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query before send       | Authenticated absence permits one counted fake acceptance; response loss then reopen queries the same effect key without executing again. Unavailable, malformed or throwing query never becomes absence.                                                                                                                 |
| Ownership               | Held query and held send takeover refuse the old owner. Same-owner overlapping query has one CAS winner; the fake receiver independently fences owner, epoch, progress version and authority at acceptance time.                                                                                                          |
| Runtime                 | A receiver configured for a different executor, toolchain or sandbox profile accepts zero executions with an otherwise valid reservation.                                                                                                                                                                                 |
| Budget                  | Deadline equality and the maximum attempt count stop new sends, while an already accepted fact remains queryable. The attempt count is durable before the send await.                                                                                                                                                     |
| Retention               | Nine separately altered immutable fact fields refuse insertion; identical replay is idempotent, conflicts and missing/corrupt facts refuse. Accepted history can survive a stale owner without acknowledging progress. Remote absence contradicting a retained fact refuses, including insertion while the query is held. |
| Atomicity and migration | Injected fact-insert and acknowledgement writes preserve full transaction snapshots; version-7 populated rows survive version-8 migration, and a late post-DDL fault restores schema, version and rows.                                                                                                                   |

Twenty-five **controller production-path** omissions each caused a named
mounted assertion RED and passed the same focused test after restoring exact
source bytes. Logs use
`/tmp/activation-22-check-recovery-r5-<name>-{red,green}.log`. Names are
`post_query_current`, `progress_version`, `query_unavailable`, `deadline`,
`budget`, `attempt_increment`, `fact_conflict`, `fact_digest`,
`post_await_authority`, `migration_bundle`, `intent`, `canonical_payload`,
`fact_effectKey`, `fact_requestIdentity`, `fact_obligationIdentity`,
`fact_attempt`, `fact_invocationId`, `fact_target`, `fact_payloadDigest`,
`fact_toolchainIdentity`, `fact_sandboxProfileIdentity`, `query_schema`,
`send_schema`, `ack_fact` and `done_fact`. The first 21 restored source SHA-256
was `1b05e8c514a1a41851abc1ba920d6f61eff571addd9711680886212007acffa2`;
the final four restored the same source before adjacent Proof comments.
Fact-field omissions each retained a foreign fact, not a completed check.

Five **test fake acceptance** guard omissions separately failed their mounted
assertions and restored GREEN: `executor`, `version`, `epoch`, `authority`,
and `target`, with logs
`/tmp/activation-22-receiver-r5-<name>-{red,green}.log`. Three trials
(`toolchain`, `profile`, `payload`) stayed GREEN because independent fake
comparisons still fenced the substitution. They are disqualified as isolated
omission proofs; positive wrong-runtime and changed-payload fixtures establish
the combined fake behavior. These fake-only checks are not evidence of an
installed worker or external authentication. Final-byte suite, Nx, OpenSpec,
format/diff and hook receipts follow in the local checkpoint. Host gate and CI
remain unrun.

### Fake receiver lease-expiry correction after `f5f029d94` review

Astra reproduced a held fake send that began under lease expiry 1100, then
advanced the controller clock to exactly 1100 without takeover. The fake
receiver accepted one new execution before the controller refused current
acknowledgement. The first new mounted fixture had no manifest resolver and is
disqualified (`/tmp/activation-22-check-expiry-first-red.log`). With that
fixture corrected, the pre-fix test failed at the intended `sends: 0`
assertion because the fake accepted one execution
(`/tmp/activation-22-check-expiry-valid-red.log`). The fake now rereads the
persisted lease expiry at its acceptance point using an injected authoritative
clock; it refuses missing expiry or `now >= expiry`. Focused exact-expiry and
missing-expiry fixtures passed 2/2
(`/tmp/activation-22-check-expiry-two-green.log`). The previously accepted
before-expiry effect still retains its fact after a late response; this is
separate from initiating a new execution after expiry.

Removing only the combined receiver expiry predicate made the mounted
equality/missing fixtures RED; restoring exact test source made them pass 2/2
(`/tmp/activation-22-check-expiry-composite-{omission-red,restored-green}.log`).
The independent source-order claim at the durable attempt increment was also
corrected: the original `attempt_increment` fault proves a missing count with
an always-uncertain send, not an accepted uncounted execution. A distinct
mutation moved that increment after the held send await; the pre-await
`dispatch_attempts: 1` assertion observed 0 (RED), and restoring source made
the same test GREEN
(`/tmp/activation-22-check-increment-{moved-red,restored-green}.log`).
The adjacent Proof now names that precise observation. Final-byte scoped
checks and normal hooks follow in the local correction commit; host gate, CI,
real worker and external authentication remain unrun.

On corrected, formatted bytes, the literal four-file Bun command passed
**320/320**, 1,399 assertions, exit 0
(`/tmp/activation-22-check-expiry-final-four.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck` and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-22-check-expiry-final-{lint,type,build}.log`). Pinned
OpenSpec strict passed 1/1 and all passed 143/143
(`/tmp/activation-22-check-expiry-final-{strict,all}.json`). Changed-path
Prettier check and `git diff --check` passed; normal-hook receipt belongs to
the local correction commit.

On corrected, formatted source/test bytes, the literal four-file Bun command
passed **318/318**, 1,394 assertions, exit 0
(`/tmp/activation-22-check-recovery-final2-four.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck` and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-22-check-recovery-final2-{lint,type,build}.log`). The first
lint attempt had 12 test matcher/style diagnostics and is excluded; direct
ESLint and the declared target passed after the typed matcher and callback
correction. Pinned OpenSpec strict passed 1/1 and all passed 143/143, with zero
failures (`/tmp/activation-22-check-recovery-final-{strict,all}.json`). The
changed-path Prettier check and `git diff --check` passed. Normal-hook output
belongs to the local checkpoint commit; no h2puni gate or CI was run.
