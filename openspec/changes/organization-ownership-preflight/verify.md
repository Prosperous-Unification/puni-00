## Scope and status

The bounded local ownership-report prerequisite is implemented. Parent `organization-ownership-and-access` tasks 1.1/7.1 and WBS010.5.4 remain open. This report inspects only the durable marker and three relational ownership queries; it excludes reviewed production identities/access mappings, opaque journal/captured bodies, process drain, MCP epoch and actual activation. No production database, rollout, push, merge or deployment was attempted.

All six tasks in this packet are complete at the focused-validation level. Delta specs remain local to this change (not synced or archived). The full canonical host gate remains unrun by explicit PM scope; this packet does not claim merge or rollout readiness.

## Base and dependencies

Isolated clone `/tmp/puni-org-preflight-sol-oct17`, exact base `f83139f2cf065c9ea119f3a91395a092076ebd19`.
Clone, source clone and physical donor `bun.lock` SHA256: `e8d77926f9dac4ba4824486143872bdfb123cafd8bed45cca50c44b2e23298a4`.
Linked exact-lock physical donor `/tmp/puni-platform-source-aggregate-sol-oct16/node_modules`; no installation or network fetch. Cached OpenSpec 1.12.0 was found at `/tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js`.

## Commands and observed output

Commands ran from the isolated clone, serially, through `RUNTIME_CLOSURE_RSS_MIB=<cap> python3 /tmp/runtime-rss-guard.py <command>`. Default cap was 900 MiB. Measurements are sampled sums of process-tree RSS; receipts are the last line of each evidence log.

| Command                                                                                                                                                                               | Observed output                                                                        | Evidence                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------- |
| `bun test libs/wbs/adapters/store-sqlite/src/organization-ownership-preflight.db.test.ts apps/wbs/be-01/src/organization-ownership-preflight-cli.db.test.ts` against throwing stubs   | 3 pass, 16 fail, exit 1; expected feature absence                                      | `evidence/red.log`                  |
| Same focused command after implementation                                                                                                                                             | 19 pass, 0 fail, exit 0; peak 162,369,536 bytes                                        | `evidence/green.log`                |
| Focused command plus organization-activation, organization-ownership, organization-bridge and organization-reconciliation `.db.test.ts` files under the same adapter source directory | 146 pass, 0 fail, 295 assertions, 18.76 s, exit 0; peak 164,749,312 bytes              | `evidence/regression-green.log`     |
| `bun node_modules/.bin/tsc --project openspec/changes/organization-ownership-preflight/evidence/typecheck.json`                                                                       | exit 0; peak 236,490,752 bytes                                                         | `evidence/typecheck-final.log`      |
| `bun build apps/wbs/be-01/src/organization-ownership-preflight-cli.ts --target=bun --outfile=/tmp/org-ownership-preflight-cli.js`                                                     | 279 modules, 0.63 MB bundle, exit 0; peak 43,757,568 bytes                             | `evidence/build.log`                |
| `bun node_modules/.bin/nx graph --file=/tmp/org-preflight-project-graph.json` with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`                                                         | graph created, exit 0; peak 272,814,080 bytes                                          | `evidence/project-graph-native.log` |
| `bun node_modules/eslint/bin/eslint.js` with the four new production/test TypeScript paths                                                                                            | no diagnostics, exit 0; peak 1,472,221,184 bytes, cap 1600 MiB                         | `evidence/lint-final-retry.log`     |
| `bun <cached-openspec> validate --all --json`                                                                                                                                         | 248/248 valid: 230 changes and 18 specs, exit 0; peak 129,249,280 bytes                | `evidence/openspec-all.log`         |
| `bun run tools/tool-git-hooks/src/install.ts`                                                                                                                                         | installed pre-commit, prepare-commit-msg and commit-msg, exit 0; peak 81,592,320 bytes | `evidence/hooks-install.log`        |

The initial missing-module RED is retained separately as bootstrap evidence, not the qualifying assertion RED. Fixtures were corrected after migration-seeded external systems unexpectedly appeared in the focused empty fixture. The preload now inspects SQLite's `SQLITE_READONLY` cause through Drizzle's wrapper.

ESLint exceeded 900 MiB (killed at 950,050,816 bytes), then a 1400 MiB retry exposed local lint issues. After correcting them, a 1400 MiB run was killed at 1,470,570,496 bytes; with 18,602 MiB available RAM, the measured 1600 MiB retry passed. The final run had a cached Nx graph and did not skip module-boundary enforcement. Earlier missing `typescript/bin/tsc` and `nx/bin/nx.js` paths were corrected to the installed `.bin` entrypoints; those failed attempts are retained.

## Failure proofs

Each qualifying mutation below exited 1 with the named production-path test failing; restored implementation passed the six-file regression. Exact commands, measurements and outcomes are in `evidence/mutations.json` and each named log.

| Check                           | Injected fault                                                                      | Observing test and observed failure                                                                                                                            | Evidence                                           |
| ------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Marker validation               | Substitute pre_activation without reading                                           | All three absent/unreadable/malformed marker cases returned a report instead of Error                                                                          | `omit-marker.log`                                  |
| Unmapped-root completeness      | Replace probe with []                                                               | Mixed-findings test lost unmapped tag                                                                                                                          | `omit-unmapped.log`                                |
| Catalog-drift completeness      | Replace probe with []                                                               | Mixed-findings test lost renamed tag                                                                                                                           | `omit-drift.log`                                   |
| Conflict completeness           | Replace probe with []                                                               | Mixed-findings test lost unresolved event stream                                                                                                               | `omit-conflicts.log`                               |
| Deferred snapshot               | Remove begin/commit                                                                 | Snapshot test saw newer findings beside old marker                                                                                                             | `omit-snapshot.log`                                |
| Whole-report snapshot           | Commit after marker only                                                            | Snapshot test saw all newer findings beside old marker                                                                                                         | `commit-after-marker.log`                          |
| Whole-report snapshot           | Commit after unmapped roots only                                                    | Snapshot test saw newer drift/conflicts beside old marker/unmapped roots                                                                                       | `commit-after-unmapped.log`                        |
| Whole-report snapshot           | Commit after catalog drift only                                                     | Snapshot test saw newer conflict beside earlier fields                                                                                                         | `commit-after-drift.log`                           |
| Transaction cleanup             | Omit rollback                                                                       | Restored-table reuse refused BEGIN inside an active transaction                                                                                                | `omit-rollback.log`                                |
| Read-only actual CLI connection | Swap CLI opener to openExistingConnection; intercept both openers and inject UPDATE | Actual-connection test failed explicitly with `actual CLI connection accepted injected write`; corrected positive test passes and records the observed refusal | `writable-cli.log`, `readonly-corrected-green.log` |
| Argument boundary               | Bypass argument guard                                                               | Unexpected-argument test got database error instead of usage                                                                                                   | `omit-argv.log`                                    |
| Environment boundary            | Remove DB_PATH guard                                                                | Missing/empty-env test got no DB_PATH refusal                                                                                                                  | `omit-env.log`                                     |

The earlier `writable-cli-disqualified.log` failed because a changed opener bypassed the spy and no receipt was created. It is explicitly disqualified as read-only proof. The corrected preload intercepts both openers with one wrapper; `writable-cli.log` proves the write actually succeeded under the fault. Astra-high reviewed and accepted this correction.

Permission-unreadable file (chmod 000 as UID 1000), absent file without creation, invalid SQLite, all broken marker categories, and valid-marker/unavailable ownership table each have CLI subprocess assertions for nonzero exit, stderr and empty stdout. These reuse the existing database/marker refusal boundaries. Connection success/failure reuse and read-only database byte preservation have direct tests.

## Review and remaining verification

Astra-high final rereview found no outstanding P0–P3 defects or R5 proof gaps within this bounded scope. Its earlier P2 proof mismatch is corrected above. The reviewer independently read source and logs and ran no tests. Normal local commit hook outcome is recorded in the delivery report after this record is finalized. Evidence logs normalize trailing whitespace only.

Skipped by authorized bounded scope: `bin/h2puni-gate.sh <sha>`, raw full Nx format/test/lint/typecheck/build, public CI, secrets CI scan, migration CI lint, deployment, production identity/access and MCP/old-process evidence. Local installed hooks will run normally at commit. No broad gate or rollout claim is made.

## Source and merge reconciliation — 2026-10-19

[The parent reconciliation](../organization-ownership-and-access/verify.md#source-and-merge-reconciliation--2026-10-19)
verifies preflight checkpoint `a0ed2adf9` is in main through PR #565. The
read-only CLI and snapshot report are merged source, not unpublished work to
rebuild. Earlier skipped release checks describe their checkpoint.

No production database was inspected by this reconciliation. Full identity/access
inventory, opaque stored bodies, old-process drain, MCP credential epoch,
activation and live acceptance remain outside this preflight's proved scope.
No new runtime test or release-gate result is claimed.
