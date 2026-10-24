# Non-backend CI triage, 2026-10-23

Baseline: `3fbdf7928`, isolated clone `/tmp/puni-ci-other`. Old failed CI run
`39882705993` ran `e86fdfb10`; its retained failed-step log names these four
non-backend targets but only preserves detailed SQLite and MCP annotations.
Dependency installation was not repeated: this local clone uses the primary
workspace's existing `node_modules` via symlink. This is bounded local evidence,
not a frozen-install or complete Nx/host gate result.

## Findings and fixes

- `twilight-navigator:typecheck`: reproduced four TS2322 diagnostics in
  `plan-reference.ts` (historical normalization and typed endpoint derivation).
  Navigator supports wire versions 7–10, but based those schemas on WBS's new
  v10/v11 union. Pinning schema and normalized types to `planDocumentV10` /
  `PlanDocumentV10` restores the documented contract without admitting v11.
  Existing runtime tests were already green; the compiler supplied the red
  reproduction for this type correction.
- `wbs-mcp-01:test`: reproduced the old pinned-operation failure: unexpected
  `getDependencyCapability`. The production document regression was added first;
  without the operational deny path, it also failed (12 pass / 2 fail). Adding
  `/api/runtime/dependency-capability` to the existing optional operational
  exclusions keeps OpenAPI discovery intact and removes the model tool. The
  adjacent `Proof:` names that watched missing-policy fault; the operation
  snapshot was not changed.
- `wbs-store-sqlite:test`: old annotations identify assignee setup refusals and
  missing audit stamps for typed/external dependencies and boundary certificates.
  Baseline already includes `3cb4fb8a4` (continuing Review fixture) and
  `8d5e50b52` (restoration audit stamping). Focused reproduction is green.
- `tool-remote-scripts:test`: the retained old log supplies no exact failure.
  Local sandbox failures in installed-solver checks are environmental: child
  pipes/socket access fails, producing EOF instead of receipts or expected
  diagnostics. The same 53 checks pass outside the sandbox. A concurrent broad
  retry also timed out in the 10-second migration CLI fixture; its standalone
  retry passed; no persistent production failure was reproduced. No deadlines or assertions were weakened.

## Commands and observed output

Commands run from the project roots matching their configured target, except
root-relative compiler/lint/format commands. Test output logs are local `/tmp`
artifacts, not repository fixtures.

- `bunx tsc --build --force apps/twilight-structure/twilight-navigator/cli/tsconfig.json`:
  red exit 2 with four TS2322 diagnostics; after pinning, exit 0.
- In Navigator: `bun test --preload ../../../../tools/test/scratch/preload.ts src --timeout=30000`:
  exit 0; **97 pass, 0 fail**, four files, 544 assertions.
- In MCP: `bun test src/generated-document.test.ts src/openapi-tools.test.ts src/shape-document.test.ts --timeout=10000`:
  exit 0; **52 pass, 0 fail**, three files, 469 assertions.
- `bunx tsc --build --force apps/wbs/mcp-01/tsconfig.json`: exit 0.
- In SQLite, outside sandbox:
  `bun test src/assignee-commands.db.test.ts src/audit.test.ts src/browser-auth-lifecycle.db.test.ts src/saved-plan-concurrency.db.test.ts --timeout=30000`:
  exit 0; **35 pass, 1 skip, 0 fail**, four files, 146 assertions. The existing
  skipped memory-store stale-undo case is reported, not counted as passing.
- In remote scripts, outside sandbox:
  `bun test src/check-installed-solver.test.ts --preload ../test/scratch/preload.ts --timeout=10000`:
  exit 0; **53 pass, 0 fail**, 507 assertions.
- In remote scripts, alone and outside sandbox:
  `bun test src/swap-migration.db.test.ts src/check-installed-solver.test.ts --preload ../test/scratch/preload.ts --timeout=10000`:
  exit 0; **63 pass, 0 fail**, two files, 578 assertions. The previously timed-out
  CLI argument test passed with its original 10-second timeout.
- Changed-file ESLint for Navigator and MCP: exit 0, with an explicit warning
  that `@nx/enforce-module-boundaries` was skipped because no cached Nx graph was
  available. This does not establish the module-boundary lint gate.
- Changed-file `bunx prettier --check`: exit 0. `git diff --check`: exit 0.

## Limits

The broad configured SQLite and MCP test commands, and the configured remote
script test command, were started directly with their configured arguments.
Sandbox attempts encountered EPERM on child stdin / local listeners; those
attempts were interrupted with exit 130. Unrestricted broad retries were also
interrupted with exit 130 to stop overlapping heavy runs and keep this triage
bounded. Their partial output is not a complete-target green. MCP's unrestricted
partial run exercised the real HTTP/MCP connected parity fixtures successfully
before interruption. The remote script target's `test:caddy` dependency, frozen
installation, complete Nx target runs, full lint, build, OpenSpec validation,
CI, h2puni gate and h4claw gate were not run here.
