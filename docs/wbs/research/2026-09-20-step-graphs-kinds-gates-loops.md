# Step graphs, kinds, gates and loops

Desk research, date 2026-09-20. Covers S1 to S8 of the research plan's theme S
(`docs/superpowers/plans/2026-09-20-wbs-agentic-planning-research.md`). S9, the
question of whether Dany's `configurable-tree-traversal` library can carry the
graph's walks, belongs to the model experiment (R5); it is noted below only
where it bears on one of S1 to S8.

## What the WBS does today

A project holds one **step order**: a list of named steps, one position each,
shared by every work item in the project (`CONTEXT.md`, "Step order"). A leaf
work item gets one **slice** per step, and `sliceGraphEdges` in
`libs/wbs/domain/domain/src/slice-edges.ts` chains a leaf's own slices in that
one order — step `n` finishes before step `n + 1` starts, unconditionally, no
branch, no skip. `schedule.ts` names that chain edge `stepOrder`, one of seven
`ScheduleFloor` values a slice's start can be pinned by. A step itself
(`step.ts`) carries only a name and a position; `StepService`
(`step.service.ts`) only adds, renames and removes one — no kind, no owner, no
optionality, no edge to another step. Cross-item ordering is a separate
concept, a **dependency**, whose **reach** into a multi-step predecessor is a
project-wide, not per-edge, choice between `whole-item` and `anchor-slice`
(`docs/adr/0010-a-dependencys-reach-is-a-projects-choice.md`). A person's
**kind** is `person` or `agent`, stored once per directory entry
(`stored-vocabularies.ts`, `PERSON_KINDS`), "a fact the reader can see, not a
rule the engine follows" — nothing about a step's kind. Step progress
(`progress.ts`) is two states, `in_progress` and `done`; `blocked` and
`cancelled` were refused on purpose because "each extra state is a question the
engine must answer the day it starts reading this... and the engine is not
reading this yet."

## S1. Where the graph lives

GitHub Actions' `needs` is per-job, inside one workflow file: the graph is
scoped to the run, not to a repository-wide template
([Using jobs in a workflow](https://docs.github.com/en/actions/using-jobs/using-jobs-in-a-workflow)).
Argo's DAG template lives inside one `Workflow` or `WorkflowTemplate`
resource, so a graph is a reusable template a run instantiates, not a
per-repository default
([DAG](https://argo-workflows.readthedocs.io/en/latest/walk-through/dag/)).
Airflow's DAG is the unit of definition; a run (`DagRun`) instantiates it
unchanged. None of these separates "the graph" from "the thing that carries
it" the way project/work-item-type/work-item would.

Today's step order is already project-wide, matching Argo's and Airflow's
"one graph, many runs" shape at the project level. A graph per work item type
would be closer to a template library but has no precedent for being the
_default_ rather than an explicit per-run choice.

Options:

- **One graph per project, as now.** No migration (S7); every type works the
  same steps. Cost: a project mixing very different work (a doc item, a code
  item) cannot give them different graphs without per-item overrides.
- **One graph per work item type, project default.** Cost: `step.service.ts`,
  `stepIsInUse` and every roll-up that assumes one project-wide step list gain
  a type dimension; `CONTEXT.md`'s "Step" and "Step order" both say "for the
  whole project" and need rewriting.
- **One graph per work item, project supplies a default.** Most flexible,
  least precedented — every tool surveyed shares one graph definition across
  runs. Cost: highest — `sliceGraphEdges`'s per-leaf chain becomes a per-leaf
  stored graph rather than a derived one.

## S2. What the kinds are

GitHub Actions has no step-level "who does this" kind; a job's steps share a
runner. Its nearest concept is the **environment**, which a job references to
gain protection rules including required reviewers
([Using environments for deployment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)):
"a job that references an environment must follow any protection rules for
the environment before running," up to six reviewers, one approval needed —
a property of the job via the environment, not a separate human job kind.
Airflow's Sensor is a distinct operator that polls for an external condition
in `poke` or `reschedule` mode
([Sensors](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/sensors.html));
built for automated polling, not a person's decision.

Optional-as-"not required" and optional-as-"skipped here" are different
questions in every tool surveyed. Airflow's `skipped` is a _task-instance_
state on one run
([DAGs](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html)),
never a property of the task definition. Argo's task becomes `.Skipped` when
its own `when` evaluates false, `.Omitted` when its `depends` evaluates false
([Enhanced Depends Logic](https://argo-workflows.readthedocs.io/en/latest/enhanced-depends-logic/)):
two keywords for two reasons a task did not run, both per-run facts, neither
stored on the template.

For the WBS: `PERSON_KINDS` already labels a directory entry, unused by the
engine. A step kind naming who does it (agent, human, either) is a new, and
separate, fact from that.

Options:

- **Kind and optionality both on the step definition.** Simplest. Cost:
  cannot say "optional on this item, required on that one" — every exception
  forks the plan.
- **Kind on the step, optional/skipped a per-item fact**, mirroring Argo's and
  Airflow's run-scoped skip. Cost: a new per-item-per-step row; `stepIsInUse`
  gains a fifth kind of holding to report.
- **Kind stays directory-only**, as today, and a step names only an assumed
  assignee kind. Cheapest. Cost: cannot say "this step is agent work"
  independent of who is assigned — exactly the gap the field evidence names
  (publishing a package became a whole work item because a step could not say
  "a person does this").

## S3. How review loops fit an acyclic graph

Every DAG-shaped tool surveyed keeps its graph acyclic and pushes repetition
elsewhere. Airflow's trigger rules (`all_success`, `all_failed`, `all_done`,
`one_failed`, `one_success`, `none_failed`, `all_skipped`, and others — full
list in [DAGs](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html))
decide whether a task runs given its upstreams, but name no way back to an
earlier task; a repeat is a new DAG run, not a cycle. Temporal ends the current
workflow execution and starts a fresh one with continued state —
**continue-as-new** — instead of a structural loop, because one execution's
event history is capped (51,200 events / 50 MB) and "long-running
Workflows... accumulate Event History with every iteration"
([Continue-As-New Pattern](https://docs.temporal.io/design-patterns/continue-as-new)).
GERT is the classical technique built to hold a real cycle: Pritsker's 1966
RAND memo describes stochastic networks admitting feedback loops and rework
directly, where CPM and PERT conventionally require an acyclic activity
network and model a repeat by duplicating the activity (RAND,
[GERT: Graphical Evaluation and Review Technique](https://www.rand.org/pubs/research_memoranda/RM4973.html),
RM-4973-NASA, 1966 — its node algebra beyond this summary is unverified here,
this note read about it, not it). LangGraph is the outlier: explicitly not a
DAG framework ("if you want to build a DAG, use LangChain Expression Language
instead"), and a conditional edge may route back to an earlier node, so
review-and-revise is a literal cycle ended by a conditional edge to `END`
([Graph API overview](https://docs.langchain.com/oss/python/langgraph/graph-api)).

The plan's three candidates map onto this split: a bounded repeat count on an
edge matches nothing surveyed; rounds as status history on one step is the
Airflow/Temporal answer (graph stays a DAG, repetition is run/history state);
an explicit rework step is the GERT/LangGraph answer (the graph is not simply
a DAG).

Options:

- **Bounded repeat count on an edge.** No prior art to borrow failure modes
  from.
- **Rounds as status history on one step**, graph stays a strict DAG. Cost:
  `progress.ts`'s two-state, latest-only model would need to become a history
  — theme P's P8, not this theme, but the dependency is real.
- **An explicit rework step**, closer to GERT/LangGraph's real cycle. Cost:
  breaks the plan's own stated constraint ("Steps form a directed acyclic
  graph"), and `hasCycle`/`topological` in `schedule.ts` would need a second
  mode for the step graph.

## S4. What a human step means to the schedule

None of the tools surveyed give a human task its own calendar. GitHub
Actions' reviewer wait is not scheduled at all — the job halts until approval
or timeout, no duration. Airflow's Sensor waits with a poke interval and
timeout, closer to a floor than a duration. Argo's suspend template either
waits indefinitely for `argo resume` or auto-resumes after a fixed `duration`
(`suspend: {duration: "20"}`)
([Suspending](https://argo-workflows.readthedocs.io/en/latest/walk-through/suspending/)) —
a stated ceiling, not a person's calendar. No tool surveyed resource-levels a
human wait the way `capacityProfile` in `schedule.ts` already does for named
assignees.

Options:

- **Unassigned human step blocks** — no floor computed past it until somebody
  is named, matching every tool above's "just wait, no estimate." Cost: a
  plan with one unassigned human step loses every date past it.
- **Floats on an assumed duration**, as an unestimated slice already does.
  Cost: a plan reads as scheduled when a human step nobody looked at is
  silently guessing — `assumed-duration.ts` already warns readers must be told.
- **Warns but does not block**, drawn distinctly (as the assumed span's `?`
  already is). Cost: a new render state, and a new rule for what "critical"
  means through a step with no real duration.

## S5. What a gate is

The two human-affecting mechanisms surveyed model it two ways. GitHub
Actions' required reviewers are an **environment** property, not a job
property and not an edge: any job referencing the environment inherits the
wait — the gate is one level removed from the job. Argo's suspend template is
a **step**: `suspend: {}` sits in the step sequence like any other template
([Suspending](https://argo-workflows.readthedocs.io/en/latest/walk-through/suspending/)).
LangGraph's interrupt is neither: `interrupt()` is called from inside a
node's function, halts there via the checkpointer, resumes with
`Command(resume=...)`
([Human-in-the-loop](https://docs.langchain.com/oss/python/langchain/human-in-the-loop));
the newer middleware form wraps it as a hook rather than a distinct graph
element.

Options:

- **A step with zero duration**, matching Argo's suspend template — reuses
  existing step mechanisms. Cost: "zero duration" already means something
  specific (`durationOf` returns the _assumed_ duration for `days === null`,
  not zero), so a gate needs its own duration rule, not the existing
  null-days path.
- **An edge property**, loosely matching GitHub Actions' environment-on-job
  shape — the gate belongs to what is crossed, not to a step. Cost: no edge
  in `slice-edges.ts` today carries any property; a property-bearing edge is
  a bigger change to that module's shape than a new step kind is to `step.ts`.

## S6. How dependencies reach into a graph

ADR 0010 settled the chain case: `reachedSliceOf` picks the predecessor's last
slice under `whole-item`, or its first _estimated_ slice under `anchor-slice`,
falling back to the last slice either way. Both answers are well-defined only
because today's per-item slices form one linear order. No tool surveyed gives
a direct precedent for "first"/"last" in a non-linear graph: GitHub Actions'
`needs` and Argo's `dependencies` both name job-to-job or task-to-task edges
directly, with no notion of "whole job's reach" distinct from the edge — a
dependency there is already edge-scoped, closer to the per-edge model ADR
0010 explicitly deferred than to either of its two stored options.

Options:

- **Generalise "last" to every sink of the step graph, "first" to every
  estimated source** — order is now partial, needing a tie rule. Cost:
  `reachedSliceOf`'s single-index return stops working; a reach over a graph
  names a _set_, and every downstream caller assumes one index today.
- **Keep dependencies whole-item-only once steps are a graph**, dropping
  `anchor-slice` and letting the deferred per-edge model answer finer reach
  instead. Cost: an existing per-project choice stops being expressible the
  day steps become a graph — a behaviour change ADR 0010 did not anticipate.

## S7. What happens to existing projects

GitHub Actions, Argo and Airflow all treat a plain sequence as the degenerate
case of a DAG — a chain is a graph with one edge per neighbour, nothing
special. `sliceGraphEdges` already produces exactly that shape today, so a
graph representation that expresses a chain as one edge per adjacent pair
costs nothing to migrate, whether derived on read or written once by a
migration that reproduces the same edges.

Options:

- **Derive the chain as the graph's default on read**, storing no edges for a
  project that never touched the feature. Cost: two code paths until every
  project has been edited once; matches "nothing migrates" literally.
- **Migrate every project's implicit chain into stored edges once**, forward
  and additive per the repo's migration rule. Cost: a real migration to write
  and test, but one code path afterwards, and it is the only option
  consistent with blue/green sharing SQLite mid-swap if both colours read the
  new edges table.

## S8. Editing and showing a graph in a one-list table

None of the tools surveyed are edited through a spreadsheet-style table with
one column per step; they are edited as YAML/JSON (GitHub Actions, Argo,
Airflow) or as code building a graph object (LangGraph) — no precedent for
"a graph shown as an ordered list of columns." The WBS's own table already
has this shape today — one column per step, in step order
(`apps/wbs/fe-01/src/components/wbs/plan-columns`, `folded-step-card.tsx`) —
because the graph has always been a simple chain, so "step order" and
"column order" have been one fact. A real graph breaks that identity: a step
with two predecessors, or two independent branches, has no single position
that column order alone can display.

Options:

- **One column order chosen by a topological sort**, branching/merging shown
  in a separate diagram the table does not attempt. Cost: two surfaces to
  keep in sync, and a column order that can shift without the graph changing
  if the sort is not stable.
- **Table stays chain-only; a graph editor takes over once steps branch**, so
  the table degrades to today's shape while a project's steps stay linear.
  Cost: a project jumps to a more complex surface the moment it adds one
  non-linear edge, with no partial view in between.

## What desk research cannot settle

Which of S1's three homes for the graph the team wants, and whether S2's kind
and optionality should be stored together or split, are decisions for the
design interview (R7) — no surveyed tool has this project/work-item/type
layering to borrow from. S9's concrete questions (whether an adapter over
`configurable-tree-traversal` gives correct topological order and cycle
refusal, and whether it is clearer or faster than the existing Kahn's-algorithm
walk) need the model experiment (R5), not reading. S6's generalised reach and
S8's graph-in-a-table shape both need a prototype against real plan shapes,
since no external precedent tests either directly. Whether S5's gate should
reuse the assumed-duration mechanism or need its own needs the same.

## Sources

- [Using jobs in a workflow](https://docs.github.com/en/actions/using-jobs/using-jobs-in-a-workflow) — `needs`, `if`, job status values.
- [Using environments for deployment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) — required reviewers as an environment property.
- [Argo Workflows: DAG](https://argo-workflows.readthedocs.io/en/latest/walk-through/dag/) — `dependencies`.
- [Argo Workflows: Enhanced Depends Logic](https://argo-workflows.readthedocs.io/en/latest/enhanced-depends-logic/) — `depends`, `Succeeded`/`Failed`/`Errored`/`Skipped`/`Omitted`/`Daemoned`.
- [Argo Workflows: Suspending](https://argo-workflows.readthedocs.io/en/latest/walk-through/suspending/) — suspend template, `argo resume`, auto-resume duration.
- [Apache Airflow: DAGs](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html) — task states, trigger rules.
- [Apache Airflow: Sensors](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/sensors.html) — poke/reschedule polling.
- [Temporal: Workflow Message Passing](https://docs.temporal.io/encyclopedia/workflow-message-passing) — signals as fire-and-forget input.
- [Temporal: Continue-As-New Pattern](https://docs.temporal.io/design-patterns/continue-as-new) — event history limits, loop replacement.
- [Temporal: Workflow Execution limits](https://docs.temporal.io/workflow-execution/limits) — 51,200 event / 50 MB history cap (unverified beyond this page's own statement).
- [LangChain docs: Human-in-the-loop](https://docs.langchain.com/oss/python/langchain/human-in-the-loop) — `interrupt()`, checkpointer, `Command(resume=...)`.
- [LangGraph: Graph API overview](https://docs.langchain.com/oss/python/langgraph/graph-api) — cyclic graphs, conditional edges, not a DAG framework.
- [RAND: GERT: Graphical Evaluation and Review Technique](https://www.rand.org/pubs/research_memoranda/RM4973.html) — Pritsker, RM-4973-NASA, 1966; catalogue record, node algebra beyond the summary here unverified against the primary text.
- `docs/adr/0010-a-dependencys-reach-is-a-projects-choice.md`, `CONTEXT.md`, `libs/wbs/domain/domain/src/slice-edges.ts`, `libs/wbs/domain/domain/src/schedule.ts`, `libs/wbs/domain/domain/src/step.ts`, `libs/wbs/domain/domain/src/progress.ts`, `libs/wbs/domain/domain/src/stored-vocabularies.ts`, `libs/wbs/application/core/src/service/step.service.ts` — the WBS's own code, read directly.
