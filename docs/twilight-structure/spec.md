# Twilight Structure

Status: user-requirement catalog, updated 2026-09-08. Implementation proposals and
the executed documentation trial are indexed in [README](README.md). This catalog
records user direction; the proposed OpenSpec deltas have not been synchronized.

## Intent

Twilight Structure (`twilight-structure`) is the software factory service for
building the other software in `puni-00`. It has a frontend and backend using a
stack similar to WBS, with LangChain/LangGraph for agent orchestration and ACP
as the primary interface to coding-agent sessions.

The desired outcome is a traceable software delivery loop: shape a request,
specify it, plan resources and dependencies, implement and review it, exercise it
in development, prove it in staging before merging to main, and release to
production on an explicit human command.
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

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-01 | A separate frontend and backend in this monorepo, using a stack similar to WBS.                                                                                                                                                                                                                                                                                                                          |
| TS-02 | Use LangChain/LangGraph for agent orchestration.                                                                                                                                                                                                                                                                                                                                                         |
| TS-03 | Use ACP first for access to Codex, Claude, and `agy` sessions; allow several sessions to run in parallel with configurable concurrency.                                                                                                                                                                                                                                                                  |
| TS-04 | Provide baseline service capabilities including MCP integrations and cron jobs; examine OpenHands and comparable implementations to enumerate the remainder.                                                                                                                                                                                                                                             |
| TS-05 | Start with a work request and a discovery stage informed by grilling, wayfinding, and brainstorming. Ask questions and record recommended answers as assumptions.                                                                                                                                                                                                                                        |
| TS-06 | Allow another agent to review discovery results, with iterations to resolve findings.                                                                                                                                                                                                                                                                                                                    |
| TS-07 | After discovery Q&A, prepare specifications. OpenSpec owns behavioral requirements; the DDD-oriented wiki explains the domain and links to those contracts. The detailed artifact format remains in design.                                                                                                                                                                                              |
| TS-08 | Planning is a separate stage after specification. Consider using the WBS model to record tasks, dependencies, resource needs, and parallel execution decisions.                                                                                                                                                                                                                                          |
| TS-09 | Plan agent token usage and elapsed time, including cases where parallel work adds more cost than value. The WBS direction includes planning both agent and human time.                                                                                                                                                                                                                                   |
| TS-10 | Execute with agents performing cross-review and producing thorough automated tests, test cases, and documentation.                                                                                                                                                                                                                                                                                       |
| TS-11 | Deploy to development and perform browser-use testing in a real cloud browser.                                                                                                                                                                                                                                                                                                                           |
| TS-12 | Manage deployments reliably. Production deployments require an explicit human command.                                                                                                                                                                                                                                                                                                                   |
| TS-13 | Examine Claire for useful practices and requirements from its software-building loop.                                                                                                                                                                                                                                                                                                                    |
| TS-14 | Make radical observability a primary capability, supporting improvement and self-improvement.                                                                                                                                                                                                                                                                                                            |
| TS-15 | Pilot the combined OpenSpec, Superpowers, grill-me/Wayfinder, and DDD-oriented LLM Wiki workflow in this repo, then reuse the proven setup for repositories built by the factory.                                                                                                                                                                                                                        |
| TS-16 | Define clear SDLC stages and use OpenSpec CLI features to make their progression inspectable and checkable.                                                                                                                                                                                                                                                                                              |
| TS-17 | Use one OpenSpec-defined workflow for stage dependencies and document contracts; other skills contribute through its stage instructions.                                                                                                                                                                                                                                                                 |
| TS-18 | Integrate `i-have-adhd` into the workflow experience while keeping full detail available.                                                                                                                                                                                                                                                                                                                |
| TS-19 | Provide FE, BE, and MCP access to operate, configure, and inspect all supported workflow details.                                                                                                                                                                                                                                                                                                        |
| TS-20 | Make hooks, manual approvals at each stage/activity, capacity, critics, judges, and safety-agent roles configurable and observable.                                                                                                                                                                                                                                                                      |
| TS-21 | Research OpenClaw, LangGraph/LangChain practices, Ryan Dahl's LLM Wiki work and Claw Patrol; use verified findings in the design.                                                                                                                                                                                                                                                                        |
| TS-22 | Use this work request to test the first SDLC version and refactor representative current documentation toward the wiki pattern.                                                                                                                                                                                                                                                                          |
| TS-23 | Each client gets an Nx monorepo similar to `puni-00`, with client projects developed in that repository.                                                                                                                                                                                                                                                                                                 |
| TS-24 | WBS is the planning UI; Backlog.md hosted per client repository will back it instead of SQLite, sequenced after `wbs-tool-v1` refactorings land.                                                                                                                                                                                                                                                         |
| TS-25 | `puni-00` must evolve through the same repo template and workflow that clients receive.                                                                                                                                                                                                                                                                                                                  |
| TS-26 | Continue without clarification blockers, record assumptions, and review the resulting plan with Claude Fable 5.1.                                                                                                                                                                                                                                                                                        |
| TS-27 | Measure cost in money and time, with tokens as the money proxy. Make model choice (better or cheaper), removing validation, review or QA steps, and parallelism tunable levers, and track their effect on quality. Added 2026-09-06.                                                                                                                                                                     |
| TS-28 | Make spending buy shorter accepted delivery time: pipeline independent deliverables, automate integration, scale constrained resources, and measure speedup at fixed quality. Human decisions authorize bounded execution choices rather than every scheduling adjustment.                                                                                                                               |
| TS-29 | The first iteration is operated and primarily used by Dany. Future installations run on client-owned infrastructure maintained by Dany under an explicit agreement with revocable access and defined support and recovery terms.                                                                                                                                                                         |
| TS-30 | Use K3s for an expandable worker pool. Prove a real multi-host pool in M1; adding and draining existing VPS workers is in scope, while automatic cloud/VPS provisioning through the planned Terragrunt tool is later work.                                                                                                                                                                               |
| TS-31 | Organize the whole product, including the OpenClaw assistant, into a personal phase targeting Dany first, with delivery configurability and quality taking priority, followed by a customer phase targeting potential customers. The personal phase must cover the complete request → dev → prod loop; it can need further improvement, but no part of that loop may be absent. Added during Wayfinding. |
| TS-32 | Require exhaustive Given/When/Then scenarios in OpenSpec for the specified behavior, including relevant failure, boundary and recovery cases. Added 2026-09-08.                                                                                                                                                                                                                                          |
| TS-33 | Cover behavior with layered automated tests: most coverage belongs in stateless unit tests, followed by API tests using a real database, then Playwright tests. Complete acceptance with manual test scenarios executed interactively through a real cloud browser. Added 2026-09-08.                                                                                                                    |
| TS-34 | Commit work frequently and update the relevant dev environment as often as possible so Dany can observe running work. Merge checked increments to main after required staging acceptance, then keep dev-main tracking main. Run scheduled manual browser-test sweeps against dev. Added 2026-09-08.                                                                                                      |
| TS-35 | Provide inspectable reports of passing automated tests and passing manual browser tests, linked to the scenarios and identified source/environment they tested. Preserve failed, skipped and unavailable outcomes under the existing evidence policy. Added 2026-09-08.                                                                                                                                  |
| TS-36 | Support multiple development environments assigned to different long-running feature branches, plus dev-main that continuously tracks main. Devs may use development servers and be dynamic or short-lived. Added 2026-09-08.                                                                                                                                                                            |
| TS-37 | Provide staging as close to production in all practical regards as possible, for final testing before merging a change to main. Include it in the personal phase. Added 2026-09-08.                                                                                                                                                                                                                      |

These requirements record the brief. They do not imply that every feature is
in the first release or that any integration has already been implemented.

The personal and customer phases are product audience boundaries, distinct from
the existing M0–M4 implementation milestones. The
[personal delivery boundary](../../.scratch/twilight-structure/issues/01-personal-delivery-acceptance.md)
is resolved through production, under TS-12's explicit human command. The testing
obligations and gate placement below are agreed. Interaction design and the
placement of existing work are being resolved through the
[decision map](../../.scratch/twilight-structure/map.md). TS-31 does not itself
move tasks between milestones or retire earlier technology choices.

For TS-27, “better” and “cheaper” are observed outcomes rather than a built-in
ordering of model names. Delivery profiles choose activities and execution
settings; a separate, pinned evaluation makes their money, time and quality
outcomes comparable without letting a profile weaken its own measure.

TS-32–35 establish the personal phase's required testing and delivery practices.
They retain the earlier configurable delivery controls within applicable quality
obligations. TS-36–37 extend that phase with concurrent branch devs, dev-main and
staging. Frequent commits and branch-dev updates make ongoing work observable;
merging to main requires final staging acceptance, superseding the earlier
automated-only merge gate. Scheduled manual cloud-browser sweeps of dev continue.
Production requires passing automated and manual acceptance reports for the
identified release candidate, followed by TS-12's explicit human command.
An older revision's passing report does not accept a newer candidate.

The exact staging candidate and artifact-promotion flow are being clarified in
[branch devs and staging](../../.scratch/twilight-structure/issues/07-staging-and-branch-devs.md).
No staging concurrency, sweep interval or environment-lifetime default has been
selected. Devs may use development servers and be dynamic or short-lived while
supporting branches that themselves remain active for a long time.

## User-level delivery sequence

1. **Work request:** capture the desired change.
2. **Discovery:** clarify the request through Q&A, record assumptions, and
   optionally obtain independent review and iterate.
3. **Specification:** describe intended behavior in OpenSpec and link the
   relevant domain knowledge; the detailed artifact format remains in design.
4. **Work planning:** decompose work, identify dependencies and resources, and
   decide which parallel work is worthwhile.
5. **Implementation and verification:** implement, cross-review, test and
   document, committing and updating the relevant branch dev frequently.
6. **Staging acceptance:** perform final testing in a production-like environment
   before merging to main, including manual scenarios through a real cloud browser.
7. **Main publication:** merge accepted work; dev-main continuously tracks main.
8. **Production deployment:** execute on an explicit human command, with
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
