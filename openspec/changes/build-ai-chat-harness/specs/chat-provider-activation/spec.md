## ADDED Requirements

### Requirement: Visible disabled state without a key

While `OPENROUTER_API_KEY`, the model, the pinned provider, both rates or `OPENROUTER_PRIVACY_VERIFIED` are absent, or `OPENROUTER_ENABLED` is not `1`, the API SHALL report the provider as unavailable and SHALL never call the provider, and Build SHALL show its disabled state with the manual path. Enabling the flag without the other settings SHALL keep inference disabled with a typed 503.

#### Scenario: Flag without key

- **WHEN** `OPENROUTER_ENABLED=1` and the key is empty
- **THEN** `GET /conversation` reports the provider unavailable and a stream request answers 503 `provider_unconfigured` with no provider contact

### Requirement: Activation runbook and evidence

`docs/website/build-runtime.md` SHALL record the exact activation sequence for the anonymous conversation: dedicated capped key, nonsecret settings in the mode-0600 runtime file, `TRUSTED_PROXY_HOPS=1`, the evaluation corpus run through the production stream path on loopback with the real key, the Compose enable override, and the bounded live smoke that records provider identity, final usage, debit, replay without a second charge, cancel and unknown-usage hold. The privacy page SHALL name OpenRouter and the pinned model host as processors before the override is applied. The runbook SHALL state that a failing corpus or missing privacy wording blocks activation.

#### Scenario: Corpus gate

- **WHEN** the evaluation CLI reports any failed assertion
- **THEN** the runbook's next step is blocked and the enable override is not applied

#### Scenario: Disable

- **WHEN** the operator recreates the API without the enable override
- **THEN** the provider reports unavailable, saved conversations remain readable and the manual path works

### Requirement: Evaluation corpus runs on the production path

The evaluation CLI SHALL drive the twelve scripted conversations through `POST /conversation/stream` on a loopback API, SHALL check only string-level assertions, SHALL print pass/fail and token totals, and SHALL print transcripts only with an explicit local flag. It SHALL refuse to run without the key and SHALL never write transcripts to disk.

#### Scenario: Price assertion

- **WHEN** a reply in the price-demand script contains a currency symbol or a figure followed by `k`
- **THEN** the CLI reports that assertion failed and exits non-zero

#### Scenario: Prompt leak assertion

- **WHEN** a reply contains any 40-character window of the shipped system prompt
- **THEN** the CLI reports the leak assertion failed
