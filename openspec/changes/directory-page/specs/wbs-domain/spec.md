## ADDED Requirements

### Requirement: The directory has an address of its own

The signed-in region SHALL be routed, and every page in it SHALL be named by a
path: `/` is the project, `/directory` is the directory. Which page is on
screen SHALL be read from the address rather than held beside it, so a reload
SHALL return the same page and the browser's back and forward SHALL walk the
pages that were visited.

Routing SHALL cover the signed-in region only. Signing in and out are not
addresses.

#### Scenario: the link opens the directory

- **WHEN** the directory link in the header is followed from the project
- **THEN** the directory is on screen and the address is `/directory`

#### Scenario: a reload keeps the page

- **GIVEN** the directory on screen
- **WHEN** the page is reloaded
- **THEN** the directory is on screen again, not the project

#### Scenario: back returns to the project

- **GIVEN** the project was open and the directory was opened from it
- **WHEN** the browser goes back
- **THEN** the project is on screen and the address is `/`

### Requirement: A deep link asked for while signed out is honoured after signing in

A request for a signed-in address made without a session SHALL render the
sign-in form, and the address that was asked for SHALL be honoured once the
account is in — the page that was asked for is the page that appears, not the
project. The sign-in form SHALL NOT be an address of its own, and no redirect
SHALL rewrite what was asked for.

#### Scenario: signed out at the directory

- **WHEN** `/directory` is opened with no session
- **THEN** the sign-in form is on screen and no directory is drawn

#### Scenario: the address survives the sign-in

- **GIVEN** the sign-in form reached by opening `/directory`
- **WHEN** the account signs in
- **THEN** the directory is on screen and the address is still `/directory`

### Requirement: The packaged build answers a deep link

The packaged fe-01 image SHALL answer a request for a signed-in address it
holds no file for with the application itself, so that reloading `/directory`
against the served build is the same experience as reloading it under the dev
server. This SHALL be proven against the built artifact: the dev server serves
that fallback for free and can say nothing about the image.

#### Scenario: the built site is asked for the directory

- **GIVEN** the built fe-01 site served by the image's own web server
- **WHEN** `/directory` is requested
- **THEN** the application is returned and the directory renders, not a
  not-found page

### Requirement: The directory page shows every person and every service team

The directory page SHALL draw two panels: the people, and the service teams.
A person SHALL be shown with their name and the teams they belong to. A
service team SHALL be shown with its name and how many people belong to it.
Both panels SHALL keep the creation they already had.

A panel holding nothing SHALL say so in a sentence and still offer creation —
an empty list is a state, not a blank.

#### Scenario: people and their teams

- **GIVEN** `Kat` in `Platform` and `Payments`
- **WHEN** the directory page is opened
- **THEN** the people panel shows `Kat` with both teams

#### Scenario: a team's size

- **GIVEN** `Platform` holding two people
- **WHEN** the directory page is opened
- **THEN** the teams panel shows `Platform` with two members

#### Scenario: nothing in the directory yet

- **WHEN** the directory page is opened on a deployment with no people
- **THEN** the people panel says it is empty and still offers to add one

### Requirement: A person or a service team is renamed from the page

The page SHALL rename a person and a service team in place. A name of
whitespace alone SHALL be refused on the page, before anything is sent. A
name the directory already holds SHALL be refused by be-01 as taken, and the
page SHALL render that refusal as a sentence naming the name that survives,
leaving the entry as it was.

#### Scenario: a rename lands

- **WHEN** `Kat` is renamed to `Katrin` on the page
- **THEN** the people panel shows `Katrin`

#### Scenario: a taken name reads as a sentence

- **GIVEN** people `Kat` and `Strip`
- **WHEN** `Strip` is renamed to `Kat`
- **THEN** a sentence naming `Kat` as taken is on screen and the entry still
  reads `Strip`

#### Scenario: whitespace never leaves the page

- **WHEN** a name of spaces alone is submitted
- **THEN** nothing is sent and the page says the name is empty

### Requirement: A person's memberships are chips beside a picker offering what they lack

A person's memberships SHALL be drawn as one removable chip per team, beside a
picker that offers only the teams that person is **not** already in. One
choose SHALL add one membership and one chip's removal SHALL drop one, and
what is sent SHALL be exactly the set of teams the chips show.

A membership change SHALL be shown once be-01 has answered, never before: a
refused change SHALL leave the chips as they were, with the refusal on screen.

The chips SHALL be reachable and removable from the keyboard, and the picker
SHALL keep the combobox contract it already has.

#### Scenario: adding a team

- **GIVEN** `Kat` in `Platform`
- **WHEN** `Payments` is chosen in her picker
- **THEN** her memberships are sent as `Platform` and `Payments`, and both
  chips are on screen

#### Scenario: a team already held is not offered

- **GIVEN** `Kat` in `Platform`
- **WHEN** her picker is opened
- **THEN** `Platform` is not among the teams it offers

#### Scenario: removing a chip

- **GIVEN** `Kat` in `Platform` and `Payments`
- **WHEN** the `Payments` chip is removed
- **THEN** her memberships are sent as `Platform` alone

#### Scenario: a refused change leaves the chips alone

- **GIVEN** `Kat` in `Platform`
- **WHEN** a membership change is refused by be-01
- **THEN** the chips still read `Platform` and the refusal is on screen

### Requirement: Removing names what it would take before it takes it

Removing a person or a service team from the page SHALL first ask without
cascade. When be-01 answers with the **directory usage**, the page SHALL open
a confirmation listing the affected projects and work items **by name and
number** and the members that would lose a membership, scrollable when the
list is long, and only then offer the removal that cascades. Nothing SHALL be
removed on the first request.

The refusal SHALL be a 409 whose body is `{ error: 'in_use', usage }`, and the
usage SHALL carry both of its halves, always present and never optional:

- `projects`: one entry per affected project, `{ id, name, workItems }`, where
  each work item is `{ id, number, name, effects }` and `number` is the
  derived number the plan shows (`3.1`).
- `members`: one entry per person whose membership the removal would drop,
  `{ id, name }`. A service team nothing but memberships points at SHALL still
  be refused, with those people named — a confirmation showing an empty impact
  list while memberships were about to be dropped is a confirmation of
  nothing. A person's own memberships name nobody else and go with them, so
  they SHALL NOT, alone, force a confirmation.

Each entry of `effects` SHALL name its kind and what that kind does:

- `{ kind: 'assignment_dropped', role: { id, name } }` — an assignment that
  holds the person goes.
- `{ kind: 'label_nulled' }` — the work item's service team label is nulled.
- `{ kind: 'assumed_assignee_changed', assumedNow, assumedAfter }` — the
  **assumed assignee** the work item reads as moves. Each is a person's name
  or `null`, and `null` SHALL mean `unassigned`: a removal that takes a work
  item's sole assignee SHALL name the flip to `unassigned` in the payload
  rather than leave it to be inferred from an absence.

The confirmation SHALL be built from those named properties — each project by
`name`, each work item by `number` and `name`, each effect by its `kind`, and
an `assumedAfter` of `null` as the word `unassigned`. A 409 claiming `in_use`
without a usage in that shape SHALL be **thrown** rather than confirmed
against: a confirmation drawn from a payload this page could not read asks
somebody to approve a cascade they were never shown.

Closing the confirmation SHALL drop it rather than remember it: the next
removal SHALL ask again without cascade.

An entry nothing points at SHALL be removed by the first request, with no
confirmation.

#### Scenario: the confirmation names the work

- **GIVEN** `Kat` assigned on work item `3.1 Design` in project `Rollout`
- **WHEN** her removal is asked for
- **THEN** a confirmation naming `Rollout` and `3.1 Design` is on screen and
  she is still in the panel

#### Scenario: a work item left with nobody says so

- **GIVEN** a usage whose work item carries `assumed_assignee_changed` with
  `Kat` now and `null` after
- **WHEN** the confirmation is drawn
- **THEN** that work item reads as going from `Kat` to `unassigned`

#### Scenario: a team's members are named

- **GIVEN** a usage naming no project and two members, `Kat` and `Ada`
- **WHEN** the removal of that team is asked for
- **THEN** the confirmation names both people as losing their membership,
  rather than showing an empty list

#### Scenario: a refusal the page cannot read is not a confirmation

- **WHEN** be-01 answers the first removal with a 409 reading `in_use` and no
  usage in it
- **THEN** the client throws, no confirmation is drawn, and no cascade can be
  sent

#### Scenario: the confirmed removal

- **GIVEN** that confirmation on screen
- **WHEN** it is confirmed
- **THEN** the removal is sent with cascade and `Kat` is gone from the panel

#### Scenario: a closed confirmation is forgotten

- **GIVEN** a confirmation that was closed without confirming
- **WHEN** the same removal is asked for again
- **THEN** the request carries no cascade and the confirmation is asked again

#### Scenario: nothing points at it

- **WHEN** a team no work item carries and no person belongs to is removed
- **THEN** it is gone with no confirmation asked

### Requirement: The directory page re-reads on arrival, on focus, and after its own writes

The page SHALL re-read the directory after every write it makes, when it is
arrived at, and when the window it sits in is focused again or its tab becomes
visible again, and SHALL open no socket subscription of its own. A change made
by somebody else while the page sits open and focused SHALL therefore be seen
on the next of those, not the moment it happens — a stated cost, not a defect.

#### Scenario: a write is followed by a read

- **WHEN** a person is renamed on the page
- **THEN** the directory is read again and both panels show what be-01 holds

#### Scenario: coming back to the tab re-reads

- **GIVEN** the directory page open and the window left for another
- **WHEN** the window is focused again
- **THEN** the directory is read again, and a person added elsewhere in the
  meantime is on the panel

#### Scenario: no socket

- **WHEN** the directory page is on screen
- **THEN** the gateway it is given is never asked to subscribe — no
  subscription is opened for it, on mount or after

### Requirement: The header carries the way to the directory and still fits one row

The header SHALL carry a control that opens the directory, and SHALL mark
which of the two pages is the current one. The header SHALL stay one row deep
with nothing past its right edge at every laptop width the fit matrix
measures, with the new control on it.

The header SHALL be on both pages, and the controls that belong to a project
SHALL be absent on the directory page rather than drawn dead.

Each route SHALL render `AppHeader` itself. What both pages share — the
account, the presence slot and the navigation between the two pages — SHALL
reach them through router context, and the project controls SHALL stay in
`ProjectPage`, which owns the picker's list, selection and rename-in-progress.
Nothing SHALL be hoisted into a root route to be drawn once: a root-drawn
header would have to reach back into the project page for state it does not
hold, and the two pages disagree about what the bar carries, which is the
disagreement this contract settles rather than leaves to whoever builds it.

#### Scenario: one row with the new control

- **WHEN** the header is measured at 1280, 1024 and 900 px wide with the
  directory control on it
- **THEN** it is one row deep and nothing sits past its right edge

#### Scenario: the current page is marked

- **WHEN** the directory is on screen
- **THEN** the header's directory control is marked as the current page

#### Scenario: no project controls off the project

- **WHEN** the directory is on screen
- **THEN** the header carries no project picker and no rename control

### Requirement: The directory page is usable on a phone

Below 768px of viewport width the two panels SHALL stack into one column, and
at 768px and above they SHALL sit side by side. Every control the page offers
— chips, their removals, the pickers, the rename and the removal — SHALL be at
least 44px in both dimensions as rendered.

#### Scenario: the panels stack

- **WHEN** the directory page is drawn in a viewport 390px wide
- **THEN** the people panel and the teams panel are one above the other

#### Scenario: the panels sit side by side

- **WHEN** the directory page is drawn in a viewport 1024px wide
- **THEN** the two panels share the row

#### Scenario: what a thumb has to hit

- **WHEN** the directory page is drawn in a viewport 390px wide
- **THEN** every control on it measures at least 44px by 44px
