# Compiler derivative prerequisite verification

Intent: expose actual compiler-options paths substitution attempts before compiler candidate IO so retained admission can eventually reject escaping wildcard candidates without host-probe inference. Build a separate digest-pinned TypeScript 6.0.3 derivative with explicit shared-helper origins and a synchronous, observation-only callback. Preserve compiler normalization, attempt order and stop-on-success behavior. This slice does not integrate retained extraction, admit wildcard roots, authenticate runtime ownership or establish complete evidence. No network installation or installed compiler mutation is permitted.

Decision: [ADR 0055](../../../docs/adr/0055-observe-paths-attempts-inside-the-pinned-compiler.md).

Base: `1e4a82a3cb11cfdabde3c50a791f5dd175099136`.

Preparation: byte-identical donor bun.lock checked with cmp against the physical donor
`/home/df/wd/puni/puni-00/.worktrees/shared-restore-activation-sol`; installed upstream executable
SHA-256 observed as `569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39`.

Checks pending serial heavy-lane permission: targeted RED/GREEN, independent R5 mutations,
format, lint, typecheck, OpenSpec validation and commit hooks. Required h2puni gate is unrun.
Retained extraction continues using the existing compiler; runtimeTrust remains unverified.

Static RED scaffold revision after Astra review:

- Resolution traces distinguish attempt, file, directory and read events. Both ordinary
  wildcard and explicit-extension observers throw; only the attempt may precede refusal.
- Separate subpath and bare-package types:index.d.ts fixtures exercise both typesVersions
  callers independently of compiler-options origin.
- The separate artifact writer/reader contract covers compiler.cjs, manifest.json, exact
  upstream LICENSE.txt and a modification NOTICE together. Each missing or altered member
  must refuse; the successful artifact loads the emitted compiler.
- Builder-path fault tests copy the actual build module and inject missing/duplicate helper
  sections or changed intermediate bytes after the input digest check. They invoke the real
  buildCompilerDerivative in an isolated process and require count/output refusal. During R5
  proof runs, removing each corresponding guard must make that negative test fail; restore
  and rerun afterwards. Generic replacement and reader tests are additional coverage.

No Bun/Nx commands or hooks have run during this revision. Production implementation and
all observed RED/GREEN/R5 results remain pending the serial lane grant.

## Observed completion of the bounded prerequisite

The earlier preparation/pending paragraphs describe the initial scaffold. The following
observations supersede their pending checks. [Saved evidence](evidence/compiler-derivative-2026-10-17)
contains the exact command output and the mutation runner plus RSS guard. All commands ran
serially in the authorized lane. The default process-tree RSS ceiling was 900 MiB; no network
installation occurred. The physical donor lockfile and pinned compiler input remained unchanged.

The new explicit `twilight-burokrat:build:compiler-derivative` target runs
`bun src/packaging/compiler-derivative-cli.ts` from its project directory. Its fixed output is
`dist/compiler-derivative`; that directory must be absent. The writer accepts an explicit new
directory and refuses overwriting an existing artifact. NOTICE preserves the upstream
ThirdPartyNoticeText.txt verbatim as its prefix and appends the modification notice. Both upstream
notice and complete NOTICE are pinned. Extraction does not import or load this artifact.

| Check                                            | Observation                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial scaffold RED, real upstream compiler     | 3 pass, 20 fail, exit 1; observer refusal lost and safe fallback returned; 254,902,272 bytes peak (`red.log`)                                                                                                                                                       |
| Manifest rebinding RED                           | Mutating the returned manifest admitted rebound identities; freeze added after observed failure. One malformed-shape table initially triggered Bun's done-callback timeout; table corrected (`manifest-red.log`)                                                    |
| Upstream notice RED                              | 33 pass, 3 fail; artifact omitted upstream notice and writers accepted absent/altered upstream notice (`notice-red.log`)                                                                                                                                            |
| Derivative GREEN                                 | 36 pass, 0 fail, 61 assertions, peak 543,006,720 bytes (`green.log`)                                                                                                                                                                                                |
| Final derivative + unchanged compiler regression | 75 pass, 0 fail, 142 assertions, exit 0, peak 636,104,704 bytes (`focused-final.log`)                                                                                                                                                                               |
| Explicit compiler derivative CLI                 | exit 0, peak 89,419,776 bytes; emitted output SHA-256 `47bffa39459dbbb0797606506c790af1420a983ed6bc1d3ca4945a64ee782559`                                                                                                                                            |
| Initial scoped ESLint                            | Style failures corrected; subsequent lint exited 0 but skipped module boundaries without a cached graph (`lint.log`)                                                                                                                                                |
| Nx graph then graph-backed changed-source ESLint | Both exit 0; graph peak 281,333,760, lint peak 763,940,864 bytes; no skipped rule warning (`graph.log`, `lint-graph.log`)                                                                                                                                           |
| Native TS7 project typecheck at 900 MiB          | Two guard refusals, peaks 954,310,656 and 944,205,824; neither is a typecheck pass (`typecheck.log`, `typecheck-bounded.log`)                                                                                                                                       |
| Narrow TS7 config for all three new source files | exit 0, peak 110,772,224 bytes (`typecheck-narrow.log`); scratch config removed afterwards                                                                                                                                                                          |
| Native TS7 project retry                         | After fresh RAM evidence and PM authorization, 1,600 MiB ceiling, GOMEMLIMIT=1000MiB, GOMAXPROCS=2: `bunx --no-install tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`, exit 0, peak 1,234,190,336 bytes (`typecheck-project.log`) |
| Hook installation                                | Normal `bun run tools/tool-git-hooks/src/install.ts`, exit 0 (`hooks-install.log`)                                                                                                                                                                                  |
| OpenSpec initial invocation                      | `bunx --no-install openspec` unavailable, exit 1; not a validation pass (`openspec.log`)                                                                                                                                                                            |
| Pinned cached OpenSpec                           | `bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate automatic-trusted-activation --strict --json`, then `validate --all --json`: both exit 0 (`openspec-selected.log`, `openspec-all.log`)                   |

## Watched R5 negatives

All twelve independent mutations exited 1 because their selected tests failed. The source was
restored in `finally`; the final focused GREEN ran after restoration. See `mutations.json`,
`mutations-run.log`, `mutations.py` and individual `compiler-r5-*.log` files.

- Input pin removal lost the input-specific refusal on altered upstream bytes.
- Exact occurrence guard removal made both builder missing/duplicate-section injections fall
  through to the output pin; their exact-count expectations failed.
- Builder output guard removal accepted altered intermediate bytes after verified upstream input.
- Verifier output guard removal accepted altered executable bytes with an unchanged manifest.
- Manifest shape guard removal changed the null case to TypeError. Manifest field guard removal
  admitted empty/extra fields and lost the manifest-specific rebound-digest refusal; the independent
  output hash still rejected altered executable bytes.
- Freeze removal let a returned manifest mutate subsequent verifier identities.
- Upstream license and upstream notice guard removals each let their isolated writer succeed.
  The license fixture includes valid upstream notice bytes. The earlier license log without that
  required fixture is retained as `compiler-r5-writer-license-disqualified.log` and is not a success
  proof: that run reached a missing-notice refusal instead.
- Artifact license and NOTICE guard removals each admitted its altered member. Separate final
  tests distinguish absent and unreadable members, with actual ENOENT/EACCES from filesystem IO.
- Observer removal temporarily repinned the altered compiler output so resolution was reached.
  Both wildcard and explicit-extension throwing-observer tests returned without throwing,
  demonstrating that the observation check protects actual compiler execution before fallback.

Astra-high reviewed the static transformation, both typesVersions origins, the artifact and
all mutation output. The upstream-notice omission and two proof precision issues were addressed;
reviewer reported no remaining code/proof findings and independently matched all five input,
license, upstream-notice, emitted-compiler and composite-NOTICE hashes.

Full h2puni gate, broader package build/tests, authenticated runtime ownership, retained wildcard
admission and complete resolution evidence were not run or established in this bounded slice.
No push, merge or deploy occurred. Normal commit-hook and bundle outcomes are recorded below.

Normal installed pre-commit, prepare-commit-msg and commit-msg hooks passed on the implementation
commit; peak 787,017,728 bytes under 900 MiB (`commit-hooks.log`). The tool-wiki hook explicitly
reported `inactive`, `certified:false`, because the external activation root is not provisioned;
its exit 0 establishes no trusted activation. Migration/doc-cap hooks skipped with no matching
files. No hook was bypassed. Final Astra-high verdict reported no remaining P0–P3 findings.
