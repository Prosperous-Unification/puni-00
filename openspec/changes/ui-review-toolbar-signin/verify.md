# verify — `ui-review-toolbar-signin`

Branch `ui-review/toolbar-signin` from `ui-review/integration-2` @ `85849d1f3`, with `origin/main` @ `50f5c2b8d` merged in. fe-01 only. No migration, no dependency, no be-01 change. Every run below is fresh, 2026-10-14, with `E2E_PORT_SHIFT=2500`.

| Command                                                                                                                                               | Result                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `bunx nx run-many -t lint:fast typecheck test:unit test -p wbs-fe-01` (`env -u CLAUDECODE`)                                                           | see the lane record (final run on the pushed head) |
| Playwright: layout, toolbar-panels, project-settings, optimization-cue, plan-table-review, dark-mode, status, sign-in, tailwind, header (merged tree) | 145 passed (16.8m)                                 |
| `bunx @fission-ai/openspec@1.12.0 validate ui-review-toolbar-signin --json`                                                                           | 1 passed, 0 failed                                 |

## R5 proofs (each fault injected alone, then watched fail)

| Check                                                            | Injected fault                                            | Observed                                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| e2e `sign-in.spec.ts` centres … at 1440 / 1024 / 375             | code before the change                                    | `the sign-in page has no [data-sign-in]`                                                                    |
| same                                                             | old layout with only the two data attributes added        | 1440 `Received: 496`, 1024 `Received: 288` (column off centre); 375 `Received: 52` (password to button)     |
| e2e `says what the product is …`                                 | code before the change                                    | `toBeVisible() failed · element(s) not found`                                                               |
| e2e `opens a refused sign-in's message …`                        | refusal row left at `0fr`                                 | `the message is drawn clipped · Expected: > 15 · Received: 12`                                              |
| Vitest `keeps a failed password sign-in inline …`                | same                                                      | `expected 'grid transition-[grid-template-rows] …' to contain 'grid-rows-[1fr]'`                            |
| e2e `ends the bar with one group … at 1024 / 1280 / 1440`        | code before the change                                    | 1024: Undo, Redo, Keyboard shortcuts at `49`, Starts at `85`; 1280 and 1440: all four icon controls at `49` |
| same, contiguity                                                 | end group `grow`, `ml-auto` moved onto the schedule group | `Export / Import and Starts are apart · Received: 319.5` (1024), `575.5` (1280), `735.5` (1440)             |
| same, row alone (right-edge assertion disabled)                  | Columns moved after the end group                         | `a control outside the end group shares its row · Received: ["Columns"]` (1024, 1280)                       |
| `project-settings.spec.ts` budget premise                        | Redo taken off the bar                                    | `Expected: >= 17 · Received: 16`                                                                            |
| `optimization-cue.spec.ts` budget and switch premises            | same                                                      | `Expected: >= 19 · Received: 18` (both tests)                                                               |
| e2e `draws the hidden-chip count and the search word at 4.5:1 …` | code before the change                                    | light `the +1 on the band · Received: 4.4775…`                                                              |
| same                                                             | count in `--quiet-ink`, placeholders unchanged            | `the search word on the band · Received: 2.652…` (light), `4.158…` (dark)                                   |
