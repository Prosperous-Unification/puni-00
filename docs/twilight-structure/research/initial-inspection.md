# Twilight Structure research

Initial inspection: 2026-09-06. These are source findings and design
implications, not accepted product decisions or a completed compatibility
evaluation. No live agents, browsers, cron jobs, or deployments were started.

## ACP and LangGraph

[ACP session setup](https://agentclientprotocol.com/protocol/v1/session-setup)
defines session creation with a working directory and MCP server configuration.
Loading and resuming sessions depend on advertised agent capabilities.
**Implication:** recovery must be specified per adapter; a common transport
does not establish identical capabilities across providers.

[The ACP agent directory](https://agentclientprotocol.com/get-started/agents)
lists Codex and Claude through adapters, and Gemini CLI separately. `agy` is
not verified by that evidence. The local Antigravity guide identifies AGY as
Antigravity, but an ACP adapter and its behavior have not been established.
Do not substitute Gemini CLI for the requested `agy` integration.

[LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
separates thread checkpoints from cross-thread stores; in-memory persistence
does not survive process restarts.
[Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
provide a pause/resume primitive for human input.
**Proposed architecture:** LangGraph owns the delivery workflow while an ACP
client layer manages coding-agent sessions. Application records link workflow
state to agent-session state and artifacts. Recovery must reconcile external
effects before repeating a node that may already have launched work. This is
a recommendation to evaluate, not an accepted architecture or a tested Bun
compatibility claim.

## OpenHands and comparable implementations

Local source inspected:
`/home/df/wd/openhands-setup/repo`, commit
`f26d734a848297d8dcf460b0bb739174e76511f0`.
Its configured origin is `OpenHands/OpenHands`, but the checked-out documentation
describes **Agent Canvas**. Treat this as an inspected checkout, not a claim
that every file matches today's upstream default branch.

The checkout's `docs/architecture.md` separates the frontend from Agent Server,
workspace execution, and an optional Automation Server. `docs/ACP_AGENTS.md`
describes provider adapters whose external agents retain their own execution
loops. `tests/e2e/live-acp/README.md` records earlier live provider checks;
those checks were not rerun during this investigation.

Upstream references:

- [OpenHands Software Agent SDK](https://github.com/OpenHands/software-agent-sdk)
  for the reusable agent/server foundation.
- [OpenHands automation integration](https://github.com/OpenHands/extensions/blob/main/skills/openhands-automation/SKILL.md)
  for cron and webhook-triggered automation, with scheduling separated from
  the execution environment.
- [OpenCode ACP support](https://opencode.ai/docs/acp/) for a comparable ACP
  implementation exposing its tools, MCP configuration, rules, and permissions.

**Implication:** compare reuse at each boundary instead of treating a complete
frontend as the factory engine. A Bun/TypeScript ACP client and an OpenHands
Agent Server bridge remain alternatives; adopting the latter would add a
separate runtime dependency. Neither has been selected.

The next comparison should enumerate MCP management, session lifecycle,
credential references, workspaces, cron/event admission, streaming events,
permissions, usage reporting, recovery, and user-facing inspection. The brief's
“basic stuff” is not yet a finite feature set or a parity commitment.

## Lessons from Claire

Local source inspected: `/home/df/wd/personal/claire`, commit
`552c222bb601aa8db40a5d57b28f0c741ae22f48`.
These are repository findings, not a verification of deployed infrastructure.
Host details, credentials, and raw operational transcripts are not copied here.

| Source                                                                   | Finding                                                                                                                     | Candidate requirement to discuss                                                                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `docs/superpowers/specs/2026-08-23-backlog-native-sdlc-design.md`        | Separate human-readable task information from machine execution metadata; repeated per-chunk writes created failure points. | One canonical state for each fact, with generated views and bounded recording overhead.                                  |
| Same design, execution records                                           | Link each worker run to a real runtime identity and measured timestamps.                                                    | Join requests, tasks, sessions, reviews, commits, tests, and deployments through durable identifiers.                    |
| `queue/WORKER.md`, claim/recovery procedure                              | A scheduled job, a claim, and a live worker are different states; takeover needs evidence.                                  | Durable ownership, recovery rules, and visible stalled work; cron alone is not a task scheduler.                         |
| `queue/WORKER.md`, review gates; `bin/review-artifact.mjs`               | Complete review artifacts are verified, and incomplete or truncated output cannot stand in for a verdict.                   | Reviews identify the exact artifact revision, reviewer, findings, and dispositions.                                      |
| `queue/WORKER.md`, delivery and QA procedure                             | Development delivery, production review, and browser QA have distinct completion conditions.                                | Specify each gate's evidence and whether unavailable QA blocks progression; do not silently inherit Claire's exceptions. |
| `LLM_README.md`, assumption closures                                     | Some tasks explicitly close on an assumption with an unverified surface and a reopen condition.                             | Distinguish assumed, verified, blocked, and complete outcomes in both UI and metrics.                                    |
| `docs/superpowers/specs/2026-08-23-agentic-sdlc-observability-design.md` | Delivery bottlenecks, model reliability, and task economics are separate diagnostic dimensions.                             | Measure waiting and execution time, retries, failures, token usage, cost, and delivery outcome together.                 |

Claire's observability design deliberately excludes prompt and tool content
from exported telemetry. Whether Twilight Structure should retain such content,
where it lives, and who can inspect it are open decisions. Radical observability
does not yet specify a content-retention policy.

Candidate improvement measurements include review rounds, rework, escaped
defects, browser acceptance, and cost per accepted outcome. Self-improvement
needs a definition of success and a rule for promoting changes; neither the
measurement set nor automatic promotion is approved yet.

## Specifications and accumulated knowledge

The repository already has OpenSpec artifacts. Claire's
`skills/brainstorming/SKILL.md` separates discovery/design from work planning;
`skills/wayfinder/SKILL.md` models unresolved decisions as a map and dependent
decision tickets. These are useful inputs without committing to their exact
storage or workflow conventions.

[Karpathy's LLM Wiki note](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
describes preserved source material, an agent-maintained linked Markdown wiki,
and conventions governing maintenance, with an index and chronological log.
**Possible application:** accumulated research and lessons link back to sources
and accepted specifications. A wiki update should not silently redefine an
accepted contract. This is a candidate interpretation of `llm-wiki`; the exact
reference intended by Dany remains unconfirmed.

The exact `betterpowers` project was not identified in the scoped local search
or web search. Keep the name from the brief and request its reference during
the knowledge/specification branch of the interview. Do not silently replace
it with Superpowers.

## Verification limits

This pass inspected selected documents, manifests, and source files and checked
primary upstream documentation. It did not run integration tests, establish
provider authentication, validate token telemetry, prove concurrent session
isolation, benchmark planning, or test a cloud browser or deployment. Those
proofs belong to later scoped investigations after the requirements settle.
