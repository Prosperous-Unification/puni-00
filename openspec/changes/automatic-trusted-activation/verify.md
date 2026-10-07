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

Fresh design checks on 2026-10-07:

| Command/check                                                                                                                                                                                                | Observed output                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `bunx @fission-ai/openspec@1.12.0 validate automatic-trusted-activation --strict --json`                                                                                                                     | 1/1 valid, zero issues                                                    |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                                     | 143/143 valid: 125 changes, 18 specs, zero failures                       |
| `bun /home/df/wd/puni/puni-00/node_modules/prettier/bin/prettier.cjs --check CONTEXT.md docs/adr/0037-activation-authority-is-independent-of-the-candidate.md openspec/changes/automatic-trusted-activation` | All matched files use Prettier code style                                 |
| Read-only Python word/link/structure inspection                                                                                                                                                              | Intent 301 words; four local links resolve; 10 requirements, 23 scenarios |
| `git diff --check`                                                                                                                                                                                           | Exit 0, no output                                                         |

Creating planning artifacts or OpenSpec reporting planning complete does not imply
implementation completion. All runtime fault proofs below remain unobserved.

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

| ID  | Safety boundary                   | Planned injected fault                                                                                          | Planned observing test                                                                         | Observed result |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------- |
| F1  | Bootstrap and trusted-state reads | Default absent/unreadable/malformed state or missing authority to usable                                        | bootstrap refuses unavailable authority; unreadable state never becomes absent                 | NOT RUN         |
| F2  | Independent provenance            | Accept local-cooperative relabel, nonexistent journal invocation or wrong issuer                                | installed reviewer proves the exact invocation                                                 | NOT RUN         |
| F3  | Exact request identity            | Omit each repository/head/base/policy/mapping/toolkit/generation join separately                                | request binds repository head base and trust; concurrent candidates resolve independently      | NOT RUN         |
| F4  | Complete review                   | Accept wrong executor/obligation, missing/reordered phase, reads, raw response, telemetry or unresolved finding | installed reviewer proves the exact invocation                                                 | NOT RUN         |
| F5  | Required checks                   | Suppress failed exit and skip refusals separately                                                               | installed checks preserve failed and skipped outcomes                                          | NOT RUN         |
| F6  | Worker isolation                  | Expose harmless publisher sentinel or journal write capability                                                  | candidate cannot read publisher or mutate journal                                              | NOT RUN         |
| F7  | Archive trust and containment     | Remove issuer/digest/role/runtime/path join separately; substitute candidate URL                                | prepared candidate passes production admission; required workflow rejects unbound green status | NOT RUN         |
| F8  | Immutable publication             | Permit conflicting occupied key or trust unverified existing bytes                                              | lost publish response resumes exact bytes                                                      | NOT RUN         |
| F9  | Required workflow authority       | Trust forged status or skip required workflow's artifact verification                                           | required workflow rejects unbound green status                                                 | NOT RUN         |
| F10 | Durable effect recovery           | Remove stage/version fencing or duplicate-effect reconciliation                                                 | duplicate and lost events converge; lost publish response resumes exact bytes                  | NOT RUN         |
| F11 | Lease and retry bounds            | Allow obsolete worker; disable attempt/time bound separately                                                    | expired worker is fenced; retry exhaustion stays failed                                        | NOT RUN         |
| F12 | Protected current merge           | Remove head precondition, base freshness or merge-group composition binding separately                          | head and base races refuse stale merge; merge-group recomposition requires new evidence        | NOT RUN         |
| F13 | Actual merged commit              | Reuse head/group/ancestor/equal-tree certificate; weaken sole-parent refusal                                    | merged revision cannot borrow PR certificate                                                   | NOT RUN         |
| F14 | Host and retention                | Accept missing/unreadable/corrupt host bytes or delete referenced evidence early                                | host consumes CI archive; live admission prevents early deletion                               | NOT RUN         |
| F15 | Bootstrap transition              | Admit partial variable tuple or incompatible workflow/trust transition                                          | bootstrap transition never admits partial variables                                            | NOT RUN         |
| F16 | Completion evidence               | Accept simulated provider, missing merged/host proof or stale WBS revision                                      | closure requires complete current evidence                                                     | NOT RUN         |

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
