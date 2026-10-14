## 1. Change

- [x] 1.1 This change: proposal, delta spec, tasks, verify; `openspec validate --all --json` clean; no ADR (additive field, decision D1 recorded in the UI review).

## 2. Contract and backend

- [x] 2.1 Red: `apps/wbs/be-01/src/session-features.db.test.ts` over the booted composition (4 authority/marker rows, broken marker → 500).
- [x] 2.2 `sessionFeatures` / `SessionFeatures` and optional `features` on `readPasswordSession` in `auth-password-shapes.ts`.
- [x] 2.3 `Onboarding.isActive()` on the port; `OnboardingRepository` reads the activation marker; fixtures answer false.
- [x] 2.4 `authPasswordEndpoints` takes `readFeatures`; `app.ts` `readSessionFeatures` (onboarding port, plus selection composition for organizations). Negatives: always-true, marker-only organizations, caught marker refusal.

## 3. Frontend

- [x] 3.1 Red: `apps/wbs/fe-01/src/lib/session-features.test.tsx` asserts on the fetch stub that no read is issued for a feature reported off.
- [x] 3.2 `lib/session-features.ts` context; `App` provides the session read's `features`.
- [x] 3.3 OnboardingScreen, OrganizationPage and SpacesPage start in their "not active" states and skip reads (and polling) when reported off. Negatives: each gate removed.

## 4. Browser

- [x] 4.1 Red on main: `apps/wbs/fe-01/e2e/quiet-load.spec.ts` (zero console errors/warnings and zero 4xx/5xx on `/`, `/organization`, `/spaces`). Negative: App not passing `features`.
