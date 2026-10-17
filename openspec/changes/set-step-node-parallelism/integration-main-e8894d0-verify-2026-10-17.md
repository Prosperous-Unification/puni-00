# Pinned-main integration and browser refusal compatibility

Integrate pinned public main `e8894d01459b2f6bf64c967218269508ec732f64` with reviewed
local integration `f5a53f72a91479ab9641282b51dce7d21fc441c2`, preserving both histories.
Keep the four reviewed source tips and their original 40-commit union. Verify the
combined saved-plan, chart and settings behavior, then repair the concrete browser
refusal compatibility gap found by scoped typechecking. Public release and the
full exact-SHA gate are separate work.

## Merge and scope

Normal merge commit `a13f0d9b076cf102dd900698d6d4f9eab476ab68` has those two parents
and tree `08b49a6d5a686bbc307dd6a18fdab167fea79c13`, exactly matching Astra's clean
merge-tree preview. The sole common-base overlap was `CONTEXT.md`; the new Lane
stack term preserves the prior glossary. No backend/core/shared HTTP source was
changed by main. Its saved-plan callback/reconnect contract matches the existing
`saved_plans_changed` event and sparse differences remain in the capacity category.

Normal installed merge hooks checked all **70** selected source paths, with exact
argv coverage and unchanged source/index hashes. They passed at a measured
1400 MiB ceiling, peak **1356988416** bytes. The clone-local one-path lint wrapper
retained every installed hook group, command selection and boundary rule. Its
reviewed local override was removed after the merge.

## Qualified checks

[Evidence](evidence/integration-main-e8894d0-2026-10-17) contains 49 compressed
artifacts. `manifest.json` records their compressed/uncompressed SHA-256 and raw
length; `commands.json` records 16 exact qualified invocations, environment, working
directory and process-tree memory ceiling. All heavy processes ran serially.

| Selection                                               | Observed result                            | Ceiling MiB | Peak bytes |
| ------------------------------------------------------- | ------------------------------------------ | ----------: | ---------: |
| Saved plans, reconnect, stream, save/list/compare/panel | 126 tests, 7 files passed                  |         900 |  869367808 |
| Gantt panel                                             | 305 tests, 1 file passed                   |        1800 | 1717317632 |
| Gantt detail and bar labels                             | 19 tests, 2 files passed                   |         900 |  643489792 |
| Project/optimization settings and busy state            | 48 tests, 3 files passed                   |        1400 | 1044815872 |
| Plan toolbar                                            | 34 tests, 1 file passed                    |        1800 | 1607614464 |
| Steps and priorities                                    | 71 tests, 2 files passed                   |        1400 |  922157056 |
| Presence and keyboard sheet                             | 45 tests, 2 files passed                   |        1400 |  874930176 |
| Backend sparse saved-plan capture/diff/export           | 250 tests, 11 files, 809 assertions passed |         900 |  569860096 |
| Fixed production frontend typecheck, 27 entry files     | exit 0                                     |        1400 | 1342148608 |
| Fixed plan-writer module typecheck, including tests     | exit 0                                     |        1400 |  873652224 |
| Restored plan-writer regression                         | 14 tests, 1 file passed                    |         900 |  852664320 |

The first seven rows cover **648** tests across **18 distinct frontend files** on
the clean merged tree. They were not repeated after the refusal-only fix below;
the relevant writer regression and both scoped typechecks ran on the final
restored source bytes. These are focused checks, not full application suites or a
repository-wide typecheck. All-change and selected strict OpenSpec validation and
the existing Step migration/down pair lint passed; main adds no migration.

## Compatibility fix and R5 proofs

The initial 27-entry typecheck exposed two TS2345 failures: step removal and
project commands had no exhaustive `referenced_by_step_parallel` decoder arm.
The consumer blob was identical at `f5a53f72` and `a13f0d9b`; this was a missed Step
consumer already present before the main merge. It would throw at runtime when
those existing routes met retained sparse facts.

The bounded repair adds the two explicit cases and one readable preservation
sentence. Exhaustive unknown handling remains. A refusal returns `refused`,
announces once, retries nothing and releases busy. It adds no refresh obligation;
requests completed earlier in the gesture retain their existing rereads. Shared
response node details remain unchanged. No sparse editing control or public writer
is enabled. Proposal, delta scenarios, tasks and `verify.md` record this behavior.

Three new real PlanWriter tests first failed at the exhaustive boundary while
11 existing cases passed. GREEN passed all 14. Independent production omissions
then removed the step case, command case and sentence; respectively **1, 2 and 3**
tests failed for the expected boundary/wording diagnostic. The proof runner
restored exact pre-comment source bytes. Adjacent Proof comments were added only
after those observed faults. The final restored 14-test control and both scoped
typechecks passed; final source hashes and the distinct mutation restoration hash
are retained separately. Astra reviewed the semantics and all three diagnostics
with no P0–P3 finding.

## Excluded attempts and limits

The default 900 MiB normal merge hook run was killed at 943738880 bytes; its
partial selection is excluded. Combined layout runs exceeded 900/1400 MiB, and
isolated Gantt/toolbar runs established that each needed more than 1400 MiB.
After fresh RAM measurement and authorization, their isolated 1800 MiB runs passed.
The presence/keyboard pair and scoped frontend typecheck also had 900 MiB
refusals; their qualified retries are recorded above. Resource kills establish
no semantic test result.

An initial test preparation used the wrong working directory. A direct-Bun
Vitest invocation then stalled before test results; its validated process group
was terminated with SIGTERM and a host `/proc` scan confirmed no descendant
remained before the canonical `bunx` retry. One RED invocation doubled the config
path and failed at startup; the corrected canonical RED is the qualified proof.
All such attempts are retained and excluded from passing counts.

Browser/pixels checks were not run in this slice. Chromium was available, but
work prioritized the discovered build blocker and final verification after the
bounded unit/type resource retries, as directed by the PM. The full host gate,
broad suites/build, public push and deployment remain unrun. Original imported
raw historical evidence bytes, including their documented trailing whitespace,
were preserved. This slice's new source/artifacts pass whitespace and format checks.

Normal hooks on the final fix/evidence commit, its exact containing SHA/tree and
the mode-0600 complete-history bundle verification are recorded in the external
final delivery receipt because they name the containing commit.
