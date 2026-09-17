# Platform reconciliation

Ansible installs k3s and bootstraps Flux. Flux then owns controllers, storage,
policy and registry resources in that order. Do not apply the long-lived
platform manifests from Ansible or by hand.

Run `infra/ansible/playbooks/platform.yml` against the bootstrap server with the
exact cluster ID, toolchain-locked Flux URL/version/checksum, immutable Git commit,
read-only deploy key, reviewed SSH host keys and SOPS age key. All three secret
files must already exist on the host with mode `0600`. The bootstrap write
credential is intentionally absent from the steady-state playbook.

The four supported cluster IDs are `platform-local`, `platform-production`,
`workers-local` and `workers-production`. Each overlay binds its own kubeconfig
Secret; the fleet check refuses cross-cluster substitution. Production uses the
hcloud storage controllers, while local clusters use the k3s local-path class.

Ordinary `wbs` and `workers` namespaces enforce Restricted Pod Security and
default-deny networking. The `wbs-solver` and `puni-forge` namespaces admit their
narrow host-path exception through the committed admission policy. Solver pods
may mount only `/run/puni/solver` as a directory, and source pods may mount only
the roots listed in the `puni-trusted-workload` ConfigMap. Neither may request
privilege escalation, host networking, host PID, Docker sockets or an API token.
Apart from those exact host directories, the policy enforces the Kubernetes 1.36
[Restricted Pod Security Standard](https://v1-36.docs.kubernetes.io/docs/concepts/security/pod-security-standards/),
including pod, regular-container, init-container and ephemeral-container security
profiles plus host ports and probe or lifecycle hosts. Windows HostProcess requires
host networking, which this Linux-only trusted workload policy rejects.
The forge controller service account alone receives the namespaced pod-management
Role; ordinary authenticated users receive no trusted-namespace Role or service
account impersonation grant.

Run the committed admission probes with server-side dry-run after applying the
policy overlay. `solver-allowed.yaml` and `forge-allowed.yaml` must succeed. Every
other YAML manifest in `infra/platform/conformance/admission/` must be denied with
its specific admission or Restricted Pod Security diagnostic:

```sh
kubectl apply -k infra/platform/policy
kubectl apply --dry-run=server -f infra/platform/conformance/admission/solver-allowed.yaml
kubectl apply --dry-run=server -f infra/platform/conformance/admission/forge-allowed.yaml
kubectl auth can-i create pods -n puni-forge --as=ordinary --as-group=system:authenticated
kubectl auth can-i impersonate serviceaccounts/dev-environment-controller -n puni-forge --as=ordinary --as-group=system:authenticated
kubectl auth can-i create pods -n puni-forge --as=system:serviceaccount:puni-forge:dev-environment-controller
```

The ephemeral-container subresource needs an existing Pod. Create the approved
solver fixture only on a cluster where its product-capability selector is
intentionally unschedulable, require this dry-run patch to be denied, then delete
the pending Pod:

```sh
kubectl apply -f infra/platform/conformance/admission/solver-allowed.yaml
kubectl patch pod allowed-solver -n wbs-solver --subresource=ephemeralcontainers --type=merge --dry-run=server --patch-file=infra/platform/conformance/admission/solver-ephemeral-container-patch.json
kubectl delete pod allowed-solver -n wbs-solver
```

The three authorization answers must be `no`, `no`, then `yes`. For the live
network-policy probe, apply `receivers.yaml`, wait for both Deployments, then apply
`probes.yaml`. Both positive controls must complete: one proves the telemetry
allowance and one proves the denied destination is reachable. The worker probe
must fail specifically with `BackoffLimitExceeded`:

```sh
kubectl apply -f infra/platform/conformance/network/receivers.yaml
kubectl wait --for=condition=Available deployment/allowed-receiver -n observability --timeout=2m
kubectl wait --for=condition=Available deployment/denied-receiver -n wbs --timeout=2m
kubectl apply -f infra/platform/conformance/network/probes.yaml
kubectl wait --for=condition=Complete job/allowed-egress -n workers --timeout=2m
kubectl wait --for=condition=Complete job/receiver-control -n network-control --timeout=2m
kubectl wait --for=condition=Failed job/denied-egress -n workers --timeout=2m
test "$(kubectl get job denied-egress -n workers -o jsonpath='{.status.conditions[?(@.type=="Failed")].reason}')" = BackoffLimitExceeded
```

The in-cluster registry is pinned to the amd64 manifest for Distribution 2.8.3.
Keep the existing external registry as the build and pull endpoint until TLS,
authentication, offline garbage collection and restart-pull recovery have been
observed against the replacement. This manifest alone does not authorize that
migration.
