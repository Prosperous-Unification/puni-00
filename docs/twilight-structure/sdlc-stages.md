# Twilight SDLC v1

Status: opt-in repository workflow, exercised by the
[documentation trial](../../openspec/changes/twilight-sdlc-pilot/verify.md).
Runtime enforcement is planned in the [control-plane tasks](../../openspec/changes/twilight-control-plane/tasks.md).
Default WBS changes still use `sdd-lean`. Select the workflow per change:

```sh
bunx @fission-ai/openspec@1.12.0 new change <name> --schema twilight-v1
bunx @fission-ai/openspec@1.12.0 status --change <name> --json
bunx @fission-ai/openspec@1.12.0 instructions intent --change <name> --json
```

The [schema](../../openspec/schemas/twilight-v1/schema.yaml) owns the independent
file-readiness DAG, templates and contributing methods. Artifact mappings supply
stage inputs and evidence; they do not order stages. The
[execution profile](../../openspec/schemas/twilight-v1/execution.yaml) beside it is
the only stage DAG: each stage names its prerequisites, activities and applicable
policy. It also registers hooks and defines delivery profiles. Read the schema's
actual instructions when producing an artifact. One required artifact class each
for intent, specs, plan and evidence; `design.md` is always present and holds only
an applicability statement for a mechanically obvious change. Stages may contain
activities without acquiring another Markdown file.

## Stages, methods and return paths

Stage ids and prerequisites are the ones `execution.yaml` declares; this table is
their explanatory projection, not a second dependency source.

| Stage id         | Work / contributors                                                                          | Canonical output and completion                                                               | Return path                                       |
| ---------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `request`        | Capture outcome, scope, non-goals, constraints and delivery profile                          | `proposal.md`, at most 400 words; owner and permitted autonomy explicit                       | Reframe when the outcome changes                  |
| `discovery`      | Brainstorming + grilling + domain-modeling; research; Wayfinder when decisions span sessions | Same intent plus linked assumption/decision record; terms enter owning glossary immediately   | Reopen affected assumptions on contrary evidence  |
| `specification`  | OpenSpec requirements/scenarios and technical design; independent critique                   | `specs/<context>/<capability>/spec.md`, `design.md`; coverage and examples reviewed           | Revise discovery/contract for unresolved findings |
| `planning`       | Writing-plans redirected to one `tasks.md`; dependency/resource planning                     | Ordered testable slices, interfaces, proof oracles, estimates in ledger units and stop limits | Replan on changed dependencies or budgets         |
| `implementation` | Isolated execution, TDD and bounded fixes                                                    | Actual changes with attributed evidence; checkboxes reference them                            | Fix the owning slice or its contract              |
| `review`         | Critics, judge and rework rounds from the delivery profile                                   | Findings, verdicts and dispositions                                                           | Rework to the owning activity within the limit    |
| `verification`   | Relevant full gates and observed fault injections                                            | `verify.md` identifies exact content/environment and output                                   | Return to the artifact causing failure            |
| `integration`    | Compose authorized deliverables and verify the combined candidate                            | Exact composed source and full gate evidence                                                  | Recompose changed base or repair failed members   |
| `acceptance`     | Deploy candidate and test with real cloud browser when applicable                            | Evidence linked from `verify.md`; served revision checked first                               | Recover deployment or reopen implementation       |
| `handoff`        | Reconcile glossary/wiki/ADRs/contracts and source provenance; write the outcome record       | `verify.md` links knowledge, sync/archive status, candidate and outcome                       | Reopen stale claims; retain disagreements         |
| `release`        | Separate explicit human command for candidate/environment                                    | Attributed release record plus observed health/recovery                                       | Controlled recovery; no false success             |

Stage scope controls each ordering boundary: implementation, review and verification
advance per deliverable; integration and acceptance join candidate members; handoff
joins required accepted outcomes. Independent deliverables pipeline across stages.
Disabled activities preserve their scoped dispositions without inventing evidence.
Per-task tests do not replace the floor's integrated gate. Knowledge updates as it
resolves and is reconciled at handoff. Development completion is distinct from
production delivery, and `release` never starts from stage completion. Which
activities a run performs is the delivery profile's choice within the repository
and organization floors; changing enablement is one audited activity override.

## Authority and assumptions

The current user authorized an autonomous plan and self-answered questions.
[Working answers](assumptions.md) therefore replace clarification pauses for this
request. Provisional answers are not human approvals. What an approval covers, what
invalidates it, and who may decide are the
[control-plane authority requirements](../../openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md).
Mandatory unavailable checks block.

## Focus profile across stages

The focus profile is described once in
[product experience](product-experience.md#focus-profile). It is a per-actor
presentation preference selected in the execution profile's `presentation`
section, neither a stage nor a diagnosis. The upstream skill was inspected locally
and online; this trial did not install it or activate global preferences.

## What the CLI establishes

| Check                                  | Establishes                                | Does not establish                                      |
| -------------------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| `schema validate twilight-v1 --json`   | Artifact-readiness graph/templates parse   | Runtime stage policy or safe effects                    |
| `status --change … --json`             | Output existence and artifact readiness    | Stage progress, approvals, capability coverage or tests |
| `instructions … --json`                | Template/guidance/dependencies             | Permission; blocked instructions can still be returned  |
| `instructions apply --change … --json` | Direct required outputs and checkbox state | Current evidence, actual behavior or deployment         |
| `validate --all --json`                | Discovered spec structure/scenarios        | Semantic coverage or runtime correctness                |
| `archive`                              | Native synchronization/archive operation   | Production delivery or a verified human decision        |

The trial tests these boundaries against 1.12.0. `apply.requires` lists intent,
specs and tasks directly: a task file does not recursively establish its ancestors.
Design is a dependency of tasks, so fast-forward evaluates its applicability
before planning; the CLI does not judge whether an applicability-only design was
the right call, and the future verifier will. The schema is not a workflow engine.

## Applicability and completion

For this docs/schema trial, CLI validation and probes, navigation, intent size, doc
cap, scoped formatting and independent plan review were the relevant checks.
Application build and tests, ACP runtime, cloud browser, deployment, security and
race tests were not run: they are planned, and nothing in this trial executed them.
List them as unrun or inapplicable with reasons.

For application work, identify repository, change, task/attempt, source content,
compiled policy, profile epoch, command/tool version and environment. Dirty
work needs a content manifest, not only a base commit. Every new safety check has
a production-path negative whose intended fault was observed before its `Proof:`
comment. Shared layout/CSS effects require whole-browser coverage. Unknown never
becomes OK.

Currently `tasks.md` is the single authored plan. After the WBS/Backlog bridge is
proven, the accepted per-repo planning revision owns tasks and emits this artifact
deterministically. The [migration](client-repositories.md) changes authority explicitly.

## From pilot to service

The custom `tool-twilight` compiler/verifier fills identified gaps: content and
capability coverage, design applicability, provenance/digests, stale decisions,
profile floors, organization-snapshot inputs and task extraction. BE and CI call
the same operations. LangGraph persists and executes the compiled workflow while
ACP workers act within
capabilities. Settings and levers use the
[exposed control matrix](product-experience.md). Implementation order belongs
only to the [delivery plan](../../openspec/changes/twilight-control-plane/tasks.md).
