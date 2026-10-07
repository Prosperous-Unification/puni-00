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
