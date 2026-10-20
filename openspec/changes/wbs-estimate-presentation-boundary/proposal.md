## Why

The 1095-line estimate column exceeds the unchanged 800-line frontend F7 ceiling.
Rolled trio, result, assignee and detail presentation share a file with cell
hooks, keyboard editing and unfolded columns.

## What Changes

Move rolled trio presentation into RolledEstimateTrio and the result/assignee/list/
detail fragment into EstimatePresentation in adjacent `estimate-presentation.tsx`.
Move ASSIGNEE_SLOT_PX and QUIET_TRIO_PX with their public exports forwarded through
`estimates.tsx`. Keep the outer cell, CellInput, hooks, typing, readings, header
and unfolded columns in place. Both production files remain below 800 lines.
The PM approved this bounded extraction boundary.

## Non-Goals

No behavior, DOM wrapper, styling, wording, keyboard, write or policy changes.
No publication, WBS mutation, deployment, certification or WBS100 closure.

## Constraints

Start at reviewed reference successor `ee750cb7070eb06d4b828eba7ccb3ddf16ae2d0b`
in a new isolated clone. Preserve callback-time live.current reads, card-only
readStepNode evaluation, missing-focus-target throws and exact DOM fragments.
Run focused checks serially below the laptop 900 MiB watchdog after the PM
releases the memory lane. Direct committed production size proof must remove
only the selected finding and reject a committed oversized restoration.
Installed full F7 and all hosted acceptance remain separate obligations.

## Capabilities

### New Capabilities

- `estimate-presentation-boundary`: compatible estimate column extraction.

### Modified Capabilities

None.

## Domain Terms

None. Existing estimate, trio, result, assignee and detail terms retain meaning.

## Decisions Recorded

None. This reversible extraction applies the existing size ceiling.

## Impact

The estimate column, one adjacent presentation module and this change packet.
No dependency or migration changes. WBS100 remains `blocked_by_proxy`.
