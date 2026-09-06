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

The [schema](../../openspec/schemas/twilight-v1/schema.yaml) owns artifact
dependencies/templates and invokes contributing methods. Read its actual
instructions at each stage. One required artifact class each for intent, specs,
plan and evidence; add technical design when non-trivial. Stages can have several
activities without acquiring another mandatory Markdown file.

## Stages, methods and return paths

| Stage                          | Work / contributors                                                                          | Canonical output and completion                                                                | Return path                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Request                        | Capture outcome, scope, non-goals and constraints                                            | `proposal.md`, at most 400 words; owner and permitted autonomy explicit                        | Reframe when the outcome changes                  |
| Discovery                      | Brainstorming + grilling + domain-modeling; research; Wayfinder when decisions span sessions | Same intent plus linked assumption/decision record; terms enter owning glossary immediately    | Reopen affected assumptions on contrary evidence  |
| Specification                  | OpenSpec requirements/scenarios and non-trivial technical design; independent critique       | `specs/<context>/<capability>/spec.md`, applicable `design.md`; coverage and examples reviewed | Revise discovery/contract for unresolved findings |
| Planning                       | Writing-plans redirected to one `tasks.md`; dependency/resource planning                     | Ordered testable slices, interfaces, proof oracles, estimates and stop limits                  | Replan on changed dependencies or budgets         |
| Implementation and task review | Isolated execution, TDD, critics, judges and bounded fixes                                   | Actual changes and attributed findings/evidence; checkboxes reference them                     | Fix the owning slice or its contract              |
| Integrated verification        | Relevant full gates and observed fault injections                                            | `verify.md` identifies exact content/environment and output                                    | Return to the artifact causing failure            |
| Development acceptance         | Deploy candidate and test with real cloud browser when applicable                            | Evidence linked from `verify.md`; served revision checked first                                | Recover deployment or reopen implementation       |
| Knowledge handoff              | Reconcile glossary/wiki/ADRs/contracts and source provenance                                 | `verify.md` links knowledge, sync/archive status and candidate                                 | Reopen stale claims; retain disagreements         |
| Production release             | Separate explicit human command for candidate/environment                                    | Attributed release record plus observed health/recovery                                        | Controlled recovery; no false success             |

Discovery precedes specification, planning precedes implementation. Per-task tests
do not replace integrated checks. Knowledge updates as it resolves and is reconciled
at handoff. Development completion is distinct from production delivery.

The earlier stage proposal introduced extra discovery/implementation/development/
handoff artifacts. This v1 keeps those activities inspectable through links and run
evidence while honoring the four-artifact rule. Git and dated research retain history.

## Authority and assumptions

The current user authorized an autonomous plan and self-answered questions.
[Working answers](assumptions.md) therefore replace clarification pauses for this
request. Provisional answers are not human approvals. The proposed product default
is one approval of the specified, budgeted plan; teams can configure additional
stage/activity checkpoints. Production retains its separate explicit command.
This is not a new permission ritual for already authorized repository edits.

What an approval covers, what invalidates it, and who may decide are the
[control-plane authority requirements](../../openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md);
this page does not restate them. Mandatory unavailable checks block.

## Focus profile across stages

Adapt [i-have-adhd](research/knowledge-patterns.md) as an optional presentation
profile: current outcome, one next action, small decision batches, evidenced
progress, parking lot and resume cue. Keep full detail accessible. It does not
remove needed alternatives, hide errors/dissent, invent estimates, or approve while
someone is away. It is neither a new stage nor a diagnosis.

The upstream skill is explicitly invoked and session-persistent. Its source was
inspected locally and online; this trial did not install it or silently activate
global preferences. Generated clients should pin the approved adaptation and expose
it through workflow configuration and supported native entry points.

## What the CLI establishes

| Check                                  | Establishes                                | Does not establish                                        |
| -------------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| `schema validate twilight-v1 --json`   | Schema graph/templates parse               | Runtime policy or safe effects                            |
| `status --change … --json`             | Output existence and graph readiness       | Content, approvals, all capability files or passing tests |
| `instructions … --json`                | Template/guidance/dependencies             | Permission; blocked instructions can still be returned    |
| `instructions apply --change … --json` | Direct required outputs and checkbox state | Current evidence, actual behavior or deployment           |
| `validate --all --json`                | Discovered spec structure/scenarios        | Semantic coverage or runtime correctness                  |
| `archive`                              | Native synchronization/archive operation   | Production delivery or a verified human decision          |

The trial tests these boundaries against 1.12.0. `apply.requires` lists intent,
specs and tasks directly: a task file does not recursively establish its ancestors.
Technical-design applicability is a caller obligation today; the future verifier
must enforce it. The schema is not a complete workflow engine.

## Applicability and completion

For this docs/schema trial: CLI validation/probes, navigation, intent size, doc
cap, scoped formatting and independent plan review are relevant. Application
build/tests, ACP runtime, cloud browser, deployment, security and race tests have
not happened because their plans exist. List them as unrun/inapplicable with reasons.

For application work, identify repository, change, task/attempt, source content,
compiled policy, command/tool version and environment. Dirty work needs a content
manifest, not only a base commit. Every new safety check has a production-path
negative whose intended fault was observed before its `Proof:` comment. Shared
layout/CSS effects require whole-browser coverage. Unknown never becomes OK.

Currently `tasks.md` is the single authored plan. After the WBS/Backlog bridge is
proven, the accepted per-repo planning revision owns tasks and emits this artifact
deterministically. The [migration](client-repositories.md) changes authority explicitly.

## From pilot to service

The custom `tool-twilight` compiler/verifier fills identified gaps: content and
capability coverage, applicability, provenance/digests, stale decisions and task
extraction. BE and CI call the same operations. LangGraph persists and executes
the compiled workflow while ACP workers act within capabilities. Hooks/settings
use the [exposed control matrix](product-experience.md). Implementation order belongs
only to the [delivery plan](../../openspec/changes/twilight-control-plane/tasks.md).
