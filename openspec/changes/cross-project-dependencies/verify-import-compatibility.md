# Bounded task 8.1 mounted import compatibility (2026-10-23)

`plan-import-compatibility.controller.db.test.ts` mounts the production application
and SQLite composition with `OrganizationHarness.openComposedWith({})`. It adds no
synthetic importer or harness option and does not activate public external import.
The production `INACTIVE_EXTERNAL_DEPENDENCIES` binding remains unchanged.

The outgoing-only source is downloaded through mounted JSON export as v11. Its
project carries its already claimed abbreviation, its connected observation names
the outgoing relationship, and its authored typed list contains only its internal
relationship. Mounted import succeeds, creates three rows in a new project with a
distinct abbreviation in `org:org-a`, preserves the source abbreviation and all
external relationship rows, and re-exports the imported internal relationship.
This covers destination allocation for an archival address already held locally.
It does not establish successful public import of incoming external declarations.

Future-version cases start with a real mounted export, change its version to 12,
and separately leave its content intact or corrupt a row priority. Both return
exactly 400 `unsupported_version` at `document.version`, with null detail. A
canonical snapshot of every application table remains unchanged. Legacy versions
1, 2 and 3 import `anchor-slice`, preserve the stored project setting and re-export
it. Version 1 omits its historically absent step allowance field.

## Watched production faults

Each fault was applied separately, exercised, and restored before final checks.
Adjacent `Proof:` comments identify the observations in the new test file.

| Fault                                                                                           | Observed failure                                                                                                                              |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Force the supported-version fence false in `classifyPlanDocument`                               | Two failures: intact v12 imported with 201; malformed v12 returned `invalid_body/workItems[0].priority` instead of the exact version refusal. |
| Replace `depReach: settings.depReach` with `depReach: 'whole-item'` in `plan-import.feature.ts` | All three legacy cases failed their stored `anchor-slice` assertion with `whole-item`.                                                        |
| Make the SQLite project allocator accept occupied name candidates                               | Outgoing-only mounted import returned 409 instead of 201 because the source abbreviation was already claimed.                                 |

Commands use `bun test ./apps/wbs/be-01/src/controller/plan-import-compatibility.controller.db.test.ts --timeout=30000 -t <filter>`
with filters `unsupported v12`, `legacy`, and `outgoing-only`. Fault logs are
`/tmp/task81-import-fault-{classifier-final,reach,allocator}.log` in the implementation workspace.

## Validation and limits

The focused command runs the new compatibility file together with
`cross-project-import.controller.db.test.ts` and
`cross-project-export.controller.db.test.ts`. Final counts are recorded in the
linked `verify.md` entry. Focused ESLint passed, with the explicit warning that
`@nx/enforce-module-boundaries` was skipped because the isolated worktree had no
cached project graph. `tsc --project apps/wbs/be-01/tsconfig.spec.json --noEmit`
passed. No host gate, full lint/build, browser/E2E, MCP, old-binary or live rollout
checks were run for this bounded acceptance packet. Parent task 8.1 stays open.
