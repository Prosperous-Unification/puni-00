# Twilight Structure

Status: user-requirement catalog, updated 2026-09-06. Implementation proposals and
the executed documentation trial are indexed in [README](README.md). This catalog
records user direction; the proposed OpenSpec deltas have not been synchronized.

## Intent

Twilight Structure (`twilight-structure`) is the software factory service for
building the other software in `puni-00`. It has a frontend and backend using a
stack similar to WBS, with LangChain/LangGraph for agent orchestration and ACP
as the primary interface to coding-agent sessions.

The desired outcome is a traceable software delivery loop: shape a request,
specify it, plan resources and dependencies, implement and review it, prove it
in development, and release to production on an explicit human command.
The primary objective is minimum elapsed time to independently accepted,
integrated outcomes within an authorized spending envelope and fixed quality
requirements. Additional agents, tokens and infrastructure should buy measurable
delivery capacity; observability identifies where they no longer do.

The current scope is an autonomous SDLC/documentation trial and actionable
product plan, reviewed with Claude Fable 5.1. Questions are answered as explicit
[assumptions](assumptions.md). Application implementation remains future work.
The accepted target is a versioned Nx monorepo setup used by both `puni-00` and
each client, with WBS planning backed by per-repo Backlog.md after WBS refactors.

## Requirements stated by the user

| ID    | Requirement                                                                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TS-01 | A separate frontend and backend in this monorepo, using a stack similar to WBS.                                                                                                                                                      |
| TS-02 | Use LangChain/LangGraph for agent orchestration.                                                                                                                                                                                     |
| TS-03 | Use ACP first for access to Codex, Claude, and `agy` sessions; allow several sessions to run in parallel with configurable concurrency.                                                                                              |
| TS-04 | Provide baseline service capabilities including MCP integrations and cron jobs; examine OpenHands and comparable implementations to enumerate the remainder.                                                                         |
| TS-05 | Start with a work request and a discovery stage informed by grilling, wayfinding, and brainstorming. Ask questions and record recommended answers as assumptions.                                                                    |
| TS-06 | Allow another agent to review discovery results, with iterations to resolve findings.                                                                                                                                                |
| TS-07 | After discovery Q&A, prepare specifications. OpenSpec owns behavioral requirements; the DDD-oriented wiki explains the domain and links to those contracts. The detailed artifact format remains in design.                          |
| TS-08 | Planning is a separate stage after specification. Consider using the WBS model to record tasks, dependencies, resource needs, and parallel execution decisions.                                                                      |
| TS-09 | Plan agent token usage and elapsed time, including cases where parallel work adds more cost than value. The WBS direction includes planning both agent and human time.                                                               |
| TS-10 | Execute with agents performing cross-review and producing thorough automated tests, test cases, and documentation.                                                                                                                   |
| TS-11 | Deploy to development and perform browser-use testing in a real cloud browser.                                                                                                                                                       |
| TS-12 | Manage deployments reliably. Production deployments require an explicit human command.                                                                                                                                               |
| TS-13 | Examine Claire for useful practices and requirements from its software-building loop.                                                                                                                                                |
| TS-14 | Make radical observability a primary capability, supporting improvement and self-improvement.                                                                                                                                        |
| TS-15 | Pilot the combined OpenSpec, Superpowers, grill-me/Wayfinder, and DDD-oriented LLM Wiki workflow in this repo, then reuse the proven setup for repositories built by the factory.                                                    |
| TS-16 | Define clear SDLC stages and use OpenSpec CLI features to make their progression inspectable and checkable.                                                                                                                          |
| TS-17 | Use one OpenSpec-defined workflow for stage dependencies and document contracts; other skills contribute through its stage instructions.                                                                                             |
| TS-18 | Integrate `i-have-adhd` into the workflow experience while keeping full detail available.                                                                                                                                            |
| TS-19 | Provide FE, BE, and MCP access to operate, configure, and inspect all supported workflow details.                                                                                                                                    |
| TS-20 | Make hooks, manual approvals at each stage/activity, capacity, critics, judges, and safety-agent roles configurable and observable.                                                                                                  |
| TS-21 | Research OpenClaw, LangGraph/LangChain practices, Ryan Dahl's LLM Wiki work and Claw Patrol; use verified findings in the design.                                                                                                    |
| TS-22 | Use this work request to test the first SDLC version and refactor representative current documentation toward the wiki pattern.                                                                                                      |
| TS-23 | Each client gets an Nx monorepo similar to `puni-00`, with client projects developed in that repository.                                                                                                                             |
| TS-24 | WBS is the planning UI; Backlog.md hosted per client repository will back it instead of SQLite, sequenced after `wbs-tool-v1` refactorings land.                                                                                     |
| TS-25 | `puni-00` must evolve through the same repo template and workflow that clients receive.                                                                                                                                              |
| TS-26 | Continue without clarification blockers, record assumptions, and review the resulting plan with Claude Fable 5.1.                                                                                                                    |
| TS-27 | Measure cost in money and time, with tokens as the money proxy. Make model choice (better or cheaper), removing validation, review or QA steps, and parallelism tunable levers, and track their effect on quality. Added 2026-09-06. |

| TS-28 | Make spending buy shorter accepted delivery time: pipeline independent deliverables, automate integration, scale constrained resources, and measure speedup at fixed quality. Human decisions authorize bounded execution choices rather than every scheduling adjustment. |

These requirements record the brief. They do not imply that every feature is
in the first release or that any integration has already been implemented.

For TS-27, “better” and “cheaper” are observed outcomes rather than a built-in
ordering of model names. Delivery profiles choose activities and execution
settings; a separate, pinned evaluation makes their money, time and quality
outcomes comparable without letting a profile weaken its own measure.

## User-level delivery sequence

1. **Work request:** capture the desired change.
2. **Discovery:** clarify the request through Q&A, record assumptions, and
   optionally obtain independent review and iterate.
3. **Specification:** describe intended behavior in OpenSpec and link the
   relevant domain knowledge; the detailed artifact format remains in design.
4. **Work planning:** decompose work, identify dependencies and resources, and
   decide which parallel work is worthwhile.
5. **Implementation and verification:** implement, cross-review, test, and
   document; revise as findings require.
6. **Development deployment and acceptance:** deploy and test through a real
   cloud browser.
7. **Production deployment:** execute on an explicit human command, with
   reliable deployment management.

Observability spans the entire sequence. This list describes the requested
experience, not a second workflow graph. The
[execution profile](../../openspec/schemas/twilight-v1/execution.yaml) alone owns
stage ordering; the [control-plane design](../../openspec/changes/twilight-control-plane/design.md)
specifies transitions, approvals, rework, cancellation, recovery and completion.

## Existing stack reference

The current repository uses TypeScript, Bun, and Nx; React, Vite, Tailwind, and
TanStack Router on the frontend; and Elysia, Drizzle, and SQLite on the backend.
See the root [package manifest](../../package.json),
[frontend targets](../../apps/fe-01/project.json), and
[backend targets](../../apps/be-01/project.json).

The current [design](../../openspec/changes/twilight-control-plane/design.md) and
[assumptions](assumptions.md) select proposed reuse boundaries, including shared
OIDC primitives and separate Twilight state. These choices require the planned
integration proofs; similar stack does not establish a shared product database.

## Specification coverage

The areas below organize the proposal and later capability deltas; they are not
a service decomposition or implementation order.

| Area                          | Decisions that need specifications                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Workflow and authority        | Stage transitions, human decisions, assumption handling, rework, cancellation, completion.                     |
| Agent sessions                | ACP versions and capabilities, provider adapters, concurrency, permissions, workspaces, session recovery.      |
| Knowledge and specifications  | Exact source projects, canonical artifacts, versioning, review, contradictions, and links to evidence.         |
| Resource planning             | WBS relationship, dependency ownership, agent/human units, budgets, availability, and coordination costs.      |
| Levers and quality            | Delivery profiles, activity enablement, model routing, budgets, accounting, evaluation and outcome comparison. |
| Execution and review          | Task ownership, independent reviewers, findings, test adequacy, retry limits, and integration.                 |
| Integrations and automation   | MCP lifecycle, cron semantics, events, credentials, and the OpenHands feature inventory.                       |
| Deployment and acceptance     | Cloud-browser evidence, artifact identity, environment state, recovery, and production commands.               |
| Observability and improvement | Event correlation, measurements, content capture, retention, evaluations, and authority to change the factory. |

## Related records

- [Interview and proposed assumptions](discovery.md)
- [Research index and workflow proposal](README.md)
- [SDLC stages and completion checks](sdlc-stages.md)
- [OpenSpec and LLM Wiki source findings](sdd-sources.md)
- [Factory vocabulary](CONTEXT.md)
