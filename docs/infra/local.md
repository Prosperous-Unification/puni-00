# Local k3s lab and source-run dev environments

Operator commands and what has been tested: [infrastructure operator guide](README.md).

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

Before installing Flux, `platform` and `fleet` build the authenticated local
object-store archive and verify its digest registration in each server and agent's
containerd image store. This requires minisign (`MINISIGN` may name its executable)
and the Buildx client locked in `infra/versions/object-store.json`; see
[image inputs and tool provisioning](../../infra/versions/README.md).
The `app` profile does not build object storage.

| What                                                                      | Memory                                                          | Disk                                                             | Time                                                                                           |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `app` lab, idle                                                           | 0.66 GiB (server 621 MiB, load balancer 34 MiB, registry 6 MiB) | 1.6 GB k3s data volume, 0.2 GB registry, 0.43 GB images          | `up` 16.5 s with images cached, plus up to 40 s until the bundled Traefik serves; `down` 1.2 s |
| each running dev environment                                              | about 0.95 GiB (be, gw, fe, mcp, Nx, supervisor)                | forge image 192 MiB, once; a worktree with `node_modules` 1.6 GB | first `up` 58 s including the image build; later 12–28 s                                       |
| `fleet` shell: both clusters with Flux, before the platform graph         | 1.71 GiB (7 containers)                                         | —                                                                | `up` 114 s; `down` 2.2 s                                                                       |
| `platform`/`fleet` with the platform graph (Elastic, Prometheus, backups) | not measured                                                    | —                                                                | —                                                                                              |

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
Neither `up` nor `down` touches `~/.kube/config` or its current context. `up` refuses if the
registry or a cluster load balancer publishes anything beyond `127.0.0.1`. `down` deletes only
Docker resources labelled `puni.dev/lab-id=<id>` whose names the lab derives, and only the
clusters of the named `--profile`; the registry, network and state stay while another lab
cluster remains. Anything else with the label is reported and left.

## Source-run dev environments

`bunx nx run tool-devsync:dev-env -- up|down|status --slug <slug> --worktree <path> --cluster puni-<id>-platform`

One worktree, one slug, one Pod `dev-<slug>` in its trusted `puni-forge-<slug>` namespace, served at
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
worktree already served under another slug, a kubeconfig that reaches a cluster whose marker
another lab owns, and a `--worktree-root` that is no longer the directory `lab up` mounted
(moved aside and recreated: the node would still serve the old one). Two Leases,
`dev-<slug>` and `dev-wt-<hash>`, stay in `puni-forge` and are the claim: of two concurrent `up`s for one slug or one
worktree, the second refuses. `down` deletes them. The worktree needs `bun install` and
`bun run dev:setup` first. The Pod runs as the worktree's owner UID and GID; a root-owned
worktree is refused.

The environment gets its own SQLite database on volume `dev-<slug>-data` (`DB_PATH=/data/wbs.db`),
never the worktree's `local.db`. It survives Pod recreation; `down` deletes the owned namespace
and its Pod, Service, Ingress, NetworkPolicy and database volume. Namespace ownership requires
the lab and slug labels, source trust and worktree annotation; teardown uses the inspected UID
so it cannot delete a replacement namespace. A failed create keeps the namespace and claims
for the same pair to retry or tear down. Missing, malformed, foreign or terminating ownership
refuses adoption. Before upgrading from shared-namespace environments, run `down` using the
previous checkout; this deletes their databases. All three commands refuse surviving legacy
Pods, Services, Ingresses, NetworkPolicies or database claims even when the old Pod is gone. This change does not transfer those databases. A NetworkPolicy
admits only the ingress controller, so one environment cannot call another's tiers.

`up` builds `deploy/dev-src/Dockerfile`, pushes it to the lab registry and, on a lab it owns,
writes that digest and the exact worktree and solver directories into the forge admission
parameters (`wbs-solver/puni-trusted-workload`). The roots are derived from per-slug claims
kept in an annotation, written only at the version read (a conflict is retried), restored
if the Pod cannot be created, and released by slug on `down` even when the Pod is gone. If a
Flux Kustomization applies that ConfigMap without `kustomize.toolkit.fluxcd.io/ssa:
IfNotPresent`, `dev-env` refuses: Flux would revert the roots on its next reconcile. The Pod is created as the
`dev-environment-controller` service account in `puni-forge`. Each environment has a workload
service account of the same name with no API token, and a local RoleBinding grants Pod access
to the shared controller only. Outside a lab those parameters are reviewed policy changes, and `dev-env` refuses
to write them. The forge admits one image, so all environments of a lab build the same
Dockerfile.

The solver supervisor's runtime directory is mounted read-only at `/run/wbs-solver`, never the
`supervisor.sock` inode, so an atomically replaced socket reaches the running Pod.

### Container restart recovery (2026-10-15)

Forge sets `NX_DAEMON=false` and
`NX_WORKSPACE_DATA_DIRECTORY=/tmp/puni-forge-nx/workspace-data`. Installed Nx 23.2.1
uses its workspace database for continuous-task ownership even with the daemon disabled.
Keeping that database in the container's writable layer gives each replacement container
fresh ownership state. Do not mount a volume, including `emptyDir`, over this path: volumes
survive container restarts within the same Pod. The mounted worktree's `.nx` ownership
is left untouched; no broad `nx reset` is needed.

The 2026-10-15 disposable F9 baseline first terminated `OOMKilled` at the committed 2Gi
limit, then its automatic restart stalled on four serve ownership rows under `/src/.nx`.
After removing those exact stale rows, recovered browser/HMR/checker acceptance passed
at the same 2Gi limit. That recovery does not resolve the first cold-start OOM. This
focused change isolates ownership on future restarts; it changes neither startup
concurrency nor resource limits. Its installed-Nx regression and removed-setting proof
are recorded in
[`forge-restart-state/verify.md`](../../openspec/changes/forge-restart-state/verify.md).
Cold-start reliability remains an open F9 acceptance gap.

### Local process observations

For an attended diagnostic on Linux, explicitly select the exact cgroup-v2 directory
in the same namespace as `/proc`, then run:

```sh
bun tools/tool-devsync/src/k3s/forge-process-observation.ts /sys/fs/cgroup/<exact-cgroup>
```

The command emits one JSON line per completed observation, at most 30 samples with
one-second pauses inside a 30-second local deadline. Redirect stdout to a private evidence
file outside the checkout. Required files must be readable. A missing, unreadable,
malformed, oversized or changing identity fails the command; previous completed lines remain.
Exit zero proves only that these observations completed.

Each line records UTC time, elapsed time, the cgroup path/device/inode, memory current/peak/max/events, and exact
`cgroup.procs` members with PID/start-time, PPID, executable basename, RSS in KiB, threads
and a launcher role hint. Known second-argument Vite/Nx launcher paths yield `vite`/`nx`;
other commands remain `unknown`. Raw argv, environment and command argument basenames
are omitted. The hint is observational and cannot authenticate what code a process runs.

The collector checks process identity, command/executable and exact membership around
inspection and cgroup directory identity before emitting. Samples are sequential observations,
not atomic snapshots. It does not enumerate descendant cgroups; their charges can appear in
memory counters without appearing in the exact member list. Summed RSS is not cgroup usage.
Use retained container identity and termination evidence separately when interpreting OOM.

This command neither discovers nor launches a remote sampler and performs no lab lifecycle,
restart, capacity or acceptance operation. Its deadline is local, subject to scheduler tolerance;
it does not prove termination of a remote process or kernel uninterruptible IO. Do not place
it behind `docker exec` or SSH and claim a remote hard deadline from the local exit.
Offline fixtures and watched negatives are recorded in
[`f9-local-process-observation/verify.md`](../../openspec/changes/f9-local-process-observation/verify.md).
The historical first cold-start OOM and complete F9 acceptance remain unresolved.

### Forge namespace admission prerequisite

Admission reserves `puni-forge` and `puni-forge-<slug>`. The suffix uses the existing
`dev-env` slug grammar: 1–20 characters, starting with a lowercase letter, ending with a
lowercase letter or digit, and containing lowercase letters, digits or hyphens. Each reserved
namespace requires `puni.dev/trusted-hostpath: source` on creation and update. The policy
rejects malformed reserved suffixes, missing/changed/removed labels, unknown trusted-label
values and trusted labels on other identities. `wbs-solver` retains its `solver` identity.
All forge identities use the same exact-root parameters, image, service-account,
controller, node and container-security rules. `dev-env` uses the namespace family with
owned lifecycle as described above; `puni-forge` retains shared controller and Lease authority.

Run this admission-only rehearsal against a new disposable cluster. It installs no Flux graph
and proves API admission, including the ephemeral-container subresource. The test Pods
remain unscheduled because the rehearsal has no forge node selector; it proves no host mount or
application runtime behavior. Use the locked `k3d` and `kubectl` from the Tools section.

```sh
export KUBECTL="$HOME/.local/puni-bin/kubectl"
export KUBECONFIG="/tmp/puni-forge-admission.kubeconfig"
export KUBE_CONTEXT=k3d-puni-forge-admission
"$K3D" cluster create puni-forge-admission \
  --image docker.io/rancher/k3s:v1.36.4-k3s1@sha256:edad48e12bf81c3a09ac1c05c0c0ffaaa22145980b989d6fae84543a76b83657 \
  --servers 1 --agents 0 --no-lb \
  --kubeconfig-update-default=false --kubeconfig-switch-context=false \
  --k3s-arg '--disable=traefik,servicelb,metrics-server@server:*' --wait --timeout 180s
"$K3D" kubeconfig get puni-forge-admission > "$KUBECONFIG"
bun infra/platform/conformance/admission/forge-namespace-upgrade-check.mjs --prepare
"$KUBECTL" --kubeconfig "$KUBECONFIG" --context "$KUBE_CONTEXT" apply \
  -f infra/platform/conformance/admission/forge-namespaces.yaml \
  -f infra/platform/policy/trusted-images.yaml \
  -f infra/platform/policy/trusted-workloads.yaml
bun infra/platform/conformance/admission/forge-namespace-check.mjs
bun infra/platform/conformance/admission/forge-namespace-upgrade-check.mjs
"$K3D" cluster delete puni-forge-admission
rm "$KUBECONFIG"
```

The upgrade preparation creates unlabelled valid and malformed reserved namespaces and approved
and unsafe Pods before any admission policy exists. A separate parameter-free Pod identity
policy covers Pod CREATE/UPDATE and `pods/ephemeralcontainers` regardless of namespace labels,
so installing the platform closes that pre-existing namespace bypass. Upgrade probes deny all
12 requests with and without trusted parameters, then restore the parameter ConfigMap. These
probes require the new identity policy's specific denial message, never a Kubernetes schema
rejection. Policy bindings propagate asynchronously; accept only a complete successful check
after the API has observed installation.

The check requires explicit cluster variables, tests the original forge plus `alpha` and `beta`,
and checks that deleting the shared parameter ConfigMap denies all trusted Pods while ordinary
Restricted Pods still pass. It restores that ConfigMap in `finally`. `PROBE_FILTER` selects one
named assertion when deliberately removing a guard in this disposable cluster; the verification
record contains the observed failures. Delete the cluster after any interrupted rehearsal.

### What reaches a running environment

| Change                                                                                                                                                        | What carries it                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App source                                                                                                                                                    | The watchers. Nothing restarts.                                                                                                                                                                                                                                                                     |
| A `RESTART_PATHS` entry of `tools/tool-devsync/src/sync.ts` (`bun.lock`, migrations, `package.json`, `nx.json`, project and tsconfig files, `vite.config.ts`) | The in-Pod supervisor stops the tiers, runs `bun install --frozen-lockfile` and starts them again, within about two seconds of the write. The container is not restarted. If the install fails the container stops and retries it on every restart; `status` prints `INSTALL REQUIRED` and exits 4. |
| The supervisor's own sources (non-test `tools/tool-devsync/src/**/*.ts`)                                                                                      | The supervisor exits and the kubelet restarts the container with the new code.                                                                                                                                                                                                                      |
| `deploy/dev-src/Dockerfile`, `deploy/k8s/wbs/overlays/dev/`                                                                                                   | Nothing until `dev-env up`, which recreates the Pod. `status` prints `RECREATE REQUIRED` and exits 3 meanwhile.                                                                                                                                                                                     |
| Per-tier `.env` files                                                                                                                                         | Nothing: they are not watched, as on h2puni. `kubectl exec dev-<slug> -- kill 1` restarts the container and keeps the database. The Pod environment overrides `DB_PATH`, `APP_ORIGIN` and the MCP URLs.                                                                                             |

### Live check

With an environment up, this drives HTTP, the gateway socket, MCP metadata, the environment
database, HMR in headless Chromium, a watcher reload and both restart paths. It edits and
restores three files of the worktree, so run it on a clean checkout. The browser part needs
Chromium once: `bunx playwright install chromium`.

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

### Bounded first-attempt forge diagnostics

Automatic lab creation and teardown in `forge-recovery-lab.ts` are **disabled**. The command
exits nonzero before any mutation with `tool-fleet creation receipts required`.
A read-only inventory cannot authorize deleting resources that appear after that snapshot,
and the current lab owner returns no per-resource creation receipts for partial startup.
Do not use this packet as a reusable automatic lab provisioner.

The retained components are the independent-verdict coordinator (`forge-recovery-check.ts`),
first-container memory/parser checks, read-only inventory and cleanup verification, guarded
node PID1 command boundary, browser trace preload, and a process runner with finite process-group
SIGKILL deadlines (`forge-recovery-process.ts`). Killing a Docker client does not kill its
remote process. Any future node sampler therefore needs its own verified remote hard deadline,
as well as receipt-backed teardown of the owned node. Current code does not launch a sampler.

The one historical 2026-10-16 run used candidate `9c5828e43879059ec5708df4a381d4fa5cdbb36c`.
Its original cold OOM and restored-checker failures remain in the immutable external evidence
listed in [verification](../../openspec/changes/forge-restart-state/verify.md#one-instrumented-fresh-worktree-lab).
No later lab or warm retry replaces them. The CLI will remain unavailable until the lab owner's
creation-receipt contract is designed and proven, including partial creation and name races.

### Read-only HTTP observation

The first web check now bounds headers and body and includes status, path, content type,
root-marker presence and duration on failure. To observe later availability separately:

```sh
bun tools/tool-devsync/src/k3s/forge-http-observation.ts http://<slug>.localhost:<port>
```

This issues GET / only for a fixed 30-second window and retains the immediate verdict even
when later responses succeed. Its exit status reflects that immediate verdict. It never
runs the full checker, which writes the database and edits files. Responses are limited to
64KiB, redirects are refused, and response content is not logged. This HTTP slice supplies
no process/cgroup identity or remote sampler and does not explain the historical failures.

### Creation attempts and manual recovery

Each k3d `up` durably reserves a distinct creation journal before creating resources, then
records ready or failed. Journals are owner-only files under
`.puni/fleet-labs/k3d/.attempts/<lab-id>/<attempt-id>.json`; ordinary `down` preserves them.
They record the creation attempt and Docker daemon identity, not ownership of individual
containers, networks or volumes.

Direct network and registry creation also reserve pending operations under
`.puni/fleet-labs/k3d/.attempts/<lab-id>/<attempt-id>.operations/`. Operation schema v2 binds the slot to its lab-derived Docker kind/name and rejects earlier v1
operation files. Each successful command records the full Docker ID it returned before the next creation starts. Errors and malformed or
lost responses leave pending evidence; never resolve them by adopting a name or label. These
receipts do not cover k3d-created resources or the registry's volumes. Read-only receipt assessment
requires the same daemon, exact inspected IDs, kinds and names, and no foreign attachments; it grants no cleanup
authority. Ordinary `down` preserves this evidence alongside the journal.

A failed `up` reports its attempt and journal path. Its resource inventory is unknown: resources
may remain, and the journal does not identify them. `up` disables k3d v5.9.0 automatic failure
rollback with `--no-rollback`; the wrapper never starts cleanup. Inspect exact resource identities
manually before cleanup. Ordinary `down` still derives its targets from names and
labels; a journal does not make that teardown safe for recovery or prove which attempt created
an object. The separate journal-consuming lifecycle refuses deletion, and the F9 recovery CLI
remains disabled pending complete resource evidence and an identity-safe executor.
