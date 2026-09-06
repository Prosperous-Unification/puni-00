# Local workflow observations retained from discovery

Source: the pre-pilot `sdd-proposal.md`, read on 2026-09-06 before compaction.
These are the earlier session's recorded probes, **not freshly rerun** by this
trial. They remain compatibility risks until the named implementation tests settle
them. The original files were uncommitted, so Git history alone would not preserve
this evidence after rewriting the proposal.

- Installed Superpowers 6.3.0 `task-brief` reportedly exited 3 on the existing
  `add-button-toggles/tasks.md`: it expected `Task N` headings, which that OpenSpec
  task document did not use. The pilot schema now uses that heading shape, but
  matching headings alone does not establish a compatible extractor. Product
  Task 2 must test full IDs, dependency/proof fields and tracked task counts.
- Two changes with separate `tasks.md` files in one worktree reportedly mapped to
  the same `.superpowers/sdd/tasks` directory. A mismatch detector may reject a
  collision, but does not provide isolated run identity. Product Task 2 must prove
  repository/change/task identity and independent brief/ledger paths.
- The active `sdd-lean` instructions resolve all terms into root `CONTEXT.md`.
  The monorepo has a context map now. `twilight-v1` explicitly selects the owning
  glossary; the default schema was left intact to preserve existing work.
- The earlier installed subagent workflow prohibited parallel implementers in one
  execution loop. Its isolated-execution/review technique remains useful; the
  factory's configurable parallelism must be an explicit orchestration adapter
  with distinct ownership and runtime resource isolation, not an implied change
  to that skill's contract.

Current [trial evidence](../../../openspec/changes/twilight-sdlc-pilot/verify.md)
states what was actually rerun. [Product Task 2](../../../openspec/changes/twilight-control-plane/tasks.md)
owns the missing extraction/portability checks. No claim above authorizes replacing
the current task plan with an untested helper or marking a provider run verified.
