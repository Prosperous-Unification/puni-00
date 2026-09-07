# Define branch dev environments and staging before merge

Parent: [Structure Twilight for personal use and future customers](../map.md)

Labels: wayfinder:grilling

Type: grilling

Mode: HITL

Status: claimed

Assignee: Dany

Blocked by: 01, 04

## Question

How do branch devs, dev-main, staging and production carry a change through
development, final testing, merge and release, and which exact candidate is
tested and promoted?

## Comments

2026-09-08 — Dany requires multiple development environments for different
long-running feature branches, plus `dev-main` that continuously tracks main.
Dev environments may run development servers and be dynamic or short-lived.
Staging must resemble production in all practical respects and perform final
testing before the merge to main. These are personal-phase requirements.

This supersedes the earlier choice to let automated checks alone authorize each
main merge. Frequent commits and branch-dev updates keep ongoing work observable
while staging supplies the final pre-merge gate. Automated and manual test
reports, scheduled dev sweeps and the explicit production command remain required.

Pending confirmation: test the feature branch composed with current main, merge
the exact tested candidate, and promote the same built artifact toward production.
This is the recommended flow; the alternative put to Dany was testing the feature
branch alone before merging. Staging concurrency, environment lifetime defaults,
sweep cadence and the detailed parity contract have not been selected.

Sources: [requirements](../../../docs/twilight-structure/spec.md),
[previous quality decision](04-personal-delivery-controls.md),
[integration contract](../../../openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md#requirement-integration-is-an-independently-scalable-execution-service),
[release design](../../../openspec/changes/twilight-control-plane/design.md#release-and-operational-limits).
