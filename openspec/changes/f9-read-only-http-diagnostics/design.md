## Context

The full checker performs database writes, worktree edits and restart probes. Its first web fetch lacked both a deadline and useful first-failure evidence. The historical restored failure remains unexplained.

## Goals / Non-Goals

Capture the first response safely and observe later HTTP availability independently. Container identity, process attribution, remote sampling and lab lifecycle orchestration are deferred to separate slices.

## Decisions

`observeWeb` owns exactly one GET to the supplied loopback origin's root, follows no redirect and enforces one deadline across headers and body. Status and content type are nullable evidence when no response was received. The root marker is inspected within 64KiB; response content is never returned. Network refusal, deadline, response mismatch and body limit are typed failures. Invalid origins or bounds throw before fetching.

`observeConvergence` owns a fixed elapsed window including its immediate observation. Later requests receive the remaining time budget, and pauses cannot extend the window intentionally. Its initial verdict is independent of all later samples. The CLI always prints this report and exits according to the initial verdict. It has no process, Kubernetes, Docker, database, filesystem write or policy capabilities.

Root-marker evidence is updated on each decoded chunk, including only the prefix within the 64KiB cap. A received marker survives later failure. Transport, deadline and body-limit failures use a web-observation message distinct from the completed-response failure prefix consumed by the recovery coordinator. They cannot prove ingress denial.

The full checker uses only `observeWeb` for its existing first web assertion. Its subsequent mutations and checks are unchanged. The separate convergence command must be invoked explicitly; it never calls the full checker.

## Risks / Trade-offs

Timer scheduling has operating-system jitter and is not a real-time guarantee. The 64KiB cap can reject unusually large valid HTML, visibly as `body-limit`. Content type is retained as evidence; acceptance preserves the existing status/root-marker contract. HTTP evidence cannot identify the Vite process or establish the cause of historical failures. No live acceptance is inferred from fixture success.

## Migration Plan

Additive CLI and richer failure output; no state migration. Keep disabled recovery provisioning disabled.

## Open Questions

Cold process identity and a remotely enforced sampler deadline remain outstanding before broader diagnostics can be considered complete.
