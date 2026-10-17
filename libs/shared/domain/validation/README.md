# shared/validation

One arktype wrapper, so external data is checked once at its boundary and
internal types stay precise after it (AGENTS.md R5). Nothing here imports a
framework or a product: `runtime:isomorphic`, `product:shared`.

Any project may import `@shared/validation` — every product and every
product-less tool — which is what `product:shared` means. The WBS test doubles
stay behind in `@wbs/validation/fixtures`, because they reach for `bun:sqlite`
and drizzle and so are neither framework-free nor shared.

## Two files

- **`core.ts`** — `parseOrThrow(schema, input)` and
  `parseSecretsOrThrow(schema, input)`, plus the re-exported `type`.
- **`errors.ts`** — `ValidationError`, the one thing a caller catches.

## Refusals

Both parsers **throw**: a malformed value at a boundary is an unknown, and R5
says an unknown is never converted to a default. What the message may say is the
difference between them, and it is the whole reason there are two.

## Landmines

- **`parseOrThrow`'s message is safe for a caller's own data and unsafe for
  secrets.** Measured on arktype 2.x: a type mismatch reads `PORT must be a
number (was a string)`, but a literal union or a regex **quotes what it got**
  — `MODE must be "dev" or "prod" (was "sekrit")`.
- **So `defineConfig` uses `parseSecretsOrThrow`**, which names the path and
  never the value. It went through the other one until 2026-09-02, and one
  mistyped `LOG_LEVEL` printed every secret be-01 holds into the boot log.
- It used to open every message with `JSON.stringify(input)`, echoing the whole
  value back — for an HTTP body that is the caller's own data arriving twice.

## Test

```sh
bunx nx run shared-validation:test:unit:level
```

The isolated Unit target selects `src/**/*.test.ts` with literal `./` operands,
excluding database tests, and refuses an empty or failed selection. It clears
`tmp/junit/shared-validation.unit.xml` before selection and writes a fresh JUnit
report with the existing 10000ms timeout. The production test-level verifier
audits the target inventory, complete source collection, level isolation and
report path. Currently `src/core.test.ts` supplies three cases.

`shared-validation:test` and `shared-validation:test:unit` retain their existing
commands. Both are unreported legacy runners without isolated level evidence
credit. This target's operational report does not establish trusted execution or
scenario coverage.
