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

| Unit                                                      | Responsibility                                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `twilight-burokrat/cli/src/contracts/workflow-binding.ts` | ArkType schema of the binding; `twib validate workflow-binding <file> --steps <codes>`                                                  |
| `twilight-dash/cli/src/agents/`                           | `ActivityExecutor` port, the five adapters, the provider registry, the fakes                                                            |
| `twilight-dash/cli/src/bridge/`                           | WBS HTTP client over `@wbs/contracts` shapes under a machine credential (pinned to the coordinator's agent person); every refusal typed |
| `twilight-dash/cli/src/runs/`                             | the reconcile loop over the bridge, attempt states read from WBS, the interpreter, `run-coordinator` and `inspect-runs` commands        |
| `.twilight/workflows.yaml`                                | puni-00's own binding                                                                                                                   |

Dash does not import WBS app internals; the shared contracts package is the boundary, as
`twin` already does with the export.

## The port

```ts
type ExecutorKind = 'api-model' | 'cli-harness' | 'acp' | 'tool' | 'human';

interface ActivityExecutor {
  readonly kind: ExecutorKind;
  /** Opens the adapter's session for one attempt; the returned id is the attempt's agent run. */
  open(attempt: AttemptContext): Promise<ActivitySession>;
  /** One prompt in, AI SDK UI message parts out as they arrive, then the turn's outcome. */
  turn(
    session: ActivitySession,
    prompt: string,
    onPart: (part: UIMessageChunk) => void,
  ): Promise<TurnOutcome>;
  close(session: ActivitySession): Promise<void>;
}

type Usage =
  | { kind: 'measured'; inputTokens: number; outputTokens: number }
  | { kind: 'unknown'; reason: 'acp-v1-no-usage' | 'tool' | 'human' };

interface TurnOutcome {
  text: string;
  usage: Usage;
  finish: 'end_turn' | 'max_steps' | 'refused' | 'cancelled';
}
```

The stream shape is the AI SDK's `UIMessageChunk`, which the website front end already
consumes. `Usage.unknown` is the one modelled degradation: ACP v1 exposes no per-step usage,
so `token_actual` for such an attempt is written as absent, never as zero, and the Board
shows it as unknown.

Adapters:

- **api-model**: `createProviderRegistry` over `@ai-sdk/anthropic`, `@ai-sdk/openai` and
  `@openrouter/ai-sdk-provider` with model ids of the form `provider:model`; `Agent` with
  `stopWhen`; optional `@ai-sdk/code-mode` routing per activity class after spike 0.2.
- **cli-harness**: `HarnessAgent` with `@ai-sdk/harness-claude-code` or
  `@ai-sdk/harness-codex`, permission mode from the binding, sandbox from A7.
- **acp**: the prototype's client, kept for its permission seam and `session/load` replay;
  `@ai-sdk/harness-acp` is not used until it exposes both.
- **tool**: a registered command (`twin`, `twib`, `bin/h2puni-gate.sh`, the merge) with
  argv built from the attempt, exit code and captured output as the outcome.
- **human**: writes `waiting_for_person`, holds the claim, and resumes on an operator command.

## Workflow binding

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
  verify:
    executor: tool
    command: bin/h2puni-gate.sh
```

Burokrat validates shape, pinned model ids (a bare `claude-...` is refused), known executor
kinds, prompt files present, and step codes against the list the caller passes from the WBS
export. A work item type with no entry falls back to `default`; a step code with no entry is
refused at validation, not at run time.

## WBS run bridge

One client, one credential, the shared shapes. Reads: the startable read for the team, the
work item, its export for step codes. Writes, each a plan command batch: `claimWorkItem`,
`setProgress`, `setMeasure` (`token_estimate` untouched, `token_actual` written when measured),
`releaseWorkItem`, and the `github-branch` and `github-pr` external refs. Every code of the
`claimWorkItem`, `setProgress` and `releaseWorkItem` refusal unions in `@wbs/contracts` at the
pinned revision (today including `not_startable`, `item_done`, `step_done`, `claim_limit`,
`resources_exhausted`; `budget_exhausted` once `wbs-measure-budgets` lands) is a typed outcome
the interpreter decides on; an unlisted code throws.

## Run coordination

### WBS is the ledger (G2, settled 2026-10-25)

_Dany, 2026-10-25: "answer A, all info in WBS"._ The coordinator is a reconcile loop, level
triggered like a Kubernetes controller: every tick, and every restart, rebuilds the walk from
WBS (step graph, progress, claims, attempts) and admits up to the cap. Nothing about the walk
is persisted outside WBS; the coordinator holds no journal. The 2026-10-21 "Accepted
boundaries" text (semantic `RunStore` and `ArtifactStore` ports, an outbox between WBS and a
run store, receipt replay) is withdrawn: it treated WBS as a foreign system to reconcile
against, and WBS is ours. Each job it gave the run store maps onto WBS:

| Run-store job                        | WBS                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| admission intent before launch       | `claimWorkItem` and `startAttempt` in one command batch under the machine credential, with the claim lease of `wbs-team-claims` |
| receipts of what happened            | `endAttempt` (outcome, note, reference), `setProgress`, `setMeasure`, the event log                                             |
| capacity reservation                 | the claim limit, `wbs-resources` leases and `wbs-measure-budgets` holds, each refused inside the write                          |
| run history                          | project history and the attempt list                                                                                            |
| worker or session locators           | the attempt's `reference` (URL or label) and `note`                                                                             |
| artifacts (logs, diffs, transcripts) | a later WBS attachment table or a plain file store keyed by attempt, not a database of its own                                  |
| human waits and decisions            | a later WBS inbox on the attempt; until then the prompt and correlation key sit on the running attempt                          |

What survives of the withdrawn text, restated against WBS: guarded idempotent writes (every
command names the exact claim and attempt it acts on and WBS refuses a stale one), recovery
by inspecting surviving workers before replacing them, `unresolved` as an explicit operator
outcome, and fencing by WBS claim ownership rather than a local owner generation. #660's
receipt-replay runtime is not the foundation; its resume task (eeb8e50a 010.11) carries this.

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

Admission is one WBS command batch: claim the step and start the attempt (the lease and the
budget hold are refused inside that write) before any external call; the attempt's
`reference` carries the session or worker locator as soon as it is known. An outcome is one
WBS command batch too: `endAttempt`, `setProgress`, `setMeasure`. If the agent finished but
that batch has not landed, the attempt is still running in WBS and the next tick retries the
write from the executor's answer; it must not run the activity again.

On startup there is nothing to replay. The first tick reads the running attempts from WBS,
locates surviving workers or sessions by the attempt's reference and reattaches when safe;
otherwise it cancels or quiesces and confirms termination before replacement. A coordinator
dying is not proof that an agent died. Unknown worker or effect state is an explicit
`unresolved` outcome for operator reconciliation, never automatic retry. The claim stays held
while physical work may survive. Completion and release name the exact claim and attempt, and
WBS enforces that (`wbs-team-claims`); there is no local fencing to keep in step.

Attempt state is WBS's attempt (running, then succeeded, failed or cancelled). Waiting for a
person, unresolved and finished-pending-write are derived each tick from the attempt's note
and the executor's answer, never stored as a second state machine. An attempt is ended
`cancelled` only after recovery establishes that the worker is gone. A retry is the next
attempt number on the same step node within the budget hold. A human wait keeps its prompt
and correlation key on the attempt; a decision delivered twice is consumed once by that key;
capacity is released only when the attempt ends. WBS business progress stays authoritative.

Budget admission is WBS's (`wbs-measure-budgets` D68): the claim or attempt start takes the
spend hold inside the write and refuses `budget_exhausted`; the coordinator never admits from
a headroom read.

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
CTT 0.11.0 is published (2026-10-23): completed-work seeds, `DEFER_READY`, `settle` and the id-keyed `summary()` landed in 0.9, `resolvePrerequisite`, `dependsOnComplete` and native ESM in 0.10; verified under Bun 1.4.2/1.4.4 and Node 24. Pin it exactly. CTT owns no durable journal, storage provider or agent SDK.

## Governance cutover

A puni-00 project in WBS holds the work; work item types `change`, `fix`, `docs`; step codes
`plan`, `impl`, `review`, `verify`, `integrate`. A change opens as a work item, the
coordinator claims and runs its steps, the Board shows claims and progress, Burokrat gates
each artifact, the gate and merge are tool steps, and the PR carries the attempt's record.
The runbook (`docs/runbook-agentic-workflows.md`) names the commands and the refusals.

## What this amends

- `twilight-control-plane` proposal, constraints: "LangGraph/LangChain and ACP-first agent
  access" becomes "the AI SDK executor port with ACP as one adapter"; Task 1's LangGraph
  checkpointer proof becomes the reconcile-loop restart proof; Task 6 runs its first real ACP
  activity through this port.
- `docs/twilight-structure/research/runtime-patterns.md` recommendation: superseded by
  ADR 0057; the note stays as dated evidence.
- `docs/twilight-structure/names.md`: unchanged under A1; the Dash row gains "execution
  writes to WBS" when Dany confirms A1.

## Risks and the spikes that retire them

| Risk                                                     | Spike                                   | Fallback                                                                            |
| -------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| `HarnessAgent` or a local sandbox does not run under Bun | 0.1                                     | Claude Agent SDK direct behind the same port                                        |
| `@ai-sdk/code-mode` needs Node 22 and an exact `ai` pin  | 0.2                                     | plain tool calling for `plan`                                                       |
| Harness packages break between 1.0.x releases            | 0.3                                     | exact pins, one renovate lane, the port absorbs                                     |
| ACP attempts report no usage                             | modelled                                | `Usage.unknown`, shown, never defaulted                                             |
| Surviving workers after a coordinator crash              | S7a recovery proof                      | the claim stays held; inspect workers by attempt reference; unresolved blocks retry |
| CTT minor releases change the hints API                  | exact pin 0.11.0 and a conformance test | the compatibility adapter absorbs                                                   |

### Pending renames

Vocabulary ahead: per the 2026-10-24 decisions (`wbs-work-packages`, `wbs-permissions`, drafts
in flight), today's Project becomes Work package and a new Project is the engagement. "A
puni-00 project in WBS holds the work" reads as work package; step codes are
work-package-unique; the coordinator's identity becomes a package- or project-contributor
grant. Nothing here is renamed until those changes land.
