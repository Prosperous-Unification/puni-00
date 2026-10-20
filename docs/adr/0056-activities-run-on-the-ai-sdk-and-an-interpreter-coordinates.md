# Activities run on the AI SDK and an interpreter coordinates

**Status:** proposed, 2026-10-21. Slice 6 of `twilight-agentic-workflows` accepts it when the
prototype's tests pass without LangGraph, or overturns it.

Twilight Dash needs to drive three kinds of agent from one workflow: API models (Anthropic,
OpenAI, OpenRouter), coding-agent CLIs (Claude Code, Codex) and ACP agents, and to walk a
WBS leaf's steps durably. We decided that every agent activity runs behind one port whose
adapters are built on the Vercel AI SDK 7, and that coordination is an interpreter of Dash's
own over a SQLite run store, not LangGraph. The AI SDK is the only TypeScript layer with
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
