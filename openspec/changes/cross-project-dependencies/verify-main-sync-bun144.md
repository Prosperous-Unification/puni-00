# Main synchronization and Bun 1.4.4 candidate measurements

2026-10-24. Integrates feature parent `63bccebbd32a4585add730753d24d20109288500`
and exact main `79fb9e032f3444f04f59671f32f404e742fbc5fd` in the isolated
`/tmp/puni-main-merge-20261024` worktree. This is candidate integration evidence,
not host operational acceptance or adoption of a new source runtime image.

## Mechanical coordination

Main's ADR 0057 describes activities; the feature monotone-activation decision is
now [ADR 0064](../../../docs/adr/0064-cross-project-dependency-activation-is-monotone.md).
Current links and references follow that rename. Dated historical checkout paths
and raw Bun 1.4.2 evidence remain unchanged. UI conflict resolution preserves
scoped/captured dependency behavior alongside main's kit controls, select styles,
control edges and settings Escape/root flow. Both MCP Dockerfiles retain the
OpenAPI document stage and use Bun 1.4.4 for dependency and runtime stages.

## Runtime identity and limits

Actual executable `/home/df/.bun/bin/bun` reports `1.4.4 (38afee6c8)` in test output;
`--version` reports `1.4.4`. SHA-256:
`10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235`.
Merged `.bun-version` is `1.4.4`. Frozen install passed with fixture-local
`BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/puni-main-merge-bun-cache`.

The supervisor explicitly admits only `1.4.2` and `1.4.4`. Tests preserve recorded
1.4.2 compatibility and reject 1.4.3, 1.2.20, absent and malformed version output
before mutation. No range, arbitrary runtime selection or fallback was added.
Older source-image 1.4.2 evidence describes its original SHA/image only. These
measurements do not relabel it or establish any new source-image identity.

## Real peer identity

`solver-supervisor-peer.proc.test.ts` exercises production
`listenForSupervisorConnections` with actual `readSupervisorPeerCredentials`
explicitly wired as the credential dependency. The credentials are never replaced
with claimed PID/UID/GID. Only cgroup/container identity lookups are stubbed; the
run seam checks the real frame and sends the production channel response.
Source and Bun-bundled production modules each accept a separate Bun client,
observe a nonnegative accepted fd, kernel PID equal to that child and different
from the listener, and exact UID/GID. Missing-fd and wrong-native-option faults
refuse before the run seam. Every invocation joins client exit and pipes, stops
the listener and verifies socket removal before returning. The source/built
matrix passes six tests. The full shipped supervisor is built separately and its
real CLI admission/lifetime tests remain in the focused runtime command.

Local proof does not establish h2's accepted-socket behavior. The parent will run
the committed candidate with a checksum-verified private 1.4.4 executable on h2
before operational acceptance; no host changes were made here.

## Actual source loader closure

`source-bun-profile.proc.test.ts` runs actual Bun 1.4.4 in a disposable bwrap
namespace: UID/GID 1000, `env -i`, no HOME, recursively read-only `/src` and
read-only dependency mounts. A source copy isolates all poison. It executes
backend-candidate, backend-retained, gateway and MCP CLIs independently, from
`/src/apps/wbs/{be-01,be-01,gw-01,mcp-01}`. Both equal backend calls execute.
The configured poisoned dotenv is suppressed by `--no-env-file`; a separate
same-profile inspection observes its sentinel when that flag is omitted. The
probe checks actual UID/GID, missing HOME and EROFS when writing `/src`; scratch
contains only Bun's measured node-compat shim directory, never a database.

The loader matrix measures each location separately under absent and explicit
`HOME=/image-home`, using both a harmless preload sentinel and malformed TOML.
It bypasses config guards only inside the disposable fixture.

| Config location                            | No HOME | Explicit HOME |
| ------------------------------------------ | ------- | ------------- |
| `/home/fixture/.bunfig.toml` (passwd home) | ignored | ignored       |
| `/image-home/.bunfig.toml`                 | ignored | ignored       |
| `/src/apps/wbs/be-01/bunfig.toml`          | loaded  | loaded        |
| `/src/apps/wbs/bunfig.toml`                | ignored | ignored       |
| `/src/apps/bunfig.toml`                    | ignored | ignored       |
| `/src/bunfig.toml`                         | ignored | ignored       |
| `/bunfig.toml`                             | ignored | ignored       |
| `/.bunfig.toml`                            | ignored | ignored       |

A loaded malformed role config prints the parser diagnostic and still exits zero
with the valid role capability response. Exit code alone therefore does not prove
config absence or refusal. Tested ignored files produce neither preload sentinel
nor parser diagnostic. This is a fixed candidate invocation profile, not a claim
about every Bun subcommand/config setting. Conservative existing home/source
config guards are retained. Separate native preflight negatives poison passwd
home and explicit image HOME and refuse before any role CLI. The existing
`os.homedir()` check is now explicitly named as passwd-resolution evidence only.

## Commands and observed checks

New evidence logs normalize carriage returns and trailing whitespace only; original
command output remains in the named `/tmp/puni-merge-*.log` files. No historical
evidence was normalized or relabeled.

Environment for Nx: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`.

- Approved focused runtime command: `bun test` over the eleven requested files
  plus the new peer/source profile files, preload `tools/test/scratch/preload.ts`,
  timeout 60000: **323 passed, zero failures**, 1526 assertions, thirteen files.
  This includes actual FD3/OFD installer transport, controlled exit 78,
  cancellation join, source recognition, scanner root-cwd/no-HOME profile and
  solver binding checks. See `evidence/main-sync-bun144/runtime.log`.
- Final new profile/peer rerun after adding malformed-TOML measurement: **24 passed, zero failures**,
  256 assertions; `evidence/main-sync-bun144/profile.log`.
- UI integration checks: **213 passed**, three files: typed dependency editor,
  plan cards, project settings modal. UI typecheck including modules passed.
- Namespace/backend exclusion matrix: **179 passed**, zero failures, 70,167
  assertions. Not repeated after unrelated profile/CI test edits.
- Scoped remote-script production build passed; scoped runtime typecheck includes
  its test project. Devsync test typecheck and changed-source lint passed. Shellcheck of the two changed gate scripts passed.
- Full OpenSpec validation passed: 280 entries, zero failures. Changed-file Nx
  format check passed. Final output is retained alongside this record.

Two real Docker exceptional-cleanup tests were explicitly skipped in a separate
listener/lifecycle run because `WBS_SOLVER_ORPHAN_IMAGE` was unset. No browser,
Docker daemon, full Nx gate or host/deploy work was run. Local precommit evidence
is not a full h2 gate claim.

## Breakability and prerequisites

Independent restored mutations were watched failing:

- Remove accepted-fd validation: source and built missing-fd cases fail.
- Change native SO_PEERCRED option 17 to 16: both real cross-process positives fail.
- Remove exact version admission: all five unmeasured/malformed negatives fail.
- Remove native home-config absence check: passwd-home and explicit-HOME poison
  cases independently fail by reaching the protected role boundary.
- Omit production role `--no-env-file`: actual observer command assertion fails.
- Remove workspace CI provisioning: named toolchain provisioning test fails.
- Before adding h2's native prerequisite probe, missing and exit-74 bwrap fixtures
  both reached later Nx work; all four new harness assertions failed. With the
  probe present, both refuse before Nx and the complete lightweight gate harness
  passes. The probe is mandatory, not a skipped optional capability.

CI workspace provisioning reuses the existing ephemeral-runner bubblewrap and
binary-specific AppArmor userns profile. The h2 gate only probes tool presence
and namespace capability; it never installs packages or changes host policy.
A missing/unusable host prerequisite remains an explicit operational block.
No global sysctl weakening or strace dependency was introduced.
