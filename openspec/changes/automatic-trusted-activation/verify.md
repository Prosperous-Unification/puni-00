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

Every row below is PLANNED / NOT RUN. Test names are acceptance targets, not existing passes.
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

Not run for this local documentation packet: runtime tests, lint/typecheck/build,
`bin/h2puni-gate.sh <sha>`, full Nx format, live provider/check/merge/host acceptance,
secrets/migration CI checks. No full-gate pass or implementation completion is claimed.
Before implementation completion, run the canonical host gate and retain the printed
`h2puni gate: running on <sha>` plus actual format/test/lint/typecheck/build and OpenSpec
outputs. Do not invoke raw full Nx gates on h2puni.

No remote publication, permission/secret/variable change, release or activation was attempted.

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
