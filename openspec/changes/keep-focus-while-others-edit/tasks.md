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
- [ ] 3.2 Deploy to dev and verify with two real sockets: one client types into a
      name while the other renames the same row, and the caret stays put.
