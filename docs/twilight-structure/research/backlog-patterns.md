# Backlog.md as the client repository's planning store

Researched 2026-09-06. Primary documentation and source inspection; no
Backlog.md installation, provider session, migration, or runtime test was run.

The user's direction is a requirement: each client gets an Nx monorepo similar
to `puni-00`, and its software is developed there. WBS supplies the planning UI;
Backlog.md hosted for that client repository replaces SQLite as its planning
store. `puni-00` must use the same evolving template and delivery workflow.
Implementation planning starts after the single gate in
[Cutover after the refactors land](../client-repositories.md#cutover-after-the-refactors-land).

This rules out a design that leaves the authoritative plan in SQLite and merely
exports tasks to Backlog.md. The remaining work is to specify a complete file
contract and its write boundary. Storage substitution does not, by itself,
authorize losing existing WBS behavior.

## Evidence and version boundary

The source project is [MrLesk/Backlog.md](https://github.com/MrLesk/Backlog.md),
whose package is `backlog.md` and executable is `backlog`. It is MIT licensed.
The official release page identifies **v1.51.0**, released 2026-09-02, at commit
`9a9fe22`; the inspected main-branch package manifest also says `1.51.0`.
[Release](https://github.com/MrLesk/Backlog.md/releases/tag/v1.51.0),
[package manifest](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/package.json).

The source links below are to `main`, not an immutable release checkout.
The web reader returned pages with different cache ages; tag-specific source
fetches failed, and `git ls-remote` failed because the shell could not resolve
`github.com`. Therefore these findings identify integration constraints, not
binary conformance to v1.51.0. Pin a release and source commit when implementation
starts, then run the proposed contract tests against that exact artifact.

## Verified integration surfaces

| Surface         | What upstream supplies                                                                                                                                                                                                                                                                         | Consequence for Twilight                                                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files           | One Markdown file per task in the repository; folder choice includes `backlog/`, `.backlog/`, or a configured project-relative directory.                                                                                                                                                      | The client repository can carry the authoritative planning record beside its code. [README](https://github.com/MrLesk/Backlog.md#readme)                                                                                                                                                        |
| CLI             | Task creation/editing, hierarchy, dependencies, archive, documents, milestones, search and board operations. `task list`, `task view` and `search` offer noninteractive JSON with `schemaVersion: 1`; mutation JSON is not established by this read contract.                                  | Use the versioned read envelopes where suitable; verify each mutation's acknowledgment separately. [CLI reference](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/CLI-INSTRUCTIONS.md)                                                                                                |
| MCP             | Registered task tools are `task_create`, `task_list`, `task_search`, `task_edit`, `task_view`, `task_archive`, and `task_complete`. Other registrations cover milestones, documents, DoD defaults and workflow resources.                                                                      | Useful agent access to native task fields; these are not WBS command batches. [Task registration](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/src/mcp/tools/tasks/index.ts), [MCP implementation](https://github.com/MrLesk/Backlog.md/tree/main/src/mcp)                          |
| MCP transport   | The actual server connects `StdioServerTransport`. Workspace roots can retarget it; `--cwd` or `BACKLOG_CWD` pins the root.                                                                                                                                                                    | Pin factory sessions to their authorized client checkout. Do not infer an HTTP server from the `mcp.http` configuration type. [Server implementation](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/src/mcp/server.ts)                                                               |
| Browser backend | `BacklogServer` uses Bun HTTP routes, a watched content store and WebSockets. Routes include task CRUD, reorder, multi-task status moves, documents and milestones. It binds `127.0.0.1`; notifications tell views to refresh. No authentication check was found in the inspected server file. | Hosting it for a client needs an authenticated service boundary. These internal HTTP routes and refresh notifications do not establish WBS authorization, presence, replay or API compatibility. [Browser server](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/src/server/index.ts) |
| In-process core | CLI, MCP and browser share Core behavior. The package manifest publishes launchers and platform binaries, not a documented application-library export.                                                                                                                                         | Reusing source is possible under its license; importing internal Core as a stable package API is unverified. [MCP architecture](https://github.com/MrLesk/Backlog.md/tree/main/src/mcp), [manifest](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/package.json)                      |

The existing WBS MCP contract is materially stronger: browser and MCP mutations
reach the same authenticated backend; ordered plan commands apply all or none,
resolve intra-batch refs, and produce one personal undo entry. Preserve that
contract through the new adapter unless a later specification explicitly changes
it. [Current WBS MCP](../../../apps/mcp-01/README.md).

## File model, identity and scope

The default tree has `tasks/`, `drafts/`, `completed/`, `archive/tasks/`,
`archive/drafts/`, `milestones/`, `archive/milestones/`, `docs/`, and
`decisions/`. Configuration can live at the root as `backlog.config.yml` or
inside a built-in backlog directory. Completion and archive are distinct file
locations. [Directory constants](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/src/constants/index.ts).

Task Markdown has YAML frontmatter plus structured body sections. The typed
model includes title, status, assignees, reporter, dates, labels, milestone,
dependencies, references, documentation links, modified files, parent, subtasks,
priority, type, project and ordinal. Body fields include description,
implementation plan/notes, comments, final summary, acceptance criteria and DoD.
There is no generic custom-field map in `Task`, `TaskCreateInput` or
`TaskUpdateInput`; notably, the inspected update input has no parent-change
field. [Task types](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/src/types/index.ts).

The serializer constructs frontmatter from its named fields and edits body
sections from `rawContent`. It does not spread unknown frontmatter through the
write. Consequently an ad hoc `wbs:` YAML field is not a demonstrated extension
contract: a native edit can erase it. Preserving unrelated prose is a different
claim from preserving arbitrary metadata, formatting, or byte identity.
[Serializer](https://github.com/MrLesk/Backlog.md/blob/main/src/markdown/serializer.ts).

Tasks use a configurable prefix and numeric sequence; creation under a parent
allocates a dotted suffix such as `TASK-5.3`. Filenames use lowercase IDs and a
title-derived name. These IDs represent Backlog task identity, not a WBS number
derived from sibling position. [ID generation](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/src/utils/prefix-config.ts).

The `projects` configuration enables a single project/component value on each
task; it has no default. It does not describe separate WBS projects with their
own settings, directories, authorization and schedules. Backlog configuration
defaults enable remote operations and active-branch checking, while automatic
commits and hook bypass are disabled. Disabling remote operations stops fetches
but still permits local branch reads. [Configuration](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/ADVANCED-CONFIG.md).

**Identity requirement:** the repository-scoped identity and the durable UUID map
that this forces are specified in
[the client repository model](../client-repositories.md). One question stays
open here: whether Backlog's `project` names an Nx project, a WBS project, or a
service. Those concepts must not be equated by their shared spelling.
[Existing WBS terms](../../../CONTEXT.md).

## Concurrency and Git semantics

The inspected filesystem implementation uses `proper-lockfile`: creation locks
live under the Git common directory when available, sharing allocation across
worktrees. Per-task locks live under the checkout's backlog and fail immediately
on contention. Multi-task locking acquires the whole sorted lock set first.
`USE_GLOBAL_TASK_ID_LOCK=false` bypasses these protections. `saveTask` ultimately
uses `Bun.write`; no multi-file commit protocol is established there. Some read
paths catch filesystem/parse failures and return null, empty lists, or omit a
file. [Filesystem operations](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/src/file-system/operations.ts).

Core re-reads a task inside its edit lock. Bulk writes iterate over files;
multi-task status moves intentionally report failures per task. Board reorder
uses status-column order and optional milestone, not WBS sibling positions.
ID allocation excludes archived tasks, explicitly allowing reuse. Status-change
callbacks log failures without refusing the status change.
[Core mutation paths](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/src/core/backlog.ts).

These facts imply separate obligations:

- Independent clones with separate lock paths do not coordinate. Linked
  worktrees share repository metadata; cloning creates another repository.
  Define one authoritative planning checkout per client, or specify a tested
  merge and conflict protocol before allowing several authoritative writers.
  [Git worktrees](https://git-scm.com/docs/git-worktree),
  [Git clone](https://git-scm.com/docs/git-clone).
- The lock library supports a shared network filesystem, but that is a
  different deployment contract: every participant must address the same lock
  and agree on stale/update settings. Its documented undetected cases include
  manual lock removal and mismatched timing settings. Test host failure and
  stale-lock recovery if adopting shared storage.
  [Lock implementation contract](https://github.com/moxystudio/node-proper-lockfile).
- Serializing a write does not detect a person submitting a stale edit after
  the first writer has finished. Compare a revision/content precondition and
  return a conflict; define safe disjoint-field edits explicitly.
- Acquiring all locks prevents a contention failure after an earlier write,
  but does not make disk-full, process-death or later-file failures atomic.
  Publication and recovery must prevent readers observing half a WBS batch.
- A direct editor or Git operation need not participate in a library lock.
  Native CLI/MCP/Web writers and human file edits must have a defined admission
  path, and external edits must invalidate stale revisions before the next
  authoritative command.
- Strictly validate the complete expected corpus at the adapter boundary.
  An unreadable task cannot become a deleted row, a satisfied dependency or an
  empty plan. This is a compatibility requirement with this repository's R5,
  not an assumption that upstream already follows it.
- A task status callback cannot certify workflow completion, deploy success,
  or a human production command. Those transitions need acknowledged evidence
  in the factory's workflow contract.

Git supplies reviewable file changes, but choosing what the planner reads is a
separate contract. Current CLI/MCP task detail describes the checkout plus
completed tasks; the browser can use the configured cross-branch corpus.
Dependency edges point from the waiting task to its prerequisite. Upstream
readiness means unfinished work whose declared prerequisites resolve as
completed; it is not WBS resource eligibility.
[CLI graph and readiness contract](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/CLI-INSTRUCTIONS.md).

There is a primary-source discrepancy to resolve in the pinned-version tests:
v1.51.0 release highlights say archived dependencies resolve, while the CLI
reference says archive removes them from the visible corpus. The same release
also says archive/demotion removes references from other tasks. Do not promise
historical dependency retention from these descriptions alone.
[Release behavior](https://github.com/MrLesk/Backlog.md/releases/tag/v1.51.0),
[CLI visibility](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/CLI-INSTRUCTIONS.md).

## WBS compatibility obligations

This table is an analysis of the existing WBS contract against the inspected
Backlog surfaces. “Adapter” means behavior and repository metadata that must be
specified, not a second authoritative SQLite store. The WBS side is defined in
the [domain glossary](../../../CONTEXT.md), [capacity description](../../capacity.md),
and [command API explanation](../../../apps/mcp-01/README.md).

| WBS capability                    | Reusable part                                       | Required adapter contract                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name, notes, external links       | Native title, description and link collections      | Preserve WBS literal names, Markdown notes, ordered external-system refs and upstream execution sections independently.                                                                                            |
| Ordered tree                      | Native parent/subtask representation                | Reparenting, sibling position, promotion of children on single-row deletion, subtree deletion/duplication, frozen numbers and repadding. A status-column ordinal is not sufficient.                                |
| Estimates and metrics             | Markdown can carry structured records               | Per-leaf/per-step trios, project estimate method/weights/rounding, missing versus zero, token estimates, token facts and hours facts. Do not convert tokens to time implicitly.                                    |
| Schedule and dependencies         | Native direct prerequisite IDs                      | Preserve graph direction, parent-to-leaf expansion, dependency reach, ordered slices, not-before dates, calendars, assumed durations and refusal reasons.                                                          |
| Capacity and assignments          | Native assignee/label text offers visible summaries | Preserve directory identities, person kind, memberships, per-step assignments, inherited team sets, named-person leveling, per-project capacities and maximum parallelism. Assignee text is not account authority. |
| Priority and classifications      | Native priority/type/project fields                 | Preserve numeric priority and each project's ladder; preserve WBS sets and their different inheritance rules. Avoid collapsing several work-item types into one native type silently.                              |
| Batches and revisions             | Native individual mutations and local locks         | Ordered refs, validation against the whole proposed change, all-or-none visibility, monotonic revisions and retry deduplication.                                                                                   |
| Undo, history and snapshots       | Git changes are inspectable                         | Personal fifty-entry journal, compensating commands, stale-undo refusal, immutable plan history and saved-plan comparisons. Git revert alone does not implement these semantics.                                   |
| Live collaboration                | File watching and refresh notifications             | Presence lifecycle, event order, resume/replay, drafts, stale-tree rendering and conflict acknowledgment across browser, MCP and external edits.                                                                   |
| Ownership and restricted projects | Existing WBS authentication boundary                | Enforce client/repository/project scope for every read and write; repository write permission and process credentials cannot replace the caller's WBS identity.                                                    |

Capacity must retain stated, unstated and remembered states per project/team;
zero cannot stand for unstated. A named assignee forces slice width one but
still consumes that work's team pool. Run the existing scheduling cases through
the new store, including unequal step estimates and resource contention.
[Capacity contract](../../capacity.md).

## File contract and template direction

The six constraints this research inferred — native fields stay native, the WBS
extension is specified before it is written, the storage boundary sits behind WBS
commands, branch authority is explicit, durable planning is separate from
transient runtime state, and one template proves itself in `puni-00` first — are
all specified in [the client repository model](../client-repositories.md), which
owns the storage ownership table, the template contract and the transaction
protocol.

## Migration and failure-proof plan

The following are tests to write and execute after the closure in
[Cutover after the refactors land](../client-repositories.md#cutover-after-the-refactors-land).
**None has been run.** Record actual failure output in `verify.md`; add adjacent
`Proof:` comments only after observing each injected fault on its production
path. A direct parser test alone does not prove CLI, MCP, browser or hosted
adapter interoperability.

| Contract                        | Production-path test                                                                                                                                                                                                                                                                                                   | Fault that must make it fail                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Complete migration              | Export representative SQLite plans; migrate into a new repository location; reopen through WBS and native Backlog reads. Independently compare all typed fields, hierarchy and recomputed schedule. Inventory journal/history/saved-plan/ownership records separately: a plan document alone is not a database backup. | Omit a remembered capacity, frozen number, step metric or assignment; transpose a dependency. Fail before publishing the migrated plan.                                                    |
| Reversible cutover              | Stop/admit writes at a declared boundary, capture source identity and migration manifest, verify the destination, then switch once. Rehearse abort and repeat migration without duplication.                                                                                                                           | Crash after files are written but before cutover; rerun against a changed source. It must neither report success nor overwrite the changed source.                                         |
| Native round trip               | Seed WBS-only metadata and upstream body sections, edit title/status/comment with the pinned CLI, MCP and browser, then reopen WBS; reverse the direction too. Compare semantics and explicitly promised formatting.                                                                                                   | Run a serializer that drops the extension or replaces another section. Assert after the native write's acknowledgment, not against an unchanged in-memory view.                            |
| Durable identity                | Archive the highest task ID, create another task, restore/read old evidence, then promote a draft and rename/reparent a work item.                                                                                                                                                                                     | Reuse the Backlog ID as durable factory identity. Old history must never attach to the new task.                                                                                           |
| One-checkout concurrent writers | Hold a real write inside its critical section; issue a second CLI/MCP/browser write. Then submit an edit based on a stale browser revision after the first lock releases.                                                                                                                                              | Disable the lock, or omit revision comparison. Assert both conflict timing and final persisted content after reopening.                                                                    |
| Worktree and clone allocation   | Create simultaneously in sibling worktrees, then in independent clones; integrate both under the selected policy.                                                                                                                                                                                                      | Disable shared allocation or collision admission. Assert unique durable identities and explicit duplicate rejection; do not merely count process exit codes.                               |
| Atomic batches and recovery     | Submit create-parent/create-child/estimate/dependency as one WBS batch; kill the process or refuse the second file write while another reader polls; restart and inspect files, API and journal.                                                                                                                       | Publish before the full batch is durable, or skip rollback/recovery. No reader may accept a half-plan and no partial batch may acquire a success journal entry.                            |
| Strict filesystem boundary      | Read a known nonempty plan with a missing required directory, unreadable directory, unreadable task, malformed YAML, duplicate identity and Git conflict markers.                                                                                                                                                      | Replace boundary validation with tolerant list loading. Each fault must produce a visible failure, never an empty/shortened authoritative plan. Test absence and unreadability separately. |
| Branch-specific readiness       | Put a predecessor's completion only on another unmerged branch; query CLI, MCP and WBS against their declared scope. Include archive and demotion.                                                                                                                                                                     | Use a cross-branch winner without verifying authority. Assert the dependent is still blocked where its prerequisite is not accepted.                                                       |
| WBS behavior parity             | Drive moves, freeze, parent dependencies, per-step rounding, maximum parallelism and capacity through normal commands and the real browser.                                                                                                                                                                            | Treat ordinal as sibling position, round after summing, or treat an unstated capacity as zero. Compare independent fixtures and existing domain oracles.                                   |
| Undo and live edits             | Two accounts edit overlapping entities; one undoes. Drop a socket across a batch, reconnect, and verify replay/presence and unsaved inputs.                                                                                                                                                                            | Replace personal undo with latest Git revert, skip revision checks, or omit an event. Assert the peer edit survives and stale undo is visibly refused.                                     |
| Client and template isolation   | Host two repositories with the same task ID; switch agent workspaces, attempt a cross-client command, and apply a template upgrade to a customized client fixture.                                                                                                                                                     | Remove repository pinning/scope validation, accept a symlink escape, or overwrite client-owned configuration. Assert against both repositories' persisted state.                           |

Runtime behavior, browser acceptance, migration, concurrency, dependency failure
injection, and version-pinned binary conformance remain unverified. This note
does not initialize Backlog.md or alter the current SQLite-backed WBS.
