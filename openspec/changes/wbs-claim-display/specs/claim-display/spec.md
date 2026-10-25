## ADDED Requirements

### Requirement: A claimed step shows its holder beside its assignee

fe-01 SHALL draw a **claim chip** for each step claim whose work item and step the installed
tree holds: in a folded step cell beside the assignee slot, with the holder's initials, and in
an unfolded step's `by` column after the assignee picker. The chip SHALL differ from the
assignee by shape as well as colour, SHALL have no action and SHALL NOT be focusable. A step
column where no drawn row holds a claim SHALL reserve no space for it.

#### Scenario: A claimed step beside an assignee

- **WHEN** `ada` is assigned `Impl` of `080.25` and `codex` holds a claim on it
- **THEN** the folded `Impl` cell shows `ada`'s assignee initials and a claim chip with
  `codex`'s initials

#### Scenario: An unclaimed plan is unchanged

- **WHEN** no claim is held in the project
- **THEN** no step cell reserves a claim slot and the table's column widths equal today's

### Requirement: A claim's card and accessible name say it in full

The step's hover card and the chip's accessible name SHALL name the holder, the claim instant,
the run when any, the parent claim's holder and number for a delegated claim, and the lease
state.

#### Scenario: Holder and run in the card

- **WHEN** `codex` holds `Impl` of `080.25` under run `r-7`
- **THEN** the `Impl` card names `codex`, the run `r-7` and the claim instant

#### Scenario: A delegated claim names its parent

- **WHEN** `claire` holds a subtree claim on `080` and her subagent holds `Impl` of `080.25`
  under it
- **THEN** the `Impl` card says the claim is under `claire`'s claim on `080`

### Requirement: A subtree claim shows on its own row

fe-01 SHALL draw a subtree claim's chip in its work item's Name cell, after the name. Leaves
under it SHALL carry no chip for it. A collapsed row SHALL NOT draw the claims of rows it hides.

#### Scenario: A superagent's subtree

- **WHEN** `claire` holds a subtree claim on `080`
- **THEN** the `080` row's Name cell shows `claire`'s chip and `080.25` shows none for it

### Requirement: A lease's remaining time is counted on the server's clock

For a claim with a lease in force, fe-01 SHALL compute the remaining time against the claims
read's `readAt` advanced by the time elapsed since that read was installed, never against the
browser's wall clock, and SHALL show it in whole minutes rounded down (`<1m` below one
minute) in the unfolded chip, the Name-cell chip, the card and the Claims sheet. A claim
without a lease SHALL show no time.

#### Scenario: Remaining minutes from the server's clock

- **WHEN** a claims read says `readAt` T and a lease ending at T + 14.5 min, and the browser's
  clock is an hour ahead
- **THEN** the chip reads `14m`, and two minutes later `12m`

#### Scenario: A renewal moves the display

- **WHEN** the chip reads `3m` and `claims_changed` arrives after a heartbeat
- **THEN** after the covering claims read installs the chip reads `14m`

#### Scenario: A human claim shows no time

- **WHEN** the claim's `leaseExpiresAt` is null
- **THEN** the chip and card show no lease text

### Requirement: An ended lease reads releasing

A claim whose lease has ended, by expiry or by `leaseRevokedAt`, SHALL read **releasing**
until a claims read no longer lists it; its card SHALL say whether the lease expired or the
credential was revoked.

#### Scenario: An expired lease reads releasing

- **WHEN** the installed read's lease end passes before the sweep's announcement arrives
- **THEN** the chip reads releasing and its card says the lease expired

#### Scenario: A revoked credential reads releasing

- **WHEN** the installed read lists a claim with `leaseRevokedAt` set
- **THEN** the chip reads releasing and its card says the credential was revoked

### Requirement: Lease text advances without a timer per chip

The lease text SHALL advance while the page is visible without a new read, driven by at most
one timer for the whole plan, and no timer SHALL run while no leased claim is drawn or the
page is hidden.

#### Scenario: No leased claim, no timer

- **WHEN** the only drawn claims carry no lease
- **THEN** no lease timer is running

### Requirement: Claims and tree may disagree for one read

fe-01 SHALL draw a chip only where the installed tree holds the claim's work item and step. A
claim naming a row or step the tree lacks SHALL NOT be drawn in the table, SHALL be listed in
the Claims sheet by the claims read's own number and name, and SHALL NOT raise an error.

#### Scenario: A claim arrives before its row

- **WHEN** the claims read lists a claim on a work item the installed tree does not hold yet
- **THEN** the table draws nothing for it and the Claims sheet lists it

### Requirement: A failed claims read is visible and harmless

When the claims read fails, including a 404 from a be-01 that predates it, fe-01 SHALL keep the
last installed claims, draw no chips when none were ever installed, and show a claims notice
("Claims could not be read.") whose retry rereads claims alone. A claims failure SHALL NOT raise
the plan's stale alert nor mark the optimization cue stale. The Claims sheet SHALL render the
failure in place. Neither SHALL reach the Error Boundary.

#### Scenario: An older be-01 mid-swap

- **WHEN** the claims route answers 404 and no claims were installed
- **THEN** the table renders with no chips, the claims notice and no plan stale alert, and the
  plan stays editable

#### Scenario: The optimizer's suggestion survives a claims failure

- **GIVEN** the plan read carries an optimization whose variant would finish earlier
- **WHEN** the claims read fails
- **THEN** the cue still suggests that variant, the claims notice shows, and no plan stale alert
  shows

#### Scenario: Retrying claims reads claims alone

- **WHEN** the reader presses the claims notice's retry and the claims read succeeds
- **THEN** only the claims read runs and the notice clears

### Requirement: The Claims sheet lists who holds what

fe-01 SHALL offer a Claims sheet from a toolbar button showing the number of claims held and
from the phone `Plan actions` sheet. The button SHALL be drawn once a claims read has listed a
claim since the project was opened, and while the sheet is open, so a never-claimed plan's
toolbar is unchanged; it SHALL show no number at zero. The sheet SHALL list the held claims
grouped by holder, then run, each with number, name, step name or `subtree`, lease text and
claim instant. It SHALL offer no claim or release control.

#### Scenario: A swarm at a glance

- **WHEN** `codex` holds two steps under run `r-7` and `ada` holds one step
- **THEN** the sheet lists `ada` with one claim and `codex` with run `r-7` and two claims, and
  the toolbar button reads 3

#### Scenario: An unclaimed plan offers no Claims button

- **WHEN** no claims read has listed a claim since the project was opened
- **THEN** the toolbar draws no Claims button

#### Scenario: The last claim goes while the sheet is open

- **WHEN** the sheet is open and a claims read lists no claim
- **THEN** the sheet stays open, says no claims are held, and its button shows no number
- **AND** closing the sheet puts the focus back on its button

#### Scenario: The last claim is reaped while the sheet is closed

- **WHEN** the sweep releases the only claim held while the sheet is closed
- **THEN** the button stays with no number, and the sheet's history names the release and its
  reason

### Requirement: The Claims sheet says why claims went

Below the held claims, the Claims sheet SHALL list the claim history read's events newest
first, each naming who, which items and the reason (`claimed`, `released`, `lease expired`,
`credential revoked`). A release the sweep made SHALL be worded by its reason and SHALL name no
holder as the owner of the lease or credential
(`A lease expired: released 5 items of lead, w1 and w3`), since one sweep event also carries
the claims delegated under an expired subtree claim, each with its own holder. It SHALL read
the claim history when opened and again on each tree change while open, and not on
`claims_changed`.

#### Scenario: A reaped claim says why

- **WHEN** the sweep releases `codex`'s claim on `080.25` while the sheet is open
- **THEN** the claim leaves the held list and the history's newest row reads
  `A lease expired: released 1 item of codex` over `080.25`, never `codex released`

#### Scenario: A reaped subtree claim blames no delegated holder

- **WHEN** the sweep releases `lead`'s expired subtree claim on `020` with `w1`'s and `w3`'s
  claims delegated under it
- **THEN** the history's newest row reads
  `A lease expired: released 3 items of lead, w1 and w3`, and says of no holder that their
  lease expired

#### Scenario: The history cannot be read

- **WHEN** the claim history read fails
- **THEN** the held list still renders and the history section shows that it could not be read

### Requirement: Phone cards carry the same chips

fe-01's cards layout SHALL draw the step chip beside a card's step assignee and a subtree
claim's chip in the card's header, with the same text rules as the table.

#### Scenario: A claimed step on a phone

- **WHEN** the plan renders as cards and `codex` holds `Impl` of `080.25`
- **THEN** `080.25`'s card shows `codex`'s chip beside the `Impl` assignee
