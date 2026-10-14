# verify — `ui-review-table-chips`

Branch `ui-review/table-chips`, with `origin/main` @ `abb051cb5` merged in. fe-01 only. No migration, no dependency, no be-01 change. Every run below is fresh, 2026-10-14, with `E2E_PORT_SHIFT=600`.

| Command                                                                                                                                                                                              | Result                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `bunx nx run-many -t lint:fast typecheck -p wbs-fe-01 --skip-nx-cache`                                                                                                                               | Successfully ran         |
| `bunx nx run-many -t test:unit test -p wbs-fe-01 --skip-nx-cache` (`env -u CLAUDECODE`)                                                                                                              | Successfully ran, exit 0 |
| Playwright: plan-table-review, reference-cells, hover-cards, deps-cell, layout, steps, types-cell, mobile, hints, keyboard, dark-mode, reference-cell-panel, card-lanes, external-refs, plan-surface | 231 passed               |
| `bunx @fission-ai/openspec@1.12.0 validate ui-review-table-chips --json`                                                                                                                             | 1 passed, 0 failed       |

## R5 proofs (each fault injected alone, then watched fail)

| Check                                                     | Injected fault                                    | Observed                                                                   |
| --------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| e2e `draws a dependency number whole…`                    | code before the change                            | `010.… is drawn cut`                                                       |
| same                                                      | Depends on fixed at 84                            | `toBeGreaterThan · Received: 0`                                            |
| same                                                      | count render removed                              | `Expected: "+2" · Received: null`                                          |
| e2e `keeps its ✕ at 4.5:1 or more`                        | 0c6e2e098 source (fade on the line)               | light `Received: 2.395…`, dark `Received: 3.173…`                          |
| same                                                      | fade dropped, chip ink still `--muted-foreground` | light `Received: 4.3486…`                                                  |
| same                                                      | fade on the chips' line                           | `something on the resting strip wears a fade · Received: 1`                |
| e2e `holds a lone chip too wide for its cell steady`      | `chipLineStyle` `alignItems: 'flex-start'`        | `the strip re-styled itself frame after frame · Expected: 0 · Received: 6` |
| e2e `ends a resting reference line on a whole chip`       | fade back on the reference line                   | `the line wears a fade · Expected: "none"`                                 |
| e2e reference-cells `rests every reference row…`          | same                                              | `the rest line fades · Expected: "none"`                                   |
| vitest reference-set-field `clips the rest line, counts…` | same                                              | `expected 'linear-gradient(to left, transparent,…' to be ''`               |
| vitest plan-dependencies `wears no truncation fade`       | fade on every resting Depends line with chips     | `expected 'linear-gradient(to left, transparent,…' to be ''`               |
| vitest table-frame widths                                 | `depends` fixed at 84                             | `expected 84 to be 95`                                                     |
| vitest table-frame typed chips                            | typed loop emptied in `dependencyChipsOf`         | `expected { widestDependencyChip: null, …(1) } to deeply equal …`          |
| e2e `keeps a typed dependency chip inside its cell`       | hiding style removed                              | `010.s1-dev SS runs past its cell · Received: 27.734375`                   |
| e2e `says search…` and vitest plan-cards sheets           | code before the change                            | `search or add`                                                            |

## Not run

- The full Playwright suite and the host gate: those belong to the orchestrator.
- macOS font widths: the formula allows 5% slack for wider glyphs.
