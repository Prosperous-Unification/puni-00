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
