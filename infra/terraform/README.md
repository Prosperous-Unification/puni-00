# Fleet Terragrunt operation

The HTTP backend is intentionally empty in source. Before planning, configure a backend that provides TLS in transit, encryption at rest, access control, version retention, and atomic lock/unlock endpoints. Supply its connection details outside Git through `TF_HTTP_ADDRESS`, `TF_HTTP_LOCK_ADDRESS`, `TF_HTTP_UNLOCK_ADDRESS`, `TF_HTTP_USERNAME`, and `TF_HTTP_PASSWORD`. Supply `HCLOUD_TOKEN` outside Git as well. Refuse to proceed when any of those backend guarantees is absent.

Write reviewed node, network, recovery CIDR, monthly estimate, and budget-cap values in an owner-only `.tfvars` file outside the repository. The module rejects a nonpositive estimate and an estimate above the cap.

Write owner-only backend evidence as JSON with exactly `schemaVersion`, `cloudAccount`, HTTPS `address`, `lockAddress`, and `unlockAddress`, the three true guarantees `encryptedAtRest`, `accessControlled`, and `versioned`, and an exact `verifiedAt` instant. The plan and apply commands hash this artifact and require the live `TF_HTTP_*` endpoints and credentials to match it.

Prepare the saved plan at the deterministic path beside the future operation plan:

```sh
bunx nx run tool-fleet:terragrunt-plan -- \
  --node workers-c \
  --cluster workers \
  --region fsn1 \
  --machine-type cx33 \
  --image ubuntu-24.04 \
  --network private \
  --ssh-key-ids operator \
  --retained-storage false \
  --k3s-role agent \
  --budget-cap-eur 20 \
  --provider-ownership-id provision-workers-c-20260917 \
  --cloud-account production \
  --backend-evidence /secure/fleet-backend.json \
  --variables /secure/fleet-workers-c.tfvars \
  --output /tmp/provision-workers-c.json.tfplan
```

The command verifies both Terragrunt 1.1.5 and the Terraform 1.16.3 engine binaries against `infra/versions/toolchain.json`, runs locked initialization, JSON validation, a locked saved plan, JSON plan inspection, and remote-state identity inspection. It binds the exact source-free `terragrunt.hcl` SHA-256, region, machine type, image, network, SSH keys, k3s role, retained storage, cost, backend evidence, state lineage, and serial. Pass the printed values to `tool-fleet:plan --operation provision`; also bind an owner-only `<plan>.ansible-vars.json` digest containing the required F3 inputs and exact node identity. Review the summary and digest, then apply only that persisted plan:

```sh
bunx nx run tool-fleet:apply -- \
  --plan /tmp/provision-workers-c.json \
  --expect-sha256 "$FLEET_PLAN_SHA256"
```

Apply accepts no Terraform, inventory, or backend override flags. It reads `/tmp/provision-workers-c.json.tfplan`, `.backend.json`, and `.ansible-vars.json`; rechecks their digests, direct hcloud ownership, and remote-state identity before each effect; and uses the committed module, per-cluster Kubernetes Lease, and both F3 join and validation playbooks. It records a `.desired-node.json` candidate before enrollment. A response-lost create imports the exact operation-owned instance and stops for a fresh reviewed Terraform plan.

Import an existing provider resource only after observing one exact `puni-logical-node` and operation ownership label. Duplicate labels or a label owned by another operation refuse. Primary IP and retained-volume destruction remains a separate retirement operation because their resources use `prevent_destroy`.

Terragrunt runs this unit in place with an explicit Terraform path, `--no-auto-init`, `--no-auto-retry`, and `--tf-forward-stdout`. Initialization is a separate checked command. The configuration has no source, hooks, generated files, inputs, or dependency graph; Terraform module/state/resource addresses stay unchanged. Ambient `TG_*`, `TERRAGRUNT_*`, CLI/variable/workspace/provider execution overrides refuse, and Terraform CLI configuration is pinned to `/dev/null`. Backend `TF_HTTP_*` and provider `HCLOUD_TOKEN` credentials remain external. Pass the emitted configuration digest as `--terragrunt-config-sha256` when constructing provision or destroy plans.
