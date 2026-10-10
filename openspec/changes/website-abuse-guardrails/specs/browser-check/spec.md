## ADDED Requirements

### Requirement: Challenge issued with the conversation

While the provider is `openrouter` and the conversation has no admitted operation, `GET /conversation` SHALL include `challenge: { salt, challenge, maxnumber, expiresAt }`, otherwise `challenge: null`. The salt SHALL carry the first 16 hex characters of the claim hash, the minting UTC day, the expiry (30 minutes from minting) and random bytes; `challenge` SHALL be `sha256(salt ‖ n)` for a random `n` in `[0, maxnumber]`; the response SHALL also carry `signature = HMAC-SHA256(key, challenge)` where `key = HMAC-SHA256(day salt, "puni-browser-check-v1")`. `maxnumber` SHALL be 200,000, or 1,000,000 when the site's UTC-day spend is at or above 50% of the site ceiling. Minting SHALL write no row.

#### Scenario: Fresh conversation

- **WHEN** the owner reads `GET /conversation` before any Send with the paid provider configured
- **THEN** the response carries a challenge bound to its claim with `maxnumber` 200,000, and reading it again yields a different challenge

#### Scenario: Elevated difficulty

- **WHEN** today's site spend is $5.00 or more
- **THEN** a new challenge carries `maxnumber` 1,000,000

#### Scenario: No challenge after the first operation, in demo, or when disabled

- **WHEN** the conversation has an admitted operation, or the provider is `demo`, `disabled` or `paused`
- **THEN** `challenge` is null

### Requirement: Verified check gates the first paid operation

The initial `POST /conversation/stream` SHALL carry `check: { salt, challenge, signature, number }`. Before the admission transaction the API SHALL verify shape, unexpired expiry, a minting day of today or yesterday, the claim prefix, the signature (constant-time, under the minting day's key) and `sha256(salt ‖ number) === challenge`; any failure SHALL answer 403 `challenge_invalid` without admitting. The admission transaction SHALL refuse 428 `challenge_required` when it would create the conversation row without a verified check and the pricing is paid. Operations after the first, retries of an `unknown` attempt and replays SHALL NOT require a check. Free (demo) pricing SHALL NOT require a check.

#### Scenario: Correct solution

- **WHEN** the browser posts the initial operation with a solution to its own challenge
- **THEN** the operation is admitted and the fake provider receives the request

#### Scenario: Missing check

- **WHEN** the initial operation is posted with no `check` and the provider is paid
- **THEN** the API answers 428 `challenge_required`, no conversation row exists and the provider is not called

#### Scenario: Tampered or foreign solution

- **WHEN** the posted `number` does not hash to the challenge, the signature is altered, the salt carries another claim's prefix, the expiry has passed, or the minting day is two days old
- **THEN** the API answers 403 `challenge_invalid` before any admission

#### Scenario: Lowered difficulty is refused

- **WHEN** the client rewrites the salt with a smaller `maxnumber`
- **THEN** the signature no longer verifies and the API answers 403 `challenge_invalid`

#### Scenario: Later turns need no check

- **WHEN** the conversation has one completed operation and a second message is posted without `check`
- **THEN** it is admitted on the allowance alone

### Requirement: Invisible, accessible solving in the browser

Build SHALL solve the challenge in a Web Worker with a synchronous SHA-256, starting as soon as a live paid conversation without an operation is loaded, and SHALL send the solution with the initial operation. When the stored solution is expired at Send, Build SHALL re-read the conversation, show `Checking your browser…` in an `aria-live="polite"` status row, solve again, then send. The check SHALL need no interaction, image or audio. When the solver is unsupported or fails, or the API answers `challenge_invalid` or `challenge_required`, Build SHALL show the manual path. The manual brief SHALL remain free of any check. The shared solver SHALL live in `@website/contracts` and SHALL be used by the evaluation CLI and the browser fixture.

#### Scenario: Pre-solved at Send

- **WHEN** a visitor loads Build, waits, and presses Send within 30 minutes
- **THEN** exactly one stream POST is made, it carries the solution, and no checking status was shown after Send

#### Scenario: Expired at Send

- **WHEN** the visitor presses Send 31 minutes after loading
- **THEN** Build shows the checking status, re-reads the conversation, posts once with a fresh solution, and the reply streams

#### Scenario: Solver unavailable

- **WHEN** the Worker constructor throws and the main-thread solve also fails
- **THEN** Build shows the manual path and makes no stream POST
