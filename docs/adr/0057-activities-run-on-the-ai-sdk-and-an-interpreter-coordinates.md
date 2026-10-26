# Activities run on the AI SDK and an interpreter coordinates

**Status:** proposed, 2026-10-21. Slice 6a (S7a) of `twilight-agentic-workflows` accepts it when the
prototype's tests pass without LangGraph, or overturns it.

Twilight Dash needs to drive three kinds of agent from one workflow: API models (Anthropic,
OpenAI, OpenRouter), coding-agent CLIs (Claude Code, Codex) and ACP agents, and to walk a
WBS leaf's steps durably. We decided that every agent activity runs behind one port whose
adapters are built on the Vercel AI SDK 7, and that coordination is an interpreter of Dash's
own over provider-neutral RunStore and ArtifactStore ports, not LangGraph. SQLite is the
current adapter choice; any conformant provider can replace it without changing the core. The AI SDK is the only TypeScript layer with
first-party adapters for all three kinds behind one stream shape, it is Apache-2.0 and needs
no Vercel account, and the website already runs on it. It has no durable graph engine, and
our graph is data from WBS, so a code-built StateGraph would be a second state model over the
compiled workflow the glossary already names.

## Considered options

- **LangGraph.js**, as prototyped in `tools/harness-example` and recommended by the 2026-09-06
  runtime-patterns note: proven checkpointer, interrupts and fan-out, but no harness or ACP
  adapters, a code-built graph over a data-defined one, and a second persistence model beside
  the stores Dash already owns.
- **Vercel Workflow DevKit, Temporal or Inngest** under the AI SDK: durable, but a runtime of
  their own to host; the self-hosted Workflow "world" was unverified on 2026-10-21.
- **OpenClaw Lobster**: linear YAML pipelines with approval gates; no DAG, file state on one
  host, gateway-bound. Kept for the trigger edge, not the coordinator.

## Consequences

- `ai` and every `@ai-sdk/*` package are pinned exactly; harness packages are 1.0.x and
  labelled experimental, so the port is the only thing that may import them.
- Model ids always carry a provider prefix; a bare string would route through Vercel's paid
  AI Gateway.
- ACP v1 exposes no per-step usage, so `token_actual` for ACP attempts is a modelled unknown.
- `HarnessAgent` requires a sandbox provider; which one runs under Bun is decided by a spike,
  with the Claude Agent SDK direct as the fallback behind the same port.

## Accepted planning refinement, 2026-10-21

Keep CTT's unified hints API; no separate planDag graph representation. Retain immutable
binding manifests and referenced versions. Reconcile ownership, surviving workers and
uncertain effects before retry. S7a's safe compatibility runtime precedes deployment and
real dogfood; S7b adds the required type-specific DAG integration. Storage ports specify
atomic semantics; adapter schemas and migration mechanisms remain implementation details.

## G2 decision history, 2026-10-25

The earlier WBS-only direction, restored by PR 749, withdrew RunStore and ArtifactStore and
placed all run facts in WBS. The owner's later comparison selected durable execution facts
and receipt-based reconciliation in [ADR 0061](0061-execution-facts-survive-coordinator-restart.md),
superseding that withdrawal. WBS retains scheduling, claims, business attempts, progress and
measures; semantic execution/artifact ports retain the facts needed to reconcile sessions,
effects and WBS acceptance. Scheduling is rebuilt from WBS and accepted execution facts,
without persisting the walk. ADR 0061 accepts this recovery foundation, not this proposed
SDK decision as a whole or incomplete S7a implementation and recovery proofs.
