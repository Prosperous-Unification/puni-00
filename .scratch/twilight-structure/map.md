# Structure Twilight for personal use and future customers

Labels: wayfinder:map

Status: resolved

## Destination

A coherent product and delivery structure for the whole Twilight system,
including the OpenClaw assistant, with the decisions and dependencies needed to
serve Dany first and potential customers second made explicit.

## Notes

- User direction: [product audience and priorities](../../docs/twilight-structure/spec.md).
  The personal phase prioritizes delivery configurability and quality. The
  customer phase follows it. The complete delivery boundary and required quality
  practices are resolved below; interaction design and task placement remain open.
  Later requirements add concurrent branch devs, dev-main and production-like
  staging for final testing before merge. The candidate and artifact-promotion
  boundary is resolved below.
- Work through this map with Wayfinder, grilling, domain-modeling and
  brainstorming. Use research or prototype for the matching ticket type.
- [Tracker operations](tracker.md) define claims, dependencies and frontier
  queries. This is a decision map; the existing
  [OpenSpec delivery plan](../../openspec/changes/twilight-control-plane/tasks.md)
  remains the implementation source until a resolved decision amends it.
- Orient through the [Twilight index](../../docs/twilight-structure/README.md),
  [assumptions](../../docs/twilight-structure/assumptions.md),
  [context map](../../CONTEXT-MAP.md) and
  [assistant vocabulary](../../docs/assistant/CONTEXT.md).
  Accepted choices, provisional assumptions and historical review receipts are
  distinct. Do not reopen a settled choice without an identified conflict or its
  recorded reopen condition.
- Charting defines questions and launches research; it does not resolve human
  decisions. Implementation, deployment and customer commitments are outside
  this effort. Existing M0–M4 milestones are not the two product phases.

## Decisions so far

- [Define the personal phase's complete delivery loop](issues/01-personal-delivery-acceptance.md): Phase 1 covers request → dev → prod; completeness is required even while the loop continues to improve.
- [Establish OpenClaw's usable assistant and factory integration boundaries](issues/02-openclaw-integration-evidence.md): delegation exists; complete evidence search, work events and the delivery boundary still need integration contracts and proofs.
- [Trace the existing plans and Claire lessons to the two product audiences](issues/03-existing-plan-and-claire-evidence.md): personal delivery crosses current milestone labels; clean-client proofs are shared foundations, and assistant coverage is additional work.
- [Select the personal phase's delivery controls and quality evidence](issues/04-personal-delivery-controls.md): exhaustive scenarios, layered tests and reports are required; its initial merge-gate placement is superseded by the later staging requirement.
- [Define branch dev environments and staging before merge](issues/07-staging-and-branch-devs.md): stage the feature branch composed with current main, merge the tested candidate and promote the same artifact; dev-main tracks main alongside branch devs.
- [Make ongoing work and intervention understandable at a glance](issues/06-everyday-work-view.md): provisionally use the secretary-led overview, with conversation and delivery-board views over the same durable records.
- [Assign existing product work to the personal and customer phases](issues/05-product-phase-boundaries.md): complete the assistant-to-production personal loop first, mature planning and portability next, and require named customer discovery before Phase 2 commitments.

## Deferred decisions

- Which potential customer and concrete customer problem should shape the second
  phase, and which onboarding, packaging and maintenance questions that reveals.
- Which richer agent visual treatments prove useful once a basic work view is
  tested, and how much presentation belongs in the personal phase.

The customer and visual questions do not block the personal route. Their scored
revisit points live in assumptions A51 and A63.

## Out of scope

- [Individual worker memory across assignments](../../docs/assistant/ideas.md)
  is parked as a possible user-experience or retention improvement, not planned
  implementation.
- Building or deploying the product during this mapping effort.
- Replacing the existing OpenSpec plan with an independently maintained task
  backlog. Customer readiness will be planned, not claimed or sold by this map.
