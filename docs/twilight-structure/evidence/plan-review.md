# Plan review record

Scope: proposed architecture and delivery plan, 2026-09-06. A design review is an
attributed judgment, not runtime verification or a human execution approval.

## Local independent-context review

Reviewer: harness agent `/root/plan_review`, given bounded file references rather
than the coordinator's conversation. No tool-attested distinct model identity is
available for this review; it does not substitute for Claude Fable 5.1.

| Finding                                               | Severity         | Disposition                                                                                                                     |
| ----------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| No path from an empty request to an approvable plan   | P1               | Added discovery envelope, artifact revision/adoption operations and no-fixture browser/API tests in design, specs and Tasks 3/5 |
| FE workflow publishing can diverge from repo files    | P1               | Repository inputs remain authored source; CAS publication and clean-checkout digest tests added                                 |
| Unqueryable effects have no operator resolution path  | P1               | Added scoped `resolve_effect`, evidence requirements, stale decision refusal and terminal retained-unknown abandonment          |
| Planning commit is not joined to compatible source    | P2               | Added PlanRef, source lock/export ordering, receipt revisions and branch readiness tests                                        |
| Standalone effect test could miss ACP bypass          | Proof obligation | Task 6 now requires live brokered-tool proof and denies direct egress from unmediated shell                                     |
| Initial client bootstrap implies future Backlog setup | Clarification    | Tagged `openspec`/`wbs-backlog` manifest and initial operator server binding added                                              |

The reviewer could answer all five navigation questions with canonical links:
authority, next plan, absence of runtime deployment, WBS/Backlog ownership, and
explicit human production command. `verify.md` was still being assembled when the
first review ran; it was not counted as completed evidence then.

Follow-up review confirmed all substantive findings closed at plan level and
found no further blocking logical contradiction. Its one final type/prose mismatch
was corrected: a null discovery envelope permits manual-only authoring, and Task 3
must prove it refuses automatic discovery spend. Task 1 remains the next action.
Files were live during these reviews; this is not a content-frozen attestation.
The final manifest identifies the handoff; runtime reviews must use exact snapshots.

## Requested Claude Fable 5.1 review

The [official model page](https://platform.claude.com/docs/en/models/fable-5-1/overview)
identifies `claude-fable-5-1`. Local Claude Code version: 2.1.252; authentication
status reported logged in using first-party Claude credentials. No credentials
or account identifiers were copied into the documents.

A no-tools, no-session-persistence request was attempted with the exact model ID.
The sandbox could not resolve the API host; the response recorded `api_error`,
zero API duration and zero input/output tokens. Thus no model reviewed that bundle.

Automatic approval review rejected the network-enabled retry because it contained
154,000 characters of potentially sensitive repository planning and research.
The user was asked to approve a narrower export, then explicitly directed:
“just ask claude cli to review, it will review everything”. The authorized retry
used the actual CLI with repository Read/Glob/Grep tools and completed successfully.
The earlier denial was not bypassed; it was followed by that new user instruction.

The [first Claude review](claude-review.md) returned **actionable with corrections**,
with no blocker to Task 1–2 and three P1 findings affecting later slices. The
[CLI receipt](claude-review-receipt.json) records successful exit, exact model,
read paths, input hashes and usage. Review messages identify `claude-fable-5-1`;
the CLI also reports a small auxiliary Haiku charge, not a substituted reviewer.

Attribution correction: Claude's opening sentence says “no export, no network”.
Its file tools were local and read-only, but inference used Anthropic over the
network, as authorized by the user. That sentence is not an accurate privacy
claim. The unedited response is retained so this correction is auditable.

## Claude finding dispositions

| Finding                                                  | Disposition                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-1: unowned caller identity                            | A30 and Task 3.1 select existing OIDC/JWKS primitives, separate Twilight session/audience, browser-only minting and actual issuer-backed positive/denial tests. Design/spec make token scope and provenance explicit.                                                               |
| P1-2: two coordinators promised by single-coordinator M1 | Scenario now says concurrent requests inside one coordinator. Scale-out remains a separate future change requiring distributed proofs; trigger producers do not imply active coordinators.                                                                                          |
| P1-3: vague refactor landing gate                        | Replaced with the named handoff closure checklist and interface/typecheck/full-gate evidence. Did not accept the suggestion to start the adapter now: the user's explicit after-refactors ordering remains controlling.                                                             |
| P2-1: opaque doc-cap receipt/timing                      | Re-run the named direct Bun command and explicit line-count assertion in the review closure receipt. Tool transport timing is not used as command duration.                                                                                                                         |
| P2-2: schema-default parity                              | Task 8 pins old changes before moving both puni-00 and client defaults to twilight-v1. The current trial stays opt-in.                                                                                                                                                              |
| P2-3: oversized checkbox bundles                         | Tasks 1, 3 and 5 now expose individual deliverables; parser contract preserves dotted IDs. M1 estimates increased to 72–148 human hours / 1.19M–3.46M tokens, plus 30% reserve.                                                                                                     |
| P2-4: vacuous fixture/launch checks                      | Added empty-home container control, injected template canaries, admitted-record positive control and a later actual-worker repetition. These are planned tests, not observed runtime proofs.                                                                                        |
| P2-5: native Backlog bypass/hosting                      | Candidate views import through the broker; WBS is the hosted UI, UUID mapping owns identity, A31 names protected self-hosted Git identity/ref enforcement.                                                                                                                          |
| P2-6: automation waits for Backlog                       | Task 11.1 explicitly depends only on M1; 11.2 alone waits for Task 10.                                                                                                                                                                                                              |
| P3-1: parity ambiguity                                   | Design/spec distinguish workflow operations from interactive authority establishment. The follow-up corrected the inherited WBS transport error: both use Streamable HTTP; Task 5.1 inspects existing forwarding/auth before reuse.                                                 |
| P3-2: untested focus profile                             | Added a static handoff focus brief and explicit evidence limits; no browser focus behavior is claimed by this docs trial.                                                                                                                                                           |
| P3-3: stale review status                                | This record now distinguishes the failed original call from the successful newly authorized review. Task 7 is closed after the successful follow-up and final scoped checks.                                                                                                        |
| Additional assumptions                                   | A31–35 name the Git remote enforcement, cloud-browser candidate/compatibility gate, refactor closure, worker credential lifecycle, single configured organization and default parity. Task 6 names Claude-first/Codex-next probes; agy remains explicitly unsupported until proved. |

The [Claude follow-up](claude-followup.md) returned **Actionable. No blocking
correction remains.** Its [receipt](claude-followup-receipt.json) records the exact
model, successful CLI exit, usage and frozen input snapshot. It closed all three
P1 findings and found the first checkpoint experiment a credible next action.

Its remaining factual correction was checked against actual MCP source and applied:
WBS already serves Streamable HTTP. The design, Task 5.1 reuse obligation, this
record and LLM_README now agree; the obsolete stdio file-header comment was removed
from apps/mcp-01/src/main.ts without changing executable code. The suggested wrong-
consumer decision-token test is now explicit in Task 3.1. These small post-review
corrections were checked locally, not represented as a third Claude review.

The raw reviews are judgment over recorded inputs, not runtime verification or
deployment approval. Task 7 is closed; final scoped checks are recorded in the review closure receipt.
The external WBS refactor/typecheck closure remains an implementation dependency,
not an unfinished requirement of this planning trial.
