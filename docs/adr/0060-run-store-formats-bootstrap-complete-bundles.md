---
status: accepted
---

# RunStore formats bootstrap complete named migration bundles

Durable runtime history adds persisted state to the unreleased RunStore format. Preserve
the pinned0001 forward/down bytes and append named additive migrations; bootstrap only
the complete current format and reject older formats without changing them. A versioned
digest covers every ordered name/forward/down hash, and physical validation derives the
whole schema even for empty stores. Existing portable shapes keep their own versions;
a changed shape needs an explicit new version.

## Considered options

Rewriting0001 is simpler but discards its reviewed identity and invalidates retained
branch stores without preserving that boundary. A general legacy upgrader adds inspection,
partial-application and rollback semantics without an inventoried release requirement.
Appending migrations with explicit complete-format bootstrap retains provenance while
keeping open free of implicit repair. Main has not contained this subtree and the
foundation remains a draft; external branch-created stores were not inventoried.

## Consequences

Schema2 preserves0001 and adds0002-runtime-authority. Opening format1 is incompatible,
never a signal to create/reset/upgrade it. A future supported transition needs its own
intent, retained-store evidence and rollback proofs. A required format marker pins the
complete bundle and runtime counts. Unused down restores the original declarations;
used or inconsistent runtime history refuses removal. No automatic migration/rollback
CLI or rolling-upgrade compatibility is claimed.

Contract: [runtime authority history](../../openspec/changes/twilight-agentic-workflows/runtime-authority-design.md).
