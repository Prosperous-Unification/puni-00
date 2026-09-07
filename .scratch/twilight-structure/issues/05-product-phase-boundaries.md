# Assign existing product work to the personal and customer phases

Parent: [Structure Twilight for personal use and future customers](../map.md)

Labels: wayfinder:grilling

Type: grilling

Mode: HITL

Status: resolved

Assignee: Dany

Blocked by: 01, 03, 04, 06, 07

## Question

Given the accepted personal loop, selected controls and dependency evidence,
which existing M0–M4 work is required for personal use, which belongs to customer
readiness, and what amendments must be made to the one delivery plan?

The agent prepares the task ordering and traces each placement to established
requirements and real dependencies. Dany reviews concrete product tradeoffs;
he is not being asked to sort implementation tasks himself.

Retain genuine technical prerequisites and explicit earlier choices. Examine
client templates, clean client fixtures, planning storage migration, installation
and support requirements individually rather than moving everything with the
word client. Identify the customer questions that can now be specified; do not
invent a target customer or service commitment.

The [complete personal loop](01-personal-delivery-acceptance.md) requires both
development acceptance and production deployment in the personal phase. Include
the corresponding Task 13 capabilities and their prerequisites when amending
the plan; further improvements can follow without leaving that loop incomplete.
The [required testing and delivery practices](04-personal-delivery-controls.md)
also require scenario coverage, layered tests, frequent main/dev publication,
scheduled cloud-browser sweeps and linked reports in the personal phase.

The later [environment requirement](07-staging-and-branch-devs.md) adds concurrent
branch devs, dev-main tracking main, and staging for final testing before merge.
Carry its resulting gate order into the control-plane design, delta specification,
execution profile and ordered implementation slices together. Frequent commits
and branch-dev deployments make work observable before it qualifies for main;
main follows staging acceptance. Retain candidate-bound automated/manual evidence
and the explicit production command. Include scheduled dev sweeps,
scenario-to-report coverage, served-revision verification and visible
failure/staleness in the resulting acceptance scenarios.

Account for environment-to-branch assignment, concurrent long-running branches,
independent environment lifecycle and state, desired versus deployed revisions,
staging/prod parity, and resource admission. Staging tests the feature branch
composed with current main; merge that tested candidate and promote its built
artifact. A moved main requires recomposition, rebuilding and fresh testing.
Detailed topology, staging concurrency and lifecycle defaults remain to specify.

## Answer

2026-09-08 — The personal phase ends only when Dany can ask the secretary for a
software change, follow delegated work, inspect its sessions and evidence, see
frequent branch-dev updates, accept the current-main composition in production-like
staging, publish that exact candidate to main, observe dev-main, and explicitly
promote the same artifact to production with health and recovery evidence.

The route is: Tasks 1–8 establish the factory core; Task 11.1 supplies triggers and
notifications; Task 13 supplies branch dev, dev-main, staging and production; and
new assistant/work-view slices connect OpenClaw to that complete loop. Tasks 9–10
then replace the provisional planning port with Backlog-backed WBS before customer
onboarding. Task 12 grows the knowledge system. Task 14 proves clean installation,
upgrade and self-use. Phase 2 starts only after a named design partner and problem
are chosen; it gets its own OpenSpec changes for tenancy, packaging, support and
service commitments instead of guessing them here.

Technical M0–M4 labels remain dependency landmarks rather than audience phases.
The authoritative OpenSpec plan, design, execution profile and delta specs carry
the detailed ordering and acceptance behavior. Assumptions A51–A65 record the
provisional defaults that made this resolution possible and their revisit points.

Sources: [delivery plan](../../../openspec/changes/twilight-control-plane/tasks.md),
[installation operating model](../../../docs/twilight-structure/discovery.md#installation-operating-model),
[client repository contract](../../../docs/twilight-structure/client-repositories.md).
