# Local k3s lab and source-run dev environments

Three ways to run WBS on one machine, fastest first:

| Loop                                         | Use it for                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `bun run dev` ([local dev](../local-dev.md)) | UI and API work; nothing is containerised                                                             |
| k3d `app` profile + `dev-env`                | a worktree served from source on k3s, deployment and migration checks, several worktrees side by side |
| k3d `platform` / `fleet` profiles            | platform integration: Flux graph, observability, backups, a separate worker cluster                   |

k3d proves application and Kubernetes paths only. It cannot prove systemd, SSH, nftables,
host mounts, cloud CSI, a Hetzner private-network MTU or distinct-host loss; the Ubuntu VM lab
(`bunx nx run tool-fleet:lab -- up --lab-id <id> --profile platform|workers ...`) covers the
host path.

## Tools

Docker, Bun, and the locked `k3d` and `kubectl` from `infra/versions/toolchain.json`. The lab
refuses any other version. From the repository root:

```sh
mkdir -p "$HOME/.local/puni-bin"
for tool in k3d kubectl; do
  url=$(bun -p "require('./infra/versions/toolchain.json').binaries.$tool.url")
  sum=$(bun -p "require('./infra/versions/toolchain.json').binaries.$tool.sha256")
  curl -fsSLo "$HOME/.local/puni-bin/$tool" "$url"
  echo "$sum  $HOME/.local/puni-bin/$tool" | sha256sum -c
  chmod +x "$HOME/.local/puni-bin/$tool"
done
export K3D="$HOME/.local/puni-bin/k3d" KUBECTL="$HOME/.local/puni-bin/kubectl"
```

## Profiles

`bunx nx run tool-fleet:lab -- up|down|status --profile app|platform|fleet [--id <lab>]`.
The lab ID (default `local`) names everything: clusters `puni-<id>-platform` and
`puni-<id>-workers`, contexts `k3d-puni-<id>-*`, registry `puni-<id>-registry`, network
`puni-<id>`. `up` also needs `--worktree-root <dir>`, the one directory whose children may be
served as worktrees; `--solver-runtime <dir>` mounts a solver supervisor's runtime directory
(default: an empty owner-only directory in the lab state).

| Profile    | Clusters                                          | Installs                                                                   | `up` refuses below                  |
| ---------- | ------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------- |
| `app`      | platform: 1 server                                | bundled Traefik and metrics-server, F6 policy stage, lab registry          | 4 GiB available memory, 12 GiB disk |
| `platform` | platform: 1 server, bundled Traefik off           | the above plus locked Flux; the platform graph follows the rehearsal below | 16 GiB, 40 GiB                      |
| `fleet`    | platform plus workers: 1 tainted server, 2 agents | as `platform`, on both clusters                                            | 24 GiB, 50 GiB                      |

Memory is `MemAvailable`, disk the free space under Docker's root. A refusal names the next
smaller profile. Measured on 2026-09-18 (24 cores, 31 GiB, shared with a VM lab):

| What                                                                      | Memory                                                          | Disk                                                    | Time                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| `app` lab, idle                                                           | 0.66 GiB (server 621 MiB, load balancer 34 MiB, registry 6 MiB) | 1.6 GB k3s data volume, 0.2 GB registry, 0.43 GB images | `up` 16.5 s with images cached; `down` 1.2 s             |
| each running dev environment                                              | about 0.95 GiB (be, gw, fe, mcp, Nx, supervisor)                | forge image 192 MiB, once                               | first `up` 58 s including the image build; later 12–18 s |
| `fleet` shell: both clusters with Flux, before the platform graph         | 1.71 GiB (7 containers)                                         | —                                                       | `up` 114 s; `down` 2.2 s                                 |
| `platform`/`fleet` with the platform graph (Elastic, Prometheus, backups) | not measured                                                    | —                                                       | —                                                        |

The `fleet` shell ran with the resource refusal bypassed for the measurement; this host had
5–11 GiB available while a VM lab shared it, and `up` refused both profiles as it should. The
16 and 24 GiB thresholds remain the planning guidance until the full graph is measured.

`platform` and `fleet` stop after installing Flux. Reconcile the committed graph as the F7
rehearsal did ([platform](platform.md)): the immutable marker exists already; add the
`<cluster-id>-kubeconfig` Secret, a disposable `sops-age` identity, a Git source pinned to a
commit and the root Kustomization `./infra/clusters/<role>/local`. Until the networking stage
reconciles, these profiles have no ingress, so a dev environment there is not reachable.

Every host port binds `127.0.0.1`. Kubeconfigs, rendered k3d configs and `lab.json` live in
`.puni/fleet-labs/k3d/<id>/` (mode 0700, ignored by Git; `up` refuses if it is not ignored).
Neither `up` nor `down` touches `~/.kube/config` or its current context. `down` deletes only
Docker resources labelled `puni.dev/lab-id=<id>` whose names the lab derives; anything else
with the label is reported and left.

## Source-run dev environments

`bunx nx run tool-devsync:dev-env -- up|down|status --slug <slug> --worktree <path> --cluster puni-<id>-platform`

One worktree, one slug, one Pod `dev-<slug>` in the trusted `puni-forge` namespace, served at
`http://<slug>.localhost:<port>/` where `<port>` is the lab's loopback ingress port. The Pod
runs `bin/dev.sh` (be-01, gw-01, fe-01, mcp-01) from the mounted worktree, like the h2puni dev
container.

| URL                                   | Serves                                      |
| ------------------------------------- | ------------------------------------------- |
| `http://<slug>.localhost:<port>/`     | fe-01 (Vite) with HMR on the same origin    |
| `http://<slug>.localhost:<port>/api/` | be-01 through Vite's edge proxy, local auth |
| `ws://<slug>.localhost:<port>/ws`     | gw-01 through Vite's edge proxy             |
| `http://<slug>.localhost:<port>/mcp`  | mcp-01; OAuth metadata names this origin    |

`up` refuses a worktree whose real path is outside `--worktree-root` (a symlink escape
included), the root itself, a subdirectory of a checkout, one owned by another user, one that
shares no root commit with this repository, a slug already serving another worktree, a
worktree already served under another slug, and a kubeconfig that reaches a cluster whose
marker another lab owns. The worktree needs `bun install` and `bun run dev:setup` first.

The environment gets its own SQLite database on volume `dev-<slug>-data` (`DB_PATH=/data/wbs.db`),
never the worktree's `local.db`. It survives Pod recreation; `down` deletes it with the Pod,
Service, Ingress and NetworkPolicy, selected by the slug and lab labels only. A NetworkPolicy
admits only the ingress controller, so one environment cannot call another's tiers.

`up` builds `deploy/dev-src/Dockerfile`, pushes it to the lab registry and, on a lab it owns,
writes that digest and the exact worktree and solver directories into the forge admission
parameters (`wbs-solver/puni-trusted-workload`). The Pod is created as the
`dev-environment-controller` service account, the only identity the forge Role lets create
Pods there. Outside a lab those parameters are reviewed policy changes, and `dev-env` refuses
to write them. The forge admits one image, so all environments of a lab build the same
Dockerfile.

The solver supervisor's runtime directory is mounted read-only at `/run/wbs-solver`, never the
`supervisor.sock` inode, so an atomically replaced socket reaches the running Pod.

### What reaches a running environment

| Change                                                                                                                                                        | What carries it                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App source                                                                                                                                                    | The watchers. Nothing restarts.                                                                                                                                                                         |
| A `RESTART_PATHS` entry of `tools/tool-devsync/src/sync.ts` (`bun.lock`, migrations, `package.json`, `nx.json`, project and tsconfig files, `vite.config.ts`) | The in-Pod supervisor stops the tiers, runs `bun install --frozen-lockfile` and starts them again, within about two seconds of the write. The container is not restarted.                               |
| `deploy/dev-src/Dockerfile`, `deploy/k8s/wbs/overlays/dev/`                                                                                                   | Nothing until `dev-env up`, which recreates the Pod. `status` prints `RECREATE REQUIRED` and exits 3 meanwhile.                                                                                         |
| Per-tier `.env` files                                                                                                                                         | Nothing: they are not watched, as on h2puni. `kubectl exec dev-<slug> -- kill 1` restarts the container and keeps the database. The Pod environment overrides `DB_PATH`, `APP_ORIGIN` and the MCP URLs. |

### Live check

With an environment up, this drives HTTP, the gateway socket, MCP metadata, the environment
database, HMR in headless Chromium, a watcher reload and both restart paths. It edits and
restores three files of the worktree, so run it on a clean checkout:

```sh
bun tools/tool-devsync/src/k3s/dev-environment-check.ts --origin http://<slug>.localhost:<port> \
  --worktree <path> --kubeconfig .puni/fleet-labs/k3d/<id>/puni-<id>-platform.kubeconfig \
  --context k3d-puni-<id>-platform --pod dev-<slug>
```

## Fresh-clone walkthrough

These are the commands of the recorded walkthrough; results are in the k3s-platform
`verify.md`, F9.

```sh
mkdir -p ~/puni-worktrees && cd ~/puni-worktrees
git clone <repository> puni-00 && cd puni-00
bun install && bun run dev:setup
# install k3d and kubectl as in "Tools" above
bunx nx run tool-fleet:lab -- up --id walk --profile app --worktree-root ~/puni-worktrees
bunx nx run tool-devsync:dev-env -- up --slug main --worktree ~/puni-worktrees/puni-00 --cluster puni-walk-platform
# open the printed web URL
bunx nx run tool-devsync:dev-env -- down --slug main --cluster puni-walk-platform
bunx nx run tool-fleet:lab -- down --id walk --profile app
```
