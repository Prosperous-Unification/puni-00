# Twilight Navigator

Navigator (`twin`) owns the planning question: what should be built, in what shape and
order ([names and boundaries](../../../../docs/twilight-structure/names.md)). Today it is a
local CLI that turns an accepted WBS plan into records. It has no server, credentials or
network access, reads no clock, and never opens Burokrat's authority store.

Navigator and Dash exchange records, not calls. A plan reference goes Navigator→Dash; a
progress receipt comes back. Burokrat declares and validates both
([`navigator-records.ts`](../twilight-burokrat/cli/src/contracts/navigator-records.ts));
`twib validate plan-reference <file>` checks one.

## `twin plan-reference`

From the repository root, with a WBS plan export (`GET /api/projects/:id/export`, version 6)
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
work items with ancestry, per-step estimates in days and dependencies) and
`plan-reference.json` into the existing output directory, each created owner-only and never
replacing a file, and prints the plan reference digest. The record's `createdAt` is the
export's `exportedAt`, so the same inputs give the same bytes.

The plan reference is prepared, not applied: nothing is sent to WBS or Dash.

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
