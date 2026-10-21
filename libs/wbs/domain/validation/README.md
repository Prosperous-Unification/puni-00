# validation

`@wbs/validation` adds the WBS test doubles to the shared ArkType wrapper,
[`@shared/validation`](../../../shared/domain/validation/README.md), which owns
the parsers, their refusals and their landmines. `runtime:isomorphic`.

## Two things

- **`src/index.ts`** — a bare re-export of `@shared/validation`. The parsers,
  `ValidationError` and the re-exported `type` live there, and on the symbols'
  JSDoc, so a product-less tool can reach them without importing a WBS library.
- **`src/fixtures/`** — `makeTestDb`, `injectedClock`, `makeFrame`: the doubles
  every suite in the repo builds a boundary out of. They stay here because they
  reach for `bun:sqlite` and drizzle. Import them from
  `@wbs/validation/fixtures`.

## Test

```sh
bunx nx run wbs-validation:test
```
