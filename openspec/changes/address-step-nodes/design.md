# Design — address step nodes

Source memo: `puni-plan/wbs-feedback-2026-09-26/step-nodes/design.md` (Astra, 2026-09-27). Decision: `docs/adr/0031-a-step-node-is-a-pair-not-a-work-item.md`.

## Identity

`StepNodeRef = { workItemId, stepId }` is the domain value. Its wire ID is `sn1.<workItemId>.<stepId>`; both parts are UUIDs, so the dot separator is unambiguous, and the `sn1` prefix lets a later encoding coexist. Parse at the HTTP/MCP boundary once: an unknown prefix, wrong arity, unknown work item or step, a parent work item or a cross-project pair is a modeled 4xx. No `step_node` table: existence is computed from leafhood and the project step list, so a node with no facts still exists. Authority is checked on the project, exactly as for the pair.

## Step codes and storage

Additive migration: `ALTER TABLE step ADD COLUMN code TEXT` (nullable, so the lint's NOT NULL-without-DEFAULT rule is respected) and a partial unique index on `(project_id, code) WHERE code IS NOT NULL`. `down.sql` drops the index and the column. Old binaries ignore the column; an old writer's new step has `code IS NULL`.

Codes are derived in TypeScript, not SQL: lowercase the name, collapse every run of characters outside `[a-z0-9]` to `-`, trim hyphens, prefix `step-` when the result does not start with a letter or starts like the reserved alias (`^s[0-9]`, broader than the reserved `^s[0-9]+(-|$)` so that no cut or suffix can land a candidate in it), and on collision add `-2`, `-3`… in step order, truncating the stem so stem plus suffix stays within 32 characters. One function (`suggestStepCode`) serves creation, legacy import and backfill.

Backfill is a CLI beside the migration CLIs (`backfill-step-codes-cli.ts`), run by the swap after the old colour is drained, and idempotent: it codes only `code IS NULL` rows. Until then the store reads a null code as the modeled `uncoded` state, which the contract carries as a visible union member rather than an optional string. A failed backfill fails the swap loudly with its manual command; it does not leave the swap reporting success.

## References

`resolveStepReference({ projectId, revision, reference })` parses `^(<number>)\.(?:s(\d+)-)?([a-z][a-z0-9-]*)$`, where `<number>` is the existing work-item number grammar. The longest work-item number that exists wins only if its remainder is a valid step code; because codes cannot contain dots, the split is unique. A revision other than the project's current one is refused as stale; this keeps resolution from silently following renumbering. The resolver returns `StepNodeRef` plus the canonical spelling.

## Graph seam

`slice-edges.ts` gains `resolveStepNodeGraph` returning nodes (step node refs or work-item boundaries) and edges `{ predecessor, successor, type: 'FS', provenance: 'workflow' | 'legacy' }`. Today's internal order edges become `workflow`; `depReach` expansion becomes `legacy`. Existing callers adapt to it without changing results; the golden corpora and request hashes are the regression oracle. `add-step-finish-start-dependencies` adds `authored` provenance.

## Lifecycle

First-child creation already moves estimates, actuals, progress and measures to the new child (`work-item.resource.ts` create) and journals them, but journals `assignments: []` and does not move assignments. This change moves assignments too, journals them, and returns the one-to-one `StepNodeRef` mapping, which the journal records so undo restores the original IDs. Deleting a parent's last child keeps today's fold of totals onto the parent (`remove`); that is an aggregation, not a node mapping, and carries no identity. Moves keep a leaf's node IDs. Concrete dependency endpoints do not exist yet; the dependency change remaps them through the hand-down mapping and specifies deletion.

## UI

The step cell detail shows `010.dev · Dev` with Copy reference and Copy link; the link carries the step node ID and opens the row with that cell focused. Uncoded nodes show “Uncoded step” with the link action only.
