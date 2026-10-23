# F7 mechanical aggregate — 2026-10-16

Isolated clone: `/tmp/wbs-f7-aggregate-sol`. Base is exact main
`87a2b7edbfaabae889d91daa823f16f520a51cec`. Dependencies reuse the wave12
clone through an untracked `node_modules` symlink; no fresh install is claimed.

## Exact source union

Three normal `--no-ff` merges preserve reviewed source ancestry, in order:

1. Cache `4486df76748ca9eb8ddebbf6852436fc4e08f647`, reviewed tree
   `38c031eaa03dfa343f23703b3af68e00c9b6493d`.
2. Memory `240b72d87789ee793e94c0c85612819605024382`, reviewed tree
   `90eacbf9751e6cb942723d7092924b693be39148`.
3. Domain verification documentation successor
   `f3f87016de0f4cdc1fa0e6f943894c76753bdcaf`, reviewed tree
   `99a5545c1822ca19cbff8b1bf2d60b31d5e58d70`.

Source merge head is `a0d8212575cdc04dc6414c14012e2a0a1efa1d28`, tree
`2c5fc48ef5ab50f6e678b7b76cf0d246cec128cb`. `merge-ancestry.log` records
all immediate parents. `union.json` records all 39 disjoint changed paths:
each aggregate mode and blob equals its reviewed source entry; their union
exactly equals the aggregate diff from base. Every source is an ancestor.
All source evidence and R5 proof comments survive byte for byte. No new safety
check or production behavior was introduced in this aggregate.

## Fresh serial checks

`tests.json` and `checks.json` retain exact commands and exit status; neighboring
logs retain complete output and `/usr/bin/time` peak RSS. Commands ran serially,
with `NODE_OPTIONS=--max-old-space-size=768`, `NX_DAEMON=false`, and
`NX_ISOLATE_PLUGINS=false`. The Node setting bounds its old generation; it is
not a total RSS cap. Highest observed peak was the SQLite library typecheck,
1975300 KiB (about 1.88 GiB). SQLite spec typecheck used 1333036 KiB and memory
library typecheck used 1026816 KiB. These scoped serial checks still consumed
substantial laptop RAM; the earlier 944464 KiB maximum attributed to ESLint was
incorrect. No additional typecheck or test was run for this evidence correction.

| Check                                                              | Observed                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Cache optimized owner and consuming suites, six files              | 181 pass, 0 fail, 803 assertions                                         |
| Memory source, fixtures and conformance, six files                 | 107 pass, 0 fail, 5372 assertions                                        |
| Mounted domain controller and SQLite organization store, two files | 86 pass, 0 fail, 287 assertions                                          |
| SQLite and memory library and spec typechecks                      | All four exit 0, no diagnostics                                          |
| Nx graph only                                                      | Exit 0; fresh graph for module-boundary enforcement                      |
| Scoped ESLint, all eight touched TypeScript files                  | Exit 0, no skipped-boundary warning                                      |
| Pinned OpenSpec 1.12.0 strict change validation                    | Exit 0, 1 valid; zero deltas accepted by existing skip_specs declaration |

Scoped formatting passed (`format.log`). The earlier whitespace-check statement
was incomplete: the recorded aggregate-directory check did not cover inherited
source evidence. Fresh `git diff --check` from exact base to evidence head
`31c1be09342b5dd09b0fdc7a844fb447741d96c5` exits **2**, with 16 trailing-whitespace
warnings. `diff-check.json` retains the exact command, exit code, stdout and
per-path mode/blob provenance. All warnings are inherited reviewed source
receipts, preserved byte for byte:

| Source evidence path, relative to `evidence/`   | Warning lines             |
| ----------------------------------------------- | ------------------------- |
| `domain-verification-boundary/commit-hooks.log` | 7, 10, 12, 14, 18, 30, 38 |
| `memory-stores-boundary/allowance-copy.log`     | 8                         |
| `memory-stores-boundary/journal-forward.log`    | 4                         |
| `memory-stores-boundary/normal-hooks.log`       | 7, 10, 12, 14, 18, 36, 44 |

There are zero aggregate-added warnings. The base-to-HEAD whitespace check is
**failing**, not waived or relabelled as passing. Raw source receipts remain
unchanged to preserve their reviewed mode/blob union. The JSON receipt encodes
raw output using string escapes so its own storage introduces no whitespace
warning. A scoped aggregate-only check does not replace this failed check.

Normal hooks
were installed through `bun run tools/tool-git-hooks/src/install.ts`; merge
commits ran prepare-commit-msg and commit-msg hooks. The aggregate evidence
commit `c25cb3621871424292d93e200dab1894c8abe8f7` passed normal applicable
pre-commit, prepare-commit-msg and commit-msg hooks, without bypass; its complete
receipt is `commit-hooks.log` with trailing whitespace removed. The verbatim
receipt remains at `/tmp/wbs-f7-aggregate-commit-hooks.log`. Lint, migration and doc-cap hooks had no matching
staged files. Tool Wiki explicitly reported inactive and uncertified because the
external activation root is absent. This receipt describes the evidence commit
only; the following documentation successor preserves that receipt.

## Scheduler handoff

Scheduler successor `1b074a931a5b711115e9618745f12ac38c892367` is fetched for
an object-only audit and is not merged here. Its `domain-claim.ts` source blob
is `6897abec822dd3acae56b5e9be67987d55e2a4e7`. Its class JSDoc and
`finishProofCheck` cancellation edits are disjoint from the extraction's import
and `readClaimForVerification` delegation. `git merge-tree --write-tree` exits
0 and reports hypothetical tree `51aab8a39f3a796900d4fe4f9f701489e3cf8670`.
This proves clean textual composition only; later runtime integration needs its
own exact review and focused checks.

## Limits

No full local Nx gate, workspace build, solver, Docker, browser, h2puni gate,
installed F7 evaluation, certification, or public push was run. Existing source
negative-proof receipts are preserved, not relabelled as freshly rerun aggregate
mutations. WBS090 row `7ad9e8a6-0369-43f0-9711-8d9e687d92a6` remains
`blocked_by_proxy`. Exact aggregate review and controlled host validation remain
coordinator work. The source review approval remains pending.
