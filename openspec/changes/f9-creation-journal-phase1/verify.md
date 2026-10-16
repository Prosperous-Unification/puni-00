## Scope and status

Phase-one local candidate on exact wave6 base `7a13fd0033b9067f0b9cfb980139efb20c4bde56`.
Isolated checkout: `/tmp/puni-f9-receipts-phase1`, branch `f9-receipts-phase1`.
All implementation tasks are checked. No delta specs have been synced: this change remains open
for Astra review. No push, PR, archive, deployment or live infrastructure action was performed.

The journal records attempt lifecycle facts only. It contains no resource ownership receipts and
cannot authorize deletion. The separate consuming lifecycle always refuses deletion. Ordinary
`downLab` remains unchanged and name/label based. The k3d parser still accepts only up/down/status;
no F9 recovery command was enabled. The older production `recover.ts` is unrelated and unchanged.

## Initial candidate verification commands and observed output

Dependencies were reused through a local `node_modules` symlink to the integration checkout.
Both checkouts' `bun.lock` SHA-256 is
`15651c976776d7c1ab3a87935b53dae67e73939c6f7d06dec12ed10598cfe80c`.
No dependency installation was performed or claimed.

| Command                                                                                                                                                                               | Observed output                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:test`                                                                                                                | 511 pass, 0 fail, 1805 expectations, 43 files; Nx successful, 54.0s |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:lint`                                                                                                                | Nx successfully ran target lint, 18.0s                              |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:typecheck`                                                                                                           | Nx successfully ran target typecheck, 1.2s                          |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/creation-journal.test.ts tools/tool-fleet/src/k3d-creation-journal.test.ts`                                  | Initial restored code: 20 pass, 0 fail, 80 expectations, 3.32s      |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/creation-journal.test.ts tools/tool-fleet/src/k3d-lab.test.ts tools/tool-fleet/src/k3d-object-store.test.ts` | 53 pass, 0 fail, 131 expectations                                   |
| `openspec validate f9-creation-journal-phase1 --strict --json`                                                                                                                        | 1 passed, 0 failed                                                  |
| `openspec validate --all --json`                                                                                                                                                      | 216 passed, 0 failed: 198 changes and 18 specs                      |
| `bunx prettier --check <all changed code/docs and this change directory>`                                                                                                             | All matched files use Prettier code style                           |
| `git diff --check`                                                                                                                                                                    | Exit 0; no output                                                   |

OpenSpec was invoked with Bun using the locally installed
`/tmp/puni-ci-repair-openspec-tool/node_modules/@fission-ai/openspec/bin/openspec.js`.
The full fleet test target and real-up fixtures needed loopback permission outside the sandbox.
Their Docker/k3d/kubectl executables were fixture scripts; no live daemon or cluster was used.
An initial Nx run could not use sandbox sockets and printed no task execution; it is excluded
from evidence. Subsequent runs explicitly disabled the Nx daemon/plugin isolation and printed
the actual target commands. Initial lint errors were corrected and the successful scoped target
was rerun. The successful direct focused tests followed all fault restoration.

## Failure proofs

Each temporary mutation was restored. The mutation script logs are in `/tmp/f9-proof-*.log` and
its 14-check summary is `/tmp/f9-proofs.log`; no mutation switch is shipped in production.
The wrong-identity mutation initially exposed a broad test regex matching the disabled-executor
message. That assertion was tightened to the identity-mismatch message and the mutation then
failed all wrong-attempt/daemon/lab negatives.

| Production check or dependency | Injected fault                                                     | Test observing failure                                                               | Observed proof                                                |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Identity validation            | Bypass identity schema                                             | rejects invalid identity before creating filesystem state                            | Exit 1                                                        |
| Owner-only directory           | Remove directory refusal                                           | refuses a public journal directory before consuming state                            | Exit 1                                                        |
| Exclusive creation             | Replace O_EXCL with overwrite                                      | creates owner-only durable state and refuses an occupied attempt                     | Exit 1                                                        |
| Non-following journal open     | Remove O_NOFOLLOW                                                  | refuses symlink at the consuming lifecycle boundary                                  | Exit 1                                                        |
| File owner/type/mode boundary  | Remove descriptor checks                                           | refuses public mode at the consuming lifecycle boundary                              | Exit 1                                                        |
| Strict schema                  | Permit unknown fields                                              | refuses extra field at the consuming lifecycle boundary                              | Exit 1                                                        |
| Expected identity binding      | Remove equality comparison                                         | refuses wrong attempt / wrong daemon / wrong lab at the consuming lifecycle boundary | Exit 1                                                        |
| Terminal state                 | Remove creating-state refusal                                      | keeps concurrent attempts isolated and serializes one attempt                        | Exit 1                                                        |
| Per-attempt serialization      | Permit an existing lock directory                                  | keeps concurrent attempts isolated and serializes one attempt                        | Exit 1                                                        |
| Required consuming read        | Bypass journal read                                                | Separate refuses absent and refuses unreadable consuming tests                       | Both fail, exit 1                                             |
| Disabled identity executor     | Return successfully for a valid journal                            | refuses deletion even for a valid journal until the identity executor exists         | Exit 1                                                        |
| Reservation before creation    | Bypass exclusive reservation                                       | runs creation only after durable reservation and records success or failure          | Exit 1                                                        |
| File durability                | Inject file sync error; then remove production file sync           | refuses creation before callback when file synchronization fails                     | Normal dependency fault is refused; removal makes test exit 1 |
| Directory durability           | Inject directory sync error; then remove production directory sync | refuses creation before callback when directory synchronization fails                | Normal dependency fault is refused; removal makes test exit 1 |
| Real up reservation ordering   | Before integration, fixture network-create requires a journal      | reserves a journal before real up creates resources and records a creation failure   | Red: missing reservation, exit 1; restored: pass              |
| Historical attempt retention   | Inject history-directory deletion into ordinary down               | keeps old attempt journals across ordinary up down up                                | Exit 1: expected two journals, received one; restored: pass   |

Malformed JSON and unreadable 000-mode files are supplied to the actual consuming API rather than
testing a decoder in isolation. Missing and unreadable are separate tests with distinct expected
refusals. The real-up fixture records a failed attempt without cleanup; ordinary up/down/up leaves
two ready UUID journals, and the failure message explicitly denies cleanup authority.

## Skipped and unverified

Per the requested scope, the host-wide h2puni gate, raw full Nx gates, repository-wide
`nx format:check --all`, global test/lint/typecheck/build, secrets scan, migration lint and live
F9 acceptance were not run. `tool-fleet` has no build target; its declaration compilation is
covered by typecheck. No crash/power-loss or hostile same-user filesystem race was simulated.
No claim is made that the legacy label/name teardown is safe, that creation ownership has been
proven, or that the phase-two recovery executor exists.

## Review handoff

The local commit and tree are reported in the agent handoff after committing this artifact.
The change remains unarchived and awaits Astra rereview before any push or PR.

## Astra review corrections

Astra reviewed initial commit `a1c757eb9f64b7cb34b703416154f7586b42b406` and found three gaps:
implicit k3d automatic rollback, FIFO blocking before the descriptor type check, and owner checks
without independent UID mismatch proofs. The revisions address those gaps; the original network
failure fixture did not establish what happened inside k3d creation.

### Pinned k3d contract

Read-only commands against `/home/df/.local/puni-bin/k3d` produced:

```text
k3d version v5.9.0
k3s version v1.35.5-k3s1 (default)
--no-rollback  Disable the automatic rollback actions, if anything goes wrong
06d8f25bc3a971c4eb29e0ff08429b180402db0f4dec838c9eac427e296800a0
```

The binary SHA-256 exactly matches `infra/versions/toolchain.json`. Only `version` and
`cluster create --help` were executed against that binary; neither invokes the creation action.
The pinned [v5.9.0 CLI source](https://github.com/k3d-io/k3d/blob/v5.9.0/cmd/cluster/clusterCreate.go#L142-L154)
checks `NoRollback` after `ClusterRun` fails, otherwise calls `ClusterDelete`.
Its [flag binding](https://github.com/k3d-io/k3d/blob/v5.9.0/cmd/cluster/clusterCreate.go#L275-L276)
connects `--no-rollback` to that setting. Production up now passes the flag explicitly.

The k3d-stage fixture follows that executed contract: it creates a partial fixture, fails inside
cluster creation, and removes the fixture unless the executed arguments disable rollback. The
restored real-up caller retains the partial fixture, records failed state and executes no cleanup
command. Actual external inventory is unknown and requires manual inspection; no journal proves
which objects exist or who owns them. Failure output, JSDoc and the spec now state this narrower
contract instead of promising retention of every resource.

### FIFO and owner identity evidence

An actual mode-0600 FIFO occupied the requested journal filename. Before the fix the consuming
subprocess blocked and its 2-second bound killed it with exit 137. The reader now opens with
O_NONBLOCK and O_NOFOLLOW, then rejects the opened nonregular descriptor before reading.

The two UID tests inject only the process identity provider inside isolated subprocesses. The
real fixture directory and file retain their actual owner and exact 0700/0600 modes. One test
substitutes a different UID for directory validation; the other keeps directory identity correct
and substitutes a different UID only at opened-file validation. Both call the real
`consumeCreationAttempt` boundary. No production injection seam, chown, or host ownership change
was added. These are injected UID mismatch proofs, not real foreign-owned inode proofs.

A genuine foreign-owned 0600 file proof was unavailable under the unprivileged execution model:
ordinary DAC prevents opening it before fstat, sudo requires a password, and the available user
namespace maps only the invoking UID; `newuidmap` is absent. No foreign-inode success is claimed.

| Production dependency or check | Injected fault                       | Consuming test                                                                                         | Observed result                                                                               |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Explicit rollback suppression  | Remove `--no-rollback`               | disables k3d rollback when cluster creation fails and leaves its partial fixture for manual inspection | Exit 1, ENOENT reading the partial fixture after simulated internal rollback; restored passes |
| Nonblocking open               | Remove O_NONBLOCK                    | refuses a FIFO journal at the real consuming boundary without blocking                                 | Exit 1 after child exit 137 at 2s; restored rejects promptly                                  |
| Opened regular-file validation | Remove only `isFile`                 | same FIFO consuming test                                                                               | Exit 1 because it reaches malformed JSON instead of the regular-file refusal; restored passes |
| Directory owner UID            | Remove only directory UID comparison | refuses an injected directory UID mismatch at the real consuming boundary                              | Exit 1; mode remains 0700 and the file UID comparison remains present                         |
| Opened file owner UID          | Remove only file UID comparison      | refuses an injected file UID mismatch at the real consuming boundary                                   | Exit 1; mode remains 0600 and the directory UID comparison remains present                    |

All five mutations were restored. Logs are `/tmp/f9-rereview-proof-*.log`; the FIFO/k3d original
red runs are `/tmp/f9-rereview-journal-red.log` and `/tmp/f9-rereview-k3d-red.log`.

### Revised verification

Final scoped check results are recorded below after all mutations were restored. The same
skipped global gates, installation and live-acceptance limitations listed above still apply.

| Command                                                                                                                                              | Revised observed output                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:test`                                                                               | 515 pass, 0 fail, 1829 expectations, 43 files; Nx successful, 54.3s |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:lint`                                                                               | Nx successful, 17.9s                                                |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:typecheck`                                                                          | Nx successful, 1.3s                                                 |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/creation-journal.test.ts tools/tool-fleet/src/k3d-creation-journal.test.ts` | 24 pass, 0 fail, 104 expectations, 4.90s                            |
| `openspec validate f9-creation-journal-phase1 --strict --json`                                                                                       | 1 passed, 0 failed                                                  |
| `openspec validate --all --json`                                                                                                                     | 216 passed, 0 failed                                                |
| Scoped `bunx prettier --check` over changed code/docs and this change directory                                                                      | All matched files use Prettier code style                           |
| `git diff --check`                                                                                                                                   | Exit 0, no output                                                   |

The first revised typecheck correctly rejected possibly undefined UID expectations in the tests;
the test now requires a UID provider before comparing the real fixture owners. Typecheck was rerun
successfully. The full restored suite and focused fixtures passed without ignored failures.
No new live infrastructure commands, dependency installation, host gate, push or PR occurred.
