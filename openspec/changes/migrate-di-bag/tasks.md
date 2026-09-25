## 1. Intent

- [x] 1.1 Record the intent and the delta spec — test: strict `openspec validate --all --json`

## 2. Move the composition library

- [x] 2.1 Move `di-bag` to 0.5.0 in one lockfile edit, run the library's codemod, apply the
      residual edit and prove the tree equals the rehearsed one — test: the pins and label
      suites, `wbs-core`, `wbs-be-01`, the frontend runtime, module and model suites, the browser
      build test, the two budget tests, and the registry probe on Bun, TypeScript 7 and
      TypeScript 6

## 3. Negatives

- [x] 3.1 Prove the budget translation and the browser entry point — test: the named tests;
      negative: each close site's budget altered and the probe given a Node built-in, each also
      run with its clause disabled
- [x] 3.2 Observe again, on 0.5.0, the recorded faults whose outcome passes through the library —
      test: each proof's named test; negative: each proof's own fault
- [x] 3.3 Rerun every fast-check model test at its pinned seed and observe again every recorded
      model sabotage at its recorded run — test: the model suites; negative: each sabotage
