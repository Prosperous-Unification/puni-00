# Twilight Navigator

Navigator (`twin`) owns the planning question: what should be built, in what shape and
order ([names and boundaries](../../../../docs/twilight-structure/names.md)). Today it is a
local CLI that turns an accepted WBS plan into records. It has no server, credentials or
network access, reads no clock, and never opens Burokrat's authority store.

Navigator and Dash exchange records, not calls. A plan reference goes Navigator→Dash; a
progress receipt comes back. Burokrat declares and validates both
([`navigator-records.ts`](../../twilight-burokrat/cli/src/contracts/navigator-records.ts));
`twib validate plan-reference <file>` checks one.

## `twin plan-reference`

From the repository root, with a WBS plan export (`GET /api/projects/:id/export`, version 7, 8, 9 or 10)
and the requirements the plan answers (for example the change's delta spec):

```sh
bun apps/twilight-structure/twilight-navigator/cli/src/entrypoint.ts plan-reference \
  --export /path/to/plan-export.json \
  --repository https://github.com/Prosperous-Unification/puni-00 \
  --change my-openspec-change \
  --planning-commit "$PLANNING_COMMIT" \
  --source-base "$SOURCE_BASE_COMMIT" \
  --requirements openspec/changes/my-openspec-change/specs/my-capability/spec.md \
  --output /path/to/existing-directory
```

All seven flags are required, each once. The command writes `tasks.json` (the plan's leaf
work items with ancestry, per-step estimates and dependencies) and
`plan-reference.json` into the existing output directory, each created owner-only and never
replacing a file, and prints the plan reference digest. The record's `createdAt` is the
export's `exportedAt`, so the same inputs give the same bytes.

Version 8 writes task schema 2: each `estimates` entry names its `stepCode`, native `unit`
(`minutes` or `workdays`), and unchanged optimistic, realistic and pessimistic values. Version 7
retains task schema 1 with `estimateDays` in workdays. The reference records the original wire
version and hashes the original export bytes. Future versions and undeclared keys are refused.

The plan reference is prepared, not applied: nothing is sent to WBS or Dash.

## `twin receipt-to-commands`

Before constructing commands, Navigator uses Burokrat's
[`checkProgressReceiptConsistency`](../../twilight-burokrat/cli/src/contracts/validate-progress-receipt.ts).
The same consistency can be checked independently with
`twib validate-progress-receipt <receipt.json> <plan-reference.json> <tasks.json>`; the report
covers the supplied documents only and grants no authority to write current WBS state.

```sh
bun apps/twilight-structure/twilight-navigator/cli/src/entrypoint.ts receipt-to-commands \
  --receipt /path/to/progress-receipt.json \
  --plan-reference /path/to/plan-reference.json \
  --tasks /path/to/tasks.json \
  --output /path/to/new-command-batch.json
```

It decodes the progress receipt and plan reference through Burokrat (which verifies their
digests), reads either task schema without rewriting it, requires Burokrat plan/task consistency (digest binding, plan identity, task count, supported
version pairing and unique task IDs, step IDs and step codes) before building lookups, and refuses a receipt
for another plan reference or an entry naming a task or step code the plan does not hold. It
writes one owner-only WBS command batch `{ id, commands }`: per entry in receipt order, a
`setProgress` for the step, then a `setMeasure` for `token_actual` and `hours_actual` when the
entry carries them. It prints the batch digest. For schema 2 receipts, shared consistency also requires the complete producer reference digest to match the receipt binding; schema 1 retains its historical PlanRef-only consistency semantics.

Applying the batch is a person's or the WBS MCP's act (`postApiProjectsByIdCommands`):
Navigator sends nothing. Dash `record-progress` emits the existing v1 receipt from explicit
operator entries and supplied reference/tasks. Entries are operator assertions; evidence is
not authenticated and current WBS application remains the existing person/MCP act.

## Exit codes

Exit 2 is a refused invocation (unknown command, unknown, duplicate, missing or valueless
flag), raised before any file is read. Exit 1 is a refused input: a missing, unreadable or
malformed input file, an export of another version, an identifier or record the contracts
refuse, a mismatched plan reference, or an occupied output file. `twin --help` lists the
commands.

## Checks

```sh
bunx nx run-many -t test lint typecheck -p twilight-navigator --skip-nx-cache
```

`twilight-navigator:test` needs a non-root runner: the unreadable-input proof relies on file
modes, so under uid 0 it throws instead of passing vacuously. The
[OpenSpec change](../../../../openspec/changes/twilight-navigator-plan-reference/verify.md)
records the observed checks and fault proofs.

The [receipt consistency change](../../../../openspec/changes/navigator-receipt-plan-consistency/verify.md)
records the shared checker proofs and scoped verification.

Version 9 requires strict root `stepBlockages` direct facts: existing leaf owners, existing steps, unique owner/step pairs and safe integer `blockedAt` values. Negative instants and facts retained on done progress are valid. Facts stay in the original export; Navigator emits schema-2 tasks with native units and no blockage commands or eligibility calculation. Version 7 keeps schema 1, versions 8, 9 and 10 use schema 2, and future version 11 is refused before output. Version 10 adds the plan's resources, their capacities and demands (`wbs-resources`); Navigator reads them strictly and they change no task. The reference records the original wire version and hashes the raw input bytes. A blockedAt-only change therefore changes the export and reference digests while preserving tasks and their digest. Schema 1 receipts bind the six-field PlanRef. Schema 2 receipts also bind the complete reference digest; neither establishes live WBS freshness.

## `twin admit-progress`

Dash `record-progress-v2` produces a bound receipt. To propose commands against an independently selected accepted reference:

```sh
bun apps/twilight-structure/twilight-navigator/cli/src/entrypoint.ts admit-progress \
  --receipt /path/to/bound-progress-receipt.json \
  --plan-reference /path/to/producer-reference.json \
  --tasks /path/to/tasks.json \
  --accepted-reference /path/to/selected-accepted-reference.json \
  --output /path/to/new-command-batch.json
```

All five flags are required once. Admission requires schema 2 and both digest equalities:
receipt reference digest = producer reference digest = selected accepted reference digest.
Existing plan/task/entry consistency checks precede exclusive owner-only batch publication.
A receipt bound to export A is refused against selected export B even when their PlanRef and
tasks are equal. Schema 1 remains available through `receipt-to-commands`.

The caller owns accepted-reference selection. This command establishes consistency with that
selection and proposes commands; it does not authenticate records, discover current WBS state,
or apply the batch. Proofs and verification limits are in the
[admission change](../../../../openspec/changes/admit-progress-against-selected-reference/verify.md).
