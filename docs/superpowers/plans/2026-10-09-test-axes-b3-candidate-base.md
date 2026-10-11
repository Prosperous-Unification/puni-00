# B3 candidate and base scenario provenance

## Intent

The scenario allocator already proposes append-only journal edits, but the production Burokrat verdict has no trusted predecessor to compare. Add a specifications-family rule that reads the selected candidate and an independently pinned base, then rejects journal rewrites, missing identifiers and invalid provenance. This note records the implementation boundary; it does not certify the current pilot.

## Authority and identity

The caller pins a full Git commit SHA in configuration outside the candidate. A committed candidate never chooses its own first parent as the baseline. Staged and working candidates keep their existing `base` selection, and the rule must verify the pinned authority against that selection. Resolve the pinned SHA as a commit, require the permitted ancestor relation, and fail evaluation if it is absent, unreadable or unrelated. A repository's first journal adoption needs an explicit reviewed bootstrap record; an absent base journal is never interpreted as an empty journal.

The rule reads journal blobs from immutable `CandidateSnapshot` entries with `readCandidateBlob`, not from working paths. It decodes UTF-8, JSON and journal schema strictly. The base event array must be an exact prefix of the candidate event array. The evidence identity binds the resolved base SHA and base journal digest alongside the candidate snapshot, candidate journal digest and policy identity, so changing the base cannot reuse a prior verdict. The external RulePolicy schema and its complete rule-mode list must name and validate the new authority input before evaluation.

## Canonical specifications

Enumerate candidate entries under active `openspec/specs/<capability>/spec.md` and `openspec/changes/<change>/specs/<capability>/spec.md`. Exclude archived change copies and treat a synced duplicate as one lineage. Validate every adopted scenario heading against the derived journal index and report the outstanding unidentified legacy headings as adoption debt. The existing `scenario` proposal CLI remains a local editor aid; it cannot certify a candidate because it reads working files.

## Production proof order

1. Add a registered specifications rule and exact policy input, then verify that missing, malformed, unreadable and in-candidate policy authority fail closed through `check`.
2. Select candidate and pinned base, prove absent/unrelated/newer base commits fail through the production CLI, and watch each guard's negative fail when disabled.
3. Read both journal blobs and prove missing/malformed base or candidate, event deletion/rewrite, and bootstrap without review fail. A valid append must pass.
4. Select active canonical specs and prove archived copies do not create extra obligations, duplicate or unallocated IDs fail, and identified migration debt remains visible.
5. Bind the resolved base SHA and both journal digests in verdict evidence, then prove changing only the pinned base invalidates the old evidence identity.

The rule's `not-evaluated` outcome is disallowed regardless of observe/ratchet/enforce mode. Updating the registry requires a mode for the new rule in every external policy fixture and the tracked repository policy. Task 2.2 remains open until these production proofs, the citation-removal table and a clean pilot API target are observed.
