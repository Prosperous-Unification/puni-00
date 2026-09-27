# Verification

## 2026-09-27

- Red: `env -u CLAUDECODE bun test src/lab.test.ts -t 'starting a QEMU'` on the unchanged `lab-qemu.ts`: `waits for a daemon that writes its owned pid after the start command returns` failed with `QEMU did not leave puni-vm-start-server-1 running`.
- R5 poll: restoring the immediate check made the delayed-pid test fail with `QEMU did not leave puni-vm-start-server-1 running` [28 ms].
- R5 deadline: removing `waitFor`'s throw made `refuses when no pid file appears within the bound` time out at Bun's 5000 ms limit instead of failing with the deadline message.
- R5 exited daemon: letting `ownedQemuPid` accept a pid whose `/proc` entry is gone made `refuses a pid file whose daemon already exited, at the bound` resolve (`the start was expected to refuse`).
- R5 unreadable pid file: letting `readPid` treat every read error as absent made `refuses an unreadable pid file at once instead of waiting it out` time out at 5000 ms instead of refusing at once.
- Green: `env -u CLAUDECODE bun test src/lab.test.ts`: 16 pass, 0 fail.
- `NX_DAEMON=false bunx nx run-many -t typecheck lint:fast -p tool-fleet`: status 0.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`: 119 passed, 0 failed.
- Prettier check on the touched files: status 0.
- `nx run tool-fleet:test` locally: 354 pass, 1 fail, the unrelated `the production discover command > distinguishes subprocess failures…` timing out at 10000 ms; the same test fails the same way on unchanged main `5252968a3` in this environment.
- The live QEMU lab was not run for this change.
