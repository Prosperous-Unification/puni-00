# Independent connected Fast/calendar round-one re-review

**Approved for the bounded integrated foundation. No remaining findings from the prior review.** This approves the ten exact hashes in `/tmp/puni-connected-fast-calendar-round1-manifest.json`, not full production 6.1/6.2 delivery.

I verified all ten manifest hashes, read the complete tracked diff against `d9deee3e0` and both new files, inspected the permanent tests and actual verification outputs, and independently reran the checks below. The actual worktree has exactly the three modified and two new files described in the handoff.

## Prior findings resolved

- **P1, shared settings parameter:** `schedule-parts.ts` now takes exactly the five consumed fields through `Pick`. The live `Project` caller compiles without a cast, invented timezone or weakened captured-project type. The new permanent test explicitly calls preparation with only those settings.
- **P2, live wrapper lint:** The resource actually delegates to shared preparation now. Removed imports are cleaned up and sorting is correct. Fresh uncached named ESLint passes on all five changed/new files.
- **Preparation ownership:** `schedule-slices.ts` owns the original slicing implementation and empty-deadline constant. `schedule-parts` imports that leaf module; the live resource imports preparation and preserves compatibility re-exports. The leaf imports domain runtime functions and an erased `WorkItem` type, so the new resource/preparation runtime cycle is gone. No duplicated arithmetic or broad resource refactor was introduced.
- **Knowledge placement:** The wrapper JSDoc now attaches to the wrapper. `ConnectedProjectGraph` correctly distinguishes authored unreduced contexts from held-reduced placement contexts without changing graph validation.

The slicing function's printed TypeScript syntax is identical to the original production implementation captured during the first review. Its adjacent proof comments moved with it. The five unchanged connected derivation/calendar/projection/test/saved-wrapper hashes preserve the previously reviewed behavior and mutation evidence.

## Evidence

| Independent fresh check                                            | Outcome                                                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| SHA-256 verification                                               | All 10 frozen files match                                                           |
| `bunx tsc --noEmit -p libs/wbs/application/core/tsconfig.lib.json` | Exit 0; original TS2741 is gone                                                     |
| Named uncached ESLint on all five corrected files                  | Exit 0, no findings                                                                 |
| `bun test` for schedule-parts, connected-plan and saved-plan-input | 77 pass, 0 fail, 694 assertions; `/tmp/puni-connected-fast-round1-review-tests.log` |
| TypeScript printer comparison of original/moved `slicesOf`         | Exit 0, unchanged syntax                                                            |
| `git diff --check`                                                 | Exit 0                                                                              |

The permanent 32-case preparation suite uses the actual memory source, real live `scheduleInput`, and actual saved-plan capture. It compares canonical bytes and display facts and also asserts concrete effort, widths, held membership, resource demand/capacity and parent calendar values. Thus it does not rely exclusively on comparing two wrappers that call the same helper.

I also inspected the worker's actual uncached module/core typecheck output, six-suite output (220 passing tests), named format/lint evidence and the repeated old-live/new-live/saved equivalence output (192 assertions). The permanent assertions plus unchanged function syntax and the prior independent before/after probe adequately cover this bounded extraction. There is no new production safety guard; the 21 foundation mutations need not be replayed merely for these ownership/type/import changes. Their prior independently observed diagnostic-only qualifications remain in `/tmp/puni-connected-fast-calendar-review.md`.

## Remaining scope

This approval supersedes the prior request-changes disposition **only for the corrected frozen foundation**. Runtime `readResolvedFast` capability wiring and irreversible snapshot-lifetime wrapping, real connected live selection, execution readiness/admission, optimization, historical connected export and activation remain open. The eventual live callback must invoke `snapshot.scheduler.readResolvedFast(input)` rather than bypassing lifetime checks with a bare domain function.

No full host gate, full build, installed live integration, release or deployment check was run in this re-review. No shared source, Git metadata, WBS or network writes were performed. Final integration and its required host gate remain root-owned.

## Durable artifacts

Referenced reports/proof outputs are retained in [task-6-fast-proofs](task-6-fast-proofs/). Probe/driver source is stored as text, not discovered tests. Log trailing whitespace alone was normalized. Initial failing, diagnostic-only and superseded observations remain classified in these reports.
