## ADDED Requirements

### Requirement: Escape in a settings field answers only for that field

In the Project settings modal, Escape in a field SHALL put that field back where it is and SHALL
NOT refuse a close, switch the shown section or move the focus while any section holds something;
with nothing held, it SHALL close the modal. Escape in a box of a group whose write is in flight
SHALL leave the box showing what was sent.

#### Scenario: Escape while the ladder travels

- **WHEN** a reader renames a band, presses Enter, and presses Escape in the band before the write lands
- **THEN** the band keeps the new name, and once the write lands the section reads `The ladder is applied.` with no "has an unsaved edit" sentence

#### Scenario: Escape in one section while another holds a refused draft

- **WHEN** be-01 has refused the ladder and the reader types in the Timezone box and presses Escape
- **THEN** the zone is put back, Timezone stays shown with the focus in its box, and no "has an unsaved edit" sentence appears

### Requirement: A hold that is only travelling is never refused out loud

When every section that holds something holds only a write in flight, a close request SHALL be
waited out without the "has an unsaved edit" sentence, and the sentence SHALL name only a section
that holds a draft or a refusal.

#### Scenario: a refused ladder sent again

- **WHEN** a close was refused over a refused ladder and the reader fixes it and presses Enter
- **THEN** while the ladder travels the modal says `Saving Priorities…` and shows no "has an unsaved edit" sentence

### Requirement: The phone's priority ladder names every band's numbers

Below 640 px the priority ladder SHALL NOT draw its column header; every band's number line SHALL
show `Starts at` and `Writes` beside their boxes, inside the surface.

#### Scenario: the ladder at 375 px

- **WHEN** the Priorities section is shown at 375×812
- **THEN** each of the five bands shows `Starts at` left of its start box and `Writes` left of its writes box, on the boxes' line, and no box runs past the surface

### Requirement: Every settings radio has one drawing

Every radio outside the plan grid SHALL be drawn as one ring-and-dot shape on the background, in
`--foreground` when enabled and `--muted-foreground` when disabled, and SHALL NOT shrink beside its
label. It SHALL keep a visible keyboard focus outline.

#### Scenario: a locked unit beside a live one, dark

- **WHEN** the Steps section is shown in the dark palette with a step locked by estimates
- **THEN** the live unchecked radio's centre matches the locked unchecked one's, the live ring stands further off the background than the locked ring, and the locked ring stands at least 3:1 off it

#### Scenario: radios at 375 px

- **WHEN** the Steps and Estimating sections are shown at 375×812
- **THEN** every radio is 22×22 px
