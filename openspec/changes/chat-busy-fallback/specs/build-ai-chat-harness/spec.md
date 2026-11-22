## ADDED Requirements

### Requirement: Rate-limited chat offers manual submission

When the current scoped chat attempt receives a rate-limit refusal, Build SHALL show a busy status and offer manual submission and brief editing. It SHALL preserve the draft and suppress the typing indicator, retry action, and composer while the attempt is limited.

#### Scenario: Chat is busy

- **WHEN** the chat stream refuses an attempt with `rate_limited`
- **THEN** the visitor sees a busy status and can send the request for human follow-up or edit the brief
- **AND** the page does not indicate a reply is in progress or try again automatically

#### Scenario: The advertised wait elapses

- **WHEN** the supported server retry delay for that attempt elapses
- **THEN** the visitor can explicitly retry the same attempt

### Requirement: Show a minimal final email step

When scoped chat has a saved brief and no further question, Build SHALL show the email field and explicit submission action alongside brief contact and privacy information. Exhausted scoped chat SHALL offer the same form. Build SHALL preserve the chat and the saved submission contents.

#### Scenario: Arrive at the final email step

- **WHEN** scoped chat reaches the final handoff with no unresolved attempt and the visitor has not declined the invitation
- **THEN** the email field and Send my request are directly available without an extra confirmation step
- **AND** the chat composer, brief preview, secondary request controls, and Start over control are hidden

#### Scenario: Request human follow-up from busy chat

- **WHEN** the visitor chooses Send my request now from the busy screen
- **THEN** the same email-only form appears and receives focus
- **AND** the busy message and secondary request controls are removed from that step

#### Scenario: A chat request is recorded

- **WHEN** the server confirms the chat request was saved
- **THEN** the confirmation shows a checkmark, “Your request is recorded,” and “PUNI will contact you by email within 4 hours.”
- **AND** the confirmation does not repeat the reference or email address

#### Scenario: Animate the confirmation

- **WHEN** the confirmation appears with normal motion preferences
- **THEN** the green checkmark settles into place with a brief burst of sparkles
- **AND** reduced-motion visitors see the same confirmation and checkmark immediately without animation

#### Scenario: Start another chat after sending a request

- **WHEN** the visitor selects Chat more on the confirmation
- **THEN** the site opens the Home request prompt so they can start a fresh chat and send a separate request
