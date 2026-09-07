# OpenClaw assistant and Twilight execution boundaries

Researched 2026-09-07 for
[Establish OpenClaw's usable assistant and factory integration boundaries](../../../.scratch/twilight-structure/issues/02-openclaw-integration-evidence.md).
This is decision evidence, not an implementation or deployment report.

**Recommendation:** use OpenClaw's conversation and agent-runtime surfaces behind
an adapter, while Twilight retains its specified delivery authority and durable
execution. Upstream provides substantial interaction primitives, but searchable
tool evidence, recurring worker presentation, secretary responsiveness, and
worker-level milestones still need explicit contracts and integration proofs.

## Scope and evidence identity

The accepted audience direction is personal use by Dany first, prioritizing
delivery configurability and quality, then potential customers. Accepted assistant
choices are an available secretary, direct worker conversations with the secretary
informed, and recurring workers with freely changeable names. Individual worker
memory across assignments is [parked](../../assistant/ideas.md).
See [product direction](../spec.md) and [assistant vocabulary](../../assistant/CONTEXT.md).
This note does not assign features to either phase or reopen technology choices.

| Source                 | Inspected identity and limit                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Twilight               | Root checkout `51ca3df5233e7dce010c1e574f06f0ec6fdcad7c`, plus the current uncommitted assistant vocabulary, audience direction, and Wayfinder ticket. Existing runtime, worker-pool, knowledge and initial-inspection notes were read.                                                                                                                                                                                                                   |
| OpenClaw source        | Public `main` resolved to `0ad318398e906aa710af94d61231dfe65946c02d`. Five files were fetched at that exact commit: the manifest, transcript index/search, spawn tool and progress-card tool. [Manifest](https://github.com/openclaw/openclaw/blob/0ad318398e906aa710af94d61231dfe65946c02d/package.json) declares `2026.9.2` and Node 24.16+ below 25, or Node 26.1+; this is source identity, not a verified release installation or Bun compatibility. |
| OpenClaw documentation | Official pages linked below retrieved 2026-09-07. They are unversioned and may describe different revisions; their presence is not evidence of a deployed capability.                                                                                                                                                                                                                                                                                     |
| Claire                 | Read-only checkout `3fe77be9accc489216d0233f2e4045a32ba443dc`, clean when inspected. Selected configuration, plugin files, operational notes and worker instructions were read; no host or live session was inspected. The initial Twilight note inspected older Claire commit `552c222bb601aa8db40a5d57b28f0c741ae22f48`.                                                                                                                                |

## What upstream supplies, and what remains

### Availability and direct conversation

**Upstream:** each session's turns serialize even across runtimes; global lanes
bound concurrent sessions. Steering can inject a message at a supported runtime
boundary, but does not interrupt an already-running tool. If steering is
unavailable, the message waits. Queued Control UI inputs can persist while the
in-memory queue itself does not replay after restart; interrupted queued inputs
require explicit resend. [Command queue](https://docs.openclaw.ai/concepts/queue)

**Upstream:** `sessions_spawn` returns after startup acceptance, without waiting
for the work to finish; provisioning can delay that acceptance. Completion can
notify the parent, with bounded retries and visible delivery failure. Ordinary
subagent transcripts are view-only in the Control UI. Persistent children created
with `visible: true` support typing and steering and retain parent navigation and
completion announcements. [Sub-agents](https://docs.openclaw.ai/tools/subagents)

**Source:** the spawn schema restricts `visible: true` to the `subagent` runtime,
keeps its session, and rejects various thread/session-mode options. Therefore
visible children and ACP sessions are not interchangeable combinations of flags.
[Spawn source](https://github.com/openclaw/openclaw/blob/0ad318398e906aa710af94d61231dfe65946c02d/src/agents/tools/sessions-spawn-tool.ts)

**Decision input:** make delegation a short secretary turn, then release it.
Reserve interactive execution and provider capacity; moving work to another
session alone cannot guarantee a response deadline. Prefer persistent children
for directly joinable assistant assignments. Delivery-worker chat still needs a
route through Twilight's admitted attempt. Define which direct-worker events
inform the secretary: parent completion alone does not establish that every
correction, question or scope change was received. None of these latency or
notification guarantees has been tested.

### Recurring, renameable identities

**Upstream:** configured agents have an `agentId`, workspace and session state.
Identity settings include name, theme, emoji and avatar; `agents set-identity`
changes those display settings for a selected agent. [Agent CLI](https://docs.openclaw.ai/cli/agents),
[multi-agent routing](https://docs.openclaw.ai/concepts/multi-agent)

**Upstream:** session metadata independently supports labels, sidebar icons,
groups and responsibility assignment. `sessions_history` can include tool
results, but redacts and bounds content; imported external histories may be
terminal, byte-bounded snapshots rather than complete paginated histories.
[Session tools](https://docs.openclaw.ai/concepts/session-tool)

**Decision input:** keep the existing domain distinction between worker,
assignment and session. A renamed label is not a new identity, and a recurring
identity does not imply reusing its previous assignment context. Choose whether
the worker maps to a configured OpenClaw agent or to a presentation record over
assignment sessions. The former brings workspace, authentication and memory
configuration with it; the latter needs an explicit mapping. Neither requires
fixed occupational personas. Disable or omit automatic per-worker learning and
cross-assignment recall paths from this effort; searchable historical evidence
remains available on request.

### Searchable history and retention

**Upstream:** `sessions_search` indexes user and assistant text transactionally
beside SQLite transcripts. Tool results, reasoning blocks and images are
excluded, and only the active transcript branch is searchable. Hits can reopen
retained pre-reset context by message/session identity. Reconciliation can mark
results incomplete while indexing. Search obeys session visibility and excludes
incognito sessions. [Session search](https://docs.openclaw.ai/concepts/session-search)

**Source:** active-path projection and FTS maintenance live together in the
[transcript index](https://github.com/openclaw/openclaw/blob/0ad318398e906aa710af94d61231dfe65946c02d/src/config/sessions/session-transcript-index.ts).
This corroborates the active-branch limit, not completeness of external harness
content.

**Upstream:** current session documentation places live rows/transcripts in each
agent's SQLite database and describes import from legacy JSONL. Maintenance can
prune entries and archive dashboard sessions; default enforcement includes a
30-day pruning age and a 5,000-entry cap. Archive, reset, deletion and incognito
have different lifetimes. [Session management](https://docs.openclaw.ai/concepts/session)

**Decision input:** a full-history requirement needs a retained evidence corpus
and search index for permitted tool content, failed/cancelled attempts and any
required inactive branches. Record capture coverage and omission reasons; an
empty search is not evidence that nothing happened. Keep source message IDs so
answers can cite exact moments. Choose retention explicitly against provisional
A16/A17 in [assumptions](../assumptions.md); do not inherit runtime cleanup as the
product's retention contract. Hidden reasoning is outside the capture promise.

### Visible work and meaningful events

**Upstream:** `progress_card` stores a durable current note/checklist and survives
client reconnects. Each write replaces the card. Spawned children, including
visible and resumed children, do not receive the tool: the parent owns progress.
It is a latest-state surface, not a milestone history.
[Progress card](https://docs.openclaw.ai/tools/progress-card),
[tool source](https://github.com/openclaw/openclaw/blob/0ad318398e906aa710af94d61231dfe65946c02d/src/agents/tools/progress-card-tool.ts)

**Upstream:** typed hooks expose model/tool outcomes, session boundaries and
subagent start/end progress. Observation callbacks are not a durable queue;
runtime coverage differs. Some gate hooks fail closed on error or timeout,
while observers and other modifiers can log and continue. A hook timeout does
not cancel the handler's continuing effects.
[Plugin hooks](https://docs.openclaw.ai/plugins/hooks)

**Upstream:** OTLP content capture is off by default. Opt-in capture is bounded
and redacted; external Codex/Claude tool spans still omit tool arguments/results.
Exports omit system prompts and provider-internal thinking.
[OpenTelemetry](https://docs.openclaw.ai/gateway/opentelemetry)

**Decision input:** show runtime state separately from agent-reported milestones.
For example, “running” comes from observed execution, “found two options” from a
worker report, and “accepted” from Twilight's acceptance record. Each should
identify its source, timestamp and evidence. Worker avatars can then carry work,
latest event, blocking question and freshness without pretending a narrative is
machine-verified. A custom worker event/projection surface remains necessary
unless a prototype establishes a sufficient upstream alternative. Keep telemetry
as a projection; it cannot be the only record of mandatory delivery evidence.

### Configurability, quality and execution authority

**Upstream:** provider, model and runtime are separate choices. Native Codex
app-server, Claude CLI and ACP routes have distinct execution boundaries.
Per-agent and per-provider tool policies narrow the effective tool surface.
[Agent runtimes](https://docs.openclaw.ai/concepts/agent-runtimes),
[sandbox and tool policies](https://docs.openclaw.ai/tools/multi-agent-sandbox-tools)

**Upstream:** ACP controls include session binding, steering, cancellation and
model changes where the harness advertises support. OpenClaw's ACP sessions run
on the host, outside its sandbox; sandboxed requesters cannot spawn them, and
ACP rejects `sandbox: "require"`. [ACP agents](https://docs.openclaw.ai/tools/acp-agents)

**Decision input:** use these as runtime controls, not substitutes for the
versioned delivery profile, fixed quality floor, independent candidate acceptance,
review rounds and authorized execution envelope already specified in
[policy, hooks, review and capacity](../../../openspec/changes/twilight-control-plane/design.md#policy-hooks-review-and-capacity).
A valid model selection is insufficient if its harness cannot enforce the
required tool boundary. Expose supported capabilities and refuse unsupported
mandatory controls before dispatch.

## Claire lessons worth carrying forward

Paths in this table are read-only source references under
`/home/df/wd/personal/claire` at the revision above; their operational statements
were not rerun.

| Source                                                                   | Observation and implication                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plugins/sdlc-telemetry/index.mjs`, `telemetry.mjs`                      | `sdlc_context` binds a host-supplied run ID to task/session/phase fields; hooks emit usage, tool and run outcomes. Missing pricing remains `unpriced`. Keep the correlation and unknown-cost discipline. Its bounded occupational `role` enum is telemetry vocabulary, not the assistant's recurring-character model.          |
| `docs/superpowers/specs/2026-08-23-agentic-sdlc-observability-design.md` | Priorities are flow bottlenecks, model reliability and task economics. Conversation and tool content are intentionally excluded from exported telemetry. This explains why its dashboard cannot answer full-history search by itself. Its recorded OpenClaw/plugin versions are dated August observations.                     |
| `setup/config/openclaw.json5`, `notes/openclaw.md`                       | Model entries select different harness routes. The September 3 note records restricted-policy spawns refused before model execution; its proposed embedded-runtime remedy is explicitly untested. Current upstream claims cannot retroactively close that incident or establish today's deployed status.                       |
| `queue/WORKER.md`                                                        | Claims, running sessions, heartbeats and checkpoints are separate observations. A refused telemetry bind blocks, but an absent telemetry tool is explicitly reported and execution continues. Its recurring automation recovery and selected best-effort review rules are Claire policies, not Twilight guarantees to inherit. |

## Integration boundary to decide against

The existing design assigns LangGraph the compiled delivery workflow and gives
Twilight the durable store, approval/effect authority, fencing, evidence and usage
settlement. K3s is already selected for isolated execution attempts in
[ADR 0016](../../adr/0016-k3s-schedules-the-expandable-worker-pool.md).
The [worker provisioning port](../../../openspec/changes/twilight-control-plane/design.md#invariant-ownership)
must remain the path into that pool. An OpenClaw background task is not
automatically an admitted Twilight attempt, and stopping a chat run does not
prove that its remote effects or workspace writers have stopped.

**Proposed seam:** the assistant submits and inspects delivery requests through
Twilight's authorized BE/MCP operations. Twilight returns durable identifiers,
questions, progress and evidence links. A joined delivery-worker conversation
routes corrections to the current fenced attempt; it cannot authorize wider
scope through conversational wording. General assistant work can remain outside
the software-delivery graph. The existing shared FE/BE/MCP command boundary is
described in [commands and shared contracts](../../../openspec/changes/twilight-control-plane/design.md#commands-and-shared-contracts).

OpenClaw's authenticated WebSocket protocol provides chat/session/control APIs
for an external UI. That is a candidate integration port, not yet a pinned
Twilight adapter. Keep upstream's Node service separate from Bun application
internals unless a compatibility probe supports another arrangement.
[Gateway protocol](https://docs.openclaw.ai/gateway/protocol)

For the customer-phase decision, preserve one fact: OpenClaw documents one
trusted operator/team boundary per Gateway, not hostile tenant isolation.
Session visibility is broad by default. Customer audience and packaging must
therefore determine whether separate Gateway cells and storage are required;
this research does not select the customer deployment.
[Security model](https://docs.openclaw.ai/gateway/security)

## Research that must not become stale authority

- [Initial inspection](initial-inspection.md) describes an older Claire checkout.
  Its provider/harness status and live behavior were never verified here.
- [Runtime patterns](runtime-patterns.md) remains useful, but the blanket phrase
  “in-process queue” needs the distinction between durable input, execution queue,
  session recovery and external-effect recovery. File hooks and typed gate hooks
  also have different failure policies; “hooks fail open” is not a universal rule.
- Upstream prose itself has migration-era inconsistency: the current session page
  and inspected source use SQLite, while the subagent auto-archive paragraph and
  security page still describe JSONL paths. Pin the actual release and inspect its
  store/export behavior before designing an archive importer.
- [Worker-pool research](worker-pools.md) calls K3s a candidate because it predates
  the recorded choice. Use the accepted ADR and current design for that decision.
- [Knowledge research](knowledge-patterns.md) concerns curated knowledge and cited
  recall. It does not establish transcript completeness, worker memory, or a new
  authorization to enable automatic learning. Those remain separate concerns.

## Necessary live proofs, not yet run

| Probe                    | Evidence required before relying on the integration                                                                                                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsiveness           | Keep a real worker busy for five minutes; send unrelated requests and corrections through the intended channel. Measure acknowledgement/answer latency while confirming the original work continues. Repeat with saturated worker/provider capacity and cold startup. The response target remains a human decision.                       |
| Direct-worker continuity | Join the exact assignment while its worker runs; send a correction; observe which turn consumes it and which secretary event records it. Rename the worker, restart and create another assignment: history and ownership stay attached without automatic cross-assignment memory. Exercise both assistant-native and Twilight/ACP routes. |
| Search and retention     | Place unique markers only in user text, assistant text, tool output and an inactive branch; inspect long outputs and external harness history. Repeat after reset, archive, cleanup and restart. Missing/unreadable archives, truncated payloads and indexing-in-progress must be visibly distinguishable from no matches.                |
| Progress delivery        | Delay/drop/reorder observation events and disconnect the UI. Reconnect to durable state; show stale or unsupported coverage rather than a false current status. A worker-authored “done” must not complete a delivery whose required evidence is absent.                                                                                  |
| Effective configuration  | For each selected model/harness/credential route, make a real call under its effective allowlist, then attempt a forbidden operation through that same route. Exercise rejected review output and hook timeout/error. Confirm exact selected model, review independence and remaining quality floors.                                     |
| Authority and recovery   | Interrupt between admission, external effect and acknowledgement; reconnect direct chat; kill or lose an attempt. Confirm Twilight reconciles uncertainty and refuses stale-fence dispatch before another writer receives the workspace. OpenClaw restart recovery must not duplicate the delivery operation.                             |
| Upgrade and capture      | Pin Gateway/plugin/harness versions and state schemas; migrate a synthetic older transcript store and restore it. Verify source-linked search, redaction, permissions, retention and external-tool coverage against that exact release. Broader customer isolation is proved against the eventual customer model.                         |

For each new safety check, inject the fault on its production path and observe
the failing assertion before writing the repository's required `Proof:` comment.
The table above specifies future evidence; it contains no claimed failure proofs.

## Verification limits

Performed read-only repository/document/source inspection and public upstream
revision lookup. Initial sandboxed GitHub lookup failed DNS resolution; the
approved read-only retry succeeded. The browser's commit API request was
unavailable; the revision above came from fresh `git ls-remote` output. One guessed
Claire plugin filename was absent; file discovery located `index.mjs` and it was
then inspected. No private transcript corpus or credentials were opened or copied.

No dependency installation, model call, Gateway start, host inspection, migration,
integration test, throughput benchmark or deployment ran. No runtime or full
repository gate was run for this research-only Markdown addition.

Prettier write/check passed using Bun, the integrating checkout's installed
formatter and configuration, and `--ignore-path /dev/null` so the isolated file
was actually read. The first worktree-local attempt could not resolve the
Tailwind plugin; no dependencies were installed to work around it. A read-only
local link check verified 13 links and their named heading anchors against the
integrating checkout, which holds the uncommitted assistant/map documents.
