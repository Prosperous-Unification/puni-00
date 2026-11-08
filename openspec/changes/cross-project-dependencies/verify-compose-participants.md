# Read-only Compose participant observation (bounded Task 10.1/10.2 prerequisite)

The dedicated `be --inspect-dependency-participants` invocation runs before ordinary
image, registry and swap planning. One selected-environment `deploy.lock` spans two
fresh retained backend/gateway inspections and two unfiltered Docker/network/process
and live Caddy censuses. All Docker work shares one 60-second deadline. The retained
inspector is the reviewed `inspectBackendFenceUnderLock`; no nested deploy lock is
acquired. Its existing retained-record, database-family, mount-namespace and joint
gateway checks remain authoritative for their bounded managed cohorts.

The census uses full Docker container IDs, unfiltered container and network lists,
full inspection hashes, every running container's PID/command-name process table,
and the complete live Caddy admin configuration. Configuration and inspection hashes
bind sensitive environments and credentials without returning their contents. The
Caddy walk includes alternate/catch-all routes; unknown handlers/apps, dynamic or
unresolved/ambiguous upstreams, source-run `wbs-dev-src`, foreign network membership,
missing/unreadable evidence and changed readbacks refuse observation. Static targets
must resolve unambiguously through a name/IP/alias advertised on an observed edge network. Edge hosts/DNS overrides and non-default proxy transport options refuse rather than bypass this resolution.

The only output is `dependency-participant-observation` version 1 with
`activation: "blocked"`, evidence hashes, the census and explicit unresolved ingress,
restart-authority, MCP, retained-client, host-process and continuous-exclusion
obligations. It is neither a completion nor an activation receipt and has no
`participantProofSha256`. It publishes no observation record, changes no restart
policy, stops no application container, reloads no proxy and enables no authoring.
The existing lock bookkeeping and the retained inspector's bounded read-only
namespace metadata sessions retain their existing contracts.

## Focused evidence

Implementation worktree: `/tmp/puni-participant-preflight`, based on `1549fb90e` plus
the six reviewed backend prerequisite commits transferred from
`/tmp/puni-backend-fence`. Those prerequisites are separate packets; this packet
contains only the new observer/census, early CLI consumption, tests and this record.

- `bun test tools/tool-remote-scripts/src/lib/dependency-topology.test.ts tools/tool-remote-scripts/src/lib/dependency-participants.test.ts tools/tool-remote-scripts/src/swap-dependency-participants.test.ts`: **37 pass, 0 fail, 94 assertions** before final verification. Eight malformed/mixed real subprocess invocations refuse before Docker/image/planning work.
- `bunx --no-install tsc --noEmit -p tools/tool-remote-scripts/tsconfig.lib.json` and the corresponding `tsconfig.spec.json`: both **exit 0**, no build or emitted outputs.
- Direct ESLint on all changed TypeScript: **exit 0**, with the unavailable Nx project-graph rule called out below. Prettier on all packet files: **exit 0**.
- Existing backend/gateway exclusion and dedicated CLI controls: **153 pass, 0 fail, 812 assertions** across four focused files.
- `bunx --no-install openspec validate cross-project-dependencies --json`: **valid true / exit 0**, with 17 existing long-requirement warnings. The same targeted command with `--strict` reports **valid false / exit 1** solely for those warnings; no existing requirement prose was changed by this packet.
- Independent Astra High rereview approved the corrected bounded packet; root integration owns the exact-SHA host gate.
- Initial watched CLI red: before its early branch existed, the eight real subprocess refusal cases failed because ordinary execution attempted Docker/image work. After wiring, all eight pass.
- Watched guard removals using `/tmp/watch-participant-negatives.py`, restoring original production source in `finally`: source-run refusal, foreign-network-member refusal, alternate-upstream closure, init-PID association and real lock acquisition each produced **1 fail / exit 1**. Removing observation equality produced **4 fail / exit 1**, one each for retained proof, restart policy, alternate Caddy upstream and process start identity drift. Adjacent `Proof:` comments name the faults.
- Review corrections: removing edge DNS/hosts admission produced **4 fail / exit 1**; removing proxy transport admission or Docker network scope each produced **1 fail / exit 1**. Dropping the shared deadline from the production default retained-inspector callback produced **1 fail / exit 1** in an isolated subprocess (only the retained-inspector boundary is substituted; observer, topology and real lock execute).
- Focused tests also exercise missing and unreadable inventory, malformed identities, missing live edge, unreadable process tables, dynamic upstreams, unknown Caddy handlers/apps, missing retained proof, safe output and one held real `flock`.

## Limits and remaining work

No live Docker/HTTP/WebSocket acceptance, image build, broad test suite or isolated
host gate was run for this packet. The host was briefly full and recovered to
approximately 1.2 GB available; no installs, image work or unrelated cleanup were
performed here. Direct ESLint reports the Nx module-boundary rule unavailable
because the isolated worktree has no cached project graph; that rule remains
unverified. The root integration owner must record integrated verification and the exact integrated-SHA host gate separately.

Topology tests use a controlled Docker boundary; observer tests use a controlled
retained-proof boundary and a real filesystem/lock. Positive end-to-end CLI execution
against real retained proof and a real Docker daemon remains unverified. Existing
backend/gateway retained proof tests cover their own storage and namespace boundaries;
this packet does not expand those proofs into a complete participant exclusion claim.
Native host processes, external ingress/DNS, socket delivery intervals, old clients,
MCP lifecycle authority and durable restart/controller ownership remain unresolved.
Parent Task 10.1/10.2 remain open and activation remains blocked.
