# Bounded task 8.1 read-side acceptance

Based on `89b112475`, isolated clone `/tmp/puni-v11-export-acceptance`.
The previously unchecked read-side acceptance slice already had stable
successor-owned UUID/step exports, outgoing-edge exclusion, explicit calendar
and engine outcomes, exact retained pre-selection stage bytes, and generated
client / downloaded Blob / page-import projection coverage. The bounded export
and downloaded integration records in `verify.md` contain their watched faults.
Those accepted slices are reused rather than duplicated here.

This packet adds one regression for detached unavailable evidence and extends
the terminal-certificate regression to cover later mutation of nested capture
objects. Projecting a document must preserve its emitted calendar projects,
plan-infeasible bounds and boundary-infeasible certificate question even when
the source capture changes. Production code changes are adjacent proof comments
only; the projection already performed the required deep copies.

## Watched faults

Each fault was injected separately into the production
`module/plan-document/connected-document.ts`, then restored.

| Fault                                                                               | Observed failure                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Return unavailable placement directly instead of `structuredClone(placement)`       | `unavailable document evidence is detached from later capture mutation` loses its retained calendar project after the source array is emptied.                                                      |
| Shallow-copy optimizer variants instead of `structuredClone(optimization.variants)` | `terminal boundary certificate stays distinct from authored plan infeasibility` changes its emitted deadline bound from 0 to 999 and its retained certificate stage bytes/evidence to later values. |

Commands: `bun test ./libs/wbs/application/core/src/module/plan-document/connected-document.test.ts -t '<test name>'`.
The mutation logs are `/tmp/v11-export-unavailable-fault.log` and
`/tmp/v11-export-terminal-fault.log`; they are local experiment records, not
portable repository artifacts. Restored controls are included in the focused
suite below. No mutation is retained.

## Verification

- Focused Bun regression over `connected-document.test.ts`,
  `plan-document.resource.test.ts`, plan-document `module.test.ts`,
  `plan-document-connected-shapes.test.ts`, mounted
  `cross-project-export.controller.db.test.ts`,
  `cross-project-import.controller.db.test.ts`, and
  `plan-document-boundary.test.ts`, with `--timeout=30000`: **149 pass,
  0 fail, 873 assertions**.
- Frontend `TZ=UTC bunx vitest run src/lib/wbs-api.test.ts
src/components/wbs/plan-toolbar.test.tsx
src/components/wbs/project-page.test.tsx --no-file-parallelism --maxWorkers=1
--testTimeout=30000 --hookTimeout=30000`: **224 pass**, three files.

- `NX_DAEMON=false bunx nx run wbs-core:typecheck --skip-nx-cache`:
  **passed**, including module prerequisite, 58.1 seconds. The first run caught a
  readonly-array `splice` in the new test; the explicit reflective fault and
  `.at()` guards replaced it before the final successful run.
- Changed production/test file ESLint: **passed**. The first run caught array
  indexing guards and the readonly-array method; those test-only issues were
  corrected before the final successful run.
- Changed-file Prettier and `git diff --check`: **passed**.
- `bunx openspec validate cross-project-dependencies --json`: **passed**.

Dependencies reuse the feature workspace's `node_modules` through a symlink;
no frozen reinstall was performed. The frontend run reports the existing Vite
native-config warning about `__dirname`.

This closes only the bounded read-side acceptance checkbox. Parent tasks 8.1
and 8.2 stay open. Production external import remains dormant. Whole-project
public import authority/activation and compatibility/transport rollout are not
established by this packet; existing synthetic storage import proofs do not
activate that boundary. No host gate, full CI/build, browser/E2E, alternate
timezone, MCP, installation or deployment check was run.
