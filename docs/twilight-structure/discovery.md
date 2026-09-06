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
