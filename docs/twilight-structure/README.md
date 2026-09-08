# Twilight Structure

The resolved product route lives in the
[Wayfinder map](../../.scratch/twilight-structure/map.md). The
[question register](assumptions.md#wayfinding-question-register) scores every
provisional choice and identifies the one mandatory Phase 2 discovery question.

Start with the [delivery plan](../../openspec/changes/twilight-control-plane/tasks.md).
It builds the factory core, connects the always-available secretary, completes
branch-dev → staging → main/dev-main → production, and joins those records into
the searchable work view. Backlog-backed WBS, knowledge maturity and clean-client
portability follow before customer onboarding.

Current objective: give Dany the complete assistant-to-production loop while
minimizing elapsed time to accepted outcomes within approved spending and fixed
quality. M1 remains the technical factory-core landmark; it is not the personal
phase exit. Product code is not implemented. The
[current verification record](../../openspec/changes/twilight-control-plane/verify.md)
separates document checks from future runtime proofs.

The subsequent [branch-review hardening](../../openspec/changes/twilight-review-hardening/proposal.md)
amends the proposed contracts and repairs the repository workflow.

**Every review receipt under `evidence/` is a historical snapshot.** Each one
describes this repository at the commit it names, is not maintained against later
edits, and its `file:line` citations refer to that snapshot. Current acceptance
obligations live in the linked design, specs and tasks. Said once here, not
repeated per document.

| Need                                           | Read                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| What the user asked for                        | [Requirement catalog](spec.md)                                                  |
| Chosen working answers and reopen conditions   | [Assumptions](assumptions.md)                                                   |
| How the SDLC is run                            | [Stages and focus profile](sdlc-stages.md)                                      |
| What end users operate, configure, and inspect | [Product experience](product-experience.md)                                     |
| How clients and puni-00 share the setup        | [Client repositories and Backlog-backed WBS](client-repositories.md)            |
| Runtime architecture and first contracts       | [Control-plane design](../../openspec/changes/twilight-control-plane/design.md) |
| What we borrowed, rejected, or need to prove   | [Research notes](#research-notes), below                                        |
| How knowledge stays navigable and trustworthy  | [Wiki maintenance](knowledge.md), [repo wiki](../wiki/README.md)                |
| Domain words                                   | [Twilight glossary](CONTEXT.md), [context map](../../CONTEXT-MAP.md)            |

## Research notes

Each note records its inspection date. These notes distinguish upstream contracts, local
observations and Twilight proposals. An inspected API is not a tested
integration. Where a note's proposal has since become a specified contract, the
note links to it rather than restating it.

| Question                                                            | Source findings                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| What OpenClaw supplies for the assistant and what needs integration | [Assistant runtime boundaries](research/assistant-runtime-boundary.md)                                                          |
| How the current plan serves personal use and future customers       | [Phase dependency findings](research/phase-dependencies.md)                                                                     |
| OpenHands, OpenClaw, LangGraph/LangChain and durable workflows      | [Runtime patterns](research/runtime-patterns.md)                                                                                |
| Expandable execution pools and agent sandboxes                      | [Worker-pool candidates](research/worker-pools.md)                                                                              |
| How the 160-question grill constrains the plan                      | [Decision tree](evidence/grilling-decision-tree.md), [answered efficiency corpus](evidence/uber-efficiency-grill.md)            |
| i-have-adhd, Dahl's Wiki fork, Karpathy and Claw Patrol             | [Knowledge patterns](research/knowledge-patterns.md)                                                                            |
| Backlog.md and WBS storage requirements                             | [Backlog patterns](research/backlog-patterns.md)                                                                                |
| Claire and the first source inspection                              | [Initial inspection](research/initial-inspection.md), retained as dated evidence                                                |
| OpenSpec version and schema behavior                                | [SDD source findings](sdd-sources.md)                                                                                           |
| Earlier local helper observations                                   | [Compatibility findings](research/local-workflow-observations.md) preserved from the compacted, previously uncommitted proposal |
| What happened in the trial                                          | [Pilot verification](../../openspec/changes/twilight-sdlc-pilot/verify.md)                                                      |

Design implications belong to the
[control-plane design](../../openspec/changes/twilight-control-plane/design.md)
and [client planning](client-repositories.md). Work order belongs to the single
[delivery plan](../../openspec/changes/twilight-control-plane/tasks.md): one
authored `tasks.md` owns the plan until the tested WBS/Backlog bridge changes
that ownership, and no second plan or independently maintained stage graph exists.

Next execution starts with Task 1 of the delivery plan. The Backlog/WBS storage
migration has one prerequisite, and it is stated in one place:
[Cutover after the refactors land](client-repositories.md#cutover-after-the-refactors-land).
No migration is performed by this trial.

ADR 0014 no longer exists. The OpenSpec/wiki authority boundary it recorded is an
already-accepted direction rather than a surprising decision, and it now lives in
[requirements and the wiki](knowledge.md#requirements-and-the-wiki-the-boundary).
[ADR 0015](../adr/0015-planning-commits-are-the-transaction-boundary.md) proposes
the planning transaction boundary. [ADR 0016](../adr/0016-k3s-schedules-the-expandable-worker-pool.md)
records the accepted K3s worker-pool decision.
