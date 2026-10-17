# Enroll h4claw and h3mon

The ordered operator commands that make h4claw the platform k3s server and join h3mon as its
observability agent (Twilight Dash WBS 070.1, 070.2, 070.4, 070.5). On 2026-09-27 step 2 ran, step 3
ran without the provider snapshots (no whole-host restore point was recorded then), and step 4 bootstrapped
h4claw but stopped before copying the join tokens. At that point step 5 onward had not run; that
execution record and its limits remain in
[the enroll-existing-hosts verification](../../openspec/changes/enroll-existing-hosts/verify.md).
Each step needs Dany's authorization of this exact procedure.

A read-only inventory on 2026-10-17 (`ssh h4 k3s kubectl get nodes -o wide`,
`get node h3mon` with JSONPath output, and `get kustomizations -n flux-system`) observed h4claw and h3mon
Ready on v1.36.4+k3s1. h3mon's Node was created on 2026-10-06, carries the observability
capability label and has no enrollment taint. Flux is installed: `target`, `controllers`,
`storage`, `policy` and `secrets` are Ready; `platform` is blocked by missing registry Secrets,
and later platform stages are not Ready. These observations establish that the live state
advanced beyond the September record. They do not verify the intervening Ansible runs,
idempotency, enrollment validation, memory checks, reboot checks or backups; those remain
unverified by this inventory. Subsequent provider snapshots and whole-host restore point status
are also unverified.

### h4claw reconciliation on 2026-10-17 (WBS 50.10)

Lane C reconciled the live server against the recorded procedure before making any host change.
No enrollment apply was needed: h4claw was already the reproducibly managed k3s server created by
the authorized 2026-09-27 run. The current read-only evidence was:

```text
$ ssh h4claw 'systemctl is-active k3s; k3s --version | head -1'
active
k3s version v1.36.4+k3s1 (4dedb15b)

$ ssh h4claw 'sudo k3s kubectl get nodes -o wide'
NAME     STATUS   ROLES                AGE   VERSION        INTERNAL-IP
h3mon    Ready    <none>               10d   v1.36.4+k3s1   10.1.0.2
h4claw   Ready    control-plane,etcd   19d   v1.36.4+k3s1   10.1.0.4

$ ssh h4claw 'curl --fail --output /dev/null --write-out "%{http_code}\n" http://127.0.0.1:3000/'
200
$ ssh h4claw 'sudo docker ps --format "{{.Names}}|{{.Status}}|{{.Ports}}"'
openhands-app|Up 3 weeks|127.0.0.1:3000->3000/tcp
```

The OpenHands check returned 200 both before and after this reconciliation; no container was
stopped or changed. `enp7s0` still owns `10.1.0.4/32`, Docker and
`puni-k3s-firewall.service` are active, the `inet puni_k3s` table exists, and the node has the
`control-plane`, `etcd`, `product`, and `ingress` labels with no enrollment taint. The host is
8 CPUs, 15,602 MiB RAM, and 132 GiB free on `/`; the older evolution plan's 4 CPU / 8 GB row is
stale.

The procedure's h4claw steps reconcile as follows:

| Step                      | Verdict                                                          | Evidence and limit                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, controller             | Recorded, not rerun                                              | The reviewed Ansible source remains on `main`; the controller checkout and secret inputs were not inspected.                                                                                                        |
| 2, preflight              | Satisfied by the 2026-09-27 record; current invariants rechecked | The recorded passes were `ok=27 changed=0`, then `ok=28 changed=0`; current address, preserved listener/container, OS, capacity, and machine placement still match.                                                 |
| 3, backup                 | Partial                                                          | `/root/pre-k3s-etc.tgz` exists with timestamp `2026-09-27T18:46:59Z`; the recorded Docker inventory exists in the execution record. No Hetzner snapshot was taken, and no later provider snapshot was verified.     |
| 4, bootstrap              | Satisfied                                                        | The recorded apply was `ok=47 changed=29`, its second run was `ok=38 changed=0`, and after-enrollment preflight was `ok=26 changed=0`. Current k3s and node output above prove the resulting server is still Ready. |
| 5, join/validation        | Live result satisfied; intervening run evidence incomplete       | h3mon is now Ready and both nodes have no enrollment taint, but this reconciliation did not recover the later Ansible join/validation summaries.                                                                    |
| 6, h3mon memory           | Not part of WBS 50.10 and not rerun                              | No conclusion from this h4claw-only reconciliation.                                                                                                                                                                 |
| 7, Flux                   | Partially satisfied                                              | The same-day inventory found `target`, `controllers`, `storage`, `policy`, and `secrets` Ready; `platform` remained blocked on registry Secrets.                                                                    |
| 8, reboot/data comparison | Not verified                                                     | The current node is healthy, but that does not prove the prescribed one-at-a-time reboot and before/after Victoria/Grafana comparison.                                                                              |

The off-host negative control used h1claw's public route to h4claw. TCP/22 on the same public
address succeeded, while TCP/6443 timed out (`nc -zvw5`, exit 1). The local API control on
h4claw (`127.0.0.1:6443`) succeeded. Thus the API was not reachable from that public-internet
vantage; this is a reachability observation, not a claim about every possible source address.

Placement is `infra/fleet/desired.yaml`; host variables are
`infra/ansible/inventory/production-existing-hosts.yml`.

## Placement

From the read-only probe of 2026-09-27:

- **h4claw** (8 cores, 15 GiB, private 10.1.0.4) is the single platform server with `product` and
  `ingress`.
- **h3mon** (4 cores, 7.6 GiB, private 10.1.0.2) is an agent with `observability` only. Its
  Docker-run Victoria, Grafana and MLflow stay outside k3s and keep running.
- **h2puni** (private 10.1.0.3) stays outside k3s. It is live production, the build box, the
  registry and the host-wide gate; a join would share its memory and firewall with k3s before
  the lock-aware cordon that WBS 070.3 requires exists. It is the Ansible controller below.
- **h1claw** is in no cluster: it holds the operator credentials and the backup puller and must
  not build or run workloads.
- The workers cluster has no host yet; it stays `bootstrap: required` with no nodes.

An unresolved machine ID written `operator-input:<host> /etc/machine-id` in `desired.yaml` (and
`unread` in the inventory) means the host has not been read yet; every `tool-fleet` operation on
that node refuses, and the base role refuses `unread`. Both production-existing-host entries now
contain the machine IDs captured by the 2026-09-27 preflight.

## What changes on each host

| Host   | Changes                                                                                                                                                                                                                      | Kept                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| h4claw | apt prerequisites, account `puni-fleet` with sudo (the cloud-init sudo grant is kept), bounded journald, k3s sysctls and modules, fleet nftables table, MTU unit, k3s server with embedded etcd; later Flux (`platform.yml`) | Docker and OpenHands (`127.0.0.1:3000`), SSH                                     |
| h3mon  | the same base and network changes, a 4 GiB `/swap.puni`, k3s agent capped by 1024Mi system + 384Mi kube reservations; later Elasticsearch, Kibana, Prometheus and collectors pinned to it                                    | Docker, Victoria (8428, 9428, 10428), Grafana (3000), MLflow (5000), OTel (4318) |

Pods never swap; host services may. The budget test
`tools/tool-fleet/src/observability-budget.test.ts` fits every pinned workload and DaemonSet in
h3mon's allocatable memory.

## Operator inputs

| Input                                                               | Where it comes from                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| SSH user with sudo on h3mon and h4claw                              | Dany; the probe saw uid 1000 on h4claw and 1001 on h3mon              |
| pinned SSH host keys (`known_hosts`)                                | the Hetzner console or an existing reviewed file, never `ssh-keyscan` |
| machine IDs                                                         | step 2's preflight fact, committed into `desired.yaml`                |
| `puni-fleet` authorized keys                                        | Dany                                                                  |
| k3s bootstrap credentials                                           | step 4, generated on h2puni with `openssl rand -hex 32` twice         |
| platform Secrets                                                    | step 7                                                                |
| Hetzner server names, `HCLOUD_TOKEN`                                | Dany, for the snapshots in step 3                                     |
| Flux deploy key, its `known_hosts`, SOPS age key, platform revision | `docs/infra/platform.md`; step 7                                      |
| container names to preserve                                         | step 2's preflight fact (`containers`)                                |

## 1. Prepare the controller on h2puni

h2puni is on the private network (10.1.0.3) and has Docker. Use a dedicated checkout, never the
build checkout `/home/puni1/wbs-build` or dev's.

```sh
git clone https://github.com/Prosperous-Unification/puni-00 ~/fleet-ops
cd ~/fleet-ops && git checkout <reviewed main sha> && bun install --frozen-lockfile
bunx nx run tool-fleet:controller-image
docker load --input dist/tool-fleet/controller.oci
OPS=~/.puni/fleet/2026-enroll && mkdir -p "$OPS" && chmod 700 "$OPS"
CONTROLLER=$(jq -r '.controller.image + "@" + .controller.digest' infra/versions/toolchain.json)
fleet_ansible() {
  docker run --rm --network host -e ANSIBLE_CONFIG="$PWD/infra/ansible/ansible.cfg" \
    -v "$PWD:$PWD:ro" -v "$OPS:$OPS:ro" -w "$PWD/infra/ansible" "$CONTROLLER" \
    ansible-playbook --inventory inventory/production-existing-hosts.yml \
    --extra-vars "@$OPS/vars.json" "$@"
}
```

Write `$OPS/known_hosts` (the reviewed keys for `10.1.0.4` and `10.1.0.2`), copy the SSH key
authorized for the admin user to `$OPS/id_admin`, then `$OPS/vars.json`, all mode `0600`:

```json
{
  "ansible_user": "<admin user>",
  "ansible_ssh_private_key_file": "<OPS>/id_admin",
  "ansible_ssh_common_args": "-o UserKnownHostsFile=<OPS>/known_hosts -o StrictHostKeyChecking=yes",
  "puni_operator_authorized_keys": ["<ssh-ed25519 …>"]
}
```

## 2. Preflight (read-only)

```sh
fleet_ansible --extra-vars puni_preflight_stage=before-enrollment playbooks/preflight.yml
```

It prints one `PUNI_PREFLIGHT_FACT=` line per host and fails on: another OS, too little memory,
the private address not on `enp7s0`, k3s already present, a k3s port in use, a cluster or
service CIDR overlapping a route or Docker network, an existing `puni-fleet` with other keys, or
a preserved listener that is not listening. The inventory keeps the cloud-init sudo grant
(`puni_remove_cloud_init_sudoers: false`), so the admin user keeps sudo.

Record from each fact: `machineId`, `privateMtu` (the rollback MTU), `containers`, `swap`. In one
reviewed PR, replace each `operator-input:` machine ID in `infra/fleet/desired.yaml` and each
`puni_machine_id: unread` in the inventory with the fact's value (`placement.test.ts` requires
them equal), and list the container names in `puni_preserved_containers`. Check out that commit
and rerun the preflight; a host answering with another machine ID fails it, and the base role
refuses `unread`, so nothing below can run before this step.

## 3. Back up both hosts

```sh
hcloud server create-image --type snapshot --description "pre-k3s h4claw" <h4 server name>
hcloud server create-image --type snapshot --description "pre-k3s h3mon" <h3 server name>
ssh h3mon 'curl --fail --silent http://127.0.0.1:8428/snapshot/create'   # consistent VictoriaMetrics snapshot
for host in h4claw h3mon; do
  ssh "$host" 'sudo tar --create --gzip --preserve-permissions --file /root/pre-k3s-etc.tgz \
    /etc/fstab /etc/sudoers.d /etc/sysctl.d /etc/modules-load.d /etc/systemd'
  ssh "$host" 'sudo docker ps --format "{{.Names}} {{.Mounts}}"' > "$OPS/$host-docker-mounts.txt"
done
```

The provider snapshot is crash-consistent and is the whole-host restore. Keep both until step 8
has passed for a week.

## 4. Bootstrap h4claw

Add to `$OPS/vars.json` the k3s artifact (`puni_k3s_version`, `puni_k3s_url`, `puni_k3s_sha256`
from `infra/versions/toolchain.json` `binaries.k3s`), `puni_validation_image` (`runtimeImages.k3dNode`
`name@digest`), and two fresh 64-hex secrets `puni_k3s_server_credential` and
`puni_k3s_agent_credential`. Keep a copy of `$OPS` in escrow; the credentials rejoin nodes.

```sh
fleet_ansible --limit h4claw playbooks/bootstrap.yml
fleet_ansible --limit h4claw playbooks/bootstrap.yml   # must print changed=0
fleet_ansible --limit h4claw --extra-vars puni_preflight_stage=after-enrollment playbooks/preflight.yml
```

Read the CA-bound join tokens (`/var/lib/rancher/k3s/server/token` and `agent-token`) over SSH
into `$OPS/vars.json` as `puni_k3s_server_token` and `puni_k3s_agent_token`. The node keeps its
`puni.io/enrollment` taint until step 5's validation, which needs both nodes.

The API admits only enrolled addresses and loopback, so run `kubectl` on h4claw itself:
`ssh h4claw sudo k3s kubectl get nodes`.

## 5. Join h3mon

```sh
fleet_ansible --limit h3mon playbooks/join.yml
fleet_ansible --limit h3mon playbooks/join.yml   # must print changed=0
fleet_ansible --extra-vars puni_validation_run_id=$(openssl rand -hex 8) playbooks/validate-enrollment.yml
fleet_ansible --extra-vars puni_preflight_stage=after-enrollment playbooks/preflight.yml
```

Validation compares each Kubernetes node's machine ID and address with the one read over SSH,
then removes the enrollment taints.

`tool-fleet:discover` and `plan --operation enroll` also refuse a wrong or missing target (see
`placement.test.ts`). This procedure uses the playbooks directly; the ID checks above are its
identity gate. Read-only discovery of both hosts is invoked through an SSH transport file beside
`$OPS/vars.json`, mode `0600`, using the same `known_hosts` and an account the forwarded agent's
key can log in as (the admin user, or `puni-fleet` from the inventory's `puni_operator_name`):

```sh
printf '{"user":"<user>","knownHostsFile":"%s/known_hosts"}\n' "$OPS" > "$OPS/ssh-transport.json"
chmod 600 "$OPS/ssh-transport.json"
bunx nx run tool-fleet:discover -- --fleet infra/fleet/desired.yaml \
  --output "$OPS/observation-$(date -u +%Y%m%dT%H%M%SZ).json" --ssh-transport "$OPS/ssh-transport.json"
```

- **Agent.** `SSH_AUTH_SOCK` must name a socket (connect to h2puni with `ssh -A`); discovery
  checks only that it is a socket, so an empty agent fails at login.
- **Owner.** The controller runs as uid 1000, so the transport's `known_hosts` and the agent
  socket must be readable by uid 1000; an owner-only file of another user fails at connect.
- **Host keys.** Only the reviewed keys are accepted; `"jump": {"user": …, "address": …}` adds a
  hop whose key must be in the same `known_hosts`.
- **Kubernetes API.** The fleet firewall admits the API only from enrolled addresses and
  loopback, so discovery reaches `https://10.1.0.4:6443` through an SSH forward to h4claw's
  loopback with the same transport, and verifies the certificate for `10.1.0.4`. `KUBECONFIG`
  needs a `platform` context holding the cluster CA and credentials (h4claw's
  `/etc/rancher/k3s/k3s.yaml`, context renamed); its server address is replaced by the forward.
- **Workers.** The `workers` cluster's `.invalid` endpoint marks it declared but unprovisioned:
  discovery records it not bootstrapped without any read, so it needs no context.
- **Provider.** The `platform` provider read still needs `HCLOUD_TOKEN`.

Every refusal, rendered option and rehearsal is in
[the discovery transport change](../../openspec/changes/discovery-ssh-transport/verify.md). No
production run has completed yet.

## 6. Check h3mon's memory

```sh
ssh h3mon 'swapon --show; cat /sys/fs/cgroup/kubepods.slice/memory.max; free -m'
ssh h4claw sudo k3s kubectl get node h3mon -o jsonpath='{.status.allocatable.memory}'
```

`memory.max` must equal capacity minus 1408 MiB; `/swap.puni` 4 GiB active.

## 7. Flux and SOPS (070.5)

Storage was decided on 2026-10-07: this cluster keeps node-local `puni-retain` volumes
(`infra/platform/storage/production-existing-hosts`, k3s local-path with Retain), so no
`kube-system/hcloud` Secret, external cloud provider or node rename is needed. Moving to hcloud
volumes is the 070.8 storage packet, not this procedure.

The `target`, `controllers`, `storage`, `policy` and `secrets` stages need no operator Secret.
`platform` and every later stage stay not Ready until each Secret that
`infra/platform/secrets/platform-production/externally-provided.json` lists
(`alertmanager-puni`, `elastic-s3-credentials`, `velero-credentials`, `velero-repo-credentials`,
`registry-auth`, `registry-ca`) exists, from its SOPS file or by hand. Check them with:

```sh
ssh h4claw sudo k3s kubectl get secret -n observability alertmanager-puni elastic-s3-credentials
ssh h4claw sudo k3s kubectl get secret -n puni-backup velero-credentials velero-repo-credentials
ssh h4claw sudo k3s kubectl get secret -n puni-registry registry-auth registry-ca
```

Place the read-only deploy key, its `known_hosts` and the SOPS age key on h4claw at mode `0600`
([platform](platform.md)), then:

```sh
fleet_ansible --limit h4claw --extra-vars puni_cluster_id=platform-production \
  --extra-vars puni_platform_revision=<40-hex main sha> \
  --extra-vars @"$OPS/flux.json" playbooks/platform.yml
```

`$OPS/flux.json` holds `puni_flux_url`, `puni_flux_sha256`, `puni_flux_version`,
`puni_flux_install_sha256`, `puni_platform_repository_url` and the three key paths. Watch each
stage (`ssh h4claw sudo k3s kubectl get kustomizations -n flux-system`) reach Ready in order,
then rerun step 6.

## 8. Verify nothing was lost

Rerun step 5's after-enrollment preflight for both hosts after a reboot of each, one at a time
(`sudo systemctl reboot`), and compare Grafana dashboards and a Victoria query with the step 3
snapshot.

## Rollback

Before any workload you need exists on the cluster, per host, h3mon first:

```sh
fleet_ansible --limit h3mon --extra-vars \
  '{"puni_rollback_host":"h3mon","puni_rollback_private_mtu":<privateMtu from step 2>,"puni_rollback_remove_operator":true}' \
  playbooks/rollback-host.yml
ssh h3mon 'sudo tar --extract --gzip --file /root/pre-k3s-etc.tgz -C / etc/fstab && sudo swapon --all'
ssh h4claw sudo k3s kubectl delete node h3mon   # while h4claw still runs
```

The `fstab` restore brings back any swap line the base role commented out (the probe saw no swap
on either host).

The variables go as JSON: `key=value` would make the boolean a string, which the play refuses.
`puni_rollback_remove_operator: true` deletes `puni-fleet`; never set it when that is the
connecting account. Then the same for h4claw. The play leaves Docker, its containers and its iptables rules running;
rerun step 2's preflight to confirm. After workloads exist, h3mon leaves through
`tool-fleet` retirement ([fleet](fleet.md#retirement-replacement-and-upgrade)), and a failed
host is restored from its step 3 provider snapshot.
