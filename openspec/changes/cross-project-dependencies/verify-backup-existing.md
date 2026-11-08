# Existing-only backup source verification

2026-10-24, bounded prerequisite for complete dependency activation. This restores
`snapshotDatabase`'s existing absent-source refusal through the SQLite open itself;
no coordinator or activation behavior is implemented here.

The regression test uses a real migrated scratch SQLite database. A test-only
`existsSync` observer returns the real successful source preflight observation,
then unlinks that source before the production SQLite opener executes. SQLite,
`VACUUM INTO`, verification and filesystem publication remain real. The assertions
require refusal and absence of a replacement source, WAL, shared-memory file,
published snapshot and partial snapshot. The observer is restored in `finally`.

All commands used Bun 1.4.2 (`744846f84`) through
`PATH=/tmp/puni-pr630-bun142-al30yoqo:$PATH`. Nx commands also used
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false`.

| Check                                                                                                                                             | Observed outcome                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Baseline `bun test libs/wbs/adapters/store-sqlite/src/backup.db.test.ts --timeout=30000`                                                          | 7 pass, 0 fail                                                                    |
| New race negative before implementation, same command                                                                                             | 7 pass, 1 fail: source existed after refusal                                      |
| Fix: source uses `openExistingConnection`, same command                                                                                           | 8 pass, 0 fail; 27 assertions                                                     |
| R5 mutation: restore creation-capable `openConnection` import and source call; run same file with `--test-name-pattern='removed after preflight'` | 0 pass, 1 fail, 7 filtered: expected absent source, observed newly created source |
| Restore existing-only opener; repeat complete backup file after formatting                                                                        | 8 pass, 0 fail; 27 assertions                                                     |
| `bunx nx run wbs-store-sqlite:lint --skip-nx-cache`                                                                                               | Nx executed scoped ESLint; succeeded                                              |
| `bunx nx run wbs-store-sqlite:typecheck --skip-nx-cache`                                                                                          | Nx executed `tsc --build --force` for the project; succeeded                      |
| `bunx openspec validate --all --json`                                                                                                             | 277 passed, 0 failed; existing long-requirement warnings present                  |

Existing successful backup/restore, source absence, nonempty ledger, integrity,
WAL displacement and overwrite refusal cases remain in the focused suite.

The project defines no build target. Full store/repository suites and remote host
gates were not run for this bounded slice; the parent coordinates the host gate.
No host operations or production database writes were performed. This correction
does not claim source inode binding against arbitrary replacement; the complete
activation coordinator must enforce that independent requirement.
