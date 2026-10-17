# Reviewed local integration, 2026-10-17

Integrate four reviewed complete histories on aggregate base
`b0a0f50a82f3ecdf479565e743d4c065b8c73661`, preserving commit ancestry and the
aggregate's extracted owners. This is a local integration candidate. Public push,
deployment and the full host gate are outside this slice.

## History and composition

| Import                           | Verified tip                               |
| -------------------------------- | ------------------------------------------ |
| Inspector and shared validation  | `2063dd9ac5a646bdeba33869769a0481257f2853` |
| Organization preflight           | `a0ed2adf9eb93bd64e9f9d5cde5c0adb174bca16` |
| Step parallelism                 | `543944219d8417e2487e73434c05bb1a9067203e` |
| Retained compiler and derivative | `c7a9f670c9c2decc4896fefa18a576586156fb79` |

All four bundles reported complete history. Inspector fast-forwarded from the
base; organization, Step and compiler histories were merged in that order, with
no cherry-picks. All four tips are ancestors of source integration commit
`49655836a287acaf844f6dc63bb51c94c4e5a2e7`; their union contains exactly **40**
commits beyond the base. The shared validation ancestor is retained once.

Step merge `990a14818306349b9281c633bc3b02b7caf2f051` resolves the two textual
conflicts by retaining `memory-stores.ts` and `plan-document-values.ts` as the
extracted owners. Sparse table ownership, initialization, replacement and store
binding moved into the first; the required sparse reader and export refusal
variant moved into the second. All 14 overlapping paths were inspected, including
boot, glossary, command scopes, work-item refusals and contracts. Astra review
found no P0–P3 semantic issue.

Compiler merge `49655836a287acaf844f6dc63bb51c94c4e5a2e7` required no textual
resolution. Astra independently checked the preserved blob union, sole glossary
overlap and pinned compiler/license/notice hashes, with no P0–P3 findings. WBS
source bytes did not change in this merge.

## Qualified observations

Raw output, scoped configs, hash snapshots, exact selected-path manifests and the
RSS guard are compressed under [evidence/integration-2026-10-17](evidence/integration-2026-10-17).
Its manifest records the uncompressed and compressed SHA-256 of every gzip member.
The adjacent `commands.json` records exact qualified command arguments, environment
settings, working directory and memory ceiling.
Each command used one guarded process tree; default ceiling was 900 MiB. Raised
ceilings below followed measured refusals, fresh available RAM and PM permission.

| Check                                                            | Observed output                                              | Peak bytes |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | ---------: |
| Step memory/SQLite, saved-plan and export focused run            | 236 pass, 0 fail, 748 assertions, 11 files                   |  597528576 |
| Mounted sparse refusals and organization preflight               | 85 pass, 0 fail, 675 assertions, 7 files                     |  611868672 |
| Composed WBS sparse/capture/export/installed-drain selection     | 149 pass, 0 fail, 1313 assertions, 7 files; 234 filtered out |  827248640 |
| Compiler derivative                                              | 36 pass, 0 fail, 61 assertions                               |  500912128 |
| Inspector, including installed executable                        | 18 pass, 0 fail, 254 assertions; 1400 MiB ceiling            | 1308905472 |
| Shared validation/evidence selection                             | 22 pass, 0 fail, 80 assertions                               |  202686464 |
| Scoped tooling typecheck, six entry files                        | exit 0                                                       |  357359616 |
| Scoped manual-owner typecheck, four entry files                  | exit 0                                                       |  895815680 |
| Scoped organization typecheck, four entry files                  | exit 0                                                       |  245911552 |
| Fresh Nx graph                                                   | exit 0                                                       |  344657920 |
| Step migration/down pair lint                                    | exit 0                                                       |     434176 |
| OpenSpec 1.12.0 `validate --all --json` on composed source       | exit 0                                                       |  138326016 |
| Nx `twilight-burokrat:build:compiler-derivative --skip-nx-cache` | exit 0; explicit target executed                             |  302895104 |
| Production `readCompilerDerivative` on Nx output                 | manifest, executable, license and notice verified            |   43220992 |
| Normal Step commit hooks                                         | 132/132 selected source paths; exit 0, 1400 MiB ceiling      | 1436000256 |
| Normal compiler commit hooks                                     | 45/45 selected source paths; exit 0                          |  828776448 |
| Additional inspector/organization/shared lint                    | 13/13 paths; exit 0, 1400 MiB ceiling                        | 1018511360 |

The three lint manifests partition all **190** added/modified source paths beyond
the base, with no missing, extra or duplicate paths. Each path ran through the
installed real graph-backed `bunx eslint`. Source and index hashes were checked
against snapshots. Typecheck entry lists import their dependency programs; these
are scoped checks, not a full repository typecheck. The explicit build produced
an ignored derivative artifact under the Burokrat project `dist/` directory.

## Hook proofs and disqualified attempts

Canonical Lefthook was installed. An ignored clone-local override serialized
pre-commit jobs and replaced only `lint.run` with the reviewed wrapper. Every
tracked group, command, glob and exclusion otherwise matched after complete
normalized config equality. The oracle rejected extra `skip`, extra group and
missing-job faults. The wrapper recorded original argv, deduplicated coverage,
each fresh one-path process and its exit; empty selection exits 64 and the first
failure propagates. Its harness checked ordered coverage, duplicates and
first/middle/last failures, then failed when error/empty guards were removed.

A real staged unused variable `integrationHookLintFault` failed installed
`@typescript-eslint/no-unused-vars` through normal pre-commit, exit 1, peak
1464066048 under 1400 MiB. Source and index were restored exactly before the
successful normal commits. Both temporary overrides were removed after their
commits. No hook was bypassed. Tool Wiki explicitly reported inactive,
`certified:false`, because no external activation root is provisioned; this
establishes no trusted activation.

Earlier whole-selection hooks exceeded 900/1400 MiB; a 1024 MiB V8 heap retry
aborted before the injected diagnostic. Four-path wrappers also exceeded
900/1400 MiB. None qualifies as a lint proof. One restored commit was launched
before the heap-abort log was fully inspected, then interrupted without a commit.
A prior positive traversal survived a pause in an opaque tool session; it was
terminated with exit 130 after detection. It briefly overlapped the first batch
of the successful normal Step commit. Its rows and interrupted receipt are
excluded; the successful commit's reset manifest supplies the qualified coverage.

The combined compiler/inspector/shared process exceeded 900 MiB at 959528960
bytes; inspector alone also exceeded it at 954880000. Separate qualified runs
above supersede those partial attempts. Additional lint exceeded 900 MiB at
954703872 before its complete 1400 MiB retry. Initial frozen install refused its
temporary directory with EROFS; explicit `/tmp` Bun temporary/cache directories
made the frozen retry pass. These failures remain in the evidence packet.

## Limits

Imported raw historical `.txt` evidence contains trailing whitespace: the whole
imported diff's whitespace check exits 2. Those bytes were preserved. The four
manual resolution files pass whitespace and Prettier checks and contain no
conflict markers. Source integration had a clean index/tree and no unresolved
entries when its ancestry receipt was recorded.

The full exact-SHA h2puni gate, repository-wide typecheck/test/lint/build, browser
suite, public push and deployment were not run. Source-slice R5 histories were
preserved; this integration did not repeat every historical mutation. Normal
hooks on the evidence-only follow-up commit and final complete-history bundle
verification are recorded in the external final delivery receipt, since that
receipt names the containing commit.
