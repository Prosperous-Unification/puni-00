## Context

Three things exist and do not meet. WBS holds the plan: leaves, project steps in one order,
per-step progress and measures, claims with run ids, a startable read filtered by team, and
fleet credentials (`wbs-team-claims`, merged 2026-10-20). Twilight names the execution side:
coordinator, worker, activity class, activity executor, compiled workflow
(`docs/twilight-structure/CONTEXT.md`), with a 51-task plan that has not started.
`tools/harness-example` proves one ACP agent can be driven through a plan, implement, revise
graph with sessions as the unit of memory, on LangGraph 1.4.15 and ACP SDK 1.4.0, both behind
current.

Research on 2026-10-20 and 2026-10-21 (recorded in
[ADR 0056](../../../docs/adr/0056-activities-run-on-the-ai-sdk-and-an-interpreter-coordinates.md))
found the Vercel AI SDK 7 to be the one TypeScript layer with first-party adapters for API
providers, coding-agent CLIs and ACP agents behind one stream shape, and found no durable
graph engine in it. The website conversation already runs on `ai` with the OpenRouter
provider (`apps/website/be-01/src/conversation/stream.ts`).

Dany's direction (2026-10-21): a basic integration layer for WBS-driven agentic workflows and
for Twilight flows, then puni-00 development under Twilight and WBS governance in the near
future. WBS may end up inside Navigator, inside Dash, or a separate tool both use.

## Assumptions

Each is a decision a careful colleague would take today, recorded so Dany can overturn it by
id. None is confirmed.

- **A1 WBS placement.** WBS stays its own product (names.md, 2026-09-19). Navigator writes
  the plan; Dash writes execution facts: claims, progress, measures, external refs. Dash
  reaches WBS only over HTTP under a fleet credential, so folding WBS into either tool later
  changes deployment, not this port.
- **A2 Runtime.** The AI SDK is the agent-integration layer and an interpreter over Dash's
  run store is the coordinator. LangGraph is retired when the interpreter passes the
  prototype's tests. ADR 0056; amends the control-plane constraint line and Tasks 1 and 6.
- **A3 Planning authority.** WBS be-01 is the planning store this layer reads and writes.
  The Backlog.md migration (control-plane M2, Tasks 9 and 10) is not a prerequisite and stays
  parked. ADR 0027 keeps its proposed status; its spike is not this change.
- **A4 Where the binding lives.** Until 020.08 gives WBS a per-type step graph, the workflow
  binding is a repository file, `.twilight/workflows.yaml`, keyed by work item type then
  step code. It may name only step codes the project holds; Burokrat refuses others.
- **A5 Step kind.** WBS steps carry no kind yet. The binding's executor kind stands in for
  it. When 020.08 lands kind on the step, WBS wins and the binding must agree or be refused.
- **A6 First activity classes.** `plan` (api-model, code mode optional), `impl` (cli-harness,
  Claude Code), `review` (api-model with a second model, or cli-harness), `verify` (tool: the
  h2puni gate under its lock), `integrate` (tool for the merge, then human). Defaults pinned
  in the binding, never in code.
- **A7 Sandbox.** The first worker is the coordinator's host: a dedicated worktree per
  attempt on the laptop or h2puni. Which sandbox provider `HarnessAgent` gets is decided by
  spike 0.1: `ai-sdk-sandbox-local`, an own `HarnessV1SandboxProvider` over the worktree, or
  the Claude Agent SDK direct with no `HarnessAgent`. K3s workers (ADR 0028) come later and
  slot in as a worker provisioner.
- **A8 Capacity.** The coordinator holds a configured cap on active attempts (2 on the
  laptop). It never computes resource fit; it reads WBS's startable rows and, once the
  resources change ships, its fit, and refuses to start what WBS does not list.
- **A9 Identity.** One coordinator runs under one fleet credential pinned to one agent
  person. Each attempt records as its agent run the session id its adapter returns.
- **A10 Retirement.** `tools/harness-example`'s ACP client, fake agent and log move into
  Dash; the example project and the LangGraph dependency go when slice 6 is green.
- **A11 Dogfood.** The first governed change is a small real work item in the puni-00 WBS
  project, chosen at slice 8, not this change itself.

## Boundaries and units

Everything new is Twilight Dash's: it takes time, holds credentials and changes the world.
The one static piece, the binding's schema and validator, is Burokrat's.

| Unit                                                      | Responsibility                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `twilight-burokrat/cli/src/contracts/workflow-binding.ts` | ArkType schema of the binding; `twib validate workflow-binding <file> --steps <codes>`             |
| `twilight-dash/cli/src/agents/`                           | `ActivityExecutor` port, the five adapters, the provider registry, the fakes                       |
| `twilight-dash/cli/src/bridge/`                           | WBS HTTP client over `@wbs/contracts` shapes under a fleet credential; every refusal typed         |
| `twilight-dash/cli/src/runs/`                             | Run store (SQLite), attempt states, the interpreter, `run-coordinator` and `inspect-runs` commands |
| `.twilight/workflows.yaml`                                | puni-00's own binding                                                                              |

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
`releaseWorkItem`, and the `github-branch` and `github-pr` external refs. Every refusal code
the specs name (`already_claimed`, `inside_subtree_claim`, `person_not_bound`, `blocked`,
`held`, `done`, `unknown_team`) is a typed outcome the interpreter decides on; an unlisted
code throws.

## Run coordination

The run store is Dash's third store, beside the lease authority and the observation store,
sharing no table or lock with them (the pattern of ADR 0051). One coordinator per store.

| State                | Entered when                                        | Leaves by                                            |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| `queued`             | a startable step matched a binding and the cap held | claim succeeds → `running`; refusal → `skipped`      |
| `running`            | the claim is held and the adapter session is open   | outcome → `succeeded` or `failed`; human → waiting   |
| `waiting_for_person` | the class is `human` or the adapter asked           | operator resume → `running`; cancel → `cancelled`    |
| `interrupted`        | the coordinator restarted with the attempt running  | retry budget left → new `queued` attempt; else fail  |
| `succeeded`          | the turn finished and progress was stated           | terminal; the next step code becomes a candidate     |
| `failed`             | the adapter or a write refused after retries        | terminal; the claim is released, the Board shows why |
| `skipped`            | WBS refused the claim                               | terminal                                             |
| `cancelled`          | an operator cancelled                               | terminal; claim released                             |

Attempt identity is (claim id, step node id, ordinal); a retry is a new attempt and the
claim stays held across retries of one step. Restart resume: on boot every `running` row
becomes `interrupted` before any new admission. The walk over a leaf is today's step order
read from WBS; the interface takes an ordered list of step nodes, so the parked DAG replaces
the list without touching the states. The walker is `configurable-tree-traversal`: its
unreleased 0.8.0 (`main`, 2026-09-13) has DAG mode with explicit identity, `dependsOn`,
`ON_READY`/`ON_COMPLETE` and async concurrency, verified under Bun on 2026-10-21; what a
durable coordinator still needs from it (journal replay, waits, retries, cancellation,
per-vertex failure) is specified in
[configurable-tree-traversal#2](https://github.com/dany-fedorov/configurable-tree-traversal/issues/2),
and slice 6 consumes whichever of those land before it, writing the rest in the host. The lifecycle gets a model-based test
(`fc.asyncModelRun`) with sabotage proofs before any of it runs against a real agent, as the
2026-09-22 finding requires for concurrency code.

## Governance cutover

A puni-00 project in WBS holds the work; work item types `change`, `fix`, `docs`; step codes
`plan`, `impl`, `review`, `verify`, `integrate`. A change opens as a work item, the
coordinator claims and runs its steps, the Board shows claims and progress, Burokrat gates
each artifact, the gate and merge are tool steps, and the PR carries the attempt's record.
The runbook (`docs/runbook-agentic-workflows.md`) names the commands and the refusals.

## What this amends

- `twilight-control-plane` proposal, constraints: "LangGraph/LangChain and ACP-first agent
  access" becomes "the AI SDK executor port with ACP as one adapter"; Task 1's LangGraph
  checkpointer proof becomes the run-store restart proof; Task 6 runs its first real ACP
  activity through this port.
- `docs/twilight-structure/research/runtime-patterns.md` recommendation: superseded by
  ADR 0056; the note stays as dated evidence.
- `docs/twilight-structure/names.md`: unchanged under A1; the Dash row gains "execution
  writes to WBS" when Dany confirms A1.

## Risks and the spikes that retire them

| Risk                                                     | Spike          | Fallback                                          |
| -------------------------------------------------------- | -------------- | ------------------------------------------------- |
| `HarnessAgent` or a local sandbox does not run under Bun | 0.1            | Claude Agent SDK direct behind the same port      |
| `@ai-sdk/code-mode` needs Node 22 and an exact `ai` pin  | 0.2            | plain tool calling for `plan`                     |
| Harness packages break between 1.0.x releases            | 0.3            | exact pins, one renovate lane, the port absorbs   |
| ACP attempts report no usage                             | modelled       | `Usage.unknown`, shown, never defaulted           |
| Two coordinators on one store                            | design         | one store, one process, the lease authority later |
| `configurable-tree-traversal` 0.8.0 unpublished          | issue #2 there | pin a git revision until the npm release          |
