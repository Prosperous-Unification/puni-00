## 1. Cell-card boundary

- [x] 1.1 Observe the installed production F1 finding, add hook delivery regression tests,
      extract the React hook, and update its callers. Proves: original
      `cell-card-store.test.ts` and new `use-card-open-on.test.tsx`.
- [x] 1.2 Verify the unchanged installed F1 policy against the production graph; restore
      a React import and watch the zero-F1 assertion fail, then restore the pure store.
      Proves: installed `twib check working ... --rule F1` and its adjacent evidence.
- [x] 1.3 Run focused tests, frontend lint/typecheck, F1 architecture fixture and OpenSpec
      validation; record evidence and full-gate limitations in `verify.md`.
