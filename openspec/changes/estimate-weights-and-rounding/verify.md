# verify — `estimate-weights-and-rounding`

Slices 1–6 and 8.1 implemented. Every figure below was read off a run in this
worktree on 2026-08-30; what was not run says so, and one slice is blocked
rather than done.

## Commands

| Command                                                                                            | Result                              |
| -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `bunx nx run be-01:test`                                                                           | **1248 pass, 0 fail** (89 files)    |
| `bunx nx run fe-01:test`                                                                           | **1965 pass** (62 files)            |
| `bunx nx run-many -t lint typecheck test -p domain validation be-01 gw-01 mcp-01`                  | **Successfully ran** (5 projects)   |
| `bunx nx run fe-01:lint`                                                                           | **passed** (1 pre-existing warning) |
| `bunx nx run fe-01:typecheck`                                                                      | **passed**                          |
| `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts …/20260830130000_…/{migration,down}.sql` | exit 0                              |
| `bun apps/be-01/src/openapi/emit-openapi-cli.ts`                                                   | rewrote `openapi.json` (+93 lines)  |
| `CI=1 E2E_PORT_SHIFT=700 playwright test … gantt.spec.ts steps.spec.ts`                            | **53 passed, 1 skipped** (2.4m)     |
| `bunx openspec validate estimate-weights-and-rounding`                                             | valid                               |
| `bunx openspec validate --all --json`                                                              | no `valid: false` anywhere          |
| `bunx prettier --check` over every file this change touched                                        | clean                               |

**Not run**, and each is a real gap:

- **`nx run be-01:build`** — the build target needs `shellcheck`, which this
  machine's gate script (`bin/h2puni-gate.sh`) exits 127 on; the parent session
  ruled that script out for this run.
- **The whole browser gate.** Two of the three specs that draw estimate figures
  (`layout.spec.ts`, `hover-cards.spec.ts`) were open in another session's
  working tree all evening, so a run of them would have measured that session's
  half-finished edits rather than this change. `gantt.spec.ts` was also dirty
  when it ran green above — it passed, but it is that session's file. The
  numbers those specs assert are whole-day trios (`2/4/6`, `8/10/12`,
  `40/40/40`, `0/0/0`), which `ceil` leaves exactly where they were, and the
  53-test run says so for the chart.
- **A real browser at all for `EstimatingPanel`**, which is not mounted (8.2).

## Failure proofs (R5)

Every row was watched failing in this worktree today. The message is the one the
runner printed, not a paraphrase.

| Check                                                          | Fault injected                                                     | Observed failure                                                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| the drift snap runs before the rounding (`roundDays`)          | `snapWorkdays(days)` replaced by `days`                            | `does not mint a day out of a division's leftover bits`: `Expected: 1, Received: 2`                                                                   |
| a parent is charged what its children were (`rollUpFinals`)    | the fold taken back to `rollUp` + one `finalDays` at the parent    | `gives a parent the sum of what its children were charged…`: `Expected: 2, Received: 1`                                                               |
| the same, at the plan read (`tree`)                            | the same fault, through the service                                | `gives a parent the days its children were charged…`: `Expected: 2, Received: 1`                                                                      |
| the step is rounded, not the total (`rollUpFinals`+`finalsOf`) | `combinedDays` per step and a `Math.ceil` on the **sum**           | `rounds each step before summing them`: `Expected: 1, Received: 0.5`                                                                                  |
| an unreadable stored rounding throws (`toProject`)             | the `isEstimateRounding` throw replaced by `… ? … : 'ceil'`        | `refuses a stored rounding it does not know`: `Expected substring or pattern: /unknown estimate rounding/`, `Received: "(resolved without throwing)"` |
| unusable stored weights throw (`toProject`)                    | the `type.errors` branch removed and the triple cast               | `refuses stored weights that cannot average a triple`: same pair, `/unusable PERT weights/`                                                           |
| a triple that cannot average is refused (`ProjectService`)     | the `bad_pert_weights` check deleted                               | `refuses weights that cannot average a triple…`: `Expected: 422, Received: 200`                                                                       |
| the panel refuses `1e999` (`weightsOfDraft`)                   | `Number.isFinite(weight) && weight >= 0` replaced by `weight >= 0` | `refuses a weight of 1e999 rather than sending an Infinity`: `expected "spy" to not be called at all, but actually been called 1 times`               |

### One negative that was written, watched **passing**, and rewritten

`rounds each step before summing them` was first proved with the fault this
change is _about_ — `rollUpFinals` taken back to "roll the triples up, charge
the parent once" — and it **passed**. It had to: a leaf's steps were already
charged one at a time before this change (`finalsOf` summed `finalDays` per
step), so rolling the triples up first changes nothing at all on a leaf. The
order Dany asked for is only visible across **children**, and the fault that
test is actually about is the other order — charge the sum rather than the step.
Injected that way it failed on `Expected: 1, Received: 0.5`. The JSDoc on the
test says both halves out loud, and the parent case carries the roll-up fault.
**Inject the fault at the level the order lives at.**

## What is left: 8.2, the wiring, in two files

`EstimatingPanel` and `setEstimateArithmetic` are written, tested and unused.
Mounting them is these two edits, and neither is made here because the second is
in a file this change was forbidden to touch.

In `apps/fe-01/src/components/wbs/project-settings-modal.tsx`:

```ts
import { EstimatingPanel, type EstimatingPanelProps } from './estimating-panel';

export type SettingsSection = 'teams' | 'priorities' | 'steps' | 'estimating';
const SECTIONS = [ …, { id: 'estimating', label: 'Estimating' }];

export interface ProjectSettingsModalProps {
  …
  estimating: SectionOwn<EstimatingPanelProps>;
}
```

…destructured beside `steps`, and rendered as a fourth panel in the same
`hidden`-when-inactive shape the other three use, with the same
`onDirtyChange`/`onDone` wiring.

In `apps/fe-01/src/components/wbs/wbs-table.tsx`, beside the `steps={{…}}`
block at the `<ProjectSettingsModal>` call:

```tsx
estimating={{
  method: estimateMethod,
  pertWeights: chartRead.pertWeights,
  estimateRounding: chartRead.estimateRounding,
  setArithmetic: (arithmetic) => api.setEstimateArithmetic(projectId, arithmetic),
  onChanged: refreshOrMarkStale,
}}
```

`chartRead` is where `depReach` already comes from; the two new fields ride the
same tree read (`tree.pertWeights`, `tree.estimateRounding`), so whichever state
`depReach` is seeded into takes them the same way. After that the panel needs
one browser pass — the toolbar's `Plan with` and this section describe one
arithmetic, and only a real Chrome can say the two agree on screen.

## What this change did to work that already existed

- **Every project's numbers move on the release that carries this**, `ceil`
  being the column default. Intended; `docs/adr/0011-…` is the record.
- **Three identity differentials replay on `exact`** — the arithmetic their
  oracles were captured under — and each now asserts the weights and the
  rounding it replayed with, so a replay that quietly took the default would
  fail rather than measure the wrong thing. `withSnappedRollUps` snaps a
  **parent's** charged days to 1e-9 on both sides, because summing children's
  figures reassociates a double: one row in the 2026-08-13 corpus reads
  `8.166666666666668` where the capture recorded `8.166666666666666`.
- **The six fractional-calendar tests** in `work-item.service.test.ts` run on a
  project that rounds `exact`, which is now the only arm a fraction reaches the
  calendar through. `snapWorkdays` and its proofs stay live because of it.
- **31 Project literals across 30 test files** gained the two new fields, by
  script and reviewed: the in-memory store holds what a test hands it, so a
  missing triple is a `TypeError` rather than a default.
