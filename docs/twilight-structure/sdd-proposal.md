# Documentation and workflow integration

Current integration: [Twilight SDLC v1](sdlc-stages.md),
[knowledge ownership](knowledge.md), and the [delivery plan](../../openspec/changes/twilight-control-plane/tasks.md).
This path is retained for existing links; overlapping process and wiki prose has
been compacted into those canonical pages.

The user accepted OpenSpec as the home of testable requirements and a linked
DDD-oriented wiki for domain knowledge on 2026-09-06. The
[authority ADR](../adr/0014-openspec-contracts-and-linked-knowledge.md) records that
decision and alternatives. OpenSpec issue #780's bridge pattern informed skill
invocation within schema instructions; [source findings](sdd-sources.md) retain
version-specific observations.

The opt-in schema is `twilight-v1`; the default remains `sdd-lean` and historical
`sdd-plus-superpowers` remains available. One authored `tasks.md` owns the plan
until the tested WBS/Backlog bridge changes that ownership. No second Superpowers
plan or independently maintained stage graph is introduced. Runtime progress,
decisions and evidence remain distinct from CLI file existence, as demonstrated
by the [pilot](../../openspec/changes/twilight-sdlc-pilot/verify.md).
