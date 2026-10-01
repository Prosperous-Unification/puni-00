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
- `bun apps/website/fe-01/browser/explicit-send.mjs` against the demo stack: 0 POSTs before Send, 1 after, ordinary later turn, one saved Home turn, same-key recovery; exit 0.
- `bunx @fission-ai/openspec@1.12.0 validate polish-build-app-screens --strict`: valid. `validate --all --json`: 144/144 passed.
- `bunx prettier --check` on `apps/website/fe-01/{src,browser}` and this change: all files use Prettier style.

## Decisions

- **Brief limit:** the manual brief keeps 4,000 characters. `PATCH /brief` and `POST /proposals` accept 8,000, but concept generation reads `brief.slice(0, 4000)`. Home's 2,000 limit applies to the description that the brief expands.
- **Sign-in routing:** `signInRoute` is shared by Build's sign-in card and the manual AI gate, so the two screens cannot disagree.
- **Focus:** the manual brief's state heading is now its h1, and the dark-panel statement is a paragraph, so focus lands on the content that changed.

## Not verified

- The h2puni gate, deployment and live HTTPS behavior are left to the parent.
- Real Google sign-in, which is the configured route, was exercised only through unit tests and the demo route.
