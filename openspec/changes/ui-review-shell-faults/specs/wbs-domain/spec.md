## ADDED Requirements

### Requirement: The session gate tells an outage from a refusal

On load the app SHALL read the session once and SHALL draw the sign-in form only when that read says
there is no session: a 200 answer with no user, a modelled refusal of the credential, or a 401 or 403
the contract does not model. When the read cannot be completed for any other reason — no connection,
a 5xx answer, a reply that is not the contract's, a modelled refusal of the request's shape, or a
thrown error — the app SHALL draw a `Server unavailable` state with one sentence naming the cause,
SHALL NOT draw credential fields or sign-in links, and SHALL offer Try again, which SHALL read the
session again and draw whichever state that read reports.

#### Scenario: be-01 is down behind the proxy

- **WHEN** the session read answers 502
- **THEN** the page shows `Server unavailable` and "The server is not available right now." with Try again, and no Username field

#### Scenario: the server comes back

- **WHEN** Try again is pressed and the session read answers
- **THEN** the page draws the signed-in app or the sign-in form, as that answer says

### Requirement: The header pill names the live link

The header's connection pill SHALL report the plan's live link (the stream through gw-01) and SHALL
read `Live` while it is up and `Reconnecting` while it is not; it SHALL NOT read `Online` or
`Offline`. A write the server could not complete SHALL be reported by the write's own sentence and
Retry, not by the pill. While the link is not up the pill SHALL show no roster, no count and no
"Nobody yet.", and SHALL say that who else is here is not known until the link is back.

#### Scenario: gw-01 is down

- **WHEN** the plan's stream cannot connect
- **THEN** the pill reads `Reconnecting` and shows no names, count or "Nobody yet."

#### Scenario: be-01 refuses a write while the stream is up

- **WHEN** a change is answered 502
- **THEN** "The server could not complete that change. Try again." is shown and the pill still reads `Live`

### Requirement: A dragged row shows where it will land

While a row is dragged over another, the target SHALL draw its drop position: a 2px edge on its top
for above, on its bottom for below, and a 2px outline for inside. Each edge SHALL contrast at least
3:1 with the cell it is drawn on, in the light and the dark palette.

#### Scenario: dragging over the middle of a row

- **WHEN** a dragged row is held over the middle of another row
- **THEN** that row is outlined on its top and bottom with an edge of at least 3:1
