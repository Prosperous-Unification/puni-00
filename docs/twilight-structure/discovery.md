# Twilight discovery

The current [requirements](spec.md) define the requested product. The
[working assumptions](assumptions.md) hold provisional answers, their owner and
reopen conditions. The [delivery plan](../../openspec/changes/twilight-control-plane/tasks.md)
is the only authored implementation plan.

## Discovery method

Combine brainstorming, grilling and domain modeling in one discovery pass. Resolve
facts from the repository and primary sources. Use the user's existing authority;
when assumptions are authorized, record them and proceed. Ask only for decisions
that remain outside that authority. An assumption never grants spending or release
permission. Terms enter the owning glossary as they resolve.

Frame work around independently accepted outcomes and fixed quality. Identify real
dependencies, shared contracts, constrained resources and the human decisions that
cannot be delegated. The approved execution envelope bounds subsequent scheduling
choices. Test whether additional capacity reduces accepted delivery time rather
than merely increasing active sessions.

## Canonical decisions

- OpenSpec owns testable behavior; the wiki explains it with source links. The
  boundary lives in [knowledge maintenance](knowledge.md#requirements-and-the-wiki-the-boundary).
- The [execution profile](../../openspec/schemas/twilight-v1/execution.yaml) owns
  scoped stage ordering, defaults and scaling acceptance budgets. Skills contribute
  through the schema's instructions; they do not create another workflow graph.
- [Client repositories](client-repositories.md) owns Backlog/WBS planning authority
  and the refactor prerequisite for its migration.
- The [control-plane spec](../../openspec/changes/twilight-control-plane/specs/twilight/control-plane/spec.md)
  owns execution envelopes, candidate evidence, independent acceptance and release.

Update these owning documents in place when a decision changes. Keep historical
receipts under evidence separate from current instructions; Git retains editing
history. Current checks and unrun runtime experiments are recorded in
[verification](../../openspec/changes/twilight-control-plane/verify.md).

## Installation operating model

Accepted in the infrastructure interview on 2026-09-06: client installations use
client-owned infrastructure, with Dany responsible for operation and recovery
under an explicit maintenance agreement. Support access is revocable and support
hours must be defined before offering the service; no hours or recovery targets
have been selected yet. Dany is the main user of the first iteration.

This establishes ownership and responsibility. Recovery targets remain an
interview decision. The proposed Terragrunt-based cloud infrastructure tool is a
later scope.

Existing hosts reported by Dany in the same interview: `h3mon` provides monitoring;
`h4claw` provides OpenClaw and serves as the deployment server for applications.
Their live configuration, capacity, and application availability requirements have
not been inspected. These facts establish the starting inventory; the placement
decision below remains conditional on Task 6's host preflight.

Accepted in the same interview: K3s schedules the expandable worker pool. The M1
plan proves one dedicated, unscheduled K3s server and two K3s agent nodes, with
manual node join and drain. `h3mon` remains the external monitoring host;
`h4claw` carries OpenClaw, Twilight's user-facing control services and application
deployment, and runs no untrusted worker activity. Direct Kubernetes Jobs are the
first provisioner; OpenSandbox is a measured follow-on candidate. ADR 0016 records
the choice and alternatives, and the
[worker-pool research](research/worker-pools.md) records upstream evidence.
