# Init observer implementation evidence

This is local implementation evidence, not operational authorization or a native two-container acceptance receipt. Baseline: reviewed core `4042f5d68be4768bf1f0b896d60eae856db32496` plus transport `25a836831` (local equivalent `6a9bdfb72`). The first observer checkpoint is `875a80c83`. No production host or Docker operation was performed.

The production entry fixes its Engine socket, UID1000 context, target names, inherited lock paths, collector, stopped-unit observation, crontab command, Caddy Exec templates and GET probes. Internal exports expose parsers and native file/process/network guard algorithms to owned fixtures; they do not construct alternate execute factories or accept successful admission callbacks. The extra kernel/storage worker reuses the existing subreaper supervisor and `joinAuthoritySupervisor`, including descendant cleanup and terminal settlement.

## Observed checks

- Bun1.4.4 focused constructor/transport/operation/observer suite: **68 passed, zero failed,215 assertions**. The observer's22 cases use actual owned files, kernel process observations, flock open descriptions, HTTP, TLS/SNI, registry reads, WebSocket upgrade/close IO, Compose source semantics and private receipt readback. TLS fixtures use an ephemeral test CA in a separate test process; production exposes no CA/socket/probe callback option.
- Actual Nx ProjectGraph generated with `NX_DAEMON=false bunx nx show project tool-remote-scripts --json`.
- Configured `tool-remote-scripts:typecheck` and `lint`: passed with cache skipped, including the provenance followup. Earlier lint failures were fixed and are not counted as success.
- Configured `tool-remote-scripts:build` and three prerequisites: passed with cache skipped. That baseline target does not yet bundle the separate CLI, owned by the CLI lane.
- Standalone observer bundle: `bun build tools/tool-remote-scripts/src/lib/edge-init-observer.ts --target=bun --outfile /tmp/puni-edge-init-observer.js`: passed,35 modules. The full fixed supervised native-reader program is62,210 bytes, below its96 KiB bound.
- The first configured unit attempt without disabling Nx TUI was canceled (exit130) without task output. Retry with `NX_DAEMON=false NX_TUI=false bunx nx run-many --targets=test --projects=tool-remote-scripts --excludeTaskDependencies --skip-nx-cache --output-style=stream` settled **exit1:2479 passed,3 failed,2 skipped;2484 cases/105 files/651.74 seconds**. It began at the first observer checkpoint; later provenance changes have separate focused green evidence above. The Docker-dependent `test:caddy` prerequisite was explicitly excluded. The suite also skipped two real-Docker exceptional-cleanup tests. No full host gate ran here.
- Broad failures: unchanged `src/install.test.ts:129` JSDoc adjacency and two `source-dev-inputs.test.ts` role-abort cases at10 seconds. One requested scoped rerun with the same10-second timeout admitted both role-abort cases (857.62/725.19 ms); the doc contract reproduced its failure. No unrelated source was edited.
- Exact scoped logs: `/tmp/puni-observer-source-inputs-scoped.log`, `/tmp/puni-observer-install-scoped.log`. Captured full-target chunks/summary: `/tmp/puni-observer-configured-unit-captured.log`; some early Nx chunks were truncated, so the scoped doc log is authoritative for exact received JSDoc/Proof text and stack.

## Watched guard omissions

Each listed temporary omission made its negative fail; exact source was restored before focused green runs. The first stopped-unit omission escaped because the independent hash also rejected a queued job; supplying that queued projection's matching hash made the native stopped predicate independently falsifiable.

| Omitted production guard          | Observed negative                                                             |
| --------------------------------- | ----------------------------------------------------------------------------- |
| HTTP body SHA256                  | changed raw response bytes admitted                                           |
| TLS verification                  | untrusted certificate admitted                                                |
| WebSocket accept digest           | malformed upgrade admitted                                                    |
| Registry body digest              | wrong manifest bytes behind expected digest header admitted                   |
| Complete route count              | uncovered server admitted despite matching full configuration hash            |
| `assertInheritedLock`             | independently reopened FD admitted while the actual description held the lock |
| Operation expiry                  | expired operation admitted                                                    |
| Native init executable hash       | substituted executable hash admitted                                          |
| Proc start-tick readback          | injected PID reuse admitted during actual owned-process reading               |
| Caddy directory membership        | unknown directory member admitted                                             |
| Stopped-unit predicate            | queued job admitted despite its matching independent projection hash          |
| Preparation error redaction       | synthetic private pathname escaped                                            |
| Complete operation packet roster  | changed nonce escaped operation binding                                       |
| Private operation mode            | public operation record admitted                                              |
| Backend uniqueness                | duplicate backend pins admitted                                               |
| Recovery stage roster             | unknown private receipt stage admitted                                        |
| Crontab native status/diagnostics | absence became present empty bytes                                            |

## Installed Compose correction

Addendum B removes `resolvedCompose` entirely. Each target independently pins its own ordered `composeFiles`; its original native fingerprint and exact config-files label must match that order. Canonical ordinary sources are held/rechecked and compared to independent provenance pins. Positive fixtures use checked-in `deploy/compose/base.yml`, Caddy's base plus three other-service files, and registry's separate one-file recipe. Full future Compose equivalence is not claimed; effective preservation comes from the native comparator.

The conservative quote-aware source pass rejects unsupported YAML constructs before Bun parsing, counts unique root/service/selected-property keys, requires one direct source-literal `init: true`, and checks parsed ancestry key agreement. A primary real source-boundary regression supplies self-consistently pinned false/missing YAML while good historical JSON remains present, then removes that JSON; both refuse on source semantics. Other cases cover later selected definitions (false, missing, even true), wrong/reordered/duplicated/unpinned recipes, duplicates/shadow keys, include/extends/profiles, anchors/aliases/merges/tags, documents/flow/scalar/multiline forms, interpolation, same-path byte/inode drift, unreadability/absence and secret-bearing parser causes.

Production publications use explicit `ProductionInitReceipt extends Receipt` with required `sourceRosterSha256` and `literalInitSha256`, derived from actual observations. Actual private-file readback contains the exact pair. Recovery recomputes ordered source proofs and refuses missing or mismatching metadata. Native fixture receipts retain their separate core contract.

Further watched omissions went red for the source semantic gate, native-label binding, ordered roster, root/service/property uniqueness, unsafe YAML tokens, one-definition cardinality, parsed ancestry agreement, parser/file redaction, proof publication and each recovery hash comparison. Initially, removing inner parser redaction remained safe through the outer file boundary; a direct literal-decoder parser-error regression then made the inner boundary independently falsifiable.

## Evidence limits

Complete UID1000 production-path composition, actual sudo transport for the extra reader, full suspended host collection, concrete graph/source/build/provenance/resource/process pins, the private packet, whole receipt-recovery operation and native two-container acceptance still need independent review and root-owned native acceptance. These fixtures do not establish live quiescence, remote registry-writer fencing, storage holds or permission to stop anything. Other branches reuse existing authority/lock/file safety checks and their existing proofs; a new complete-factory omission matrix is not claimed. No live-effect permission follows from this implementation evidence.
