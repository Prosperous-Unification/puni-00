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

### Inert selected-check launch preparation (bounded 2.2 foundation)

The prior design/spec described disposable isolation but did not define
versioned runtime/profile descriptors, their independently resolved canonical
bytes, logical mounts and environment, finite supported resource limits, or
candidate snapshot containment. The adjacent design/spec now define those
requirements. This local slice adds only `prepareCheckLaunch` and strict
descriptor/snapshot validation. It returns inert data joining the frozen
request, check selection and attempt, exact manifest, runtime and profile
descriptors, and the trusted resolver's candidate snapshot. It never spawns a
process, reserves a new effect, completes an obligation, or issues a receipt.
The controller rechecks current request, plan, subject generation, lease and
authority after each asynchronous resolution. Both main and skip-probe cwd
components are checked with `lstat` against the supplied snapshot root.

The first mounted test on exact base `a55866a72abd1a6c7bcc0db870de20b95c51ffb0`
failed 0/1 because the controller had no `prepareCheckLaunch` entry point
(`/tmp/activation-22-launch-prep-first-red.log`); the minimal missing-runtime
refusal then passed 1/1 (`/tmp/activation-22-launch-prep-first-green.log`).
The focused matrix covers an inert positive result with unchanged complete
controller DB snapshot; absent, unreadable, malformed, noncanonical or
wrong-digest runtime/profile; missing snapshot; wrong request/head/snapshot
identity; symlinked root/main/skip cwd; unsupported executable, host mount,
environment, namespace, capability, descriptor or finite resource policy; and
held runtime/profile/snapshot resolution after attempt, plan, current, subject
generation, lease or authority changes. An initial missing/ENOENT fixture
exposed a boundary distinction: configured missing state was reported as
malformed/unreadable. The named-refusal RED is
`/tmp/activation-22-launch-prep-absent-red.log`; the corrected absent,
unreadable and malformed controls passed
(`/tmp/activation-22-launch-prep-absent-green.log`).

Thirty-seven independent source omissions each made its named mounted test
RED and passed restored GREEN. Logs use
`/tmp/activation-22-launch-prep-r5-<name>-{red,green}.log`:

| Group                   | Accepted fault names and observed dependency                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descriptor and policy   | `runtime_canonical`, `runtime_digest`, `descriptor_size`, `runtime_host_path`, `profile_mount`, `profile_writable`, `profile_virtual`, `profile_environment`, `profile_namespace`, `profile_network`, `profile_capabilities`, `profile_descriptors`, `profile_memory`, `profile_wall_upper`, `profile_cpu_upper`, `profile_process_upper`, `profile_output_upper`, `profile_cpu_lower`, `profile_memory_lower`, `profile_process_lower`, `wall_fit`, `output_fit`, `main_executable`, `probe_executable`: forbidden descriptor or unsupported command returned as inert data when the named check was omitted. |
| Snapshot and post-await | `snapshot_request`, `snapshot_head`, `snapshot_identity`, `cwd_directory`, `skip_cwd`, `snapshot_recheck`: wrong identity, symlinked cwd or stale lease returned as inert data. `runtime_recheck` and `profile_recheck` caused the next trusted resolver to be called after a held selection changed; final recheck still prevented a returned plan, so these prove early-fence behavior only.                                                                                                                                                                                                                 |
| Refusal diagnostics     | `snapshot_root_absolute`, `runtime_absent`, `runtime_enoent`, `profile_absent`, `snapshot_absent`: omissions changed the specific modeled refusal to a later path or parse error. They did **not** return an inert plan or grant authority.                                                                                                                                                                                                                                                                                                                                                                    |

All accepted faults restored exact source bytes before later Proof and format
edits. No masked omission is counted. The descriptors and snapshot are supplied
by trusted resolver ports exercised with test fakes: this slice does **not**
attest the snapshot contents, verify an installed toolchain, establish host
namespace/cgroup capability, run bwrap, or authenticate a measured receipt.
The returned description cannot be used as spawn authority; task 2.2 and all
external-provider/host acceptance remain open. Final-byte scoped tests, Nx,
OpenSpec, format/diff and normal hooks follow in the local checkpoint; host
gate and CI remain unrun for this unpublished branch.

The final-byte launch-preparation four-file Bun command passed **362/362**,
1,571 assertions, exit 0 (`/tmp/activation-22-launch-prep-final-four.log`).
Declared Nx `twilight-burokrat:lint:source`, `:typecheck`, and `:build` each
printed `Successfully ran target`, exit 0
(`/tmp/activation-22-launch-prep-final-{lint,type,build}.log`). Pinned OpenSpec
strict passed 1/1 and all passed 143/143, with zero failures
(`/tmp/activation-22-launch-prep-final-{strict,all}.json`). Changed-path
Prettier and `git diff --check` passed
(`/tmp/activation-22-launch-prep-final-{format,diff}.log`). These checks do not
establish an installed worker, host isolation, a measured receipt, h2puni gate,
or CI; those remain unrun for this local slice.

The launch-preparation follow-up on `015f5a1d` corrected two reviewed P2s.
Before correction, mounted Bun tests showed that a canonical descriptor with
fewer than 1,048,576 UTF-16 code units but more than 1,048,576 UTF-8 bytes
returned a plan (`/tmp/activation-22-launch-fix-bytes-red.log`, exit 1), and
snapshot roots spelled `link/`, `link/.`, or `link/nested` traversed a symlink
without refusal (`/tmp/activation-22-launch-fix-root-red.log`, exit 1). A direct
`link` root was already refused. The exact-cap byte descriptor and an ordinary
nested directory pass. Corrected targeted runs passed
(`/tmp/activation-22-launch-fix-{bytes,cap,root}-green.log` and
`/tmp/activation-22-launch-fix-root-controls-green.log`).

Three independent production-path omissions were accepted. Replacing
`Buffer.byteLength` with `string.length` let the oversized descriptor return;
omitting lexical-root normalization let a normal `root/.` spelling return;
checking only the final root rather than its ancestors let `link/nested`
return. Each named test failed at its missing-refusal assertion and passed after
source restoration (`/tmp/activation-22-launch-fix-r5-{utf8_bytes,lexical_root,ancestor_root}-{red,green}.log`,
RED exit 1, GREEN exit 0). The source was restored to SHA-256
`360abe6dd48f44bbb387b03e31feb51d3cd454cc6077ba057cfd680147c65590`
before subsequent Proof comments. Ancestor `lstat` is an inert preparation
check; it cannot prove race-safe snapshot containment after return. A later
launcher must revalidate an anchored descriptor or file descriptor at use time.
No bwrap process, measured receipt, host gate, or CI was run in this follow-up.

On the corrected and formatted bytes, the four-file Bun suite passed
**370/370**, 1,595 assertions, exit 0
(`/tmp/activation-22-launch-fix-final-four.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck`, and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-22-launch-fix-final-{lint,type,build}.log`). Pinned OpenSpec
strict passed 1/1 and all passed 143/143, zero failures
(`/tmp/activation-22-launch-fix-final-{strict,all}.json`). Changed-path
Prettier and `git diff --check` passed
(`/tmp/activation-22-launch-fix-final-{format,diff}.log`).

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

### B1 anchored execution-tree staging (local, inert)

The mounted `stageCheckLaunch` path first failed 0/1 because the entry point
was absent (`/tmp/activation-b1-first-red.log`); the expanded nine-case RED is
`/tmp/activation-b1-expanded-red.log`. The implementation resolves trusted
canonical candidate/runtime manifests, traverses source components from
retained directory descriptors with no-follow opens, copies and hashes from
opened regular files, checks complete inventories and explicit profile budgets,
and exposes a private staged tree only after both trees verify. It does not
launch a worker or grant receipt authority. The mounted matrix before final
Proof edits passed 31/31 (`/tmp/activation-b1-matrix4.log`), and six held
resolver/lease/authority/currentness cases passed 6/6
(`/tmp/activation-b1-held-matrix.log`). Root/ancestor rename, leaf replacement,
same-FD copy, FIFO/hardlink/symlink, runtime corruption, descriptor counts and
failed-stage cleanup are covered. Direct post-copy corruption passed 1/1
(`/tmp/activation-b1-staged-verify-green.log`): a changed private staged file
is refused with no ready tree, dispatch write, or FD leak.

Each accepted production-path omission below failed its named mounted assertion
with exit 1, then passed after exact source restoration with exit 0. Logs are
`/tmp/activation-b1-r5-<name>-{red,green}.log`:

| Fault name                                                        | Observed lost boundary                                                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `manifest_cap`, `entry_cap`, `depth_cap`, `path_cap`, `total_cap` | An over-budget canonical inventory was no longer refused at its pinned limit.                                     |
| `file_cap`                                                        | An oversized file was opened instead of refused before source access; the streamed cap still prevented authority. |
| `hardlink`, `no_follow`, `inventory`, `ancestor_open`             | A hardlink, same-byte symlink, extra entry, or renamed-ancestor replacement crossed its source boundary.          |
| `source_hash`                                                     | Changed source bytes crossed the early copy refusal; final staged verification still prevented authority.         |
| `atomic_name`, `cleanup`                                          | Ready naming or failed pending-tree cleanup lost its mounted assertion.                                           |
| `staged_hash`                                                     | A corrupted private copy was returned when final staged digest comparison was omitted.                            |
| `candidate_recheck`, `final_recheck`                              | Changed currentness invoked the next resolver or returned a staged tree.                                          |

The six newly required positive staging-profile caps also have independent
upper and zero-boundary proofs. The mounted profile matrix passed 12/12, 36
assertions (`/tmp/activation-b1-profile-caps-green.log`). Each field-specific
`profile_{unbounded,zero}_{manifest,entries,depth,path,file,tree}` omission
failed its named selected-check preparation assertion with exit 1 and passed
after restoration with exit 0 (`/tmp/activation-b1-r5-profile_*-{red,green}.log`).

The first `entry_cap` and `depth_cap` fixtures were disqualified because their
source modes were wrong; corrected valid inventories produced the listed RED and
GREEN. Initial `file_cap` and `source_hash` omissions stayed GREEN at the
final-authority assertion because independent downstream checks masked them;
the refined proofs are **early diagnostic/refusal only**. The closed-and-reused
FD functional sentinel still refuses and cleans up, but removing the first
dev/inode comparison alone, then both first/final dev/inode comparisons, stayed
GREEN under other fstat protections (`fd_identity`, `fd_identity_pair` logs).
Neither is counted as an independent omission proof. The final staged hash has
its own accepted authority-loss proof above. The verified copy is not an atomic
source snapshot or provenance attestation. B1 does not run Bubblewrap, enforce
namespaces/cgroups, execute candidate code, authenticate a receipt, or satisfy
host gate/CI. Final-byte tests and static/docs checks follow below.

The final formatted four-file Bun suite passed **421/421**, 1,785 assertions,
exit 0 (`/tmp/activation-b1-final3-four.log`). Declared Nx
`twilight-burokrat:lint:source`, `:typecheck` and `:build` each printed
`Successfully ran target`, exit 0
(`/tmp/activation-b1-final3-{lint,type,build}.log`). The first lint run failed
with six concrete ESLint diagnostics; import order, an interface definition, a
void-returning shorthand and a test-only `prefer-const` violation were fixed,
then the declared Nx target passed. Pinned OpenSpec
`@fission-ai/openspec@1.12.0` strict passed 1/1 and all passed 143/143, zero
failures (`/tmp/activation-b1-final-{strict,all}.json`). An initial
`bunx openspec` command was unavailable because that is not the pinned package
and is excluded. Changed-path Prettier and `git diff --check` passed
(`/tmp/activation-b1-final-{format,diff}.log`); normal-hook result belongs to
the local commit. No host gate or CI was run for this unpublished B1 slice.

### B1 exact-review correction after `aaba6a146`

Astra reproduced that closing a candidate leaf descriptor without reusing its
number caused the old cleanup loop to throw `EBADF` at its first close, masking
the source refusal and leaking three retained ancestor descriptors. The mounted
test failed on that original byte sequence
(`/tmp/activation-b1-fd-cleanup-red.log`, 0/1, exit 1). The `0a2744b84`
checkpoint recorded dev/inode on each opened descriptor, continued cleanup
after an error, and aggregated source and cleanup failures. Its
close-without-reuse/close-with-different-inode tests passed 2/2, 13 assertions
(`/tmp/activation-b1-fd-cleanup-green3.log`), with watched
`cleanup_continue`/`cleanup_reuse` pairs. These were historical results for
that checkpoint; dev/inode is **not** an open-file-description identity, and
the same-inode reuse defect and replacement proof are recorded below.

The exact-review R5 gap was filled with canonical, digest, request and head
fixtures whose trusted selected snapshot identities were recomputed from the
altered bytes where applicable. Candidate and runtime noncanonical bytes each
refuse even when their frozen digest matches the raw bytes; candidate and
runtime canonical bytes each refuse under a different schema-valid frozen
digest; candidate request and head substitutions each refuse with otherwise
matching source contents and manifest digest. Baseline mounted cases passed
6/6 (`/tmp/activation-b1-identity-green1.log` plus
`/tmp/activation-b1-runtime-canonical-green.log`). Independently omitting each
canonical, digest, request or head join failed its named test, then passed
after source restoration (`/tmp/activation-b1-r5-{candidate_canonical,runtime_canonical,candidate_digest,runtime_digest,candidate_request,candidate_head}-{red,green}.log`, each RED exit 1, GREEN exit 0). The old wrong-file-hash fixture was not used
as proof for the frozen digest join.

After the correction and typed AggregateError test assertions, the fresh
four-file Bun suite passed **428/428**, 1,820 assertions, exit 0
(`/tmp/activation-b1-fix-final2-four.log`). Declared Nx
`twilight-burokrat:lint:source` and `:typecheck` each printed explicit success,
exit 0 (`/tmp/activation-b1-fix-final2-{lint,type}.log`). The first lint
attempt exposed two unsafe member accesses in the test's AggregateError
inspection; those were replaced by `unknown` plus `instanceof Error`, then
the declared target passed. Declared Nx `twilight-burokrat:build` also printed
explicit success, exit 0 (`/tmp/activation-b1-fix-final2-build.log`). Pinned
OpenSpec strict passed 1/1 and all passed 143/143, zero failures
(`/tmp/activation-b1-fix-final2-{strict,all}.json`). Changed-path Prettier
and `git diff --check` passed
(`/tmp/activation-b1-fix-final2-{format,diff}.log`). Normal-hook result belongs
to the local correction commit. Host gate and CI remain unrun.

### B1 descriptor ownership correction after `0a2744b84`

Astra found that a trusted diagnostic holding a raw FD could close it and
reopen the **same inode** under the same number. The dev/inode comparison then
treated the caller's new descriptor as owned: the first mounted regression
failed because staging returned success, and cleanup closed the caller FD
(`/tmp/activation-b1-same-inode-red.log`, 0/1, exit 1). The production seam
now gives diagnostics no raw FD number. A file callback gets a one-shot,
callback-scoped `closeOpenedFile()` control; it marks the owned entry released
before closing and expires immediately after the callback. Staging refuses if
that control was used. Cleanup skips only released entries and closes every
remaining owned descriptor; unexpected close failures are still collected with
the original failure, without retrying an arbitrary number. The mounted
same-inode test obtains the recycled number independently from `/proc/self/fd`,
reopens the original file, and asserts the new caller FD stays open while
staging refuses, the private stage disappears and dispatch rows do not change.
The different-inode, closed-without-reuse, double-use and retained-control
cases are also mounted (`/tmp/activation-b1-opaque-{green1,green2}.log`).
Independently omitting the pre-close release mark, cleanup's released-entry
skip, or callback-scope invalidation failed its production-path test, then
passed after restoration
(`/tmp/activation-b1-r5-{opaque_release_mark,opaque_cleanup_skip,opaque_scope}-{red,green}.log`,
each RED exit 1, GREEN exit 0). The older dev/inode ownership claim and its
`cleanup_reuse` proof are superseded; no current safety claim rests on them.

On the corrected source/test bytes, the four-file Bun suite passed **430/430**,
1,834 assertions, exit 0 (`/tmp/activation-b1-opaque-final2-four.log`). Nx
`twilight-burokrat:lint:source`, `:typecheck` and `:build` each printed explicit
success, exit 0 (`/tmp/activation-b1-opaque-final2-{lint,type,build}.log`). The
first full-suite run had one transient raw `/proc/self/fd` total-count failure:
the runtime-extra case saw 15 FDs before and 13 after, with no evidence of a
leak; its isolated rerun passed. That case now asserts no remaining source-root
FDs and no total-count increase, so unrelated harness FD closure cannot fail
the test. The first lint run found two void-returning test shorthand callbacks;
they were fixed, and the declared target then passed. Pinned OpenSpec,
changed-path Prettier and diff check follow on the final ledger bytes; normal
hooks belong to the local correction commit. No real worker, host gate, CI or
trusted activation was run.

Pinned OpenSpec strict passed 1/1 and all passed 143/143, zero failures
(`/tmp/activation-b1-opaque-final2-{strict,all}.json`). Changed-path Prettier
and `git diff --check` passed
(`/tmp/activation-b1-opaque-final2-{format,diff}.log`).

### B2 worker readiness boundary (no selected-command execution)

The first explicit `test:worker` fixture was RED before its capability module
existed: `bun test tools/worker-isolation/capability.test.ts` exited 1 with
`Cannot find module './capability'`. The separate uncached Nx target runs only
that test file and read-only host reporting; it is outside the CLI unit-test
collection. Four capability classification tests pass on the current source.
The required `bun tools/worker-isolation/readiness.ts` and
`nx run twilight-burokrat:test:worker --skip-nx-cache` both exit 1 on this
host, naming Bubblewrap network-namespace EPERM in the default sandbox,
undelegated cgroup controllers, AppArmor `unconfined`, and unrun exact-profile
FD/mount sentinels. The earlier approved elevated inert `/bin/true` probe
succeeded, but establishes namespace setup only. No selected command, worker
fixture, receipt, or activation was executed. The target is not wired into CI
or the h2puni gate before trusted cgroup/AppArmor provisioning and exact
runtime sentinel validation. Task 2.2 remains open.

The source-guard omission watch removed one capability from the classifier at
a time while retaining all other evidence. The named expected reason
disappeared and the mounted test failed for namespace (3/4), cgroup (2/4),
AppArmor (2/4), and FD/mount (2/4); the restored source passed 4/4. These
prove typed reporting/refusal at the readiness classifier boundary, not
actual host isolation. An earlier patch attempt appended three guard lines
outside the function and failed parsing; those syntax failures are
disqualified, and the source was restored before the valid omission watches.
Read-only inspection cannot verify a writable cgroup quota leaf, policy
contents, or FD/mount denial, so no `available` production-path claim or
candidate-run sentinel proof is made.

The retained omission command for each row was `bun
/tmp/activation-b2-mutation.ts <name> >
/tmp/activation-b2-r5-<name>-red.log 2>&1`. That local harness removes only
the named tuple entry in `assessWorkerCapability`, runs `bun test
tools/worker-isolation/capability.test.ts`, reports its exit, and restores
the exact source bytes in `finally`. Each restored run was `bun test
tools/worker-isolation/capability.test.ts >
/tmp/activation-b2-r5-<name>-green.log 2>&1`. These retained files have
the complete assertion diff and Bun summary:

| `<name>`    | Removed production guard | Named RED assertion                                                                                                                                              | RED / restored GREEN      |
| ----------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `namespace` | namespace evidence tuple | `reports all missing controls without treating an unknown namespace as success`: expected `namespace-probe: EPERM` disappears                                    | exit 1, 3/4 / exit 0, 4/4 |
| `cgroup`    | cgroup evidence tuple    | `does not promote namespace success when cgroup delegation is missing`: expected `cgroup-delegation: no delegated quota subtree`, received `available`           | exit 1, 2/4 / exit 0, 4/4 |
| `apparmor`  | AppArmor evidence tuple  | `does not promote namespace success when AppArmor is unconfined`: expected `apparmor-profile: unconfined`, received `available`                                  | exit 1, 2/4 / exit 0, 4/4 |
| `fdmount`   | FD/mount evidence tuple  | `does not promote namespace success when FD and mount isolation is unproven`: expected `fd-mount-support: no exact-profile sentinel proof`, received `available` | exit 1, 2/4 / exit 0, 4/4 |

The committed and post-watch restored source SHA-256 is
`15bc0398af3481f65b8b4cb3e31e1cc51f625dfae3a8e0f6531d35a63c3ea84c`;
`git status --short` was empty after all watches. These logs test the
readiness classifier only and do not run a host probe or selected command.

On the final source bytes, the dedicated Bun suite passed **4/4**, four
assertions, exit 0; `bunx tsc --noEmit -p
tools/worker-isolation/tsconfig.json` and `bunx eslint
tools/worker-isolation` exited 0. Uncached Nx `lint:source`, `typecheck` and
`build` each printed `Successfully ran target`, exit 0. The uncached
`test:worker` target ran only the dedicated four tests and then printed the
four named unavailable reasons above; Nx correctly exited 1 with `Running
target test:worker ... failed`. It was never treated as a passing worker
isolation test. Pinned OpenSpec strict passed 1/1 and all passed 143/143,
zero failures. Changed-path Prettier and `git diff --check` passed. Host gate,
CI, live cgroup quota, loaded AppArmor policy, FD/mount sentinel and selected
worker execution remain unrun. No workflow was wired to this target while
those host prerequisites are absent.

### Ordinary-PR observation design amendment

Planning baseline: local implementation `1520d3b58c34149d0c35b4ac021cc3c2a4f368b9`.
This amendment changes design/spec/tasks/verification only. The first increment is the mounted
read-only provider plus durable reconciliation tick, not deployment or activation. Existing
local foundations and their historical observations above remain scoped to their exact commits.
No new runtime proof is claimed by this amendment; the following rows are acceptance targets.

| Fault family | Independent source fault                                                                                                        | Mounted observation required                                                                                  | Status  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------- |
| F10-P1       | Omit repository, PR, eligibility, target, head/base or explicit source-policy validation separately                             | Foreign/malformed provider response cannot create or replace a current request                                | NOT RUN |
| F10-P2       | Accept arbitrary continuation origin, repeated/conflicting page, missing required pagination state or exceeded bound separately | Invalid discovery refuses before any synthetic successful inventory; no credential sent outside pinned origin | NOT RUN |
| F10-P3       | Stop reconciling durable active subjects absent from discovery                                                                  | Lost-close witness leaves stale request current and fails its persisted-state assertion                       | NOT RUN |
| F10-P4       | Use listing bytes without current refetch; map ambiguous read to closure; discard high-water on draft separately                | Stale-discovery, inaccessible-current and draft-return witnesses fail exact identity/history assertions       | NOT RUN |
| F10-P5       | Remove subject observation-version compare/refetch                                                                              | Held older source response revives or replaces newer durable generation and the mounted race assertion fails  | NOT RUN |
| F11-P1       | Remove finite provider traversal/current-read convergence bounds                                                                | Bounded retry witness observes excess calls or explicit convergence failure at its controlled deadline        | NOT RUN |

Every accepted trial needs the exact named command, injected source omission, intended failing
assertion, RED exit, restored GREEN exit and restored source digest. Compilation errors, unrelated
failures and runner timeouts without the intended observation are disqualified. Where existing
owner guards already have accepted proof, cite the exact existing test/commit and exercise the
new installed adapter composition; do not relabel an old pure test as a new mounted proof.

Not exercised: external GitHub access/authentication, a running scheduler or signed webhook,
independent audit provider, selected-command sandbox, archive publication, required-workflow
rerun/admission, protected merge, actual merged-SHA certification, h2puni installation or WBS.
One-time GitHub/provider/storage/worker/host administration remains a prerequisite; no recurring
per-PR operator step is introduced. WBS 030.6 is not cleared by this local planning increment.

Fresh design checks on 2026-10-07: `bunx @fission-ai/openspec@1.12.0 validate
 automatic-trusted-activation --strict --json` passed 1/1 with zero issues;
`bunx @fission-ai/openspec@1.12.0 validate --all --json` passed 143/143 (125 changes,
18 specs). Explicit four-path Prettier check and `git diff --check` passed. A read-only
word/link/anchor inspection found unchanged intent at 301 words and four resolving local
links/anchors. Runtime tests, fault trials, full Nx/host gate and CI were not run for this
docs-only amendment and are not claimed as passing.

### 1.2 bounded GitHub PR observation source (2026-10-07)

The local `github-source.ts` adapter supplies PR discovery hints and an exact fresh
`currentCandidate` read to the durable `reconcileReady`/`observeDelivery` owner.
The first mounted test was RED before the adapter existed: `bun test
src/activation-controller/github-source.db.test.ts` exited 1 with `Cannot find
module './github-source'`. The restored mounted suite passed 14/14 with 57
assertions. It uses real controller persistence and a fake authenticated reader
port. No HTTP credential, webhook verifier, scheduler, publisher, merge
authority, or live provider is installed by this slice.

The repository binding is trusted controller configuration. Pagination uses
bounded numeric page indices, never a provider URL or cursor, and list entries
cannot authorize a request: every hinted or already active PR is fetched by
number through `currentCandidate` before the source-version-fenced owner write.
An omitted list entry does not imply closure. Only an explicit current closed,
draft, or retargeted state makes this PR ineligible. Missing/malformed current
reads and reader errors refuse without tombstoning. Fork heads are refused
because v1 canonical request identity cannot represent their repository. The
mounted fixtures cover event/timer convergence, an omitted active PR, head/base
movement, retargeting, A → B → A generation advancement, and a list head that
differs from the fresh current head.

Each watch below replaced only the named production condition in
`github-source.ts`, ran `bun test -t '<named test>'
src/activation-controller/github-source.db.test.ts` from the CLI directory,
then restored the original source and ran the same command. The exact command,
exit, and assertion are retained in
`/tmp/activation-github-source-<name>-{red,green}.log`; the watch harness is
`/tmp/activation-github-source-watch.py`. All 11 REDs exited 1 and all 11
restored GREENs exited 0. Source SHA-256 after restoration was
`6d76afe7168c5596696b46dad2428fa4781b3930ba38240fd84628eaad7a2b94`.

| Watch             | Removed condition; observed named RED                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `base_repo`       | Foreign base-repository PR became accepted; expected source refusal was absent.                                                                                                      |
| `fork_head`       | Unsupported fork-head PR became accepted; expected source refusal was absent.                                                                                                        |
| `cursor`          | A skipped page reached a later malformed response instead of the exact cursor refusal; this proves refusal specificity, not an authority grant.                                      |
| `duplicate`       | Duplicate PR across pages was accepted without the expected refusal.                                                                                                                 |
| `page_size`       | Oversized page reached a later PR-number mismatch instead of the page-size refusal; this proves refusal specificity, not an authority grant.                                         |
| `page_bound`      | A continuing 100-page scan returned an incomplete list instead of refusing.                                                                                                          |
| `foreign_locator` | The source read a foreign locator before the controller's later subject guard refused; the named source refusal was absent. This proves the credential-read boundary, not admission. |
| `pr_number`       | A response for another PR number reached the controller's later subject guard; the named source refusal was absent. This proves source specificity, not admission.                   |
| `open`            | A current closed PR was admitted as ready.                                                                                                                                           |
| `draft`           | A current draft PR was admitted as ready.                                                                                                                                            |
| `target`          | A PR currently targeting another branch was admitted as ready.                                                                                                                       |

Task 1.2 remains open: the reader is a required independently authenticated
port, without a production GitHub transport, webhook verification, timer
installation, or provider permission proof. These local tests do not establish
deployed recurrence or clear 030.6.

Final-byte checks for this bounded checkpoint: five controller/source files
passed 444/444 tests with 1,896 assertions (`/tmp/activation-github-source-five.log`);
uncached Nx `twilight-burokrat:lint:source`, `typecheck`, and `build` each
printed `Successfully ran target`, exit 0. Pinned OpenSpec strict validated
1/1 and `--all` validated 143/143, zero failures
(`/tmp/activation-github-source-{strict,all}.json`). Changed-path Prettier
and `git diff --check` exited 0. The h2puni host gate, CI, live GitHub API
transport, webhook signature validation, and deployed timer remain unrun.

### 1.2 PR source correction after exact-SHA review

The earlier `836660f27383c31b8cedc29083be927793500f3c` review found three
bounded gaps: provider reads could hang, the adapter had no two-owner/restart
composition witnesses, and malformed consumed head/base plus unsupported-kind
checks lacked independent mounted omissions. The correction adds a required
trusted `readDeadlineMs` (1–60,000 ms), a whole-list deadline and a current-read
deadline. The reader receives an abort signal; the adapter's own timer rejects
even when the reader ignores it. No provider await holds a SQLite transaction.

Mounted tests now cover hanging list and current reads; two owners with a held
old PR read and newer committed head; three successive competing writes
exhausting the owner's exact retry bound; draft retirement and ready return
across controller close/reopen; and independently malformed consumed head/base
SHAs and a merge-group locator. The first draft/restart fixture expected
generation 2, but the pinned authority began at generation 3. That expectation
was disqualified and corrected to assert a one-generation increase over the
observed first request.

The correction watch used `/tmp/activation-github-source-correction-watch.py`.
For each row it changed only the named production expression, ran the matching
mounted `bun test -t '<name>' src/activation-controller/github-source.db.test.ts`,
restored exact source bytes, and reran the same test. Complete command, exit,
and assertion outputs are retained at
`/tmp/activation-github-source-correction-<watch>-{red,green}.log`. All nine
RED runs exited 1; all restored GREEN runs exited 0; both touched source files
were byte-for-byte restored after the watches.

| Watch               | Injected omission and observed RED                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pre_read_deadline` | Omitted the pre-read guard after page-one validation consumed the whole-list budget; the tick returned success after reading another page instead of refusing.                             |
| `deadline`          | Delayed the source timer by 10 seconds; hanging list and get hit the test watchdog at 300 ms instead of the required source deadline.                                                      |
| `abort`             | Removed `aborter.abort()`; both reads refused by deadline but their signals remained un-aborted. This proves transport cancellation, not the rejection timer.                              |
| `deadline_cap`      | Removed the 60-second configuration cap; a 60,001 ms binding created a controller instead of refusing before any reader call.                                                              |
| `head_schema`       | Broadened consumed `head.sha` to string; malformed bytes reached the later request parser, changing the named source refusal. No authority was granted.                                    |
| `base_schema`       | Broadened consumed `base.sha` to string; malformed bytes reached the later request parser, changing the named source refusal. No authority was granted.                                    |
| `unsupported_kind`  | Removed only the merge-group predicate; the PR reader was called with an unsupported locator and a later PR-number guard refused. This proves the credential-read boundary, not admission. |
| `held_version`      | Removed the controller's subject-version comparison; held old A replaced newer B instead of refetching, failing exact committed request identity.                                          |
| `retry_bound`       | Extended the owner loop from three to four; the contention test observed four reads rather than the required three.                                                                        |

On final bytes, the corrected five-file mounted suite passed **454/454**,
1,937 assertions (`/tmp/activation-github-correction-final2-five.log`). Uncached
Nx `lint:source`, `typecheck`, and `build` each printed `Successfully ran target`,
exit 0. Direct test typecheck also exited 0. Pinned OpenSpec strict passed 1/1
and all passed 143/143, zero failures
(`/tmp/activation-github-correction-final2-{strict,all}.json`). These are local
synthetic source checks. Live GitHub transport/authentication, signed webhook,
deployed timer, host gate, CI and full task 1.2 acceptance remain open.

### GitHub source deadline completion correction

Astra's exact `ad37807164513992a0d5bf0e4b6da8a9d2d89a47` review reproduced
a synchronous 40 ms list/current reader accepted under a 10 ms deadline
(`/tmp/activation-ad37807-astra-deadline.log`). The mounted regression tests
first failed 3/3 at the missing named deadline refusal
(`/tmp/activation-github-deadline-red.log`). The source now arms the timer before
invoking the provider, retains the whole-list abort signal through validation,
and checks monotonic expiry before returning a final list or current observation.
The corrected focused suite passed 5/5, including costly final-page and current
validation (`/tmp/activation-github-deadline-focused-green.log`).

The four single-source fault trials used
`/tmp/activation-github-deadline-watch.py`; each changed the named expression,
ran the matching mounted `bun test -t` command, restored the original bytes,
and reran the same test. Full commands, exits and assertions are retained at
`/tmp/activation-github-deadline-<watch>-{red,green}.log`.

| Watch                 | Injected fault and observed result                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timer_before_reader` | Moved the provider call ahead of timer installation; the mounted provider observed the deadline was not armed. RED exit 1, restored GREEN exit 0.                                      |
| `final_list`          | Omitted final whole-list expiry check; costly last-page validation returned success after its budget. RED exit 1, restored GREEN exit 0.                                               |
| `final_current`       | Omitted final current-observation expiry check; costly response validation committed a late ready request. RED exit 1, restored GREEN exit 0.                                          |
| `post_await`          | A separate post-await check stayed GREEN when omitted because the final-list/current guards still refused the late value. This trial was disqualified and the redundant guard removed. |

The source file was restored after the mutation run; the subsequent removal of
the redundant guard is the only change after its recorded restoration hash.
On the final source and test bytes, the five-file mounted suite passed
**459/459**, 1,957 assertions (`/tmp/activation-github-deadline-final-five.log`).
Uncached Nx `lint:source`, `typecheck`, and `build` each printed
`Successfully ran target`; direct spec-test typecheck exited 0. Pinned OpenSpec
strict passed 1/1 and all passed 143/143
(`/tmp/activation-github-deadline-final-{strict,all}.json`); changed-path
Prettier and `git diff --check` exited 0. These local checks do not verify live
GitHub transport/authentication, a deployed timer, host gate or CI.

### GET-only GitHub REST reader increment (1.2d, local evidence)

Official GitHub REST documentation identifies public unauthenticated pull-request GETs,
`per_page` up to 100, Link pagination, and the anonymous primary rate limit
([pull requests](https://docs.github.com/en/rest/pulls/pulls),
[pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api),
[rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)).
The new transport uses a fixed `https://api.github.com` origin, version
`2026-03-10`, a trusted optional token, GET only, redirect refusal and locally
constructed page URLs. It passes raw JSON to the previously mounted source
boundary; it does not choose PR identity from a response URL. Its only local
effect is a read. Initial missing-module RED was disqualified as setup failure;
the installed controller test then failed at the production reader's
`GitHub REST reader unavailable` refusal before implementation
(`/tmp/activation-github-reader-mounted-red.log`). The first positive fake-HTTP
controller run passed 1/1 (`/tmp/activation-github-reader-first-green.log`).

The exact fault harness `/tmp/activation-github-reader-watch.py` replaced only
one named source expression at a time, ran `bun test -t '<fixture>'
src/activation-controller/github-reader.db.test.ts`, restored source bytes and
reran the same fixture. Every **35** final watch rows was RED exit 1 and
restored GREEN exit 0; commands and assertion output are retained at
`/tmp/activation-github-reader-<watch>-{red,green}.log`, with the final matrix
receipt `/tmp/activation-github-reader-watch-final.log`. The restored reader
SHA-256 was `9bfb5b7613c8850ad24f50773915e329d0a1853aea7ae27061e0c9d764e46908`.
The earlier `link_syntax` trial changed the refusal to a TypeError and the
`link_origin` trial was masked by a different-path fixture; those attempts were
disqualified, then the grammar catch placement and same-path foreign-origin
fixture isolated each final predicate. A first 9/10 suite had an invalid test
projection (`StoredRequest.requestIdentity` instead of `.request.requestIdentity`)
and was disqualified; the corrected 10/10 run preceded expansion. An initial
Prettier command used root-relative paths from the CLI directory and found no
files; it was rerun from repository root.

| Watch group                                                                                  | Exact omitted or altered condition; observed RED                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin`, `version`, `method`, `cache`, `credentials`                                        | Fixed API origin/version or GET/no-store/omit request settings changed; the mounted exact request assertion failed.                                                                                                                                            |
| `redirect`, `token`, `diagnostic_token`                                                      | Redirect follow forwarded the harmless token to the mounted foreign-origin spy; dropping the trusted header failed its exact value assertion; copying token bytes into a transport error failed the no-secret diagnostic assertion.                            |
| `status`, `rate`                                                                             | A 302 reached a later list-shape refusal instead of the non-200 boundary; 429 lost its named retryable rate classification. Neither mutant granted authority.                                                                                                  |
| `link_syntax`, `link_origin`, `link_path`, `link_query`, `link_per_page`, `link_extra_query` | Malformed grammar changed to the distinct URL refusal; each origin/path/query alteration crossed its exact Link refusal and failed the mounted no-second-read or named-error assertion.                                                                        |
| `link_username`, `link_password`, `link_fragment`, `link_page_shape`                         | The corresponding schema-valid Link alteration crossed its own guard; the mounted named refusal changed before any credentialed second read.                                                                                                                   |
| `link_page`, `link_duplicate`, `link_continuation`, `link_last_conflict`                     | Skipped, repeated or contradictory continuation metadata escaped the reader boundary and failed the exact refusal/call-count assertion. A later source/current check still refused in some mutants; those rows prove the reader boundary, not final admission. |
| `length_cap`, `length_shape`, `stream_cap`, `json_parse`                                     | Oversized/malformed length or streamed bytes, or invalid JSON, became an accepted empty inventory when its check was omitted.                                                                                                                                  |
| `body_abort`, `body_missing`, `list_shape`                                                   | Removing post-read abort made a cancelled direct reader return `[]`; null-body and list-shape omissions changed to later TypeError/source-schema refusals, without admitting a request.                                                                        |
| `page_bound`, `number_bound`, `current_link`, `empty_token`                                  | The direct reader made forbidden page 101 or PR 0 GETs; a paginated current response created a request; empty trusted token constructed a reader before any provider call.                                                                                     |

This fake-HTTP composition proves refusal and credential routing of the local
reader port. It does not prove live GitHub connectivity, a protected credential
issuer, scheduled process, webhook verification or independent audit provenance.
One anonymous public GET smoke through the actual reader was attempted with an
8-second abort and no token; it exited 1 at the named
`GitHub PR GET unavailable` transport boundary
(`/tmp/activation-github-reader-anonymous-smoke.log`). Live connectivity
therefore remains unverified; this refusal was not counted as a passing live test.
The final six-file mounted suite passed **496/496**, 2,091 assertions
(`/tmp/activation-github-reader-final-six.log`).
Uncached Nx `lint:source`, `typecheck` and `build` each printed
`Successfully ran target` with exit 0; direct spec-test TypeScript checking
exited 0. Pinned OpenSpec strict passed 1/1 and all passed 143/143
(`/tmp/activation-github-reader-final-{strict,all}.json`). The first
changed-path Prettier check found only this appended ledger unformatted; after
formatting it, changed-path Prettier and `git diff --check` exited 0.

### GET-only reader review correction (local evidence)

Astra's exact `ff7e6a7` review reproduced three failures: a stream error leaked
a harmless Bearer sentinel, refused HTTP/oversized streams were not canceled,
and contradictory `prev`/`first` Link relations ended discovery as a complete
inventory. Mounted tests first failed **6/43** at those exact assertions. The
reader now normalizes body/cleanup errors without echoing provider text, actively
cancels refused bodies and aborted reads, and checks `prev = current - 1`,
`first = 1`, and `last >= current`. A valid page-two Link remains accepted.

`/tmp/activation-github-reader-fix-watch.py` applied one source omission at a
time to `github-reader.ts`, ran the named mounted test, restored source bytes,
and reran that test. Logs at
`/tmp/activation-github-reader-fix-<watch>-{red,green}.log` retain exact commands,
exits and assertions. Nine final watches were RED then restored GREEN:

| Watch                                                 | Observed RED                                                                                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redact_stream`, `redact_cleanup`                     | Replacing the safe error with the raw exception leaked the harmless Bearer sentinel; the named no-secret/type assertion failed (exit 1).                                   |
| `cancel_status`, `cancel_declared`, `cancel_streamed` | The rejected response stream's cancel count became zero instead of one (exit 1).                                                                                           |
| `cancel_abort`                                        | Removing the abort listener left the pending read unsettled; the explicit `timeout 4s` wrapper returned 124. Restored test settled and observed one cancellation (exit 0). |
| `link_prev`, `link_first`, `link_last`                | The contradictory relation was accepted; the named refusal assertion failed (exit 1).                                                                                      |

The first abort mutation removed the `Promise.race` consumer while leaving its
rejecting promise active; Bun reported an unhandled AbortError rather than the
intended cancellation assertion. That trial was disqualified. The final listener
omission above is the bounded liveness witness. The restored source SHA-256
at this correction checkpoint was
`c154408177a8cf26de3e968b2cdacc41c86849213c742f700791da4291e4d728`
(`/tmp/activation-github-reader-fix-watch-final.log`).
The correction proves only local fake-HTTP behavior. Whole-tick retry metadata
and cancellation, a deployed scheduler, live GitHub connectivity, host gate and
CI remain unverified and outside this slice.

The mounted six-file suite at this checkpoint passed **506/506**, 2,118 assertions
(`/tmp/activation-github-reader-fix-final3-six.log`). Uncached Nx
`twilight-burokrat:lint:source`, `typecheck` and `build` each printed
`Successfully ran target` with exit 0
(`/tmp/activation-github-reader-fix-final3-{lint,type,build}.log`). An earlier
Nx attempt without `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` exited 0 after
socket refusal without printing a target summary; it was disqualified, not
counted as a passing check. Pinned OpenSpec strict and all passed on the
correction; final docs-only formatting and validation follow this ledger edit.

### Late fetch-response abort correction

Astra's exact `6bd648b` review reproduced one remaining body lifecycle gap:
fetch returned an open response after its signal had been aborted, and the
reader threw before canceling that body (cancel count zero). The mounted
`fetch response arriving after abort cancels its unopened body` fixture first
failed with `Expected: 1; Received: 0`. The reader now cancels the returned
body before propagating the abort. Removing only that cancellation made the
same fixture RED exit 1 at the cancel-count assertion; restored source was
GREEN exit 0. Exact commands, output and exits are retained at
`/tmp/activation-github-reader-late-abort-{red,green}.log`; the restored
source SHA-256 before subsequent formatting was
`08db6c6229ef6e3b8524d78218fb7a3eef4b9d14d5913d6248444952a05fc83f`.
This adds no live transport, scheduler, retry policy or external provenance.

Final six-file mounted tests passed **507/507**, 2,121 assertions
(`/tmp/activation-github-reader-late-abort-final-six.log`). Uncached Nx
`twilight-burokrat:lint:source`, `typecheck` and `build` each printed
`Successfully ran target` with exit 0. Pinned OpenSpec strict passed 1/1 and
all passed 143/143; changed-path Prettier and `git diff --check` passed. These
are local checks; host gate, CI, live GitHub reads and a deployed scheduler
remain unrun.
