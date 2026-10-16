## Why

The installed F7 survey reports `use-plan-keyboard.ts` above the unchanged
800-line frontend ceiling. Its standing state and effects can move together
without changing the event handlers or navigation.

## What Changes

Move `usePlanKeyboardState`, `usePlanKeyboardEffects`, the default
`planIsActive` predicate and `ARM_WINDOW_MS`, with their exact JSDoc and proof
comments, into `use-plan-keyboard-state.ts`. Preserve both hooks and the public
timer constant through identity reexports from the original module.

The parent architect approved this bounded extraction before dispatch.

## Non-Goals

No keyboard behavior, listener lifecycle, caller, handler, navigation, policy,
backend or dependency changes. No certification or WBS100 closure.

## Constraints

Preserve runtime declarations byte for byte. Run focused Vitest suites serially
with one worker; no local browser, full Nx or full Burokrat. Remove the active
Plan guards and observe the hidden Board shortcut case fail; remove toast
cleanup and observe the arm toast case fail, then restore production. Compare
exact committed base/candidate F7 and complete hosted surveys with the retained
installed evaluator and unchanged policy, including an oversized committed fault.
Publication waits for independent Astra review by the parent PM.

## Capabilities

### New Capabilities

- `plan-keyboard-boundary`: bounded state/effect ownership with stable public exports.

### Modified Capabilities

None.

## Domain Terms

None; existing names and meanings are preserved.

## Decisions Recorded

None; the reversible extraction applies the accepted file ceiling.

## Impact

WBS frontend keyboard modules, one facade identity assertion and this change packet.
