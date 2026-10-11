# Tasks

- [x] 1.1 Store: `readInflight` on the guardrail overview; `spendMicroUsd` per funnel day. Tests in
      `guardrail-store.test.ts` and `funnel-store.test.ts`; negatives: count every state as in
      flight, subtract ceiling-settled spend, delete in-flight rows on restart.
- [x] 1.2 Panels: `In flight now` and the `Spend` column, both parsed strictly. Tests in
      `guardrails-panel.test.ts` and `funnel-panel.test.ts`; negatives: default missing fields,
      drop the cell.
- [x] 1.3 Runbook section in `docs/website/build-runtime.md`.
- [x] 1.4 Browser: `screens.mjs` operator captures at four widths.
