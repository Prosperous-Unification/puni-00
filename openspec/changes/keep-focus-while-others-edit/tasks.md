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
- [ ] 3.3 **The caret itself, in a browser.** Not done and not doable from h1claw:
      no browser and no Playwright on the box, and jsdom has no caret to move. What
      3.2 proves is that the edit arrives; what nobody has watched is where the
      caret is a moment later. `verify.md` says so under what this does not cover.
