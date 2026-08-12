## ADDED Requirements

### Requirement: The app is painted in the palette this browser was told to use

The app SHALL hold a theme choice with exactly three values — `system`, `light`
and `dark` — and SHALL paint the dark palette when the choice is `dark`, or when
the choice is `system` and the platform reports `prefers-color-scheme: dark`.

The choice SHALL be remembered per browser, under one key for every project, and
SHALL be read back on the next load. A browser that has never been told SHALL be
on `system`. A stored value that is not one of the three SHALL be refused, the
key dropped, and the choice taken as `system`.

While the choice is `system` the app SHALL follow the platform changing under
it, without a reload. While the choice is `light` or `dark` it SHALL NOT.

The palette SHALL be on the document before the first paint, so that a browser
remembering `dark` never shows a light page first.

The app SHALL declare `color-scheme` for the palette in force, so that native
scrollbars, carets and date pickers follow it.

#### Scenario: a machine set to dark is followed

- **GIVEN** a browser that has never been told which palette to use
- **WHEN** its platform reports `prefers-color-scheme: dark`
- **THEN** the app is painted dark

#### Scenario: a chosen palette outranks the machine

- **GIVEN** a reader who has chosen light
- **WHEN** the platform reports `prefers-color-scheme: dark`
- **THEN** the app is painted light

#### Scenario: the machine changing is followed while the choice is system

- **GIVEN** an open page whose choice is `system` and which is painted light
- **WHEN** the platform starts reporting `prefers-color-scheme: dark`
- **THEN** the page is painted dark without being reloaded

#### Scenario: the answer survives the browser being closed

- **GIVEN** a reader who has chosen dark
- **WHEN** the app is loaded again in that browser
- **THEN** it is painted dark, and the control says so

#### Scenario: a stored answer that is not one of the three is refused

- **GIVEN** a browser whose stored answer is neither `system`, `light` nor `dark`
- **WHEN** the app is loaded
- **THEN** the choice is `system` and the stored answer is dropped

#### Scenario: a remembered dark page does not flash white

- **GIVEN** a browser remembering `dark`
- **WHEN** the app is loaded
- **THEN** the dark palette is on the document from the first paint

### Requirement: The account menu offers the palette

The account menu SHALL offer the three theme choices as one question with three
answers, naming the question and marking which answer is in force. Taking an
answer SHALL apply and remember it, and SHALL leave the menu open. `Log out`
SHALL remain the item the menu opens onto, and the keyboard SHALL reach every
item in the menu and wrap at both ends.

#### Scenario: the menu offers three answers, one of them checked

- **WHEN** the account menu is opened by a reader on the dark palette
- **THEN** it offers `System`, `Light` and `Dark`, and `Dark` is the checked one

#### Scenario: taking an answer repaints the page and leaves the menu open

- **GIVEN** an open account menu on a light page
- **WHEN** `Dark` is taken
- **THEN** the page is painted dark and the menu is still open

#### Scenario: the keyboard reaches every item

- **GIVEN** an open account menu, focused on `Log out`
- **WHEN** the up arrow is pressed
- **THEN** the focus is on `Dark`, the last of the three answers

### Requirement: Every surface takes its colour from the palette in force

No element SHALL be painted a colour the palette does not name. In particular a
`<button>` outside the plan grid SHALL NOT keep the user agent's default face,
and a link in the header SHALL NOT keep the user agent's default link colour.

Text SHALL stand off the surface it is painted on in both palettes, at the
contrast a reader needs: no less than 4.5:1 for body text and 3:1 for the large
text and the non-text marks the plan is read through.

#### Scenario: the Gantt's row labels are readable on a dark page

- **GIVEN** a plan with work items, shown as a Gantt chart, on the dark palette
- **WHEN** a row's label is measured against the surface behind it
- **THEN** it stands off that surface by at least 4.5:1

#### Scenario: the way out of the app is readable on a dark page

- **GIVEN** an open account menu on the dark palette
- **WHEN** `Log out` is measured against the menu behind it
- **THEN** it stands off that surface by at least 4.5:1

#### Scenario: the dependency picker is a card of the palette's own colour

- **GIVEN** an open dependency picker on the dark palette
- **WHEN** its options are measured against the list behind them
- **THEN** the list is the palette's popover colour and the options stand off it
      by at least 4.5:1

#### Scenario: nothing on the page is painted an unnamed colour

- **GIVEN** the plan, the account menu and the dependency picker on the dark palette
- **WHEN** every visible element's own background is read
- **THEN** none of them is the user agent's button face
