# Owned REST/Unix relay compatibility qualification — 2026-11-09

Status: **DONE_WITH_CONCERNS**. Final attempt 4 passed the requested bounded ordinary-user transport, same-repository compatibility and committed/lost REST POST failure seams. Attempts 1–3 remain preserved failures; none is counted as a successful lost-reply qualification. This is primary evidence of feasibility on one exact local artifact/protocol case, not production admission or native transport certification.

## Artifact locations

- Owned root: `/tmp/registry-relay-qualification-20261109-YuTumm/`.
- Final executed sources: `attempt4/experiment.ts`, `attempt4/receiver.py` beneath that root.
- Final complete orchestrator receipt/argv/exit codes and transport/relay exchanges: `attempt4/receipt.json`.
- Final upstream request/version/visible-object history: `attempt4/http-summary.json`.
- Final raw CLI logs: `attempt4/<command-label>.stdout.log` and `.stderr.log`; selected EOF/retry diagnostic: `attempt4/rest-lost-post-backup.stderr.log`.
- Every payload version's actual encrypted bytes: `attempt4/ciphertext/<repository-key>.v<version-index>`; delete-marker indices have metadata but no payload file.
- Baseline receipt: `attempt4/baseline.json`; original known plaintext and exact restore directories remain under `attempt4/`.
- Independent receipt/byte audit: `audit.ts`, `audit.json`, `audit.stdout.log`, `audit.stderr.log`.
- Fresh host process absence audit: `process-audit.py`, `process-audit.json`, and its stdout/stderr logs.
- Pins: downloaded `bun-linux-x64.zip`, extracted `bun-linux-x64/bun`, `sdk-pin.json`, `restic-version.stdout.log`; artifact SHA manifest: `SHA256SUMS`.
- Failed attempts: root-level original `experiment.ts`/`receiver.py` and root receipt/logs (attempt 1), then complete `attempt2/` and `attempt3/` sources/receipts/logs.

All paths above except this requested report are beneath the owned artifact root. No private TLS key or Unix socket remains anywhere beneath it; certificates are public and retained. All source, index, branch and repository docs were read-only for this experiment. Root's independent docs work is outside this experiment's scope.

## Exact pins and consumers

- Restic executable `/tmp/registry-local-backup-tools-20261109/restic-0.19.1`; SHA256 `20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639`, verified before invocation. Fresh `version`: `restic 0.19.1 compiled with go1.26.4 on linux/amd64`.
- Bun official public artifact `https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-linux-x64.zip`; archive SHA256 `bf8ccbfb2b0b80159e0f9a6d15c55317add8077534dbc6130a3edb52fccb395c`, matching `infra/versions/toolchain.json` `binaries.solverBun`.
- Extracted executable `/tmp/registry-relay-qualification-20261109-YuTumm/bun-linux-x64/bun`; SHA256 `10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235`; version `1.4.4`; revision `38afee6c84fcf48c0edb2466aa4b27d287a59c30` (`--revision`: `1.4.4+38afee6c8`). This is an owned verified extraction, not enrolled-host evidence.
- Existing official `@aws-sdk/client-s3` **3.1161.0** resolved with `createRequire('/home/df/.codex/worktrees/66b0/puni-00/package.json')`; actual entry `/home/df/.codex/worktrees/66b0/puni-00/node_modules/@aws-sdk/client-s3/dist-cjs/index.js`, SHA256 `a0a452875773372c906cb58715f5104c59aa3ab175cbc1b109768a445208b2c3`. No dependency installed.
- Actual consumer was the raw pinned Restic CLI, running as UID **1000**. `createRegistryBackupStore`, admission, reservation/effects and stopped-source production consumers were not exercised. No `bun:test` import or mock hook was used.
- Read source orientation and owner finding first. Existing retry fixture `.py`/`.ts` and original standalone v3 wire helper were read and left unchanged. At completion the shared root's independently managed HEAD was `063a20bd7ea0dedab36398258984040f337c2a06`; this agent performed no Git mutation.

## Commands and execution boundaries

The public download command was:

```sh
curl --fail --location --proto '=https' --proto-redir '=https' \
  --connect-timeout 10 --max-time 90 --max-filesize 120000000 \
  --output /tmp/registry-relay-qualification-20261109-YuTumm/bun-linux-x64.zip \
  https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-linux-x64.zip
```

The sandbox invocation failed with curl exit 6 (DNS restricted). The identical ordinary-user download succeeded after standard reviewed sandbox permission escalation. SHA256 matched before extraction. This was public artifact access, not a privileged command or provider request.

Final experiment invocation (exec session `10487`, exit **0**):

```sh
/tmp/registry-relay-qualification-20261109-YuTumm/bun-linux-x64/bun \
  /tmp/registry-relay-qualification-20261109-YuTumm/attempt4/experiment.ts \
  /tmp/registry-relay-qualification-20261109-YuTumm/attempt4 \
  > /tmp/registry-relay-qualification-20261109-YuTumm/attempt4/run.stdout.log \
  2> /tmp/registry-relay-qualification-20261109-YuTumm/attempt4/run.stderr.log
```

The sandbox refuses socket creation (separate fresh diagnostic preserved as `sandbox-bind.stderr.log`: `PermissionError: [Errno 1] Operation not permitted`). Attempts 2–4 therefore ran after reviewed escalation solely to permit ordinary UID1000 owned Unix and loopback HTTPS sockets. No sudo, root, SSH, provider, credential, protected configuration, installation, deploy, notifications or kernel authority exercise occurred.

Bun orchestrated all Restic/OpenSSL/Python children, each in its own detached owned process group. The Python helper only implemented the controlled HTTPS S3 protocol responder. CLI child lifetime 45s; overall helper/orchestrator watchdog 150s; upstream transport 8s; responder connection read 8s; downstream socket/request 10s; manual downstream request 8s. Each child stdout/stderr was bounded at 65536 bytes, each request/response body at 1 MiB, receiver total retained payload at 32 MiB, relay requests at 1000, receiver requests at 1500, control replies at 1 MiB. Exact final per-child argv, PID/PGID, exit and output-byte counts are in `attempt4/receipt.json`; all 15 children exited 0. No final-attempt timeout, forced process-group kill, cleanup repair or receiver failure occurred.

Final orchestrator PID was `2203591`, receiver PID/PGID `2203665`; `attempt4/running.json` ends `closed-and-reaped`. Fresh host process audit at `2026-11-09T10:21:25.200915+00:00` checked 28 recorded owned groups, both recorded orchestrators and exact owned experiment/receiver command arguments: **zero survivors**. Receiver and relay were closed; all owned keys removed. The process audit used read-only reviewed host `ps` because the sandbox's process namespace hid these processes.

## Candidate upstream transport observations

Official SDK options fixed region `us-east-1`, loopback endpoint `https://localhost:<receiver-port>`, bucket `fixture`, static synthetic credentials, `forcePathStyle:true`, `maxAttempts:1`, `followRegionRedirects:false`, optional checksum calculation/validation `WHEN_REQUIRED`. The handler validates exact protocol/hostname/port and allowed methods. It never forwards downstream authorization and has no redirect, proxy, reconnect or route-selection loop.

Each dispatch uses pinned Bun `node:https.request` with **undefined agent plus custom createConnection**, explicit endpoint port, exactly one `tls.connect` to `127.0.0.1`, verified owned CA and `localhost` server name, explicit minimum TLS1.2 and required negotiated ALPN `http/1.1`. The completion callback releases the socket to HTTP only after authorization and ALPN validation. `agent:false` is not used for this upstream candidate. PUT bodies must exactly match signed Content-Length, are at most1 MiB, and responses are bounded.

Observed controls in the final attempt:

1. Known 32-byte `repository/probe-lost` PUT committed in the responder, which then closed its TLS connection before replying. One SDK call failed `socket hang up`, `$metadata.attempts:1`. Exactly **one complete received PUT**, **one retained version**, and **one connection-factory invocation** occurred.
2. Separate identical known-body `repository/probe-ack` PUT returned200 with `$metadata.attempts:1` and one complete received body/version.
3. Wrong independently generated owned CA through the **same candidate path** failed `self signed certificate`, `$metadata.attempts:1`, one factory invocation and **zero HTTP requests** at the receiver. No alternate upstream shim was used.
4. All **135** candidate transport exchanges in the final attempt had exactly one factory invocation. This is a finite observed case, not universal native/SDK retry certification or any elapsed-time/retry-delay assertion.

## Same encrypted repository compatibility

The Python loopback responder retained actual ciphertext bytes from the real S3 client and appended a version for every PUT. The Bun REST adapter read/wrote that same S3 scope through the candidate transport. It implemented v2 JSON name/size lists, HEAD, GET/Range, POST and DELETE; strict known routes; `data/<64hex>` mapped exactly to `repository/data/<first2>/<64hex>`; config/keys/locks/index/snapshots kept their corresponding paths. It rejected creation/removal/unknown paths and config/key mutation after S3 init, plus baseline overwrites/deletes. Synthetic SigV4 authorization was checked only by prefix in the responder; this is not a full signature-verifier or provider emulation.

Concrete final downstream URL:

```text
rest:http+unix:///tmp/registry-relay-qualification-20261109-YuTumm/attempt4/private/relay.sock:/repository/
```

Observed sequence, all real CLI command exits0:

1. Direct S3 `init` and first known stdin backup created snapshot `5d904460b78ff8f5a93547c5b308f71e20a02321816d81be9d9634666536c3b7`.
2. Captured protected visible baseline: **6 objects**, including unchanged encrypted config/key and retained pack/index/snapshot ciphertext.
3. REST `snapshots --json` listed that exact first snapshot; REST `check --read-data` passed.
4. REST created second snapshot `a3e4d68f23b03a161bf725d656133edc6eda232762c711c39c8dc17ef17ca1fc`.
5. Direct S3 `snapshots --json` listed that exact second snapshot; direct S3 `check --read-data` passed.
6. REST restored second payload; all **65570** bytes matched the original, SHA256 `ef7896e6bf32c6d1d31288736da9b12c1913bf993a7584bc80085acedf8a6623`.

A deliberately injected upstream list500 propagated to downstream500 with zero body bytes, rather than a successful empty catalogue. Valid empty lists are accepted only when complete and explicitly `KeyCount:0`; absent/inconsistent/truncated list state throws. Unknown GET404, repository create query400, config POST403 and protected key DELETE403 were observed. Repository-root removal and other unknown routes are rejected by the same exact route/method dispatcher; they were not separately exhaustively tested.

## Lost downstream reply, cleanup and retained bytes

For a newly created data pack, the adapter awaited an acknowledged upstream PUT and then invoked **`outgoing.socket.destroy()`**, sending no downstream reply. This differs materially from failed attempt3's ineffective `ServerResponse.destroy()` fault primitive.

Selected new S3 key:

```text
repository/data/ff/ff4dd05caedf462e3235cf0bde8fbd8f8911d2c265259fc102f58fde25e69824
```

Observed relay sequence: **POST committed/lost → DELETE200 → POST200**. Actual Restic stderr reports the selected Save returned EOF and succeeded after **1 retry**. The selected upstream history is:

| Version index | Observation                            | Retained payload bytes | SHA256                                                             |
| ------------- | -------------------------------------- | ---------------------: | ------------------------------------------------------------------ |
| 1             | PUT committed before lost REST reply   |                    298 | `ff4dd05caedf462e3235cf0bde8fbd8f8911d2c265259fc102f58fde25e69824` |
| 2             | cleanup DELETE creates retained marker |                      0 | no payload                                                         |
| 3             | retry PUT, identical ciphertext        |                    298 | same hash                                                          |

Thus the selected-key retained payload liability is **596 bytes**, not298 and not0. Both actual ciphertext files remain archived. DELETE did not remove an old stored payload version. Marker overhead, billing and real provider version semantics are not measured here.

The adapter only permitted deletion of keys absent from the protected baseline and previously created in this owned operation. An explicit DELETE of a baseline pack returned403 **before reaching upstream**. Its ciphertext remained directly readable with the exact baseline SHA256; all6 protected objects remained visible and unchanged after the fault.

The faulted backup completed as third snapshot `b846f57b420b86afac65eb852c8c86b0c3b4a97b7d354ff50d6457596e72a349`. REST and direct S3 `check --read-data` then both passed. REST restored:

- Retained first payload: **65565** exact bytes, SHA256 `72c53eb069c0c677cc9983b806365bf85b68817478c83a7d8da96e323e4cce32`.
- Third payload: **65571** exact bytes, SHA256 `291846642186e988d3aefd063dae5c995b63a8863c898a035588803007a13a07`.

The independent final audit reread **29 actual archived payload versions** and **13 retained delete markers**, verified every archived payload length/hash, baseline visibility/hash, all3 restored byte sequences and selected POST/DELETE/POST order. It found **203078 retained payload bytes** across the final responder history. This total includes synthetic transport probes and all old lock payload versions; it is fixture payload accounting, not a real provider census or complete marker/metadata liability.

## Preserved failures and material concerns

1. **Attempt1 (root directory):** sandbox socket EPERM prevented receiver readiness; invalid. The initial helper stderr was not captured early enough, so its exact traceback is unavailable. The executed source and orchestrator failure/cleanup receipt remain. A separate fresh socket-creation negative reproduced EPERM. Its cleanup was marked repaired, so no passing claim rests on it.
2. **Attempt2:** candidate transport controls passed, but the prototype wrongly rejected a valid `KeyCount:0` S3 list with absent Contents. REST lock-list requests returned500 and the Restic `snapshots` child hit its45s bound; killed/reaped owned group. Invalid final qualification; exact failure/timeout logs and source retained. Corrected by explicit validated zero-count semantics, not unconditional missing-state fallback.
3. **Attempt3:** compatibility controls passed, but `ServerResponse.destroy()` produced no actual Restic EOF/retry/DELETE: one upstream version, backup exit0. Its intended fault assertion correctly failed. Preserved unchanged; no timeout or repaired cleanup. This establishes that the chosen fault primitive was ineffective in this observed Bun server path; no universal server bug claim is made.
4. **Attempt4:** all required seams passed with real socket close, no timeout/repair. No false success was inferred from the earlier attempts.

## Unverified and excluded work

No unresolved gap remains in this narrow raw-CLI local compatibility/lost-reply experiment. Material scope gaps remain for production: actual store/admission/effects integration, fixed funded ceilings, durable debit-before-dispatch, concurrent debit safety, restart/crash accounting, multipart/copy policy, full provider object/version/part census and billed metadata, retention/prune behavior, installed/enrolled artifact/access, credential custody and non-bypass, source writer exclusion, root/native/namespace/queued-descriptor authority, and full resource enforcement. These were neither attempted nor inferred. No repository test/lint/typecheck/build/OpenSpec/full h2/h4 gate was run because no tracked implementation/docs were changed by this experiment. Production R5 negative-mutation proofs were not added; the owned negative wire/route controls above characterize this prototype only.

Primary source context inspected while resolving the fault: tagged [Restic REST backend](https://raw.githubusercontent.com/restic/restic/v0.19.1/internal/backend/rest/rest.go), [retry backend](https://raw.githubusercontent.com/restic/restic/v0.19.1/internal/backend/retry/backend_retry.go) and [Bun HTTP server](https://raw.githubusercontent.com/oven-sh/bun/bun-v1.4.4/src/js/node/_http_server.ts). Observed receipts, rather than source inspection, establish the finite claims above.

## Repository capture by controller

This directory keeps the exact final executed source as non-executable primary
text, [experiment.ts.txt](experiment.ts.txt) and [receiver.py.txt](receiver.py.txt).
Their bytes match the final execution archive; [receipt.json](receipt.json)
records their SHA256s, the full source-receipt/summary hashes, pins, command exits
and selected finite observations. [audit.json](audit.json) records actual
ciphertext/version counts and exact restored byte hashes;
[process-audit.json](process-audit.json) records the bounded owned-process absence
observation. The controller verified all 195 entries of the original SHA256SUMS.
The complete original receipts, encrypted bodies and failed-attempt sources/logs
remain in the owned `/tmp` archive named above. Private TLS keys and sockets are
excluded. This capture is an evidence record, not an enrolled implementation,
portable test runner, full production regression or provider observation.

Independent [evidence review](review.md) found the narrow raw-CLI compatibility, observed
single upstream dispatch, genuine EOF/retry/cleanup and protected baseline claims
supported, with no blocking findings. It did not certify production funding,
universal transport, current protection promotion or installed authority. The
owning [write-enforcement proposal](../../docs/findings/registry-backup-write-enforcement.md)
and [OpenSpec tasks](../../openspec/changes/bound-registry-storage/tasks.md)
retain those obligations. Provider billing overhead remains outside the approved
stored-file budget; it is not a missing admission prerequisite.
