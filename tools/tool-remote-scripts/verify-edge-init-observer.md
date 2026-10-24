# Init observer implementation evidence

This is local implementation evidence, not an operational authorization or a native two-container acceptance receipt. The source baseline was reviewed core `4042f5d68be4768bf1f0b896d60eae856db32496`, plus coordinated transport `25a836831` (local cherry-pick `6a9bdfb72`). No production host or Docker operation was performed.

The production entry fixes its Engine socket, UID1000 context, target names, five inherited lock paths, collector, stopped-unit observation, crontab command, Caddy Exec templates and GET probes. Internal exports expose parsers and native file/process/network guard algorithms to owned fixtures; they do not construct alternate execute factories or accept successful admission callbacks. The narrow kernel/storage worker reuses the existing privileged subreaper supervisor and `joinAuthoritySupervisor`, including descendant cleanup and terminal settlement.

## Observed checks

- Bun1.4.4: focused constructor/transport/operation/observer suite: **59 passed, zero failed**. The observer's13 cases exercise actual local files, kernel process observations, flock open descriptions, HTTP, TLS/SNI, authenticated registry reads and WebSocket upgrade/close IO. TLS fixtures use an ephemeral test CA in a separate test process; production does not accept a CA/socket/probe callback option.
- Actual Nx ProjectGraph generated with `NX_DAEMON=false bunx nx show project tool-remote-scripts --json`.
- Configured `tool-remote-scripts:typecheck`: passed with cache skipped.
- Configured `tool-remote-scripts:lint`: passed with cache skipped after fixing one test callback lint error. An earlier failed run is not counted as success.
- Configured `tool-remote-scripts:build` and its three prerequisites: passed with cache skipped. This baseline build target does not yet bundle the separate CLI, which belongs to the coordinated CLI lane.
- Configured unit target attempted through `nx run-many --targets=test --projects=tool-remote-scripts --excludeTaskDependencies --skip-nx-cache`. It produced no task output after the target roster and was canceled (exit130); **the configured full unit target remains unverified**. Its Docker-dependent `test:caddy` prerequisite was explicitly excluded because Docker/native acceptance belongs to the root lane. No full host gate was run here.

## Watched guard omissions

Each temporary omission below made the corresponding negative fail; exact source was restored before the59-test green run. The first stopped-unit omission escaped the initial test because its independent hash also rejected the queued job; the test was strengthened to use the queued projection's matching hash, and the repeated omission then failed.

| Omitted production guard        | Observed negative                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| HTTP raw body SHA256            | changed HTTP bytes admitted                                                         |
| TLS certificate verification    | untrusted certificate admitted                                                      |
| WebSocket accept digest         | malformed upgrade admitted                                                          |
| Registry manifest body digest   | wrong bytes behind the expected digest header admitted                              |
| Complete route count            | uncovered server with otherwise matching full configuration admitted                |
| `assertInheritedLock`           | independently opened descriptor admitted while the actual description held the lock |
| Operation expiry                | expired operation admitted                                                          |
| Native init executable hash     | substituted executable hash admitted                                                |
| Native proc start-tick readback | injected PID reuse admitted during actual owned-process reading                     |
| Caddy directory membership hash | unknown directory member admitted                                                   |
| Native stopped-unit predicate   | queued job admitted despite matching independently supplied projection hash         |
| Preparation error redaction     | synthetic private pathname escaped in native diagnostics                            |

## Evidence limits

The factory's complete UID1000 production-path composition, real sudo transport for the extra native reader, full suspended host collector, actual Caddy graph, source/build/provenance pins, immutable resource roster, process/namespace/default-route pins, concrete packet, receipt recovery and whole operation still require independent review and root-owned native acceptance. These local tests do not establish live quiescence, registry-writer fencing, storage holds or permission to stop anything. Additional admission branches reuse the existing authority/lock/file checks and their existing proofs; no new complete-factory omission matrix is claimed here.
