# Make ongoing work and intervention understandable at a glance

Parent: [Structure Twilight for personal use and future customers](../map.md)

Labels: wayfinder:prototype

Type: prototype

Mode: HITL

Status: resolved

Assignee: Dany

Blocked by: 01, 02

## Question

What view lets Dany recognize ongoing work, see meaningful progress or waiting,
open a session, and steer a worker while the secretary remains available?

Prototype against the [complete request-to-production loop](01-personal-delivery-acceptance.md)
and observed OpenClaw capabilities. Include the development-acceptance evidence,
production decision and release outcome in the work view.
Show the last committed, merged and actually deployed revisions separately,
with links to the appropriate branch dev, dev-main, staging and production,
and the latest automated and manual test reports. Make environment/branch
assignment and the candidate awaiting staging acceptance visible.
Dany's requirement for observable progress includes running software on shared
dev; an activity timeline alone does not establish that publication happened.
Preserve the agreed secretary/direct-worker relationship and freely renameable
recurring worker identities. Show current assignments, useful events, evidence
and a route into searchable history. Per-worker memory is excluded. The
prototype answers an interaction question; it is not the production interface.

Sources: [assistant vocabulary](../../../docs/assistant/CONTEXT.md),
[parked memory idea](../../../docs/assistant/ideas.md),
[existing product surfaces](../../../docs/twilight-structure/product-experience.md#surfaces).

## Comments

2026-09-08 — Three interactive, simulated layouts are ready for Dany's review:

- A: work overview, with a persistent secretary panel beside workers,
  environments and evidence. Recommended starting layout.
- B: conversation first, with a worker roster and contextual work/environment rail.
- C: delivery board, with work placed across branch dev, staging, main and
  production, plus an available secretary composer.

Open the [local preview](http://127.0.0.1:4387/prototype/work-view?variant=A).
The bottom switcher or left/right arrows selects a variant. The preview permits
renaming, direct demo messages, a secretary copy, sample session/tool-text search,
test reports and a sample intervention. All content is fictional and in memory.

Primary source: branch `prototype/twilight-work-view`, commit `abb0cfd9`, in
`/tmp/puni-twilight-work-view`. The
[prototype guide](/tmp/puni-twilight-work-view/docs/assistant/work-view-prototype.md)
links screenshots and records verification. To restart the loopback preview:

    bun /tmp/puni-twilight-work-view/docs/assistant/work-view-prototype.mjs

Local Chromium checks passed for all layouts at desktop and mobile widths, plus
rename, direct message/secretary copy, tool-text search, report and navigation
interactions. Server lint, formatting and pre-commit checks passed. No live agent,
cloud-browser acceptance, application build or deployment was exercised.

Dany later authorized the agent to keep moving through documented assumptions and
to surface only the highest-importance questions. Assumption A51 therefore selects
layout A provisionally; no production implementation is implied.

## Answer

2026-09-08 — Use the overview as the personal-phase home: the secretary remains
available beside recurring, renameable workers, current assignments, environment
state and evidence. Conversation-first and delivery-board presentations remain
secondary routes into the same records. Every worker and assignment opens its
searchable session history; environment cards distinguish desired, committed,
composed, merged and deployed identities rather than reducing progress to prose.

This is a provisional product default under A51, not a user-approved visual design.
It can change without reopening the delivery architecture. The prototype proves
navigation and legibility only; live OpenClaw sessions, durable events, environment
adapters and evidence search remain implementation work.
