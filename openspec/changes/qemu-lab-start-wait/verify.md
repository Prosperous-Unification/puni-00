# Verification

## 2026-09-27

- Red: `env -u CLAUDECODE bun test src/lab.test.ts -t 'starting a QEMU'` on the unchanged `lab-qemu.ts`: `waits for a daemon that writes its owned pid after the start command returns` failed with `QEMU did not leave puni-vm-start-server-1 running`.
- Green: `env -u CLAUDECODE bun test src/lab.test.ts`: 14 pass, 0 fail.
- R5 poll: restoring the immediate check made the delayed-pid test fail with `QEMU did not leave puni-vm-start-server-1 running` [28 ms].
- R5 deadline: removing `waitFor`'s throw made `refuses when no pid file appears within the bound` time out at Bun's 5000 ms limit instead of failing with the deadline message.
- The live QEMU lab was not run for this change.
