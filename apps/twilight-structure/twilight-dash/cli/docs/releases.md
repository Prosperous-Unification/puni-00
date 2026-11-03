# Release operations

Dash dispatches a named release target to its configured adapter. The adapter owns the source
selection, build, publication, rollout, observation and rollback policy. The two actions have
separate contracts: `plan` prepares and reports a selection without deploying; `run` explicitly
executes it. The current implementation is independent of the separately developed `ops job`
host scheduler; adapters retain their existing host capacity admission.

```sh
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops release plan website \
  --config /absolute/path/dash-releases.json \
  --environment development --profile dev-fast --ref main
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops release run website \
  --config /absolute/path/dash-releases.json \
  --environment development --profile dev-fast --ref feature/home \
  --public-ref feature/app
```

Generated help and completion include both release actions. Options accept `--flag=value` or
`--flag value`, in any order around the target. The central grammar refuses invalid arguments
before a handler runs; release usage errors retain exit 1, and host-job/pool usage errors retain 64.

Every invocation requires an explicit environment and profile. `dev-fast` refuses outside
`development`; selecting `full` is a separate operator action. Dash prints `DEV-FAST` or `FULL`
before launching the adapter. Neither that line nor the adapter's exit status alone proves which
revision the environment serves; the adapter's observed-release receipt supplies that evidence.

## Dispatch configuration

Create a regular file owned by your account with mode `0600`; Dash never follows a symlink to it.
The file is executable authority, so its paths are supplied by its owner rather than discovered
from application input. Missing, unreadable, exposed or malformed configuration is fatal.

```json
{
  "schemaVersion": 1,
  "targets": {
    "website": {
      "adapter": "/absolute/private-checkout/deploy/website/ops/release.ts",
      "configuration": "/absolute/operator-directory/website-release.json"
    }
  }
}
```

Both paths must be absolute. Dash accepts no executable override on the command line. It starts
this adapter with the current Bun interpreter and an argv array, preserving argument boundaries
without a shell. Adapter output is streamed and nonzero exit status is preserved.

## Adapter protocol

The selected adapter receives:

```text
plan|run --config ABSOLUTE_CONFIGURATION --environment development|production
         --profile dev-fast|full [--ref PRIVATE_REF] [--public-ref PUBLIC_REF]
```

The website adapter and its configuration live in the private companion. Its source policy
selects default refs and permits either main only or explicit branches. Ref overrides never
mean automatic branch merging. Each selected ref resolves once to an immutable commit, and the
source closure must satisfy the website's public snapshot contract. Release receipts distinguish
the composite source request, profile and original source of every reused service artifact.

The fast website profile performs focused checks and uses input-aware compilation and immutable
image reuse. The full profile retains full checks and the existing complete build path. Schema,
infrastructure and compatibility changes requiring full verification refuse the fast profile
with a reason rather than silently weakening or switching profiles. Unchanged API images retain
their original retention writer identity. No inference, analytics, secret or production activation
is authorized merely by creating this configuration or merging this command.
