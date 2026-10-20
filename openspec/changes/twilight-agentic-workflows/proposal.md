## Why

Agent fleets build puni-00, yet nothing in the repository runs a WBS step as an agent
activity: Claire dispatches from notes, the harness example drives a fake agent, and the
control-plane plan puts LangGraph, K3s and a Backlog.md migration before the first real step.
Since 2026-10-20 WBS can say what may start and who holds it. Missing is a small layer that
takes a startable step, runs the activity its type and step code bind, and writes the outcome
back.

## What Changes

- **Activity execution.** One `ActivityExecutor` port in Twilight Dash with adapters on the
  Vercel AI SDK: API models, coding harnesses (Claude Code, Codex), ACP agents, registered
  tools, and waiting people.
- **Workflow binding.** A versioned repository file maps work item type and step code to an
  activity class. Burokrat validates it; Dash runs it.
- **WBS run bridge.** Dash claims a startable step under a fleet credential, states progress,
  records token measures, releases or completes, and models every WBS refusal.
- **Coordinator v0.** An interpreter over Dash's own SQLite run store walks a leaf's steps
  with attempts, bounded retries, restart resume and a concurrency cap.
- **Governance cutover.** puni-00's changes become WBS work items whose steps the
  coordinator runs; one real change end to end is the acceptance.

## Non-Goals

The per-type step DAG inside WBS (parked 020.08); the K3s worker pool (ADR 0028, later); the
OpenClaw secretary; the Backlog.md migration; multi-tenant hosting; UI beyond the Board and a
run log.

## Constraints

Bun and Nx. `ai` and every `@ai-sdk/*` package pinned exactly; never a bare model string,
which routes through Vercel's paid gateway. Fleet credentials, never a browser session.
Burokrat reads no clock. Every refusal, adapter failure and unknown usage is a modelled state
with a production-path negative. At most two heavy activities on the laptop.

## Capabilities

### New Capabilities

- `twilight/activity-execution`: one port, five executor kinds, one stream shape.
- `twilight/workflow-binding`: the validated file naming the activity for a step.
- `twilight/wbs-run-bridge`: claim, progress, measures and release through WBS.
- `twilight/run-coordination`: attempts, their states and the walk over a leaf's steps.

### Modified Capabilities

None.

## Domain Terms

Executor adapter, Workflow binding, Attempt, Run store (Twilight `CONTEXT.md`).

## Decisions Recorded

[ADR 0056](../../../docs/adr/0056-activities-run-on-the-ai-sdk-and-an-interpreter-coordinates.md);
design.md A1 to A11 are assumptions awaiting Dany's review.

## Impact

`twilight-dash/cli` (`agents/`, `workflows/`, `runs/`, `bridge/`), `twilight-burokrat/cli`,
`tools/harness-example` retired into Dash, `.twilight/workflows.yaml`,
`docs/twilight-structure/*`, control-plane Tasks 1 and 6 amended.
