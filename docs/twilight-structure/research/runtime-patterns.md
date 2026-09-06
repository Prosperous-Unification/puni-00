# Runtime patterns for Twilight Structure

Research date: 2026-09-06. Scope: primary-source comparison of LangGraph/
LangChain, OpenHands, OpenClaw, MCP, and selected Temporal practices. Read with
the [requirements](../spec.md) and [earlier research](../research.md).

**Recommendation:** use LangGraph for the configurable delivery graph; make
Twilight Structure own durable work admission, authority, external-operation
recovery, and evidence. Borrow agent-runtime components behind adapters. None
of the inspected products establishes this factory's full contract by itself.

This is a research recommendation, not an accepted architecture. **Upstream**
below means documented behavior; **Proposed** means a design for this factory.
No runtime behavior was tested locally, no packages were installed, and no
agents, MCP servers, schedulers, browsers, or deployments were started.

## Evidence scope and versions

The linked official documentation was retrieved on the research date. Most
pages are unversioned; retrieval establishes what the page said, not which
released package implements it. Do not turn these links into unqualified
compatibility claims or copy changing defaults into product specifications.

| Surface              | Version evidence and limit                                                                                                                                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LangGraph JavaScript | The official fault-tolerance page explicitly requires `@langchain/langgraph >= 1.4.0` for node timeouts and cooperative drain. This is an upstream minimum, not a locally installed or tested version. [Fault tolerance](https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance)                           |
| LangChain JavaScript | Inspected current JavaScript middleware and MCP documentation; no package release was pinned or exercised. [Middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/built-in), [MCP](https://docs.langchain.com/oss/javascript/langchain/mcp)                                                        |
| OpenHands            | Inspected current SDK and CLI docs and the first-party automation extension on `main`. The earlier note's local Agent Canvas checkout is separate evidence; it does not establish the current SDK revision. [Automation source](https://github.com/OpenHands/extensions/blob/main/skills/openhands-automation/SKILL.md) |
| OpenClaw             | Inspected current official runtime, security, scheduling, and observability docs. No release or local Gateway configuration was verified. [Queue](https://docs.openclaw.ai/concepts/queue)                                                                                                                              |
| MCP                  | Authorization claims below use the explicitly versioned **2025-11-25** specification. This does not establish that every adapter negotiates that revision. [Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)                                                                |
| Temporal             | Inspected current Activity and Schedule documentation as design references. No Temporal SDK/server version was selected. [Activities](https://docs.temporal.io/activity-definition), [Schedules](https://docs.temporal.io/schedule)                                                                                     |

## Persistence, recovery, and external effects

**Upstream:** LangGraph separates thread checkpoints from cross-thread stores.
`MemorySaver` loses checkpoints at restart. Its checkpointer guide distinguishes
`sync` persistence before the next step, `async` persistence overlapping the
next step, and `exit` persistence when the graph exits. SQLite is documented
for local workflows; Postgres is one production option. [Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence),
[Checkpointers](https://docs.langchain.com/oss/javascript/langgraph/checkpointers)

**Upstream:** resuming an interrupt starts its node again from the beginning;
code before the interrupt can run again. Interrupt ordering and JSON payloads
matter. Time travel is a separate operation: downstream nodes, API calls,
model calls, and approvals run again after the selected checkpoint.
[Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts),
[Time travel](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel)

**Upstream:** OpenHands can restore conversations by conversation ID and
persistence directory. It separates base state from individual event files and
documents persistence of configuration, execution status, metrics, and secrets.
That is conversation recovery; the page does not prove atomicity between a
saved event and an arbitrary external system's effect.
[Conversation persistence](https://docs.openhands.dev/sdk/guides/convo-persistence)

**Upstream:** Temporal makes the same external-effect limitation explicit:
an Activity can finish its effect and crash before reporting completion, so
retry can execute it again. Idempotency keys must be honored by the receiving
service. Completed Activities are reused during ordinary Workflow replay;
this differs from LangGraph's deliberate time-travel re-execution.
[Activity definition](https://docs.temporal.io/activity-definition)

**Proposed:** persist a workflow-definition revision, thread ID, work ID,
attempt ID, workspace identity, and external-operation ID. An operation ID
identifies one intended effect across transport retries; an attempt ID does
not become a new effect merely because the connection was lost. Record intent
before dispatch and reconcile the receipt before retrying. Use an idempotent
sink where available. If an agent launch, merge, or deploy cannot be identified
after an ambiguous response, record `outcome_unknown` and stop dependent work
until reconciliation resolves it. A local deduplication table alone cannot
guarantee one external effect across that crash window.

Use synchronous checkpointing initially, subject to the chosen driver's crash
tests. Keep policy decisions and dispatch receipts in durable application
records even when the graph also refers to them. Decide which fact each store
owns; do not maintain two independently writable stage-status fields.
Separate read-only historical inspection from effectful replay in the UI.
Replay creates a new, linked execution with current authorization and explicit
resource reservations. It must never silently repeat a production operation.

Persist the effective configuration revision for a run. Changing a workflow,
hook, tool schema, credential scope, or approval policy must not silently change
an in-flight run. Continue on its pinned definition or perform a recorded
migration with renewed decisions where required.

## Hooks, approval, and agent judgments

**Upstream:** OpenHands supports command, prompt, and agent hooks. Prompt hooks
make one model call; agent hooks use a separate sub-conversation with bounded
iterations, optional tools, and no nested hooks. Their spend is attributed to
the parent. **Prompt and agent hooks explicitly allow execution on internal
failure or invalid decisions.** Prompt failures carry `success=False` alongside
the allow decision. These defaults are unsuitable for a mandatory factory gate.
[Hooks](https://docs.openhands.dev/sdk/guides/hooks)

**Upstream:** OpenClaw's file hooks catch and log handler errors, then continue.
They have no general timeout, durable queue, automatic retry, or exactly-once
contract. Typed plugin lifecycle hooks are a separate surface. A file hook
being discovered or enabled is not proof that a required check executed.
[Hooks](https://docs.openclaw.ai/automation/hooks)

**Upstream:** LangChain middleware supplies before-execution human approval,
editing, and rejection of tool calls. LangGraph supplies the persistent pause;
neither cited primitive defines Twilight's actor permissions, artifact freshness,
or production-release authority. [Middleware](https://docs.langchain.com/oss/javascript/langchain/middleware/built-in),
[Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)

**Proposed:** define a finite hook contract for each step: before admission,
after artifact production, before completion, on failure, and on cancellation.
Each configured hook records its implementation revision, required inputs,
execution identity, allowed tools, timeout, retry policy, budget, and whether it
is mandatory or advisory. Results distinguish `passed`, `findings`, `failed`,
`cancelled`, and `unavailable`. Only a valid mandatory pass admits progression;
malformed output, unavailable tools, and evaluator failure cannot become a pass.
Advisory failure remains visible and does not manufacture evidence.

Hook code and approval policy are executable authority. Agents may propose
changes to them but cannot edit the active policy protecting their own run.
Apply the same admission checks to FE commands, API calls, factory MCP tools,
cron triggers, and internal retries. Post-execution observers cannot authorize
an effect retroactively. A LangChain hook also cannot intercept an ACP agent's
internal tool calls unless that adapter exposes the relevant boundary.

An approval binds the authenticated actor, exact pending decision, artifact
revision, intended effect, target environment, and policy revision. Recheck
these at dispatch; changed artifacts, revoked authority, cancellation, and
expired decisions invalidate approval. Retry delivery of the same decision
idempotently. An edited tool request goes through validation and policy again.
The production step always requires the explicit human command in TS-12;
an agent judge cannot satisfy it.

**Upstream:** OpenHands' security API separates risk analysis from confirmation
policy and supports combining analyzers. Its CLI critic is explicitly
experimental and aimed at OpenHands LLM Provider users; iterative refinement
has score/issue thresholds and a bounded iteration count. These are useful
patterns, not evidence of universal code correctness or safety.
[Security](https://docs.openhands.dev/sdk/guides/security),
[Experimental critic](https://docs.openhands.dev/openhands/usage/cli/critic)

**Proposed:** distinguish reviewer, judge, and policy enforcer. A reviewer
reports findings against an immutable artifact; a judge decides disposition
under a versioned rubric; deterministic policy decides whether an operation is
allowed. Give reviewers read-only access to the candidate and separate output
storage. Record role, model, prompt/rubric revision, evidence, confidence where
meaningful, and findings disposition. Different session IDs alone do not prove
independence. Cap review rounds and total reviewer cost; unresolved disagreement
ends in a visible decision request. Judges supplement executable tests and
human acceptance rather than redefining their outcomes.

## MCP, credentials, and workspace boundaries

**Upstream:** LangChain's MCP adapter supports multiple servers and documents
stateless sessions by default: a fresh client session per tool invocation.
OpenHands provides MCP tool filtering and OAuth integration; its initial OAuth
browser interaction is a headless-automation constraint, and its documented
token cache is local to FastMCP. [LangChain MCP](https://docs.langchain.com/oss/javascript/langchain/mcp),
[OpenHands MCP](https://docs.openhands.dev/sdk/guides/mcp)

**Upstream:** MCP's HTTP authorization specification requires tokens intended
for the receiving MCP server and forbids token passthrough. Downstream services
need their own credentials. The specification treats stdio separately, using
environment-provided credentials. Tool discovery therefore does not establish
either tool authorization or a safe credential boundary.
[MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

**Upstream:** OpenHands' Secret Registry injects referenced secrets into commands
and masks outputs. OpenClaw documents SecretRefs, atomic credential snapshots,
and injection near outbound requests; it also models selected unavailable or
stale credential owners explicitly. Neither pattern proves that secrets can
never leak through arbitrary subprocesses, files, or provider transcripts.
[Secret Registry](https://docs.openhands.dev/sdk/guides/secrets),
[OpenClaw secrets](https://docs.openclaw.ai/gateway/secrets)

**Upstream:** OpenHands distinguishes local subprocess workspaces from remote
agent-server/container execution. OpenClaw explicitly treats a Gateway as one
trust boundary; session IDs and approval prompts are not adversarial tenant
isolation. Its exec approvals bind execution context and can detect certain
changed script operands, but that file binding is explicitly best-effort.
[OpenHands workspaces](https://docs.openhands.dev/sdk/arch/workspace),
[OpenClaw security](https://docs.openclaw.ai/gateway/security),
[Exec approvals](https://docs.openclaw.ai/tools/exec-approvals)

**Proposed:** maintain MCP registrations with transport, version/capabilities,
health, owner, tool-schema revision, allowlist, and credential references.
Onboard OAuth interactively before unattended use; expired or revoked access
becomes `reauthentication_required`. Do not launch an unpinned executable
because a repository supplied an MCP configuration. Identify tools by server
and name, validate requests/results at the boundary, and distinguish transport
failure from a modeled tool refusal. Stateful integrations need explicit
session affinity and reconnect tests.

Keep the factory's inbound MCP API separate from outbound MCP connections.
Inbound calls use the same domain commands and authority as the FE/API; a
general “resume workflow” tool must not confer approval authority on an agent.
Resolve scoped credentials at the authorized integration boundary, not into
graph state or reusable prompts. Check checkpoint backups and third-party
agent persistence too, because redacting displayed logs does not redact storage.

Allocate a separate worktree and execution identity to each writer, plus
isolated home/config/token caches and process/network permissions appropriate
to the job. A worktree isolates Git edits, not filesystem or credential access.
Review artifacts by commit/digest in a separate reviewer workspace. Prove that
agents cannot read a sibling's canary credential, reach a protected deployment
endpoint, or edit their own mandatory hook. If an ACP provider cannot expose
internal tool authorization, enforce its outer container/network/credential
boundary and report the remaining visibility limit.

## Cron, budgets, and capacity

**Upstream:** OpenHands' automation extension separates scheduling/dispatch
from the Agent Server that executes a packaged script and conversations.
Completion callbacks and run state are distinct parts of that integration.
[Automation source](https://github.com/OpenHands/extensions/blob/main/skills/openhands-automation/SKILL.md)

**Upstream:** OpenClaw automations document persisted recovery, recurring
catch-up versus skipping, time limits, and retry behavior. **Command payloads
execute as operator-admin Gateway jobs outside agent exec approval policy.**
Its session/global queue limits control concurrency, but that queue is
in-process and is not automatically replayed after restart.
[Automations](https://docs.openclaw.ai/automation/cron-jobs),
[Command queue](https://docs.openclaw.ai/concepts/queue)

**Upstream:** Temporal distinguishes overlap policy, catch-up window, backfill,
and pause-on-failure. Its options show why a cron expression alone is not a
complete schedule contract. [Schedules](https://docs.temporal.io/schedule)

**Proposed:** persist each schedule revision and due occurrence separately
from each admitted run. Give occurrences a stable deduplication key, declared
timezone, overlap policy, maximum lateness, and bounded catch-up/backfill.
Initially use explicit `skip` or one buffered occurrence for recurring
maintenance; record every skipped occurrence and reason. Job admission checks
authority and capacity exactly as a manual launch does. Cancellation of an
execution and pausing future schedule occurrences are separate controls.
Use deterministic code for polling, housekeeping, and fixed transformations;
schedule reasoning only when a step needs reasoning.

**Upstream:** LangChain can cap model/tool calls per run and thread. OpenHands
accounts for separate model usage IDs, including auxiliary work. OpenClaw
documents that child agents have separate contexts and token costs. These
features are useful accounting inputs; call counts alone are not a monetary
budget. [Call limits](https://docs.langchain.com/oss/javascript/langchain/middleware/built-in),
[OpenHands metrics](https://docs.openhands.dev/sdk/guides/metrics),
[OpenClaw sub-agents](https://docs.openclaw.ai/tools/subagents)

**Proposed:** admit work against all relevant capacities: agent slots, provider
request/token quotas, writer workspace ownership, build slots, cloud-browser
slots, and environment deployment locks. Record the limiting resource in the
queue UI. Use transactional claims, expiring leases, and fencing so an old
worker cannot commit after takeover. A heartbeat alone does not establish that
its external process has stopped.

Reserve budget before dispatch and reconcile measured use afterwards, with a
declared allowance for in-flight spend. Charge authors, reviewers, judges,
retries, context compaction, browser/build compute, and integration calls to
the same work request. Preserve missing usage as unknown, not zero. If a
provider supplies neither bounded admission nor timely usage, label its budget
enforcement approximate and require a bounded alternative to promise a hard
cap. Separate predicted usage, reserved capacity, measured tokens, estimated
cost, and invoiced cost. Human waiting time is not agent execution time.

Paused workflows release agent slots; retain only explicitly required storage
or session resources and make their cost visible. Orchestrators awaiting
children must not hold every slot their children need. Reviewer capacity must
remain available when writers occupy the worker pool. Compare serial and
parallel executions on accepted outcomes, elapsed time, total cost, and
integration/review rework before increasing concurrency defaults.

**Upstream:** LangGraph's documented drain is cooperative between supersteps,
not cancellation of in-flight work. Node timeouts and retries concern graph
attempts. **Proposed:** give ACP/process supervisors separate cancellation,
graceful shutdown, forced termination, and orphan-reconciliation procedures.
Do not free a writer lease or redeploy its workspace merely because a graph
attempt timed out. [Fault tolerance](https://docs.langchain.com/oss/javascript/langgraph/fault-tolerance)

## Observability and configuration

**Upstream:** OpenHands emits OpenTelemetry traces for its agent, model, tool,
and conversation activity. OpenClaw defaults to metadata-only exported traces
and documents visibility limits for external harness content. LangSmith costs
depend on usage, model/provider identification, and pricing; later pricing-map
changes do not backfill existing trace costs. [OpenHands tracing](https://docs.openhands.dev/sdk/guides/observability),
[OpenClaw telemetry](https://docs.openclaw.ai/gateway/opentelemetry),
[LangSmith costs](https://docs.langchain.com/langsmith/cost-tracking)

**Proposed:** the factory's durable event history is the authority for state,
decisions, evidence, and usage settlement. Streams and OTLP are projections.
Correlate request, workflow revision, step, attempt, session, external operation,
artifact, approval, review, test, and deployment IDs. Store causation and parent
IDs so a critic's cost and an integration retry remain attributable. Reconnect
the FE by event cursor with deduplication; streaming disconnect is not agent
cancellation. Report missing adapter spans as unsupported coverage.

Expose effective configuration and its origin: workflow definition, step
override, agent profile, runtime capability, policy, and resource quota.
Validate configuration before activation, show its diff, pin each run, and
emit a configuration-change event. Begin with typed forms and versioned
configuration artifacts; defer an arbitrary graph/code editor. Configurability
does not make mandatory authorization, schema validation, or evidence integrity
optional. A required unavailable integration blocks activation or the affected
step with a visible reason.

Keep operational events, retained artifact content, and exported telemetry
under separate capture/retention/access policies. Record redaction and omitted
content so absent payloads are explainable. Dashboard measures should include
queue and approval wait, active execution, stalled/orphaned work, review rounds,
rework, tests against artifact revision, dev acceptance, production-command
identity, and cost per accepted result. A self-improvement proposal is a new
versioned change evaluated against a held-out set and the existing gates; an
agent's favorable score cannot silently promote its own policy changes.

## Finite borrow/build/defer inventory

The following is a proposed first implementation boundary, not a parity promise.
“Borrow” means use the cited primitive or pattern after compatibility tests;
it does not imply deploying the whole upstream product.

| Capability         | Borrow                                                     | Build in Twilight Structure                                                          | Defer                                                      |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Workflow execution | LangGraph state, checkpoints, branches, interrupts         | Versioned step contracts, lifecycle, rework, pinned configuration                    | Arbitrary user-authored executable graphs                  |
| Durable effects    | Temporal's idempotent activity pattern                     | Intent/receipt reconciliation, outbox, leases, fencing                               | Temporal deployment until operational need is demonstrated |
| Human decisions    | LangGraph pause/resume                                     | Actor authority, fresh artifact binding, decision audit, production command          | Agent-issued production approval                           |
| Hooks              | OpenHands bounded command/prompt/agent shapes              | Required/advisory outcomes, trusted registry, durable execution                      | User-installed unrestricted hook marketplace               |
| Review             | OpenHands critic/refinement pattern                        | Artifact-bound findings, judge rubrics, bounded rounds, evidence checks              | General self-promoting multi-agent councils                |
| Coding sessions    | ACP adapters and advertised capabilities                   | Session ownership, recovery, cancellation, adapter conformance                       | Assuming identical provider recovery or usage              |
| Workspaces         | OpenHands local/remote execution interface                 | Worktree/container lifecycle, isolated identity, writer/reviewer ownership           | Shared writable agent homes                                |
| Outbound MCP       | Protocol SDK/adapters                                      | Registry, scoped credentials, health, schema pinning, audit                          | Unreviewed dynamic installation                            |
| Inbound MCP        | MCP server primitives                                      | Same authorized domain commands as FE/API                                            | Generic unrestricted internal admin tools                  |
| Automation         | OpenHands dispatch separation; Temporal schedule semantics | Durable occurrences, deduplication, bounded catch-up, visible skips                  | Broad messaging-channel parity with OpenClaw               |
| Capacity           | OpenClaw session/global lanes; LangChain call limits       | Durable admission, multiple resource limits, fair review capacity, budget settlement | Automatic concurrency optimization before measurements     |
| Observability      | OTLP and LangSmith-compatible spans/usage                  | Durable event/evidence ledger, FE inspection, redaction, coverage reporting          | Indefinite full-content retention                          |
| Configuration      | Typed versioned manifests and validated profiles           | Effective-config UI, diffs, activation checks, run pinning                           | Drag-and-drop low-code workflow marketplace                |

## Failure experiments required before adoption

These are **planned proofs, none executed**. Implement them on the production
command/adapter path. Remove the relevant guard or inject the listed fault,
observe the assertion fail, then record the actual output in the change's
`verify.md` and adjacent `Proof:` comment. A declaration below is not proof.

| Contract              | Injected fault or race                                                                                    | Required observable failure                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Durable pause         | Kill the backend after an approval is recorded and before resume; also make checkpoint storage unreadable | Decision survives; recovery resumes the correct run once, or refuses with a storage error               |
| One intended effect   | Apply an external operation, drop its response, then restart before its receipt is saved                  | Receiver records one effect; unknown receipt triggers reconciliation rather than an unqualified repeat  |
| Replay safety         | Replay from before a completed deploy step using an old approval                                          | No deploy without a fresh authorized command for the exact target/artifact                              |
| Mandatory hook        | Throw, hang, or return malformed JSON from an otherwise allowing evaluator                                | Real operation remains unexecuted and the gate reports failure/unavailability                           |
| Approval freshness    | Change artifact/policy or cancel after approval while dispatch is held                                    | Dispatch refuses; a late or duplicate response cannot revive it                                         |
| Uniform authority     | Invoke the same forbidden command via FE, API, MCP, cron, retry, and adapter callback                     | Every reachable mutation path refuses and emits a correlated decision                                   |
| Reviewer independence | Give a reviewer write access to the candidate or reuse findings from a prior commit                       | Candidate mutation is refused; stale review cannot satisfy completion                                   |
| Credential isolation  | Plant canary secrets in sibling homes, checkpoints, subprocess environment, and tool output               | Unauthorized access is refused; permitted output/storage/export obey declared redaction policy          |
| MCP lifecycle         | Kill server mid-call; revoke OAuth; change tool schema; reconnect a stateful server                       | No silent fallback identity/schema, no unbounded retry, visible reauthentication or reconciliation      |
| Durable scheduling    | Restart across due times; repeat webhook delivery; exercise DST and overlap                               | Exactly the specified admitted/skipped occurrences, with no hidden backlog or duplicate intended run    |
| Capacity and fencing  | Race two claimants; delay an old worker past lease takeover                                               | Pool bounds hold; stale worker cannot mutate accepted state; reviewer can still start                   |
| Budget accounting     | Run writers/reviewers concurrently; delay usage; omit it entirely                                         | Reservations prevent unsupported launches; unknown usage remains visible; totals include auxiliary work |
| Cancellation          | Ignore cooperative cancellation in a child process; send its completion after takeover                    | Process cleanup is bounded, late output cannot commit, orphan status remains visible until resolved     |
| Observable evidence   | Drop/reorder stream events, disconnect FE, stop OTLP collector, serve another checkout to browser QA      | Durable history reconciles; telemetry loss is visible; wrong artifact cannot satisfy acceptance         |
| Configuration pinning | Edit active workflow/hook/MCP registration during a paused run                                            | Run keeps its revision or requests an explicit migration; no silent behavior change                     |

The first compatibility experiment should be deliberately small: one persisted
LangGraph branch, one ACP worker, one mandatory failing hook, one human decision,
one MCP operation with an idempotent test sink, and one restart at the ambiguous
effect boundary. Run it using the selected Bun and driver versions before
choosing the production persistence/runtime topology. Follow with bounded
multi-worker, reviewer, schedule, and cloud-browser experiments. Repository
unit/browser gates, live provider compatibility, cost accuracy, sandbox escape
resistance, and crash recovery all remain unverified in this research pass.
