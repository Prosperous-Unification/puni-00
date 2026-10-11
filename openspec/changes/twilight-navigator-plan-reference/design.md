## Context

WBS 080.20. Design authority: the batch-10 Navigator intent (Fable 5.1, 2026-10-11, veto lines
N1–N7) in the private planning repository. Dash's first slice
(`openspec/changes/dash-local-plan-facade`, `apps/twilight-structure/twilight-dash/cli`) is the
layout this change copies: a strict dispatcher in `src/cli.ts`, a three-line `src/entrypoint.ts`,
a product-local `eslint.product.mjs` with exact aliases, and tool-devsync registration.

## Goals / Non-Goals

Goals: the two record kinds in Burokrat's contracts; `twin plan-reference`; `twin
receipt-to-commands`. Non-goals are in proposal.md.

## Decisions

**Records live in Burokrat (N3).** `PlanReferenceRecord` and `ProgressReceiptRecord` are added to
`apps/twilight-structure/twilight-burokrat/cli/src/contracts/navigator-records.ts` and to `RecordKind` and
`decodeRecord`. Navigator imports them through one exact path alias,
`@twilight/burokrat-contracts`, allowed only in Navigator's product lint policy. Burokrat imports
nothing from Navigator.

**Canonical digest.** `contracts/canonical.ts` serializes JSON with object keys sorted by UTF-16
code unit, no whitespace, and `JSON.stringify` scalars; it refuses non-plain values (undefined,
functions, non-finite numbers). A record's digest is SHA-256 over the canonical bytes of the
record without its own digest field. `verifyDigest` recomputes and compares.

**Plan reference record.** `{ schemaVersion: '1', kind: 'plan-reference', planRef,
planDocumentVersion: 6, exportDigest, tasksDigest, taskCount, createdAt, referenceDigest }`.
`planRef` is the glossary tuple `{ repository, plan, change, planningCommit, sourceBaseCommit,
requirementsDigest }`. Two fields beyond the intent's list: `tasksDigest` binds the task export
so `receipt-to-commands` cannot pair a receipt with another plan's tasks, and
`referenceDigest` is the record's own digest. `createdAt` is the export's
`document.exportedAt`: Navigator reads no clock, so identical inputs give identical bytes.

**Identifiers.** `plan` and `taskId` are WBS identifiers (`/^[0-9A-Za-z][0-9A-Za-z._-]{0,127}$/`)
rather than Burokrat's `OpaqueId`, because WBS ids may begin with a digit. `repository` is the
manifest `repositoryId` or a normalized Git remote URL (N4), supplied by the caller as nonblank
text without whitespace; `change` is an OpenSpec change name (kebab case).

**Progress receipt record.** `{ schemaVersion: '1', kind: 'progress-receipt', planRef, entries,
receiptDigest }`; each entry `{ taskId, stepCode, status: 'in_progress'|'done', measures?:
{ token_actual?, hours_actual? }, observedAt, evidence }` where evidence is a repository-relative
path or `{ kind: 'external', authority }`. Entries are nonempty.

**Inputs.** The export is read as bytes, `exportDigest` is SHA-256 of those bytes, and the parsed
JSON passes `@wbs/contracts`' `planDocumentResponse` after its header names version 6. The
requirements file is any nonempty, valid UTF-8 file; `requirementsDigest` is SHA-256 of its
bytes. Missing (`ENOENT`), unreadable (other read errors) and malformed (bad JSON, bad UTF-8,
schema failure) are distinct refusals naming the path.

**Task export (N5).** `tasks.json`: `{ schemaVersion: '1', kind: 'plan-tasks', plan, steps,
tasks }`. `steps` lists each step's id, code and name in position order. `tasks` lists leaf work
items in export order, each with id, number, name, the names of its ancestors, per-step
three-point estimates in days keyed by step code, legacy `dependsOn` and the typed dependencies
whose successor is the task.

**Output.** `plan-reference` takes `--output <dir>` (an existing directory) and creates
`tasks.json` then `plan-reference.json` with `open(…, 'wx', 0o600)`. If the second create fails,
the first file, created by this run, is removed and the failure rethrown. `receipt-to-commands`
creates one file the same way. Stdout is the digest only.

**Receipt mapping (N6).** For each entry in receipt order: one `setProgress` with the entry's
status on `(workItemId, stepId)`, then one `setMeasure` per present measure, `token_actual`
before `hours_actual`. The intent named `setStatus`; that command acts on a whole work item
(`done` marks every step done), while a receipt entry names one step, so `setProgress` is the
existing command with the receipt's exact scope. The batch `{ id: plan, commands }` is built from
`@wbs/contracts`' `PlanCommandWire` type, and the tests validate it against the
`postApiProjectsByIdCommands` endpoint's own body and params shapes; a runtime check would
re-verify what the types already fix and could not fail.

**Dispatcher.** `runNavigator(argv)` accepts exactly `plan-reference` and `receipt-to-commands`
with their flags, each required once with a nonempty value. Any other command, an unknown,
duplicate or valueless flag throws `UsageRefusal` before any file is read; the entrypoint maps it
to exit 2 and lets every other error exit 1.

## Risks / Trade-offs

The cross-product edges `twilight-navigator → twilight-burokrat` and
`twilight-navigator → wbs-contracts` are excused by exact aliases in lint and by project pair in
the tool-devsync graph oracle, as Dash's fleet edge is.
