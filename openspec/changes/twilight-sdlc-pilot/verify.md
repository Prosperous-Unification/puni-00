# Twilight SDLC trial verification

Scope: documentation, workflow configuration, research and product planning on
2026-09-06. The scoped documentation/schema work and local review are complete;
Claude Fable 5.1 reviewed the repository and corrections, finding the plan actionable
with no blocking correction remaining.
No product implementation, ACP provider execution,
development deployment or production release was performed by this trial.

## Identity and authority

Repository: `puni-00`, base commit `1e87500c6a2e9f5bc1f9962f4ed56161ecec83b4`.
The checkout already contained workflow-upgrade edits and untracked Twilight docs.
Changes remain uncommitted; the base commit alone does not identify their content.
A [content manifest](../../../docs/twilight-structure/evidence/content-manifest.json) identifies the handoff inputs; verification/receipt files are excluded to avoid self-reference. No application behavior,
existing WBS plan, user-level skill installation, or default schema was changed.
The obsolete stdio header in MCP main.ts was removed after checking its actual
HTTP caller; this was a documentation correction only.

The user authorized self-answered discovery and a plan, later required per-client
Nx repos, Backlog-backed WBS after refactors, identical puni self-growth, and a
Claude Fable 5.1 review. [Assumptions](../../../docs/twilight-structure/assumptions.md)
record the chosen defaults and reopen conditions. These are not future run approvals.

## Observed commands

Native CLI: `bunx @fission-ai/openspec@1.12.0`, observed version `1.12.0`.
Bun: `1.4.0`. Final scoped command results: [scoped-checks.json](../../../docs/twilight-structure/evidence/scoped-checks.json).
Full disposable command records, mutations, assertion output and
exit codes: [cli-probes.json](../../../docs/twilight-structure/evidence/cli-probes.json).
The fixture repository was under `/tmp`; only its change was archived.

| Check                                                | Observed outcome                                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema validate twilight-v1 --json`                 | Valid, no issues                                                                                                                                      |
| `validate twilight-sdlc-pilot --json`                | 1 passed, 0 failed                                                                                                                                    |
| `validate twilight-control-plane --json`             | 1 passed, 0 failed                                                                                                                                    |
| `validate --all --json`                              | 39 changes passed, 0 failed; no main specs present                                                                                                    |
| Direct missing intent/spec prerequisites             | Apply state `blocked`; omitting each prerequisite separately broke its negative assertion                                                             |
| Empty intent                                         | CLI marked it `done`; this is an observed limit of file progress                                                                                      |
| Checked task without execution                       | CLI reported `all_done`; no runtime evidence existed                                                                                                  |
| Nested spec archive/discovery                        | Disposable `twilight/probe` was synchronized, listed and validated                                                                                    |
| New main spec purpose                                | Disposable archive created a placeholder Purpose and validator emitted a warning while remaining valid; semantic completeness needs additional review |
| Intent sizes                                         | Pilot 266 words; product 275 words, below 400                                                                                                         |
| `bun run tools/tool-git-hooks/src/hooks/doc-caps.ts` | Passed at 150 lines; fresh disposable 151-line fault failed, then restored control passed; see review closure receipt                                 |
| `git diff --check`                                   | Passed on the current diff                                                                                                                            |

## Failure proofs

The whole-repository validator also emitted eight informational archive warnings
for existing WBS changes whose target main spec is absent. They remain structurally
valid; their archive readiness is not established or repaired by this trial.
See the full output in `scoped-checks.json` for the affected change IDs.

The initial local link probe passed on 32 Markdown files and 133 links before final
receipt links were added. Its separate missing-target mutation exited 1 and
returned `source.md: target.md`; restoration passed. It checks destination
existence only, not anchors, readability of destinations or semantic truth.

Scoped formatting uses cached Prettier 3.8.3 with this repository's relevant
formatting options and no missing Tailwind plugin. It does not claim the Nx
format gate passed. The final receipt includes its fresh `--check` output.

These are observed CLI/document checks. They do not prove future BE policy,
LangGraph recovery, ACP containment, budget admission or Backlog transaction safety.

| Check                                      | Injected fault                                                   | Test observing failure                  | Actual output                                                    | Restored outcome                        |
| ------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| Direct intent prerequisite in schema apply | Remove `intent` while a spec and tasks exist but intent does not | `negative-absent-intent` in CLI records | Exit 1: `Expected absent intent to block apply; received ready`  | Assertion passed after restoring schema |
| Direct specs prerequisite in schema apply  | Remove `specs` while intent/tasks exist but specs do not         | `negative-absent-specs`                 | Exit 1: `Expected absent specs to block apply; received ready`   | Assertion passed after restoring schema |
| Native scenario validation                 | Change `#### Scenario` to `### Scenario`                         | `negative-malformed-scenario`           | Exit 1: requirement `must include at least one scenario`         | Validation passed after restoration     |
| Native graph validation                    | Intent requires tasks, forming a cycle                           | `negative-schema-cycle`                 | Exit 1: `Cyclic dependency detected: intent → tasks → intent`    | Valid after restoration                 |
| Native template validation                 | Remove required `spec.md` template                               | `negative-missing-template`             | Exit 1: `Template file 'spec.md' not found for artifact 'specs'` | Valid after restoration                 |

The adjacent schema `Proof:` comment was added after those failures were observed.
No planned runtime fault in the product tasks is presented as an observed proof.

The later doc-cap proof invoked the actual production CLI from a disposable cwd:
the 151-line fixture exited 1 with `LLM_README.md: 151 lines, capped at 150`, and
the restored 150-line fixture exited 0. The command's success contract is silent;
the receipt names the command and records both states. `wall_time_seconds` fields
are tool-supplied metadata, not a measured command-duration contract, and are not
used for performance or execution-time claims. Claude's receipt has the CLI's own
reported `durationMs`, separately attributed.

## Review and SDLC findings

Primary-source researchers had separate write scopes for runtime, wiki/focus and
Backlog notes. Their reports distinguish observed upstream contracts from proposed
Twilight behavior. No live integration was inferred from documentation.

An independent-context local reviewer identified and prompted revisions to:

1. Request-to-plan authoring: add bounded discovery authority and shared artifact
   revision/adoption operations; start the acceptance journey without prebuilt files.
2. Configuration ownership: publish canonical repository inputs with CAS, then
   reproduce the service's compiled digest from a clean checkout.
3. Uncertain effects: add a scoped, evidence-bearing recovery decision and retain
   unknown outcomes when dependent work is abandoned.
4. Planning/source join: identify repo/plan/change/source basis, pin exports in the
   source candidate, and test branch-specific predecessor readiness.
5. ACP containment and bootstrap: route real effects through the tested boundary;
   distinguish initial OpenSpec planning from the later Backlog backend.

These are design findings, not observed runtime defects. Review dispositions and
the requested Claude review status are maintained in the
[review record](../../../docs/twilight-structure/evidence/plan-review.md).

The amended plan passed the local follow-up review with no remaining blocking
logical contradiction. The final manual-only discovery type correction is recorded
in that review. This is a planning judgment, not runtime proof.

The subsequently authorized [Claude review](../../../docs/twilight-structure/evidence/claude-review.md)
identified three P1 corrections to later slices and no blocker to Task 1–2.
Its [dispositions](../../../docs/twilight-structure/evidence/plan-review.md) record
identity, concurrency, refactor-entry and smaller acceptance-test corrections.
The exact reviewer was `claude-fable-5-1`; the CLI additionally reports auxiliary
Haiku usage. The model's statement that no network/export occurred is incorrect:
local read tools supplied repository material to authorized Anthropic inference.

A [static focus brief](../../../docs/twilight-structure/evidence/focus-brief.md)
was produced for this handoff. Manual comparison found one next action, a resume
cue, parked work, explicit budget/approval boundaries and access to the full
plan/assumptions/evidence. It preserves unavailable Nx/runtime checks instead of
hiding them. This exercises the documentation profile only: browser focus/full
parity, persistence and accessibility are unrun Task 5.4 tests.

The trial already demonstrates why the small custom tool is needed: artifact
existence and structure do not enforce content coverage, applicability, revision
freshness, user decisions or executed evidence. The new plan assigns those checks
to shared compiler/BE/CI operations with explicit negative tests.

## Unrun checks and applicability

| Check                                                                        | Status and reason                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                                                 | Attempted; unavailable, `bun is unable to write files to tempdir: EROFS`; Nx/checkout dependencies are absent                                                                                              |
| Full Nx tests/lint/typecheck/build and host gate                             | Not run; this is docs/schema scope and dependencies are unavailable; no application correctness claim                                                                                                      |
| Full repository Prettier/Tailwind configuration                              | Not run; plugin unavailable; scoped cached formatter checks are recorded separately                                                                                                                        |
| ACP/LangGraph/checkpointer, capacity races, effect recovery, safety controls | Not implemented or executed; acceptance experiments in product Tasks 1–8                                                                                                                                   |
| Backlog native operations, WBS codec/migration, clone races                  | Not executed; Tasks 9–10 depend on landed WBS refactor interface                                                                                                                                           |
| Real cloud browser, dev/prod deploy, recovery                                | Inapplicable to this docs trial; still required for relevant runtime delivery                                                                                                                              |
| Main spec synchronization/archive                                            | Not performed for real changes; only disposable fixture archive was tested                                                                                                                                 |
| Claude Fable 5.1                                                             | Completed the authorized repository review through CLI; exact model/usage/input receipt retained. Corrections applied; follow-up found no blocking correction. Exact response and input receipts retained. |

## Handoff status

The [initial final-check receipt](../../../docs/twilight-structure/evidence/final-checks.json)
records the pre-Claude snapshot: cached formatting, 135 resolved local links,
41 substantive hashes and 14 unchecked product deliverables. Those counts are
historical; Claude corrections split the same 14 task groups into 20 deliverables.
The [review closure receipt](../../../docs/twilight-structure/evidence/review-closure-checks.json)
records the amended snapshot and scoped checks. The [doc-cap proof](../../../docs/twilight-structure/evidence/review-doc-cap.json)
records the named command and its 151-line fault/restoration.

The product [tasks](../twilight-control-plane/tasks.md) remain unimplemented.
The schema is opt-in during the trial; Task 8 owns the tested default migration
for puni-00 and clients. The [requirement coverage](../twilight-control-plane/tasks.md#requirement-coverage)
assigns every TS-01–26 requirement to a trial artifact or implementation slice;
coverage is not runtime completion. Claude correction follow-up is complete and its final minor repairs were checked
against the source. All seven pilot tasks are complete. No product implementation, integration or release
is authorized merely by closing this documentation trial.

The [Claude follow-up](../../../docs/twilight-structure/evidence/claude-followup.md)
and [model/input receipt](../../../docs/twilight-structure/evidence/claude-followup-receipt.json)
close TS-26. Its final transport correction and wrong-consumer test were applied
after the review and checked locally. The raw responses remain unedited; their
known factual errors are corrected in the disposition record.

Final closure: 39 OpenSpec changes passed (the same eight pre-existing archive
INFO findings remain), 42 Markdown files had 159 resolvable local destinations,
42 handoff hashes matched, all 20 product deliverables were unchecked and all
seven pilot tasks checked. Scoped cached formatting and the doc-cap command
passed. The application-source diff removes only the stale MCP comment; no
application behavior was changed or newly tested. The review closure receipt
was populated with these outputs after the check, preserving their attribution.

## Documentation commit scope

The user subsequently requested committing only the plan/docs. Application, CI,
default-schema and generated-skill edits remain outside that commit. The opt-in
Twilight artifact schema accompanies the plans; it does not change the default.
The separate OpenSpec upgrade is still needed before treating repository CI as
validation of the nested capabilities. Trial commands explicitly pinned 1.12.0.

Bun dependencies were installed for commit preparation. The two review Markdown
renderings were formatted with the actual repository Prettier configuration;
verbatim text is preserved as reviewText with SHA-256 in their JSON receipts.
Earlier receipts describe the full reviewed working tree, including local inputs;
the final content manifest now lists only this documentation commit artifacts.
The application/full Nx gate was not run for this documentation-only commit.
