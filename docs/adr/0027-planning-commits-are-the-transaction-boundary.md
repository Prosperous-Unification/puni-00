# Planning commits are the transaction boundary

**Status:** proposed, 2026-09-06. The spike named at the end accepts it or
overturns it.

A plan edit is published as an immutable Git tree on a per-repository planning
ref, and that ref is advanced by one authorized broker with a compare-and-swap
against the current accepted ref. The commit is the transaction boundary: readers
see a whole accepted tree. Exact commands require the requested basis; commands
explicitly authorizing disjoint reconciliation may retry against a changed ref
only when broker-derived semantic read/write preconditions still hold. The
[transaction protocol](../twilight-structure/client-repositories.md#proposed-transaction-protocol)
owns retry bounds, receipt identity and conflict behavior.

Backlog.md is the user's chosen per-client WBS planning backend, and WBS already
promises all-or-none batches and conflict-aware undo. Something has to keep those
promises once the plan is a directory of Markdown files.

## Rejected: repository-wide conflicts for every command

Requiring a new client decision for every disjoint edit makes unrelated agents
compete on one planning revision. Semantic preconditions retain a single atomic
publication point while allowing expressly authorized disjoint operations to
reconcile. Cross-plan predicates and native imports without precise semantics stay
conservative; independent file paths alone never prove independence.

## Rejected: ordinary multi-file writes with locks and watchers

Backlog's own writer takes per-task locks and writes files one at a time. A
crash, a full disk, or a watcher firing between the second and third write
exposes half a plan, and a lock taken in one checkout says nothing about another
clone. Local lock success cannot mean global acceptance.

## Rejected: keeping SQLite as the authoritative planning model

This preserves every existing WBS guarantee for free, which is exactly why it was
tempting. It was rejected because it leaves an undisclosed write authority behind
the Backlog files — the thing "Backlog instead of SQLite" was asked to remove.

## The spike that can overturn it

Task 9's storage spike runs the `storage-acceptance/default` profile in
[client repositories](../twilight-structure/client-repositories.md#storage-workload-acceptance-budget)
against the real broker and remote. If a budget fails and no improvement within
this authority model reaches it, this decision is revised before cutover rather
than shipped — and never by reinstating SQLite as plan authority.

The accepted cost, if it holds: an explicit importer for outside edits, a
versioned WBS extension format, and Git write and recovery work.
