# Verification

## Slice 1: visible shell with the provider disabled (2026-10-05)

Implemented 1.1 to 1.3, the code half of 1.4, and 1.5 (Start over, added on Dany's request).
The gate, private snapshot refresh and preview deploy for 1.4 are still outstanding and belong
to the operator.

### Local stacks

The two loopback stacks were run as in
[polish-build-app-screens](../polish-build-app-screens/verify.md): `DEMO_AUTH=1` (API 3118, app
4218, site origin 4318) and `DEMO_AUTH=0` without OIDC (API 3119, app 4219, site origin 4319),
with `OPERATOR_PASSWORD` set and fresh SQLite files under the session scratchpad. Nothing serves
the site origins locally. `screens.mjs` routes `<site>/media/**` to `https://dev.puni.dev`
(`PUNI_MEDIA_ORIGIN`), without the app's cookies. It launches the installed Google Chrome
(`PUNI_BROWSER_CHANNEL`, default `chrome`) because bundled Chromium cannot decode the H.264
video. Replies are simulated; no Google or OpenRouter credential was used.

### Results

- `env -u CLAUDECODE NX_DAEMON=false bunx nx run-many -t test,lint,typecheck,build -p website-fe-01,website-be-01,website-store-sqlite,website-contracts --skip-nx-cache`: exit 0, all 16 targets succeeded. Direct `bun test` counts: fe-01 40 pass, be-01 59 pass, store-sqlite 37 pass, 0 fail.
- `PUNI_SCREENS_STRICT=1 bun apps/website/fe-01/browser/screens.mjs`: exit 0, 47/47 OK. That is 11 states at four widths: `build-disabled`, `build-reduced-motion`, `build-media-failed`, manual ×3, loading, error, operator, operator inbox and workspace. The other three are `tab-order-390` (skip link, brand, Menu), `menu-390` and `start-over-320`. Maximum CLS was 0.001 on the Build captures.
- `bun apps/website/fe-01/browser/explicit-send.mjs` (demo stack): exit 0, 0 stream POSTs before Send, 1 after, ordinary later turn, same-key recovery, pending-write recovery. Its waits changed from the old entry-card text to `#demo-email`; its assertions are unchanged.
- `bunx prettier --check` on the touched trees and `bunx @fission-ai/openspec@1.12.0 validate --all` (145 passed, 0 failed).

### R5 proofs

Each fault was injected into production source, observed and reverted; `cmp` confirmed the
restored file matched its backup.

| Injected fault                                                  | Observed failure                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `selectHeroLayer` ignores `isMediaFailed`                       | `hero-media.test.ts` gradient case: expected `gradient`, received `video`                             |
| `HeroMedia` without its video and poster `onError` handlers     | `screens.mjs` `build-media-failed`: "media failure did not switch to the gradient" at all four widths |
| `Moon` without the dot fallback branch                          | `chrome.test.ts` dot case still found the `<picture>`                                                 |
| `parseConversation` defaults an absent `provider` to `disabled` | `build-page.test.ts` "rejects missing provider" and "a malformed conversation is an error" failed     |
| App-origin guard before the claim-bound routes deleted          | Mounted `/conversation` foreign-origin read returned 200; foreign-origin discard returned 204         |
| Draft CSRF check in `POST /draft/discard` deleted               | Mounted missing-CSRF discard returned 204                                                             |
| Consumed branch in `WebsiteStore.discardDraft` deleted          | `store.test.ts` discard case: expected `consumed`, received `discarded`                               |

### Screens

Session scratchpad `build-chat-s1/`: `harness-awaiting-send-*`, `harness-reply-*`,
`harness-disabled-*`, `harness-error-*` at 1440, 768, 390 and 320, plus
`harness-keyboard-390.png`, which shows a 390×544 viewport, the visual height left beside a
300 px keyboard, with the composer focused at y 448–528. They were compared with
`site-1440.png` and `site-390.png` from `https://dev.puni.dev`. The local stacks use simulated
replies; the live preview is not yet deployed.

### Notes

- `GET /conversation` reports `provider: 'disabled'` whatever the demo or OpenRouter settings
  are, because no claim-bound stream exists before slice 3. The anonymous harness treats any
  other provider as a contract break until slice 4 wires it.
- The signed-in account conversation now renders inside the same harness. The concept preview
  panel and the side brief are no longer shown on Build (design: the preview is not shown in
  the harness); `concept-preview.tsx` is unchanged.
- The night header nav type is one property, `--night-nav-type`, provisionally `18px / 1.5`
  until the site's computed values are copied.
- `POST /draft/discard` expires the draft by setting `expires_at` to the request time, so the
  expired-draft purge may remove it before the 24 hours it would otherwise have had.
