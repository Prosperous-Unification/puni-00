## ADDED Requirements

### Requirement: The chrome is one header bar

The app's chrome SHALL be laid out as a single row above the plan, and that row
SHALL be a `banner` landmark. It holds the brand, the project picker with its
rename and new-project controls, who else is online, and the account.

It SHALL remain one row at every width in the fit matrix (1280, 1024 and 900),
and at 125% zoom, with nothing in it wrapping onto a second line and nothing
running past its own right edge. The parts that can give way are the project
picker and the roster of who is online; the roster SHALL be bounded rather than
allowed to grow with the number of people in the project.

The toolbar beneath the bar SHALL keep wrapping, which is what stops it carrying
the page sideways at a narrow width.

#### Scenario: the bar at every laptop width

- **WHEN** the signed-in page is laid out at 1280, 1024 and 900 px wide
- **THEN** the header's controls are on one row and inside the header's own
  width at each of them

#### Scenario: the bar holds the four things it is a row of

- **WHEN** the banner is read for its contents
- **THEN** it contains the brand heading, the project combobox, the presence
  heading and the account button, and the table is not in it

### Requirement: The account menu is the way out

Who is signed in SHALL be shown as a menu button named by the account, opening a
menu whose accessible name says who is signed in and whose one item logs out.

The menu SHALL move the focus onto that item as it opens, close on Escape and
give the focus back, and close on a press anywhere outside it.

#### Scenario: signing out

- **WHEN** the account button is pressed and its item taken
- **THEN** the session ends and the signed-out screen is shown

#### Scenario: leaving the menu alone

- **WHEN** the menu is open and Escape is pressed
- **THEN** the menu closes and the focus is back on the button that opened it

### Requirement: The table's frame is the remainder of the window

The signed-in page SHALL be exactly one window tall, measured as a percentage of
the window rather than in viewport units, and every box from it down to the
table's scrolling frame SHALL be a column flex that passes the remaining height
on.

The frame SHALL take what the header and the toolbar leave, and SHALL NOT be
sized by any estimate of how tall the chrome is. Its bottom edge SHALL be at the
bottom of the window, and the page itself SHALL NOT scroll vertically behind it
— at 1280×800 or at 125% zoom.

Where the window is too short for the frame's own minimum, the page SHALL scroll
rather than the rows be clipped.

#### Scenario: a plan taller than the window

- **WHEN** a plan longer than the window is read at 1280×800
- **THEN** the frame is at least 120px taller than the `calc(100vh - 16rem)` it
  replaces, it ends at the bottom of the window, and the page does not scroll

#### Scenario: the same page at 125% zoom

- **WHEN** the page is read at 125% zoom, where the toolbar wraps
- **THEN** the page scrolls neither sideways nor vertically, and the header is
  still one row

### Requirement: Presence keeps its contract when it moves

The presence panel SHALL keep the roles and names it had when it moved into the
header: a heading naming it and carrying the connection's state, and a list of
who is online with the reader marked.

Its socket SHALL still not reconnect — a closed connection leaves the roster as
it was and says so in the heading — and that SHALL be pinned by a test, so the
change that adds a reconnect changes an assertion rather than discovers one.

#### Scenario: the connection drops

- **WHEN** the gateway socket closes
- **THEN** the heading says the connection is closed, the roster stays as it
  was, and no second socket is opened
