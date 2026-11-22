## ADDED Requirements

### Requirement: Quiet conversation chrome

Build SHALL render no tagline and no conversation-level status row above the thread; `[ Start over ]` SHALL be the only control above it. Visitor messages SHALL carry no visible role label. The first PUNI reply SHALL carry the visible label `PUNI · AI` and later replies none, except that in demo mode every reply SHALL carry `PUNI · SIMULATED`. The disabled and paused harnesses SHALL keep their labelled notice row.

#### Scenario: Live conversation

- **WHEN** a live conversation has two PUNI replies
- **THEN** the page shows `PUNI · AI` exactly once, no `YOU` label and no tagline

#### Scenario: Demo conversation

- **WHEN** the provider is `demo` and the thread has two replies
- **THEN** both replies are labelled `PUNI · SIMULATED`

### Requirement: Composer footnote only when it matters

The composer SHALL NOT show a keyboard hint. It SHALL show `N messages left` only when two or fewer visitor messages remain, and `1 message left` for one.

#### Scenario: Plenty left

- **WHEN** five of eight messages remain
- **THEN** no remaining-message count is shown

#### Scenario: Running low

- **WHEN** two messages remain
- **THEN** the composer shows `2 messages left`

### Requirement: Compact request card

The request editor and the legacy proposal card SHALL keep their accessible name and field labels for assistive technology but SHALL NOT show a bracket heading or a visible field label above the email field. `Send my request now` and `Add references or edit brief` SHALL render on one row when both are offered and the width allows.

#### Scenario: Brief offered at desktop width

- **WHEN** both request actions are offered at 1440 px
- **THEN** both buttons share one row and the email field is reachable by its accessible label

### Requirement: Attribution below the conversation

At every width, Build's conversation SHALL fill the viewport and the DB-IP credit and Privacy choices SHALL follow it in the page scroll, still visible links once scrolled to.

#### Scenario: Arrival at 1440x900

- **WHEN** Build loads with a live conversation
- **THEN** the DB-IP credit is below the first viewport and becomes visible after scrolling the page to its end
