## 1. The name fits

- [x] 1.1 `CellInput` gains `autoSize` and `maxRestRows`: height follows
      `scrollHeight`, capped by `max-height` in `em` at rest and uncapped
      while focused. Notes keep the old crop-and-expand.
- [x] 1.2 Failing tests first, with `scrollHeight` faked — jsdom does no
      layout, so that value is the only place the component can read one.
      **Negative tests, both watched failing:** `autoSize` off (the shipped
      behaviour), and the cap never lifted.

## 2. The date fields stop lying

- [x] 2.1 "Not before" disabled with an explanation while the project has no
      start date. **Negative test:** never disabled, watched failing.
- [x] 2.2 Starts/Ends headers carry "(day)" only while there is no calendar.

## 3. Gate

- [x] 3.1 Format, the run-many gate, `openspec validate` — in `verify.md`.
- [x] 3.2 Deploy to dev; Dany looks again.
