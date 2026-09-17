# Fleet Terraform operation

The HTTP backend is intentionally empty in source. Before planning, configure a backend that provides TLS in transit, encryption at rest, access control, version retention, and atomic lock/unlock endpoints. Supply its connection details outside Git through `TF_HTTP_ADDRESS`, `TF_HTTP_LOCK_ADDRESS`, `TF_HTTP_UNLOCK_ADDRESS`, `TF_HTTP_USERNAME`, and `TF_HTTP_PASSWORD`. Supply `HCLOUD_TOKEN` outside Git as well. Refuse to proceed when any of those backend guarantees is absent.

Write reviewed node, network, recovery CIDR, monthly estimate, and budget-cap values in an owner-only `.tfvars` file outside the repository. The module rejects a nonpositive estimate and an estimate above the cap.

Prepare the saved plan at the deterministic path beside the future operation plan:

```sh
bunx nx run tool-fleet:terraform-plan -- \
  --node workers-c \
  --cluster workers \
  --provider-ownership-id provision-workers-c-20260917 \
  --variables /secure/fleet-workers-c.tfvars \
  --output /tmp/provision-workers-c.json.tfplan
```

The command runs locked initialization, JSON validation, a locked saved plan, JSON plan inspection, and remote-state identity inspection. It refuses destructive, replacement, or unrelated addresses and prints the plan SHA-256 plus state lineage and serial. Pass those printed values to `tool-fleet:plan --operation provision`; review its summary and digest, then apply only that persisted plan:

```sh
bunx nx run tool-fleet:apply -- \
  --plan /tmp/provision-workers-c.json \
  --expect-sha256 "$FLEET_PLAN_SHA256"
```

Apply accepts no Terraform, inventory, or backend override flags. It reads `/tmp/provision-workers-c.json.tfplan`, rechecks its digest and remote-state identity before each effect, and uses the committed module, per-cluster Kubernetes Lease, and F3 enrollment playbook.

Import an existing provider resource only after observing one exact `puni-logical-node` and operation ownership label. Duplicate labels or a label owned by another operation refuse. Primary IP and retained-volume destruction remains a separate retirement operation because their resources use `prevent_destroy`.
