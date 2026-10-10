# Tasks

- [x] 1. Capture before screenshots and audit (overflow, targets, CLS, console, titles, focus) for every app state at 1440, 768, 390 and 320px with `browser/screens.mjs`.
- [x] 2. Red: `app-flow.test.ts` for sign-in routing, AI-card gating, session-status parsing and failure copy; then add `app-flow.ts`.
- [x] 3. Gate the manual AI card on `offersAiExploration`; remove the duplicate exploration block; collapse the original description; add the stepper; drop the recover-state availability note and done steps.
- [x] 4. Single saved-request card and "Shape your brief" action when sign-in is unavailable; plain unreachable copy with retry and Back to Home.
- [x] 5. Shared chrome: header (numbered nav, `aria-current`, centered wordmark, Menu disclosure), fuller footer, minimal operator header; per-route titles and h1 focus.
- [x] 6. Token sheet in `style.css`: palette, spacing scale, clamp() type ramp, radius, eyebrow and one button system.
- [x] 7. Review fixes: modelled `loadAiExploration` outcomes with a distinct loading state, operator failure copy, composer and field focus indicators, 3:1 field borders, brand-first header DOM order, plus focus-contrast, tab-order and session-down browser checks.
- [x] 8. Strict browser audit, R5 fault injections, explicit-send regression, uncached Nx targets, Prettier and OpenSpec validation; record in `verify.md`.
- [x] 9. Remove the header's "Start a Request" pill and its Menu-panel copy, leaving the right column empty on desktop and to the Menu toggle on mobile; the saved-state browser check fails if the header carries a request link.
