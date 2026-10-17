# Native source-memory relay feasibility

This is a **nonauthoritative, unintegrated local feasibility harness**. It creates
no production API, package, installed authority or authentic source-memory evidence.
It completes none of the reviewed [#554 design tasks](https://github.com/Prosperous-Unification/puni-00/blob/d99f65ecb088489632eda3e722334f098f28a9bd/openspec/changes/f9-runtime-source-memory-binding/tasks.md).
The base is main `87a2b7edbfaabae889d91daa823f16f520a51cec`; the reviewed design
revision is `d99f65ecb088489632eda3e722334f098f28a9bd`.

## Run explicitly

```sh
bun test ./tools/tool-devsync/feasibility/source-memory-relay/relay.probe.ts
```

Requirements are Linux with SO_PEERPIDFD/pidfd support, `cc`, Bun and
`/usr/bin/python3`. Missing tools/capabilities fail the explicit invocation.
The native source compiles serially with `-std=c11 -O2 -Wall -Wextra -Werror`.
Bun is the sole test runner; Python supplies real socket/process fixtures and
fixture cleanup. No dependencies are installed and no host runtime is contacted.
The local sandbox denies socket creation, so the observed run required a sandbox
escalation for these local sockets only.

`relay.probe.ts` deliberately avoids ordinary Bun test filename discovery. The
ordinary tool-devsync discovery filter `bun test feasibility/source-memory-relay`
exited 1 with no matching files. The explicit path above
ran exactly 26 cases in this file. This is an explicit unintegrated feasibility
limitation, not a skipped production check: no project.json or full-gate compiler
requirement is introduced. Native ownership, packaging and supported deployment
capabilities still require the design's first milestone.

## What was observed

The native process connects once to a supplied Unix socket, obtains SO_PEERCRED
and SO_PEERPIDFD from that connection, compares **fixture-selected** PID/UID,
and retains/polls the process reference while forwarding. It creates a temporary
private listener and one direct fixture child, retains that child's PID reference
until reaping, and checks the accepted socket belongs to that exact child.
Every selected path, expected PID and executable/script is controlled by the
fixture caller; none is an authority source.

The probe exchanges a complete 48KiB payload through fragmented reads/writes and
half-close, preserving the original connection after its public endpoint is
replaced. It rejects a mismatched upstream before request bytes, a foreign same-UID
listener connector before forwarding, and a dead peer whose descendant still
holds and services the original connection. One 1.5-second monotonic IO budget,
a 128KiB aggregate read cap, bounded queues and direct-child cleanup bound the
observed fixtures. Cleanup normally gives the direct child a 500ms monotonic budget. A failed
initial/subsequent clock read or expired budget invokes SIGKILL and at most 500
nonblocking reap attempts with 1ms sleeps, independently of clock availability.
Scheduling and uninterruptible kernel waits prevent a strict wall-time guarantee;
an unreaped child is reported as cleanup failure. Socket removal uses a retained directory
reference and checks inode/device/type before unlinking; the consuming replacement
probe leaves the foreign replacement intact and reports cleanup failure.

The Python fixture's external watchdog and subreaper clean deliberately broken
mutants after observing their failures. That recovery is test containment, not
proof that a broken native helper cleans itself up.

## TDD and watched failures

The retained red logs use the earlier relay.test.ts filename, before explicit
probe isolation. The initial real assertion red expected successful forwarding but received the
refusal stub's exit 64. A later cleanup red observed a deleted foreign replacement
before the identity guard was added. The final serial run passed **26 cases,
117 assertions**, including these nine compiled-source faults. Each mutant must
fail its named consuming test; restored source controls pass. Adjacent C `Proof:`
comments name observed faults. The cleanup-clock regression first failed both
consuming tests with `childAlive=true` against the reviewed predecessor. The
restored helper refuses unavailable clock readings through one necessary budget
check; omitting that check fails each regression independently. Clock failure is
injected only into the compiled cleanup functions, while the rest of the exchange
uses the real clock. The child half-closes its request and remains alive while the
relay completes both stream directions; no completed-response claim depends on
child stdout racing with termination.

| Fault                                             | Observed decisive failure                                       |
| ------------------------------------------------- | --------------------------------------------------------------- |
| Omit upstream peer comparison                     | Foreign-upstream relay exits 0 rather than refusing             |
| Omit exact direct-child comparison                | 15 foreign request bytes forwarded; expected zero               |
| Omit retained peer liveness check                 | Dead peer's surviving descendant completes successfully         |
| Omit aggregate byte cap                           | 200000-byte fixture completes successfully rather than refusing |
| Break monotonic poll budget dependency            | Direct child remains observable after the external watchdog     |
| Omit direct-child cleanup                         | Direct child remains observable after native refusal            |
| Omit cleanup budget check; initial clock fails    | EOF-complete direct child remains observable after watchdog     |
| Omit cleanup budget check; subsequent clock fails | EOF-complete direct child remains observable after watchdog     |
| Omit private socket cleanup identity check        | Foreign replacement disappears; expected preserved              |

Raw test diagnostics contain only controlled fixture values. Exact UTF-8 diagnostic outputs are retained in JSON `combinedOutput` strings
with their original byte hashes; source hashes are retained in [evidence](evidence/environment.json).

## Resource receipt and remaining work

Observed locally: Bun 1.4.2, Linux 7.0.11-76070011-generic, GCC 13.3.0 and fixture
Python 3.12.3. GNU `time -v` reported **33444 KiB maximum RSS**, 27.21 seconds,
zero swaps and exit 0. This metric is the command/children maximum RSS reported by
GNU time, **not summed simultaneous process-tree memory**. No crictl was on PATH. A local containerd socket path existed; it was neither
contacted nor authenticated.

This is generic Unix byte-stream feasibility, not real CRI/gRPC acceptance. It has
one connection and rejects rather than supports reconnection; it proves no
HTTP/2 multiplexing or complete CRI framing. There is no protected install,
executable closure, independent runtime/node/source authority, namespace/mount
binding, retained-reference source sampler, 2Gi memory observation, deployment or
F9 acceptance. Callers can select arbitrary fixture executables and manipulate
their same-UID process/filesystem environment. The cleanup test covers a replacement
made before the identity check; the identity check/unlink sequence does not defeat
all active same-UID filesystem races. Arbitrary fixture-client descendants are not
owned by the native helper. Required-syscall error paths and capability failures
have no exhaustive injected-fault coverage in this preliminary harness.

No full Nx gate, repository-wide test run, ESLint/TypeScript project checks,
h2puni build/install or privilege change ran. Preserve the existing ops sudo/Docker privileges. Production transport cannot
be selected and the OpenSpec tasks cannot be closed from this fixture evidence.

## CI content classification repair (2026-10-16)

Twilight run `38898880545`, job `116966509738`, refused this committed
feasibility source because `relay.c` matched zero content classification rules.
The pilot and enforced bootstrap policies now classify only this exact path as
`source`; this does not adopt C files generally or integrate this harness.

The production CLI regression is
`pilot-policy.test.ts` / `pins exact pre-index tuples and passes observe lint from external trust`.
With `NODE_OPTIONS=--max-old-space-size=768` and
`TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules`, the initial committed-source
control failed with `relay.c matched 0 classification rules`; the repaired
control passed (1 test, 60 assertions, 11.51s). Removing the new pilot selector
again reproduced the same classification refusal. Local receipts are
`/tmp/f9-policy-before.log`, `/tmp/f9-policy-after-configured.log`, and
`/tmp/f9-policy-omission.log`. One intermediate invocation without the trusted
modules environment refused with `trusted TypeScript runtime modules are not configured`
(`/tmp/f9-policy-after.log`); that setup failure is not a classification proof.
The Node heap setting does not impose a hard cap on Bun's total process memory.
No native feasibility probe, full Nx gate, browser run or Burokrat survey was run
for this policy-only repair. Hosted CI and exact aggregate acceptance remain
pending.

The final serial control selected only that observe test and the enforced
bootstrap-policy loader: **2 passed, 70 assertions, 13.50s**
(`/tmp/f9-policy-final.log`), observed maximum RSS 2,033,496 KiB. Scoped ESLint
exited 0 but explicitly skipped `@nx/enforce-module-boundaries` because this
isolated clone has no cached project graph (`/tmp/f9-policy-eslint.log`); that
rule is unverified locally. Independent Astra source review found no P0–P3 issues.

## Explicit CRI observation (2026-10-16)

```sh
CRI_PROBE_CRICTL=/absolute/path/to/crictl bun test ./tools/tool-devsync/feasibility/source-memory-relay/cri.probe.ts
```

This separate opt-in probe requires `/usr/bin/containerd`, the original native
probe prerequisites, and the Linux amd64
[crictl v1.35.0 release](https://github.com/kubernetes-sigs/cri-tools/releases/tag/v1.35.0).
The downloaded archive SHA256 matched its release checksum:
`2e141e5b22cb189c40365a11807d69b76b9b3caced89fac2f4ec879408ce2177`.
The extracted executable is independently pinned in the fixture:
`53f836ba94d4d4b5ac2a1d1df6ca7e7159ec994c8d8ea834469910cd5f7de4c6`.
A checksum match is the observed verification; no signature verification ran.
The probe never downloads tools or selects the host runtime. It starts an
unprivileged containerd with fresh private config/root/state/grpc/ttrpc paths,
native snapshotter, private CNI/CDI paths and disabled NRI; it creates no Pods,
containers or images. Missing tools or a wrong binary digest fail explicitly.

The native `--cri` fixture mode selects only `version`, `list` or `status`,
executes crictl as its direct child, and retains the existing one connection,
1.5-second deadline, 128KiB aggregate byte cap, identity checks and strict drain
behavior. Child diagnostics share stdout so CRI errors remain observable.
Python bounds daemon startup to 5 seconds, individual subprocesses to 3–4 seconds,
and each terminate/kill reap attempt to 2 seconds. These fixture containment
budgets are separate from the native deadline and do not guarantee wall time
under scheduling delays or uninterruptible kernel waits.

Observed with current-user containerd v2.3.4:

- Direct disposable baselines: Version and parsed empty ListContainers JSON
  succeed; ContainerStatus for `f9-probe-absent` reports CRI NotFound.
- Through the native relay, Version prints containerd v2.3.4 / CRI v1. Some
  observations exit 0; others refuse after the response with read/write errors.
- ListContainers and ContainerStatus fail before their target operation while
  initializing a second image-service connection: the one-connection listener
  has closed and crictl reports connection refused. Upstream
  [ps/inspect setup](https://github.com/kubernetes-sigs/cri-tools/blob/v1.35.0/cmd/crictl/container.go)
  unconditionally initializes both services.
- The decisive [syscall receipt](evidence/cri/shutdown.strace.json) records
  crictl exit 0, client EOF, `shutdown(upstream, SHUT_WR) = 0`, then a 17-byte
  upstream HTTP/2 PING acknowledgment and `write(client, 17) = -1 EPIPE`.
  Valid application output therefore does not imply complete byte drain.
  Native refusal remains mandatory; no tail bytes are discarded to claim success.

A passing `cri.probe.ts` means these limited observations and cleanup checks
matched the recorded outcomes. It is **not CRI transport acceptance**. The
parent stopped the fixed two-pair experiment at this shutdown blocker and its
unproven implementation was removed from the review diff. Modeling protocol
completion must precede that continuation. The OpenSpec
[remaining tasks](../../../../openspec/changes/f9-cri-relay-feasibility/tasks.md)
and all production F9/WBS tasks remain open. Generic probes remain separate.

The final serial CRI observation run passed **2 cases, 5 assertions** in 494ms;
GNU time reported **55,760 KiB maximum RSS**, 0.49 seconds, zero swaps. The generic
regression passed **26 cases, 117 assertions**, 27.44 seconds, **34,188 KiB maximum
RSS**, zero swaps. RSS is not a summed simultaneous tree measurement. The new
command allowlist and executable digest checks each have a watched omission
failure. Full local Nx gates, project ESLint/typecheck, h2puni gate, CI, deployment
and production CRI acceptance were not run. All receipts and source identities
are retained under `evidence/cri/`; see the [focused receipt](evidence/cri/focused.log.json).

Independent review of `b08f61f22` found three evidence gaps, corrected in its
successor: direct baselines explicitly bind **both** private endpoints despite an
inherited image-service trap; List requires native exit 1 and exact child-exit
diagnostic; launched commands require exactly one valid CHILD PID receipt and
prelaunch refusals require none. Watched endpoint omission, wrong List diagnostic,
missing CHILD and malformed CHILD faults all fail their consuming checks.
Review receipts under `evidence/cri/review/`, including the
[restored control](evidence/cri/review/focused-green.log.json), retain the raw red/green outputs and updated
source hashes. The restored CRI control passed 2 cases / 5 assertions in 590ms,
maximum RSS 56,252 KiB; generic regression passed 26 cases / 117 assertions in
28.72s, maximum RSS 34,348 KiB; both reported zero swaps. These correct observation
and isolation checks without changing native forwarding or resolving the shutdown
blocker. The original receipts remain historical evidence for `b08f61f22`.

## Connected descriptor follow-up (2026-10-17)

```sh
bun test ./tools/tool-devsync/feasibility/source-memory-relay/connected.probe.ts
```

This separate throwaway experiment uses stdlib Python and installed Bun. It
creates private disposable fixture listeners and passes only an already-connected
socket descriptor to its consuming probe. There is no relay listener or pathname
fallback in the descriptor owner. Caller-selected fixture PID/UID values are
not an authority source.

Python controls use a deliberately synthetic length-prefixed protocol, with
payload, terminal status and later control frames. They do not implement HTTP/2,
protobuf or gRPC. A repeated descriptor claim is refused; that is not evidence
that a maintained gRPC client's second dial is refused. The 128KiB cap counts
received fixture bytes, not aggregate bidirectional transport traffic. The
250ms monotonic read budget is not a production lifecycle deadline. Peer death
before use refuses via pidfd; during exit, socket EOF can precede pidfd readiness
and either observed refusal remains incomplete.

The Bun incompatibility case separately passes an inherited Unix socket to
`node:net.Socket` and `node:http2.connect`. Although `fstatSync` identifies the
inherited descriptor as a socket, Bun 1.4.2 reports `Socket is closed` and the
fixture observes zero request bytes. It never receives a valid HTTP/2 response,
so this result cannot establish any HTTP/2 framing behavior. The installed
locked grpc-js 1.14.3 has no public connected-socket entry point in its channel
options and internally calls `net.connect`; no monkey patch or new dependency
was added. Go and Python grpc/h2 are absent.

The [OpenSpec amendment and verification record](../../../../openspec/changes/f9-cri-relay-feasibility/verify.md)
retain exact commands, watched failures, resource receipts and unresolved work.
The existing native strict drain refusal is unchanged. Selecting a maintained
client/toolchain and proving fixed CRI operations against a disposable daemon
remain open with the protected authority owner. This follow-up closes no F9
production or source-memory task.
