# Establish OpenClaw's usable assistant and factory integration boundaries

Parent: [Structure Twilight for personal use and future customers](../map.md)

Labels: wayfinder:research

Type: research

Mode: AFK

Status: resolved

Assignee: Dany

Researcher: openclaw_boundaries

Blocked by: none

Research branch: `research/twilight-openclaw-boundaries`

Expected asset: `docs/twilight-structure/research/assistant-runtime-boundary.md`

## Question

Which current OpenClaw capabilities can provide the secretary, direct worker
conversations, searchable history and visible work, and where does Twilight still
need to own delivery controls, quality and durable execution?

Inspect current upstream primary sources and the local Claire setup. Compare
them with the existing Twilight runtime/worker/knowledge research. Record
capability and version boundaries, integration seams, conflicts and the live
proofs needed before adopting them. The result is evidence for a decision, not
an automatic replacement of LangGraph, ACP or accepted K3s scope.

Sources: [runtime research](../../../docs/twilight-structure/research/runtime-patterns.md),
[worker-pool research](../../../docs/twilight-structure/research/worker-pools.md),
[assistant vocabulary](../../../docs/assistant/CONTEXT.md), and
`~/wd/personal/claire` as a read-only reference.

## Answer

2026-09-07 — Research completed in the
[OpenClaw assistant and Twilight execution boundaries](../../../docs/twilight-structure/research/assistant-runtime-boundary.md)
report. OpenClaw supplies delegation and directly joinable persistent children,
but secretary responsiveness needs a released turn and reserved capacity. Native
search omits tool results and inactive branches; worker milestones need a separate
surface. OpenClaw's host-side ACP route does not establish the specified K3s
execution boundary.

The report proposes an assistant adapter over Twilight's authorized operations,
with delivery authority and quality retained by Twilight. This is decision
evidence, not approval of that integration design or the personal-phase scope.
It pins upstream and Claire revisions and lists required live proofs; none ran.
