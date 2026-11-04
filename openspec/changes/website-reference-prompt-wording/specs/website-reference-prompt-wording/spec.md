## ADDED Requirements

### Requirement: Distinct privileged reference guidance

The structured prompt SHALL describe references as optional preference signals, granting no reuse rights, with original or licensed proposed work and no fetching or claimed inspection. Only the reference instruction SHALL be rephrased. Canonical and runtime prompts SHALL match. The evaluator SHALL retain its unchanged normalized forty-character prompt and stage-hint leak gate.

#### Scenario: Legitimate public guidance progresses

- **WHEN** the mounted evaluator receives the captured safe reference guidance separately in message prose and a candidate brief
- **THEN** each passes noPromptLeak, commercial safety, confirmed reply and stream/store equality checks, preserves its candidate and continues ordinary progression

#### Scenario: Genuine reference instruction disclosure stops

- **WHEN** a candidate contains forty normalized characters of the current privileged reference instruction
- **THEN** noPromptLeak fails and immediateSafetyStop prevents another provider call

### Requirement: Explicit v10 identity preserves history

New operations and evaluation receipts SHALL record `puni-scoping-v10`. Exactly v10 SHALL join the explicit acknowledgement-omission identities. Historical v1–v9 and opaque records SHALL retain their saved presentation and replay without another provider call.

#### Scenario: Current acknowledgement projection

- **WHEN** a v10 reply selects a question and has a question-shaped optional acknowledgement
- **THEN** fresh stream, stored turn and replay show the sole catalogue question identically

#### Scenario: Historical replay

- **WHEN** historical v1–v9 or opaque operations replay
- **THEN** their recorded identities and saved presentation remain unchanged without another provider call, and subsequent operations record v10
