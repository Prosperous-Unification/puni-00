# verify — `priority-commit-polish`

Branch `change/priority-commit-polish`, cut from `main` @ `e0bfcef` (#41, #42,
#43 merged). fe-01 only — `wbs-table.tsx`, `live-editing.ts`,
`keyboard-bindings.ts` and the tests beside them. No be-01 change, no
migration, no API shape change, no gw-01 change; the wire is untouched.

## The gate

Run from the repo root on this branch, 2026-08-11.

| Command                                                | Result                                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                           | green, exit 0                                                                    |
| `bunx nx run-many -t test lint typecheck --parallel=2` | green, exit 0 — 21 projects                                                      |
| `bunx nx run-many -t test --skip-nx-cache` (counts)    | fe-01 **1110** in 45 files, be-01 **605** in 53; every project green, 21 targets |
| `bunx @fission-ai/openspec@1.3.0 validate --all`       | green — 27 items, 27 passed, 0 failed                                            |

fe-01 was 1106 before this change; the four added are the three Prio keyboard
tests and the field-level refusal test.

**`build` was not run on this host** — the standing rule and the `PreToolUse`
hook forbid local builds here; CI's `checks` job runs the full
`test lint typecheck build` gate and is the proof for `build`. `bun run e2e`
was likewise **not** run locally: the browser gate is CI's `pixels` job, and a
local run reuses whatever holds :3100/:3200/:4200 (the landmine
`gantt-calendar-axis` recorded). No local result is claimed for either.

## What moved

- **`wbs-table.tsx`, the priority column's `onKeyDown`.** A bare Enter — every
  modifier asked about first — calls `preventDefault` and
  `flushCell(e.currentTarget)`, then returns. The four routing calls
  (`onAltMove`, `onCommandKey`, `onTabKey`, `onArrowKey`) are unchanged and
  still see every other keystroke, `Ctrl/⌘ + Enter` included.
- **`live-editing.ts`, `LiveField.submit`.** One line —
  `heldRefusals.delete(this.cellKey)` — after rule 5's dedup and before the
  send. The dedup is deliberately above it: a resubmission of a request that is
  already out returns early and must not disturb the hold that request will
  set.
- **`keyboard-bindings.ts`.** A new `Editing / Enter in Prio` binding,
  `TABLE_ONLY`. The existing `Editing / Enter` entry is untouched, and that is
  the point: it is `EITHER_RENDERER`, and the cards renderer has no Prio cell,
  so a sentence about Prio inside it would be the drift the `renderers` field
  exists to prevent.

## Failure proofs (R5)

Every check below was watched failing with the named fault injected, on this
branch, 2026-08-11. Both product faults were reproduced as reds **before** the
fixes existed — the first two rows are those reds.

| Check                                                                      | Fault injected                                                                      | Observed failure                                                                               |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `sends what was typed on Enter, without waiting for the cell to be left`   | the whole Enter branch absent (the state on `main`)                                 | `expected [ { priority: 1 } ] to deeply equal []`                                              |
| `shows the draft just refused, not the one refused before it`              | `heldRefusals.delete(this.cellKey)` absent (the state on `main`)                    | `expected '1e999' to be 'urgent'`                                                              |
| `shows the newer draft, not the one it replaced` (`live-editing.test.tsx`) | the same line removed, with both patches parked so the window is explicit           | `expected 'Beta' to be 'Gamma'`                                                                |
| `sends one request for a priority entered with Enter and then left`        | the flush written as a direct `setPriority(row.original.id, e.currentTarget.value)` | `expected [ { priority: 4 }, { priority: 4 } ] to deeply equal [ { priority: 4 } ]`            |
| `leaves Ctrl/⌘ + Enter to the chord, which saves and moves on`             | the four modifier tests dropped from the Enter branch                               | `expected <input aria-label="Priority for 010" …> to be <textarea aria-label="Name of 020" …>` |

The abandon assertion at the end of the Prio refusal test — emptying the box
clears the held draft — is the pre-existing `leave()` delete and **not** a new
check; no fault was injected for it and none is claimed.

## The two faults, as they were seen

Both came out of the Group D cloud run against dev on 2026-08-11 (15/15 pass;
these were product bugs found alongside, not case failures).

**Enter sent nothing.** `1` typed into a Prio cell and confirmed with Enter
fired no PATCH and moved no date for 3+ seconds. Blur and Tab committed fine.
Cause: the column's `onKeyDown` routed a bare Enter to `onCommandKey`, whose
`commandChord` answers `null` for an unmodified Enter — so nothing at all
happened, in a cell whose only other confirm gesture is leaving it.

**A second refusal showed the first one's text.** `urgent` typed over a
previously-refused `1e999` blurred back to `1e999`; the stored priority
correctly stayed blank. Cause, and it is a timing window rather than a missing
branch: `setPriority` raises a toast for a value it refuses on its own
(`Number.isFinite`), React flushes that discrete update **inside the blur** and
before any microtask, `CellInput`'s ref callback is rebuilt by that render, and
`takeNode` restored the still-held _previous_ draft over the newer one. The
newer refusal then recorded the right text a round trip later, under a box
already showing the wrong one — where `sync` could not correct it, because rule
4 was holding.

## What this deliberately does not do

- **Enter is not wired into the estimate cells.** They have the same gap — a
  bare Enter in a trio cell commits nothing today — and it is a separate call
  about their syntax and their `@` list. Named here so it is not lost.
- **The mid-flight remount window is not closed.** The delete drops the
  superseded draft rather than replacing it with the one going out, so a
  renderer swap between the send and its answer loses the new draft instead of
  restoring a stale one. Holding the in-flight text was written and rejected:
  a remount would restore it with `refused` raised over an edit that then
  lands, freezing the cell against the next peer edit. Recorded in the JSDoc on
  the line itself.
- **No focus move on Enter.** Moving on is `Ctrl/⌘ + Enter`'s, and a bare Enter
  that also moved would be that chord wearing this key.
