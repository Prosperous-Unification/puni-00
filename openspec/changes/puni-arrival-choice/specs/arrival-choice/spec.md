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

One arrival strip SHALL precede request content on each public anonymous route in normal flow. It SHALL not use a dialog, overlay or focus transfer. Equal actions SHALL have targets at least 44px high, readable contrast and a stacked small-screen layout. Footer Privacy choices SHALL start collapsed independently of consent and avoid duplicate open action controls while the arrival strip is present. Copy SHALL not claim complete GA reports or active collection during failure.

#### Scenario: Arrival with keyboard focus

- **WHEN** arrival controls mount while the request has focus
- **THEN** focus remains on the request and only one pair of choice actions is exposed
