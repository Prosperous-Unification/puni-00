# Claude review of the resolved Wayfinder route

Reviewed 2026-09-08 after Dany explicitly approved sending commit `a6a1753d`'s
planning documents to Anthropic. The read-only command reported model
`claude-fable-5-1`; no tools with write or command authority were enabled. This is
an attributed design review, not runtime evidence or approval.

## Scope

Claude read the resolved Wayfinder map, assumptions, control-plane proposal,
design, tasks, verification record, all delta specs and execution profile. It was
asked to test the personal request-to-production route, exact-artifact promotion,
assistant/session/work-view coverage, exhaustive GWT enforcement and dependency
consistency.

## Findings and disposition

| Severity | Finding                                                                                                                                                      | Disposition                                                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Critical | The final environment floor made M1 impossible before Task 13 implemented its adapters, contradicting prose that cloud acceptance was disabled in M1.        | Accepted. Added immutable `factory-core` and `personal-delivery` floor revisions. M1 pins the former; Task 13 owns publication of the latter after compatibility is proved.                                                                      |
| High     | Task 7.3 still owned a main-publication path before staging while Task 13 also owned publication.                                                            | Accepted. Task 7 now prepares/verifies candidates and explicitly lacks `publishCandidate`; Task 13.3 introduces and proves publication after staging acceptance.                                                                                 |
| High     | The manual cloud-browser gate was an agent activity whose prose could be mistaken for acceptance, and serial staging made the M1 scaling target unreachable. | Accepted in mechanism. Interactive browser driving may remain agent/operator work, but a registered tool derives the report from captured observations. M1 scaling pins `factory-core` and excludes the later serialized personal-delivery path. |
| High     | A source-writing knowledge activity after publication could bypass staging or recursively invalidate candidates.                                             | Accepted. Knowledge reconciliation is now a deliverable stage before verification. Handoff writes no candidate source.                                                                                                                           |
| High     | Exhaustive GWT had no named validator, CI target, ledger format or mandatory reviewer.                                                                       | Accepted. Task 1.0 owns the validator, tests, Nx/CI target and per-requirement `Coverage:` block; scenario validation and specification critique are factory-core floor activities.                                                              |
| Medium   | Branch-dev publication and scheduled dev sweeps had no valid execution slots.                                                                                | Accepted. Task 13 owns a long-lived branch-dev observer activity and a separate compiled `dev-sweep` trigger workflow outside the candidate DAG.                                                                                                 |
| Medium   | Secretary availability had no capacity pool/provider reserve, and Tasks 15–16 named no implementation surfaces.                                              | Accepted. Added a secretary pool and required provider reserve; worker admission cannot consume it. Tasks 15–16 now own concrete modules, operations and tests.                                                                                  |
| Low      | Two anchors, the release command floor key, A17 retention and the missing storage ceiling were inconsistent.                                                 | Accepted. Links target the renamed design section; commands are distinct from lifecycle approvals; A17 is reconciled and A66 sets a provisional 10 GiB personal corpus ceiling.                                                                  |

## Reviewer verdict

The submitted revision was **not PASS**. The reviewer said the request-to-production
route becomes coherent once Task 13 lands, but the prior floor, publication,
acceptance and knowledge ordering made the earlier milestones inconsistent. The
dispositions above describe the subsequent working-tree corrections; they require
fresh validation and are not covered by the original verdict.

## First follow-up

Claude re-read the corrected working tree with the same read-only tool boundary. It
confirmed six of the original eight findings as resolved and returned **not PASS**
with these remaining consistency issues:

| Severity | Finding                                                                                                                                                                     | Disposition                                                                                                                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | The factory-core handoff and scheduled dev-sweep applicability were still ambiguous.                                                                                        | Factory-core now reaches handoff through explicit later-floor inapplicable dispositions. Dev sweeps are enabled only by personal-delivery and each occurrence requires its own envelope and budget account.                                                |
| Medium   | Browser driving and report verification had no explicit receipt dependency; the knowledge rework rule and two resource sources were underspecified.                         | Acceptance-report is ordered after acceptance and consumes the exact browser receipt. Knowledge edits occur before ordinary review. Organization snapshots now own the provider reserve and every named pool, including secretary and branch-dev capacity. |
| Medium   | Registered implementations and assistant/search surfaces lacked complete task ownership.                                                                                    | Tasks 1, 7, 11, 13, 15 and 16 now name the concrete modules, operations, tests and registered adapters they introduce.                                                                                                                                     |
| Low      | One Task 7 assertion could pass without a publication capability, the scaling outcome labels diverged, evidence producers were undeclared and one retention note was stale. | Task 7 now proves publication is absent at its boundary; Task 13 owns the early-publication negative. Scaling uses one accepted-outcome name, evidence has a producer catalog and A17/A54 carry one retention rule.                                        |

These dispositions describe the next correction pass. A later verdict below is the
only review of their combined state.

## Second follow-up

Claude reviewed the combined corrections and again returned **not PASS**. It
confirmed the earlier floor handoff, browser receipt ordering, knowledge ordering,
capacity-source, implementation-ownership and identifier corrections, then found
two high and several smaller gaps:

- the `dev-sweep` referred to an unpublished envelope and did not pin a profile;
- raw profile flags and floor-forced enablement had contradictory validation rules;
- floor-specific terminal outcomes, candidate scenario/report coverage, the
  mandatory Playwright floor, later optional-hook registration, corpus retention,
  pool-schema ownership, core handoff outcome ownership, production deployment and
  the verifier-before-receipt negative were incomplete.

The next correction declares the recurring envelope and its human publication,
defines raw-profile then floor-overlay resolution, assigns terminal stage/outcome
per floor, adds coverage and production activities, places Playwright in
factory-core, scopes the later notification hook to personal-delivery, and assigns
the missing ownership and negatives. This verdict does not cover those edits.

## Third follow-up

Claude confirmed the complete personal loop, floor overlay, recurring authority,
retention boundary, core handoff, production adapter and receipt negative, but
returned **not PASS** for two remaining planning contradictions and related drift:

- pre-Task-7 component work had no complete test registry while the production
  factory-core correctly refuses missing implementations;
- Task 8 still described economy without the browser activity now required by the floor.

It also found unordered coverage/report activities, an omitted run state and
floor-relative outcome term, four missing traceability rows, a stale non-MCP claim,
an undefined evidence lifetime, release admission after delivery deadline, an
unused reviewer pool and reuse of the candidate report verifier for dev sweeps.
The next correction adds the guarded test-only registry, a separate coverage stage,
floor-relative terminology and traceability, a 365-day evidence duration, a bounded
release envelope, reviewer resource claims and a distinct dev-sweep verifier.

## Fourth follow-up

Claude confirmed that the personal loop and factory-core milestone were coherent,
along with every issue from the third follow-up except the final release-account
wording and task traceability. It returned **not PASS** because the general deadline
and budget rules still contradicted the release carve-out. It also identified the
missing `awaiting_release` task proof, indefinite abandoned-release retention,
inconsistent reviewer-resource use and one stale evaluation sentence.

Revision 9 makes release authority a release-only suballocation on the same run
account, adds the deadline exception to both normative locations, expires an
uncommanded handoff after 30 days, consumes the reviewer pool for every review-class
activity, assigns the lifecycle negatives to Task 13 and makes the requirement
coverage table the complete mapping.

## Fifth follow-up

Claude confirmed those mechanisms and again returned **not PASS**, narrowly. The
ordinary hard-cap rules still lacked the named release-suballocation exception,
five rows in the now-complete traceability table omitted personal-delivery owners,
and the tool-only release envelope carried an inert agent-time limit. The final
correction repeats the sole release exception at every hard-cap rule, adds Tasks 7,
11 and 13 to the affected mappings, and removes that unused dimension.

## Sixth follow-up

Claude confirmed the hard-cap exception and release-envelope dimensions, then
returned **not PASS** for two omissions in the complete mapping: Task 13 was absent
from capacity/budget admission and Task 11 from the authorized command surface.
The final correction adds both and gives Task 13 an explicit release-after-exhausted-cap
and release-after-deadline proof.

## Final confirmation

Claude returned **PASS** after reading the final task mapping and its governing
requirements. It confirmed that Task 11 owns the human-only trigger-envelope
command surface; Task 13 owns capacity/budget admission for production release;
and the Task 13 negative proves the same-account release-only suballocation remains
admissible after ordinary cap exhaustion and delivery-deadline expiry without
spending the exhausted cap or resetting the run clock. No unresolved finding
remained in the confirmation scope.
