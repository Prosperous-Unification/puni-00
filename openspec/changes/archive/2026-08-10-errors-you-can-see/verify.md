# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed; exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      fe-01 (vitest)   18 files   376 pass  0 fail  (19 new: 11 in toasts.test.tsx,
                                                     8 in wbs-table.test.tsx)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
29 items, 29 passed, 0 failed — errors-you-can-see valid
```

`openspec validate` first refused this change: the requirement's SHALL sat on
the second line of its paragraph and the validator reads the first. Reworded,
not worked around.

## The checks, and the faults that broke them

| Check                                                        | Fault injected                                                     | What the run reported                                                                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An error toast never fades (`toasts.tsx`, `pushToast`)       | the `kind !== 'info'` guard removed, so errors get a fade too      | `keeps an error until somebody takes it off` failed — `expected [] to deeply equal [ 'rename failed: forbidden' ]`; 10 pass                                           |
| Every fade is cleared on unmount (`toasts.tsx`, the effect)  | the cleanup return dropped                                         | `leaves no timer running when it unmounts` failed — `expected 1 to be +0`; 10 pass                                                                                    |
| A repeat is collapsed (`toasts.tsx`, `pushToast`)            | the dedupe filter dropped from the prepend                         | `collapses the same message repeated into one, at the top` and `restarts the fade when the same info message arrives again` both failed; 9 pass                       |
| Five visible, `+N more` (`toasts.tsx`, `ToastStack`)         | `slice(0, VISIBLE_TOASTS)` widened to `slice(0)`                   | `stacks the newest on top and counts the ones past five` and `brings an older one back when a visible one is dismissed` both failed; 9 pass                           |
| The banner is raised (`wbs-table.tsx`, `refreshOrMarkStale`) | the catch emptied back to the silent one it replaced               | four failed: the socket banner, the clear-on-any-path, the after-an-edit banner, and the both-at-once test; 168 pass                                                  |
| The banner is cleared (`wbs-table.tsx`, `refresh`)           | `setTreeMayBeStale(false)` removed from the landed read            | `raises the stale-tree banner when a socket refetch fails` (its retry half) and `clears the banner on a later successful refetch from any path` both failed; 170 pass |
| One toast per gesture (`wbs-table.tsx`, `dependOn`)          | the combined message split into one push per line                  | `reports every refused dependency in one toast, not one each` failed — `expected [ …(2) ] to have a length of 1 but got 2`; 171 pass                                  |
| Nothing is cleared on the way in (`wbs-table.tsx`, `run`)    | the old `setError(null)` restored as a dismiss-everything          | `keeps a failure on screen when the next action succeeds` failed — `expected [] to deeply equal [ 'rename failed: forbidden' ]`; 171 pass                             |
| The top-of-page error line is gone (`wbs-table.tsx`)         | the old `<p role="alert">` restored above the table beside a toast | `says a refused rename in a toast, and puts nothing above the table` failed — `expected [ <p role="alert"></p>, …(1) ] to have a length of 1 but got 2`; 171 pass     |

Every fault was applied to the production file, watched failing, and reverted
from a copy taken before it. All 2026-08-06.

## The timer leak, and why it is observable

The instruction allowed for this being unprovable, and it is not: `vi.getTimerCount()`
sees a pending fake timer that nothing will clear. React 18 removed the
"update on an unmounted component" warning, so a spy on the state setter would
prove nothing; the timer count is the fault itself rather than a symptom of it.
The test asserts the count is back to its pre-push baseline after `unmount()`,
and that advancing past the fade afterwards still reaches nothing. With the
cleanup removed it read `1` where `0` was asserted.

The `before` baseline is taken rather than assumed zero: React's own scheduler
is free to hold a timer, and an assertion that happened to be true for a reason
other than the one it names is the check that cannot fail.

## What the migration proved about the old surface

Seven existing tests asserted the top error line's text through
`getByRole('alert')`, and three more asserted its absence. Nine of the ten pass
unchanged, because an error toast **is** an alert and is the only one on screen
in each. The tenth —
`is cancelled rather than left holding a row nobody picked up` — had to change,
and that is the change stating its own rule: a drag cancelled by somebody
else's edit refuses nothing and loses nothing, so it is an `info` toast and
carries no alert role at all. Its assertion now names the toast text and
asserts there is no alert.

## What is not watched here

- **Nothing about how it looks.** jsdom has no layout, so `position: fixed`,
  the bottom-right corner, the z-order over the sticky table frame and whether
  five stacked toasts cover the last rows of a real table are all unverified.
  A browser is the only test for those.
- **Nothing about how it is announced.** `aria-live="polite"` on the container
  and `role="alert"` on an error are asserted as markup, not as speech. No
  screen reader was run. The empty-container-first rule is there because a live
  region that arrives with its content may never be read out — that reasoning
  is from the ARIA spec, not from an observation made here.
- **The fade against a real clock.** Every fade test uses `vi.useFakeTimers`.
  Five seconds is a judgement, not a measurement.
- **`project-page.tsx` still has its own error line** for load, create and
  rename failures. Deliberately out of scope — a different surface — and it
  means the app currently has two ways of reporting a failure. Named as a
  follow-up in the proposal.
- **The first load failing** raises a toast and no banner. There is no tree for
  "may be out of date" to be about, so there is also no Retry: the only way
  back from a failed first load is still a page reload.
