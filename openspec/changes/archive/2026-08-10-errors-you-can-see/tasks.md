## 1. The stack

Every test named here lives in `apps/fe-01/src/components/wbs/toasts.test.tsx`.
No backticked name is wrapped across a line: prettier de-indents the line after
a code span that crosses one, and then disagrees with itself on the next run.

- [x] 1.1 `toasts.tsx`: `Toast`, `useToasts` (push, dismiss, fade) and
      `ToastStack`. A toast's identity is its kind and text, which is what
      collapses a repeat.
      Test: `collapses the same message repeated into one, at the top`.
      Negative: the dedupe filter dropped from `pushToast` — two tests failed,
      watched.
- [x] 1.2 An error persists; an info fades after `INFO_TOAST_MS`.
      Tests: `keeps an error until somebody takes it off`,
      `lets an info message take itself off`.
      Negative: the `kind` guard removed so errors fade too — the first failed,
      watched.
- [x] 1.3 Every fade is cleared on unmount and on dismissal.
      Tests: `leaves no timer running when it unmounts` — which counts pending
      timers rather than reasoning about them — and
      `drops a dismissed info message’s timer with it`.
      Negative: the cleanup return dropped — one timer left pending after the
      component was gone, watched.
- [x] 1.4 Five visible, the rest counted as `+N more`, held rather than dropped.
      Tests: `stacks the newest on top and counts the ones past five`,
      `brings an older one back when a visible one is dismissed`.
      Negative: the slice removed — both failed, watched.
- [x] 1.5 An `aria-live="polite"` container, rendered before it has anything in
      it; errors carry `role="alert"` and info does not; the ✕ is a real button.
      Tests: `is a live region before anything is in it`,
      `does not shout an info message as an alert`,
      `takes a toast off when its ✕ is pressed`.

## 2. The table's failures move into it

Every test named here lives in `wbs-table.test.tsx`.

- [x] 2.1 Every `setError` producer becomes a `pushToast`, the top-of-page
      `<p role="alert">` goes, and `run` no longer clears on the way in.
      Tests: `says a refused rename in a toast, and puts nothing above the table`,
      `keeps a failure on screen when the next action succeeds`.
      Negative for the removed line: the old line restored beside the stack —
      the first failed on two alerts where it asserts one, watched.
      Negative for the clear: put back at the top of `run` — the second failed,
      watched.
- [x] 2.2 The cancelled drag becomes an `info` toast: it refuses nothing and
      loses nothing.
      Test: `is cancelled rather than left holding a row nobody picked up`,
      which now asserts the toast and that no alert was raised.
- [x] 2.3 The dependency path's combined message stays one toast.
      Test: `reports every refused dependency in one toast, not one each`.
      Negative: split into one push per line — failed with two, watched.

## 3. The stale tree

- [x] 3.1 `refreshOrMarkStale` wraps every refetch but the first load; the
      banner and its Retry.
      Tests: `raises the stale-tree banner when a socket refetch fails`,
      `raises the banner when the refetch after an edit fails`.
      Negative: the catch emptied back to the silent one it replaced — four
      tests failed, watched.
- [x] 3.2 Any refetch that lands clears it, whichever path asked for it.
      Tests: the retry half of the first test above, and
      `clears the banner on a later successful refetch from any path`.
      Negative: `setTreeMayBeStale(false)` removed from `refresh` — both failed,
      watched.
- [x] 3.3 A refused action and a stale tree are separate, and both show when
      both are true.
      Test: `shows both the refusal and the banner when the refetch failed too`.

## 4. Words and the gate

- [x] 4.1 `Toast` and `Stale tree` in `CONTEXT.md`.
- [x] 4.2 Format, the run-many gate uncached, and `openspec validate` — recorded
      in `verify.md`.
