## ADDED Requirements

### Requirement: Authenticated chat reset

The requests app SHALL consume the `#reset-chat` fragment and require confirmation, the browser's current operator session and a CSRF token to request a browser-local reset. The API SHALL require the configured app origin and a live operator session and valid operator CSRF token.

#### Scenario: A signed-in tester repeats the journey

- **WHEN** the operator opens the reset URL in the browser used for testing
- **THEN** the API fences any active operation for the previous draft and invalidates the previous draft claim and records a fresh browser allowance
- **AND** the app clears browser-local chat and recovery state and returns to the public intake form
- **AND** the old conversation, messages, proposal records and paid attempts remain in storage
- **AND** the new conversation starts subject to the ordinary turn and allowance limits

#### Scenario: Unauthorized reset request

- **WHEN** a request lacks a live operator session, has the wrong CSRF token or arrives from a foreign origin
- **THEN** it returns a refusal before it can change a browser allowance, draft or cookie

#### Scenario: Another browser shares the network source

- **WHEN** the operator resets the testing browser
- **THEN** the other browser retains its original allowance and the site-wide financial and capacity counters retain all prior activity
