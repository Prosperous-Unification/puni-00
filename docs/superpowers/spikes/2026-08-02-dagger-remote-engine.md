# Spike: Dagger remote engine over SSH tunnel

**Date:** 2026-08-02
**Verdict: `TUNNEL_OK`**

## Goal

Decide whether a Dagger engine running on the remote build host (`h2puni`,
Ubuntu/amd64) can be driven from this local arm64 Mac over an SSH tunnel, to
build `linux/amd64` images without giving up host swappability. Eleven later
tasks in the blue/green deploy plan depend on this answer.

## What was done

1. Installed the Dagger CLI locally, into `$HOME/.local/bin` (already on
   `PATH`, no shell profile edits needed), with:

   ```bash
   curl -fsSL https://dl.dagger.io/dagger/install.sh | BIN_DIR=$HOME/.local/bin sh
   dagger version
   ```

   - Resolved version: **Dagger CLI v0.21.8** (`darwin/arm64/v8`).
   - The CLI reports its matching engine image as
     `image://registry.dagger.io/engine:v0.21.8`.

2. **Engine image tag**: the brief's pinned tag `v0.18.10` was stale relative
   to the locally installed CLI. Per the brief's own escalation instructions,
   used the CLI's matching tag instead and recorded it here:
   **`registry.dagger.io/engine:v0.21.8`**. CLI/engine version parity avoids
   a class of protocol-mismatch failures, so this is the correct pin, not an
   arbitrary substitution.

3. **Docker on h2puni**: not installed at task start. The human partner
   installed `docker.io` (now Docker 29.1.3) and added `puni1` to the
   `docker` group, plus configured passwordless `sudo` for
   `apt-get`/`usermod`/`docker`/`systemctl` for this session. Verified
   `ssh h2puni 'docker ps'` works without `sudo`.

4. **Port collision (finding)**: the brief's `docker run` command binds
   `127.0.0.1:8080` on the host. That port is already bound — but to `*:8080`
   (all interfaces), not loopback — by the **host-installed Caddy**
   (`curl http://127.0.0.1:8080/` returned `HTTP/1.1 200 OK` /
   `Server: Caddy` / body `wbs-tool: no site deployed yet`). This is existing
   live infrastructure and was left untouched. The Dagger engine container
   was instead bound to **`127.0.0.1:8081`** on the host (still loopback-only,
   same security posture the brief intended, just a different port). The
   local end of the SSH tunnel still uses `8080` since only the Mac's local
   port needs to match `_EXPERIMENTAL_DAGGER_RUNNER_HOST`; the tunnel forwards
   local `8080` → `h2puni:127.0.0.1:8081`.

5. **TCP listener not on by default (finding)**: the Dagger engine image does
   not expose a TCP GRPC listener out of the box — it only starts the two
   default Unix socket listeners (`/run/buildkit/buildkitd.sock`,
   `/run/dagger/engine.sock`). Publishing the container port alone (as the
   brief's `docker run` shows) maps to nothing listening. The engine binary
   accepts a repeatable `--addr` flag (confirmed via
   `docker exec dagger-engine /usr/local/bin/dagger-engine --help`), so the
   container was started with:

   ```
   docker run -d --restart always --privileged \
     -v dagger-engine:/var/lib/dagger \
     -p 127.0.0.1:8081:8080 \
     --name dagger-engine \
     registry.dagger.io/engine:v0.21.8 \
     --addr unix:///run/buildkit/buildkitd.sock \
     --addr unix:///run/dagger/engine.sock \
     --addr tcp://0.0.0.0:8080
   ```

   Engine logs confirmed: `running server on [::]:8080` alongside the two
   Unix sockets, and warned (as expected, and acceptable since the socket is
   loopback-only and reached solely via the SSH tunnel):
   `TLS is not enabled for tcp://0.0.0.0:8080. enabling mutual TLS
authentication is highly recommended`.

6. Opened the tunnel and pointed Dagger at it:

   ```
   ssh -f -N -L 8080:127.0.0.1:8081 h2puni
   export _EXPERIMENTAL_DAGGER_RUNNER_HOST=tcp://127.0.0.1:8080
   ```

7. **JS SDK dependency gap (finding)**: `@dagger.io/dagger@0.21.8`'s
   `dist/src/telemetry/init.js` statically imports
   `@opentelemetry/exporter-trace-otlp-proto` and
   `@opentelemetry/sdk-trace-base`, but neither is declared in the package's
   own `dependencies` — only `@opentelemetry/exporter-trace-otlp-http` is
   listed. `bun run /tmp/spike.ts` failed twice with `ENOENT while resolving
package` for each, in turn. Fixed by adding both explicitly as dev
   dependencies (`bun add -d @opentelemetry/exporter-trace-otlp-proto
@opentelemetry/sdk-trace-base`). This is a packaging bug in the Dagger SDK,
   not a problem with the tunnel/platform approach, but any later task that
   consumes `@dagger.io/dagger` from a clean install will hit it too and
   should install these two packages alongside it.

8. Ran the spike script from the brief (written to `/tmp/spike.ts`, not
   committed — inlined below verbatim so the exact test is reproducible from
   this doc, since `/tmp` and the brief itself under `.superpowers/` are both
   outside git):

   ```typescript
   import { connect } from '@dagger.io/dagger';

   await connect(
     async (client) => {
       const out = await client
         .container({ platform: 'linux/amd64' })
         .from('alpine:3.20')
         .withExec(['uname', '-m'])
         .stdout();
       console.log('arch reported by the built container:', out.trim());
     },
     { LogOutput: process.stderr },
   );
   ```

   This built `alpine:3.20` pinned to `linux/amd64`, executed `uname -m`
   inside it, through the tunnel.

9. **Control runs (added on review — see Finding 1 below).** A container
   printing `x86_64` while pinned to `linux/amd64`, on a host that is
   natively amd64, cannot by itself distinguish "the pin worked" from "the
   pin did nothing and the engine just built for its native host
   architecture." To make that distinction, ran two more variants of the
   same script against the same tunnelled engine, changing only the
   `platform` argument:

   **(a) explicit `platform: 'linux/arm64'`** — the opposite of the host's
   native architecture. If the pin does nothing, this should still print
   `x86_64` (or fail because the host can't build arm64 without a pin
   taking effect); if the pin works, it should print `aarch64`.

   ```typescript
   import { connect } from '@dagger.io/dagger';

   await connect(
     async (client) => {
       const out = await client
         .container({ platform: 'linux/arm64' })
         .from('alpine:3.20')
         .withExec(['uname', '-m'])
         .stdout();
       console.log('arch reported by the built container:', out.trim());
     },
     { LogOutput: process.stderr },
   );
   ```

   **(b) `platform` argument omitted entirely** — `.container()` with no
   argument, to record the engine's unpinned default.

   ```typescript
   import { connect } from '@dagger.io/dagger';

   await connect(
     async (client) => {
       const out = await client.container().from('alpine:3.20').withExec(['uname', '-m']).stdout();
       console.log('arch reported by the built container:', out.trim());
     },
     { LogOutput: process.stderr },
   );
   ```

## Result

Three runs against the same tunnelled engine, changing only the `platform`
argument:

| Run                     | `platform` argument | Output    | Exit | Wall-clock (`real`)            |
| ----------------------- | ------------------- | --------- | ---- | ------------------------------ |
| Original (brief step 4) | `linux/amd64`       | `x86_64`  | 0    | 10.207s (cold) / 6.983s (warm) |
| Control (a)             | `linux/arm64`       | `aarch64` | 0    | 8.663s                         |
| Control (b)             | _(omitted)_         | `x86_64`  | 0    | 7.245s                         |

Full command transcript for the two control runs:

```
$ export _EXPERIMENTAL_DAGGER_RUNNER_HOST=tcp://127.0.0.1:8080
$ time bun run /tmp/spike-arm64.ts
Downloading CLI... OK!
Creating new Engine session... OK!
Establishing connection to Engine... OK!
arch reported by the built container: aarch64
✔ connect 0.6s
✔ version: String! 0.0s
✔ container(platform: "linux/arm64"): Container! 0.0s
✔ .from(address: "alpine:3.20"): Container! 2.1s
✔ withExec uname -m 0.1s
✔ .stdout: String! 0.8s
real  0m8.663s
user  0m1.053s
sys   0m0.785s

$ time bun run /tmp/spike-noplatform.ts
Downloading CLI... OK!
Creating new Engine session... OK!
Establishing connection to Engine... OK!
arch reported by the built container: x86_64
✔ connect 0.6s
✔ version: String! 0.0s
✔ container: Container! 0.0s
✔ .from(address: "alpine:3.20"): Container! 0.9s
$ withExec uname -m 0.0s CACHED
✔ .stdout: String! 0.0s
real  0m7.245s
user  0m1.053s
sys   0m0.729s
```

**Interpretation:** control (a) ran successfully and printed `aarch64` —
different from both the amd64-pinned run and the unpinned default. This
proves the `platform` argument demonstrably drives the container's
architecture through the remote tunnelled engine; it is not a no-op that
happens to coincide with the host's native architecture. Control (b) shows
the engine's default (no pin) is the host's native architecture (`x86_64`),
which is exactly the failure mode the plan's "never inherit host
architecture" constraint exists to prevent — confirming why the explicit pin
in the original brief step 4 matters, and that it does what it claims.

- **Errors encountered and resolved:** the port collision, the missing TCP
  listener, and the two missing OTel SDK dependencies, all detailed above.
  No unresolved errors in any of the three runs.

## Side effects on h2puni

- Docker installed by the human partner (pre-existing, not this spike).
- New container `dagger-engine` created, `--restart always`, `--privileged`,
  bound to `127.0.0.1:8081` only, with a named volume `dagger-engine` for
  build cache. Left running (intended as the persistent engine per the
  brief).
- **Live systemd units `wbs-be-01` and `wbs-gw-01`, and the host Caddy
  config, were not touched or restarted.** (Caddy's existing `:8080` binding
  is what forced the port change above — its config was only read via an
  unauthenticated `curl` probe, never modified.)
- The local end of the SSH tunnel (`ssh -f -N -L 8080:127.0.0.1:8081 h2puni`)
  was closed after the spike finished; it is not a persistent process.

## Verdict

**`TUNNEL_OK`**

A Dagger engine running as a privileged container on h2puni, reached over a
loopback-only SSH tunnel from this arm64 Mac, correctly builds and executes
containers with the `platform` argument honored — proven by the control runs
above, which show `linux/arm64` producing `aarch64` (different from both the
`linux/amd64` run's `x86_64` and the unpinned default's `x86_64`). This rules
out the failure mode the plan's constraint exists to catch: a pin that is
silently ignored because the build host happens to already be amd64. Task 4
can build `FROM` this mechanism, with four adjustments carried forward for
whoever implements it:

1. Use engine tag `v0.21.8` (matching whatever Dagger CLI version is pinned
   at implementation time — re-check for drift), not `v0.18.10`.
2. The engine container's `docker run` needs an explicit
   `--addr tcp://0.0.0.0:8080` argument; the image does not listen on TCP by
   default.
3. If port `8080` is already bound on the target host (e.g. by Caddy, as
   here), pick a different host-side port for the container mapping — the
   tunnel's local port is independent and can still be `8080`.
4. A clean install of `@dagger.io/dagger` needs
   `@opentelemetry/exporter-trace-otlp-proto` and
   `@opentelemetry/sdk-trace-base` added alongside it as dev dependencies
   until upstream fixes the missing declared dependencies.
