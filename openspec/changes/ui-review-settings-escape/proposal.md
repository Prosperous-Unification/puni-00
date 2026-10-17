# Escape in a settings field stays in its field, and the phone ladder names its numbers

## Why

The Fable review of #509 (puni-plan `ui-review/reviews/509-settings-busy.md`, probes P3b, P7, P9)
found three defects in how the settings modal (decisions D7, D8) answers Escape. Escape in a
read-only Priorities or Estimating box while its write travelled put the pre-write values back, so
the landed ladder then showed as an unsaved draft under the red "has an unsaved edit" line (F-110).
Escape in a field over a hold that was only travelling, and a refused write sent again, put that
red line under `Saving Priorities…` (F-111). Escape in one section's field while another section
held a refused draft jumped the modal to that section with the red line and took the focus (F-112).
Round 5 and 6 also found that on a phone the ladder's wrapped header stood over band 1's name, so
no band's numbers had words (F-148), that Estimating's and Steps' radios shrank to 13–15 px beside
two-line labels (F-157), and that in the dark palette a locked radio was a hollow ring beside a
filled live one (F-158).

## What Changes

- Escape in a group box (ladder, PERT weights) does nothing while the group's write travels.
- Escape in a field never refuses a close or switches section; with nothing held it still closes.
- A hold that is only travelling is waited out quietly by every close request, and the refusal
  sentence names only a section holding something that can be finished or cancelled.
- Below 640 px the ladder header is not drawn; each band's number line says `Starts at` and
  `Writes` beside its boxes.
- Every radio outside the plan grid is drawn by the palette, one ring-and-dot shape: enabled in
  `--foreground`, disabled in `--muted-foreground`; radios do not shrink in a flex row.

## Non-goals

- No change to be-01, to the commit model (D7), to Put back (D8) or to checkboxes.

## Impact

`apps/wbs/fe-01`: `components/wbs/{project-settings-modal,priorities-panel,estimating-panel}.tsx`,
`styles.css`, the tests beside them, `e2e/settings-vocabulary.spec.ts`. The
`ui-review-header-settings` delta's 375 px header clause now points here.
