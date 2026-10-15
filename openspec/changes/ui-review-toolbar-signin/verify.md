# verify — `ui-review-toolbar-signin`

Branch `ui-review/toolbar-signin` from `ui-review/integration-2` @ `85849d1f3`, with `origin/main` @ `50f5c2b8d` merged in. fe-01 only. No migration, no dependency, no be-01 change. Every run below is fresh, 2026-10-14, with `E2E_PORT_SHIFT=2500`.

| Command                                                                                                                                                                   | Result                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `bunx nx run-many -t lint:fast typecheck test:unit test -p wbs-fe-01 --skip-nx-cache` (`env -u CLAUDECODE`), tree f59aa1626                                               | Successfully ran, exit 0 |
| Playwright: layout, toolbar-panels, project-settings, optimization-cue, plan-table-review, dark-mode, status, sign-in, tailwind, header, reference-cells (tree f59aa1626) | 149 passed (19.9m)       |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                  | 200 of 200 passed        |

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

After the fix, on a banded row (2× pixel method): `+1` and `search` both 5.652:1 light, 7.495:1 dark.

## Review round 1 (PR #466, 2026-10-15)

| Check                                                                    | Injected fault                                            | Observed                                                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Vitest `keeps the last refusal open while a second attempt is in flight` | `setError('')` at the top of `submit` (the reviewed code) | `expected 'grid transition-[grid-template-rows] …' to contain 'grid-rows-[1fr]'` |
| e2e `opens a refused sign-in's message …`, heading still                 | the vertically centred column (the reviewed code)         | `the heading moved · Expected: <= 0.5 · Received: 16`                            |

## Integration (`ui-review/integration-3`, F-098, 2026-10-15)

The refusal sentence is keyed per reply (`<span key={replies}>` inside the live `<p>`), so an identical
second refusal is a new node. Runs in `/home/df/wd/puni/ui-int-2`, shift 3300, with
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`: Vitest `src/app.test.tsx` and `auth-form.test.tsx` — 71
passed; `lint:fast` and `typecheck` — passed; Playwright `shell-faults, sign-in, header` — 24 passed
(`sign-in.spec.ts` now takes its column checks from the shared `e2e/signed-out-column.ts`); OpenSpec
validate — 210/210.

| Check                                                                    | Injected fault                        | Observed                                       |
| ------------------------------------------------------------------------ | ------------------------------------- | ---------------------------------------------- |
| Vitest `announces an identical second refusal as a new line (F-098)`     | sentence unkeyed in the live `<p>`    | `expected Text{ …(1) } not to be Text{ …(1) }` |
| Vitest `keeps the last refusal open while a second attempt is in flight` | (unchanged; still green with the key) | passed                                         |
