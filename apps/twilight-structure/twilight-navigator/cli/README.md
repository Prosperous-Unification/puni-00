# Twilight Navigator

Navigator (`twin`) owns the planning question: what should be built, in what shape and
order ([names and boundaries](../../../../docs/twilight-structure/names.md)). Today it is a
local CLI that turns an accepted WBS plan into records. It has no server, credentials or
network access, reads no clock, and never opens Burokrat's authority store.

Navigator and Dash exchange records, not calls. A plan reference goes Navigator→Dash; a
progress receipt comes back. Burokrat declares and validates both
([`navigator-records.ts`](../../twilight-burokrat/cli/src/contracts/navigator-records.ts));
`twib validate plan-reference <file>` checks one.

## Commands

The command line is parsed by [Optique](../../../../docs/adr/0064-use-optique-for-clis.md)
from `src/cli-parser.ts`, and help is generated from it. `twin --help` prints (a test
compares this block with the generated help):

```text
Usage: twin admit-progress --receipt PATH --plan-reference PATH --tasks PATH --accepted-reference PATH --output PATH
       twin plan-reference --export PATH --repository URL --change NAME --planning-commit SHA --source-base SHA
       --requirements PATH --output DIR
       twin receipt-to-commands --receipt PATH --plan-reference PATH --tasks PATH --output PATH
       twin help [COMMAND...]
       twin completion [SHELL] [ARG...]
       twin --help

  admit-progress              Propose WBS commands for a bound receipt against a selected accepted reference.
  plan-reference              Write tasks.json and plan-reference.json from a WBS plan export.
  receipt-to-commands         Write the WBS command batch for one progress receipt.
  help                        Show help information.
  completion                  Generate shell completion script or provide completions.
  --help                      Show help information.
```

`twin help <command>` and `twin <command> --help` print one command with every flag.
`twin completion bash|zsh|fish|nu|pwsh` prints a completion script; the script calls `twin` again to complete, so it needs `twin` on
`PATH` (for example a wrapper running `bun …/entrypoint.ts "$@"`). Navigator has no `--version`
until it is published.

## `twin plan-reference`

From the repository root, with a WBS plan export (`GET /api/work-packages/:id/export`, preserved versions 7–11, historical connected12 and frozen ordinary13/connected14, or current ownerless ordinary15/connected16)
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

Version 7 keeps task schema 1 with workday estimates. Versions 8–11 retain task schema 2 with native minute/workday estimates and their original bytes and digest meanings. Versions12–16 write task schema3: local leaf tasks keep native estimates and legacy dependencies; a document-level typedDependencies array preserves every authored edge once in input order, including parent successors. Endpoints distinguish local references from external work-package/work-item/step identities and preserve display labels. Historical12 project identity and display spellings map explicitly after complete decoding. No edge is expanded into a schedule.

Every supported export is read strictly before publication. Connected12 uses a lazy complete frozen published response, including detached project history and boundary1, through public requestSchema/validateSchema; frozen13/14 share a separately selected strict union from their public versioned declarations, while current15/16 cache the strict current public union. Current exports require complete matching package/parent metadata; the selected package remains the plan and command destination. Each selected boundary compiles an additional strict graph; HTTP response tolerance stays unchanged. Missing history, mixed spellings, unknown fields and future17+ refuse. Direct blockage facts retain the existing leaf-owner, step, uniqueness and safe-integer checks. Resources, measures and detached connected history are validated, then omitted from task projection; connected relationships never become authored edges or remote authority. The reference retains the original document version and hashes the original export bytes. A history-only change can preserve tasks while changing export/reference digests.

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
digests), reads all three task schemas without rewriting them, requires Burokrat plan/task consistency (digest binding, plan identity, task count, supported
version pairing and unique task IDs, step IDs and step codes) before building lookups, and refuses a receipt
for another plan reference or an entry naming a task or step code the plan does not hold. It
writes one owner-only WBS command batch `{ id, commands }`: per entry in receipt order, a
`setProgress` for the step, then a `setMeasure` for `token_actual` and `hours_actual` when the
entry carries them. It prints the batch digest. Schema 1 receipts bind the six-field PlanRef and retain its
historical PlanRef-only consistency; for schema 2 receipts shared consistency also requires the
complete producer reference digest to match the receipt binding. Neither establishes live WBS
freshness.

Applying the batch is a person's or the WBS MCP's act (`postApiWorkPackagesByIdCommands`, `POST /api/work-packages/:id/commands`):
Navigator sends nothing. Receipts come from Dash
[`record-progress`](../../twilight-dash/cli/README.md#record-progress), which emits the existing
v1 receipt from explicit operator entries and supplied reference/tasks. `record-progress-v2` binds the complete producer reference, including12–14/schema3; entries remain operator assertions and evidence is not authenticated.

## Exit codes

Exit 2 is a refused invocation (unknown command, unknown, duplicate, missing or valueless
flag, stray argument), raised before any file is read: one `error: ` line on stderr, either
`Unsupported twin command: <name>` or the command's usage followed by the reason in
parentheses, for example `error: usage: twin plan-reference --export PATH … (Missing required
twin flag: --export)`. Exit 1 is a refused input: a missing, unreadable or malformed input
file, an export of another version, an identifier or record the contracts refuse, a mismatched
plan reference, or an occupied output file. Help and completion exit 0 on stdout.

## Checks

```sh
bunx nx run-many -t test lint typecheck -p twilight-navigator --skip-nx-cache
```

`twilight-navigator:test` needs a non-root runner: the unreadable-input proof relies on file
modes, so under uid 0 it throws instead of passing vacuously. The
[OpenSpec change](../../../../openspec/changes/twilight-navigator-plan-reference/verify.md)
records the original checks and fault proofs. The current12–14 slice's
[verification summary](../../../../openspec/changes/wbs-work-packages/verify.md#navigator17-accepted-proofs-and-private-closing-2026-11-12)
records accepted first-property limits and private artifact descriptors. Its referenced
`verification-1.7-navigator.json` packet is absent from this checkout.

The [receipt consistency change](../../../../openspec/changes/navigator-receipt-plan-consistency/verify.md)
records the shared checker proofs and scoped verification.

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
