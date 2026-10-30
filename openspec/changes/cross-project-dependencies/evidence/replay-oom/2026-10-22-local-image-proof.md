# Replay capability image memory proof

PR #630's `k3s-rehearsal` failed both forward and rollback `replay-kinds`
Jobs with exit 137 and `OOMKilled`, before producing capabilities. This packet
reproduces that failure locally; it does not claim a full k3s rehearsal or host gate.

## Exact image experiment

Both images were built in disposable local directories with
`docker build -f apps/wbs/be-01/Dockerfile -t <tag> .`, including frozen production
dependencies. The baseline source is pushed commit `1cef3d8e4`; the patched source
changes only the replay vocabulary extraction, CLI import and regression test.

- Baseline `puni-pr630-repro:1cef3d8e4`:
  `sha256:cf93ecc815244c4687e1e454a7bf1204bc33bca9de9c25a3b75ccbd5514dc6ec`.
- Patched `puni-pr630-repro:leaf-fix`:
  `sha256:67706286af573810415ac2b2e6c18ddf87f3a38cf29fb69f4dd65acfa296035c`.

The capability argv came from `buildReplayCapabilitiesCommand()` at the exact
baseline revision:

```sh
sh -c 'if ! test -d src || ! test -r src || ! test -x src; then exit 74; elif test -f src/step-blockage-replay-kinds-cli.ts; then bun run src/step-blockage-replay-kinds-cli.ts; elif test -e src/step-blockage-replay-kinds-cli.ts || test -L src/step-blockage-replay-kinds-cli.ts; then exit 73; else printf '\''[]\\n'\''; fi'
```

Container flags matched the Job's memory/security boundaries:
`--network none --user 10001:10001 --read-only --cap-drop ALL
--security-opt no-new-privileges --tmpfs /tmp:rw,size=256m,uid=10001,gid=10001
--env HOME=/tmp --env DB_PATH=/data/wbs.sqlite --memory 512m --memory-swap 512m`.
The comparison run raised only the memory and swap bounds to `1024m`.
The Job requests 50m CPU and 128Mi memory but has no CPU limit; those scheduling
requests do not constrain this standalone process.

| Source and command                   | Limit | Observed outcome                                      | Peak RSS (KiB) | Cgroup memory.peak (bytes) |
| ------------------------------------ | ----- | ----------------------------------------------------- | -------------- | -------------------------- |
| Baseline capability, exact argv      | 512Mi | Exit 137; Docker `State.OOMKilled=true`; empty stdout | Unmeasured     | Unmeasured                 |
| Baseline capability, measured repeat | 1Gi   | Exit 0; four capabilities                             | 745172         | 741818368                  |
| Patched capability                   | 512Mi | Exit 0; four capabilities                             | 14904          | 5951488                    |
| Patched coordinator inventory        | 512Mi | Exit 0; `[]`                                          | 19020          | 6221824                    |

The first successful uninstrumented-baseline comparison with BusyBox time at 1Gi
measured 755660KiB peak RSS. The table uses the later run that also recorded
cgroup peak. Measurements wrap argv with `/bin/busybox time -v`, then read
`/sys/fs/cgroup/memory.peak` before the container exits. Cgroup accounting can
exclude pages already charged elsewhere, so RSS and cgroup peak are different
observations. The 512Mi failing run used exact argv without a timing wrapper.

Inventory used the coordinator's exact generated `buildReplayInventoryCommand()`
against a readable SQLite fixture containing an empty `__drizzle_migrations(name)`
and empty `command_journal(payload,inverse,preconditions)`. This proves the empty,
pre-marker inventory startup path; it does not establish memory for large journals.
An earlier baseline-image inventory run also passed 512Mi, at 19044KiB RSS.

## Regression and focused checks

The regression runs the real CLI source as a Bun subprocess with `@wbs/core`
redirected to an exporting barrel that throws `application barrel loaded`.
Before the change it failed on that injected dependency fault; after importing
the dependency-free leaf it prints exactly `replace_blockage`, `move_progress_v1`,
`delete_state_v1`, and `step_blockage_activation_v1`. Removing `delete_state_v1`
from the production leaf separately made the output assertion fail. Both faults
were restored before final checks; adjacent `Proof:` comments name them.

- `bun test apps/wbs/be-01/src/step-blockage-replay-kinds-cli.test.ts tools/tool-deploy/src/k8s/replay-capability.test.ts tools/tool-deploy/src/k8s/cutover-replay.test.ts tools/tool-deploy/src/k8s/execute-adapter.test.ts libs/wbs/application/core/src/service/compensating.test.ts`: 176 passed, 552 assertions.
- `bunx tsc --build --force apps/wbs/be-01/tsconfig.json libs/wbs/application/core/tsconfig.json`: exit0.
- Changed-file ESLint: exit0 after `NX_DAEMON=false bunx nx show project wbs-core --json` generated the graph. Initial direct lint skipped the boundary rule, so that invocation alone was insufficient. Nx fell back from forbidden worker sockets to its main process; graph generation completed.
- `bunx openspec validate --all --json`: exit0, all entries valid.

Raw local logs remain under `/tmp/puni-pr630-*.log`, including
`puni-pr630-repro-cap512.log`, `puni-pr630-baseline-cgroup.log`,
`puni-pr630-fixed-capabilities-final-measured.log`, and
`puni-pr630-fixed-inventory-final-measured.log`. These paths are diagnostic
artifacts, not durable CI receipts. Full k3s, full build, hosted CI and host gates
remain unrun for this bounded repair.

Normal lefthook commit checks passed after ESLint fixed the extracted reexports ordering; no hooks were bypassed.
