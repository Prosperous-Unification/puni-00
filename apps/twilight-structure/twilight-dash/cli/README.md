# Twilight Dash

Dash owns the runtime admission authority ([`src/authority`](src/authority/authority-store.ts))
and exposes ten local commands. `bootstrap-authority <repository>` is the only command that
creates an authority; the other authority commands refuse an absent one. `inspect-authority <repository>
[--session <id>]` prints the authority state, read-only. `recover-publication <repository> --integration-id
<id>` finishes an interrupted publication from its durable record. `submit-admission <repository>
<packet-json> <staged|committed> <revision-or-base>` freezes a bound packet's candidate and
prints its submission report; it judges the packet through Twilight Burokrat's
[admission judge](../../twilight-burokrat/cli/src/judge-facade.ts). `render-observation-units
<layout.json> <new-dir>` renders the uninstalled `twilight-dash-observation.{service,timer}` units
and their `runtime.sha256` into a new directory; see the
[observation service runbook](src/activation/units/README.md). `run-activation-checks
--candidate-repository <checkout> --candidate-sha <sha> --candidate-policy <path> --check-runs
<new-dir>` runs a candidate's activation checks and writes the CheckRun ledger both Burokrat
preparers take as `--check-runs` (see the next paragraph but one). `plan-enrollment`
delegates enrollment planning to the existing fleet CLI. Creating a plan authorizes no apply and does
not enroll a node. Fleet owns the plan format, digest, eligibility checks and
execution admission; see [fleet identities and ownership](../../../../docs/infra/fleet.md)
and [`runPlan`](../../../../tools/tool-fleet/src/cli.ts).

Dash also runs the activation controller ([`src/activation`](src/activation/controller.ts)), its
second authority: a separate process with its own store and service account, sharing no table or
lock with the admission authority
([ADR 0051](../../../../docs/adr/0051-the-activation-controller-runs-in-dash-as-a-second-authority.md)).
Its observation service polls GitHub for ready candidates on a timer, and the review invoker's
runtime ([`src/review/invoker.ts`](src/review/invoker.ts)) spawns review harnesses and writes their
invocation journals. Both reach Twilight Burokrat only through `@twilight-burokrat/judge`;
Burokrat keeps `validate-review-provenance`.

Dash measures activation checks; Burokrat judges what it measured
([ADR 0052](../../../../docs/adr/0052-dash-runs-activation-checks-and-burokrat-judges-their-receipts.md)).
`run-activation-checks` ([`src/check-runs`](src/check-runs/run-activation-checks.ts)) plans the
candidate's checks through the judge, refuses a checkout that is not the clean committed candidate
and a ledger directory that exists or sits inside it, runs each check and its `bun test` skip probe
after a pass, and stamps both instants from its injected wall clock. It writes
`check-runs.json`, a digest-chained ledger of `CheckRun` records, beside `streams/<sha256>`. It
holds no store, lock or token, and shares only `src/clock.ts` with the two authorities. A failing
check is recorded, never refused; the preparer refuses it.

Dash owns the activation controller's observation store
(`<stateDirectory>/activation.sqlite`, `user_version` 10; see
[`observation-commands.ts`](src/activation/observation-commands.ts)). Both store commands take the
protected observation service configuration and nothing else.
`bootstrap-observation <service.json>` creates the v10 store in the existing state directory and
refuses `exists` when one is present. `migrate-observation <service.json>` steps a v8 or v9 store
to v10 and prints `migrated` with both versions. It refuses `absent`, `current` and
`unsupported-version`. Either command refuses `unreadable` with the filesystem or SQLite code, and
a refused command creates no file. The [fixtures](fixtures/activation/README.md) pin the v10
schema and a store written by the pre-relocation Burokrat code, and vendor that code's source so
`rollback.db.test.ts` proves it still opens a store Dash wrote.

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

## `record-progress`

Record explicit operator assertions against a supplied plan reference and task export:

```sh
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts record-progress \
  --entries /path/to/entries.json \
  --plan-reference /path/to/plan-reference.json \
  --tasks /path/to/tasks.json \
  --output /path/to/new-progress-receipt.json
```

All four flags are required exactly once, in any order. The entries file is a JSON array
of existing v1 progress entries (`taskId`, `stepCode`, `status`, `observedAt`, `evidence`,
and optional `measures`). Status is `in_progress` or `done`; evidence is a repository-relative
path or `{ "kind": "external", "authority": "ci" }`. Measures may include nonnegative
`hours_actual` and integer `token_actual`; zero and absence retain different meanings.

The command preserves entry order, repetitions, supplied timestamps and evidence. Entries
are operator assertions: Dash does not authenticate evidence or infer completion from
CheckRun records. It checks only the existing receipt/reference/task consistency, including
v6/v7 references with schema-1 tasks and v8/v9 with schema-2 tasks. It copies the complete
PlanRef into the existing v1 receipt and emits canonical JSON with one newline.

The output must be a new path in an existing directory. Dash creates it exclusively with
mode 0600 and prints its digest only after writing and closing. Refusals exit 1 with empty
stdout and one safe error line; failed publication removes its partial file when cleanup
succeeds, and cleanup failure remains visible. Inputs are required strict UTF-8 JSON.

Use Burokrat `validate-progress-receipt` to check the artifact and Navigator
`receipt-to-commands` to prepare the existing WBS command batch. Applying it to current WBS
state remains the existing person/MCP act; the receipt grants no authorship, certification,
execution eligibility or current WBS authority.
