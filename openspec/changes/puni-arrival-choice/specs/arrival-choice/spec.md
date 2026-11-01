## ADDED Requirements

### Requirement: Arrival visibility follows canonical analytics choice

The analytics controller SHALL expose a validated choice independently of collection state and notify choice subscribers even when loading state does not change. Missing, malformed or expired preference SHALL be unset. Unreadable storage SHALL be unavailable. Successfully persisted acceptance and rejection SHALL remain visible as choices through vendor loading or failure. Existing cookie and collection semantics SHALL remain unchanged.

#### Scenario: Fresh or invalid preference

- **WHEN** an enabled supported anonymous route has no valid unexpired preference
- **THEN** its arrival choice is shown during loading and vendor failure

#### Scenario: Persisted choice

- **WHEN** a valid acceptance or rejection exists
- **THEN** the arrival choice stays hidden during loading and vendor failure

#### Scenario: Synchronization and expiry

- **WHEN** navigation, focus, pageshow or visibility synchronization observes another host's shared preference or an expired choice
- **THEN** choice observers update using the same validated preference as collection

### Requirement: Arrival actions remain usable through storage failure

The arrival choice SHALL offer equal Allow analytics cookies and Disable measurement actions. A failed preference read or write SHALL remain explicit, keep both actions available and allow recovery. Disabled, unconfigured and unsupported routes SHALL show no arrival choice.

#### Scenario: Refused persistence

- **WHEN** either action cannot persist its preference
- **THEN** the choice remains visible with optional analytics failure and the request remains usable

#### Scenario: Recovery

- **WHEN** either choice succeeds after storage recovers
- **THEN** the persisted choice hides the arrival strip

### Requirement: Quiet normal-flow app integration

One arrival strip SHALL precede request content on each public anonymous route in normal flow. It SHALL not use a dialog, overlay or focus transfer. Equal actions SHALL have targets at least 44px high, readable contrast and a compact responsive layout with readable wrapping action labels on small screens. Copy SHALL not claim complete GA reports or active collection during failure.

#### Scenario: Arrival with keyboard focus

- **WHEN** arrival controls mount while the request has focus
- **THEN** focus remains on the request and initially only one pair of choice actions is exposed

### Requirement: Footer choices remain directly available

Footer Privacy choices SHALL start collapsed independently of consent and avoid automatically opening duplicate action groups. Explicit footer expansion SHALL expose both actions for every choice, including unset or unavailable.

#### Scenario: Fresh visitor expands footer choices

- **WHEN** a visitor with unset or unavailable preference expands Privacy choices
- **THEN** both choice actions and any storage failure status are available in that region
- **AND** a refused preference write keeps its controls open for recovery

### Requirement: Arrival never blocks a ready questionnaire on short screens

With the arrival strip present, the ready Build conversation SHALL retain its natural content height in the existing night-shell scroll. Reading questions, selecting answers, typing in the composer and opening footer controls SHALL remain possible without an analytics choice at 320×568, 390×667 and 390×844. The root SHALL gain no scrollbar or gutter. Saving a choice SHALL restore the existing viewport/thread sizing. Header geometry and page-heading focus SHALL be preserved.

#### Scenario: Small phone with optional tag failure

- **WHEN** a valid ready version-1 questionnaire loads at any supported short-phone viewport without a persisted analytics choice and its optional tag fails
- **THEN** the visitor can scroll to a saved question, type in the composer, expand footer choices and select a suggested answer before making any analytics choice
- **AND** only the existing night-shell supplies a physical scrollbar while the invitation is present

#### Scenario: Existing desktop masthead alignment

- **WHEN** the natural-content invitation layout is compared with the prior viewport/thread sizing on desktop in overlay and classic scrollbar modes
- **THEN** masthead width, brand alignment and navigation alignment remain identical without adding a root gutter
