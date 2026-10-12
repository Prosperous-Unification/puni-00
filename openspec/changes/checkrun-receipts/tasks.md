## 1. Burokrat judge

- [x] 1.1 `CheckRun` and `CheckRunLedger` records in `contracts/records.ts`
- [x] 1.2 `planCandidateChecks` shared by `planRelocationChecks` and Dash; `planCheckRuns`, `planCandidateCheckRuns`
- [x] 1.3 `readCheckRuns` with one `CheckRunRefusal` reason per rule, each watched failing with its check removed (`check-runs.test.ts`)
- [x] 1.4 Both preparers take `--check-runs`, judge instead of running, and retain streams under `--work`; the clock guard loses its allow-list
- [x] 1.5 Judge-facade additions pinned in `judge-facade.test.ts`

## 2. Dash runner

- [x] 2.1 `run-activation-checks` in `runDash`, under `src/check-runs/`, with the lint override and boundaries oracle path
- [x] 2.2 Grammar, directory and committed-checkout refusals before the executor; probe only after a pass
- [x] 2.3 Real end-to-end run on the reproducible candidates, judged through the facade

## 3. Goldens and packed suite

- [x] 3.1 Reproducible relocation candidate and `relocation-fixture-cli.ts`
- [x] 3.2 `fixtures/check-runs/{passing,skipping}` written by Dash, pinned, judged and reproduced byte for byte by Dash
- [x] 3.3 Packed suite prepares from `passing` and refuses `skipping` through the installed `bin.mjs`

## 4. Docs

- [x] 4.1 ADR 0052; ADR 0051 pointer; `names.md` Clock reads table removed and landing row split
- [x] 4.2 Runbook, consumer README, Dash and Burokrat READMEs, `CONTEXT.md` terms, `LLM_README.md`
