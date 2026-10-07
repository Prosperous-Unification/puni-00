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
