# Twilight Dash

Dash owns the runtime admission authority ([`src/authority`](src/authority/authority-store.ts))
and exposes the local commands below, plus the managed resource runtime:

| Command                                                                                                                                                                   | What it does                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bootstrap-authority <repository>`                                                                                                                                        | the only command that creates an authority; the other authority commands refuse an absent one                                                                                                    |
| `inspect-authority <repository> [--session <id>]`                                                                                                                         | prints the authority state, read-only                                                                                                                                                            |
| `recover-publication <repository> --integration-id <id>`                                                                                                                  | finishes an interrupted publication from its durable record                                                                                                                                      |
| `submit-admission <repository> <packet-json> <staged\|committed> <revision-or-base>`                                                                                      | freezes a bound packet's candidate and prints its submission report; judges the packet through Twilight Burokrat's [admission judge](../../twilight-burokrat/cli/src/judge-facade.ts)            |
| `render-observation-units <layout.json> <new-dir>`                                                                                                                        | renders the uninstalled `twilight-dash-observation.{service,timer}` units and their `runtime.sha256` into a new directory; see the [observation service runbook](src/activation/units/README.md) |
| `run-activation-checks --candidate-repository <checkout> --candidate-sha <sha> --candidate-policy <path> --check-runs <new-dir>`                                          | runs a candidate's activation checks and writes the CheckRun ledger both Burokrat preparers take as `--check-runs`; see [activation checks](#activation-checks)                                  |
| `bootstrap-observation`, `migrate-observation`                                                                                                                            | create or migrate the observation store; see [observation store](#observation-store)                                                                                                             |
| `plan-enrollment`                                                                                                                                                         | delegates enrollment planning to the existing fleet CLI; see [`plan-enrollment`](#plan-enrollment)                                                                                               |
| `record-progress`, `record-progress-v2`                                                                                                                                   | record operator progress assertions as a receipt; see [`record-progress`](#record-progress)                                                                                                      |
| `account-outcomes --repository <path> --since <instant> --until <instant> --rate-card <path> --output <new-dir> [--claude-projects <dir>]... [--codex-sessions <dir>]...` | writes the period's efficiency breakdown: cost per accepted outcome from harness logs; see [`account-outcomes`](#account-outcomes)                                                               |
| `report-capacity --config <owner-only file>`                                                                                                                              | measures each bound resource through its compute provider and reports it to WBS until a refusal; see [`report-capacity`](#report-capacity)                                                       |
| `mcp token --resource <url> (--key-file <path> \| --assertion-file <path> \| --github-actions-audience <aud>) [--run <id>]`                                               | prints a fresh WBS MCP bearer as a header map for Claude Code's `headersHelper`, from an API key or a workload token; see [`mcp token`](#mcp-token)                                              |
| `pool import <pool-keys.json> --store <directory>`                                                                                                                        | stores an agent pool's keys for `mcp token`, each agent with its own MCP config and run, after every key issued a token; see [`pool import`](#pool-import)                                       |

## Managed resource cleanup

`resources init|create|exec|run|inspect|cleanup|sweep|sync|watch` manages Linux disposable
directories, Git worktrees and their commands through a separate durable reservation ledger.
Start with the [resource runbook](docs/resources.md) for the current-account setup and cleanup inspection requirements,
owner-only enrollment, automatic Claude/Codex command wrappers, copied generated dependencies,
WBS authority binding and truthful cleanup blockers. Existing unmanaged sessions are untracked.

## Activation controller

Dash also runs the activation controller ([`src/activation`](src/activation/controller.ts)), its
second authority: a separate process with its own store and service account, sharing no table or
lock with the admission authority
([ADR 0051](../../../../docs/adr/0051-the-activation-controller-runs-in-dash-as-a-second-authority.md)).
Its observation service polls GitHub for ready candidates on a timer, and the review invoker's
runtime ([`src/review/invoker.ts`](src/review/invoker.ts)) spawns review harnesses and writes their
invocation journals. Both reach Twilight Burokrat only through `@twilight-burokrat/judge`;
Burokrat keeps `validate-review-provenance`.

## Activation checks

Dash measures activation checks; Burokrat judges what it measured
([ADR 0052](../../../../docs/adr/0052-dash-runs-activation-checks-and-burokrat-judges-their-receipts.md)).
`run-activation-checks` ([`src/check-runs`](src/check-runs/run-activation-checks.ts)) plans the
candidate's checks through the judge, refuses a checkout that is not the clean committed candidate
and a ledger directory that exists or sits inside it, runs each check and its `bun test` skip probe
after a pass, and stamps both instants from its injected wall clock. It writes
`check-runs.json`, a digest-chained ledger of `CheckRun` records, beside `streams/<sha256>`. It
holds no store, lock or token, and shares only `src/clock.ts` with the two authorities. A failing
check is recorded, never refused; the preparer refuses it.

## Observation store

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

## `plan-enrollment`

Creating a plan authorizes no apply and does not enroll a node. Fleet owns the plan format,
digest, eligibility checks and execution admission; see
[fleet identities and ownership](../../../../docs/infra/fleet.md) and
[`runPlan`](../../../../tools/tool-fleet/src/cli.ts).

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

These are all eight accepted flags; the paths and node/cluster identifiers are
illustrative. The command prints
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

## Checks

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

## `record-progress-v2`

Use the same four flags as `record-progress` to explicitly produce schema 2. This bound
receipt also copies the complete producer `referenceDigest`, covered by `receiptDigest`.
Navigator `admit-progress` requires this version and an independently supplied
`--accepted-reference`; its proposed batch is admitted only relative to that caller selection.
Digests do not authenticate records or establish current WBS freshness. `record-progress`
continues producing schema 1 for the existing conversion workflow.

## `report-capacity`

Measures the resources a tenant's hosts fulfil and reports each to WBS as a capacity report
(`openspec/changes/compute-providers` P8 to P11; port in [`src/compute`](src/compute/provider.ts)):

```sh
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts report-capacity --config /path/to/reporter.json
```

The configuration is the binding; WBS holds only the provider instance id on the resource. It
must be a regular file owned by the running user with mode `0600`, because it holds the
credential:

```json
{
  "schemaVersion": 1,
  "wbsOrigin": "https://wbs.example",
  "credential": "<wbs_mk_ API key of an agent person>",
  "cadenceSeconds": 300,
  "instances": [
    {
      "instanceId": "<WBS compute provider id>",
      "kind": "ssh_host",
      "host": "h4claw",
      "sshTransportFile": "/home/puni1/.puni/fleet/ops/ssh-transport.json",
      "bindings": [
        { "resourceId": "<WBS resource id>", "measure": "memory_gib" },
        { "resourceId": "<WBS resource id>", "measure": "disk_gib", "path": "/tmp" },
        { "resourceId": "<WBS resource id>", "measure": "cpu_cores" },
        { "resourceId": "<WBS resource id>", "measure": "agent_slots", "slots": 4 }
      ]
    },
    {
      "instanceId": "<WBS compute provider id>",
      "kind": "docker",
      "dockerContext": "h4claw",
      "runImage": "alpine:3",
      "bindings": [
        { "resourceId": "<WBS resource id>", "measure": "memory_gib" },
        { "resourceId": "<WBS resource id>", "measure": "cpu_cores" },
        { "resourceId": "<WBS resource id>", "measure": "disk_gib", "ceilingGib": 400 }
      ]
    }
  ]
}
```

- `wbsOrigin` is an origin only: `https:`, or `http:` on loopback. `cadenceSeconds` defaults to
  300 (30 to 86,400). A resource is bound once in the whole file.
- `ssh_host` reaches `host` through the `sshTransportFile` that fleet discovery uses
  ([`readSshTransport`](../../../../tools/tool-fleet/src/ssh-transport.ts)): the remote user, an
  owner-only `known_hosts` pinning `host`, and the agent in `SSH_AUTH_SOCK`. `ssh` must be on
  `PATH`. Measures: `memory_gib` (`/proc/meminfo` `MemTotal`, in use = total minus
  `MemAvailable`), `disk_gib` (`df -kP <path>` 1024-blocks and used), `cpu_cores` (`nproc`, in
  use = one-minute load, floored and capped), `agent_slots` (`slots`, in use = runs this process
  started; it reports 0 until a caller runs agents through the port). All are floored to whole
  units.
- `docker` runs every command as `docker --context <dockerContext>` (a context name: letters,
  digits, `_ . + -`, 2 to 64, never a leading `-`), with only `PATH`, `HOME`,
  `DOCKER_CONFIG` and `SSH_AUTH_SOCK` passed to the CLI; `docker` must be on `PATH` once a
  docker instance is configured. Measures: `memory_gib` (`docker info` `MemTotal`; in use = the
  `docker stats --no-stream` memory of the running containers labelled
  `puni.compute-provider=<instanceId>`, which `docker ps --filter label=…` names; other
  containers' rows are skipped unread, and a labelled row whose sample failed (`--`, a container
  removed mid-sample) adds nothing and is counted `in transit` in the evidence), `cpu_cores`
  (`NCPU`; in use = the same containers' `CPUPerc` summed, 100 % per core, floored and capped),
  `disk_gib` (in use = every `docker system df` row summed, the daemon's whole disk; capacity =
  the binding's `ceilingGib`, because the daemon states no disk size; no `path`). No
  `agent_slots`. A run is `docker run --rm --label puni.compute-provider=<instanceId>` of
  `runImage` with the allow-listed `--env`; without `runImage` the instance measures only.
  The daemon refusing or forbidding its socket, and a `tcp://` or `ssh://` context's transport
  fault, report `unreachable`; an unknown context or any other failure ends the command.
  Configure a named context (`docker context create h4claw --docker host=ssh://puni1@h4claw`),
  not `default`: `DOCKER_HOST` is not passed, and rootless Docker's `default` resolves its
  socket from it. Because `HOME` and `DOCKER_CONFIG` are passed, `docker run` pulls a private
  `runImage` with the reporter user's own registry credentials and credential helpers. A memory
  or cores observation is three commands (`info`, `ps`, `stats`) and each such binding samples
  again, so one tick takes two `stats` samples when both are bound.
- Loading refuses before any connection: `config_absent`, `config_unreadable`,
  `credential_not_owner_only`, `config_malformed` (naming field paths, never values),
  `provider_kind_not_available` (`puni_pool`, a slot with no adapter),
  `provider_not_implemented` (`kubernetes`, whose adapter is a stub answering
  `not_implemented`), `unsupported_measure`, and the SSH transport's own refusals.

Each tick observes every binding and `PUT`s one report per binding with `cadenceSeconds`; a tick
runs every cadence and right after a run starts or ends. Each report prints one JSON line on
stdout (instance, resource, `observedAt`, outcome, evidence or reason, WBS's answer). An
unreachable host (connection refused, timeout, host-key mismatch, authentication failure, name
or route fault) is reported as `unreachable`; any other answer the adapter cannot parse ends the
command with that error. The command exits 1 with one `error:` line on: three consecutive
`report_superseded` on one binding (`another_reporter`), any `4xx` or redirect (`refused`, with
the status and WBS's error code), or a `5xx` or transport fault to WBS that repeats on the retry
one cadence later (`wbs_unavailable`). The credential appears only in the `Authorization`
header; no output, refusal or error carries it.

## `mcp token`

Prints `{"Authorization":"Bearer <token>"}` for a WBS MCP server (mcp-01), from a fresh token
request on every run ([`src/mcp`](src/mcp/token-command.ts); `openspec/changes/wbs-mcp-agent-surface`
M2, M10, M15). It is what headless agents use instead of the consent flow: Claude Code runs it as
the server's `headersHelper` at every connection, and again after a 401 or 403, so a token that
expired, or that a grant key rotation invalidated, is replaced on the retry.

```sh
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts mcp token \
  --resource https://wbs.example/mcp --key-file ~/.config/wbs/agent.key [--run <id>]
```

- `--resource` is the MCP endpoint (`MCP_PUBLIC_URL`): `https:`, or `http:` on loopback. The
  token endpoint is its authorization server's, `<resource>/oauth/token`.
- Exactly one credential:
  - `--key-file`: a file holding one `wbs_mk_` API key of an agent person (an organization
    admin issues it in WBS), owned by the running user with mode `0600`, or the command refuses
    (`--key-file: the key file must be owned by this user with mode 0600`). It is sent once,
    by HTTP Basic, as `client_credentials`.
  - `--assertion-file`: a workload token reread on every run, such as a Kubernetes projected
    service-account token (the kubelet rotates it in place), sent as the JWT-bearer grant.
  - `--github-actions-audience`: a GitHub Actions OIDC token for that audience, fetched on
    every run through `ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN`
    (the job needs `permissions: id-token: write`).
- A value shaped like a key or a token given where a path belongs is refused naming only the
  flag (`--key-file names a file, not a key`), and no refusal names the path: a pasted secret is
  never echoed on stderr.
- `--run` opts the token into a run (`wbs_run`, 1 to 256 characters): the run's claims and
  leases are scoped to it.
- **Why a file and never an argument or a variable holding the key.** An argument is visible
  to every user in `ps`. An environment variable is inherited by every process Claude Code
  starts, so the agent's own shell commands could print it into a transcript. Only the path
  travels; the key stays in an owner-only file. **This design cannot hide the key from the
  agent's own user**: the helper runs as that user, and the file must be owned by it (the
  check requires the file's uid to equal the process's), so the agent's shell can read the file
  too. It protects the key from other users and from transcripts, not from the agent.
- **No cache.** Every run issues a new token; nothing is written to disk.
- **No redirect.** A token request answered with a 3xx is refused, never followed: a followed
  307 would re-send the form, the assertion included, to another origin.
- **A `429`** (M10's issuance limits per mcp-01 replica: 300 a minute, burst 100, per
  credential **and per source address**) is waited out
  once: the `Retry-After` seconds, capped at what remains of Claude Code's 10 s helper budget
  minus 1 s, then one retry. When nothing remains it does not retry. Any refusal exits 1 with
  one `error:` line naming the HTTP status and the OAuth error (`invalid_client` for a
  revoked or unknown key); no output or error carries the key, the assertion or the form.

### Claude Code for a headless agent swarm

**Today the helper needs a checkout of this repository with `bun install` run** on the host that
runs the agents: it is started from `entrypoint.ts`, not a published binary or bundle.

Put the key of each agent person in its own `0600` file on the host that runs the agents, then
configure the server in the project's `.mcp.json` (or `--mcp-config` for `claude -p`):

```json
{
  "mcpServers": {
    "wbs": {
      "type": "http",
      "url": "https://wbs.example/mcp",
      "headersHelper": "bun /srv/puni-00/apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts mcp token --resource https://wbs.example/mcp --key-file /home/agent/.config/wbs/agent.key"
    }
  }
}
```

- Claude Code runs a `headersHelper` only in a trusted folder: in `claude -p` and Agent SDK
  sessions without folder trust it uses static headers alone, and the connection fails. Trust
  the agents' working directory first.
- A batch of `claude -p` runs on one key issues one token per run; 100 runs started within a
  minute stay under the per-credential limit. **The per-source limit is the same size**: behind
  one proxy hop every agent on one host or NAT shares one bucket of 100 a burst and 300 a
  minute, whatever credential it holds, so a pool spread over several keys does not get more
  issuances per minute from one address. To scope each run's claims, give each run its
  own `--mcp-config` with `--run <id>`, and send the same id as the run in commands.
- Claude Code subagents share their parent's connection, and so its token and run.
- For an agent pool, [`pool import`](#pool-import) writes each agent's key file and a
  `--mcp-config` file with its own run.

For a long-lived Node or Bun process using the MCP SDK directly with a workload token,
[`WorkloadJwtBearerProvider`](src/mcp/workload-provider.ts) is the `authProvider`: it keeps its
token in memory, drops it on a 401, rereads the workload token for every request, and needs no
dynamic registration. Pass its `tokenFetch(fetch)` as the transport's `fetch` so a token
endpoint `429` is waited out (at most 60 s) once.

## `pool import`

Stores the keys of an agent pool for `mcp token` ([`src/mcp/pool-import.ts`](src/mcp/pool-import.ts);
`openspec/changes/wbs-mcp-agent-surface` M7, M15). An admin creates or re-keys a pool in WBS and
downloads its keys once as `pool-<id>.keys.json` (`wbs-agent-pool-keys` v1); this command turns
that file into one key file, one MCP config and one run per agent.

```sh
chmod 600 ~/Downloads/pool-<id>.keys.json
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts pool import \
  ~/Downloads/pool-<id>.keys.json --store ~/.config/wbs/pools
```

- **The file must be owned by you with mode `0600`.** A browser saves it `0644`; the command
  refuses that until you `chmod 600` it, as `--key-file` does. Keys never come from an argument
  or standard input, and a key pasted where the path belongs is refused without echoing it.
- **Every key is proven before anything is written.** Each agent's key is exchanged for one
  token at the document's authorization server, with the agent's run, exactly as `mcp token`
  will. One refusal (a revoked key, an expired pool, a wrong server) aborts the import naming
  that agent and the OAuth error, and the store is left as it was. The document's
  `authorizationServer` must be `<mcpResource>/oauth`, the one `mcp token` asks.
- **The store** (`--store`, created `0700` if absent; refused if other users can enter it) holds
  per pool a link `pool-<poolId>` to the current generation, with:
  - `<personId>.key`: the agent's key, `0600`, for `mcp token --key-file`;
  - `<personId>.mcp.json`: a config for `claude --mcp-config` whose `headersHelper` runs
    `mcp token --resource <mcpResource> --key-file <that key> --run <its run>` with the `bun`
    and checkout that ran the import (the [checkout requirement](#claude-code-for-a-headless-agent-swarm)
    applies);
  - `pool.json`: the agents, their runs and paths; no key.
- **Each agent has its own run**, `pool-<poolId>/<personId>`, so its claims and leases are
  scoped to it (M15). The run does not change on a re-key, so a running agent's next token after
  a re-key keeps its leases. Start one agent process per config; two processes on one config
  share a run.
- **Re-importing after a re-key** writes a new generation and switches the link in one rename:
  a running helper reads either the old keys or the new ones, never a mix. An agent absent from
  the new document (its key revoked alone) loses its key file. Other pools are untouched.
- **Output** names the pool, each agent's person name, id, run and config path, and asks you to
  delete the downloaded file; it never prints a key. Dash then holds every key of the pool: a
  compromised Dash host is every agent until the pool is re-keyed or revoked (M7).

## `account-outcomes`

Turn one period's harness logs into an [efficiency breakdown](../../../../docs/twilight-structure/CONTEXT.md):
money per accepted outcome, with its evidence and its remainder.

```sh
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts account-outcomes \
  --repository /path/to/checkout-with-main \
  --since 2026-10-15T00:00:00Z --until 2026-10-22T00:00:00Z \
  --rate-card apps/twilight-structure/twilight-dash/cli/rate-cards/2026-10-22-list-prices.json \
  --claude-projects ~/.claude/projects/-home-df-wd-puni-puni-00 \
  --codex-sessions ~/.codex/sessions \
  --output /path/to/new-directory
```

The period is two required UTC instants; Dash reads no clock. An **accepted outcome** is a
first-parent merge into `main` whose subject names a pull request; pull requests merged into a
plan branch count through their parent merge and their head branches become its member
branches. Usage comes from Claude Code transcripts (one row per request from its last line,
since output grows while a response streams; subagent transcripts under a session directory
included) and Codex rollouts (one row per `token_count` event from the advance of the
cumulative counter, which makes repeated events count once). A line that is not JSON, which a
session still writing can leave, is skipped and counted in the output. Rows are priced from the
rate card by model and category in micro-units; a model the card does not list, or a category
it does not price, is reported as unpriced tokens and never as zero.

Attribution follows one stated order per row: a session that referenced exactly one accepted
pull request in its tool output, then the row's branch against the outcomes' branches, else
unattributed with a reason (`on-default-branch`, `no-branch`, `branch-not-accepted`,
`ambiguous-references`). The blended figure, priced cost over accepted outcomes, needs no
attribution; coverage says how much of the priced cost the per-outcome figures explain.

The output must be a new directory inside an existing parent. Dash writes
`harness-usage.json`, `efficiency-breakdown.json` and `efficiency-breakdown.md` as owner-only
files and prints one summary line. Invalid grammar, an existing output path, an absent or
malformed input, a repeated Claude request id whose input or cache counts disagree, or a Codex
counter that falls without a restart refuse before anything is written. The figures are API-equivalent
list prices from the named card, not subscription actuals.
