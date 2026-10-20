# Verification

## Scope and source preservation

Base: `8ceba735235b431a237f3ee3aacc06053d4bbabf`.
Isolated clone: `/tmp/wbs-f7-reference-oct17`, branch
`refactor/reference-presentation-f7`. Dependencies are symlinked to the existing
workspace installation; no fresh frozen install has run.

The field measures 781 lines, contracts 152, presentation 254. Contracts own
adapter/props/entry/line types and holdsOneMember; presentation owns style/class
constants, chipLineStyle, useHiddenChips, HiddenChipCount and referenceSetLines.
The field retains unique and complete ReferenceSetStrip/Sheet implementations.
All twenty original public names are explicitly forwarded, including helpers
the dependency column imports. The original mounted test files are unchanged.

Before and after formatting/import ordering, a temporary TypeScript AST check
reported: `18 function/constant declarations byte-identical, including complete
Strip/Sheet state and writes; 20 original public export names preserved;
siblings do not import field.` Both runs exited 0. The script compares original
function and constant source text to its new owner and compares original public
names to explicit field exports. It was removed afterward. Adjacent Proof
comments occur before declarations and leave their source text unchanged.

Moved JSDoc references to field components, HoverCard and the adapter's inherited
label became relative Markdown links, avoiding reverse imports and a type import
used solely in a comment. No domain terms or irreversible decisions were added.
The PM's independent Astra source review reported no P0–P3 findings.

## Checks observed

Bun 1.4.2, Vitest 5.0.0. The parser module is TypeScript 6.0.2; the actual
`bunx tsc --version` reports 7.0.2 via the installed `@typescript/native` binary.
Checks ran serially after the PM released the laptop lane. The watchdog samples
aggregate resident memory for the command session at 100ms intervals and stops
at a sampled 900 MiB threshold or 360 seconds. Node checks use a 640 MiB heap.

| Check                                                                                                                                                                                                        | Observed output                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TZ=UTC NODE_OPTIONS=--max-old-space-size=640 bunx vitest run src/components/wbs/reference-set-field.test.tsx src/components/wbs/depends-card.test.tsx --maxWorkers=1` (frontend cwd), final restored source | 2 files, 50 tests passed; exit 0; sampled peak RSS 437927936 bytes. Initial run also passed 50, peak 446058496 bytes.                                                                                                               |
| `NX_DAEMON=false NODE_OPTIONS=--max-old-space-size=640 bunx nx graph --file=/tmp/reference-project-graph.json`                                                                                               | Exit 0, peak 271847424 bytes. Plugin socket unavailable; plugins ran in the main process.                                                                                                                                           |
| `NODE_OPTIONS=--max-old-space-size=640 bunx eslint <file> --fix`, each production file separately                                                                                                            | All three exit 0, no diagnostics; field 866463744, contracts 729374720, final presentation 756682752 bytes. Cached graph available; boundary lint active.                                                                           |
| `NODE_OPTIONS=--max-old-space-size=640 bunx tsc -p .reference-scope.tsconfig.json --noEmit`                                                                                                                  | Exit 0, final sampled peak 78127104 bytes. Temporary config extends production config and selects the three changed roots with transitive dependencies; `--listFiles` confirms all three within 94 files. Config removed afterward. |
| Installed OpenSpec 1.12.0 `validate wbs-reference-set-presentation-boundary --json`                                                                                                                          | 1 valid change, 0 failed; exit 0.                                                                                                                                                                                                   |
| Same CLI `validate --all --json`                                                                                                                                                                             | 243 valid items (225 changes, 18 specs), 0 failed; exit 0.                                                                                                                                                                          |

Vite emitted its existing native-config warning for `__dirname`. The first
format invocation used checkout-relative paths from the frontend cwd and found
no matching files; it was rerun successfully from the checkout root. The first
presentation ESLint run found the unused adapter type import used only in
JSDoc; replacing its link with Markdown and removing that import produced the
passing rerun. No OOM or watchdog termination occurred in these checks. Full
frontend lint/typecheck and browser layout are not established by scoped checks.

## Watched production faults

Each fault failed exactly one selected existing case with exit 1 and 36 skipped,
then production was restored. The final two-suite GREEN ran after restoration.
No production safety check was added or changed; each fault's observed assertion
is recorded by an adjacent `Proof:` comment.

| Injected fault                                | Observed case and failure                                                                                                                                                                                     | Sampled peak RSS bytes |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------: |
| Suppress nonempty HiddenChipCount             | `clips the rest line, counts what it hid...`: expected string for count, received undefined.                                                                                                                  |              371015680 |
| Remove resting maxHeight from chipLineStyle   | `rests every flex container of a crowded cell on one line`: empty maxHeight instead of 18px.                                                                                                                  |              391716864 |
| Drop the own-set guard from referenceSetLines | `adds the overriding dimension’s reading only while the row states none of its own`: extra inherited Core line beside own Platform. This is the production hover-line formatter case within the owning suite. |              384008192 |
| Force holdsOneMember false                    | `flags a type conflict, shows every type, and keeps the one picked`: conflict flag absent.                                                                                                                    |              385142784 |

## Normal commit hooks

Implementation commit: `8dc10bcdd2d0c5a3f2a20f57e1e3e6804670e3a7`, tree
`91a343445e70f7ae64fbbe69a26d91b07bf3efd0`. Its normal hooks passed under the
PM-approved untracked clone-local serial configuration. Parsed
[original](evidence/hooks-original.json.txt) and
[serial](evidence/hooks-serial.json.txt) merged configurations are otherwise
identical. Only `pre-commit.parallel` changed true to false, and lint changed
from `bunx eslint {staged_files}` to a serial loop invoking the same `bunx eslint`
on each matching path. The original lint has no flags. All seven staged names
were checked against `[A-Za-z0-9_./-]+` immediately before committing.

Format, lint, secrets, private nesting and agent message hooks passed. Tool-wiki
reported inactive because no external activation root is provisioned. Doc caps
and migration checks skipped because no matching files were staged. No hook was
bypassed. The [commit receipt](evidence/commit.receipt.json.txt) records exit 0,
peak 837079040 bytes. The local override was removed; checkout was clean.

## Exact committed production size proof

The [observer](evidence/measure-committed.mjs.txt) imports unmodified production
readCandidate and measureSizes directly. It selects committed blobs across all
six original WBS/shared roots using the unchanged 800-line ceiling, no pins, and
the retained external recovery policy. Policy SHA-256:
`3cff7523646c98f4b405c7aea21df6b913ce90f0c1f6545157007fc31f73a00c`.

Production source SHA-256:

- `size-ratchet.ts`: `3e1d22d2bd3b52f1e7b98879e4f831858949501b8f1a213181c13f51f3b0c216`.
- `read-candidate.ts`: `b0eae510766c23dad0256715680248fb75e8713599e837323ee20612bafe2772`.

The observer requires successful production outcomes, exactly one selected base
finding, no selected candidate finding and exact equality of every unrelated
finding. This is a direct production rule proof, separate from installed CLI
admission, full F7 orchestration and all-rule surveys.

| Selection                                                                                                                   | Observed production outcome                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base `8ceba735` versus implementation `8dc10bcdd`                                                                           | [Comparison](evidence/sizes.json.txt): 30 to 29 findings, exactly the selected field removed; exit 0, peak 405929984 bytes. The initial command selected HEAD; readCandidate resolved and recorded the exact full implementation SHA/tree.                |
| Committed oversized restoration `60a837da844b00a5e5d5dfe2f9fee47f0109f0b0`, tree `7e4ccf43687266323301833dd49c02984dd0dc84` | [Production outcomes](evidence/sizes-fault.json.txt) and [assertion failure](evidence/sizes-fault.log.txt): selected 1125-line finding returned; same assertion failed with `selected reference-set-field finding remains`, exit 1, peak 395419648 bytes. |
| Exact good implementation SHA selected again                                                                                | [Restored comparison](evidence/sizes-restored.json.txt): 30 to 29, unrelated findings identical; exit 0, peak 358330368 bytes.                                                                                                                            |

The disposable fault worktree `/tmp/wbs-f7-reference-fault-oct17` restored only
the base field. Its normal commit hooks passed (peak 877232128 bytes); its local
configuration only set `parallel: false`, retaining the original single-file
lint command and every other merged hook field. That override was removed and
the worktree detached back to exact good `8dc10bcdd`; clean status was observed.
The unpublished proof branch retains the immutable fault. Production source in
the main implementation clone never received the oversized restoration.

The exact restored-positive command was:

```sh
bun /tmp/reference-measure.mjs /tmp/wbs-f7-reference-oct17 8ceba735235b431a237f3ee3aacc06053d4bbabf 8dc10bcdd2d0c5a3f2a20f57e1e3e6804670e3a7 /tmp/directory-f7-consumer/policy.json
```

Installed full F7, all-rule preservation, browser acceptance, fresh frozen
installation, full lint/typecheck and immutable hosted gate remain pending. The
predecessor's installed evaluator exceeded the laptop 900 MiB watchdog before
returning a base report; no installed evaluator retry is planned here. On h2puni
the full gate must use `bin/h2puni-gate.sh <sha>`.

WBS100 `02d9313b-d484-4cf1-9485-f71fe81c0fdf` remains `blocked_by_proxy`.
No publication, WBS mutation, certification or closure is authorized or claimed.

## Evidence follow-up and remaining acceptance

This follow-up changes only the OpenSpec packet and retained receipts. Copied
log receipts trim surplus EOF blank lines only; original command logs remain
untouched in `/tmp`. The initial docs commit surfaced those blank lines in
`git diff --check`; the cleanup preserves all observed output and source bytes. The
implementation's frontend source must remain identical. Hosted obligations stay
unchecked in tasks.md; the change is not archived or synced. The source
extraction and limited production size proof constitute progress only.
