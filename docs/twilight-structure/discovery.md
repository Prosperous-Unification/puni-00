# Twilight Structure discovery

Status: prior interview record, started 2026-09-06. The subsequent user request
authorizes autonomous planning and self-answered questions. Current working
answers live in [assumptions](assumptions.md), including the later client Nx
repository and Backlog-backed WBS requirements.

The [specification](spec.md) records requirements stated by Dany. This file
records the questions, recommendations, and subsequent decisions. A proposed
answer is not a confirmed decision or permission to perform an action.

## Interview approach

Original interactive approach: ask one question at a time, include a recommendation,
and wait for the answer. For this trial, the user's no-question instruction
supersedes that pause; record provisional answers and continue.
Research factual questions in the codebase and primary sources. Preserve
unresolved choices explicitly instead of silently turning them into defaults.
Accepted answers update the specification and, when relevant, the glossary.

Superpowers brainstorming is installed in the shared personal skill collection;
it complements `grill-me` and domain modeling. The reusable repository setup
must make those dependencies available independently of a developer's machine.
Discovery produces reviewable documents before implementation planning.

## Q1: Where does the factory require human approval?

Status: original question retained. A03 supplies the current provisional product
default, and this planning run has explicit autonomous authority.

Question: at which boundaries must the factory stop for approval before it
continues?

**Recommendation made at the time:** require approval after discovery, after
specifications, and after a work plan with its token/time budget. Then perform
implementation, cross-review, tests, and development deployment within the
approved scope. Production deployment always requires an explicit human command,
as already required in the brief. This recommendation was later narrowed and
recorded as [A03](assumptions.md).

Rationale: a mistaken scope or plan can otherwise spend substantial resources
before there is a useful result to inspect. This policy permits execution to
proceed without approval for every routine task.

Alternatives presented: approval of only the budgeted plan before execution;
or autonomous progress through development with approval only for production.

Answer for the current plan: consolidate at approval of the specified, budgeted
plan, with configurable earlier/activity checkpoints. This is an agent-selected
assumption under the user's delegation, not approval of future execution.
The explicit human production command remains a user requirement.

## Q2: Where do authoritative requirements live?

Status: accepted on 2026-09-06.

Dany requested a documentation and development workflow combining OpenSpec,
Superpowers, grill-me/Wayfinder, and a DDD-oriented LLM Wiki. This repository
will pilot it before the factory reuses it for other repositories.

**Accepted answer:** OpenSpec owns the testable behavioral requirements; a
DDD-oriented wiki owns domain explanations and links to the contracts. Discovery
records, accepted decisions, execution plans, and verification evidence each
retain an explicit canonical home. That split and its rejected alternative — making
wiki pages canonical specifications and adapting OpenSpec to track changes to
them — are stated once, in
[requirements and the wiki](knowledge.md#requirements-and-the-wiki-the-boundary).
[Source findings](sdd-sources.md) distinguish upstream capabilities from our
proposed integration.

Answer: Dany accepted the proposed division after the concrete spec/wiki/plan
example, then requested clear SDLC steps and enforcement through OpenSpec CLI
features. The authority split is settled. The exact stage completion checks
and Q1's human approval boundaries remain in design.

## Clarification: one OpenSpec-defined flow

Accepted direction, 2026-09-06. Dany linked
[OpenSpec issue #780](https://github.com/Fission-AI/OpenSpec/issues/780) and
specified that OpenSpec governs the steps and document formats while other
skills contribute to the unified flow. The integration belongs in the custom
schema's artifact dependencies, templates, and skill-invoking instructions.

The [stage design](sdlc-stages.md) maps the contributing skills and completion
checks into that flow. The linked community bridge supplies an implementation
pattern; it has not been installed or selected wholesale. Production remains
on explicit command. Q1 now has a provisional answer in A03 under the user's
subsequent autonomous-planning instruction.

## Original decision backlog

The questions below are discovery provenance. The current [assumption ledger](assumptions.md)
answers each area provisionally with experiments/reopen conditions; no answer is
being awaited for this plan.

- Initial usable release and how much of the full delivery loop it includes.
- Single-owner versus team use; authentication and ownership of credentials.
- LangGraph workflow authority versus ACP agent/session authority, and the
  purpose of LangChain within that boundary.
- Exact `agy` runtime and ACP adapter; protocol version and required capability
  matrix for each provider, including usage reporting and recovery.
- Agent placement, workspace isolation, permission handling, provider quotas,
  cancellation, session rollover, and recovery after interruption.
- Which discovery assumptions may be used provisionally, how they are
  confirmed or rejected, and how contradictions reopen downstream work.
- Exact `betterpowers` and `llm-wiki` references, and the relationship between
  source material, accepted specifications, working knowledge, and work plans
  (working answer: A37).
- WBS ownership and integration while `wbs-tool-v1` continues development;
  dependency semantics and separate accounting for human effort, agent effort,
  elapsed time, tokens, money, and constrained execution capacity.
- Cross-review independence, evidence validity, finding resolution, stopping
  criteria, test adequacy, and the cost of repeated review cycles.
- MCP and cron requirements, further baseline integrations, missed schedules,
  overlap handling, retries, and durable external side effects.
- Development acceptance and cloud-browser provider; reliable deployment,
  rollback, migration behavior, and the scope of a production command.
- Observability coverage, measured versus estimated usage, missing signals,
  prompt/tool-output retention, and evaluating improvement without weakening
  the checks that judge it.
- What self-improvement may change and what evidence and approval it requires.

## Discovery checklist

- [x] Inspect WBS stack and current repository conventions.
- [x] Inspect selected Claire and OpenHands sources; record source boundaries.
- [x] Record the subsequent autonomous discovery instruction and linked answers.
- [x] Compare approaches and record the accepted requirements/wiki authority split.
- [x] Write the proposed product design, capability deltas and owning glossary.
- [x] Create the single OpenSpec `tasks.md` plan; no separate plan artifact.

Current review/verification status lives in the [pilot report](../../openspec/changes/twilight-sdlc-pilot/verify.md).
This checklist does not imply user approval of the proposed runtime or implementation.

A visual comparison can be introduced when it helps resolve a particular
design choice. No application implementation or provider execution has begun.
