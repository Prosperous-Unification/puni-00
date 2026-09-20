## Commands and results

| Command                                                                                                                          | Status | Decisive line                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`, checked with the strict `jq` contract    | 0      | `summary.totals`: `items: 108`, `passed: 108`, `failed: 0` (V = 108). Evidence: `openspec-validation.slice-1-baseline.4ZOzlB.json`.   |
| Baseline `bunx vitest run src/components/wbs/plan-estimates.test.tsx` from `apps/wbs/fe-01`                                      | 0      | `Test Files 1 passed (1)`, `Tests 73 passed (73)` (F = 73 / 73 / 0). Evidence: `plan-estimates.slice-1-baseline.log`.                 |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change estimate-trio-ellipsis --schema sdd-lean`                      | 0      | `Created change 'estimate-trio-ellipsis' at openspec/changes/estimate-trio-ellipsis/`; `Schema: sdd-lean`.                            |
| `grep -n "schema: sdd-lean" openspec/changes/estimate-trio-ellipsis/.openspec.yaml`                                              | 0      | `1:schema: sdd-lean`.                                                                                                                 |
| `GSETTINGS_BACKEND=memory bunx prettier --write` on the four slice Markdown files                                                | 0      | All four files reported `(unchanged)`.                                                                                                |
| `GSETTINGS_BACKEND=memory bunx prettier --check` on the four slice Markdown files                                                | 0      | `All matched files use Prettier code style!`                                                                                          |
| Post-change `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`, checked with the strict `jq` contract | 0      | `summary.totals`: `items: 109`, `passed: 109`, `failed: 0`, exactly V + 1. Evidence: `openspec-validation.slice-1-after.TOJlWc.json`. |
| `NX_DAEMON=false bunx nx format:check --all`                                                                                     | 0      | No file was listed. Evidence: `format-check.slice-1.log`.                                                                             |
| Final strict OpenSpec validation                                                                                                 | 0      | `summary.totals`: `items: 109`, `passed: 109`, `failed: 0`, exactly V + 1. Evidence: `openspec-validation.slice-1-final.Zs3jwN.json`. |

## R5 proofs

| Fault                                                                         | Test | Observed                              |
| ----------------------------------------------------------------------------- | ---- | ------------------------------------- |
| None; this slice adds specification artifacts and no production safety check. | —    | No negative proof applies to slice 1. |
