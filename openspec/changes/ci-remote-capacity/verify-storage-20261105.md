# Storage CI source verification — 2026-11-05

This source checkpoint adds the unchanged whole storage test parent to its own
fixed CI leaf. The canonical host test command, ordinary test bodies, private
acceptance exclusion, existing source ownership and all limits remain unchanged.
It establishes source contracts; task32 still requires actual final-head capacity.

## Source and commands

Base: `5b7e7719c59ade962dbace7e4c857c33e4ae2b59`, on PR859's
`924adfc167fa1b93f68db3c1ec0ff80af5999c65`. The eight changed source/config
paths and their final SHA256 values are listed below. No dependency install ran;
the matching existing frozen dependency tree was used read-only.

The final four-file owning command ran from the isolated worktree:

```sh
umask 022
env -i PATH=/home/df/.bun/bin:/home/df/.volta/tools/image/node/24.20.0/bin:/usr/bin:/bin HOME=/home/df TMPDIR="$PWD/tmp/puni-delivery-evidence/20261105/storage-ci-leaf" /home/df/.bun/bin/bun test --no-env-file --config=/tmp/puni-initial-empty-bunfig.toml --preload ./tools/test/scratch/preload.ts tools/tool-git-hooks/src/hooks/ci-remote-tests.test.ts tools/tool-git-hooks/src/hooks/ci-capacity-workflow.test.ts tools/tool-git-hooks/src/hooks/ci-plan.test.ts tools/tool-git-hooks/src/hooks/pr-merge-base.test.ts
```

Exit0: **180 pass, zero fail, 2611 assertions, four files, 50.64s**.
Captured log SHA256:
`065243e03fa49ad37c99ea5948c3829459d21f57b172053111285bb50f90c99f`.
Initial genuine tiny-child discovery and workflow tests failed before implementation.
The owning suite covers canonical union/disjointness and future collision paths,
file/target refusals, storage69/69/one-file outer receipts, invalid/failed/empty
children, affected/full dispatch, matrix membership/execution and static ownership.

Configured uncached Nx typecheck/lint ran for both `tool-remote-scripts` and
`tool-git-hooks`. Both typechecks and remote lint passed; hooks lint initially
rejected the computed `delete` in the new plain-JSON test fixture. That single
statement became `Reflect.deleteProperty`, without disabling lint or changing
assertions. Configured uncached hooks typecheck/lint then both passed in5.1s.
Logs are `final-configured-statics.log` and `final-git-hooks-statics.log` in the
packet below. The full owning command above ran after that correction.

Final staged-document validation (`bun tools/tool-devsync/src/check-documents.ts`),
`openspec validate --all --json` (**333/333**), Prettier over all11 staged
paths, and `git diff --cached --check` passed before publication.

Normal commit hooks succeeded. The initial hook lint reported its cached Nx
project graph unavailable and skipped module-boundary checks; the configured
uncached Nx lint checks recorded above remain the evidence for that rule. The
Tool Wiki hook reported inactive because its external activation root is not
provisioned; it did not certify an activation. Migration/doc-cap hooks had no
matching changed paths. No full host gate ran.

## Physical R5 observations

Each accepted recipe ran a separate intact GREEN, one-fault RED, exact byte
restoration, and the same restored GREEN consumer. The driver retained original
mode and checked every scoped source hash before proceeding. Ten recipes ran;
S8a target-declaration deletion was optional and did not run. None timed out or
needed a signal. Adjacent `Proof:` comments describe the observed faults.

| Recipe | Removed or changed dependency         | Actual failed consumer and limit                                                                                  |
| ------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| S1     | Required storage owner entry          | Three owner refusal cases; grouped entry, not every generic filesystem predicate                                  |
| S2     | Raw storage target validation entry   | Three malformed target cases, first model dispatch; restored coverage spans all eight leaves                      |
| S3     | Storage route mapped to model         | Storage count receipt fails before union assertion; restored suite proves union/collisions                        |
| S4     | Exact storage rest exclusion          | Actual rest includes storage and fails the exclusion assertion; restored union is disjoint                        |
| S5     | Storage expected69 count entry        | First transformed68 receipt is accepted and fails the expected refusal; not every parser predicate                |
| S6     | Storage matrix member                 | Parsed workflow roster fails; no hosted scheduler or whole reducer execution inferred                             |
| S7     | Storage runtime mapping               | Actual runtime with controlled command recorder fails on affected dispatch; not actual Nx                         |
| S8b    | Selected remote target admission call | Actual installed Nx FULL storage falls back to canonical target, starts harmless child, fails no-marker assertion |
| S9     | Storage CLI allowed entry             | Valid storage input receives Unknown remote leaf; not an unknown-input security proof                             |
| S10    | Storage runtime allowed entry         | Affected storage dispatch receives Unknown partition; restored coverage includes full mode                        |

S8b's restored control refuses before the Nx child marker. The mutant records
`CANONICAL_FALLBACK_CHILD_STARTED` and successful harmless canonical execution;
this proves the admission dependency against the actual installed engine.
It does not qualify affected-mode fallback or every malformed target shape.

After the isolated Reflect fixture correction, a separate S8b addendum repeated
the same triplet: exit0/1/0, markerfalse/true/false, no signals, both captured
streams settled. The original ten-pair manifest and captures remain unchanged.
The final suite above followed this addendum.

The driver's first-summary parser is not a general outer-test census. Astra
independently read the raw final OUTER summaries for all30 original captures and
the three addendum captures, checked stream hashes, and verified restored source.
The source review and final addendum review reported no Critical or Important
finding. Their acceptance does not imply a full storage execution.

## Retained evidence

Private local packet: `tmp/puni-delivery-evidence/20261105/storage-ci-leaf/`.
It includes complete argv/environment and original capture hashes.

- Original manifest `r5-pairs/manifest.json`:
  `76462ddeff99e67fa4aa282c6c062731d13980b301d786267747a976423ab84d`.
- Actual driver `/tmp/puni-storage-r5-pair-20261105.py`:
  `d0265f72eea7ae29d95aa10935f54f7967494de0f5fd4b9645ea54a192885b53`.
- Reflect addendum `r5-s8b-lint-addendum/manifest.json`:
  `13b8464fb3e2c52016aebb3505c6a3f555bc14e697b2ad4183b0a1a1757fd6c0`.
- Final review `/tmp/puni-storage-ci-lint-addendum-final-review-20261105.md`:
  `7056eaf06c9845d3adf0d4180de8e187192b0a4cfc27858ec2826d15afdd4b76`.

These local evidence paths are not committed artifacts or promises of availability
on another host. The portable source, tests and this factual record are published.

## Final source identities

- `.github/workflows/ci.yml`: `322ee53e8ad5395b06151ef6a6eb00b40c40ccfbf1dec1f0b0b2f73459190a3e`.
- `tools/tool-remote-scripts/project.json`: `a5eb420ca6c510d6249372fa1802b5a2dfe8a74cf46e309b865a73546f444d4a`.
- `tools/tool-remote-scripts/test/ci-leaf.ts`: `371dfed6c45a850c35894026c386e4004edcb84b434507b41a6696a578312af6`.
- `tools/tool-git-hooks/src/hooks/ci-run-runtime.ts`: `8a2bb5c239accb1210f53a34ba3bcf91d55bc6a705b8eb45b4eabb9caf52f0c5`.
- `tools/tool-git-hooks/src/hooks/ci-remote-tests.test.ts`: `abf79302115eb69abb8f25c77d77f6eb94b9f887919a61ea88bf282166d9217d`.
- `tools/tool-git-hooks/src/hooks/ci-capacity-workflow.test.ts`: `b586508480ee40b24edfc1015eeab5e2f9814818766f918e35c3785d338bf3ed`.
- `tools/tool-git-hooks/src/hooks/ci-plan.test.ts`: `1bc9c77071d7a312af371a7f82deede21906a440d609e6aa7926c8605e357d66`.
- `tools/tool-git-hooks/src/hooks/pr-merge-base.test.ts`: `37bb034f3799f4a937a2149e9a3cd848ed697ed6c57b8936881ca4b5a9ad25a0`.

## Remaining qualification

No actual storage69 parent, rest parent, complete39 parent, Graph228 lifecycle,
whole matrix, required aggregate, final host gate, native acceptance or deployment
ran for this CI source checkpoint. Tasks21–24,28,32 remain unchecked. A prior
whole storage run on a different source ended65/4; two production owner-drop
failures remain unresolved and cannot be counted as capacity acceptance.
Fresh main also carries a newer dependency lock awaiting private integration.
No private grant is reused and architectural main adoption remains held.
