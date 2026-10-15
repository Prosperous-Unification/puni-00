# Import results and clipboard refusals in the app's words, after the UI review

## Why

The round-4 flow probes of the UI review (2026-10-15, puni-plan
`ui-review/findings.md`) found the Export / Import menu speaking developer
wording. A broken file read `Plan JSON import failed (invalid_json).`, and that
error stayed on screen above the next, successful import (F-073). A success read
`Imported 19 work items. Created no directory names. Solution reference: none.`
and kept the source's name, so the home list showed two identical "Review
fixture" entries (F-074). A refused clipboard on Copy as Markdown advised
downloading the CSV, which holds neither the Markdown nor the chart (F-075).

## What Changes

- Every import refusal the route can return, and every failure the app itself
  names (not JSON, unreadable file, project missing after import), has a
  sentence in the app's words. A refusal that points into the file keeps its
  path there. Anything unworded falls back to `The plan could not be imported.
Try again.`, which names no code.
- JSON that does not say it is a `wbs-plan` export is refused as `This JSON is
not a plan export.` before any schema detail.
- Each import attempt takes the previous attempt's error toast off.
- An import whose name a project in the account's list already uses is created
  as `<name> (imported 15 Oct)`, then `(imported 15 Oct, 2)` and on. The new
  project still opens when the reader is still where they imported from, and
  the success toast names it: `Imported “<name>” with 19 work items.` Added
  directory names and the solution link are mentioned only when they happened.
- A refused or absent clipboard on Copy as Markdown or Copy as Mermaid points at
  Download as Markdown, which saves the table and the chart together.

## Non-goals

- No naming rule in be-01: an API or MCP import still creates the file's own
  name. The rule lives where the duplicate is seen, the app's list.
- No Open action in toasts: the import already opens the new project; a reader
  who moved to another project mid-import finds it by name in the picker.

## Impact

`apps/wbs/fe-01` only: `components/wbs/{plan-import-words,use-plan-import,project-page,plan-export-actions,import-with-ai-help}`,
`lib/wbs-api.ts` (`planDocumentRequestFromJson` header check). Tests:
`plan-import-words.test.ts`, `project-page.test.tsx`, `plan-toolbar.test.tsx`,
`e2e/plan-import.spec.ts`.
