## ADDED Requirements

### Requirement: No route loop without sign-in

The manual brief SHALL offer AI exploration only when Build would offer the visitor a sign-in route (configured Google, local demo) or the visitor is already signed in. When the session status cannot be read, the optional AI card SHALL be hidden and the manual brief SHALL remain usable.

#### Scenario: Google sign-in is not configured

- **WHEN** a signed-out visitor with a saved request opens Build while OIDC is unconfigured
- **THEN** Build shows one request card with a single primary "Shape your brief" action to the manual brief, without "not configured" wording
- **WHEN** the visitor follows it
- **THEN** the manual brief contains no link back to Build

#### Scenario: Sign-in is available

- **WHEN** OIDC is configured or demo sign-in is enabled
- **THEN** Build offers sign-in beside the request, and the manual brief may offer "Explore with AI"

### Requirement: Recoverable unreachable-API state

When an app request fails before reaching the API, the app SHALL show "We couldn’t reach PUNI. Check your connection and try again." instead of the browser's error text, with a retry and an exit to Home. Programming errors and typed API failures SHALL keep distinct copy.

#### Scenario: Build entry cannot reach the API

- **WHEN** the Build entry request fails with a network error
- **THEN** the error state shows the plain message, a "Try again" button and a "Back to Home" link

### Requirement: Manual brief states

The manual brief SHALL show its progress as a non-interactive stepper (done, current, next), SHALL NOT duplicate the original description beside an unchanged brief, and SHALL NOT claim draft availability or completed steps when no draft is available.

#### Scenario: Ready draft

- **WHEN** the draft loads
- **THEN** Describe is marked done, Review current and Human follow-up next, and the original description appears only as a collapsed "Original" once the brief differs

#### Scenario: Missing draft

- **WHEN** no draft cookie is present
- **THEN** the recover state shows no 24-hour availability note and no completed steps

### Requirement: Route orientation

Every app route SHALL set a distinct document title and move focus to its h1 after load and state changes without scrolling. Primary navigation SHALL mark Build with `aria-current` and a visible state, and every interactive target SHALL be at least 44px. The operator route SHALL use a minimal header without marketing navigation.

#### Scenario: Keyboard user loads Build

- **WHEN** Build finishes loading
- **THEN** the title names Build, focus is on the h1, and the Build navigation item is visibly current
