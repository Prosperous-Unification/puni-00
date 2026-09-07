# Assign existing product work to the personal and customer phases

Parent: [Structure Twilight for personal use and future customers](../map.md)

Labels: wayfinder:grilling

Type: grilling

Mode: HITL

Status: open

Assignee: unassigned

Blocked by: 01, 03, 04, 06

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

The accepted gate order is automated checks → main merge and shared-dev
deployment → manual cloud-browser acceptance → explicit production command.
Carry that order into the control-plane design, delta specification, execution
profile and ordered implementation slices together. In particular, replace the
earlier contract that waited for all cloud acceptance before shared source
publication. Keep the exact candidate's automated evidence mandatory before
publication and its manual evidence mandatory before production. Include
scheduled sweeps, scenario-to-report coverage, served-revision verification and
visible failure/staleness in the resulting acceptance scenarios.

Sources: [delivery plan](../../../openspec/changes/twilight-control-plane/tasks.md),
[installation operating model](../../../docs/twilight-structure/discovery.md#installation-operating-model),
[client repository contract](../../../docs/twilight-structure/client-repositories.md).
