## Context

The JSON export (`project.controller.ts`, `/:id/export?format=json`) answers
`{ project, ...tree }` where `tree` is `WorkItemService.tree()`: labelled rows
with derived numbers and schedule, `steps`, `slices`, `assignedPeople`. Labels
are ids into a deployment-wide directory (`tag`, `person`, `service_team`,
`service`, `work_item_type`, `external_system`), each unique by trimmed name.
Duplicate already writes a whole subtree in one act through
`SubtreeStore.insertSubtree(copy: SubtreeCopy, stamp)`, with every id decided by
the caller. The batch route (`plan-commands.ts`) caps at
`MOST_COMMANDS_IN_A_BATCH = 200` and records one undo per batch.

## Goals / Non-Goals

**Goals:** one file that reads and restores; an import that is whole or
nothing; directory restored by name; every refusal names a path.

**Non-Goals:** replace, merge, undo, preview, derived-field restore, audit
stamp restore.

## Decisions

**The document is the existing export, grown.** New top-level keys only:
`document`, `settings`, `priorityBands`, `capacity`, `directory`. `settings`
duplicates some of `project` on purpose — `project` is the row as the API
reads it and stays for MCP; `settings` is the import's input and is the one the
import reads. Derived fields stay in the file and are ignored on import by
construction: the import's parser has no field for them.

**Import is its own route** — `docs/adr/0013`. `ImportService.import(document,
actorId)` runs under the write lock inside `TransactionRunner` (ADR 0007) in
this order: resolve directory names to ids, creating what is absent; create the
project (settings, steps, bands, capacity); mint ids for every row; build one
`SubtreeCopy` with rows, estimates, actuals, progress, measures, assignments,
dependencies; `insertSubtree`; write labels and external refs. Dependencies
last, as Duplicate does, because each references two rows.

**Validation is at the controller, by path.** A TypeBox schema for the
document, built from the same constants the export writes
(`ESTIMATE_METHODS`, `DEPENDENCY_REACHES`, `MEASURE_METRICS`, `PERSON_KINDS`,
`STEP_STATES`). Referential faults the schema cannot see — a `dependsOn`,
`stepId`, `parentId` or directory id no entry declares — are `unknown_ref`
with the JSON path, decided by the service before the transaction opens so a
refused document never takes the lock.

**Ids are refs.** The document's ids are the file's own vocabulary. A `Map<fileId,
newId>` per entity kind is built first; every reference goes through it and a
miss is `unknown_ref`. Re-importing beside the original therefore never
collides, and an export taken from a different deployment imports unchanged.

**The solution ref degrades visibly.** `projectStore.findBySolutionSlug` first;
taken means the project is created without the ref and the answer says
`solutionRef: 'left-off'`. Degradation with status in the return type, per R5.

**Answer shape.** `{ projectId, rows, created: { teams, people, tags, services,
types, externalSystems } (names), solutionRef: 'kept' | 'left-off' | 'none' }`.

**UI.** The `<details data-export>` summary reads `Export / Import`. `Import
JSON…` is a `<Button>` that clicks a hidden `<input type="file"
accept="application/json">`; the file is read as text, parsed, posted through
`ProjectApi.importPlan`. Success: the app's `onOpenProject` (the picker's own
path) then one info toast. Refusal: `refusalSentence` grown for `unknown_ref`
and `unsupported_version` carrying the path.

## Risks / Trade-offs

- **Lock hold time.** The import holds the write lock for its whole
  transaction. Duplicate of a large subtree already does; a task measures a
  500-row import and records the figure in `verify.md`.
- **Near-duplicate directory entries.** `dev` and `Dev` are two tags by the
  directory's own rule; an import follows the rule rather than inventing a
  looser one.
- **Version 1 forever.** Any later document change bumps `version`; this build
  refuses what it does not read rather than guessing.
- **`settings` beside `project`.** Two places say the method; the export's own
  test asserts they agree.
