# Verification

## The gate

Run on h1claw, 2026-08-08, on `change/keys-notes-and-fit`.

```
$ bunx nx format:check --all
(no files listed, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects

$ bunx nx run-many -t test lint typecheck --projects=fe-01 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck for project fe-01
      Test Files  25 passed (25)
      Tests       605 passed (605)     (565 before this change, +40)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
"totals": { "items": 39, "passed": 39, "failed": 0 }
```

The 40 new tests: **7** in `keyboard-cheat-sheet.test.tsx` (the `commandChord`
predicate), **5** in `cell-navigation.test.ts` (`commandMove`), and **28** in
`wbs-table.test.tsx`, which went from 242 declarations to 270. The 565 figure
is `bunx vitest run --root apps/fe-01` on a worktree at the parent commit, run
rather than subtracted.

**The test migration was its own task, and it was one helper.** `grep` for
Enter in `wbs-table.test.tsx` found the scaffolding behind everything: a single
`pressEnter(number)` used at **15 call sites across 14 tests**, every one of
them pressing Enter only to _get_ a second row before asserting something else.
It is now `pressNewItem`, firing Ctrl+N, and the one comment that named Enter
as the gesture says Ctrl+N. No test was deleted and none was rewritten to
assert something different. The remaining `{ key: 'Enter' }` sites in that file
are all picker and menu Enters, which this change deliberately does not touch.

`openspec validate` rejected the fifth requirement's first draft —
`ADDED "An open list owns the keyboard" must contain SHALL or MUST` — because
the `SHALL` was on the paragraph's third line. Reworded, not worked around.

## Faults, watched

Every check this change adds was watched failing with the check removed, on
2026-08-08, on this branch. The command is `bunx vitest run <file> -t '<test>'`
from `apps/fe-01`, with the fault applied to the source and reverted after.

| #   | fault injected                                                              | test that went red                                                             | how it failed                                                                   |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1   | `NO_TEXT_IN_THE_WAY` narrowed to a real mid-text caret                      | `moves from a caret no arrow could leave`, +2                                  | `expected null not to be null` — three of the five commandMove tests            |
| 2   | `commandInFlight` ref removed                                               | `two Cmd+Enters on the last row make exactly one row`                          | `expected [ '010', …, '050' ] to deeply equal [ '010', '020', '030', '040' ]`   |
| 3   | the `await` dropped, outcome hard-coded `landed`, flush fired and forgotten | `waits for the save to land before it creates anything`                        | `expected [ 'patch', 'create' ] to deeply equal [ 'patch' ]`                    |
| 4   | the `refused` return removed from the chord                                 | `a refused save leaves the caret where it was and makes no row`                | `expected [ '010', '020', '030', '040' ] to deeply equal [ '010','020','030' ]` |
| 5   | `event.preventDefault()` removed from `onCommandKey`                        | `a chord at the grid’s edge is consumed rather than leaking to the browser`    | `expected false to be true`                                                     |
| 6   | the deleted Enter branch put back in `onKeyDown`                            | `Enter in a name is a newline, and makes nothing`                              | `expected true to be false`                                                     |
| 7   | `repeat` conjunct removed                                                   | `a repeat after the confirming press does not arm the row that took its place` | `expected '020' to be null`                                                     |
| 8   | `dReleased` conjunct removed                                                | `two presses with no release between them only re-arm`                         | `expected null to be '020'`                                                     |
| 9   | same-row conjunct removed                                                   | `arming 020 and pressing Ctrl+D on 030 arms 030 and deletes neither`           | `expected null to be '030'`                                                     |
| 10  | the frozen refusal removed                                                  | `a frozen row refuses to arm and says how to unfreeze it`                      | `expected [ Array(1) ] to include '020 is frozen — unfreeze it first'`          |
| 11  | `MODIFIER_KEYS` exemption removed, so every keydown disarms                 | `any other keystroke disarms it, and a modifier on its own does not`           | `expected null to be '020'`                                                     |
| 12  | the `focusout`/`blur` disarm listeners removed                              | `leaving the cell disarms it, however the focus went`                          | `expected '020' to be null`                                                     |
| 13  | the id-and-number check replaced by `return armed`                          | `a peer renumbering the armed row disarms it`                                  | `expected '030' to be null`                                                     |
| 14  | `CreatablePicker`'s `!open` guard dropped                                   | `every chord is inert while a team picker’s list is open`                      | `expected '020' to be null`                                                     |
| 15  | the depends `!open` condition forced true                                   | `every chord is inert while the depends list is open`                          | `expected <input …(11)></input> to be <input …(10)></input>`                    |
| 16  | `actions-menu.tsx`'s modifier guard removed                                 | `every chord is inert while a row’s ⋯ menu is open`                            | `to have a length of 3 but got 4` — Duplicate taken by Cmd+Enter                |

Three of those did not reproduce on the first attempt, and the tests were the
problem rather than the faults. They are recorded because they are the R5
failure this repository keeps having, caught here rather than shipped:

- **#3.** The first ordering test compared the order the two calls _went out_
  in. Both go out synchronously either way, so dropping the `await` left it
  green. Rewritten to hold the PATCH open and assert that nothing was created
  while it hung.
- **#13.** The first version of that test had a peer _delete_ the armed row and
  asserted the tint was gone. A deleted row renders nothing, so it had no tint
  to find whatever the code did. Rewritten around a peer's create that
  renumbers the armed row — the same expression, on the branch that can be
  seen.
- **#2 and #9** were reported as skips rather than passes: vitest's `-t` is a
  regex, and `Cmd+Enters` and `Ctrl+D` match nothing. Re-run against the part
  of the title with no `+` in it.

## The overlap between the two Ctrl+D guards, stated

`repeat === false` and "a keyup of D since the arm" both exist because the plan
asks for both, and on a real held key they say the same thing — there is
neither a keyup nor a non-repeat keydown. So neither can be watched failing on
the plan's own "held Ctrl+D" scenario: the other guard passes the test.

Each is therefore proven on the scenario it uniquely owns (#7 and #8 above):
`repeat` on the repeats that arrive _after_ the confirming press, which must
not arm the row that slid up into the gap, and the keyup rule on two keydowns
with no release between them — what a held key looks like on a browser that
does not set `repeat`, and what two keyboards produce. The plan's held-key test
(`a held Ctrl+D never deletes, however long it is held`) is kept as the
scenario-level assertion it is, and it is not claimed as either guard's proof.

## What only a browser can say — h2puni

`apps/fe-01/e2e/keyboard.spec.ts`, **six** tests, run on h2puni through
`/home/puni1/wbs-e2e-work/run-e2e.sh` (the Playwright docker image; h1claw has
no browser and does not build).

```
$ ssh h2puni 'cd /home/puni1/wbs-e2e-work && ./run-e2e.sh'
  ✓  1 keyboard.spec.ts  types a note under a name with Enter, and the box grows to hold it
  ✓  2 keyboard.spec.ts  Cmd+Enter saves the cell before it creates the row it lands in
  ✓  3 keyboard.spec.ts  Ctrl+D arms on the first press and deletes on the second
  ✓  4 keyboard.spec.ts  a key still held when the row goes does not arm the row after it
  ✓  5 keyboard.spec.ts  arming one row and pressing Ctrl+D in another arms the second, …
  ✓  6 keyboard.spec.ts  a held Ctrl+D arms once and never deletes
  ✓  7–28 layout.spec.ts (unchanged, all green)
  28 passed (46.6s)
```

### The browser faults, watched

| fault injected                 | test that went red                                                 | how it failed                                                                                |
| ------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `repeat` guard removed         | `a key still held when the row goes does not arm the row after it` | `expect(received).toBe(expected)` on the armed-row count                                     |
| `await` dropped from the flush | `Cmd+Enter saves the cell before it creates the row it lands in`   | `expect(received).toHaveLength(expected)` — a POST inside the window the PATCH was held open |

Restored and re-run green after each. Three findings from those runs, all of
which made a test weaker than it read:

- **The first "held key" tests held nothing.** They pressed `keyboard.down('d')`
  once and waited 800ms: Playwright does not auto-repeat a key, so the test
  that claimed to hold Ctrl+D delivered exactly one keydown. Verified against a
  throwaway spec that logged what arrived — `["Control:false", "d:false",
"d:true", "d:true", "d:true"]` — and rewritten to repeat `down('d')`, which
  is what sets `repeat: true`.
- **A retrying assertion waited out the arm timer.**
  `expect(locator).toHaveCount(0)` retries for ten seconds; an arm expires after
  three. With the `repeat` guard removed the row really was armed, and the
  assertion sat there until the timer took it off, then passed. Watched doing
  it, with the arm traced press by press. Both of those assertions are now a
  one-shot `count()`.
- **The same-row conjunct cannot be proven in a browser at all**, and the e2e
  test says so rather than pretending. Reaching another row means moving the
  focus, and the focus rule disarms before the second press arrives — so with
  the conjunct removed, all six browser tests stay green. It is proven in
  `wbs-table.test.tsx`, where a key can be aimed at a row without the focus
  following it. Two guards, one outcome; the browser can only see the outer
  one.

## What nothing here can say — the acceptance probe

Whether a chord reaches page JavaScript at all is the operating system's
decision. jsdom delivers whatever a test constructs; Playwright dispatches into
the page rather than through the OS. **No check in this repository can answer
it**, and none of the above is offered as if it could.

`tools/dev/chord-probe.html` is the answer: a static page, no framework, no
build, opened in the browser the chords have to work in. It reports, per chord,
whether a `keydown` arrived and whether `preventDefault()` suppressed the
default. `arrived: no` on Ctrl+N is the expected result on Windows and Linux
Chrome and is exactly why Alt+N is bound to the same action. This is assumption
A8 in `tmp/assumptions-keys-fit.md`: the probe ships as a tool and the ten
minutes are Dany's, before merge.
