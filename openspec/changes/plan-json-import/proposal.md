# Plan JSON import

## Why

A plan lives in one deployment's SQLite file: no way to carry it elsewhere, keep
a copy outside the tool, or bring it back after it was wrecked. The JSON export
exists, but nothing reads it, and it names labels by id alone. Dany asked on
2026-09-02: Export becomes Export / Import, and the JSON carries every project
parameter.

## What Changes

**The JSON export becomes a plan document**

- From: project row plus tree, ids only for labels, reachable by MCP alone.
- To: the same payload grown additively with a document header (format,
  version, exported-at), the project's settings, step order, priority bands,
  team capacity, and a directory section naming every team, person, tag,
  service, work item type and external system a row references.
  `Download JSON` joins the toolbar menu.
- Impact: non-breaking; every field MCP reads stays.

**A plan document imports as a new project**

- `Import JSON…` in the same menu picks a file. `POST /api/projects/import`
  creates a project owned by the importer with the file's settings, steps,
  bands, capacity and every row with everything typed on it, in one
  transaction. A refusal writes nothing.
- Directory entries match by trimmed name; absent ones are created and listed
  in the answer.
- The solution ref is kept when its slug is free, left off and reported when
  taken.
- Success opens the new project under one info toast summarising the import; a
  refusal is an error toast naming the row and reason.

## Non-Goals

- No replace or merge into an existing project. No undo of an import.
- No preview or per-entry choice before commit.
- Derived fields are exported and ignored on import, never restored.
- No CSV or Markdown import. No import from the project picker.
- Audit stamps are not restored; the import is the write.

## Constraints

- Additive on `?format=json`: the MCP tools read it.
- A batch is the wrong vehicle: 200-command cap, one-undo journal (ADR 0013).
  One transaction over the stores' own (ADR 0007), behind the write lock.
- Directory names are unique after trimming, case-sensitive.
- Fresh ids for everything; the file's ids are refs within the file.

## Capabilities

### New Capabilities

- `plan-import`: a plan document creates a new project, whole or not at all.

### Modified Capabilities

- `wbs-domain`: the plan export includes JSON, and that JSON is the plan document.

## Domain Terms

Plan document, Import, Plan export (widened).

## Decisions Recorded

- `docs/adr/0013-an-import-is-its-own-route-not-a-command-batch.md`

## Impact

be-01, fe-01, `openapi.json` (mcp-01 derives the import tool). No migration.
