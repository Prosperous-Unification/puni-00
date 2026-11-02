## Why

The app still uses the old expanded navigation rail while the owner-selected landing uses a quiet left-brand/right-controls header. The disabled provider currently opens manual review, obscuring the existing questionnaire-before-email journey. The owner wants a consistent app, an AI conversation before contact commitment, and clickable choices that focus requests on PUNI’s available offers.

## What Changes

- Match the landing masthead geometry, plain links, moon identity, responsive Menu and quiet controls across app states.
- Preserve anonymous questionnaire/chat and editable brief review before asking for an email; an explicit early request remains available.
- Guide the model using the five existing starting offers and server-owned question catalogue. Recommend relevant choices without inventing services or silently choosing for the visitor.
- Prepare and verify bounded development AI activation through the existing activation procedure; source preparation alone does not enable paid replies.

## Non-Goals

No new account, email gate, service catalogue, JSON reply version, database migration, budget increase, automatic submission, new dashboard or production activation. First-page GA4 measurement is a separate change.

## Constraints

Public app/API source first, then the private byte-identical projection. No licensed Astro/theme source in this repository. Preserve claims, CSRF, raw descriptions, revisions, replay, idempotency, model budgets, recovery, references, uncertainty and email refusal. Keep historical prompt/reply compatibility; record a new prompt identity for changed future instructions. Use Bun/Nx, the exact canonical h2 gate and real negative proofs for changed safety checks. No h4 tests/builds/manual Jobs. Production remains held; live paid evaluation requires its separately prepared bounded authorization.

## Capabilities

### New Capabilities

- `guided-app-entry`: consistent app header and offer-guided anonymous intake before contact.

### Modified Capabilities

None.

## Domain Terms

None; existing Starting choice, Suggested answer, Scoping conversation, Request brief and Proposal request apply.

## Decisions Recorded

None.

## Impact

App chrome/styles, browser and component checks, scoping prompt/documented version and focused policy evaluations; subsequent public gate, private projection and development release. Existing request storage and schema stay intact.
