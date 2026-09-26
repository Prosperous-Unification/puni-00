# Enroll h4claw and h3mon

The ordered operator commands that make h4claw the platform k3s server and join h3mon as its
observability agent (Twilight Dash WBS 070.1, 070.2, 070.4, 070.5). **Nothing here has run
against a real host.** Each step needs Dany's authorization of this exact procedure; the QEMU
rehearsal and its limits are in
[the enroll-existing-hosts verification](../../openspec/changes/enroll-existing-hosts/verify.md).

Placement is `infra/fleet/desired.yaml`; host variables are
`infra/ansible/inventory/production-existing-hosts.yml`. h2puni stays outside k3s and h1claw
gets nothing (reasons in `desired.yaml`).

## What changes on each host

| Host   | Changes                                                                                                                                                                                                                                    | Kept                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| h4claw | apt prerequisites, account `puni-fleet` with sudo, `/etc/sudoers.d/90-cloud-init-users` **deleted**, bounded journald, k3s sysctls and modules, fleet nftables table, MTU unit, k3s server with embedded etcd; later Flux (`platform.yml`) | Docker and OpenHands (`127.0.0.1:3000`), SSH                                     |
| h3mon  | the same base and network changes, a 4 GiB `/swap.puni`, k3s agent capped by 1024Mi system + 384Mi kube reservations; later Elasticsearch, Kibana, Prometheus and collectors pinned to it                                                  | Docker, Victoria (8428, 9428, 10428), Grafana (3000), MLflow (5000), OTel (4318) |

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
service CIDR overlapping a route or Docker network, an admin user whose sudo comes only from
the cloud-init file the base role deletes, an existing `puni-fleet` with other keys, or a
preserved listener that is not listening.

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
    /etc/fstab /etc/sudoers.d /etc/sysctl.d /etc/modules-load.d /etc/systemd /etc/nftables.conf'
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

The API stays reachable only from enrolled addresses and loopback; use a tunnel for `kubectl`:
`ssh -N -L 16443:127.0.0.1:6443 h4claw`.

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
`placement.test.ts`), but production SSH discovery cannot yet pass a user or known-hosts file into
the controller, so this procedure uses the playbooks directly; the ID checks above are its
identity gate.

## 6. Check h3mon's memory

```sh
ssh h3mon 'swapon --show; cat /sys/fs/cgroup/kubepods.slice/memory.max; free -m'
kubectl --server https://127.0.0.1:16443 get node h3mon -o jsonpath='{.status.allocatable.memory}'
```

`memory.max` must equal capacity minus 1408 MiB; `/swap.puni` 4 GiB active.

## 7. Flux and SOPS (070.5)

Place the read-only deploy key, its `known_hosts` and the SOPS age key on h4claw at mode `0600`
([platform](platform.md)), then:

```sh
fleet_ansible --limit h4claw --extra-vars puni_cluster_id=platform-production \
  --extra-vars puni_platform_revision=<40-hex main sha> \
  --extra-vars @"$OPS/flux.json" playbooks/platform.yml
```

`$OPS/flux.json` holds `puni_flux_url`, `puni_flux_sha256`, `puni_flux_version`,
`puni_flux_install_sha256`, `puni_platform_repository_url` and the three key paths. Watch the
`observability` stage reach Ready and rerun step 6.

## 8. Verify nothing was lost

Rerun step 5's after-enrollment preflight for both hosts after a reboot of each, one at a time
(`sudo systemctl reboot`), and compare Grafana dashboards and a Victoria query with the step 3
snapshot.

## Rollback

Before any workload you need exists on the cluster, per host, h3mon first:

```sh
fleet_ansible --limit h3mon --extra-vars puni_rollback_host=h3mon \
  --extra-vars puni_rollback_private_mtu=<privateMtu from step 2> \
  --extra-vars puni_rollback_remove_operator=true playbooks/rollback-host.yml
ssh h3mon 'sudo tar --extract --gzip --file /root/pre-k3s-etc.tgz -C / etc/sudoers.d/90-cloud-init-users etc/fstab'
kubectl --server https://127.0.0.1:16443 delete node h3mon   # while h4claw still runs
```

`puni_rollback_remove_operator=true` deletes `puni-fleet`; never set it when that is the
connecting account. Then the same for h4claw. The play leaves Docker, its containers and its iptables rules running;
rerun step 2's preflight to confirm. After workloads exist, h3mon leaves through
`tool-fleet` retirement ([fleet](fleet.md#retirement-replacement-and-upgrade)), and a failed
host is restored from its step 3 provider snapshot.
