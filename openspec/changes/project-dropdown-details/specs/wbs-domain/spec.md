## ADDED Requirements

### Requirement: The project list names each project's owner

`GET /api/projects` SHALL carry, for every project it lists, the username of
the account that owns it, alongside the day the project was created and this
account's own last-opened time.

The owner's name SHALL be read in the same statement that lists the projects,
so the cost of the list does not grow with the number of projects in it.

A project whose owner account cannot be resolved is malformed stored data, not
a project without an owner: the read SHALL fail rather than answer a list one
project short or an entry whose owner is blank.

#### Scenario: every entry carries its own owner

- **GIVEN** `kat` owns `Rewire the shed` and `strip` owns `Paint the fence`
- **WHEN** either account lists projects
- **THEN** the shed entry names `kat` and the fence entry names `strip`, each
  carrying its creation day and the asking account's last-opened time

#### Scenario: the owner costs no extra query

- **WHEN** an account with fifty projects lists them
- **THEN** one statement is issued against the database, not one per project

#### Scenario: an owner that is not there

- **GIVEN** a stored project whose owner id names no account
- **WHEN** the list is read
- **THEN** the read fails, and the list is never answered with that project
  missing or its owner blank

### Requirement: Each project route answers its own shape

The create, list, and read responses SHALL each be typed by what that route can
honestly carry, and one type SHALL NOT stand for two of them. A field the route
never sends SHALL NOT appear in its type — today the create response is read as
the list's shape and so claims a last-opened time the server has never sent.

The wire SHALL NOT be narrowed to make those types tidy. `ownerName` on the
list entries is the only field this change adds and the only field it moves:
the list keeps every field it already sends — the owner id, the estimate
method, the start date, the revision, the creation time — and create keeps
answering with the whole project it wrote and that project's starting roles. A
client type names what fe-01 reads, which is a subset, and saying so is the
honest version.

Each of the three routes SHALL therefore have a test naming the fields it
carries — that the response **contains at least** them — so a field added to
one of them cannot silently be assumed present on the others. A test asserting
an exact key set SHALL NOT be written: it would describe a wire this change
does not build, and it would fail the first time an unrelated field is added to
a project. The two **absences** are claims of their own and SHALL be asserted
directly: create sends no last-opened time, and the read route sends no owner
name.

#### Scenario: the create response

- **WHEN** a project is created
- **THEN** the response carries the project that was written — its id, name and
  restriction among the fields it already carried — together with its starting
  roles, and carries neither an owner name nor a last-opened time

#### Scenario: the list response

- **WHEN** projects are listed
- **THEN** every entry carries id, name, restriction, last-opened time and
  creation day as it did before, and now the owner's name as well

#### Scenario: a field the picker does not read

- **WHEN** a list entry is inspected
- **THEN** the fields the picker never shows — the owner id, the estimate
  method, the start date, the revision — are still there, because this change
  removes nothing from the wire

#### Scenario: the read response is unchanged

- **WHEN** one project is read by id
- **THEN** it carries exactly the fields it carried before this change, and no
  owner name

### Requirement: A project entry says who owns it and when it was made

Each entry in the open picker SHALL show the project's name followed by its
**entry meta** — the owner's name and the project's creation day, muted and
parenthesised, as `(kat · 1 Jun)`. The year appears only when it is not the
current one.

Which formatter prints that day is decided by the type of the value, not by
where it is shown. A project's creation time is an **epoch millisecond**, so it
SHALL be printed by the short instant formatter, in the browser's own zone. The
table's own date cells are not the precedent: a project's start date and a
schedule's days are **calendar days** with no time and no zone, and they are
printed by the zone-free short calendar-day formatter. Neither formatter SHALL
be used for the other's type — an instant read as a calendar string and a
calendar day parsed into a moment are the two ways to print the wrong day.

The meta SHALL be part of the entry's accessible name, so two projects sharing
a name are told apart by a screen reader as well as by eye.

#### Scenario: two projects with one name

- **GIVEN** `kat` and `strip` each own a project called `Rewire the shed`
- **WHEN** the picker is opened
- **THEN** the two entries read `Rewire the shed (kat · …)` and `Rewire the
shed (strip · …)`, and each accessible name carries its owner

#### Scenario: a project made in another year

- **GIVEN** a project created in 2027 and a picker opened in 2026
- **WHEN** its entry is shown
- **THEN** the day carries the year, as `1 Jun 2027`

#### Scenario: a project made this year

- **GIVEN** a project created in the current year
- **WHEN** its entry is shown
- **THEN** the day carries no year, as `1 Jun`

### Requirement: The picker still matches on the name alone

Typing in the picker SHALL narrow the offered projects by their names only.
The entry meta is shown and never searched: an owner's name or a creation day
typed into the box SHALL NOT make a project match.

#### Scenario: an owner's name is not a match

- **GIVEN** `kat` owns `Rewire the shed` and nothing is named `kat`
- **WHEN** `kat` is typed
- **THEN** no project is offered

#### Scenario: the name still matches

- **WHEN** `shed` is typed
- **THEN** `Rewire the shed` is offered, however long its meta is

### Requirement: The open picker never widens the page

The open listbox SHALL be bounded by the viewport: no entry, however long,
SHALL push it past the window edge or give the document a horizontal scroll.
An entry too wide for that bound SHALL be truncated, and the entry SHALL carry
its full untruncated text — name and meta — in a hover title.

The bound SHALL be proven in a browser, at each width the header is required to
fit one row at, against the widest entry be-01 can produce: a username of the
longest length registration permits, in the widest glyphs it permits, beside a
long project name. A measurement environment that lays nothing out cannot
observe this bound and does not satisfy it.

#### Scenario: the widest entry the backend permits

- **GIVEN** a project with a long name owned by an account whose username is
  32 wide glyphs
- **WHEN** the picker is opened in a browser at each header-fit width
- **THEN** the listbox's right edge is inside the viewport and the document has
  gained no horizontal scroll

#### Scenario: the entry is truncated, not the page

- **GIVEN** that same entry
- **WHEN** it is shown
- **THEN** its visible text is clipped short of its full text, and its title
  carries the full name and meta

#### Scenario: a short entry is not truncated

- **GIVEN** a short project name and a short owner name
- **WHEN** the picker is opened
- **THEN** the entry is shown whole, with no clipping
