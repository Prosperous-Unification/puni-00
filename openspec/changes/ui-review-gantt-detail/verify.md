# verify — `ui-review-gantt-detail`

Branch `ui-review/gantt-detail` from `origin/main` @ `3e06eb5a4`. fe-01 only. No migration, no dependency, no be-01 change. Every run is fresh, 2026-10-16, with `E2E_PORT_SHIFT=2500` and `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

| Command                                                                                                    | Result                                          |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `bunx nx run-many -t lint:fast typecheck test:unit test -p wbs-fe-01 --skip-nx-cache`                      | Successfully ran, exit 0                        |
| Playwright: `gantt.spec.ts`, `gantt-legibility.spec.ts`, `gantt-detail.spec.ts`, `scroll-stability.e2e.ts` | 72 passed, 4 skipped, exit 0                    |
| Playwright: `gantt.spec.ts -g "is one opaque hairline at every rung" --repeat-each 3`                      | 3 passed, `changedPixels=0` at rungs 28/12/4 ×3 |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                   | 215 passed, 0 failed                            |

## R5 proofs (each fault injected alone, then watched fail)

| Check                                                                           | Injected fault                                            | Observed                                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| vitest `decides the never-said default again once the links are unknown again`  | code before the change (latch kept once set)              | `expected false to be true`                                       |
| vitest panel `decides the never-said detail again for the next plan, both ways` | same                                                      | `expected 'false' to be 'true'`                                   |
| vitest `keeps a remembered answer across links that become unknown again`       | unlatch also clears the reader's answer (`setSaid(null)`) | `expected true to be false`                                       |
| e2e `decides the never-said default again for the project chosen next (F-088)`  | default latched for the page's life (module-level latch)  | `Detail on for the linked plan chosen next` · `Received: "false"` |

The e2e case **passed on the code before the change**: the page withdraws one project's runtime before the next is live, so the table and the chart are mounted afresh on every header-picker switch, and the chart opens closed. It is a guard on the product path, not a proof of the hook's reset; the two Vitest cases are.
