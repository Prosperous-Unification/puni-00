## Context

Three things exist and do not meet. WBS holds the plan: leaves, project steps in one order,
per-step progress and measures, claims with run ids, a startable read filtered by team, and
machine credentials pinned to agent persons (`wbs-team-claims`, merged 2026-10-20;
`wbs-machine-credentials`). Twilight names the execution side:
coordinator, worker, activity class, activity executor, compiled workflow
(`docs/twilight-structure/CONTEXT.md`), with a 51-task plan that has not started.
`tools/harness-example` proves one ACP agent can be driven through a plan, implement, revise
graph with sessions as the unit of memory, on LangGraph 1.4.15 and ACP SDK 1.4.0, both behind
current.

Research on 2026-10-20 and 2026-10-21 (recorded in
[ADR 0057](../../../docs/adr/0057-activities-run-on-the-ai-sdk-and-an-interpreter-coordinates.md))
found the Vercel AI SDK 7 to be the one TypeScript layer with first-party adapters for API
providers, coding-agent CLIs and ACP agents behind one stream shape, and found no durable
graph engine in it. The website conversation already runs on `ai` with the OpenRouter
provider (`apps/website/be-01/src/conversation/stream.ts`).

Dany's direction (2026-10-21): a basic integration layer for WBS-driven agentic workflows and
for Twilight flows, then puni-00 development under Twilight and WBS governance in the near
future. WBS may end up inside Navigator, inside Dash, or a separate tool both use.

## Assumptions

Each is a decision a careful colleague would take today, recorded so Dany can overturn it by
id. The accepted integration refinements below govern API, persistence, binding retention,
recovery and delivery order; other product assumptions remain proposed.

- **A1 WBS placement.** WBS stays its own product (names.md, 2026-09-19). Navigator writes
  the plan; Dash writes execution facts: claims, progress, measures, external refs. Dash
  reaches WBS only over HTTP under a machine credential (pinned to the coordinator's agent person), so folding WBS into either tool later
  changes deployment, not this port.
- **A2 Runtime.** The AI SDK is the agent-integration layer and an interpreter over Dash's
  run store is the coordinator. LangGraph is retired when the interpreter passes the
  prototype's tests. ADR 0057; amends the control-plane constraint line and Tasks 1 and 6.
- **A3 Planning authority.** WBS be-01 is the planning store this layer reads and writes.
  The Backlog.md migration (control-plane M2, Tasks 9 and 10) is not a prerequisite and stays
  parked. ADR 0027 keeps its proposed status; its spike is not this change.
- **A4 Where the binding lives.** During the first compatibility milestone, before W0–W12 deliver type-specific DAGs, the workflow
  binding is a repository file, `.twilight/workflows.yaml`, keyed by work item type then
  step code. It may name only step codes the project holds; Burokrat refuses others.
- **A5 Step kind.** WBS steps carry no kind yet. The binding's executor kind stands in for
  it. When W1/W9 expose workflow activity requirements, WBS owns them and the execution binding must agree or be refused.
- **A6 First activity classes.** `plan` (api-model, code mode optional), `impl` (cli-harness,
  Claude Code), `review` (api-model with a second model, or cli-harness), `verify` (tool: the
  h2puni gate under its lock), `integrate` (human approval, then a guarded merge tool). Defaults pinned
  in the binding, never in code.
- **A7 Sandbox.** The first worker is the coordinator's host: a dedicated worktree per
  attempt on the laptop or h2puni. Which sandbox provider `HarnessAgent` gets is decided by
  spike 0.1: `ai-sdk-sandbox-local`, an own `HarnessV1SandboxProvider` over the worktree, or
  the Claude Agent SDK direct with no `HarnessAgent`. K3s workers (ADR 0028) come later and
  slot in as a worker provisioner.
- **A8 Capacity.** The coordinator holds a configured cap on active attempts (2 on the
  laptop). It never computes resource fit; it reads WBS's startable rows and, once the
  resources change ships, its fit, and refuses to start what WBS does not list.
  Budget admission is WBS's (`wbs-measure-budgets` D68): the claim or attempt start takes the
  spend hold inside the write and refuses `budget_exhausted`; the coordinator never admits
  from a headroom read.
- **A9 Identity.** One coordinator runs under one machine credential (pinned to the coordinator's
  agent person). Each attempt records as its agent run the session id its adapter returns.
- **A10 Retirement.** `tools/harness-example`'s ACP client, fake agent and log move into
  Dash; the example project and the LangGraph dependency go when S7a and the replacement adapter conformance suite are green.
- **A11 Dogfood.** The first governed change is a small real work item in the puni-00 WBS
  project, chosen at slice 8, not this change itself.

## Boundaries and units

Everything new is Twilight Dash's: it takes time, holds credentials and changes the world.
The one static piece, the binding's schema and validator, is Burokrat's.

| Unit                                                      | Responsibility                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `twilight-burokrat/cli/src/contracts/workflow-binding.ts` | ArkType schema of the binding; `twib validate workflow-binding <file> --steps <codes>`                                                |
| `twilight-dash/cli/src/agents/`                           | `ActivityExecutor` port and adapters consuming injected model/tool capabilities                                                       |
| `twilight-dash/cli/src/bridge/`                           | WBS HTTP client over `@wbs/contracts` shapes under a machine credential pinned to the coordinator's agent person; every refusal typed |
| `twilight-dash/cli/src/runs/`                             | RunStore/ArtifactStore ports and adapters, attempt states, the interpreter, `run-coordinator` and `inspect-runs` commands             |
| `.twilight/workflows.yaml`                                | puni-00's own binding                                                                                                                 |

Dash does not import WBS app internals; the shared contracts package is the boundary, as
`twin` already does with the export.

## The port

[Executor design](executor-design.md) is the authoritative ActivityExecutor contract;
[executor tasks](executor-tasks.md) deliver the shared port and first API-model adapter.
The port distinguishes preparation, real adapter sessions, immutable turn identities,
completed and uncertain outcomes, and honest recovery capabilities. Its stream is the
installed AI SDK UIMessageChunk. Unknown usage causes the later coordinator to omit
measurement: an absent measure stays absent and an earlier measured value remains intact.

The API-model adapter uses a caller-injected SDK model registry and selected tool
capabilities, retained prompt text and the real ToolLoopAgent. Provider construction,
credentials, execution/spending authority and durable host integration are separate.
Its process-local conversations and exact-retry cache do not advertise backend recovery.
The other adapters remain planned:

- **cli-harness**: HarnessAgent with Claude Code or Codex, permission mode from binding
  and sandbox from A7.
- **acp**: the existing client permission seam and session/load replay; harness-acp
  remains deferred until it exposes both.
- **tool**: a registered command with attempt-derived argv and recorded exit/output.
- **human**: a durable waiting_for_person state and an operator continuation.

## Workflow binding

The following complete mapping is illustrative, not a repository default or a claim that
its model names are available. Validation requires the referenced prompt files.

```yaml
version: 1
types:
  change:
    plan: { class: plan }
    impl: { class: impl }
    review: { class: review }
    verify: { class: verify }
    integrate: { class: integrate }
classes:
  plan:
    executor: api-model
    model: anthropic:claude-opus-5-5
    prompt: .twilight/prompts/plan.md
    tools: [wbs-read]
    limits: { maxSteps: 20, maxOutputTokens: 16000 }
  impl:
    executor: cli-harness
    harness: claude-code
    permissionMode: allow-edits
    prompt: .twilight/prompts/impl.md
  review:
    executor: api-model
    model: anthropic:claude-opus-5-5
    prompt: .twilight/prompts/review.md
    tools: [wbs-read]
    limits: { maxSteps: 20, maxOutputTokens: 16000 }
  verify:
    executor: tool
    command: bin/h2puni-gate.sh
  integrate:
    executor: human
    prompt: .twilight/prompts/integrate.md
```

Every declared type mapping must cover exactly the supplied project-step set. A requested
type with no entry selects the complete `default` mapping if present; an explicit type
never inherits missing steps from `default`. Unknown or missing mapped steps refuse
validation. Without an explicit type or default, selection refuses `unmapped_type`.

The `integrate` class here models only a human decision wait. It does not implement A6's
subsequent guarded merge; that composition remains unresolved before repository defaults
and runtime integration. Binding acceptance establishes static settings and referenced-byte
consistency, not approval or budget authority. Parent 1.1–1.2 does not complete WBS I1's
governance remainder. See [binding design](binding-design.md) and
[binding tasks](binding-tasks.md) for this validator packet. The five activity classes here
need not map one-to-one onto all five executor kinds; contract fixtures cover every kind.

## WBS run bridge

One client, one credential, the shared shapes. Reads: the startable read for the team, the
work item, its export for step codes. Writes, each a plan command batch: `claimWorkItem`,
`setProgress`, `setMeasure` (`token_estimate` untouched, `token_actual` written when measured),
`releaseWorkItem`, and the `github-branch` and `github-pr` external refs. Every code of the
`claimWorkItem`, `setProgress` and `releaseWorkItem` refusal unions in `@wbs/contracts` at the
pinned revision (today including `not_startable`, `item_done`, `step_done`, `claim_limit`,
`resources_exhausted`; `budget_exhausted` once `wbs-measure-budgets` lands) is a typed outcome
the interpreter decides on; an unlisted code throws.

Each Dash attempt corresponds one-to-one with a WBS step-node Attempt; this remains a deferred host integration requirement. Runtime attempt IDs and WBS numeric business attempt numbers are distinct; the receiver packet adds no business start/end commands. The retry claim protocol remains [ADR0058](../../../docs/adr/0058-wbs-owns-runtime-fences.md): continuation keeps the exact claim, while a genuinely new execution attempt requires predecessor reconciliation and a new exact claim.

## Run coordination

The project owner selected durable execution records with receipt-based reconciliation on 2026-10-25 after comparing both recovery models. [ADR 0061](../../../docs/adr/0061-execution-facts-survive-coordinator-restart.md) records G2 and its limits. The owner's subsequent 2026-10-25 instruction authorizes commit, push and merge after required evidence, review and release checks, superseding the earlier architectural publication hold. Implementation, recovery proofs and release gates remain separate acceptance work.

### Accepted boundaries

The earlier WBS-only G2 direction restored by PR 749 is superseded by ADR 0061's later
selection. WBS remains the scheduling and business ledger; retaining execution evidence
does not create a second authoritative plan. The coordinator reconciles current WBS facts
with accepted execution facts on each tick and restart, without persisting a CTT walk.

| Facts                                                                                                                                                                 | Authority or retention                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Step topology, eligibility, claims, business attempts, progress and measures                                                                                          | WBS business APIs                                            |
| Runtime generations, immutable execution/claim bindings and accepted command receipts                                                                                 | Conditional WBS receiver                                     |
| Immutable binding manifests, admission/preparation and turn intents, session/worker locators, outcomes, outgoing WBS intents and retained receipt/artifact references | RunStore semantic port                                       |
| Immutable prompt/tool-policy bytes, logs, diffs, transcripts and evidence bytes                                                                                       | ArtifactStore semantic port, referenced by execution records |

WBS project history and business attempt notes/references remain business records; they do
not replace complete executor locators or exact command acceptance evidence. Runtime
attempt/session identity remains distinct from WBS numeric business attempt ordinals, and
the receiver adds no `startAttempt` or `endAttempt` command.

The coordinator depends on semantic `RunStore` and `ArtifactStore` ports, and on the WBS
HTTP bridge. WBS's WorkflowRepository remains behind WBS's own API. SQLite is the current
adapter choice, not part of the core contract: any store satisfying atomicity, revision,
uniqueness, fencing, consistent-read and recovery requirements can implement the ports.
SQL, SQLite `user_version`, connection handles and provider migration details stay inside
adapters. Memory is a test provider, not proof of durability. A second durable adapter runs
the same conformance suite before interchangeability is claimed.

RunStore operations atomically admit an attempt with capacity/identity/owner checks, store
immutable binding manifests, commit outcomes with outgoing WBS intents, and deduplicate
incoming decisions and command receipts. ArtifactStore stores immutable content with
integrity and retention metadata; verify uploads before committing an outcome reference.
Version portable records independently of each adapter's physical schema. WBS and RunStore
are separate commits: use an outbox and guarded idempotent writes/read-back reconciliation,
not a distributed exactly-once promise. Store names or filesystem paths in CLI configuration
select adapters; the core does not require a database file.

The first persistence packet is specified in [S0 storage foundation](storage-design.md),
with its ordered implementation slices in [storage tasks](storage-tasks.md).

### One hints API

Use CTT's existing hint adapters/runners with accepted-work seeds, `DEFER_READY`, guarded
host settlement and ID-keyed `summary()`. There is no separate `planDag` graph input or
scheduler entry point. A compatibility adapter maps the current ordered steps into explicit
edges; the later type-workflow adapter supplies pinned DAG instances through the same hints.
The full declared graph must be discovered and validated before WBS admission, independently
of deferred work. Include disconnected/source-less cycle components. A lazy summary states
that discovery is incomplete; summary itself invokes no user callbacks.

Deferred work does not satisfy dependencies. Kernel-ready IDs are filtered against durable
running/wait/retry facts, current WBS eligibility and capacity before launch. `settle` is
bound to the current runner/execution generation and only reports WBS-accepted business
outcomes; late/conflicting results refuse and identical duplicates are idempotent. Rebuilt
runners consume durable accepted facts, not serialized queues or deferred handles. Agent
turn completion alone never advances business progress.

### Admission and recovery

Persist admission/launch intent before external calls. Reserve capacity atomically, acquire
the exact WBS claim, persist session/worker locators, validate outputs, then atomically save
the outcome and outgoing progress intent. Deliver that intent idempotently and confirm its
WBS receipt before releasing successors. `outcome_pending_progress` preserves the
result while the WBS update is retried; it must not cause the activity to run again.

On startup, obtain/fence valid ownership before changing attempt state. Inventory running
attempts and locate surviving workers/sessions and their effects by operation identity.
Reattach when safe; otherwise cancel/quiesce and confirm termination before replacement.
A coordinator dying is not proof that an agent died. Unknown worker/effect state is an
explicit `unresolved` outcome for operator reconciliation, never automatic retry. Keep
capacity reserved while physical work may survive. Completion/release checks exact
claim/run/attempt authority; local fencing cannot promise protection against an external
system that does not enforce it.

Attempt state distinguishes queued, running, waiting-for-person, reconciling, interrupted,
outcome-pending-progress, unresolved and terminal outcomes. An attempt becomes
interrupted only after recovery establishes that safe interpretation. A retry creates a new
attempt ordinal within the persisted budget while retaining the logical operation key.
Human waits persist prompts/correlation keys and use an authorized deduplicated inbox;
release running capacity only after work settles. WBS business progress stays authoritative.

Budget admission is WBS's (`wbs-measure-budgets` D68): the claim or attempt start takes the
spend hold inside the write and refuses `budget_exhausted`; the coordinator never admits from
a headroom read. Local execution capacity is separately reserved in RunStore across its
runs; WBS claim limits, resource leases and budget holds do not replace that reservation.
Local ownership epochs and receiver-minted generations remain independent fences, and
neither proves worker quiescence or releases an immutable claim on takeover.

### Binding pinning and repair

Before admission, retain the complete canonical binding manifest, its digest, schema
version and immutable prompt/tool-policy/executor-version references. A digest without
content cannot recover a run. The manifest stores secret-provider references, never secret
values. Restart loads the retained manifest: editing the live file affects future runs,
not existing ones. Explicit security revocation can stop existing work independently.
Re-pinning compares expected run/binding revisions, fences affected workers, and invalidates
changed activities plus their downstream provenance closure. Unchanged class configuration
alone does not prove an old output is reusable when its inputs changed.

### Delivery gates

S7a/slice 6a implements the safe coordinator with a linear compatibility workflow and fake
executor crash tests. It precedes any deployed coordinator or real dogfood (I5.02/I5.04).
S7b/slice 6b reuses that runtime for W6/W9 type-specific workflow instances, parallel joins,
adoption and repair epochs. W0–W12 remain required for the user's DAG vision; a linear
workflow demonstration is not product completion. Expanded multi-provider/type-DAG tests
follow, but surviving-worker/uncertain-effect safety is mandatory in S7a already.

The shared planning project is
[Agentic workflows — WBS, CTT and portable persistence](https://dev.wbs.bulletpoints.club/?project=eeb8e50a-6ee6-49e4-a533-e10b1e29939d).
Current main targets CTT0.11.0: unified completed-work seeds, DEFER_READY, settle and ID-keyed summary, with prerequisite resolution and native ESM. Exact dependency acquisition and compatibility conformance remain required before coordinator admission in this candidate. CTT owns no durable journal, storage provider or agent SDK.

The internal [runtime authority history](runtime-authority-design.md) retains sender intent
and acceptance before run creation, keeping local epochs separate from receiver grants.

## Governance cutover

A puni-00 project in WBS holds the work; work item types `change`, `fix`, `docs`; step codes
`plan`, `impl`, `review`, `verify`, `integrate`. A change opens as a work item, the
coordinator claims and runs its steps, the Board shows claims and progress, Burokrat gates
each artifact, the gate and merge are tool steps, and the PR carries the attempt's record.
The runbook (`docs/runbook-agentic-workflows.md`) names the commands and the refusals.

## What this amends

- `twilight-control-plane` proposal, constraints: "LangGraph/LangChain and ACP-first agent
  access" becomes "the AI SDK executor port with ACP as one adapter"; Task 1's LangGraph
  checkpointer proof becomes the durable execution reconciliation/restart proof; Task 6 runs its first real ACP
  activity through this port.
- `docs/twilight-structure/research/runtime-patterns.md` recommendation: superseded by
  ADR 0057; the note stays as dated evidence.
- `docs/twilight-structure/names.md`: unchanged under A1; the Dash row gains "execution
  writes to WBS" when Dany confirms A1.

## Risks and the spikes that retire them

| Risk                                                     | Spike                           | Fallback                                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HarnessAgent` or a local sandbox does not run under Bun | 0.1                             | Claude Agent SDK direct behind the same port                                                                                                                    |
| `@ai-sdk/code-mode` needs Node 22 and an exact `ai` pin  | 0.2                             | plain tool calling for `plan`                                                                                                                                   |
| Harness packages break between 1.0.x releases            | 0.3                             | exact pins, one renovate lane, the port absorbs                                                                                                                 |
| ACP attempts report no usage                             | modelled                        | `Usage.unknown`, shown, never defaulted                                                                                                                         |
| Concurrent owners or workers surviving coordinator death | S7a recovery proof              | fence local and receiver authority, retain the claim and capacity while work may survive, inspect workers/effects by retained identity; unresolved blocks retry |
| CTT minor releases change the hints API                  | exact pin0.11.0 and conformance | the compatibility adapter absorbs                                                                                                                               |

## Conditional WBS runtime receiver

[Receiver design](receiver-design.md) specifies S0.05–S0.07 coherent reads, receiver-owned
generations, exact claim bindings and permanent accepted-command receipts.
[Receiver tasks](receiver-tasks.md) sequence implementation and R5 proofs. Dash durable
pins/grant mappings and executor/coordinator integration remain separate prerequisites.

## Portable runtime request identity

The bounded [runtime request design](runtime-request-design.md) publishes the existing receiver codec for a durable bridge while preserving bytes, limits and admission. Sender retention, acceptance authentication and host orchestration remain later work.

## Portable runtime receipt correspondence

The bounded [receipt design](runtime-receipt-design.md) shares complete content matching and existing identity predicates for the receiver and future durable sender. Authenticated transport, trusted artifact decoding and sender persistence remain separate.

[Runtime limits integration](limits-integration-design.md) reconciles the existing receiver with current main's separately owned organization limits; no new limit policy or coordinator behavior is proposed.

### Logical request recovery

The owner approved [logical authority and claim recovery](recovery-design.md) on
2026-10-28 for implementation, tests and review, including preserving populated stores,
incremental authority/claim-first delivery and documented legacy artifact/clock exceptions.
[ADR 0064](../../../docs/adr/0064-uncertain-runtime-requests-use-journaled-recovery.md)
records the alternatives. Architectural main merge remains held; full write and physical
recovery remain separate requirements of the parent coordinator.

### Pending renames

Vocabulary ahead: per the 2026-10-24 decisions (`wbs-work-packages`, `wbs-permissions`, drafts
in flight), today's Project becomes Work package and a new Project is the engagement. "A
puni-00 project in WBS holds the work" reads as work package; step codes are
work-package-unique; the coordinator's identity becomes a package- or project-contributor
grant. Nothing here is renamed until those changes land.
