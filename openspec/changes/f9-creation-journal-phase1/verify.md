## Scope and status

Phase-one local candidate on exact wave6 base `7a13fd0033b9067f0b9cfb980139efb20c4bde56`.
Isolated checkout: `/tmp/puni-f9-receipts-phase1`, branch `f9-receipts-phase1`.
All implementation tasks are checked. No delta specs have been synced: this change remains open
for Astra review. No push, PR, archive, deployment or live infrastructure action was performed.

The journal records attempt lifecycle facts only. It contains no resource ownership receipts and
cannot authorize deletion. The separate consuming lifecycle always refuses deletion. Ordinary
`downLab` remains unchanged and name/label based. The k3d parser still accepts only up/down/status;
no F9 recovery command was enabled. The older production `recover.ts` is unrelated and unchanged.

## Verification commands and observed output

Dependencies were reused through a local `node_modules` symlink to the integration checkout.
Both checkouts' `bun.lock` SHA-256 is
`15651c976776d7c1ab3a87935b53dae67e73939c6f7d06dec12ed10598cfe80c`.
No dependency installation was performed or claimed.

| Command                                                                                                                                                                               | Observed output                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:test`                                                                                                                | 511 pass, 0 fail, 1805 expectations, 43 files; Nx successful, 54.0s |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:lint`                                                                                                                | Nx successfully ran target lint, 18.0s                              |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:typecheck`                                                                                                           | Nx successfully ran target typecheck, 1.2s                          |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/creation-journal.test.ts tools/tool-fleet/src/k3d-creation-journal.test.ts`                                  | Final restored code: 20 pass, 0 fail, 80 expectations, 3.32s        |
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
The change remains unarchived and awaits Astra review before any push or PR.
