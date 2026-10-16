## Scope and identity

Authorized throwaway protocol feasibility only. Base: `233759a12` in the isolated
`/tmp/f9-cri-transport-sol` clone. Initial source SHA256 identities and tool versions are
in [environment.json](../../../tools/tool-devsync/feasibility/source-memory-relay/evidence/cri/environment.json).
The reviewed diff retains only the single-connection explicit crictl mode.
The abandoned paired candidate remains outside the repository as a hashed scratch
patch. The syscall trace observes that candidate's unchanged single-pair forwarding
path; it provides no validation of the removed paired loop.

## Observations

| Command / review                                                                                                     | Exit / finding                                                                                                          | Evidence                            |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Original explicit CRI consuming test                                                                                 | 1: Python-only argv sends crictl `-I`; expected real runtime response absent                                            | initial-red.log.json                |
| `CRI_PROBE_CRICTL=/tmp/f9-cri-bin/crictl bun test ./tools/tool-devsync/feasibility/source-memory-relay/cri.probe.ts` | 0: 2 cases, 5 assertions, 494ms; direct baselines, Version response, additional-connection refusal and cleanup observed | focused.log.json                    |
| `bun test ./tools/tool-devsync/feasibility/source-memory-relay/relay.probe.ts`                                       | 0: 26 cases, 117 assertions, 27.44s                                                                                     | generic-regression.log.json         |
| `strace -ff -e trace=read,write,poll,shutdown,connect,accept4` on explicit fixture                                   | CRI client exits 0; strict relay fails writing late 17-byte HTTP/2 PING ACK with EPIPE                                  | shutdown.strace.json                |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                             | 0: 238/238 valid, no failures                                                                                           | environment.json validation summary |
| Cached Prettier 3.9.6, portable repository config, changed Markdown/TS/JSON/YAML only                                | 0, all files formatted                                                                                                  | scoped local output                 |

Evidence filenames above resolve under
[the CRI receipt directory](../../../tools/tool-devsync/feasibility/source-memory-relay/evidence/cri/).
GNU time reported CRI maximum RSS **55,760 KiB**, 0.49s, zero swaps;
generic regression **34,188 KiB**, 27.44s, zero swaps. These are process/children
maximum RSS readings, not simultaneous process-tree memory sums.

## Failure proofs

| Check                                    | Injected fault                                                     | Test observing failure                                           | Actual output                                                                                 | Restored outcome                              |
| ---------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Fixed read-only native command selection | Remove selection guard from compiled temporary C source            | records real CRI single-connection behavior and refusal cleanup  | forbidden reaches BOUND and exits 1/release instead of 64; consuming assertion fails          | explicit CRI control passes                   |
| Pinned crictl executable                 | Replace executable with /usr/bin/true, then omit digest comparison | rejects a different crictl executable before starting the daemon | stdout includes direct Version/daemonReaped instead of being empty; consuming assertion fails | digest mismatch refuses before daemon startup |
| Existing native guards                   | Existing nine source faults and cleanup-clock regressions          | 26-case generic regression                                       | 26 passed / 117 assertions on restored source                                                 | inherited guards preserved                    |

Adjacent Proof comments name the two new watched guard omissions. Runtime refusal
after valid Version output is recorded, never promoted to clean transport success.
The syscall trace shows client exit 0 followed by EPIPE on a late control frame.
No error/partial-drain path was weakened. Fixture forced-kill fallback, daemon
startup-timeout injection, absent/unreadable tools, and all required-syscall
failures were not exhaustively fault-tested; cleanup success was observed for the
actual baseline, refusal and mutation runs.

## Stage applicability and remaining work

Section 1 tasks are complete as observations. Section 2 remains unchecked and
blocks archive/transport acceptance: protocol-aware completion needs review before
any bounded two-pair continuation. Delta spec sync: needs sync; no archive ran.
WBS production design tasks, protected installation, source-memory authority and
production transport selection remain incomplete.

Full `bunx nx format:check --all` and `bunx nx run-many -t test lint typecheck build`
were **not run** on this laptop to preserve the authorized serial lightweight
scope. Scoped project ESLint/TypeScript checks, h2puni gate/build/install, browser,
CI, deployment, privilege changes and production-runtime queries were **not run**.
No public source push is authorized or performed. No full-gate completion is
claimed. The scoped formatter used the repository portable config, so Tailwind
plugin behavior is unverified and irrelevant to these non-UI files. Two attempted
`bunx prettier@3.9.6` invocations failed with EROFS on Bun's cache/temp setup;
running its already-cached CLI with Bun succeeded without installing dependencies.

## Knowledge and handoff

Canonical observations and next boundary live in the harness README. Recommend a
reviewed definition of CRI completion that explicitly addresses late HTTP/2
control frames; simply discarding bytes or accepting crictl stdout would violate
the retained drain invariant. Request independent Astra review through the parent.

## Independent review corrections

Parent review subject: `b08f61f22c70ce2a8d8dda0757cba3ebbe425ada`. The successor
changes only fixture assertions, direct baseline endpoint selection, specs and
receipts; `relay.c` remains byte-identical. Current source identities are in
[evidence/cri/review/environment.json](../../../tools/tool-devsync/feasibility/source-memory-relay/evidence/cri/review/environment.json).
Initial receipts above remain historical evidence for the parent revision.

The direct baselines now pass both private runtime and image endpoints. Every
run supplies a bound private trap as inherited `IMAGE_SERVICE_ENDPOINT` and
asserts that the trap has no pending connection. The original baseline contacted
that trap. List now requires native exit **1** and exact stderr
`relay:child-exit\n`. Launched Version/List/Status require exactly one valid
positive numeric CHILD receipt, while prelaunch refusals require none; absent
announcements can no longer masquerade as reaped children.

| Check                                  | Injected fault                                                                      | Consuming failure                                                                | Restored outcome                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Both direct baseline endpoints private | Remove explicit image endpoint while retaining inherited private trap               | `inherited image-service trap was contacted`; trap readiness true in raw receipt | All three baseline receipts report imageTrapContacted false                         |
| List failure provenance                | Native mutant reports relay:deadline for List with unchanged CLI connection refusal | Exact child-exit assertion fails despite exit 1 and expected crictl text         | List exits 1 with relay:child-exit                                                  |
| Required CHILD receipt count           | Omit native CHILD announcement                                                      | Version has runtime output but fails CHILD receipt count before cleanup checks   | All three launched observations report childReceipts 1; prelaunch refusals report 0 |
| CHILD receipt syntax                   | Replace native numeric receipt with CHILD invalid                                   | One receipt passes count but fails invalid CHILD receipt assertion               | One positive numeric PID parsed for each launched command                           |

Each raw red and restored green output is preserved under
[evidence/cri/review](../../../tools/tool-devsync/feasibility/source-memory-relay/evidence/cri/review/)
with its original byte hash. Adjacent fixture Proof comments identify the watched
faults. Final restored CRI control: **2 passed, 5 assertions, 590ms**, maximum RSS
**56,252 KiB**, 0.59s, zero swaps. Serial generic regression: **26 passed,
117 assertions, 28.72s**, maximum RSS **34,348 KiB**, zero swaps. GNU time's RSS
is not a summed concurrent process-tree measurement. OpenSpec validation again
reported **238/238 valid**, zero failures. Scoped formatting and diff checks ran;
full-gate/project-check exclusions above still apply. Section 2, source-memory
binding, WBS completion and production acceptance remain unchecked. No source
push or deployment ran. Strict byte-drain behavior remains unchanged.

## Connected-descriptor follow-up (2026-10-17)

Authorized by the parent as a bounded fallback after the maintained-client slice
proved unavailable with the installed toolchain. Base:
`e06677f51ccdc905cb2479e1bab9f4655ec13613`. This isolated local clone is
`/tmp/f9-cri-transport-sol`. No production source, dependency, native relay,
original fixture or source-memory contract changed. No publication is authorized.

### Scope and unresolved client choice

Go is absent from PATH and `/usr/bin/go` / `/usr/local/go/bin/go`; stdlib Python
finds no grpc or h2 module. This clone has no node_modules. Read-only inspection
of the shared installed, locked grpc-js 1.14.3 found no public connected-socket
entry point in ChannelOptions; Http2SubchannelConnector.tcpConnect calls
`net.connect(address)`. No private library patch, monkey patch, installation or
pathname reconnection was attempted.

The Python descriptor owner authenticates fixture-selected PID/UID with
SO_PEERCRED and retains SO_PEERPIDFD from the same socket. Its deterministic
protocol has a one-byte kind plus a four-byte network-order length, with payload,
terminal-status and optional later control frames. It is deliberately neither
HTTP/2 nor protobuf/gRPC. The disposable server listener is a fixture endpoint,
not a relay listener. The owner consumes only the captured socket; a replaced
endpoint's trap remains uncontacted.

The separate Bun reproduction inherits that already-connected socket. `fstatSync`
confirms it is a socket, but wrapping it in node:net.Socket and using
node:http2.connect's createConnection callback yields `Socket is closed`.
The server records zero received request bytes. This proves the observed Bun
1.4.2 API combination fails here; it does not establish that every Bun mechanism
is incapable of adopting a descriptor. No valid HTTP/2 response was supplied by
this synthetic server and no HTTP/2 completion claim follows from its framing.

### Exact commands and observed output

Socket creation in the sandbox returned EPERM. The following serial probes ran
with local Unix-socket permission; no host runtime endpoint was contacted.
GNU time metrics are command/children maximum RSS, not summed simultaneous tree
memory; all three controls and the mutation harness reported zero swaps.

| Command                                                                                                                               | Observed outcome                                                                                         | Maximum RSS |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------- |
| `/usr/bin/time -v bun test ./tools/tool-devsync/feasibility/source-memory-relay/connected.probe.ts`                                   | 1 passed, 3 outer assertions, 13 internally asserted scenarios, 784ms                                    | 28,912 KiB  |
| `/usr/bin/time -v python3 /tmp/f9-connected-mutations.py`                                                                             | 8 individual faults each failed the consuming Bun probe with its named diagnostic; harness exit 0, 4.48s | 30,612 KiB  |
| `/usr/bin/time -v bun test ./tools/tool-devsync/feasibility/source-memory-relay/relay.probe.ts`                                       | 26 passed, 117 assertions, 28.38s                                                                        | 31,464 KiB  |
| `CRI_PROBE_CRICTL=/tmp/f9-cri-bin/crictl /usr/bin/time -v bun test ./tools/tool-devsync/feasibility/source-memory-relay/cri.probe.ts` | 2 passed, 5 assertions, 625ms; original refusal observation preserved                                    | 56,120 KiB  |
| `openspec validate f9-cri-relay-feasibility --strict --json`                                                                          | unavailable: command not found, exit 127                                                                 | unmeasured  |

The initial zero-scenario stub exited 0 and printed valid JSON; the consuming
assertion failed `Expected: 12 / Received: 0` before implementation. The final
probe has 13 scenarios because the later inherited-FD reproduction was added.
An earlier missing-file red is a setup failure and is not used as TDD evidence.

Observed response completeness: complete payload/status consumes 27 bytes;
truncated payload and missing status refuse; a later synthetic control consumes
13 more bytes after logical completion (40 total). Negative identities refuse
before constructing an owner. Death before use refuses via the retained pidfd.
Active process exit can expose socket EOF before pidfd readiness, so either
`truncated` or `peer-death` is a modeled incomplete outcome. These fixtures do
not exercise a dead peer's descendant retaining and servicing its socket.

### Watched negative proofs

Each fault was applied to a temporary copy, used by its real consuming probe,
then discarded. Adjacent `Proof:` comments identify these observed failures.
All eight mutated invocations exited 1; the restored final control exited 0.

| Guard or dependency      | Injected fault                                     | Consuming failure                                     |
| ------------------------ | -------------------------------------------------- | ----------------------------------------------------- |
| Peer PID/UID             | Remove identity comparison                         | Wrong PID accepts complete response                   |
| Peer UID                 | Compare observed UID with itself                   | Wrong UID accepts complete response                   |
| One descriptor claim     | Remove claimed guard                               | Second claim returns `second-claim-accepted`          |
| Retained liveness        | Remove pre-use pidfd check                         | Dead-peer send raises BrokenPipeError                 |
| One read budget          | Replace remaining budget with constant two seconds | Delayed fixture ends as truncated instead of deadline |
| Received byte cap        | Remove 128KiB comparison                           | 140000-byte payload accepts complete response         |
| Required terminal status | Remove terminal frame read/comparison              | Missing-status response accepts completion            |
| Owned socket cleanup     | Remove socket close                                | `owned socket not closed` assertion fails             |

Raw stdout/stderr and hashes, the mutation runner source, environment and exact
source hashes are retained in
[connected evidence](../../../tools/tool-devsync/feasibility/source-memory-relay/evidence/connected).

### Limits and skipped checks

A repeated **claim** is not a gRPC second-dial proof. The cap counts received
synthetic bytes, excluding the outbound request; it is not the required aggregate
bidirectional 128KiB transport bound. The 250ms budget covers reads only, with
fixture startup, send, ownership transfer and cleanup outside it. No production
lifecycle deadline, gRPC trailer validation, HTTP/2 multiplexing/drain, maintained
client, real CRI operations over the descriptor, protected executable closure,
independent authority, namespace binding, source sampler or F9 acceptance is
verified. Required-syscall failures, malformed synthetic frame kinds and cleanup
failures have no exhaustive mutation coverage. Cleanup success is observed for
these controls, with one watched socket-close omission.

The original pinned CRI regression continues to query its private disposable
daemon directly and records one-connection relay refusal. It does not validate
this alternative descriptor path. Native source and original probes are
byte-identical to the base commit.

The first normal formatter invocation failed because the clone could not resolve
prettier-plugin-tailwindcss. Scoped formatting used the installed shared Prettier
CLI via Bun with `--config tools/workspace/prettier.portable.json`; Tailwind plugin
behavior remains unverified and does not apply to these non-UI files.
OpenSpec validation is blocked by the absent CLI; no installation was attempted
under the parent's explicit no-new-toolchain constraint. Independent review,
OpenSpec validation, full Nx/project lint/typecheck/build, h2puni heavy gate,
hosted CI, deployment and source publication did not run for this follow-up.
Selecting a maintained client/toolchain with the protected authority owner and
proving Section 2 remain open. No archive or F9 production task is complete.

## Connected terminal-status proof correction (2026-10-17)

Independent Astra review of `576f7ae109d3029b9cc1df103e67ca0bab4109a6`
identified an R5 gap: the original status mutant removed both the terminal frame
read and its comparison. Missing-status exercised the read failure; it did not
prove either comparison. That original receipt remains historical evidence for
required frame presence only.

The synthetic daemon now sends two additional negative controls: terminal kind
`S` with value `1` (`nonzero-status`), and kind `X` with value `0`
(`wrong-status-kind`). Both must produce `status-frame` refusal before completion.
Two independent temporary mutants retain `kind, status = self.read_frame()`:

| Mutant                               | Retained comparison | Consuming observed failure                                  |
| ------------------------------------ | ------------------- | ----------------------------------------------------------- |
| Remove status-value comparison only  | `kind != b'S'`      | `nonzero-status` accepts completion rather than refusing    |
| Remove terminal-kind comparison only | `status != b'0'`    | `wrong-status-kind` accepts completion rather than refusing |

Both mutated Bun invocations exited 1. The restored control passed 1 test,
3 outer assertions and **15 internally asserted scenarios**, 879ms. Adjacent
`Proof:` text now names these exact faults and observations. The read-budget
Proof comment was also corrected: the constant-budget mutant yields `truncated`
after delayed input, rather than accepting a complete response.

Exact serial commands:

- `/usr/bin/time -v python3 /tmp/f9-connected-status-mutations.py`: two expected consuming failures; harness exit 0, 0.52s, maximum RSS **30,812 KiB**, zero swaps.
- `/usr/bin/time -v bun test ./tools/tool-devsync/feasibility/source-memory-relay/connected.probe.ts`: restored control exit 0, 0.88s, maximum RSS **29,080 KiB**, zero swaps.
- `BUN_TMPDIR=/tmp OPENSPEC_TELEMETRY=0 bun --no-install /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/.bin/openspec validate f9-cri-relay-feasibility --strict --json`: **1/1 valid**, no issues. The complete pre-existing cached CLI required no installation. Earlier attempts using the bare package cache were unavailable because cached dependencies did not resolve (`commander`, then `diff`); those attempts did not validate anything.

RSS remains GNU time's command/children maximum, not summed process-tree memory.
[Review receipts](../../../tools/tool-devsync/feasibility/source-memory-relay/evidence/connected/review)
retain both reds, the restored green, the exact mutation runner, validator output
and updated source hashes. All initial receipts remain tied to their original
source identities; the earlier eight-fault runner is historical for its base.

The native relay and original probes are byte-identical to the original base.
Only synthetic fixture responses, their consuming expectations, Proof comments
and evidence changed. Native and original CRI regression commands were not
repeated for this focused test/evidence correction; their prior serial results
are recorded above. Project lint/typecheck/build, full Nx and h2puni gates, hosted
CI, deployment and source publication remain unrun. No maintained CRI client or
production acceptance claim follows from these additional controls. Parent
re-review remains pending.
