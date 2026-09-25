## 1. Intent

- [x] 1.1 Record the intent and the delta spec — test: strict `openspec validate --all --json`

## 2. Move the two report libraries together

- [x] 2.1 Move the report library to 13.0.0 and application-exception to 0.7.0 in one lockfile
      edit, adapt `@shared/failures` and every caller of a renamed API, and move the version
      literals the boundary tests assert — test: the pins suite, `shared-failures`,
      `wbs-observability`, the backend, gateway and MCP boundary tests, the frontend fault
      suites and browser package build, and the registry probe on Bun, TypeScript 7 and
      TypeScript 6

## 3. Negatives

- [x] 3.1 Prove the one-copy check, the moved byte budget and the log schema's acceptance of an
      older record — test: the named tests; negative: a copy nested under application-exception,
      the installed copy's version edited, the byte budget dropped from the diagnostic bag, and
      the schema narrowed to the current version, each also run with its clause disabled
- [ ] 3.2 Observe again, on the new versions, every fault the `@shared/failures` proofs name —
      test: the named `report-failure.test.ts` cases; negative: each proof's own fault
