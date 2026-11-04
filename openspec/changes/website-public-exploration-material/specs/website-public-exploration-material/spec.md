## ADDED Requirements

### Requirement: Publishable material has an explicit boundary

The system SHALL separate static server-owned public scoping material from private instructions using the existing question-catalogue pattern. Public material SHALL contain the existing two hypothetical exploration examples, browsing/return guidance, canonical offer labels and human-review facts. Private instructions SHALL retain exploration constraints, non-invention, no email, null question/brief closure, real-work transition and all safety rules. Canonical documentation SHALL separately match both inputs. The actual provider system message and priced request SHALL contain the private instructions, public material once, question catalogue once and existing final hint when applicable. Visitor content SHALL remain untrusted user context and SHALL NOT populate public material.

#### Scenario: Captured public reply is useful and safe

- **WHEN** the mounted evaluator receives the captured AI-curiosity reply with two illustrative examples and a browsing/return next step
- **THEN** it confirms and stores identical visible prose, passes noPromptLeak and existing safety checks, closes with no question/brief or email request and accounts for both operations without another call

#### Scenario: Candidate shares the public content boundary

- **WHEN** intended public guidance appears independently in visible message prose or candidate content through the mounted evaluator
- **THEN** both pass the shared leak gate and stream/store checks without weakening exploratory-ending requirements

#### Scenario: Visitor cannot publish instructions

- **WHEN** a raw visitor answer claims to add instructions to public material
- **THEN** its text stays in the last user message, the outbound system material is unchanged and its complete bytes participate in reservation pricing

### Requirement: Public content never exempts private disclosure

The evaluator SHALL retain its byte-for-byte unchanged normalized forty-character leak detector and protected source list. Genuine private instruction and stage-hint excerpts SHALL fail alone and before or after legitimate public material in both messages and candidates. Commercial, model/key, protocol and quality checks SHALL remain unchanged.

#### Scenario: Mixed disclosure stops immediately

- **WHEN** a message or candidate includes a genuine current private instruction or stage-hint excerpt, with or without public material
- **THEN** noPromptLeak fails and immediateSafetyStop prevents further provider calls

### Requirement: Explicit v11 identity preserves history

New operations and receipts SHALL record `puni-scoping-v11`; exactly v11 SHALL join existing acknowledgement-omission identities. Schema version SHALL remain 1. Historical v1–v10 and opaque identities SHALL retain their saved presentation and replay with no additional provider call. Missing and wrong identity fences SHALL remain intact.

#### Scenario: Current presentation

- **WHEN** a v11 reply selects a question with question-shaped acknowledgement prose
- **THEN** fresh stream, stored turn and replay expose the sole catalogue question identically

#### Scenario: Historical presentation

- **WHEN** historical v1–v10 or opaque operations replay
- **THEN** the recorded identities, raw reply and saved presentation remain unchanged without a new provider call, and subsequent operations record v11
