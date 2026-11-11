# Verification — production diagnosis, 2026-11-11

This change records the read-only action in assessment priority 1. It does not
change runtime behavior, deployment contracts or safety checks; no new OpenSpec
change or application test suite is required for these documentation artifacts.
The proposed acceptance repair still requires its own OpenSpec and R5 proofs.

## Fresh primary observations

The private local capture root is `/tmp/puni-production-provenance-20261111`,
mode `0700`; report JSON and exact state/bundle/release captures use mode `0600`.
Raw credentials, full Docker environments, Caddy configuration bodies and client
rows were not exported. The sanitized [evidence](evidence.json) retains selected
metadata plus hashes of private receipts. Temporary captures are not a durable
backup; the committed projections are the reviewable record.

| Executed read                                                                                                                               | Observation / limit                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gh api repos/Prosperous-Unification/puni-00/branches/main`                                                                                 | Protected main, source SHA `7614ca5116e2b27831076f7bc7c9f9872051c388`.                                                                                                                                |
| `docker inspect` and `docker image inspect`, h2 through SSH                                                                                 | Full IDs, image refs, selected labels, mounts and runtime identities; no raw environment output.                                                                                                      |
| Caddy `GET http://127.0.0.1:2019/config/` inside existing edge                                                                              | Current production host/path/upstream projection and hash of the config bytes; no reload.                                                                                                             |
| Authenticated registry `GET /v2/<repo>/manifests/<digest>`, `/manifests/0afc77758131bc4257dcaa78f0b26bc97ffd92dc`, `/blobs/<config-digest>` | All three manifests/configs returned 200. Digests and local image configuration/layers agree. Tag equality corroborates recorded source claim only.                                                   |
| Exact state/phase, installed bundles, actual build release record                                                                           | State and bytes preserved privately; legacy build/source/artifact mismatch remains visible. No file changed on host.                                                                                  |
| GitHub exact historical SHA `/check-runs`, `/status`, `/actions/runs?head_sha=...`                                                          | Zero retained records; no historical accepted gate established.                                                                                                                                       |
| GitHub baseline `/check-runs`, exact push run and failed-job annotations                                                                    | `gate` and remote gate fail; `pixels` succeeds. Installer fixture exit 143 recorded; no retry or root-cause claim.                                                                                    |
| `gh api .../rules/branches/main`                                                                                                            | Effective gate/pixels requirements and review/update policy captured; no setting writes.                                                                                                              |
| h1 `systemctl --user show` selected backup services/timers                                                                                  | Successful latest backup/retention/freshness units; timers active; November 8 drill receipt retained.                                                                                                 |
| Installed backup/alert source and status, retention, drill, health JSON                                                                     | Read and fingerprinted; current status and historical drill scope separated. The global retention record covers MLflow despite no second per-set file.                                                |
| `rclone lsjson` encrypted hourly/MLflow directories; plain website prefix                                                                   | Six latest encrypted members exist with recorded sizes; website snapshot/report metadata present. Existing credentials used only in child environment. No upload/delete/download of database objects. |
| `rclone cat` newest website report                                                                                                          | Small metadata JSON read, hash retained; no website rows downloaded.                                                                                                                                  |
| h2 mount inventory; h3/h4 Docker attempts and k3s unit status                                                                               | Persistent mounts captured; Docker reads unavailable on h3/h4, h4 server DB path unreadable. Cluster/state protection unproved.                                                                       |
| Pinned `git show`, scoped `rg`, local full-depth history                                                                                    | Historical missing app-label contract and current Compose versus descriptor acceptance behavior read. Static findings, not freshly executed behavior tests.                                           |

Runtime/registry/backup collectors are retained privately alongside their outputs.
The later evidence consistency check validates every retained digest join and
recovery size comparison; it does not authenticate the observer or recreate the
missing historical build attestation.

Exploratory reads explicitly not used as positive evidence: `rg` is unavailable
on h1 (exit 127; Python reads used instead); guessed local install/check source
filenames did not exist (exit 2; actual callers/targets subsequently read); the
root-level release.json and the guessed `dist/tool-remote-scripts/smoke.js` path
were absent. The correct default release and `dist/tool-smoke/smoke.js` were read
and preserved, so neither guessed-path miss establishes a missing actual bundle.

## Scope not executed

No build/publish, gate rerun, live deploy, executor installation, source checkout
reset, settings/secret edit, production request mutation, alert delivery, failure
injection, prune, restore or backup creation was performed. Scheduled jobs ran
independently; their status is not an audit-triggered execution.

No full host gate, runtime unit/browser/lint/type/build suites or OpenSpec-wide
validation is claimed by this docs-only diagnosis. The currently failed main
gate remains a real candidate blocker. Source inspection of existing tests is not
reported as a passing fresh test. The actual Compose label/gate negative tests,
exact replacement candidate, canonical host gate and release acceptance remain
future work; no production permission is inferred.

## Documentation checks

- Evidence consistency: passed for three immutable manifest/config/local-image
  joins, six current encrypted members, missing historical records, the baseline
  gate failure and all 13 retained private receipt hashes. Local report links exist.
- `bun tools/tool-devsync/src/check-documents.ts`: passed, including module indexes.
  An initial historical path was phrased as a current inline path and refused; the
  report now identifies it explicitly as historical, with its exact value in the
  evidence. The index subprocess also required ordinary worktree metadata writes
  and staging the new paths; the sandbox and untracked-path attempts refused.
  After staging, the full check passed with authorized metadata access.
- `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-root-migration working . HEAD docs/findings/root-migration.v1.json`:
  passed, 3 source roots / 58 blocks. The first sandbox attempt could not create
  Git snapshot objects; the authorized rerun passed.
- Targeted `bunx prettier --check` and `git diff --cached --check`: passed.
  Normal commit hooks repeat the staged formatter/secret/private-nesting checks.
- Independent review: no Critical or Important issues. Reviewer independently
  verified 13 receipt hashes, three image/config joins, six recovery size checks,
  backup source fingerprint and local links. Its W02/W04 prerequisite clarification
  was incorporated without reopening completed repairs.
- Publication uses normal Git hooks. Their output and exact-head GitHub verdicts
  are retained with the commit/PR. Docs-only selection proves documentation checks,
  not release qualification; no external certified-wiki admission is claimed.
