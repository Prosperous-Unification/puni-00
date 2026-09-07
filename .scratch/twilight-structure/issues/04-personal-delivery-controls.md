# Select the personal phase's delivery controls and quality evidence

Parent: [Structure Twilight for personal use and future customers](../map.md)

Labels: wayfinder:grilling

Type: grilling

Mode: HITL

Status: claimed

Assignee: Dany

Blocked by: 01, 02, 03

## Question

Which controls must Dany be able to change in the complete request-to-production loop,
which quality obligations remain fixed, and what evidence will show the effect
of those choices on accepted outcomes, elapsed time and cost?

Use the [accepted complete loop](01-personal-delivery-acceptance.md) and research findings to distinguish required controls
from later breadth. Address model/runtime selection, parallelism, review and test
choices, intervention, spending and visibility as parallel decision dimensions.
Cover development acceptance and production release as well as agent execution;
retain the existing explicit human command for production.
Do not treat more activity or a configurable setting as evidence of quality.

Sources: [delivery profiles and outcomes](../../../openspec/changes/twilight-control-plane/design.md#levers-ledger-and-outcomes),
[product controls](../../../docs/twilight-structure/product-experience.md#all-supported-settings-are-visible-scoped-and-versioned).

## Comments

2026-09-08 — Dany specified the required personal delivery practices, recorded
in TS-32–35 of the [requirement catalog](../../../docs/twilight-structure/spec.md):

- Exhaustive Given/When/Then scenarios in OpenSpec.
- Layered automated tests, with most coverage in stateless unit tests, then API
  tests against a real database, then Playwright tests.
- Manual test scenarios executed through cloud-browser use, including scheduled
  sweeps of the running shared development environment.
- Frequent commits, merges to main and dev deployments so actual progress is
  observable on shared dev.
- Passing automated-test reports and passing manual-test reports as evidence.

These are confirmed obligations. Existing model, review, concurrency and budget
controls remain specified; this answer does not remove them. Test reports retain
the existing scenario/source/environment attribution and missing-evidence rules.

One gate decision remains pending: allow each checked increment onto main/dev
after automated tests, then require manual acceptance before production; or
require manual acceptance before every merge as well. The agent recommends the
former to support frequent shared-dev updates. The question has been put to
Dany; the recommendation is not yet an accepted policy. Sweep cadence is also
unspecified, with no invented schedule.

The existing [publication contract](../../../openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md#requirement-integration-is-an-independently-scalable-execution-service)
waits for candidate acceptance, including applicable cloud checks, before shared
source publication. If manual sweeps follow main/dev publication, the design must
distinguish the automated merge gate from manual acceptance of the deployed
candidate. Reconcile that ordering in the owning design, delta spec and execution
profile rather than leaving contradictory instructions for an implementer.
