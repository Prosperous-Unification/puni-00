## ADDED Requirements

### Requirement: One port runs every executor kind behind one stream shape

Twilight Dash SHALL expose one `ActivityExecutor` port with the kinds `api-model`,
`cli-harness`, `acp`, `tool` and `human`. Every adapter SHALL open a session whose id is the
attempt's agent run, SHALL deliver the turn's output as AI SDK `UIMessageChunk` parts as they
arrive, and SHALL return a `TurnOutcome` whose usage is either measured or `unknown` with a
named reason. An adapter SHALL NOT default an unknown usage to zero. The `api-model` adapter
SHALL resolve models only through the pinned provider registry and SHALL refuse a model id
without a provider prefix.

#### Scenario: An API model turn is measured

- **WHEN** the `api-model` adapter completes a turn through the mock language model with 120
  input and 30 output tokens
- **THEN** the outcome's usage is `measured` with those counts and every text part reached
  the part listener in order

#### Scenario: An ACP turn reports unknown usage

- **WHEN** the `acp` adapter completes a turn against the fake ACP agent
- **THEN** the outcome's usage is `unknown` with reason `acp-v1-no-usage` and the attempt's
  `token_actual` is written as absent

#### Scenario: A bare model id is refused

- **WHEN** an activity class names the model `claude-opus-5-5` with no provider prefix
- **THEN** the adapter refuses before any request leaves the process and names the
  registry's accepted form

#### Scenario: A harness session id becomes the agent run

- **WHEN** the `cli-harness` adapter opens a session through the fake harness
- **THEN** the attempt records the harness session id as its agent run and the same id is
  on the WBS claim

### Requirement: Executors declare recovery capabilities and uncertain outcomes

Each executor SHALL declare whether it can locate an operation's session, inspect effects,
reattach, deduplicate launch and cancel/quiesce physical work. It SHALL return serializable
locators and explicit uncertain outcomes to the coordinator; it SHALL NOT directly mutate
RunStore or WBS. Recovery SHALL not infer process identity from a reusable PID alone.

#### Scenario: Session creation succeeds before its locator is saved

- **WHEN** the coordinator dies in that interval
- **THEN** recovery locates the session by operation identity or reports unresolved; it does not blindly launch again
