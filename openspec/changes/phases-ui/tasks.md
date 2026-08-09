# Tasks

Five slices, in order. Each names the test that proves it and, where it adds a
check, the fault that check was watched failing under.

## 1. The three calls, and the sentences their refusals get

- [ ] `ProjectApi.addRole`, `renameRole`, `removeRole` in `lib/wbs-api.ts`;
      `removeRole` models `in_use` as an **answer** with its counts, the way
      `stepStack` models `stale_undo`, because the counts are the whole value of
      that refusal and `send` throws the code alone.
- [ ] `roleRefusalSentence` beside them: one sentence per code be-01 answers
      with, and the fallback for anything else.
- [ ] The four fakes implementing `ProjectApi` gain the three methods.
- [ ] **Test** — `wbs-api.test.ts`: `removeRole` reads the 409 body's counts;
      a 409 that is not `in_use` still throws; `roleRefusalSentence` names
      every code the controller can answer with.
- [ ] **Negative** — the `in_use` branch removed so the 409 falls through to
      `send`'s throw.

## 2. The dialog: list, add, rename, and the keyboard

- [ ] `components/wbs/phases-dialog.tsx` on `Modal`/`ModalContent`, opened from
      a `Phases` button in the toolbar.
- [ ] Add and rename, each its own `<form>`; Enter submits its own form,
      Cmd/Ctrl+Enter submits from anywhere on the surface through
      `commandChordIn`.
- [ ] Whitespace refused on the surface, before anything is sent.
- [ ] **Test** — `phases-dialog.test.tsx`: the list, the add, the rename, the
      blank name, the busy state, and the chord from the box.
- [ ] **Negative** — the chord handler removed.

## 3. The removal, its counts, and the cascade

- [ ] The first request carries no cascade; the `in_use` answer opens a
      confirmation naming estimates, assignments and every assumed-assignee flip
      by work item **number**.
- [ ] The cascade box starts off; confirming without it sends nothing.
- [ ] **Test** — `phases-dialog.test.tsx`: refused-with-counts, the flip
      sentence, the unticked confirm, and the phase nobody uses going straight
      away.
- [ ] **Negative** — the checkbox defaulted to on.

## 4. The blast radius, and the draft that survives the rebuild

- [ ] `refresh` sanitizes `unfoldedRoles` and `drafts` against the roles that
      came back, returning the same object when nothing changed.
- [ ] `CellInput` publishes a refused draft under its cell's own key and seeds
      from it on attach, so the sanctioned remount does not replace it with the
      server's value.
- [ ] The hold is dropped when the draft resolves, and purged for a phase that
      has gone.
- [ ] **Test** — `wbs-table.test.tsx`: the accordion folding, the draft
      dropping, the identity of both when nothing changed, and — on the
      production path — a refused name still in its box after a role event
      rebuilds every column.
- [ ] **Negative** — the sanitizers removed; the hold removed.

## 5. The arithmetic, and the browser

- [ ] `foldedTableMinWidth` in `table-frame.ts`, from the same widths
      `tableMinWidth` sums; the sentence in the dialog.
- [ ] **Test** — `table-frame.test.ts` and `wbs-table.test.tsx`: the function
      agrees with what a real render of N folded roles declares.
- [ ] **Negative** — a role's width dropped from the sum.
- [ ] `e2e/phases.spec.ts` on 3107/3207/4207: the dialog opens and traps the
      focus, Escape and the click away close it, Cmd+Enter submits from the box,
      a third phase arrives and the table grows its column set, and a removal
      shows its counts.
- [ ] The full browser suite re-run: 22 layout + 8 keyboard + 6 tailwind + 5
      header, plus this spec.
