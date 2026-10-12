# Twilight Dash

Dash owns the runtime admission authority ([`src/authority`](src/authority/authority-store.ts))
and exposes six local commands. `bootstrap-authority <repository>` is the only command that
creates an authority; every other command refuses an absent one. `inspect-authority <repository>
[--session <id>]` prints the authority state, read-only. `recover-publication <repository> --integration-id
<id>` finishes an interrupted publication from its durable record. `submit-admission <repository>
<packet-json> <staged|committed> <revision-or-base>` freezes a bound packet's candidate and
prints its submission report; it judges the packet through Twilight Burokrat's
[admission judge](../../twilight-burokrat/cli/src/judge-facade.ts). `render-observation-units
<layout.json> <new-dir>` renders the uninstalled `twilight-dash-observation.{service,timer}` units
and their `runtime.sha256` into a new directory; see the
[observation service runbook](src/activation/units/README.md). `plan-enrollment`
delegates enrollment planning to the existing fleet CLI. Creating a plan authorizes no apply and does
not enroll a node. Fleet owns the plan format, digest, eligibility checks and
execution admission; see [fleet identities and ownership](../../../../docs/infra/fleet.md)
and [`runPlan`](../../../../tools/tool-fleet/src/cli.ts).

From the repository root, supply a desired fleet, its complete observation, an
exact observed unenrolled node and cluster, and the SHA-256 values of the reviewed
inventory, Ansible variables and SSH known-hosts artifacts. Set the three digest
variables below to those reviewed hexadecimal values. Choose an unused output
path; the command creates an owner-only plan and refuses to replace an existing
file.

```sh
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts plan-enrollment \
  --fleet /path/to/desired.yaml \
  --observation /path/to/observation.json \
  --output /path/to/new-enrollment-plan.json \
  --node fixture-agent \
  --cluster fixture \
  --inventory-sha256 "$INVENTORY_SHA256" \
  --ansible-variables-sha256 "$ANSIBLE_VARIABLES_SHA256" \
  --known-hosts-sha256 "$KNOWN_HOSTS_SHA256"
```

These are all eight accepted flags. Replace the illustrative paths and synthetic
node/cluster identifiers with your supplied planning inputs. The command prints
the plan summary and digest after successfully writing the output. Missing,
unreadable or malformed input, invalid identity or digests, and output-write
failure exit unsuccessfully without a successful plan acknowledgment. Planning
preserves supplied input bytes, invokes no discovery or host mutation, and creates
no repository authority state.

Execution remains the separate fleet apply path, with its existing reviewed-plan
and artifact checks. Follow the [infrastructure operator guide](../../../../docs/infra/README.md)
and [operation runbook](../../../../infra/terraform/README.md); Dash accepts no
apply, discovery, build, deploy, operation-selection or executable-selection option.
This local facade does not relocate lease authority.

The declared [Nx project](project.json) runs its real dispatcher and entrypoint
tests with the ordinary acceptance targets. The CLI runs from source. `build`
bundles only the observation launcher, a second composition root that the
observation service unit pins, into
`dist/apps/twilight-structure/twilight-dash/cli/observation-service.mjs` and prints
its SHA-256 ([build.ts](src/packaging/build.ts)).

```sh
bunx nx run-many -t test lint typecheck build -p twilight-dash --skip-nx-cache
```

`twilight-dash:test` needs a non-root runner. The unreadable-input and
unwritable-output proofs rely on file modes, so under uid 0 they throw instead of
passing vacuously.

The [OpenSpec verification ledger](../../../../openspec/changes/dash-local-plan-facade/verify.md)
records byte equivalence, mutation canaries, required-state/output refusals and
watched production fault proofs. Exact-SHA host gate and CI acceptance remain
separate requirements.
