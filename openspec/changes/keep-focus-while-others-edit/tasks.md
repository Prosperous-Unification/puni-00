## 1. The cell that follows the server without being replaced

- [x] 1.1 Failing test in `wbs-table.test.tsx`: another client's edit to the name
      of the row being typed in leaves the same element focused, holding what was
      typed. The existing test of this ("does not take the focus or the
      half-typed value") delivers an edit that leaves the name alone, so it
      passes with the `key` still in place — the new one changes the value.
- [x] 1.2 **Negative test:** an edit to a cell nobody is typing in shows the new
      value. Without it, a cell that simply never accepted a server value would
      pass 1.1. Watch it fail with the `input.value = latest.current` assignment
      deleted.
- [x] 1.3 Implement `cell-input.tsx`. Render it from the name, notes and estimate
      columns of `wbs-table.tsx` and delete the three value-bearing `key`s.

## 2. The blur that writes nothing

- [x] 2.1 Failing test: a cell focused and left with nothing typed makes no
      request, and still shows the peer's value.
- [x] 2.2 **Negative test:** the same test, watched failing with
      `input.value !== shown.current` replaced by `true` — one PATCH of a name
      nobody typed.

## 3. Gate and verification

- [x] 3.1 `verify.md`: the uncached gate and the failure-proof table.
- [x] 3.2 Deployed to dev at `fb5d54a` and verified with two real sockets over the
      real edge: ada and grace both subscribed to one project, grace renamed the
      row, and the frame carrying it arrived on ada's socket. That is the path the
      fix rides on — a peer's edit reaching the client that has to survive it.
- [x] 3.3 **The caret itself, in a browser.** Written on a box that has one:
      `apps/fe-01/e2e/live-caret.spec.ts`, two browser contexts against one project
      over the real gateway. A caret is put in the middle of a half-typed name with
      a four-character backward selection, the peer renames that very row and then a
      bystander row, and the caret is read only once the bystander's new name is on
      screen — the one thing that says the refetch carrying the withheld value has
      landed. Both faults watched in Chromium (`verify.md`).
