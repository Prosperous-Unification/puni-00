# Project rank port boundary verification

Verified 2026-10-16 in isolated clone `/tmp/wbs-project-rank-port-oct16`.
Base: `3e06eb5a409fdc2be9ab0bc42970453ccf0f65f3`.
Implementation candidate: `7319b58fe6486ae8eb0e7bc101ea6af4b7a817ec`.

## Scope and implementation

`ProjectRankResourceOptions.projects` now accepts the neutral `ProjectList` port,
expressed only with existing `ResourceAccess` and `ProjectWithAccess` types.
The composition root at `apps/wbs/be-01/src/app.ts` still injects `opts.projects`.
No executable rank behavior, authorization, writer, fan-out or rollback code changed.
All four task slices are implemented. No new domain term or ADR was needed;
`design.md` is omitted because this is one reversible interface extraction.
The new `project-rank-boundary` delta is intentionally unsynced pending release.

## Committed production K6 oracle

The production CLI, not a copied graph implementation, evaluated each committed
candidate with the same external policy. The tracked policy was copied out and
augmented only with the core production tsconfig and rank public entrypoint.
[policy.json.txt](evidence/policy.json.txt) preserves its exact bytes (SHA-256
`5885c9123745f2ff469cf8f486abc3ba4b8bb729d4f3628eaccd501006fc9422`).
K6 remains in observe mode. Its CLI exit 0 and `allowed:true` mean findings are
debt; the separate exact-edge oracle asserts the requested boundary and equality
of all unrelated findings. `certifies:false` is preserved throughout.

```sh
cp openspec/changes/project-rank-port-boundary/evidence/policy.json.txt /tmp/project-rank-k6-policy.json
TOOL_WIKI_TRUSTED_NODE_MODULES=/home/df/wd/puni/puni-00/node_modules \
  bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check committed \
  . <candidate-sha> /tmp/project-rank-k6-policy.json --rule K6 > /tmp/verdict.json
python3 openspec/changes/project-rank-port-boundary/evidence/check-boundary.py.txt \
  openspec/changes/project-rank-port-boundary/evidence/baseline.json.txt /tmp/verdict.json
```

Bun: `1.4.2+744846f84`. Trusted external TypeScript: `6.0.2`.
CLI source subtree: `67f95403fffe6730aa1060e6132484d74d5f702b`.
Frozen installation passed: `Checked 1573 installs across 1447 packages (no changes)`.
Lockfile SHA-256: `15651c976776d7c1ab3a87935b53dae67e73939c6f7d06dec12ed10598cfe80c`.
An initial attempt using this clone's node_modules was correctly unevaluated:
`trusted TypeScript runtime modules must be outside the candidate`. All recorded
observations below use the external trusted modules and have `unevaluated:[]`.

| Candidate                                               | Observation                                                      | Exact-edge oracle                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Base `3e06eb5a409fdc2be9ab0bc42970453ccf0f65f3`         | Five K6 findings, including rank → project resource              | Exit 1, `concrete project resource edge remains` before implementation |
| Neutral port `7319b58fe6486ae8eb0e7bc101ea6af4b7a817ec` | Four K6 findings, rank edge absent                               | Exit 0, exact edge removed and four unrelated findings preserved       |
| Direct fault `3498665e94ccf7b77735a27e683cbf35af852bb8` | Five findings; rank edge restored                                | Exit 1, `concrete project resource edge remains`                       |
| Barrel fault `811801551b0db6a9a7799036ce43ef71c0fb8ebc` | Five findings; rank → port re-export → project resource resolved | Exit 1, `concrete project resource edge remains`                       |

The fault candidates are temporary commit-tree objects built from the implementation
candidate with separate temporary indexes; the working tree stayed neutral while
checks ran. Their reconstructable changes are [direct.patch.txt](evidence/direct.patch.txt)
and [barrel.patch.txt](evidence/barrel.patch.txt). Raw verdicts and observed assertion
failures live beside them. Both negatives use the production committed-candidate
path, including its TypeScript graph and transitive re-export resolution.

The four remaining findings are unchanged: imported-plan resource → directory and
work-item resources; space resource → project and work-item resources. This is a
core-config K6 observation, not a whole-repository survey or enforcement activation.
Other rules, frontend graphs, full workspace tests/build and host release acceptance
are outside this slice's evidence.

## Failure proofs

| Check                                                                        | Injected fault                                                          | Observed failure                                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Exact rank boundary, production K6 CLI plus retained `check-boundary.py.txt` | Restore original direct concrete type import                            | Exit 1 at the exact rank/project edge assertion; `direct-oracle.log.txt` |
| Same check through transitive resolution                                     | Import concrete ProjectService through a neutral-looking port re-export | Exit 1 at the same assertion; `barrel-oracle.log.txt`                    |

No runtime safety check changed. Adjacent `Proof:` on `ProjectList` names both
observed faults and this report. Filesystem absence/unreadability is not a new
boundary in this change.

## Scoped checks

```sh
bun test apps/wbs/be-01/src/controller/project-rank.controller.db.test.ts \
  libs/wbs/adapters/store-sqlite/src/project-rank.db.test.ts --timeout=10000
NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-core,wbs-be-01 --skip-nx-cache
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:lint --skip-nx-cache
BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate --all --json
```

Mounted controller and SQLite suites: **28 pass, 0 fail, 90 assertions**.
They cover authorization, foreign/absent projects, names/order, current membership
rechecks, rank writes, shared-person fan-out, rollback after a later event insert
fails, and writer release before recipient transport. The rollback test emits its
expected injected SQLite failure log and passes.
Scoped typecheck: **four tasks passed**, including both module typechecks and
core/backend TypeScript builds. Nx reported denied worker sockets and used its
supported in-process plugin fallback. No typecheck task was skipped.

OpenSpec validation: **215 items passed, 0 failed** (197 changes, 18 specs).
Scoped output is retained in `evidence/`; the lint transcript normalizes CRLF.
Core scoped Nx lint passed with zero errors. Prettier check passed for both
production files and all change Markdown files; `git diff --check` passed.

Full `bunx nx format:check --all`, full `bunx nx run-many -t test lint typecheck build`,
and `bin/h2puni-gate.sh <sha>` were **not run**, as explicitly assigned to the
coordinating agent's release stage. This report does not claim host acceptance.
No push, merge, deployment, archive, ratchet or policy activation was performed.
Normal lefthook hooks were installed and ran for the implementation commit;
initial ESLint hook output warned that no cached Nx graph existed, so its Nx
module-boundary rule was skipped there. The later scoped Nx commands build that
graph and provide separate lint/typecheck evidence.
