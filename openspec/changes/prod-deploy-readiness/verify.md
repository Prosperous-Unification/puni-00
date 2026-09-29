# Verification

Base `802432df`. All commands ran on 2026-09-29 in a worktree on the build laptop, with `CLAUDECODE`
unset. Nothing ran on h2puni.

## Commands

| Command                                                                                                             | Result                                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run-many -t test -p tool-remote-scripts,tool-deploy,tool-smoke,wbs-store-sqlite,wbs-be-01` | exit 0; 339+2 skip, 281, 42, 1148, 1562+1 skip pass; 0 fail            |
| `NX_DAEMON=false bunx nx run-many -t lint -p` (same five)                                                           | exit 0                                                                 |
| `NX_DAEMON=false bunx nx run-many -t typecheck -p` (same five)                                                      | exit 0                                                                 |
| `NX_DAEMON=false bunx nx run-many -t build -p tool-remote-scripts,tool-smoke`                                       | exit 0; `swap.js` and `smoke.js` bundle                                |
| `shellcheck -s bash bin/assert-no-prod-release.sh`                                                                  | exit 0                                                                 |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`                                       | exit 0; 141 passed, 0 failed                                           |
| h2puni gate, host dry run, live ledger dump                                                                         | not run: this lane is code only, and the host steps are the operator's |

## R5 proofs

Each fault was injected into production code, the named suite was run, and the code was
restored. The restored file was compared with `cmp` or rerun green.

| Check                               | Injected fault                                       | Observed                                                           |
| ----------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| `startGreen` required-key preflight | call skipped behind a never-set env flag             | `swap.test.ts` 67 pass, 7 fail: every refusal case reached Compose |
| `APP_ENV_REQUIRED_KEYS`             | `GW_URL` removed from be's list                      | 164 pass, 2 fail (swap refusal and release-coherence case)         |
| `AUTH_MODE=local` refusal           | narrowed to `tier === 'fe'`                          | 163 pass, 3 fail (swap and both release-coherence cases)           |
| gate ledger comparison              | `if [ "$ledger_names" != … ]` replaced by `if false` | 12 pass, 3 fail: later, split and empty ledgers accepted           |
| gate unreadable-ledger arm          | `[ ! -r ]` dropped                                   | 14 pass, 1 fail: only `sed`'s Permission denied, no refusal        |
| `snapshotDatabase` verification     | replaced by an unverified digest                     | `backup.db.test.ts` 4 pass, 2 fail: a ledgerless copy published    |
| `restoreDatabase` verification      | replaced by an unverified digest                     | 5 pass, 1 fail: the corrupted snapshot replaced the database       |
| `backup-db` in `ABORTABLE_STEPS`    | removed                                              | 76 pass, 1 fail: failure threw bare, green never stopped           |
| `backup-db` in the be plan          | removed from `planSwap`                              | `reconcile.test.ts` 15 pass, 1 fail                                |
| smoke anonymous refusal             | any status accepted                                  | `auth-read.test.ts` 8 pass, 1 fail                                 |
| smoke signed-in account match       | id comparison replaced by a type check               | 8 pass, 1 fail                                                     |
| optional read-account env file      | always passed to `docker run`                        | `deploy.test.ts` 68 pass, 1 fail on the absent file                |

The release-coherence cases in `docker.test.ts` boot be-01 (`loadConfig` and
`oidcRouteOptionsFromEnv`) and gw-01 (`loadConfig`) under `NODE_ENV=production`. The preflight
admits a set only when both boot. Removing any key it demands makes both the preflight and the
release refuse.
