# Bounded MCP startup memory correction — 2026-10-23

Intent: preserve the current generated HTTP/MCP command contract while removing
schema construction from the 512 MiB source-running MCP startup path. CI infra
39941294390 reported repeated MCP `OOMKilled` / exit 137 and rollout timeout;
that cluster evidence was supplied by the coordinator. No limit increase,
runtime fallback, checked-in snapshot, activation, push, merge or deployment.

## Implementation and watched negatives

`readDocument()` now reads a required sibling `openapi.json`. The existing
backend emitter generates it from the same checkout. MCP `prepare` is explicitly
uncached and precedes source serve/test; build emits beside its bundle. Both
production and lab source Dockerfiles generate in a separate stage and copy
beside the source entrypoint. Credential rules, trusted issuer checks and logger
runtime exports use leaf imports.

`bun test apps/wbs/mcp-01/src/startup-document.test.ts` first ran against the
original runtime generator: missing, directory/unreadable and malformed artifact
tests failed because the runtime booted successfully. After the file-only read,
all five initial tests passed (14 assertions). The final six-test startup file,
including the Docker-stage check, passed with 18 assertions. The directory fixture produces EISDIR
regardless of the test user's file permissions, separately from missing ENOENT.
The bundled production reader is invoked in fresh subprocesses, so no mock or
module cache can supply the artifact. Malformed cases are invalid JSON, null,
and an empty path table. Existing production derivation tests cover ambiguous
names and required exclusion drift.

The poison-barrel build test compiles the production `main.ts` while onLoad
throws for the contracts/core barrel. Independently restoring the OAuth core
barrel, trusted-issuer core barrel and logger contracts barrel each failed this
test with `MCP startup reached an eager runtime barrel` (0 pass / 1 fail).
All three leaf imports were restored. Adjacent `Proof:` comments record these
faults and the reader's baseline negative.

The minimal Docker-stage test recreates each Dockerfile's actual document-stage
COPY sources in a temporary directory (with installed node_modules linked), then
runs its actual `RUN bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts /app/openapi.json`
command with only the output path relocated. Independently omitting
`COPY apps/wbs/be-01/tsconfig.json ./apps/wbs/be-01/tsconfig.json` in production
and lab Dockerfiles made the test fail with `Cannot find module '@wbs/contracts'`
(0 pass / 1 fail for each fault). Both COPY instructions were restored; adjacent
`Proof:` comments retain the observed dependency boundary. An intermediate
`--tsconfig-override=tsconfig.base.json` experiment emitted Bun's internal
directory-mismatch diagnostic despite exit 0 and was discarded; the final stage
uses the normal copied application tsconfig with the root aliases.

Preparation freshness was checked through the actual Nx target **without**
`--skip-nx-cache`: changing the shared gateway-dependency shape summary to
`MCP preparation freshness injected shape change` reached the prepared document.
Replacing only the prepare command with a no-op, while retaining that changed
shape, made the same production-artifact assertion fail with
`stale generated artifact` (exit 1). Restoring the emitter command regenerated
the marker successfully. Restoring the original shape and preparing again
matched the pre-fault artifact byte-for-byte (`cmp` exit 0). Prepare is explicitly
`cache: false`; no shape, target or artifact mutation remains.

## Fresh observations

- Configured full MCP target, rerun with loopback access:
  `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-mcp-01:test --skip-nx-cache`:
  **620 passed, 0 failed, 4087 assertions**, 24 files, 348.42 seconds;
  Nx reported the test and prepare dependency successful. This includes mounted
  HTTP/generated MCP parity. The final Docker-stage test was added afterward
  and was verified separately.
- Configured uncached `wbs-mcp-01:lint`: passed (final rerun 19.1 seconds); shared changed
  files also passed scoped ESLint. Trusted-issuer/logger adapter tests:
  **28 passed, 0 failed, 78 assertions**.
- `bunx openspec validate cross-project-dependencies --json`: passed 1/1.
  Strict validation was attempted and refused existing long-requirement warnings;
  no strict pass is claimed.
- Focused generated/document/startup parity: final **59 passed, 0 failed, 492 assertions**
  across `shape-document`, `generated-document`, `openapi-tools`, and
  `startup-document`. This includes current command endpoints and exclusions.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-mcp-01:prepare --skip-nx-cache`:
  target executed the emitter and Nx reported success.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-mcp-01:typecheck --skip-nx-cache`:
  passed, uncached, final rerun 6.3 seconds.
- `/usr/bin/time -f 'maxrss=%M KiB exit=%x' bun -e "await import('./apps/wbs/mcp-01/src/main.ts')"`:
  **101272 KiB**, exit 0 (final source; initial observation 100376 KiB). The coordinator's baseline same-source import was
  approximately 814772 KiB; this local import observation is not cluster evidence.

The first default Nx invocation printed daemon/plugin socket EPERM and exited
zero without a target execution receipt; it is **not** a prepare pass. The
explicit no-daemon/no-plugin-isolation invocation above ran the actual target.
The first full MCP target under sandbox failed mounted listeners with EPERM
and backend children exited 1 (514 passed / 82 failed, 2299 assertions); it supplies no passing mounted-suite verdict. The loopback-enabled rerun above passed.

## Disposable 512 MiB probe

An authorized no-network container used existing image
`sha256:ec164d72f851c16d7d6730790cf878bcca90806f2c688247f45d18703838e5cd`
(`wbs-mcp-01:f8-v1`, older image/dependencies) with this worktree's apps/libs/
tsconfig mounted read-only, the prepared artifact, fake generated keys and an
isolated tmpfs store. No image was built. The root filesystem was read-only,
network `none`, memory and memory-swap both 512 MiB. The probe observed:

- `GET http://127.0.0.1:3300/health/liveness`: **200**, `{"status":"ok"}`.
- Startup logged **88 tools**.
- `memory.max`: **536870912** bytes; `memory.current`: **137609216** bytes;
  `memory.peak`: **148692992** bytes (includes the exec liveness/cgroup probes).
- `memory.events`: `max 0`, `oom 0`, `oom_kill 0`, `oom_group_kill 0`.
- Before cleanup: running, `OOMKilled:false`, exit code 0.

After five seconds of healthy observation, explicit `docker stop --time 2`
ended the container with exit 137 and `OOMKilled:false`; this is an operator
stop, **not an OOM verdict**. The container and fake credential directory were
removed. The probe proves this bounded source startup under that existing
image's dependencies; it does not certify the changed Dockerfile's final image,
a real backend, OAuth operation, sustained traffic or k3s rollout.

## Remaining limits

No new image build, full repository build, canonical h2/h4 gate, CI rerun or
cluster rollout ran for this packet. Disk was only 1.4 GiB free before the probe;
no image layers were added. Parent Task 3.2, Task 11 and activation stay open.

## Review follow-up: dev source deploy preparation freshness

Astra review found that the original packet's source preparation only runs when
the Nx supervisor starts. A contract-only push did not affect MCP's runtime
watcher after runtime schema imports were removed. `RESTART_PATHS` now includes
all contracts source (including command definitions outside `http`), the backend
OpenAPI emitter directory, WBS and shared validation sources, and the three
libraries' `tsconfig.json` files. The existing lockfile, root aliases, app
aliases and project/supervisor config entries cover the other generation inputs.
The contracts source imports no other source library than WBS validation, which
reexports shared validation; ArkType/schema packages are lockfile dependencies.
The runbook now names this source-deploy restart exception.

The new `mcp-document-sync.test.ts` runs production `sync()` rehearsal against
real isolated Git revisions, production recursive fingerprints and actual resets.
Only the external Docker boundary is substituted: the install request is recorded,
and its fenced restart executes real uncached `nx run wbs-mcp-01:prepare` in the
fixture checkout. The fixture copies the real emitter, declarations, validation
and alias configs and uses installed dependencies. A command-definition prose
change outside `http` reaches the generated artifact and is read back through
production `readDocument`/`toolsFromDocument` into the current tool table; each source/config case
requires the real Nx preparation receipt. An ordinary MCP app-source edit proves
the production watcher path still avoids restart.

TDD RED before the fix: all four requested source-root cases failed (0 passed /
4 failed) because sync classified the deployment as watcher-only and no restart
occurred. After the fix, each of the seven source/config entries was removed
independently and its matching test rerun in a fresh process. Every omission
failed (0 passed / 1 failed), exposing `watchers pick it up` instead of the
required preparation receipt. Entries were restored after each fault. The
adjacent `Proof:` comment records that production-path mutation evidence.

This integration exercises source deploy orchestration and real preparation;
it does not exercise a live Docker daemon, host poller, HTTP traffic or deployment.
The old-image 512 MiB observation above remains a separate bounded startup fact.
Parent Task 3.2, Task 11 and activation remain open; no push or deploy occurred.

Fresh follow-up checks:

- `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-devsync/src/sync.test.ts tools/tool-devsync/src/mcp-document-sync.test.ts`:
  **63 passed, 0 failed, 235 assertions**, 32.62 seconds.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-devsync:typecheck --skip-nx-cache`:
  passed uncached; Nx recorded the executed TypeScript command (1.0 second).
- Scoped ESLint over `sync.ts` and `mcp-document-sync.test.ts`: passed.
- `bunx openspec validate cross-project-dependencies --json`: passed 1/1.

The complete tool-devsync test target, full repository gates and Docker/cluster
observations were not rerun for this source-deploy follow-up. The focused
production sync/preparation path above is the new evidence.
