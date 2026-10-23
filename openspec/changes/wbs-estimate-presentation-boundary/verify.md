# Verification

## Scope and preserved source

Base: `ee750cb7070eb06d4b828eba7ccb3ddf16ae2d0b`.
Isolated clone: `/tmp/wbs-f7-estimates-oct17`, branch
`refactor/estimate-presentation-f7`. Dependencies are symlinked to the existing
workspace installation; no fresh frozen install has run.

The estimate column is 770 lines and adjacent presentation module 410. The cell
keeps its outer span, CellInput, hooks, typing/read derivation, header and unfolded
columns. RolledEstimateTrio returns the existing rolled span; EstimatePresentation
returns a fragment with the original result/problem/assignee/list/card children.
readStepNode is passed as a function and still called inside the carded branch.
Callbacks retain literal live.current reads at invocation, including dependency,
blockage, attempts and focus-return actions. Missing focus targets still throw.
All three original public exports remain available through estimates.tsx.

A temporary TypeScript AST/source comparison passed before and after formatting
and import ordering. Reading helpers and the complete unfolded-column suffix
are byte-identical. The folded CellInput, rolled trio and complete presentation
fragment are AST-print equivalent, normalizing whitespace/comments and Prettier's
redundant parentheses around the single MismatchMark expression. No wrapper DOM
node was added. All three public export names match. The temporary checker was
removed. The PM's independent Astra precommit source review found no P0–P3.

## Observed scoped checks

Checks ran serially after the PM released the lane. The watchdog samples total
resident memory in the command session every 100ms and stops at 360 seconds or
the stated sampled threshold. Sampling can overshoot that threshold. The first
two mounted attempts used 900 MiB; subsequent work uses 800 MiB. No cap was raised.

| Check                                                                                                         | Observed output                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_OPTIONS=--max-old-space-size=512 bunx eslint <file> --fix`, each production file separately             | Both exit 0, no diagnostics; estimate column peak 792674304 bytes, presentation 772751360 bytes. Cached graph available, module boundary lint active. |
| `NX_DAEMON=false NODE_OPTIONS=--max-old-space-size=512 bunx nx graph --file=/tmp/estimate-project-graph.json` | Exit 0; peak 273186816 bytes. Plugin socket unavailable, plugins ran in the main process.                                                             |
| `bunx prettier --check` over both production files and change packet                                          | All matched files use Prettier code style; exit 0.                                                                                                    |
| Installed OpenSpec 1.12.0 `validate wbs-estimate-presentation-boundary --json`                                | 1 valid change, 0 failed; exit 0.                                                                                                                     |
| Same CLI `validate --all --json`                                                                              | 244 valid items (226 changes, 18 specs), 0 failed; exit 0.                                                                                            |

The initial post-format source comparator flagged Prettier removing redundant
parentheses around MismatchMark. Inspection showed only that formatting
change; the comparator now normalizes it and passes. An initial explicit
compiler command used an absent `typescript/bin/tsc`; the installed facade's
entry point is `typescript/bin/tsc6`, whose actual version reports 6.0.3. No
absent-tool invocation is counted as passing.

## Mounted behavior and typecheck are unverified

| Attempt                                                                                                                                 | Observed outcome                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TZ=UTC NODE_OPTIONS=--max-old-space-size=640 bunx vitest run src/components/wbs/plan-estimates.test.tsx --maxWorkers=1` (frontend cwd) | Watchdog stopped at sampled 944459776 bytes after 8.05s; wrapper exit 137, no test summary.                                                                                                                   |
| Same suite with only `-t 'says a flat trio once'` and a 512 MiB Node heap                                                               | Watchdog stopped at sampled 943894528 bytes after 7.44s; wrapper exit 137, no assertion outcome. This attempt started before the PM lowered the sampled stop.                                                 |
| `NODE_OPTIONS=--max-old-space-size=512 bun node_modules/typescript/bin/tsc6 -p .estimate-scope.tsconfig.json --noEmit`                  | Watchdog stopped at sampled 853172224 bytes after 2.86s, wrapper exit 137; no compiler diagnostics. The temporary config selected the two production roots and their transitive dependencies; it was removed. |

Vite emitted its existing native-config warning for __dirname. The mounted
suite did not reach a passing or assertion-failing summary. No RED/GREEN is
claimed. Per PM instruction, no further laptop mounted or typecheck attempt ran.
Both existing test files remain unchanged. The plan-cells detail suite did not
run. Hosted proof must run the owning suites and inject/restore these faults:

- Render a duplicate final: `says a flat trio once`.
- Remove parent quiet styling: `quiets a parent’s rolled-up trio exactly as a leaf’s`.
- Read card points from draft text: `reads the trio off the row, not out of the boxes it was typed into`.
- Read the card final from shorthand: `says Final in days, whatever half-typed shorthand the cell is holding`.
- Remove detail focus return: `walks into both copy actions with keys and returns to the step cell` in plan-cells.test.tsx, which asserts Tab/Escape return.

No new production safety check was added or changed. Existing historical Proof
comments moved with the code; they are not fresh observations for this candidate.

## Normal hooks

Implementation commit: `192540c317ed9775cd814853929126470ffff559`, tree
`13cd190e46b2e84185e761f8d30153987ee4d066`. The PM explicitly authorized this
mechanical source commit if normal hooks pass, with mounted behavior/typecheck
and behavior faults kept hosted pending. The [commit receipt](evidence/commit.receipt.json.txt)
records exit 0, peak 814891008 bytes under the 800 MiB watchdog.

The PM-approved untracked clone-local configuration serializes pre-commit and
runs the same `bunx eslint` individually on each matching staged path. Parsed
[original](evidence/hooks-original.json.txt) and
[serial](evidence/hooks-serial.json.txt) merged configurations differ only in
parallelism and lint batching. All commands, arguments, globs, exclusions and
message hooks remain. Original lint has no flags. All six staged names matched
`[A-Za-z0-9_./-]+` immediately before committing. Format, lint, secrets, private
nesting and agent message hooks passed. Tool-wiki reported inactive without an
external activation root; doc caps and migration commands skipped because no
matching files were staged. No hook bypass occurred. The override was removed;
clean status was observed.

## Exact committed production size proof

The [observer](evidence/measure-committed.mjs.txt) imports unmodified production
readCandidate and measureSizes directly. Both outcomes must evaluate
successfully, exactly one base finding must select the estimate column, that
finding must disappear on the candidate, and every unrelated finding must match
exactly. It uses all six retained WBS/shared roots, ceiling 800 and no pins.
Policy SHA-256: `3cff7523646c98f4b405c7aea21df6b913ce90f0c1f6545157007fc31f73a00c`.

Production source SHA-256:

- `size-ratchet.ts`: `3e1d22d2bd3b52f1e7b98879e4f831858949501b8f1a213181c13f51f3b0c216`.
- `read-candidate.ts`: `b0eae510766c23dad0256715680248fb75e8713599e837323ee20612bafe2772`.

| Exact committed selection                                                                                   | Observed outcome                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base ee750cb7 versus good 192540c317                                                                        | [Comparison](evidence/sizes.json.txt): 29 to 28 production size findings, only estimate-column finding removed, all unrelated findings identical; exit 0, peak 366428160 bytes. The short revision argument resolves to full SHA/tree in the retained selection. |
| Oversized fault `0292ec45689fc42fa89685c223eb46d7b2a722f9`, tree `4723f838672b21cc3a5c3c1ca887b74479565707` | [Outcomes](evidence/sizes-fault.json.txt) and [failed assertion](evidence/sizes-fault.log.txt): original 1095-line finding returned; same assertion failed with `selected estimates.tsx finding remains`; exit 1, peak 476180480 bytes.                          |
| Exact full good SHA selected again                                                                          | [Restored comparison](evidence/sizes-restored.json.txt): 29 to 28, only selected finding removed; exit 0, peak 487706624 bytes.                                                                                                                                  |

The disposable fault worktree `/tmp/wbs-f7-estimates-fault-oct17` restored only
the original estimate-column file. Its normal commit hooks passed (peak
800878592 bytes). Its local config only disabled parallelism, preserving the
original single-file lint command and all other merged hook fields. The override
was removed, the worktree detached back to exact good 192540c317, and clean status
was observed. The unpublished proof branch retains the immutable fault. The main
implementation clone never received the oversized restoration.

The restored-positive command was:

```sh
bun /tmp/estimate-measure.mjs /tmp/wbs-f7-estimates-oct17 ee750cb7070eb06d4b828eba7ccb3ddf16ae2d0b 192540c317ed9775cd814853929126470ffff559 /tmp/directory-f7-consumer/policy.json
```

This direct production rule proof is independent of installed CLI orchestration,
all-rule surveys and mounted behavior; it does not establish those obligations.

Installed full F7, all-rule preservation, browser acceptance, fresh frozen install,
full frontend lint/typecheck and immutable hosted gate remain pending. On h2puni
the full gate must use `bin/h2puni-gate.sh <sha>`.

WBS100 `02d9313b-d484-4cf1-9485-f71fe81c0fdf` remains `blocked_by_proxy`.
No publication, WBS mutation, certification or closure is authorized or claimed.

## Evidence follow-up

This follow-up changes only the OpenSpec packet and receipts; the frontend bytes
must remain identical to implementation 192540c317. The
[source observer](evidence/check-source-preservation.ts.txt) records the exact
normalization used. Command logs retain output except surplus EOF blank lines
trimmed in copied receipts; original logs remain untouched under `/tmp`.

Mounted suite attempts, the selected flat-case attempt and the pinned compiler
attempt each retain their watchdog receipt. The historical file name
`flat-green` names an attempted run, not a successful GREEN; it was killed before
assertions. No behavior fault was injected after startup proved too large. Tasks
1.3, 1.5 and hosted acceptance remain unchecked; the packet is not archived or
synced. This is mechanical source and limited size progress only.
