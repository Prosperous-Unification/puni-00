# Tasks

Five slices, in order. Each names the test that proves it and, where it adds a
check, the fault that check was watched failing under. The full table is in
`verify.md`.

## 1. The three calls, and the sentences their refusals get

- [x] `ProjectApi.addRole`, `renameRole`, `removeRole` in `lib/wbs-api.ts`;
      `removeRole` models `in_use` as an **answer** with its counts, the way
      `stepStack` models `stale_undo`, because the counts are the whole value of
      that refusal and `send` throws the code alone.
- [x] `roleRefusalSentence` beside them: one sentence per code be-01 answers
      with, and a fallback that names anything it does not know.
- [x] The four fakes implementing `ProjectApi` gain the three methods;
      `wbs-table.test.tsx`'s grows real phase CRUD, with `taken`, `not_found`,
      the `in_use` counts and the assumed-assignee flips.
- [x] **Test** — `wbs-api.test.ts`, 9.
- [x] **Negative** — the `in_use` branch removed; the counts guard dropped; the
      cascade flag pinned on. All three watched.

## 2. The dialog: list, add, rename, and the keyboard

- [x] `components/wbs/phases-dialog.tsx` on `Modal`/`ModalContent`, with its own
      `ModalTrigger` — the `Phases` button belongs to it, not beside it.
- [x] Add and rename, each its own `<form>`; Enter submits its own form,
      Cmd/Ctrl+Enter submits from anywhere on the surface through
      `commandChordIn` and `requestSubmit`.
- [x] Whitespace refused on the surface, before anything is sent.
- [x] **Test** — `phases-dialog.test.tsx`, 21.
- [x] **Negative** — the chord handler dead; the chord widened to any Enter; the
      blank-name guard removed.
- [x] **Found** — `ModalContent` suspended the page's keyboard while **closed**.
      Fixed in `modal.tsx`; the missing case is now
      `holds nothing back while the modal is closed`.

## 3. The removal, its counts, and the cascade

- [x] The first request carries no cascade; the `in_use` answer opens a
      confirmation naming estimates, assignments and every assumed-assignee flip
      by work item **number**.
- [x] The cascade box starts off; the confirm is disabled until it is ticked;
      closing the surface drops the confirmation rather than remembering it.
- [x] **Test** — five in `phases-dialog.test.tsx`, plus the browser's.
- [x] **Negative** — the confirmation opened with `cascade: true`.

## 4. The blast radius, and the draft that survives the rebuild

- [x] `refresh` settles `drafts` and the held refusals against the roles that
      came back, returning the same object when nothing changed.
- [x] `CellInput` takes a `cellKey` — which it also renders as its `data-cell`,
      so there is one spelling of a cell's identity — publishes a refused draft
      under it and seeds from it on attach.
- [x] The hold is dropped when the draft resolves, and purged for a phase that
      has gone.
- [x] **Test** — six in `wbs-table.test.tsx`, on the production path: the dialog
      opened from the toolbar, the phase added or removed through it.
- [x] **Negative** — the drafts sanitizer deleted; `forgetRefusedDrafts` not
      called; the restore in `takeNode` deleted; `sameRoles` made to answer
      false; `setRoles` pinned.
- [x] **Not shipped** — the `unfoldedRoles` sanitizer. Written, its negative
      watched **passing**, and removed. `verify.md` has the run.

## 5. The arithmetic, and the browser

- [x] `foldedTableMinWidth` in `table-frame.ts`, from the same widths
      `tableMinWidth` sums; the sentence in the dialog.
- [x] **Test** — `table-frame.test.ts` +3, and the browser reading the sentence
      beside the `min-width` the table really declares.
- [x] **Negative** — the role columns dropped from the sum.
- [x] `e2e/phases.spec.ts` on 3107/3207/4207: the focus trap, Escape and the
      focus it returns, the click away, Ctrl+Enter from the box, a third phase
      and the columns it brings, and a removal with its counts.
- [x] The full browser suite: **47 passed** — 22 layout + 8 keyboard + 6
      tailwind + 5 header, untouched, plus these 6.
- [x] The local port patch reverted before every commit.
