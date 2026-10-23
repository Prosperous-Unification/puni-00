# Task 10.2 exact executed-byte identity feasibility spike

2026-10-23; source SHA `02830d4282e0fbc359e7ecb3472fa7a6cc36615f`.
Disposable detached worktree: `/tmp/puni-supervisor-identity-spike`.
Evidence and throwaway fixtures: `/tmp/supervisor-identity-evidence`.
No tracked repository changes. No service install/start/restart/activation, h2 gate,
push, or PR. No claim of production process or executable identity.

## Question and outcome

The pinned Bun 1.4.2 runtime can hash a supervisor buffer once, pass the same
Uint8Array to a runtime `Bun.plugin` virtual-module `onLoad`, dynamically import
it, and explicitly invoke its real exported decoder and entrypoint. Atomic
replacement and unlink of the original bundle path after the read do not change
A semantics or A's reported digest. A mutant hashing A then importing the path
executes B and is detected. Client-side SO_PEERCRED works on a real connected Unix
socket between distinct Bun processes. Typed systemd ExecStart and MainPID JSON
are available through the user's existing manager.

These primitives are feasible; the complete identity protocol remains unimplemented
and unverified. This spike does not authorize or perform Task 10.2 implementation.

## Exact build/runtime observations

`bun --version` -> `1.4.2` (also the repository `.bun-version`).
Runtime `/home/df/.bun/bin/bun` SHA256:
`a83d263767d839e4d2649ca8e35d07159c7afc99afdc96d731ced29e056dda0c`.

From isolated source worktree:

```
bun build tools/tool-remote-scripts/src/solver-supervisor.ts --target=bun --outfile /tmp/supervisor-identity-evidence/solver-supervisor.js
Bundled 17 modules in 20ms
  solver-supervisor.js  56.48 KB  (entry point)
```

Bundle SHA256:
`377b0c790b276fe5ab26ef541a67926e885320d30194572ed59af01e7cfae118`.
Dependencies used the existing workspace node_modules via a disposable symlink;
no frozen reinstall or dependency reproducibility claim.

Bun.Transpiler.scanImports actual output:

```json
[
  { "kind": "import-statement", "path": "buffer" },
  { "kind": "import-statement", "path": "fs" },
  { "kind": "import-statement", "path": "fs/promises" },
  { "kind": "import-statement", "path": "bun:ffi" }
]
```

No residual relative, absolute, or dynamic imports were present. Builtins and
libc FFI remain external runtime dependencies; bundle hashing does not establish
libc or Bun identity. Current `bun:ffi` helper dlopens `libc.so.6` per credential read.

## Captured-byte loader proof

Run: `bun /tmp/supervisor-identity-evidence/loader-spike.ts`.
Exact complete final output: `loader.log` (exit 0).
`bootstrap.js` is passed as the identical `bun -e` argv literal to each child.
The test-only barrier guarantees replacement/unlink occurs strictly after the
single `Bun.file(path).bytes()` read and before the dynamic import. The captured
Uint8Array is both hashed and returned directly as onLoad contents.

The resolver redirects `./captured-supervisor.js` to namespace `captured`, path
`supervisor.js`; onLoad uses `{contents:bytes,loader:'js'}`. The imported real
module's `import.meta.main` guard stays false. The bootstrap explicitly calls
`decodeSolverSupervisorConfigBytes` and `runSolverSupervisor`; injected read/start
dependencies exercise the existing entrypoint without Docker, cleanup, or listening.
It checks the decoded Unix path and `started:true`.

Both atomic-replacement and unlink cases returned exit 0, ceiling 262144,
started true, and hash
`377b0c790b276fe5ab26ef541a67926e885320d30194572ed59af01e7cfae118`.
The B bundle changes the real decoder's `SUPERVISOR_CONFIG_MAX_BYTES` from
`256 * 1024` to `1`; the replacement fixture checks mutation actually changed bytes.
The path-import mutant retained that same captured A digest but exited 1 with:
`error: solver supervisor: config must contain 1 through 1 bytes`.
The parent requires that exact failure before printing:

```
PASS actual bundle replacement + unlink preserve A semantics/hash; path-import mutant rejected
```

Observed runtime quirk: a bare package specifier without a dot did not reach the
runtime resolver, and direct custom namespace imports also failed resolution.
A relative dotted specifier plus onResolve redirect works. Do not substitute a
bare `captured-supervisor` or direct `captured:supervisor` without another proof.
Official reference consulted: https://bun.com/reference/bun/BunRegisterPlugin
(runtime hooks require import specifiers containing a dot or colon; observations
above narrow the usable shape further for this pinned runtime).

## Real connected Unix peer credentials

Run outside the restrictive sandbox:
`bun /tmp/supervisor-identity-evidence/peer-spike.ts` (exit 0).
Exact full output in `peer.log`:

```
READY 2542700
{"clientExit":0,"stdout":"{\"clientPid\":2542726,\"server\":{\"pid\":2542700,\"uid\":1000,\"gid\":1000}}\n{\"serverPid\":2542700,\"client\":{\"pid\":2542726,\"uid\":1000,\"gid\":1000}}\n","stderr":""}
{"serverExit":0,"stderr":""}
PASS connected client SO_PEERCRED and accepted server SO_PEERCRED match distinct Bun process PIDs/UIDs
```

`peer-client.ts` uses actual `Bun.connect` and calls the existing
`readSupervisorPeerCredentials(socket)` in its open callback. `peer-server.ts`
uses Bun.listen and the same helper on the accepted socket. The parent compares
both kernel peer PIDs to the independently observed Bun subprocess PIDs and both
UIDs to its real uid, and requires distinct process IDs. No mocked descriptors,
credential reads, or server identity payload is trusted to establish the client's
kernel result. Client credentials use the same validated runtime `socket.fd`
property and getsockopt(SOL_SOCKET=1, SO_PEERCRED=17) FFI helper as accepted peers.

The sandbox denied Unix `listen` with EPERM; approved escalation for this disposable
fixture resolved the environment restriction. No production socket was touched.

## Read-only typed systemd observations

The sandbox initially denied both system and user bus connections. An approved
read-only user-bus query succeeded; system manager was not queried after escalation.

```
busctl --user --json=short get-property org.freedesktop.systemd1 /org/freedesktop/systemd1/unit/dbus_2eservice org.freedesktop.systemd1.Service ExecStart
{"type":"a(sasbttttuii)","data":[["/usr/bin/dbus-broker-launch",["/usr/bin/dbus-broker-launch","--scope","user"],false,1792402749722413,569017351,0,0,2340,0,0]]}
busctl --user --json=short get-property org.freedesktop.systemd1 /org/freedesktop/systemd1/unit/dbus_2eservice org.freedesktop.systemd1.Service MainPID
{"type":"u","data":2340}
```

Exact responses saved in `systemd-execstart.json` and `systemd-mainpid.json`.
A disposable Bun decoder verified the ExecStart signature, one record, executable
string, argv array of strings, unsigned MainPID signature and positive value:
`PASS systemd provides typed executable path, argv array, and MainPID JSON without shell parsing`.
Host systemd version was 255. No transient unit or service lifecycle action was needed.
This proves availability of the typed D-Bus representation, not safe unit quoting,
exact candidate bootstrap argv on the deployment host, or snapshot consistency
across independent properties. A production anchor still needs exact expected
argv comparison and bounded convergence if PID changes during observation.

## Unverified design boundaries

- No private nonce readiness protocol, MainPID correlation with sockets, config
  buffer digest, boot digest response, executable `/proc/<pid>/exe` identity,
  readiness replay/mismatch negatives, or public solver client enforcement.
- Decoder/entrypoint execute the actual current bundle with injected start;
  production Docker preflight, orphan sweep and public listener were not started.
- No Bun preloads/auto-import/runtime-options/environment isolation analysis;
  effective argv alone is not a proof about all runtime startup influences.
- No typed ExecStart verification of the proposed literal bootstrap unit;
  D-Bus queries here concern the already running dbus user service only.
- No h2puni deployment/runtime validation, frozen dependency install, full gate,
  cross-runtime/cross-platform support, or production safety claim.
- Bootstrap fixtures contain test barriers, fixture config and injected start;
  they are evidence, not a ready-to-install service bootstrap.

Next implementation may use these measured primitives but must separately prove
all identity binding and failure paths before claiming Task 10.2 readiness.
