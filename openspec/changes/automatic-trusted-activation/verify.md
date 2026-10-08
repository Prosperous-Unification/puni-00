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
At this planning-amendment checkpoint, the mounted tests below had not run;
later local implementation evidence is recorded by slice below.

## Task completion and delta sync

Only the locally proved 1.2e–1.2h slices are now checked. Parent tasks 1.1/1.2,
all later stages, archive and capability sync remain open. No existing spec is
marked fulfilled.
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
No new runtime proof was claimed by this amendment; the following NOT RUN
statuses are its historical planning snapshot. Later ordinary-PR observation
sections record local F10-P/F11-P tests without claiming live deployment.

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

### Observation tick design amendment after `e13eee341`

Baseline: `e13eee341ed29ac43d6846a009bf5cab616017c1`; docs-only isolated plan branch.
This amendment added a finite observation composition and uninstalled service/timer acceptance
contract after GET transport task 1.2d. No runtime changes, service artifacts, deployments or
new safety proofs had been executed by that planning amendment. The NOT RUN rows below are
its historical baseline, not the current status of local F10-T1–T5, F11-T1/T2 or F1-T1
proofs; later 1.2e–1.2h sections record those local results.

| Fault family | Independent fault to inject                                                                                                                  | Mounted witness / expected failing observation                                                                               | Status  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------- |
| F10-T1       | Skip process lock; release ownership before tick settlement/DB close; replace live lock inode separately                                     | Two real local processes overlap provider reads or a held old owner can write after a new owner starts                       | NOT RUN |
| F10-T2       | Auto-create absent established DB; accept corrupt/partial/wrong-bound state; omit initialization exclusion or attempt reservation separately | No-read refusal, non-overwrite, crash/reopen budget or additive rollback preservation assertion fails                        | NOT RUN |
| F10-T3       | Omit pre-read cancellation, transactional cancellation fence or monotonic commit-expiry guard separately                                     | Held response writes after cancellation, another GET begins, or synchronous over-budget work commits                         | NOT RUN |
| F10-T4       | Close DB/release lock before controller continuation settles; discard original cleanup failure; report partial tick as complete separately   | Lifecycle ordering, aggregate-error or incomplete-completion assertion fails; arbitrary runner timeout is not accepted proof | NOT RUN |
| F11-T1       | Default malformed supplied retry timing; ignore later provider minimum; shorten out-of-horizon minimum; erase persisted cooldown separately  | Mounted invalid-header or restart/clock/provider-bound assertion fails before forbidden GET                                  | NOT RUN |
| F11-T2       | Reset interrupted attempts; remove finite burst/probe interval; clear failed health without full reconciliation separately                   | Crash/reopen consumes too few attempts, probe starts early or incomplete tick falsely restores health                        | NOT RUN |
| F1-T1        | Remove a required service account/path/confinement/timeout/group-termination/restart setting separately                                      | Production artifact validator rejects the mutated rendered unit; this is structural proof, not installed systemd confinement | NOT RUN |
| F10-T5       | Wire a forbidden evaluation/worker/review/publication/admission/merge/WBS effect into observation composition                                | Mounted success/refusal/cancellation fixture observes a forbidden call and fails                                             | NOT RUN |

R5 records must include each exact command and source omission, intended failing assertion,
RED/restored GREEN exits, output retention and restored source digest; unrelated compilation,
cleanup-only or timeout failures do not prove the intended guard. Existing source/reader tests
remain credited to their exact historical checkpoint; composition claims require this new path.
Fresh temporary stores and synthetic bootstrap/provider fixtures prove local behavior only.

Not verified here: a running scheduler, process confinement by installed systemd, independent
bootstrap authority, live credential/provider access, h2puni configuration, worker sandbox,
review, publication, admission, merge or WBS closure. Actual unit deployment and protected
account/path/pin provisioning remain authorized one-time administration. 030.6 stays blocked.

Fresh docs-only checks on 2026-10-07: strict OpenSpec
`bunx @fission-ai/openspec@1.12.0 validate automatic-trusted-activation --strict --json`
passed 1/1 with zero issues; `bunx @fission-ai/openspec@1.12.0 validate --all --json`
passed 143/143 (125 changes, 18 specs). Explicit four-path Prettier and `git diff --check`
passed. Read-only link/anchor inspection found five resolving local links and unchanged
301-word intent. Runtime tests, omission trials, unit rendering/systemd acceptance, full Nx,
host gate and CI were not run for this planning amendment.

### Local task 1.2e protected observation state and process lock

The local 1.2e implementation adds explicit new-store initialization, an additive v8→v9
scheduler migration, an established-state open that refuses absent or malformed stores, and
one stable host-local `flock` inode covering initialization, migration and attempted work.
The scheduled path reserves its attempt transactionally before caller work. The version-nine
controller reopens that database without resetting the scheduler row. The mounted
two-process fixture holds a first process through async work, observes a second return
`busy` without executing its callback, kills the first process, then reopens on the same
lock inode with the next durable attempt sequence. A mounted cleanup fault preserves both
the work failure and database-close failure.

`bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/observation-state.db.test.ts`
passed **14/14**, 66 assertions on current pre-format implementation bytes. The first
production-stub run was RED; a missing-module RED was disqualified. Each watched RED and
restored GREEN transcript includes its exact `bun test ... -t '<name>'` command and exit at
`/tmp/activation-observation-state-<fault>-{red,green}.log`.

| Fault                 | RED/GREEN exits | Observed changed assertion or boundary                                                                                    |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `lock_acquire`        | 1/0             | Second real process entered during held work.                                                                             |
| `lock_inode_replaced` | 1/0             | Removing the stable inode let another process enter.                                                                      |
| `lock_early_release`  | 1/0             | Closing before awaited work let the probe own and call work.                                                              |
| `errno`               | 1/0             | Treating contention as unmodeled error made probe exit 1 instead of explicit busy/exit 0; diagnostic specificity only.    |
| `state_absent`        | 1/0             | Normal scheduled invocation created a database despite refusal.                                                           |
| `init_exclusion`      | 1/0             | Changed named already-exists refusal to `EEXIST`; no-replace link still prevented overwrite; diagnostic specificity only. |
| `bootstrap_pin`       | 1/0             | Wrong pinned bytes initialized state.                                                                                     |
| `path_mode`           | 1/0             | Mode-0755 protected path initialized.                                                                                     |
| `schema_tables`       | 1/0             | Scheduled callback ran after activation delivery table removal.                                                           |
| `binding`             | 1/0             | Wrong repository/policy binding consumed an attempt.                                                                      |
| `attempt_budget`      | 1/0             | Third persisted attempt began past the limit.                                                                             |
| `attempt_persist`     | 1/0             | Post-crash attempt reused sequence one.                                                                                   |
| `migration_foreign`   | 1/0             | Foreign repository history migrated.                                                                                      |
| `migration_split`     | 1/0             | Late failure left v9 schema instead of full v8 rollback.                                                                  |
| `cleanup`             | 1/0             | Close fault replaced original observation fault instead of aggregating both.                                              |

The first early-release mutation failed during fixture initialization with `EBADF` and was
disqualified. The corrected real-process fixture seeds an established v9 store before
mutating early close; its RED reaches the second-process ownership assertion. Source was
restored after every fault; the historical pre-comment restore digest was
`a91158311a4331bdbe110220add9211e2f3a8015a14629f1c39a50577971ae07`.
The errno/cleanup restore digests are in their transcripts. Those historical digests do not
claim to be the final formatted source hash.

This is local storage and ownership evidence only. Task 1.2f finite tick, cancellation and
settle-before-close; 1.2g retry timing; installed systemd, h2puni gate, CI, live GitHub,
worker isolation and production bootstrap provisioning remain unverified here.

Final local-byte validation for this bounded checkpoint: explicit seven-file activation
controller suite **521/521**, 2,187 assertions; uncached Nx
`twilight-burokrat:lint:source`, `typecheck` and `build` each printed
`Successfully ran target` with exit 0. Changed-path Prettier check and
`git diff --check` passed. The initial `bun test <directory>` trial accidentally
collected generated `dist/out-tsc` JavaScript and failed module resolution; it was
disqualified. The corrected explicit source-file invocation above is the accepted suite.
Strict/all OpenSpec, normal commit hooks and host gate are recorded separately after
their final run; no runtime scheduler or host gate claim follows from these local checks.

### 1.2e exact-review correction after `91b2deade`

Astra's public-entry probe at `/tmp/activation-91b2dea-astra-probes.log` found that a
hard-linked database in a second protected directory could use a second lock inode;
`/link/.` was accepted; partial v8/v9 check tables, subject-only foreign tombstones and
inconsistent attempt counters crossed the scheduled/migration boundary; and explicit
initialization/migration/open cleanup could replace the primary failure. These were
mounted as local production-path regressions. Correction also checks canonical ancestry,
complete required table/column/index inventory and essential `CHECK` constraints,
validates the scheduler's equal counters/null-time relation, and joins migration history
inside its write transaction. The initializer and migration aggregate primary, rollback,
close and temporary-file cleanup failures rather than discarding an earlier cause.

For each row below, the exact source substitution, named `bun test ... -t` command,
failure output and exit are retained in
`/tmp/activation-observation-state-correction-<fault>-red.log`; the corresponding
`-green.log` records the same test on restored source. Every accepted row exited **1/0**.
The restoration digests before subsequent Proof comments/formatting are recorded in
`/tmp/activation-observation-state-correction-watch-summary.log`,
`/tmp/activation-observation-state-cleanup-watch-summary.log` and each later transcript.

| Fault                  | Named failing observation when the production guard was omitted                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hardlink`             | Hard-linked database let the second directory's scheduled callback run.                                                                                                                          |
| `canonical`            | `directory/.` alias passed lexical state-path admission.                                                                                                                                         |
| `ancestor_symlink`     | Ordinary final nested directory under a symlinked ancestor initialized.                                                                                                                          |
| `ancestor_replaceable` | A 0777 non-sticky parent was admitted.                                                                                                                                                           |
| `path_owner`           | Independently mismatched protected-path UID initialized.                                                                                                                                         |
| `path_type`            | File-as-state-directory reached `ENOTDIR` instead of the named type refusal; diagnostic specificity only. First mode-masked trial stayed GREEN and was disqualified before the isolated fixture. |
| `lock_owner`           | Independently mismatched lock UID initialized.                                                                                                                                                   |
| `lock_mode`            | A mode-0644 lock admitted work.                                                                                                                                                                  |
| `lock_nlink`           | A hard-linked lock inode admitted work.                                                                                                                                                          |
| `schema_check_fact`    | Missing v9 check fact table ran the scheduled callback.                                                                                                                                          |
| `schema_check_attempt` | Missing v9 check attempt table ran the scheduled callback.                                                                                                                                       |
| `schema_v8_fact`       | Missing v8 check fact table migrated to v9.                                                                                                                                                      |
| `schema_columns`       | Delivery table without `payload_digest` ran callback.                                                                                                                                            |
| `schema_index`         | Missing dispatch request index ran callback.                                                                                                                                                     |
| `schema_constraint`    | Unconstrained check progress table ran callback.                                                                                                                                                 |
| `schema_version`       | Version-ten store spent an observation attempt.                                                                                                                                                  |
| `foreign_subject`      | Subject-only foreign repository tombstone migrated.                                                                                                                                              |
| `migration_order`      | Moving `BEGIN IMMEDIATE` after repository preflight admitted a row inserted at write-turn acquisition.                                                                                           |
| `counter_equal`        | Sequence one/burst zero with valid timestamp ran callback.                                                                                                                                       |
| `counter_time`         | Sequence one/burst one with null timestamp ran callback.                                                                                                                                         |
| `policy_min_attempt`   | Zero attempt budget initialized.                                                                                                                                                                 |
| `policy_min_tick`      | Zero tick duration initialized.                                                                                                                                                                  |
| `policy_attempt`       | Attempt limit 101 initialized.                                                                                                                                                                   |
| `policy_tick`          | Tick bound 3,600,001 ms initialized.                                                                                                                                                             |
| `clock_integer`        | NaN/non-integer clock spent an attempt.                                                                                                                                                          |
| `clock_negative`       | Negative clock spent an attempt.                                                                                                                                                                 |
| `init_cleanup`         | Initialization close fault displaced its primary schema fault.                                                                                                                                   |
| `migration_cleanup`    | Migration close fault displaced its primary late fault.                                                                                                                                          |
| `open_cleanup`         | Failed established-open close displaced the partial-schema fault.                                                                                                                                |
| `rollback_cleanup`     | Rollback fault displaced the migration work fault.                                                                                                                                               |

The current scheduler increments sequence and burst together and caps both through the
finite attempt policy; after validating equality, sequence overflow is unreachable before
budget refusal, so its redundant predicate was removed rather than claiming an isolated
watch. The type-guard watch proves a named diagnostic, not work admission. The corrected
tests include explicit v8 and v9 partial stores, a two-directory hard-link case, a
write-turn repository race, and each owned cleanup path. This remains a local checkpoint:
installed host paths/account, whole tick cancellation/settlement, CI and h2puni gate are
unverified. Task 1.2f and all external acceptance remain open.

On the corrected final runtime bytes, the explicit source-file activation-controller
suite passed **538/538**, 2,293 assertions (seven files;
`/tmp/activation-observation-state-correction-final-suite.log`). The exact command was
`bash -c 'mapfile -t files < <(rg --files apps/twilight-structure/twilight-burokrat/cli/src/activation-controller -g "*.test.ts"); bun test "${files[@]}"'`.
Uncached Nx `twilight-burokrat:lint:source`, `typecheck`, and `build` each printed
`Successfully ran target` with exit 0. Strict OpenSpec passed 1/1 and all passed
143/143. Changed-path Prettier and `git diff --check` passed. Normal commit hooks and
exact local SHA follow in the commit record; CI and the h2puni gate have not run.

### 1.2e structural and ownership review correction

Astra's exact `001e12c` read-only probes found that name-only index/CHECK
validation accepted a same-named nonunique index on the wrong table, `CHECK(1)`,
and a scheduler with two rows. A foreign-owned 0755 or sticky 1777 ancestor
could replace a protected child; scheduled rollback could mask its primary
error. The corrected boundary checks required PK, FK and nullability metadata,
essential CHECK predicates, exact index table/SQL and exact singleton scheduler
DDL before callback. The owner check now requires each ancestor to belong to
the service or trusted root owner. The real two-process lock test now seeds v9
through the production migration, rather than a stale handwritten table.

The old `ancestor_symlink`, `lock_owner` and `foreign_subject` watches above
are **disqualified**: the first stopped at a direct symlink before the nested
case, the second shifted a call-count UID mock into a later path check, and the
third caused a SQL bind-arity error. The replacements separately exercise a
nested symlink, an fstat-only wrong lock UID in a child process, and a subject
branch disabled with `AND 0` while preserving its bind parameter. Each
replacement source omission reached its named assertion; restored source
passed the same test.

`python3 /tmp/activation-12e-watch.py` ran each exact isolated source
substitution and restored source in a `finally` block. The named logs
`/tmp/activation-12e-<fault>-{red,green}.log` include the literal Bun command,
exit code and assertion. All rows below are RED exit 1 / restored GREEN exit 0.
The pre-comment source restoration SHA-256 was
`d3ccb121c163cf283aa291ab4c60627a740e04e757af078543308e7efa9381f6`.

| Fault                 | Production-path observation with only that guard removed        |
| --------------------- | --------------------------------------------------------------- |
| `nested_symlink`      | Nested symlink no longer gave the named symlink refusal.        |
| `ancestor_owner`      | Foreign-owned 0755/1777 parent initialized instead of refusing. |
| `lock_owner`          | fstat-only wrong lock owner initialized instead of refusing.    |
| `foreign_subject`     | Subject-only foreign tombstone migrated without a bind error.   |
| `weak_check`          | A matching table with `CHECK(1)` ran scheduled work.            |
| `primary_key`         | A named progress table without its primary key ran work.        |
| `not_null`            | A nullable owner column ran work.                               |
| `foreign_key`         | A progress table without its reservation FK ran work.           |
| `index_binding`       | A same-named nonunique index on the wrong table ran work.       |
| `schedule_definition` | A two-row unconstrained scheduler ran work.                     |
| `unsafe_start`        | An unsafe persisted start timestamp ran work.                   |

`python3 /tmp/activation-12e-rollback-watch.py` independently replaced only
the scheduled owner's rollback aggregation with raw rollback. The named
scheduled-rollback test failed when the primary budget fault disappeared behind
the injected rollback fault (exit 1), then passed restored (exit 0). Logs are
`/tmp/activation-12e-scheduled-rollback-{red,green}.log`; source restoration
SHA-256 was `83e655b1ee9922dbecc5f3561f45e1d72b1c5b7676c03d55b480f843124e5069`.
These are historical mutation/restoration hashes, not claims about the final
formatted source bytes. No installed scheduler, host gate or CI is verified.

Final correction bytes: the explicit seven-file Bun suite passed **542/542**,
2,335 assertions (`/tmp/activation-12e-final-seven-formatted.log`). Uncached Nx
`twilight-burokrat:lint:source`, `typecheck` and `build` each completed with
`Successfully ran target` and exit 0 in
`/tmp/activation-12e-nx-{lint-final,typecheck,build}.log`. The first lint run
found unsafe fixture helper typing; those diagnostics were fixed and the final
lint passed. Pinned OpenSpec strict passed 1/1 and all passed 143/143 at
`/tmp/activation-12e-openspec-{strict,all}.json`. Changed-path Prettier and
`git diff --check` passed. These local checks do not replace CI or the required
h2puni gate, which remain unrun on this unpublished branch.

### 1.2e exact schema-signature correction after `a225cb3ae`

Astra's public-entry probe `/tmp/activation-a225cb3-astra-probes.log`
showed three stores that still ran scheduled work: a nullable delivery
`source_id` inside its composite primary key, a review invocation column
without its inline `UNIQUE`, and an attempt table whose two-column foreign
key was split into two independent one-column keys. The earlier validator
excluded all PK columns from its nullability check, inventoried only two
named indexes, and flattened foreign key members without grouping. The
corrected read compares known v8/v9 declared types and nullability (including
PK members), complete primary/inline-unique/named-index signatures, and
ordered foreign-key groups and actions. Index keys also require the owned
binary ascending attributes. Legacy `TEXT PRIMARY KEY` columns
whose owned schema reports `notnull=0` retain that exact known signature;
the composite PK columns explicitly declared `NOT NULL` require `notnull=1`.

Four named production-path tests replace one structural property each while
leaving all other properties valid, then compare the full scheduler row and
corrupt table SQL after refusal. `/tmp/activation-12e-structure-watch.py`
independently omitted each new comparison and restored source after the same
test. The corresponding `/tmp/activation-12e-structure-<fault>-{red,green}.log`
retains literal command, exit and assertion; every row is RED exit 1 and
restored GREEN exit 0. The pre-comment restoration SHA-256 was
`6a12fb6fd36e693092f6c84895bcc08736f027345b8b74ff965aa90a03b3e7e8`.

| Fault             | Mounted effect with only the comparison removed                                |
| ----------------- | ------------------------------------------------------------------------------ |
| `pk_nullability`  | Nullable `activation_delivery.source_id` ran scheduled work.                   |
| `inline_unique`   | Missing `activation_review_attempt.invocation_id UNIQUE` ran work.             |
| `column_affinity` | `payload_digest INTEGER` replaced the owned TEXT declaration and ran work.     |
| `composite_fk`    | Two independent attempt→obligation FKs replaced one composite FK and ran work. |

The separate `collated-delivery-pk` fixture changed only the first delivery
PK column to `COLLATE NOCASE`; omitting the `index_xinfo` binary/ascending
comparison ran work (RED exit 1), restoring it refused before work (GREEN
exit 0). `/tmp/activation-12e-collation-{red,green}.log` contains the literal
commands and outcomes; restoration SHA-256 was
`dc474cb90f54b018c22eea68a641669e7aa0043afa8727d83807306c5d3855fc`.

The `nested_symlink` omission from the preceding section changed refusal
specificity only: the following ancestor-type guard still refused. Its
adjacent source `Proof:` now states that observed diagnostic result; the
historical claim of admitted work remains disqualified. CI, host gate and an
installed scheduler remain unverified for this local correction.

On the final corrected runtime bytes, the explicit seven-file suite passed
**547/547**, 2,370 assertions (`/tmp/activation-12e-structure-final-seven.log`).
Uncached Nx lint:source, typecheck and build each printed `Successfully ran
target` with exit 0 (`/tmp/activation-12e-structure-nx-{lint,typecheck,build}.log`).
Pinned OpenSpec strict passed 1/1 and all passed 143/143
(`/tmp/activation-12e-structure-openspec-{strict,all}.json`); changed-path
Prettier and `git diff --check` passed. Normal commit hooks run with the local
commit. No host gate or CI ran on this unpublished local SHA.

### 1.2f finite observation tick, local composition only

The observation-only tick composes the protected scheduled owner, GitHub source
and controller under one monotonic deadline and caller signal. It refuses
incomplete success, keeps earlier committed subjects, waits for its controller
continuation before closing SQLite or releasing the process lock, and exits a
supervised child with status 124 if local cleanup cannot settle. CLI statuses
for complete/busy/deadline/SIGINT/SIGTERM are 0/75/124/130/143. A complete
tick leaves its request `observed`, without a lease, obligation, attempt,
review-dispatch or check-dispatch row. A mounted fetch spy records no outbound
effect call. No service/timer, live GitHub read, worker, reviewer, publisher,
admission, merge or WBS integration is claimed.

Mounted tests cover abort-ignoring held list/current reads, already-cancelled
preflight, cancellation during response validation, stale source-version retry,
cancellation just after one subject commits, synchronous transaction overrun,
retention of an earlier subject commit, cleanup aggregation, and real
SIGINT/SIGTERM children. A separate real child holds the process lock until
exit 124 after cleanup expiry; a second process sees `busy` before that exit.

The isolated source substitutions are retained as
`/tmp/activation-f10-<fault>-{red,green}.log`. Each log includes the literal
`bun test <source file> --test-name-pattern <witness>` command, exit and named
assertion. Every accepted row below is RED exit 1 / restored GREEN exit 0.
Each GREEN log records the restored source SHA-256. These are historical
mutation hashes, not claims about subsequently formatted bytes.

| Fault                                                     | Mounted RED with only that dependency changed                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `controller_pre_read`                                     | Already-cancelled tick called `readyCandidates` once instead of zero.                                               |
| `controller_post_list`                                    | Cancelled discovery still queried durable active subjects once.                                                     |
| `controller_next_read`                                    | Stale retry called current twice instead of once after cancellation.                                                |
| `controller_post_read`                                    | Abort-ignoring current response started `BEGIN IMMEDIATE` after abort.                                              |
| `controller_transaction_entry`                            | Cancellation at `BEGIN` attempted two subject writes before rollback.                                               |
| `controller_final_commit`                                 | Synchronous over-budget transaction committed one request instead of rolling back.                                  |
| `controller_final_outcome`                                | Abort after a subject COMMIT returned complete instead of refusing while retaining that commit.                     |
| `controller_deadline_shape`                               | A NaN fence completed a provider scan instead of refusing.                                                          |
| `source_pre_cancel`                                       | Already-aborted discovery called its reader once instead of zero.                                                   |
| `source_list_signal`, `source_parent_signal`              | Each list/get signal omission left the held reader signal un-aborted.                                               |
| `source_cancel_reject`                                    | An abort-ignoring list read hit the mounted watchdog instead of settling.                                           |
| `source_list_final_cancel`, `source_current_final_cancel` | Cancellation during consumed-response validation returned a complete list or ready selection.                       |
| `tick_pre_cancel`                                         | Already-aborted tick returned complete and called the provider.                                                     |
| `tick_await_settle`                                       | Omitting await closed SQLite while the controller continuation still used it.                                       |
| `cleanup_fatal`                                           | Omitting fatal cleanup-budget exit left the held child alive until the watchdog.                                    |
| `cleanup_aggregate`                                       | Dropping one cleanup cause lost the provider/close dual-error assertion.                                            |
| `cli_busy_exit`                                           | Busy mapped to success 0 instead of 75.                                                                             |
| `cleanup_bound`                                           | Zero cleanup budget completed instead of refusing malformed policy.                                                 |
| `forbidden_claim`, `forbidden_dispatch`                   | Injected evaluation claim set `lease_owner=forbidden-probe`; injected fetch raised the zero-effect-call spy to one. |

The first `source_cancel_race` trial is **disqualified**: dropping the race
member left its cancellation promise rejecting without an observer, so the
test failed on an unhandled rejection rather than liveness. The corrected
`source_cancel_reject` watch fails at the named watchdog assertion. An initial
`forbidden_claim` trial used the wrong `identity` property and failed at
`request absent`; its log was replaced by the correct `requestIdentity` trial.
`tick_bound` is diagnostic only: removing this duplicate pre-lock validation
changed the refusal to the existing state-policy parser's error, without
admitting work. Its RED/GREEN logs are retained but it is not credited as a
safety bypass.

Final local validation used the explicit eight-file command
`bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/{bootstrap.test.ts,request.test.ts,ingress.test.ts,controller.db.test.ts,github-reader.db.test.ts,github-source.db.test.ts,observation-state.db.test.ts,observation-tick.db.test.ts}`:
**572/572**, 2,474 assertions, exit 0 at `/tmp/activation-f10-final-eight.log`.
Uncached Nx `twilight-burokrat:lint:source`, `typecheck` and `build` each
printed `Successfully ran target` and exit 0 at
`/tmp/activation-f10-nx-{lint-final,typecheck,build}.log`. The first lint
attempt failed on fixture method typing; direct ESLint named the lines,
they were corrected, and the declared target then passed. Pinned OpenSpec
strict passed 1/1 and all passed 143/143 at
`/tmp/activation-f10-openspec-{strict,all}.json`. Changed-path Prettier and
`git diff --check` passed. Normal commit hooks follow with the local commit.
The host gate cannot validate this unpublished SHA until it exists on the
target host; no CI, host-wide lock or deployment ran here.

#### 1.2f bounded cleanup, subject policy and CLI diagnostic correction

After the 65a53a8 local checkpoint, mounted corrections prove that a synchronous
controller close cannot return a successful tick after the monotonic whole-tick
deadline or release the process lock after the absolute cleanup deadline. The
real controller-close and scheduler-database-close children each write
`close-entered`, hold the lock while synchronous close runs, and exit 124
before `close-returned`; another owner observes `busy`. A separate
witness crosses only the tick deadline within cleanup grace and returns
`cancelled`, not `complete`. Timer callbacks are wakeups, never deadline authority.

The required protected `maxSubjects` policy is an integer in 1..10,000 and is
included in the existing configuration identity. The controller bounds the
ready-plus-durable-active subject union before any authoritative current read;
a disjoint ready/active overflow leaves all request rows unchanged. The durable
active query itself reads at most `maxSubjects + 1` rows. There is no policy
default or successful truncation. The CLI reports thrown tick failures through
a required typed diagnostic callback with a fixed action and code; a provider
`Bearer harmless-sentinel-token` error never reaches the reporter. Busy and
cancelled retain their modeled exit statuses.

The isolated mutation harness `/tmp/activation-f10-correction-watch.py` ran each
`bun test <file> --test-name-pattern <name>` command and retained its literal
command, stdout/stderr, exit and restored source SHA-256 in
`/tmp/activation-f10-correction-<fault>-{red,green}.log`. All ten accepted
rows below are RED exit 1 and restored GREEN exit 0.

| Fault          | Exact mounted RED observation                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `fence_cap`    | A NaN subject budget called discovery once instead of refusing before a provider read; a later SQLite datatype mismatch also refused. |
| `ready_cap`    | Two ready subjects were accepted instead of the named `subject limit` refusal.                                                        |
| `union_cap`    | One ready plus one disjoint durable subject was accepted instead of refusal.                                                          |
| `sync_cleanup` | Both controller-close and scheduler-close children wrote `close-returned` before fatal exit; each required absence assertion failed.  |
| `lock_release` | Skipping the lock-held final deadline callback let scheduler closure write `close-returned`; the absence assertion failed.            |
| `post_close`   | Synchronous close returned `complete` instead of `cancelled` inside cleanup grace.                                                    |
| `cli_report`   | Failure returned exit 1 but the required diagnostic array was empty.                                                                  |
| `cli_redact`   | The reported action contained `Bearer harmless-sentinel-token`.                                                                       |
| `policy_cap`   | Policy with `maxSubjects=10,001` initialized instead of refusing.                                                                     |
| `policy_lower` | Policy with `maxSubjects=0` initialized instead of refusing.                                                                          |

The initial ready-cap omission was disqualified: a second, redundant map-size
guard still refused, so it did not prove the first guard. The redundant
candidate-count guard was removed; the retained map-size guard produced the
listed RED. The first post-close omission was likewise masked by a second
final fence; the redundant inner fence was removed and the final fence
produced the listed RED. No worker, reviewer, publisher, admission, merge,
WBS write, installed service or host gate was exercised by this correction.

Final local eight-file run on the corrected bytes: `bun test
apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/{bootstrap.test.ts,request.test.ts,ingress.test.ts,controller.db.test.ts,github-reader.db.test.ts,github-source.db.test.ts,observation-state.db.test.ts,observation-tick.db.test.ts}`
passed **579/579**, 2,510 assertions, exit 0 at
`/tmp/activation-f10-correction-final-eight-fixed.log`. Two preceding full
runs had one unrelated selected-check fixture failure: a global `/proc/self/fd`
count fell 15→13 and 15→14 while source-root descriptors were already closed;
the exact test passed in isolation. Its assertion now checks that no descriptor
targets either owned source tree, so unrelated descriptor closure cannot mask
the intended lifecycle observation. Uncached Nx lint:source, typecheck and
build each exited 0; pinned OpenSpec strict passed 1/1 and all passed 143/143;
changed-path Prettier and `git diff --check` passed. Normal commit hooks run
with the local commit. The h2puni gate, CI and installed service were not run
on this unpublished SHA.

#### Exact-review 1.2f proof follow-up

The previous `fence_cap` log only changed refusal specificity: without the
preflight a NaN `LIMIT` caused a SQLite datatype error after discovery. The
corrected mounted test asserts zero discovery calls before checking the named
refusal. Omitting only that preflight now fails `Expected: 0; Received: 1`;
RED exit 1/restored GREEN exit 0 at
`/tmp/activation-f10-review-fence_cap-{red,green}.log`. It does **not** claim
that a current read or durable admission occurred.

A composed `runObservationTick` test uses protected `maxSubjects=1` and two
ready PRs. Omitting only `maxSubjects: config.state.policy.maxSubjects` from
the controller call lets the tick reconcile both and resolve successfully;
the required rejection assertion fails. The exact command, RED exit 1,
restored GREEN exit 0 and source SHA-256 are at
`/tmp/activation-f10-review-tick_cap-{red,green}.log`. This proves the
protected policy reaches the installed tick boundary, not only a direct
controller method.

The selected-check staging test now captures descriptor numbers and targets
at the trusted root/file diagnostic boundary, including `/`, `/tmp`, both
source roots and both files. It asserts all captured source-owned descriptors
no longer point at those objects after successful staging. Omitting only the
last two ancestor-directory closes leaves `/` open and fails the exact
lifecycle assertion; RED exit 1/restored GREEN exit 0 are at
`/tmp/activation-f10-review-ancestor_close-{red,green}.log`. This replaces
the earlier global FD-count fixture, whose count could shrink when unrelated
runtime descriptors closed.

The exact follow-up eight-file run passed **580/580**, 2,526 assertions,
exit 0 at `/tmp/activation-f10-review-final-eight-final.log`. An immediately
preceding run exposed a masked fixture assumption: a descriptor number already
present at baseline can be reused for a different owned source object. The
capture now compares the number **and** target; the ancestor-only close fault
still fails at the open `/` descriptor assertion. This follows the
historical 579/579 correction run above; both are retained as separate
checkpoints. The follow-up remains local and uninstalled: host gate, CI,
external reviewer, publisher and service activation were not run.

#### 1.2g local provider timing and durable recovery candidate

The reader now carries a validated absolute retry minimum for numeric or
canonical HTTP-date Retry-After and integer reset epoch. Malformed present
timing refuses; two valid bounds use the later one. No raw response header,
body or credential is retained. A first mounted test failed with expected
1,015,000ms versus undefined before this parser existed
(`/tmp/activation-f11-first-red.log`).

An explicit additive v9→v10 transaction installs a bound recovery singleton
and attempt journal. The v9 sequence/burst/start remain an unclassified
watermark; no historical outcome is invented. A nonzero watermark gets a
conservative configured recovery delay. Scheduled ticks require exact v10
schema and never migrate on open. Reservation and terminal facts commit in
separate short transactions around provider work under one process lock;
there is no SQLite transaction across the GET await. A real child died after
reservation with the lock held and left attempt 1 pending. Reopen sealed it
interrupted, deferred without GET, and later began attempt 2. Provider
failure, local failure, cancellation, interruption and complete success have
distinct terminal facts. Burst exhaustion retains failed health and slower
recovery probes; only complete recovery restores healthy status and resets
the burst, while sequence and journal history remain. Clock rollback refuses,
and valid provider minimums beyond the local horizon remain absolute.

The literal focused command
`bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/{bootstrap.test.ts,request.test.ts,ingress.test.ts,controller.db.test.ts,github-reader.db.test.ts,github-source.db.test.ts,observation-state.db.test.ts,observation-tick.db.test.ts}`
passed **614/614**, 2,677 assertions, exit 0 before formatting at
`/tmp/activation-f11-preformat-eight.log`. On the final source bytes, the
same eight-file command passed **614/614**, 2,686 assertions, exit 0.
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run
twilight-burokrat:lint:source --outputStyle=static`, the corresponding
`typecheck` and `build` targets each exited 0 with an Nx target-success
summary. `bunx @fission-ai/openspec@1.12.0 validate
automatic-trusted-activation --strict --json` passed 1/1, and the same
version's `validate --all --json` passed 143/143. The final test assertion
count includes typed rollback-fixture assertions added after the preformat
run; neither command claims host installation or external acceptance.

The watched mutation harnesses `/tmp/activation-f11-reader-watch.py`,
`watch.py`, `watch-state.py`, `watch-journal.py`, `watch-policy.py`,
`watch-atomic.py` and `watch-terminal.py` each ran the exact named
`bun test <file> --test-name-pattern <name>` under one source omission,
restored the source SHA-256, and reran the same test. All **33 accepted**
faults below have RED exit 1 and restored GREEN exit 0 at
`/tmp/activation-f11-<fault>-{red,green}.log`.

| Faults                                                                                                                  | Observed RED                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `reader-clock`, `reader-numeric`, `reader-date`, `reader-retry_overflow`, `reader-reset_shape`, `reader-reset_overflow` | Named invalid-response refusal became ordinary rate-limit handling after the respective clock, grammar or overflow check was omitted.                                                                        |
| `reader-provider_max`                                                                                                   | Chose the earlier 1,005,000ms bound instead of 1,015,000ms.                                                                                                                                                  |
| `cooldown`, `provider_minimum`, `clock_rollback`                                                                        | Reopened tick read again during cooldown; provider minimum shortened to fallback; 3,100ms clock after 3,200ms success resolved.                                                                              |
| `failed_health`, `success_health`                                                                                       | Exhaustion did not retain failed health; complete recovery did not restore healthy health.                                                                                                                   |
| `cancel_terminal`, `tick_final_cancel`                                                                                  | Cancelled held reader or synchronous post-close cancellation wrote a false complete journal fact. The latter required a persisted-journal assertion because the outer outcome fence masked its return value. |
| `journal_count`, `terminal_classification`, `terminal_history`                                                          | Deleted earlier attempt, changed provider classification or cleared last-failure pointer issued one forbidden GET.                                                                                           |
| `v10_version`, `v10_schema`, `v10_binding`                                                                              | Wrong version marker, CHECK-free recovery table or mismatched configuration each reached the provider reader.                                                                                                |
| `burst_mode`, `sequence_overflow`                                                                                       | Corrupt exhausted burst or unsafe sequence each issued one forbidden GET.                                                                                                                                    |
| `migration_split`                                                                                                       | COMMIT before injected late fault retained version 10 rather than restoring version 9.                                                                                                                       |
| `missing_initial`, `zero_initial`, `initial_order`, `max_order`, `recovery_order`, `fallback_order`, `horizon_ceiling`  | Each malformed trusted retry policy migrated v10 when only its missing/lower/order/ceiling predicate was omitted.                                                                                            |
| `reservation_insert`, `reservation_split`                                                                               | Real child entered provider work without a pending journal row; journal insertion fault left sequence/burst 1 committed instead of rolling back to 0.                                                        |
| `terminal_split`                                                                                                        | Singleton write fault left provider-failure and 1700ms minimum committed while recovery state remained pending.                                                                                              |

The first post-close mutation was disqualified because the outer return fence
masked it; the persisted journal assertion made the second trial decisive.
A redundant v9 migration preflight was removed because the transaction's
versioned source reader already enforces it. This checkpoint does not install
a timer/service or use live credentials, workers, reviewer, publisher,
admission, merge, WBS writes, host gate or CI.

Astra's read-only public-path probe found three defects in this candidate:
cancelled final-burst reservation retained idle burst mode, delayed scheduler
close let a complete journal precede a cancelled tick outcome, and a missing
`next_attempt_at` bypassed a retained provider minimum. Three mounted tests
first failed 0/3 with exactly those observations. The correction moves the
reservation connection close before provider work, records the terminal fact
after controller settlement under the same process lock, puts an exhausted
cancelled burst into recovery mode, and refuses a null cooldown alongside a
retained provider minimum. No transaction spans a provider await. Independent
source omissions in `/tmp/activation-f11-review-watch.py` each failed the
named public-path assertion and restored GREEN: `cancel_exhausted`,
`scheduler_close_order`, `missing_provider_next`, with RED exit 1/GREEN exit 0
and exact restored source hashes in
`/tmp/activation-f11-review-<fault>-{red,green}.log`. A previous full-suite
run reached 616 passes and one fixture assertion that expected the reservation
connection to stay open during a held reader; the fixture now asserts the
reviewed close order and separately retains the lock-held unsettled-child
proof.

The terminal journal COMMIT is the irreversible completion point. A monotonic
check immediately before it rolls back proposed complete and seals cancelled
if finalization itself crossed the tick deadline. A terminal close that
crosses only the tick deadline returns the already committed complete outcome;
a close error instead reports cleanup failure while retaining that fact. A
real child whose terminal close exceeded the cleanup budget exited 124 while
the process lock remained owned. The two additional independent omissions,
`terminal_precommit` and `terminal_postcommit`, each failed its named
durable-state/outcome assertion (RED exit 1, restored GREEN exit 0) at
`/tmp/activation-f11-<fault>-{red,green}.log`. All five correction faults
were rerun before final Prettier formatting; each GREEN log gives the exact
historical restored source SHA-256. Formatting then changed only
`observation-state.ts` source bytes (from `c96f62...` to `cd7478...`);
`observation-tick.ts` remains `305e3d...`. The corrected, formatted-byte
eight-file suite passed **621/621**, 2,719 assertions,
exit 0 on the formatted source. Nx `twilight-burokrat:lint:source`,
`typecheck` and `build` each exited 0 with a target-success summary;
the corrected final-source lint receipt is
`/tmp/activation-f11-final-corrected-lint.log` (exit 0, cache 0/1), superseding
the earlier failed `/tmp/activation-f11-final-lint3.log` from the pre-fix
test-fixture bytes;
`@fission-ai/openspec@1.12.0 validate automatic-trusted-activation --strict
--json` passed 1/1 and `validate --all --json` passed 143/143. Changed-path
Prettier check and `git diff --check` exited 0. Host gate, CI and installed
service remain unrun.

## 1.2h uninstalled observation-service artifact (2026-10-08)

This bounded increment composes the existing one-tick controller behind an executable
`observation-service-cli.ts`, an explicit canonical protected service configuration,
optional explicit read credential, and a typed administrator renderer. It adds an
uninstalled oneshot/timer bundle and the linked provisioning README. It does not
install or enable systemd, initialize or migrate SQLite on service start, perform an
external audit, or grant publication/admission/merge/WBS authority. The local
1.2h artifact has independent review evidence; parent task 1.2 and 030.6 remain
open pending installed host and external acceptance.

The first mounted executable-child test failed because the launcher was absent
(exit 1), then passed with a deferred state and propagated exit 75. The first
renderer bundle test similarly failed before `render-cli.ts` existed, then passed.
The credential-FIFO test first timed out at two seconds before O_NONBLOCK was
added; the restored child refused the FIFO promptly with exit 1.
The initial focused implementation suite passed **16/16, 89 assertions**:
`bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/observation-service.db.test.ts infra/ci/burokrat/observation/units.test.ts`.
Direct `bunx tsc --noEmit --project` for the CLI and observation renderer projects
both exited 0. `systemd-analyze verify` on the rendered service/timer files
exited 0 with no diagnostics. This proves local syntax only, not installed
service-account, filesystem, network, or timer behavior.

The local watch driver `/tmp/activation-1-2h-watch.ts` mutated one production
source/template condition at a time, ran the named mounted test, restored the
original bytes in `finally`, then reran the same test. Each accepted row has
RED exit 1 and restored GREEN exit 0 in
`/tmp/activation-1-2h-<fault>-{red,green}.log`; the GREEN log records the
restored historical source SHA-256. These hashes precede final Proof-comment
and formatting edits, so they are mutation-restoration evidence rather than
final-byte hashes.

| Fault        | Removed/broken production condition   | Observed RED                                                                              |
| ------------ | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `account`    | non-root account refusal              | root layout accepted, `toThrow` failed                                                    |
| `path`       | canonical safe-path validation        | `%h` Bun path accepted, `toThrow` failed                                                  |
| `child`      | trust-directory containment           | foreign service-config path rendered; exact named refusal absent                          |
| `statealias` | immutable runtime/state separation    | writable state path aliased runtime and rendered                                          |
| `timeout`    | startup timeout upper bound           | 3601-second timeout accepted                                                              |
| `readwrite`  | only-state writable directive         | unit contract lacked `ReadWritePaths`                                                     |
| `killgroup`  | whole-service-group stop directive    | unit contract lacked `KillMode`                                                           |
| `restart`    | no-restart directive                  | unit contract lacked `Restart=no`                                                         |
| `preflight`  | hash preflight                        | unit contract lacked `ExecStartPre`                                                       |
| `envclear`   | clean launcher environment            | rendered command no longer contained `env -i`                                             |
| `envfile`    | Bun env-file refusal                  | rendered command no longer contained `--no-env-file`                                      |
| `caps`       | empty capability bounding set         | unit contract lacked directive                                                            |
| `nopriv`     | no-new-privileges constraint          | unit contract lacked directive                                                            |
| `canonical`  | exact service JSON comparison         | valid noncanonical JSON reached tick; expected config diagnostic changed to `tick-failed` |
| `bootstrap`  | early bootstrap pin check             | changed pin moved refusal to later `tick-failed`; no authority was admitted               |
| `mode`       | protected file-mode check             | 0644 config reached tick; expected config diagnostic changed to `tick-failed`             |
| `size`       | bounded protected-file read           | exact 16 KiB+1 canonical config reached tick; diagnostic changed to `tick-failed`         |
| `nofollow`   | no-follow credential open             | symlinked credential yielded success 0 and a GET                                          |
| `nonblock`   | nonblocking protected-file open       | credential FIFO held child beyond the 2-second test budget                                |
| `ambient`    | absent credential means no token      | ambient sentinel appeared in Authorization header                                         |
| `trustpin`   | service-config hash in exact pin list | rendered SHA-256 list differed from fixture                                               |
| `fresh`      | new-only render output directory      | an existing empty directory was accepted                                                  |
| `outputpath` | canonical render output path          | an `alias/..` output path created a rendered directory                                    |
| `persistent` | persistent timer recovery             | timer contract lacked `Persistent=true`                                                   |
| `timerexec`  | timer carries no executable command   | injected `ExecStart` was caught by the timer contract                                     |

An earlier `child` trial used `void parent; void child` without loop braces and
failed only with `ReferenceError: child is not defined`; it is disqualified.
An earlier `size` trial used a file far larger than the bounded read; removing
the size comparison still yielded truncated malformed JSON and stayed GREEN.
The accepted fixture is exactly 16 KiB+1 canonical bytes, so removing only
that comparison reaches the tick.
The accepted replacement used lexical-only `requirePath(child)` and reached
rendered output. The first `fresh` trial removed directory creation entirely
and failed initial rendering; it is disqualified. The accepted replacement
used `recursive:true`, admitting a preexisting empty directory.

The admin renderer creates a new private staging directory and does not install
anything. The service tests distinguish absent, unreadable and malformed
configuration, pin drift, absent state, explicit versus ambient token and
symlinked credential. A malformed or missing protected state produced zero
GETs and no database creation. Actual host provisioning, live credential,
systemd execution and the h2puni gate are unrun.

The final activation-controller and renderer suite used
`bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/*.test.ts infra/ci/burokrat/observation/units.test.ts`
and passed **637/637, 2,811 assertions**, exit 0, in
`/tmp/activation-1-2h-final-suite.log`. Direct renderer and CLI TypeScript
checks exited 0; Nx `twilight-burokrat:lint:source`, `typecheck`, and `build`
each printed successful target summaries with cache skipped. Strict OpenSpec
passed 1/1 and all-item OpenSpec passed 143/143. A broader Nx `test` run was
interrupted at exit 130 before its target summary; it is not counted as a
passing check. Installed systemd runtime behavior, CI and the h2puni gate
remain unrun.

### 1.2h independent-review corrections (committed locally)

The mounted service and renderer tests first reproduced the independent review
findings: `${USER}`, a quote and NUL were accepted as executable-path bytes;
the bootstrap FIFO held the executable beyond two seconds; protected file
ownership/link and ancestor ownership/replaceability guards lacked independent
watches. The corrected service opens the bootstrap with the same bounded,
nonblocking, no-follow protected-file reader used for configuration and
credentials, then validates those exact bytes against the independent pin.
The renderer now admits only literal path bytes that systemd will not expand.

`/tmp/activation-1-2h-watch.ts <fault>` removed only the named production
condition, ran `bun test <named test file> -t '<named test>'`, restored source
in `finally`, and reran that exact test. Each row below has RED exit 1 and
restored GREEN exit 0 in
`/tmp/activation-1-2h-<fault>-{red,green}.log`; GREEN logs record the restored
pre-comment source SHA-256. The observed failures, rather than the exit codes
alone, are the witnesses.

| Fault              | Removed guard                      | Observed mounted RED                                                                                |
| ------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `ancestor_owner`   | trusted ancestor UID               | foreign-owned parent reached the later `tick-failed` diagnostic instead of `service-config-invalid` |
| `ancestor_mode`    | ancestor non-replaceability        | mode 0777 parent reached the later tick diagnostic                                                  |
| `leaf_owner`       | protected file UID                 | foreign-owned config reached the later tick diagnostic                                              |
| `leaf_nlink`       | protected file single-link check   | hard-linked config reached the later tick diagnostic                                                |
| `token_grammar`    | explicit credential ASCII grammar  | token with space reached the fake provider and tick returned 0                                      |
| `literal_variable` | renderer literal path grammar      | `${USER}` executable path rendered; named `toThrow` failed                                          |
| `literal_quote`    | renderer literal path grammar      | quoted executable path rendered; named `toThrow` failed                                             |
| `literal_nul`      | renderer literal path grammar      | NUL executable path rendered; named `toThrow` failed                                                |
| `bootstrap_fifo`   | bounded nonblocking bootstrap open | child remained blocked after two seconds; named exit-1 assertion received `timeout`                 |

The previous configuration test's `0644` case is a **mode refusal**, not an
unreadable-file witness. A separate mounted EACCES test now chmods the file
`000`, confirms an actual `openSync` error with code `EACCES` under the
non-root test account, then observes the public service's safe config-failure
diagnostic. Missing and malformed remain separate in the older test.

The provisioning README now states the feasible ownership boundary: a
root-owned non-writable trust directory with service-owned `0600` protected
files, plus a service-owned `0700` state directory. The systemd mount namespace
provides the effective read-only trust view; file ownership alone does not.
This is a documented provisioning contract, not installed host evidence.

The corrected focused command
`bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/observation-service.db.test.ts infra/ci/burokrat/observation/units.test.ts`
passed **26/26, 114 assertions**, exit 0, at
`/tmp/activation-1-2h-review-corrected-focused.log`. After final formatting,
the ten-file activation-controller/renderer suite passed **647/647, 2,833
assertions**, exit 0 (`/tmp/activation-1-2h-review-final-suite.log`). Nx
`twilight-burokrat:lint:source`, `typecheck`, and `build` each printed a
successful target summary with cache skipped in the corresponding
`/tmp/activation-1-2h-review-final-{lint,type,build}.log`; the renderer's
direct TypeScript check exited 0. Pinned OpenSpec strict passed 1/1 and all
passed 143/143 in `/tmp/activation-1-2h-review-final-{strict,all}.json`.
Prettier `--check` passed on every changed source/document path, and
`systemd-analyze verify` exited 0 on freshly rendered uninstalled units.
Host service, CI and h2puni gate remain unrun.

### Current 1.2e–1.2h evidence status

The local 1.2e process-lock/schema and 1.2f cancellation/settlement records
above were independently reviewed with mounted real-process negatives. The
1.2g durable retry/cooldown implementation is committed at
`1fe19c32e8b2d5e3a0f970b07be83c757848b82b`. The 1.2h uninstalled
service composition, exact protected-file and renderer proofs are committed
at `b2226ec5c81667bbfcba20751b986d7feb466aa0`. These references mark
local implementation checkpoints; they do not establish a deployed timer,
live credential, independent external authority, installed systemd confinement,
review/worker/publisher/admission/merge effects, or WBS completion. The
h2puni gate and CI remain unrun for this 1.2h checkpoint. Parent 1.1/1.2 and
later task boxes remain open, as do the full-family NOT RUN acceptance rows
near the start of this ledger.

### 2.1a protected provider authority (local, uncommitted review patch)

The selected provider descriptor is a strict canonical, content-addressed version-1
record. It freezes immutable control-repository/workflow/program/runner pins,
attestation issuer/signer/root/verifier and two distinct audiences, bounded
journal retrieval/retention and access policy, plus explicit model/protocol/
prompt/credential-reference pins. The verifier executable path is absolute and
lexically canonical; its exact binary identity, version and runtime identity are
descriptor fields. These are configuration pins, **not** proof that a binary or
Sigstore root is installed, authenticated or used. Bootstrap version 2 binds the
descriptor digest to an independent pin. Version-1 history still parses, but an
explicit external-review authority guard refuses to authenticate a new phase.

The first controller-mounted test, `legacy bootstrap cannot authenticate a
registered external review phase`, initially placed its guard in a test callback.
That earlier `/tmp/activation-2-1a-bootstrap-legacy_external.log` is historical
and **disqualified** as production-composition proof. The corrected mounted test
injects shipped `composeReviewProviderVerification` as `recordReceipt`'s
`verifyReview` callback. It reads protected bootstrap and descriptor bytes,
joins independently pinned authority, and refuses v1 before its fake external
verifier is called. Omitting only the shipped composition guard fulfilled the
forbidden phase (RED 1); restored it refused with zero verifier calls and
unchanged request/obligation/attempt/review-registration rows (GREEN 0).
`/tmp/activation-2-1a-correction-legacy_composition.log` retains the exact
mutation and outputs. The fake verifier establishes no external provenance.

`bun /tmp/activation-2-1a-watch.ts` changed one required field in the
production descriptor schema to optional, ran its named
`bun test .../review-provider.test.ts -t 'provider authority refuses absent
<section>.<field> rather than inferring it'`, restored source, and reran the
same test. All 45 logs are at
`/tmp/activation-2-1a-field-<section>-<field>.log`; each has exact mutation,
command, RED/GREEN exit and output. Thirty-five final-byte removals admitted an absent field and failed the named
refusal (RED 1, restored GREEN 0). Six changed only diagnostic specificity
because independent numeric/retrieval/entitlement checks still refused; four
stayed GREEN because path or model-ID validation independently refused. Those
ten are **disqualified** as independent safety proofs, not counted as admission.
The later direct guards for safe numbers, nonempty retrieval, entitlement,
canonical paths and model-ID grammar have their own isolated admitting faults.
The rerun summary is `/tmp/activation-2-1a-correction-field-summary.log`;
restored source SHA-256 was `dabf761a12ef2ab62495e35d16c5aa87b20495f1d64591a6415303bed9d0f10c`.

`bun /tmp/activation-2-1a-guard-watch.ts` removed each named production
predicate from the descriptor reader/authority join and reran the exact named
test after restoring source. All **22** accepted rows have RED exit 1 with a
named wrong-descriptor admission and restored GREEN exit 0 in
`/tmp/activation-2-1a-guard-<fault>.log`:

| Faults                                                                                                             | Intended mounted failure when omitted                                                        |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `join_issuer`, `join_provider`, `join_executor`, `join_verifier`, `join_protocol`, `join_prompt`, `join_retrieval` | Coherently repinned foreign authority returned from the exact bootstrap join.                |
| `pin`, `canonical`, `utf8`                                                                                         | Wrong raw digest, noncanonical JSON, or lossy invalid UTF-8 bytes were accepted.             |
| `path_executable`, `path_root`, `path_credential`, `locator`                                                       | Traversing protected paths or a lexical descriptor alias was admitted.                       |
| `entitlement`, `retrieval_empty`, `retention`                                                                      | Wrong private plan, absent retrieval origin, or >3,650-day retention was admitted.           |
| `numeric_owner`, `numeric_repository`, `numeric_workflow`, `numeric_predicate`                                     | Unsafe integer identity/version was admitted.                                                |
| `byte_ceiling`                                                                                                     | A canonical 65,537-byte record was admitted; the exact 65,536-byte control remains readable. |

`bun /tmp/activation-2-1a-file-watch.ts` independently changed the version,
kind, single-link, mode and no-follow protections: each admitted a foreign
record or wrong file (RED 1, restored GREEN 0) in
`/tmp/activation-2-1a-file-<fault>.log`. Its directory-only `file_type`
trial stayed GREEN because link count separately refused; it is disqualified.
The dedicated FIFO witness then isolated type and nonblocking: with `isFile`
removed, the named refusal became a read error (diagnostic only), while
removing `O_NONBLOCK` held the Bun child until its explicit two-second
SIGTERM timeout; restored tests passed in
`/tmp/activation-2-1a-fifo-{file_type,nonblock}.log`. No blocked child remains.
The composed authority reader also protects the bootstrap read itself.
Replacing only that call with `readFileSync` held the mounted bootstrap FIFO
child until its two-second SIGTERM timeout; restored GREEN refused promptly
in `/tmp/activation-2-1a-bootstrap-protected-read.log`. This does not change
the historical v1 bootstrap reader used by earlier local fixtures.

`bun /tmp/activation-2-1a-bootstrap-watch.ts` independently removed the
then-test callback's version guard, descriptor-digest comparison and legacy-with-pin
refusal; each admitted forbidden authority in its historical fixture (RED 1,
restored GREEN 0) in
`/tmp/activation-2-1a-bootstrap-<fault>.log`. Its absent-pin omission merely
changed the diagnostic to a later digest mismatch and is disqualified. All
source-mutation scripts restored the original SHA-256 before exiting; those
hashes are historical pre-comment source bytes, not a claim about final
formatted bytes.

After final source formatting, the exact command
`bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/bootstrap.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/review-provider.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/controller.db.test.ts`
passed **498/498, 1,888 assertions**, exit 0
(`/tmp/activation-2-1a-final-tests.log`). Scoped `bunx eslint` on the
five changed TypeScript paths exited 0; direct
`bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`
exited 0 (`/tmp/activation-2-1a-final-{lint,type}.log`). The documented package build `bun src/packaging/build.ts` exited
0 and generated nonempty `dist/bin.mjs` and `dist/package-manifest.json`.
The earlier `bunx nx run twilight-burokrat:typecheck --skip-nx-cache` exited
0 after an Nx socket denial **without a target summary**, so it is not
counted as a target pass; the direct TypeScript check is the type evidence.
Pinned OpenSpec strict passed 1/1 and all passed 143/143 (125 changes, 18
specs), both exit 0 in `/tmp/activation-2-1a-final-{strict,all}.json`.
Prettier `--check` on all six changed paths and
`git diff --check` passed, exit 0.

No production verifier invocation, attestation retrieval, provider credential,
real dispatch, host provisioning, CI or h2puni gate is claimed. Parent 2.1
remains open; 2.1b cryptographic retrieval and semantic receipt mapping are
separate work. Historical local output logs under `/tmp` are not checked-in
fixtures or external acceptance evidence.

#### Corrected 2.1a composition and immutable-ID review evidence

GitHub `BuildSignerDigest` maps to `job_workflow_sha`, a 40-hex **commit SHA**;
program/action/runtime identities remain independent 64-hex SHA-256 values.
The descriptor now refuses a 64-hex signer value. Its model grammar refuses
mutable 4.5 aliases, whitespace and fabricated model names, while mounted
positives retain dated 4.5 and exact dateless 4.6/4.7/5 snapshots. This
structural grammar does not assert live model entitlement or availability.
The shipped verifier composition requires an independently pinned descriptor
and joins its digest to v2 bootstrap; v1 history remains readable but cannot
call the fake verifier. Public visibility has a separate coherent mismatched
entitlement fixture and a valid public-plan control.

`python3 /tmp/activation-2-1a-correction-watch.py` ran six isolated source
mutations and restored each before the next. Each named log
`/tmp/activation-2-1a-correction-<fault>.log` records changed source,
exact `bun test ... -t ...` command, RED exit 1 with the assertion below,
restored GREEN exit 0, and restored source SHA-256
`a5583940dd920224a257ae8e4f69cfc5dfe04116a041cb17a8bc66b360fbefa9`.
That is a **pre-format restoration** hash; final-byte checks follow.

| Fault                             | Observed named RED assertion                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `legacy_composition`              | `recordReceipt` fulfilled under v1 instead of rejecting; restored test also checks verifier calls zero and full evidence snapshot. |
| `model_alias`, `model_whitespace` | Coherently pinned mutable/whitespace model descriptor returned rather than refusing.                                               |
| `signer_commit`                   | Coherently pinned 64-hex signer value returned rather than refusing.                                                               |
| `public_entitlement`              | Public descriptor carrying private Enterprise entitlement returned rather than refusing.                                           |
| `v2_pin_join`                     | Different valid independently pinned descriptor returned under the old bootstrap descriptor identity.                              |

The signer mapping comes from Sigstore Fulcio's `build-signer-digest` to
`job_workflow_sha` configuration. `--cert-identity` and `--signer-workflow`
selection belongs to unimplemented 2.1b retrieval, not this descriptor read.

On corrected, formatted bytes, the exact three-file `bun test` command above passed
**509/509, 1,900 assertions**, exit 0
(`/tmp/activation-2-1a-correction-final-tests.log`). Scoped `bunx eslint` on
five TypeScript paths exited 0 with no diagnostic; direct
`bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`
exited 0 (`/tmp/activation-2-1a-correction-final-{lint,type}.log`).
`bun src/packaging/build.ts` exited 0 and produced nonempty `dist/bin.mjs`
and `dist/package-manifest.json`; no build stdout is claimed. Pinned
`bunx @fission-ai/openspec@1.12.0 validate automatic-trusted-activation --strict --json`
passed 1/1 and `validate --all --json` passed 143/143 (125 changes, 18
specs), exit 0 (`/tmp/activation-2-1a-correction-final-{strict,all}.json`).
Prettier `--check` on all seven changed paths, `git diff --check` and
`git diff --cached --check` passed, exit 0. The earlier 498-test results
above are historical and superseded by this 509-test run. Nx's prior socket
failure remains uncounted; host gate, CI, live verifier, provider credentials
and installed entitlement remain unrun/unverified.

#### 2.1b increment 1: protected journal registration and envelope (local only)

The read-only `lookupReviewJournalRegistration` boundary selects a protected,
content-addressed v1 registration from the trusted `ReviewExpectation`. It joins
the retained request, registered invocation, immutable review dispatch and
canonical payload; it does not fetch a journal or authenticate an attestation.
`decodeReviewJournalManifest` accepts only exact canonical v1 manifest bytes,
the registered digest, authority fields and the selected cold/informed phase.
No caller-provided phase or manifest supplies the expected authority. This
increment has no `recordReceipt` composition, external verifier, provider
credentials, launch, or receipt-completion claim; parent 2.1b remains open.

The exact focused command
`bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/review-journal.test.ts`
passed **40/40, 52 assertions**, exit 0 in
`/tmp/activation-2-1b-journal-focused-final.log`. Mounted cases include absent
frozen request/invocation/dispatch, malformed invocation/dispatch rows, v2 or
foreign-kind protected records and manifests, canonical-byte and digest
substitution, foreign paired obligation, protected path/link/mode/owner/type,
and coherent reservation-target/protocol substitutions.
The existing bootstrap/provider/controller suites plus this journal suite,
invoked together as four explicit file arguments to `bun test`, passed
**549/549, 1,952 assertions**, exit 0
(`/tmp/activation-2-1b-four-file.log`).

`python3 /tmp/activation-2-1b-journal-watch.py` ran 25 one-condition
omissions; 24 reached unintended lookup/manifest admission (RED 1) and the
same named tests passed after source restoration (GREEN 0). The initial
`root_lexical` trial merely changed the refusal to `ancestor malformed` and
is disqualified. A corrected `${root}/.` fixture and isolated rerun
`/tmp/activation-2-1b-journal-root_lexical-v2.log` reached unintended
admission (RED 1), then passed restored (GREEN 0).
`python3 /tmp/activation-2-1b-journal-extra-watch.py` independently omitted
ancestor owner/type, file owner/type, and v1 schema version/kind literals for
registration and manifest. All eight named tests reached unintended
admission (RED 1), then passed restored (GREEN 0). Each transcript at
`/tmp/activation-2-1b-journal-<fault>.log` records the changed expression,
exact filtered `bun test` command, observed assertion and restored exit.
All watches restored the same **pre-Proof-comment** source SHA-256
`c4dc697588fd65bf9d908438288b94c7e29fd96fd5b4ec0d0e3bf3ee4dd9522a`.
The registration kind/version and manifest kind/version cases change one
schema literal while keeping the foreign bytes canonical and digest-bound.

This local increment does not establish trusted registration provisioning,
cryptographic journal authentication, immutable artifact retrieval, installed
issuer/prompt entitlements, CI or the h2puni gate. Those remain unrun/open.
On final formatted bytes, scoped `bunx eslint` on the two new TypeScript files
and direct `bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`
both exited 0 (`/tmp/activation-2-1b-final-{lint,type}.log`). The package
`bun src/packaging/build.ts` from the CLI package directory exited 0
(`/tmp/activation-2-1b-final-build.log`); an earlier invocation from the
repository root failed `Module not found` and is not counted. Pinned OpenSpec
strict passed 1/1 and all passed 143/143 (125 changes, 18 specs), exit 0
(`/tmp/activation-2-1b-final-{strict,all}.json`). Prettier `--check` on the
three changed paths and `git diff --check` passed, exit 0. The first final
type/format attempt had only a test-spy overload/format error; these were
corrected and the final commands above rerun. No Nx or host gate is claimed.

#### 2.1b increment 1 correction: both registered phases and isolated joins

Independent review of the first staged increment found a real cross-phase
gap: an informed manifest could carry a foreign cold obligation when its own
informed ID was valid. The mounted test
`journal manifest joins both registered phase obligations regardless of selected phase`
failed **0/1** before the fix (`/tmp/activation-2-1b-pair-initial-red.log`),
then passed **1/1** after the decoder joined every present phase to its
registered pair (`/tmp/activation-2-1b-pair-initial-green.log`). It includes
valid complete cold/informed controls and distinct opposite-phase
substitutions. A cold-only terminal manifest remains valid in the existing
positive decoder test.

`python3 /tmp/activation-2-1b-journal-correction-watch.py` independently
removed 41 source conditions and restored each before the next. The
`/tmp/activation-2-1b-correction-<fault>.log` transcripts retain exact
mutation, filtered command, RED assertion, restored GREEN and source hash.
**39** conditions admitted their foreign canonical/digest-matching fixture
when omitted (RED 1/GREEN 0). The O_NONBLOCK omission blocked the FIFO child
until `timeout` exit 124, failing the prompt-refusal assertion (RED 1/GREEN
0); this is a bounded-termination proof, not authority admission. The first
`payload_executor` trial stayed GREEN because unchanged stored `target_bytes`
still fenced it, so that trial is disqualified. The corrected fixture
changes target bytes coherently; omitting only the expected-executor join
then admitted the foreign target (RED 1/GREEN 0) in
`/tmp/activation-2-1b-correction-payload_executor-v2.log`. Separate
`request_identity` and `request_authority` coherent repins each admitted on
single-join omission (RED 1/GREEN 0) in their named correction logs. The
41-trial run restored **historical pre-Proof-comment** source SHA-256
`fe3e25c147e93108a70f50cd554ddd45a52f5e11370c8daf1cef8a12c22e54a3`;
later comments and formatting change the final source hash.

The correction matrix covers registration key/request/review/attempt/
invocation/payload/executor/protocol/prompt; manifest issuer/executor/
protocol/prompt/journal/effect/payload/request/review/attempt/invocation;
payload plan/review/attempt/invocation/cold/informed/authority/executor/
prompt/target bytes; persisted request bytes/bootstrap/plan; payload
canonicality; both phase joins; empty artifacts, passed cold without informed,
failed cold with informed; FIFO nonblocking; and invalid UTF-8 inside an
otherwise schema-valid journal ID. Three redundant comparisons already
guaranteed by exact selected-row queries or earlier canonical-byte equality
were removed. The wrong dispatch request-key fixture still refuses at the
`SELECT` boundary; it is not a proof for a later comparison. Earlier
40-test/final-check results above are historical and superseded by the final
corrected-byte results below.

After the correction source was formatted, the exact four-file command
`bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/bootstrap.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/review-provider.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/controller.db.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/review-journal.test.ts`
passed **588/588, 1,998 assertions**, exit 0
(`/tmp/activation-2-1b-correction-four.log`). Direct TypeScript build and the
CLI package build each exited 0; pinned OpenSpec strict passed 1/1 and all
passed 143/143 (`/tmp/activation-2-1b-correction-{type,build}.log` and
`/tmp/activation-2-1b-correction-{strict,all}.json`). A first lint/format
pass found four unnecessary assertions and test-file formatting; those were
fixed. The rerun on final bytes passed **588/588, 1,998 assertions**
(`/tmp/activation-2-1b-correction-final-four.log`); scoped ESLint, direct
TypeScript build and Prettier check each exited 0
(`/tmp/activation-2-1b-correction-final-{lint,type,format}.log`). No host gate,
CI, live provider credentials, journal retrieval or attestation acceptance
is claimed.

#### 2.1b increment 2: offline v2.98.0 single-bundle process policy (local only)

The adapter fixes `gh attestation verify` v2.98.0 arguments from the protected
review-provider descriptor, validates independently resolved executable,
runtime and root identities before launch, stages only a local bundle and
exact manifest bytes, and returns an **untrusted process observation**. It
does not create `VerifiedReview` or authenticate a signature in the fake
process tests. The production executable/runtime/root installation,
provenance-backed signed journal fixture, retrieval, semantic receipt mapping,
CI and h2puni gate remain unverified/open.

The first mounted absent-runtime test was RED before implementation and GREEN
after the resolver/launch boundary was added. The focused tests cover fixed
v2.98.0 switches and output shape, wrong runtime pins, nonzero/multiple/
malformed/foreign structured output, private staging without ambient
credentials, bounded output, active abort, timeout kill and settlement, and
primary-plus-cleanup error preservation. The harmless fake executable proves
process policy only, not cryptographic verification.

`bun /tmp/activation-offline-mutations.mjs` independently removed 43
production conditions, restoring source before each next trial. All 43 had a
named failing assertion (RED exit 1) and restored focused-suite GREEN exit 0;
exact transcripts are `/tmp/activation-offline-<fault>-{red,green}.log` and
the summary is `/tmp/activation-offline-matrix-summary-final.log`. Watched
conditions include runtime presence; executable/version/closure/root pins;
input byte caps and shape; repository, certificate, signer/source commit,
ref, issuer, predicate, path and exact-version policy; fixed CLI switches;
child environment, path and resource bounds; cancellation, timeout kill,
monotonic deadline and streamed output cap; exit/result bounds; timestamp
and statement shape; and certificate/issuer/predicate, manifest digest and
exact-bundle joins. The matrix restored historical pre-Proof source SHA-256
`954149a74c0264a1c64c51419a830eabb2d22644dda244ab886d1027f657afdb`.

Separate `OFFLINE_FAULT=manifest_mode` and `OFFLINE_FAULT=bundle_mode` runs
each made the child see a nonprivate staged file (RED 1), then restored
GREEN 0; source restored SHA-256 prefix `3819abae`. The
`OFFLINE_FAULT=cleanup_aggregate` run lost the cleanup sentinel after a
primary failure (RED 1); restored GREEN 0 retained both causes in
`AggregateError`, with restored source SHA-256 prefix `2356be`. These three
trials bring the accepted total to 46. Adjacent `Proof:` comments name their
fault and observed result. Comments and formatting followed the mutation
restorations. On final formatted bytes, the exact five-file command
`bun test apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/bootstrap.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/review-provider.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/controller.db.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/review-journal.test.ts apps/twilight-structure/twilight-burokrat/cli/src/activation-controller/review-attestation.test.ts`
passed **635/635, 2,116 assertions**, exit 0
(`/tmp/activation-offline-final-five.log`). Direct TypeScript build, scoped
ESLint and CLI package build each exited 0
(`/tmp/activation-offline-final-{type,lint,build}.log`). Pinned OpenSpec strict
and all validation, Prettier check and `git diff --check` each exited 0
(`/tmp/activation-offline-final-{strict,all}.json` and
`/tmp/activation-offline-final-format.log`). No real signed journal was
available for positive cryptographic verification, and no host gate was run.

#### 2.1b increment 2 correction: whole-operation deadline and process teardown

Astra's live fake-process probes found three bounded defects in the first
freeze: a descendant-held pipe took about 1,013 ms under a 30 ms deadline,
a synchronous staging write consumed a 30 ms deadline but still launched the
child, and a 150 ms synchronous cleanup under a 50 ms budget returned success.
The three mounted negatives initially failed **3/3** in
`/tmp/activation-offline-lifecycle-initial-red.log`. The adapter now starts
its monotonic clock before staging, refuses launch after deadline, launches
the fake verifier in a distinct process group, kills that group and cancels
both readers on failure, and checks deadline/cancellation after cleanup.
The focused suite passed **65/65, 169 assertions** after the correction
(`/tmp/activation-offline-reader-settle-green.log`); final-byte counts below
supersede that intermediate run. A separate harmless `setsid` fixture tests
reader cancellation when a process outside the owned group retains a pipe;
the test explicitly kills that fixture in its own cleanup. The adapter claims
process-group termination and prompt reader settlement, not containment of
arbitrary escaped sessions.

`bun /tmp/activation-offline-v2-watches.mjs` independently changed 35 new
conditions. Every trial had a named RED exit 1 and restored GREEN exit 0,
with exact mutation/source-hash transcripts at
`/tmp/activation-offline-v2-<fault>-{red,green}.log` and the main summary at
`/tmp/activation-offline-v2-summary.log`. The 35 cover group termination,
pre-spawn and post-cleanup deadline, duration/output safe-integer predicates,
three independently coherently repinned SHA-256 policy formats, fatal UTF-8,
stderr byte-cap binding, twelve security CLI arguments and thirteen protected
authority-to-policy fields. The first group-kill trial stayed GREEN because
reader cancellation independently settled the pipe; it is disqualified.
After a descendant-liveness assertion was mounted, omitting group kill alone
failed that assertion (RED 1/GREEN 0). Separate `reader_cancel`,
`preaborted`, `cleanup_cancel`, `detached_group`, `timer_kill` and
`reader_cancel_error` and `reader_settle` trials each failed the named
intended assertion and restored GREEN 0. These make **42 accepted correction
pairs**. The first 35
plus `reader_cancel`, `preaborted`, `cleanup_cancel`, `detached_group` and
`timer_kill` restored historical pre-Proof SHA-256
`a34e8ca40134ca880551d87c7f3bac806e290af6cabb6b8b97246581c622965f`;
the later stream-cleanup-error trial restored historical SHA-256
`de1258d38853dd429c2b4176d8801c1fe2f51b7fbf5de82a3809eeeac739d0cd`.
The reader-settlement trial restored historical SHA-256
`745a5f59f3c2e5c2628d113e54bb7ccf6a5015d062a3566ee61bafca7c2b4854`.
Adjacent `Proof:` comments report the observed effect, including the
diagnostic nature of the exact policy-vector failures; no fake output is
described as a successful signature proof.

The first combined post-correction run passed the new adapter tests but an
existing check-staging FD-count assertion observed 15 instead of 17 after a
baseline read (`/tmp/activation-offline-corrected-five.log`); this run is a
failure, not counted as validation. The adapter now awaits both reader
cancellation promises before returning, with an independently watched
`reader_settle` test. Two subsequent unchanged five-file runs each passed
**653/653, 2,167 assertions**, exit 0
(`/tmp/activation-offline-corrected-five{2,3}.log`). These runs establish the
final source behavior; they do not prove the earlier FD-count variance had a
single cause or alter that existing assertion.
Direct TypeScript build, scoped ESLint, CLI package build, pinned OpenSpec
strict (1/1) and all (143/143), and Prettier check on the four intended files
all exited 0 on corrected bytes (`/tmp/activation-offline-final2-{type,lint,build}.log`,
`/tmp/activation-offline-final2-{strict,all}.json`, and
`/tmp/activation-offline-final2-format.log`). `git diff --check` and staged
patch verification are recorded at freeze. CI, host gate, live credentials,
installed verifier closure and valid signed-journal cryptographic success
remain unrun.

The exact `79ef6c8f` staged review found one remaining early-rejection path:
stdout overflow made `Promise.all` reject before delayed stderr cancellation
settled. Astra's fake process returned with cancellation started but not
settled, losing the later cleanup sentinel. The mounted
`pinned runner retains delayed sibling cancellation failure after stdout overflow`
test failed **0/1** on that patch (`/tmp/activation-offline-sibling-initial-red.log`).
The runner now retains both reader promises and drains their outcomes in
`finally` after killing the owned process group, before temporary cleanup or
error construction. The focused test then passed in
`/tmp/activation-offline-sibling-green.log`. Independently replacing the
two-reader drain with an empty set produced named RED exit 1; restored GREEN
exit 0 (`/tmp/activation-offline-v2-sibling_settle-{red,green}.log`), restoring
historical source SHA-256
`ae4e5777bd1b2e2ec91eb449d1ebaf276291103680cbeb743fdf8f8e0c6c2f04`.
This is the **43rd accepted correction watch**, and the adjacent `Proof:`
names the lost delayed error. Final-byte results below supersede the previous
653-test runs; no signature-authentication claim changes.
The corrected final five-file command named above passed **654/654, 2,171
assertions**, exit 0 (`/tmp/activation-offline-final3-five.log`). Direct
TypeScript build, scoped ESLint, CLI package build, pinned OpenSpec strict
(1/1) and all (143/143), and Prettier check all exited 0 on these runtime
bytes (`/tmp/activation-offline-final3-{type,lint,build}.log`,
`/tmp/activation-offline-final3-{strict,all}.json`, and
`/tmp/activation-offline-final3-format.log`). The host gate, CI, valid signed
journal, installed verifier pins and live provider remain unrun/unverified.

Final worker rerun on the corrected runtime bytes (2026-10-08): the exact
five-file command above passed **654/654 tests, 2,171 assertions**, exit 0
(`/tmp/activation-offline-final4-five.log`). Direct `tsc --build --force`,
scoped ESLint, and CLI `bun src/packaging/build.ts` each exited 0
(`/tmp/activation-offline-final4-{type,lint,build}.log`); the build produced
nonempty `dist/bin.mjs` and `dist/package-manifest.json`. Pinned OpenSpec
strict passed 1/1 and `--all` passed 143/143 with zero failures
(`/tmp/activation-offline-final4-{strict,all}.json`). Prettier checked the
four intended files and exited 0 (`/tmp/activation-offline-final4-format.log`);
both working and staged `git diff --check` exited 0. Runtime source SHA-256
was `1123268bc8ba7a89862acdef19648ecccc180ce614c73b8eedcb66c28d452385`;
test SHA-256 was `5070c2afcdc8a5d59b8244bac8456a1675f6326266c78782e256d94cc827e71b`.
This rerun does not establish installed verifier pins, valid signed-journal
cryptographic success, live provider behavior, CI, or the host gate.

#### 2.1b increment 3: bounded unauthenticated journal retrieval

Journal Resource Protocol v1 now has a local retrieval-only implementation. The
new `RetrievedReviewJournal` is a typed collection of digest-staged bytes and
GitHub candidate bundle hints; it carries no authenticated-review or receipt
capability. There is no remote registration import, receipt mapping, database
write, production origin, credential provisioning or real signed-journal
positive in this increment. Task 2.1b remains open for those later boundaries,
and task 2.1d retains the independent producer obligation.

The first missing-module and deliberate-stub tests were RED before the happy
route became GREEN. Separate mounted REDs covered foreign journal/bundle
origins, redirect and credential crossover, altered and incomplete pagination,
duplicate manifest pairs, digest and cache conflict, symlink staging, unreadable
staging, signed-query redaction, malformed GitHub/manifest bytes, response
cleanup, byte ceilings and deadlines. The cache aggregate test exposed a real
omission: cached artifact bytes were not counted toward the 32 MiB whole limit.
Its eight verified 4 MiB artifacts succeeded before the fix; the corrected
accounting refuses before the GitHub scan. A pre-aborted operation also created
and cleaned a pending directory before refusal; it now refuses before staging.

The isolated mutation harness `/tmp/review-retrieval-watches.ts` generated
`/tmp/review-retrieval-watch-<fault>-{red,green}.log` for each named trial.
**82** production-path omissions had the intended named RED exit 1 and restored
GREEN exit 0, with exact source SHA restored after each. They cover exact
origins/base grammar/routes, family-scoped credentials and redirect policy,
GitHub Link origin/path/filter/cursor/completeness/page/candidate bounds,
status/media/encoding/body cleanup, declared/streamed/aggregate/cache byte
bounds, pre-abort/request/whole deadlines, duplicate identity, exclusive and
private staging, cache and staged-file rehash, symlink exclusion, partial
cleanup and signed-query redaction. They also cover explicit GET/omit-credentials
request fields, input authority, bundle URL userinfo/fragment, cache inode
metadata and both response/reader cancellation paths.

Astra's read-only lifecycle trace then produced five named initial REDs
(`/tmp/activation-retrieval-lifecycle-initial-red.log`): a late fetch response
retained a live body after caller abort; held response and reader cancellation
blocked teardown; a fetch that advanced the monotonic clock 10,001 ms bypassed
the request timer; and an injected pending-directory removal failure replaced
a typed `absent` refusal with a raw cleanup error. The corrected owner cancels
late bodies, cancellation races the same request abort/deadline, post-await
checks enforce the absolute request deadline, and failed staging cleanup
aggregates primary and cleanup errors while retaining the primary typed kind.
The focused retrieval suite then passed 56/56 tests and 211 assertions
(`/tmp/activation-retrieval-post-audit-green.log`).

Three provisional mutation trials are excluded from the 82: cache rehash was
masked by the later staged-file digest check; cache `isFile()` was masked by
the real directory's `nlink=2`; and the first response-cleanup redaction trial
had a faulty restored-GREEN assertion of the Error display name. The first
test now observes the forbidden artifact write after the redundant outer
digest guard was removed. The second injects a non-file inode with `nlink=1`
at the production `fstatSync` boundary. The third assertion was corrected.
Each now has its own accepted named RED/restored GREEN rerun; the original
masked/disqualified trials are not counted. These are local fake-resource
proofs, not cryptographic authentication.

The final formatted six-file suite passed **710/710 tests, 2,382 assertions**,
exit 0 (`/tmp/activation-2-1b-retrieval-final2-six-file-tests.log`). Direct
`tsc --build --force`, scoped ESLint and CLI `bun src/packaging/build.ts` each
exited 0 (`/tmp/activation-2-1b-retrieval-final2-{typecheck,eslint,build}.log`);
the build produced nonempty `dist/bin.mjs` and `dist/package-manifest.json`.
Pinned OpenSpec strict passed 1/1 and `--all` passed 143/143, zero failures
(`/tmp/activation-2-1b-retrieval-final2-{strict,all}.json`). Six-path Prettier
check and working/staged `git diff --check` exited 0. Runtime source SHA-256
was `b564ee65faa7597f5fefa624e9882ce75f0cdff4d87763550f8a069bb05182bd`;
test SHA-256 was
`99b6f58d101ddba354645d10abbab858712ac3a2e1012973698a203c8aa09d4b`.
The host gate and CI need a committed SHA and were not run for this
uncommitted slice.

##### Retrieval lifecycle and guard correction after staged review

The preceding 710-test freeze was superseded by Astra's read-only review.
Four mounted P2 tests initially failed 0/4
(`/tmp/activation-retrieval-p2-initial-red.log`): a failed pending-directory
removal completed after the whole deadline or caller abort but returned
`absent`, and a late response body whose cancellation rejected or stalled
reported nothing. Retrieval now rechecks the whole deadline and cancellation
after removal, keeps the original typed refusal in an aggregate cause, and
requires a caller-supplied observer for redacted late cleanup failures. Late
body cancellation is bounded by the original request deadline. The focused
retrieval suite passed 69/69 tests and 256 assertions after the correction
(`/tmp/activation-retrieval-p2-focused-green.log`).

Sixteen further isolated production-path omissions produced named RED exit 1
and restored GREEN exit 0 (`/tmp/review-retrieval-p2-watch-summary.json` and
`/tmp/review-retrieval-watch-<fault>-{red,green}.log`). They cover the two
post-cleanup fences, late-failure observation and cancellation stall, FIFO
`O_NONBLOCK`, stage/cache owner UID, both cache-size guards, staged no-follow
reopen and three inode predicates, fatal manifest UTF-8 before decoder entry,
the first-body-read deadline and final staging deadline. No new masked trial
was counted. The accumulated accepted total is **98**; the three earlier
provisional masks/disqualifications remain excluded. These local probes do
not establish an installed producer, signed evidence or authenticated review.

The final formatted six-file suite passed **723/723 tests, 2,429 assertions**,
exit 0 (`/tmp/activation-2-1b-retrieval-final3-six-file-tests.log`). Direct
`tsc --build --force`, scoped ESLint and CLI `bun src/packaging/build.ts` each
exited 0 (`/tmp/activation-2-1b-retrieval-final3-{typecheck,eslint,build}.log`);
the build produced nonempty `dist/bin.mjs` and `dist/package-manifest.json`.
Pinned OpenSpec strict passed 1/1 and `--all` passed 143/143, zero failures
(`/tmp/activation-2-1b-retrieval-final3-{strict,all}.json`). Six-path Prettier
check and working/staged `git diff --check` exited 0. Runtime source SHA-256
was `84cf794a8c131e7c34706d1da699b92b1b1615f2e13545d0fe8edfed84f0d784`;
test SHA-256 was
`1f9440980cddedf5dd633e65b462af07871ff53c8aeae09d0c2fb9ccf487aef4`.
The host gate and CI still require a committed SHA and remain unrun.

##### Finite late cleanup and GitHub UTF-8 correction

Astra's next read-only trace found that a late body cancellation could settle
after ten monotonic seconds but before timer delivery, leaving the required
observer empty. The mounted finite-overrun test failed before the fix
(`/tmp/activation-retrieval-final-p2-red.log`). The success handler now checks
the original request deadline after cancellation settles and reports a redacted
`limit-exceeded` failure. The separate GitHub listing decoder was also missing
an isolated proof: malformed UTF-8 in an otherwise valid informational
`initiator` string refused on baseline, while disabling only that decoder's
`fatal` option returned a retrieved journal. Both independent mutations gave
named RED exit 1 and restored GREEN exit 0
(`/tmp/review-retrieval-final-p2-watch-summary.json` and individual watch
logs), raising the accepted total to **100**. No new mask is counted; the
three historical provisional trials remain excluded. These tests use fake
resources and do not authenticate any signed provenance.

The final formatted six-file suite passed **725/725 tests, 2,435 assertions**,
exit 0 (`/tmp/activation-2-1b-retrieval-final4-six-file-tests.log`). Direct
`tsc --build --force`, scoped ESLint and CLI `bun src/packaging/build.ts` each
exited 0 (`/tmp/activation-2-1b-retrieval-final4-{typecheck,eslint,build}.log`);
the build produced nonempty `dist/bin.mjs` and `dist/package-manifest.json`.
Pinned OpenSpec strict passed 1/1 and `--all` passed 143/143, zero failures
(`/tmp/activation-2-1b-retrieval-final4-{strict,all}.json`). Six-path Prettier
check and working/staged `git diff --check` exited 0. Runtime source SHA-256
was `9122cf055c84ce13086ff3740869645520ff0ee51c2872028eba446daf9b9431`;
test SHA-256 was
`491c7cc159a48f7de64b546782e76626549dcbeeed65f138f4f8ff660f2a6c2c`.
The host gate and CI still require a committed SHA and remain unrun.

### Selector partition and token-preflight architecture amendment (2026-10-08)

Docs-only planning follow-up on `plan/automatic-activation-review-semantics`; no source,
provider configuration, model calls or implementation-worktree edits. The partition and count
contracts below are **planned, not implemented or externally accepted**. Exact committed
`70326a9ca76fed9e95802fb5e40d2e7c44a5d31a` inventory, read with `git ls-tree -r`, contains
1,722 distinct Markdown Git blobs (1,304 under OpenSpec). This is a source-size observation,
not a completed protected selector run or production-policy classification acceptance.

The amendment preserves complete original resource/relationship duties, defines deterministic
whole-duty shards and complete coverage certificates, and requires global synthesis for every
multi-shard original obligation. The follow-up below specifies recursive synthesis within this
change; it remains unimplemented, and coverage alone cannot clear the original review or WBS 030.6. Actual-request count API observations are
estimates, with explicit headroom and separate actual-usage refusal; no accurate local Claude
tokenizer or provider credential has been provisioned by this work.

| Planned R5 boundary   | Required isolated fault and observed assertion                                                                                             | Current evidence |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Partition fidelity    | Drop one original raw document/duty or a crossing-edge endpoint; exact coverage/freeze assertion must fail                                 | Unrun            |
| Partition bounds      | Omit common-cold/ten-slot reservation, byte/count/shard cap or indivisible-duty refusal; named fit assertion must fail                     | Unrun            |
| Partition identity    | Change ordered duty/resource/shard binding; exact replay/dispatch assertion must fail                                                      | Unrun            |
| Certificate authority | Omit one shard/read/status/current-owner/transaction join; no selected certificate or partial state assertion must fail                    | Unrun            |
| Global synthesis      | Permit multi-shard coverage to satisfy original obligation; verified/publication/admission refusal assertion must fail                     | Unrun            |
| Count admission       | Omit exact request/model/projection/call binding, checked arithmetic/headroom or deadline/retry bound; intended pre-send refusal must fail | Unrun            |
| Count concurrency     | Hold count then change owner/epoch/expiry/authority; omitted fence must expose the stale-send assertion                                    | Unrun            |
| Actual evidence       | Admit count-pass/actual-overrun or omit/substitute one retained preflight record; passing-receipt refusal must fail                        | Unrun            |

No RED/GREEN trial is claimed here. Implementers must record exact commands, intended assertion,
exit, restoration and masked/disqualified attempts adjacent to each production Proof comment.
No host gate, CI, model/token-count API, production selector fit or synthesis acceptance ran.

Design checks observed: pinned OpenSpec strict validation passed 1/1 and `--all --json`
passed 143/143 (zero failures, `/tmp/selector-shards-all.json`). Commands used:
`bunx @fission-ai/openspec@1.12.0 validate automatic-trusted-activation --strict --json`
and `bunx @fission-ai/openspec@1.12.0 validate --all --json`.
The first four-path Prettier check identified a multiline inline-code span in tasks; it was
rewritten on one line and formatting rerun. Final four-path Prettier, `git diff --check` and repeated strict/all OpenSpec checks passed
on the complete recorded amendment before commit. These checks validate docs;
they do not constitute any R5 behavioral proof or live provider acceptance.

### Recursive synthesis architecture correction (2026-10-08)

The preceding partition amendment's indefinite synthesis deferral is superseded. This docs-only
correction makes authenticated recursive reduction, crossing-duty review and terminal global
certification required implementation work in this change. It keeps every original raw duty;
root reasoning consumes authenticated retained child reports, not all raw bytes in one context.
Neither mathematical model-quality assurance nor real-repository/provider acceptance is claimed.
The 1,722-document observation motivates a multi-level test; it is not proof that installed byte,
model, aggregate cost/time or certificate limits fit. Limits and external identities remain pinned
bootstrap inputs, and no provider was called or configured.

| Planned R5 boundary         | Independent fault and required production-path assertion                                                                                       | Evidence |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Complete DAG                | Drop raw duty, leaf, crossing relationship or root reachability; independent original-plan closure refuses                                     | Unrun    |
| Deterministic bounded graph | Change owner/order, allow cycle, singleton loop, fan-in/depth/node/reservation/certificate overflow; exact graph/fit assertions fail           | Unrun    |
| Child authority             | Replace actual authenticated report with unsigned summary, hash-only placeholder, foreign or failed receipt; parent authority stays absent     | Unrun    |
| Report fidelity             | Omit input/read/citation/judgment binding or report cap; actual report acceptance refuses                                                      | Unrun    |
| Delayed materialization     | Omit owner/lease/selected-child fence during held retrieval, atomic insert or no-repair check; stale send/partial row assertion fails          | Unrun    |
| Cold and informed isolation | Expose child evidence cold or omit direct endpoint/child reads informed; exact phase-read assertions fail                                      | Unrun    |
| Execution convergence       | Remove persisted aggregate call/deadline/uncertainty guard or prune failed node; bounded refusal and no synthetic receipt assertions fail      | Unrun    |
| Terminal authority          | Accept all-leaf passes with failed root/crossing node, or substitute V1 intermediate certificate; original-review/verified join remains absent | Unrun    |

All tasks and behavioral proofs remain unchecked. Documentation checks are recorded below only
after fresh execution. No implementation, worker, host gate, CI, external review or activation
acceptance is claimed. The follow-up is prepared on the isolated planning branch for local architecture review; no
implementation-worktree files are changed.

Fresh correction checks: pinned OpenSpec strict passed 1/1; all passed 143/143, zero failures
(`/tmp/selector-reduction-all.json`). Four-artifact Prettier and `git diff --check` passed.
Relative Markdown file-link scan found no unresolved targets in these four artifacts; it does
not validate external URLs. These are document checks only; every reduction R5 row is unrun.
