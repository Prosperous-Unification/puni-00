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
exited 1 with no matching files after searching 93 files. The explicit path above
ran exactly 22 cases in this file. This is an explicit unintegrated feasibility
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
observed fixtures. Cleanup allows at most another 500ms for the direct child and
reports failure if it cannot complete. Socket removal uses a retained directory
reference and checks inode/device/type before unlinking; the consuming replacement
probe leaves the foreign replacement intact and reports cleanup failure.

The Python fixture's external watchdog and subreaper clean deliberately broken
mutants after observing their failures. That recovery is test containment, not
proof that a broken native helper cleans itself up.

## TDD and watched failures

The retained red logs use the earlier relay.test.ts filename, before explicit
probe isolation. The initial real assertion red expected successful forwarding but received the
refusal stub's exit 64. A later cleanup red observed a deleted foreign replacement
before the identity guard was added. The final serial run passed **22 cases,
93 assertions**, including these seven compiled-source faults. Each mutant must
fail its named consuming test; restored source controls pass. Adjacent C `Proof:`
comments name observed faults.

| Fault                                      | Observed decisive failure                                       |
| ------------------------------------------ | --------------------------------------------------------------- |
| Omit upstream peer comparison              | Foreign-upstream relay exits 0 rather than refusing             |
| Omit exact direct-child comparison         | 15 foreign request bytes forwarded; expected zero               |
| Omit retained peer liveness check          | Dead peer's surviving descendant completes successfully         |
| Omit aggregate byte cap                    | 200000-byte fixture completes successfully rather than refusing |
| Break monotonic poll budget dependency     | Direct child remains observable after the external watchdog     |
| Omit direct-child cleanup                  | Direct child remains observable after native refusal            |
| Omit private socket cleanup identity check | Foreign replacement disappears; expected preserved              |

Raw test diagnostics contain only controlled fixture values. Exact UTF-8 diagnostic outputs are retained in JSON `combinedOutput` strings
with their original byte hashes; source hashes are retained in [evidence](evidence/environment.json).

## Resource receipt and remaining work

Observed locally: Bun 1.4.2, Linux 7.0.11-76070011-generic, GCC 13.3.0 and fixture
Python 3.12.3. GNU `time -v` reported **33104 KiB maximum RSS**, 15.61 seconds,
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
