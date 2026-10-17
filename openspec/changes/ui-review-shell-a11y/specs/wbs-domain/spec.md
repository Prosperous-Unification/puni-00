## ADDED Requirements

### Requirement: The session gate names a refused session read

When the session read is answered 403, which the contract does not model, the app SHALL draw an
`Access refused` state saying that something in front of the server refused the request so the
session could not be checked, SHALL NOT draw credential fields or sign-in links, and SHALL offer Try
again, which SHALL read the session again. When the session read is answered 401 off-contract
without a `WWW-Authenticate` challenge, the app SHALL draw the sign-in form under "You are not signed
in." and SHALL NOT show "The server returned an unexpected response." on the sign-in page.

#### Scenario: a proxy's access-denied page

- **WHEN** the session read is answered 403 with an HTML body
- **THEN** the page shows `Access refused` and "Something in front of the server refused this request, so your session could not be checked." with Try again, in the signed-out column, and no Username field

#### Scenario: a 401 with no challenge

- **WHEN** the session read is answered 401 off-contract with no `WWW-Authenticate` header
- **THEN** the sign-in form is drawn under "You are not signed in."

### Requirement: The connection pill explains Live and shows its state by shape

The Live pill's fact card SHALL say what Live means before the roster: "Live: edits by other people
and who is here arrive as they happen. Here now: <roster>." The link dot SHALL be a filled disc while
Live and a hollow ring while Reconnecting, at the same size, so the state does not depend on colour
alone at any width and the header does not change height between the two.

#### Scenario: the link drops on a phone

- **WHEN** the plan's stream cannot connect at 375 or 1024 px
- **THEN** the dot is an unfilled ring, and when the stream connects it is a filled disc of the same size in a header of the same height

### Requirement: The plan toolbar is a named toolbar with named groups

The desktop plan toolbar SHALL be exposed as a `toolbar` named `Plan actions` (the name since `ui-review-table-toolbar`, F-115). Its end SHALL be a `group`
named `Whole plan` holding Undo, Redo, Keyboard shortcuts, Export / Import and a `group` named
`Schedule` holding Starts, Plan with and Reset layout. Tab order SHALL stay control by control.

#### Scenario: a screen reader reaches the end of the bar

- **WHEN** the plan is open at 1440
- **THEN** the toolbar `Plan actions` holds the group `Whole plan` with Undo, Redo and Keyboard shortcuts, which holds the group `Schedule` with the start date and `Final estimate`

### Requirement: The estimate shorthand placeholder clears 4.5:1

The `o/r/p` placeholder of an empty Estimate cell SHALL have at least 4.5:1 contrast, as painted, on
a banded row in both palettes (decision D10: no exception for placeholders).

#### Scenario: an empty QA estimate on a banded row

- **WHEN** the fourth row has no QA figure
- **THEN** its `o/r/p` measures at least 4.5:1 in light and dark
