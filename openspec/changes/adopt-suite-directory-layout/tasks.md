## 1. The suite level

- [x] 1.1 The layout gate reads `APPLICATION_SUITES` and accepts `apps/<suite>/<product>/<project>`
      — test: `namespace-layout.test.ts` suite cases; negative: each clause disabled in turn fails
      its named case.
- [x] 1.2 Product lint policy discovery walks a suite's products and refuses a policy in the
      suite directory; Nx declares `apps/*/*/eslint.product.mjs` a lint input — test:
      `eslint-boundaries.test.ts`, `lint-policy-cache.test.ts`; negative: each clause disabled
      fails its named case.

## 2. The move

- [x] 2.1 `apps/wiki` moves to `apps/twilight-structure/twilight-burokrat` with no content change
      but the one `extends` line typed lint needs, committed together with slice 3 — test: every
      moved file byte-identical to its source but `cli/tsconfig.json`.

## 3. Every reference follows

- [x] 3.1 Project configuration, sources, the release workflow, the bootstrap policy, mapping and
      relationship facts, devsync pins and current documents name the new root; the frozen
      exception becomes a name exception on the new root — test: the Twilight Burokrat, devsync
      and pilot suites at the committed head; negative: the name exception removed fails the
      real-workspace layout case.
- [x] 3.2 The retired-root check — test: `retired-roots.test.ts`; negative: a planted reference,
      a planted file and a broken excuse each fail the check on its own clause, and an archived
      listed change stays excused.
