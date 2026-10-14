## Why

In local mode (no organization) every page load made Chromium log its own "Failed to load resource" errors: `GET /api/onboarding` answered 403 `onboarding_inactive` on every page, the Organization page's panels answered 403 (and `GET /api/organization` 409), and `/spaces` answered `GET /api/spaces` 409 `organization_required`. The client already renders those answers as states; the noise is that it asks at all (UI review finding F-002, decision D1).

## What Changes

**Session read reports deployment features**

- From: `GET /api/auth/me` answers `{ user }`
- To: it answers `{ user, features: { onboarding, organizations } }`, signed in and signed out alike. `onboarding` is the onboarding port's own activity (the organization activation marker); `organizations` additionally needs the organization selection composition.
- Impact: additive; `features` is optional in `@wbs/contracts`, so older clients and stubs ignore or omit it. A broken activation marker now fails the session read with 500 instead of answering it.

**Client skips reads of a feature reported off**

- From: OnboardingScreen, OrganizationPage and SpacesPage always read, then render the refusal as a state
- To: when the session read reported the feature off they render the same state without reading (and Spaces does not poll); a backend that reports no features keeps today's reads

## Non-Goals

- Per-session states after activation (no bound organization, removed membership): those reads still answer their refusals.
- `/spaces/:id`, the header and nav links: unchanged.
- Hiding the console rule or answering the reads 200 (D1 options A and C).

## Constraints

- No defaulting of trusted state: an unreadable marker throws.
- One source of truth: the same port and composition that produce `onboarding_inactive` decide the flags.
