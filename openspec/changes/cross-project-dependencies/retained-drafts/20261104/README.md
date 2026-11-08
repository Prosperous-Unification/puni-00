# Retained historical drafts — 2026-11-04

These patches preserve the exact outstanding working changes from five earlier
worktrees in this session. They are **unapplied historical drafts**, not additional
qualified implementation or a request to adopt their architecture.

`manifest.json` records each branch, exact base commit, patch SHA-256, every file
SHA-256 and whether that file already occurs byte-for-byte in the integrated
checkpoint. Each patch passed a reverse apply check against its unchanged original
working tree. Tracked and untracked files are included; original worktrees and
indexes were preserved.

To inspect a draft, use a separate worktree at its recorded base commit, verify the
patch hash and run `git apply --check` before applying it. No runtime or native
checks were run for these archived drafts. Current delivery work remains described
by the cross-project dependencies specification and its verification records.

`branches.json` inventories 108 related local branch heads. Most are ancestors of
the integrated checkpoint or contain only patch-equivalent non-merge commits. Four
additional historical commit patch shapes are retained alongside the five working
snapshots; patch shape differences alone do not prove semantic work is missing.

Unified diff context uses leading spaces on otherwise blank lines. Those patch
bytes are deliberately retained, so whitespace checks exclude the patch artifacts;
source and document whitespace is checked normally.
