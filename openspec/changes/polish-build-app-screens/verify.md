# Verification

This work was implemented in the worktree `.worktrees/puni-app-polish` on `feat/puni-app-polish`, which is stacked on `feat/puni-retention-deadlines` at `31e83854f`. No API, contract or store file changed; `website-be-01` was not touched. Nothing was copied from the licensed theme or the private site. The visual language comes from the live site's screenshots and is re-implemented with PUNI tokens, the existing OFL fonts and new class names.

## Fixture

Two loopback stacks were started from this checkout with `DEMO_AUTH=1` (API 3118, app 4218, site origin 4318) and `DEMO_AUTH=0` without OIDC credentials (API 3119, app 4219, site origin 4319). Both used `OPERATOR_PASSWORD` and fresh SQLite files under the session scratchpad. They were launched in the same way as the "Explicit Send restoration" section of `assistant-ui-build/verify.md`. Replies are simulated; no Google or OpenRouter credentials were used.

## Browser audit

`apps/website/fe-01/browser/screens.mjs` captures each app state at 1440×900, 768×1024, 390×844 and 320×568: saved request (sign-in off), manual ready, manual without a cookie, loading (held `/entry`), error (aborted `/entry`), operator sign-in, operator inbox and the demo-signed-in Build workspace. For every capture it asserts:

- no horizontal overflow;
- no target under 44×44px (links inside running text are exempt, per WCAG 2.5.8);
- buffered CLS below 0.05;
- no console errors besides contract 401s and the workspace's no-concept 404.

It also asserts per-state behavior:

- **Saved request:** one card, one "Shape your brief" action, no "not configured" wording, Build marked `aria-current="page"`.
- **Manual:** no link back to Build.
- **Error:** the plain unreachable message, "Try again" and "Back to Home".
- **Menu at 390px:** the disclosure opens, Escape closes it and focus returns to the toggle.

It records two journey videos (saved request, then Build, then manual) at 1440 and 390.

- **Before** (original styles, non-strict): every capture failed the target check (36×14px nav links, 17px text links). Manual CLS was 0.245 at 1440 and 0.426 at 768; workspace CLS was 0.161 at 390. No route set its own title and no h1 took focus.
- **After:** `PUNI_SCREENS_STRICT=1` exited 0 with 33/33 OK lines (32 captures plus the menu check). Maximum CLS was 0.045, every title was route-specific, and the h1 was focused in every capture.

The fixes that brought CLS down:

- **Reserved main height:** main reserves the viewport below the header, so the footer no longer flashes under the loading state.
- **Stable stepper:** the manual stepper renders in every state (all upcoming while loading), and the 24-hour note moved into the ready form.
- **Focus without scrolling:** h1 focus uses `preventScroll`, because focusing the loading h1 had scrolled the stacked layout to CLS 0.3 at 320px.
- **Sign-in scroll reset:** after demo sign-in, Build scrolls to the top, so the sticky panel switch no longer lands mid-chat.

Screenshots are in the session scratchpad `app-polish/{before,after}/app-<state>-<width>.png`, plus `after/app-menu-open-390.png` and `after/video-{1440,390}/*.webm`. The parent session inspected them for spacing, hierarchy and consistency with dev.puni.dev and iterated on these points:

- the nav lost its spaces inside flex links;
- the lone saved card left half the page empty, so a "How it works" list was added;
- the manual statement wrapped awkwardly;
- the operator content was offset from the header;
- the Close glyph rendered as two slashes.

The "no saved request" path redirects to the site Home composer by contract, so it has no app screen. The populated operator inbox and generated concept preview were not captured; the inbox fixture had no submissions.

## R5 proofs

Each fault was injected into production source, observed, and then reverted. `cmp` confirmed the reverted files matched their backups byte for byte.

| Injected fault                              | Observed failure                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `offersAiExploration` returns `true`        | Two `app-flow.test.ts` cases failed; the `manual` browser check reported "manual brief links back to Build" at all 4 widths, exit 1  |
| Manual AI card rendered unconditionally     | The `manual` browser check failed at all 4 widths, exit 1                                                                            |
| Network branch of `describeFailure` removed | One `app-flow.test.ts` case failed; the `error` check showed "Failed to fetch" and "raw browser error shown" at all 4 widths, exit 1 |
| Restored                                    | 16/16 FE tests passed; `manual` and `error` checks exited 0                                                                          |

An earlier harness edit had replaced the wrong `const problems = [];`, so state checks silently did not run, and the first fault runs passed. The harness was fixed and every fault was rerun; the table records only the reruns.

## Checks

- `env -u CLAUDECODE NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build -p website-fe-01 --skip-nx-cache`: all four targets succeeded. Direct `bun test apps/website/fe-01/src` reports 16 passed and 0 failed.
- (First pass) `bun apps/website/fe-01/browser/explicit-send.mjs` against the demo stack: 0 POSTs before Send, 1 after, ordinary later turn, one saved Home turn, same-key recovery; exit 0.
- `bunx @fission-ai/openspec@1.12.0 validate polish-build-app-screens --strict`: valid. `validate --all --json`: 144/144 passed.
- `bunx prettier --check` on `apps/website/fe-01/{src,browser}` and this change: all files use Prettier style.

## Review fixes (PR #253)

An independent review of `9ad67d8b9` raised one R5 blocker and four smaller issues. Each fix was written test-first where it changes behavior, and each guard was removed once to watch its check fail.

1. **`loadAiExploration` swallowed every error (blocker).**
   - It now returns `offered | hidden | unavailable`. `unavailable` carries the cause: an `ApiFailure`, a network `TypeError`, or the new `InvalidSessionStatus`. Any other error rethrows.
   - `main.tsx` logs `unavailable` with context, renders it as hidden, and shows a rethrown error as the page error state.
   - The draft stays in the loading view until the session status resolves, so the card cannot pop in late.
2. **Chat composer focus.** The composer had only a 1.2:1 amber glow. Fields now keep the global 2px `--focus` outline with an ink border; the global `outline: none` on focus was removed, which also lets the sign-in card's accent outline appear. The audit also found the Chromium-focusable transcript viewport with no indicator, which now has an outline.
3. **Field borders.** `--line-strong` changed from `#c9c9c4` (1.66:1) to `#8f8f88` (3.3:1). The re-screenshots were inspected: borders read clearly and stay light.
4. **Operator copy.** `describeOperatorFailure` maps `operator_unconfigured` (503) and `invalid_credentials` (401) to operator copy, and otherwise defers to `describeFailure`.
5. **Header focus order.** The brand now precedes the Menu toggle in the DOM; grid placement keeps the desktop layout. The audit's empty-header click also showed the brand link stretched across the whole mobile column, so it is now `justify-self: start` (centered on desktop). On desktop, focus now reaches the centered brand before the left-hand nav, a mismatch traded for the correct mobile order.

`screens.mjs` gained three checks:

- **Focus contrast:** every capture tabs 14 times from the h1 and focuses each text field. It fails any focus indicator under 3:1 and any resting field border under 3:1 against the first opaque surface behind it.
- **Tab order:** a 390px check that the header order is skip link, brand, Menu.
- **Session down:** a `manual-session-down` state that aborts `/session` and requires a hidden card plus the contextual console report.

| Injected fault                                       | Observed failure                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `loadAiExploration` catches everything               | `rethrows failures it does not model` failed                                                    |
| `ApiFailure`, parse or network branch removed (each) | `reports modelled session failures as unavailable` failed (3 separate runs)                     |
| `operator_unconfigured` branch removed               | `gives operator sign-in its own copy` failed                                                    |
| `outline: none` on focused fields                    | 0:1 tab focus on `#brief`, `#email`, `#build-message`; manual and workspace failed (8 captures) |
| Old composer treatment (glow, no ink focus rule)     | 0:1 on `#build-message`; workspace failed (4 captures)                                          |
| `--line-strong` back to `#c9c9c4`                    | `field border 1.66:1` on `#brief`, `#email`, `#operator-password`; 8 captures failed            |
| Brand moved after the Menu toggle                    | `tab-order-390: skip-link,menu-toggle,brand FAIL`                                               |
| `unavailable` console report removed                 | `manual-session-down` failed "unavailable not reported" at all 4 widths                         |
| Restored (`cmp` identical)                           | 19/19 FE tests; affected checks exit 0                                                          |

The first tab-order fault run reported `button,button,` because the harness clicked before Build finished loading, and the later h1 focus moved the focus start point. The harness now waits for the loaded card and network idle; the rerun reported the order above. The first console-report mutation missed text that Prettier had reformatted and passed vacuously. It was rerun against the formatted source, and only the rerun is recorded.

Final reruns after the fixes:

- **`screens.mjs`** with `PUNI_SCREENS_STRICT=1`: exit 0, 38/38 OK (9 states × 4 widths, tab order, menu), max CLS 0.045.
- **`explicit-send.mjs`:** exit 0, with 0 POSTs before Send, 1 after, and same-key recovery.
- **Nx:** `env -u CLAUDECODE NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build -p website-fe-01 --skip-nx-cache` passed all four targets; 19 tests passed and 0 failed.
- **Prettier:** check passed on all changed files.

## Header without the request pill

The "Start a Request" pill was removed from the header and from the mobile Menu panel; the site header drops it at the same time. Desktop keeps the numbered nav at left, the wordmark centered and an empty right column. On mobile, the Menu toggle holds the right slot. The footer's "Start a Request" link and the operator header are unchanged. The `saved` state now fails if any header link mentions a request.

- **Proof:** re-adding the pill to `SiteHeader` made `PUNI_SCREENS_ONLY=saved` report "header carries a request link" at all four widths, exit 1. After restoring the file (`cmp` identical), the same run exited 0.
- **`screens.mjs`** with `PUNI_SCREENS_STRICT=1`: exit 0, 38/38 OK; `tab-order-390` is still skip link, brand, Menu.
- **`explicit-send.mjs`:** exit 0 (0 POSTs before Send, 1 after, same-key recovery).
- **Nx:** the uncached `test,lint,typecheck,build` run for `website-fe-01` passed all four targets; `bun test` reports 19 passed, 0 failed.

## Decisions

- **Brief limit:** the manual brief keeps 4,000 characters. `PATCH /brief` and `POST /proposals` accept 8,000, but concept generation reads `brief.slice(0, 4000)`. Home's 2,000 limit applies to the description that the brief expands.
- **Sign-in routing:** `signInRoute` is shared by Build's sign-in card and the manual AI gate, so the two screens cannot disagree.
- **Focus:** the manual brief's state heading is now its h1, and the dark-panel statement is a paragraph, so focus lands on the content that changed.

## Not verified

- The h2puni gate, deployment and live HTTPS behavior are left to the parent.
- Real Google sign-in, which is the configured route, was exercised only through unit tests and the demo route.
