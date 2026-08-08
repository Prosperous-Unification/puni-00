# Tasks

Four slices, in order. Each names the test that proves it and, where it adds a
check, the fault that check was watched failing under.

## 1. The foundation: tokens, the scoped reset, the vendored primitives

- [x] `components.json`, the token blocks (`:root`, `.dark`, `@theme inline`),
      `--radius` and `--font-sans` in `styles.css`.
- [x] The reset in the `base` layer `T` left, every rule carrying
      `:not([data-grid], [data-grid] *)`; `data-grid` on the `<table>`.
- [x] `Button` re-vendored on `cva` and the tokens; `Input`, `Label`, `Card`.
- [x] **Test** — `styles.test.ts`, reworked. `T`'s three "no reset" assertions
      guarded a document-wide preflight and are replaced by four: preflight is
      still absent (`text-size-adjust`), the base layer is now written, **every
      selector in it carries the guard**, and the layer still comes before the
      utilities.
- [x] **Negative** — the guard struck from one rule: `scopes every rule in its
base layer away from the grid` failed on `expected [ 'button' ] to deeply
equal []`. Its first form, which asked whether the guard appeared anywhere
      in the selector _list_, passed under that fault — split per selector and
      re-watched.
- [x] **Negative** — preflight imported: `brings none of Tailwind's own
preflight with it` on `text-size-adjust`, and 74 unguarded selectors.
- [x] **Negative** — `@layer` statement reordered: `gives its reset less weight
than any utility` on `expected 12748 to be less than 1693`.
- [x] **Negative** — the base block deleted: `writes its reset into the base
layer` on `expected 0 to be greater than 0`.

## 2. The modal wrapper and its one rule

- [x] `@radix-ui/react-dialog`; `modal.tsx` — `Modal`, `ModalContent` with a
      `side`, overlay, title, description, header, footer, close.
- [x] `opensCheatSheet` moved into `keyboard-bindings.ts` (re-exported, so no
      caller changes) and `isPageShortcut` written beside it.
- [x] `usePageShortcutsSuspended` in `page-shortcuts.ts`, called by
      `ModalContent` and by `KeyboardCheatSheet`.
- [x] **Test** — `page-shortcuts.test.tsx`, five tests on the production path: a
      real `WbsTable` with a spying `ProjectApi`, a real modal over it, one test
      per shortcut, plus one for what the rule must **not** swallow.
- [x] **Negative** — the listener never registered: all four holding tests
      failed, each on the thing the shortcut did.
- [x] **Negative** — the predicate dropped so the rule swallows everything:
      `leaves the dialog's own box the keystrokes the page never claimed` failed
      on `expected [] to deeply equal [ 'z', '?' ]`.

## 3. Chrome adopts the components

- [x] `app.tsx` (page shell, brand, Log out), `auth-form.tsx` (Card, Label,
      Input, Button), `presence-panel.tsx`, `project-page.tsx` (picker box, its
      list, Rename, New project), `toasts.tsx` (tokens, aria contract
      untouched), `keyboard-cheat-sheet.tsx` (tokens, markup untouched),
      `wbs-table.tsx`'s toolbar and its three banners.
- [x] **Test** — the existing suites are the spec and stay green unchanged:
      `button.test.tsx`, `toasts.test.tsx`, `keyboard-cheat-sheet.test.tsx`,
      `project-page.test.tsx`, `wbs-table.test.tsx`.

## 4. The browser gate, reworked and re-armed

- [x] `tailwind.spec.ts`: the two "the reset is absent" assertions become "the
      reset arrived in the chrome", and two new ones measure a dependency chip
      inside the grid.
- [x] **Negative** — the guard struck from every rule: exactly those two grid
      tests failed (`Expected: not "16px"`, `Expected: not "sans-serif"`) and
      all 22 of `layout.spec.ts` passed in the same run, which is the spike's
      finding reproduced.
- [x] `layout.spec.ts` (22) and `keyboard.spec.ts` (8) untouched and green.
- [x] The gate, and `openspec validate --all --json`.
