# Define branch dev environments and staging before merge

Parent: [Structure Twilight for personal use and future customers](../map.md)

Labels: wayfinder:grilling

Type: grilling

Mode: HITL

Status: resolved

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

The recommendation put to Dany was to test the feature branch composed with current main, merge
the exact tested candidate, and promote the same built artifact toward production.
He accepted it; the resolution follows. Staging concurrency, environment lifetime defaults,
sweep cadence and the detailed parity contract have not been selected.

Sources: [requirements](../../../docs/twilight-structure/spec.md),
[previous quality decision](04-personal-delivery-controls.md),
[integration contract](../../../openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md#requirement-integration-is-an-independently-scalable-execution-service),
[release design](../../../openspec/changes/twilight-control-plane/design.md#environments-publication-and-release).

## Answer

2026-09-08 — Dany accepted testing the feature branch composed with current main,
merging that exact tested candidate, and promoting the same built artifact toward
production.

Branch devs expose frequent updates independently, including on long-running
branches. Staging runs the composed candidate through automated and manual
cloud-browser acceptance in a production-like environment. Passing evidence binds
that candidate and artifact. If main advances before publication, recompose,
rebuild and retest before merging; an earlier candidate's pass is not transferable.
Dev-main tracks the accepted main revision. Production uses the staging-tested
artifact after the existing explicit human command, with environment-specific
configuration and observed health/recovery recorded separately.

The implementation plan now carries provisional defaults from A57–A60: one
serialized staging environment, one branch dev per active branch within capacity,
explicit branch-dev sleep/resume, nightly dev sweeps, and an explicit staging
parity contract. The defaults can change at their recorded revisit conditions;
this resolution claims no deployed system.
