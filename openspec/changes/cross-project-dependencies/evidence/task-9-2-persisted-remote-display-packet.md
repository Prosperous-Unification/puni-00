# Task 9.2 bounded persisted remote relationship display/navigation

2026-10-22. Base: `12b0208a77640010ab07bbdc8af7a83f92777137`.
Implementation and verification used isolated `/tmp/puni-persisted-remote-display`;
additional mounted faults used a separate `/tmp/puni-remote-display-proof` clone.
No shared-tree edits, deployment, semantic activation or external write occurred.

## Delivered boundary

`PlanRead` retains the shared connected response, and `dependencyViewsOf` merges
captured incident relationships with existing typed relationships by stable ID.
Only foreign endpoint views carry their exact captured project/work-item/step,
revision, label and reference evidence. Desktop/phone words use that evidence;
remote IDs never enter the local row/step lookup branch. Older local reads keep
their existing interpretation.

Desktop dependency cards and phone sheets link foreign endpoints using captured
`projectId`, `workItemId` and, when present, `stepNodeId`. Abbreviations and numeric
addresses are labels only; navigation performs no address lookup. Null references
use captured work-item and step words without inventing a reference. A delivered
abbreviation change refreshes the label without changing the target.

`workItem` links select/focus a stable row after the correct project's tree read,
expand collapsed ancestors, preserve unrelated query parameters, and visibly
refuse an absent target. Existing step links keep precedence and consume the
companion work-item parameter. A wrong project's table leaves the URL untouched;
the project page clears the companion parameter when refusing an inaccessible
project link.

Foreign endpoint relationships are excluded from local chart arrow input. Local
relationships retain their existing chart path. The mounted Gantt remains drawn
with a real local bar while no foreign row/arrow is invented. Missing captured
calendar availability still leaves the relationship and navigation inspectable.

Persisted remote Edit opens explicit read-only captured details instead of
claiming its predecessor was removed. Persisted remote scope editing is a separate
follow-up. The existing new-selection Customize implementation is unchanged.

## Verification

Commands ran from `apps/wbs/fe-01` unless stated otherwise:

- Initial TDD: `TZ=UTC bunx vitest run src/components/wbs/persisted-remote-dependencies.test.tsx --maxWorkers=1 --no-file-parallelism` failed all four initial cases before implementation: missing remote display/navigation and absent work-item focus. [Output](persisted-remote-display/initial-red.log.txt).
- Restored final focused run: the same command passes **13/13** cases. It covers desktop/phone labels, exact links, null references, delivered rename, captured details on both surfaces, local chart preservation, missing-calendar inspectability, work-item focus/refusal, collapsed ancestors and wrong-project/unrelated query preservation. [Output](persisted-remote-display/restored.log.txt).
- Regression: `TZ=UTC bunx vitest run src/components/wbs/persisted-remote-dependencies.test.tsx src/lib/wbs-api.test.ts src/components/wbs/typed-dependency-editor.test.tsx src/components/wbs/plan-chart-input.test.ts src/components/wbs/plan-cells.test.tsx src/components/wbs/plan-dependencies.test.tsx src/components/wbs/depends-card.test.tsx src/components/wbs/project-page.test.tsx --maxWorkers=1 --no-file-parallelism` passes **485/485** in eight files. This run preceded the final collapsed-ancestor refactor and additional missing-calendar case; the final 13-case run verifies those changes. [Output](persisted-remote-display/regressions.log.txt).
- Root frontend TypeScript: `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json` passes. [TypeScript/lint/format receipt](persisted-remote-display/checks.log.txt).
- Root scoped ESLint covers all twelve changed frontend files. An initial run lacked the Nx graph; `NX_DAEMON=false bunx nx graph --file=/tmp/remote-display-graph.json` generated it, and final lint has no missing-graph skip.
- Root Prettier checks all changed source and packet Markdown; `git diff --check` checks whitespace.

Vitest emits the existing Vite native-config `__dirname` warning. No application
warnings/errors occur in restored output. Full frontend zoned/browser suites,
module typecheck loop, full repository format/OpenSpec/CI checks and the exact-SHA
host gate were **not run** in this bounded packet. This is not a release or deploy
gate claim.

## Watched production-path faults

Each source was restored in a `finally` block before green verification. Each
linked log includes the exact injected source change, command and failing test.
Adjacent `Proof:` comments record only observed negatives.

| Fault                                                                                                  | Observed failure                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Classify all captured endpoints as local](persisted-remote-display/captured-transport.log.txt)        | Desktop and phone remote rows enter local lookup and throw `Unknown dependency work item remote-row`.                                                                             |
| [Bypass captured label branch](persisted-remote-display/captured-label.log.txt)                        | Null-reference mounted case throws on the absent local `remote-row`.                                                                                                              |
| [Navigate with abbreviation instead of project ID](persisted-remote-display/stable-navigation.log.txt) | Both mounted href assertions receive `project=REMOTE` instead of `project=remote-stable`.                                                                                         |
| [Remove foreign chart input filter](persisted-remote-display/local-chart.log.txt)                      | Production adapter admits `external` beside the expected `local` relationship.                                                                                                    |
| [Remove the same filter with Gantt mounted](persisted-remote-display/mounted-local-chart.log.txt)      | The real local chart bar disappears into the chart fault boundary. An initial outer-region-only assertion stayed green; requiring a real rendered bar made this oracle breakable. |
| [Skip work-item focus branch](persisted-remote-display/work-item-focus.log.txt)                        | Mounted target name never receives focus.                                                                                                                                         |
| [Silence absent work-item refusal](persisted-remote-display/work-item-refusal.log.txt)                 | Mounted view exposes no required alert.                                                                                                                                           |
| [Bypass project ownership](persisted-remote-display/work-item-project.log.txt)                         | Another project's stable link is consumed instead of remaining untouched.                                                                                                         |
| [Disable desktop captured-details branch](persisted-remote-display/captured-details.log.txt)           | Required captured-details dialog is absent; local missing-predecessor state appears.                                                                                              |
| [Disable phone captured-details branch](persisted-remote-display/phone-captured-details.log.txt)       | Phone required captured-details dialog is absent; local missing-predecessor state appears.                                                                                        |

## Remaining task 9.2 scope

Task 9.2 remains unchecked. Persisted remote scope editing, terminal boundary
certificate/retained-Fast/same-question Retry behavior, abbreviation settings
integration and the remaining connected frontend/live/readiness/browser and
activation obligations are not completed by this packet. Prior packet evidence
continues to own structured schedule unavailability.

## Review corrections — 2026-10-22

Independent review of `cda5ab4ef580842c4d6f0aaca86104fedadb0d26` found two
bounded defects. A non-null descendant selector's qualified reference is its
parent work-item address, so returning it alone hid the chosen step and scope.
Captured details also lacked the existing editor's focus and keyboard contract.
Both corrections restore the specified display/navigation boundary; they add no
remote scope editing or task 9.2 completion claim.

The mounted descendant fixture now follows the actual connected producer:
`scope:'descendant-step'`, `isLeaf:false`, captured remote step metadata,
`qualifiedReference:'REMOTE.080'`, `stepReference:null`, and `stepNodeId:null`.
Desktop chip/accessibility words, phone labels and both details dialogs retain
`REMOTE.080`, `Remote development step`, and `all descendant work items`.
The link still targets the stable remote project/work-item pair without a
fabricated step-node address.

The read-only dialog uses the existing editor presentation hook, focuses its
Back button on entry, and intercepts Escape/ArrowLeft with a native listener
removed by ref cleanup. Both keys call the existing desktop/phone close
callbacks, which restore dependency-search focus. No editable control is present
in this read-only dialog; ArrowLeft therefore retains its existing Back meaning.

Verification of the correction:

- Eight newly added mounted cases failed on the original packet while its prior
  13 tests stayed green. [Initial red](persisted-remote-display/review-corrections/initial-red.log.txt).
- `TZ=UTC bunx vitest run src/components/wbs/persisted-remote-dependencies.test.tsx src/components/wbs/typed-dependency-editor.test.tsx --maxWorkers=1 --no-file-parallelism --testTimeout=30000 --hookTimeout=30000`
  from `apps/wbs/fe-01` passes **38/38**: 21 packet mounted cases and 17 existing
  editor cases. [Restored output](persisted-remote-display/review-corrections/restored.log.txt).
- Frontend `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`, scoped ESLint
  of the three changed frontend files, scoped Prettier and full correction
  whitespace checks pass. [Check receipt](persisted-remote-display/review-corrections/checks.log.txt).
- An initial React key handler on the dialog container failed accessibility lint.
  The final native listener follows the established editor approach and passes
  lint without a suppression. No browser geometry was run; adding the existing
  presentation hook is not a new measured browser-layout claim.

Four independent production-path mutations in the separate proof clone each
failed both desktop and phone tests, then the production source was restored:

| Injected fault                                                                                                   | Observed failure                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Bypass descendant selector formatting](persisted-remote-display/review-corrections/descendant-selector.log.txt) | Chip/phone accessible names lose remote step and descendant meaning despite a non-null captured reference. |
| [Remove entry focus](persisted-remote-display/review-corrections/details-focus.log.txt)                          | Back is not focused after actual desktop keyboard entry or phone Edit activation.                          |
| [Exclude Escape from dismissal](persisted-remote-display/review-corrections/details-escape.log.txt)              | Both captured dialogs remain mounted after Escape.                                                         |
| [Exclude ArrowLeft from dismissal](persisted-remote-display/review-corrections/details-arrow-left.log.txt)       | Both captured dialogs remain mounted after ArrowLeft.                                                      |

Each log records its exact mutation and Vitest command with the configured
30-second test/hook limits. Adjacent `Proof:` comments name the observed faults.
The full eight-file regression and repository/host gates were not rerun for this
correction; earlier evidence remains historical to its stated snapshot. Task 9.2,
production activation, persisted scope editing and terminal certificate/Retry
remain open as stated above.
