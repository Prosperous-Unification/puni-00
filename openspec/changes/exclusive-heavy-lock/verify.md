# Verification Report

**Change**: `exclusive-heavy-lock`
**Verified at**: `2026-09-27`
**Verifier**: lane `heavy-lock-exclusive`, worktree `/home/df/wd/puni/b9-heavy-lock-exclusive`

## Host probe (read-only, h2puni, temp dir under /tmp)

Two claimants released together by a start file, 300 races each, on 2026-09-27 at load ~9:

```
mkdir both-won 10/300        # /usr/bin/mkdir: uutils coreutils 0.8.0
gnumkdir both-won 0/300
noclobber both-won 0/300     # (set -C; : >f)
```

Sequential `mkdir` on an existing directory still fails there (`File exists`, exit 1).

## Tests

- `env -u CLAUDECODE bash bin/heavy-lock.test.sh` — `all heavy-lock checks passed` (only
  `/bin/bash` 5.x here; no Homebrew bash on this Linux host, so the 3.2 leg is CI/macOS-only).
- `env -u CLAUDECODE bash bin/h2puni-gate.test.sh` — `all cases passed`.
- `env -u CLAUDECODE bun test tools/tool-dagger/src/heavy-lock.test.ts` — 6 pass, 0 fail.
- `shellcheck bin/heavy-lock-lib.sh bin/heavy-lock.test.sh` — clean.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` — 132 of 132 valid.

## R5 proofs

- Red on the `mkdir` claim (origin/main's library, new test): `28a: 2 of two claimants hold the
lock under an always-succeeding mkdir`, the same for `28b`, `28c … want exit 75, got 0`,
  `28d: the old-format holder's record was replaced or removed`, `28e … want exit 70, got 0`.
- `acquire_heavy_flock` short-circuited to `return 0`: `28a` and `28b` fail with `claim statuses:
0 0`, 3 runs of 3 and again after the review fixes.
- Unwind removed from the refused recording: `28h: the flock was still held after a refused
recording`. `"$@" 9>&-` restored in place of the subshell: `28j: the flock was held during the
caller's cleanup`.
- 28e/28f are the absent-perl negative: a PATH without `perl` is refused 70 naming perl.

## Not run

The h2puni host gate (integration gating: the orchestrator gates the combined round).

## Gate queue environment isolation, 2026-10-25

This restores the gate entrypoint's existing documented contract: its queue budget belongs to
its same-shell lock function, never child processes. A plain assignment retains an inherited
export attribute, so the entrypoint now explicitly removes that attribute after its default.
Default 1800, explicit refusal 0, nonzero overrides, exported SHA label, lock ownership, traps
and gate steps remain unchanged. No new policy or OpenSpec behavior is introduced.

- Bun 1.4.4 actual-entrypoint regression: before the fix, default passed but exported 0/7200
  leaked into the child environment (1 pass, 2 fail). Removing only `export -n` reproduced
  those same two failures; restoring it passed all three controls / 18 assertions.
- The fixture copies the complete production entrypoint and mocks only the lock library:
  its same-shell `with_heavy_lock` sees 1800/0/7200, a spawned child sees the budget absent
  and the exported resolved-SHA label present. It takes no canonical lock and runs no heavy
  gate steps or long fake wait.
- Full `heavy-lock.test.ts`: 9 pass / 29 assertions. `env -u HEAVY_LOCK_WAIT_SECONDS bash
bin/h2puni-gate.test.sh`: all cases passed. `shellcheck bin/h2puni-gate.sh` and `bash -n`
  passed. `tsc --build --force tools/tool-dagger/tsconfig.json` and configured test
  classification passed. Initial test annotation errors were corrected with an explicit
  `NodeJS.ProcessEnv`; the restored three controls passed again after that correction.
- Hosted CI, canonical host gate, peer review and normal commit hooks remain separate checks
  until recorded by the source handoff and orchestrator.

### Gate entrypoint cache input, 2026-10-25

The actual-entrypoint regression reads `bin/h2puni-gate.sh` outside tool-dagger's project.
Its cached `test` target now declares that exact file as an input; no oracle, cache setting,
project edge or test behavior changes.

Proof: the existing production oracle `names every file a suite reads from outside its own
project` failed with `tool-dagger:test does not declare bin/h2puni-gate.sh` before the declaration
(0 pass, 1 fail), then passed with it (1 pass, 2 assertions). The omitted-input control was
replayed in a disposable detached worktree; no gate script was edited in the shared candidate.

A native Nx `InProcessTaskHasher` probe in that disposable worktree measured the actual
`tool-dagger:test` hash. Each phase used a fresh `NX_WORKSPACE_DATA_DIRECTORY` and process:

| Declared gate input | Baseline            | Gate comment edit   | Restored bytes      |
| ------------------- | ------------------- | ------------------- | ------------------- |
| No                  | 4818375019595797862 | 4818375019595797862 | 4818375019595797862 |
| Yes                 | 4163411403700645528 | 6667071901470446934 | 4163411403700645528 |

Nx's collected files excluded the gate when omitted and included it when declared. An initial
warm-cache probe retained the edited hash after restoration; it did not establish restoration.
The isolated cold-cache phases above supersede that partial result and assert both restoration
and the expected sensitivity. The temporary script edits and project declaration were restored
in the disposable worktree. No full gate, commit or public action was performed for this fix.

The complete existing `workspace-targets.test.ts` suite passed (26 tests, 96 assertions).
Prettier accepted the project declaration and formatted this receipt; strict validation of
`exclusive-heavy-lock` passed. No TypeScript source changed, so no new compiler or TypeScript
lint run was needed. Exact local logs: `/tmp/puni-gate-input-oracle-red.log`,
`/tmp/puni-gate-input-oracle-green.log`, `/tmp/puni-gate-input-workspace-targets.log` and
`/tmp/puni-gate-input-hash-receipt.json`. Hosted CI and the canonical full gate remain separate.

### Committed target selector synchronization, 2026-10-25

The earlier test-input addition is now copied into the existing `check.tool-dagger.test`
`expectedConfiguration.inputs` in both `docs/wiki-policy/relationships.json` and
`relationships.bootstrap.json`. These facts pin the complete static-extractor configuration;
this is exact snapshot synchronization, not a new authority rule. Each file adds only
`{workspaceRoot}/bin/h2puni-gate.sh` after the existing `with-heavy-lock.sh` input.

Proof: the exact four CI failures were reproduced through existing production tests (0 pass,
4 fail, 84 assertions), then passed after the two additions (4 pass, 98 assertions, 40.43s):
both committed-target-facts comparisons and pilot-policy's observe-lint positive and stale
Burokrat-command refusal. The latter again reaches its intended `check.wiki-cli.test` mismatch
instead of being intercepted by stale `check.tool-dagger.test` configuration.

Each pin was independently omitted: its named committed-target-facts comparison failed while
the other passed (1 pass, 1 fail). Restoring both pins passed both comparisons. No test, static
extractor, canonical authority comparison, cache flag or policy was changed. Structural
comparison permits only the single input insertion in each target fact: full facts remain 15,
bootstrap facts remain 7, both edge arrays remain empty and every other field is identical;
`cache:true` remains unchanged.

The focused command used the configured target's trusted-module environment:
`TOOL_WIKI_TRUSTED_NODE_MODULES=/tmp/puni-gate-wait-env-main/node_modules bun test --preload
./tools/test/scratch/preload.ts apps/twilight-structure/twilight-burokrat/cli/src/relationships/committed-target-facts.test.ts
apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts --timeout=60000 -t
'matches what the static extractor reads|pins exact pre-index tuples|refuses a stale Burokrat test command'`.
An initial local replay without that environment hit the separate trusted-runtime-modules
requirement and was superseded by the configured RED/GREEN runs above.

Local receipts: `/tmp/puni-gate-authority-four-red-configured.log`,
`/tmp/puni-gate-authority-four-green.log`, `/tmp/puni-gate-authority-structural-audit.json`,
`/tmp/puni-gate-authority-omission-receipt.json` and `/tmp/puni-gate-authority-restored.log`.
No TypeScript or runtime source changed. Hosted CI, canonical full gates and publication
remain separate checks; no commit or public action was performed by this source actor.
