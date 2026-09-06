---
status: proposed
---

# Planning commits are the transaction boundary

Backlog.md is the user's chosen per-client WBS planning backend, but WBS already
promises all-or-none batches and conflict-aware undo. We propose publishing an
immutable planning Git tree with a compare-and-swap of its accepted ref, through
one authorized broker. Ordinary multi-file writes with watchers can expose half
a plan; retaining SQLite as the authoritative model would contradict the chosen
storage direction. The cost is an explicit importer for outside edits, a WBS
extension format, and Git write/recovery work that must pass the storage spike
before the decision is accepted.
