# File-by-file review ledgers — 2026-09-02

Six read-only sweeps of `main` @ `3346bb15`, one per area, each opening every non-test
file in scope. The plan built from them is [`../2026-09-02-refactoring-plan.md`](../2026-09-02-refactoring-plan.md);
read that first. Each ledger has the same shape: a per-file row
(`file | LOC | role | reuse | performance | readability/DDD`) with `file:line` anchors, a
`Deepening candidates` section, and `Agentic-workflow notes`.

| Ledger                                                      | Scope                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| [A · be-01 repository](A-be-repository.md)                  | `apps/be-01/src/repository/**`, migrations                                |
| [B · be-01 service, controller](B-be-service-controller.md) | `apps/be-01/src/{service,controller,middleware,openapi}/**`, app roots    |
| [C · fe-01 WbsTable cluster](C-fe-wbs-table.md)             | `wbs-table.tsx` section by section, and its 35 collaborators              |
| [D · fe-01, the rest](D-fe-rest.md)                         | Gantt, cards, table frame, directory page, `lib/`, router, styles, config |
| [E · gw-01, mcp-01, libs](E-gw-mcp-libs.md)                 | both small apps and all eight `libs/*`                                    |
| [F · tools, deploy, e2e, tests](F-tools-tests.md)           | `tools/**`, `bin/`, `deploy/`, Nx and CI config, Playwright, test wiring  |

Line anchors were true on `3346bb15` and drift with every commit. Claims the plan marks ✔
were re-checked by hand; the rest are a sweep's reading of the file and carry its address —
verify the line before acting on it. Nothing in the repo was changed by the sweeps.
