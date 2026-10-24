# Installed authority collector executable descriptor correction

The collector now binds executable digest bytes to the named `/proc/<pid>/exe` object. One fixed-path reader opens that proc magic link, checks the real descriptor's regular-file mode, 128 MiB ceiling and full device/inode/mode/size/mtime/ctime tuple against the original named metadata, reads incrementally under the collector deadline, compares descriptor and named metadata again, and closes the descriptor in `finally`. Internal capture, relevant/internal observation, and the late selected-database opener all use it. The late path retains the original executable metadata across the FD census. The output schema and process classification are unchanged.

## Watched production paths

- Actual owned `/bin/sleep` copies A and B had equal SHA-256 bytes and distinct inodes. During the recorded run, the named running executable was `66307:15035383`; the substituted opened object was `66307:15035384` (`/tmp/puni-collector-fd-inode-evidence.log`). Only the raw open was redirected. The original algorithm accepted B in `capture_internal_process`; the first test run failed with `accepted wrong opened executable inode in capture` before the code change.
- With both descriptor comparisons deliberately omitted, the same real-child test failed with `accepted wrong opened executable inode in capture,relevant,opener` (`/tmp/puni-collector-fd-guard-omission.log`). Each caller was independently rewired to the prior unchecked read and failed only its own route: `/tmp/puni-collector-fd-{capture,relevant,opener}-wiring-omission.log`.
- Removing only the pre-read descriptor equality failed because B's real FD was read before the final check refused it (`/tmp/puni-collector-fd-precheck-omission.log`). Removing only the post-read descriptor equality failed because `dup2` replaced the already checked A descriptor with real B during its first read while the named proc target remained A; the reader accepted the changed descriptor (`/tmp/puni-collector-fd-postcheck-omission.log`).
- Independently removing the regular-file or 128 MiB size guard read an actual pipe or oversized sparse file before refusal (`/tmp/puni-collector-fd-{mode,size}-omission.log`). Removing PID validation reached the executable opener with `../` (`/tmp/puni-collector-fd-pid-omission.log`).
- Removing `finally: os.close(descriptor)` failed the healthy-path and injected-read-fault EBADF assertions (`/tmp/puni-collector-fd-close-omission.log`). The restored test also checks closure after wrong-inode, post-read-swap, injected-stat failure, deadline, named-change, oversized and nonregular-file refusals. Absent proc executable and injected EACCES remain distinct. The relevant/internal identity and inherited selected database FD remain actual child observations; no canned hash, named stat or fstat is used in these path tests.

The complete Python fixture adapter uses raw memfd or the owned solver fixture file for its executable descriptor, and reopens `/proc/self/fd/<n>` to get an independent file offset on repeated scans. Its named executable metadata comes from the same actual object. This is only a local fixture boundary; no production fallback was added.

## Fresh checks and limits

- `bun test tools/tool-remote-scripts/src/lib/installed-authority-collector.test.ts tools/tool-remote-scripts/src/lib/installed-authority-observer.test.ts`: 34 pass, 0 fail, 79 assertions.
- `bun test tools/tool-remote-scripts/src/lib/installed-authority-transport.test.ts`: 4 pass, 0 fail; unchanged outer transport still sanitizes stderr and failure causes.
- `bunx tsc --build --force tools/tool-remote-scripts/tsconfig.json`: exit 0.
- `bun build tools/tool-remote-scripts/src/lib/installed-authority-collector.ts --target=bun --outfile /tmp/puni-collector-fd-bundle.js`: one module bundled, exit 0.
- `NX_DAEMON=false bunx nx run tool-remote-scripts:lint`: configured project target succeeded. Nx reported that plugin worker sockets were unavailable in the sandbox and ran plugins in process.

No full workspace gate, native root collector, host operation, Docker, SSH, sudo, unshare or workflow dispatch ran. A raw-open substitution is an injected boundary fault; it does not claim that unmodified Linux procfs spontaneously returns B.
