## ADDED Requirements

### Requirement: A refused close of the settings ends with the hold it refused

When the Project settings modal refuses a close because a section holds an edit, the refusal
sentence SHALL be shown only while that hold lasts. Once no section holds anything, the refusal
SHALL end, and a later edit SHALL NOT bring the sentence back unless a new close is refused.

#### Scenario: Escape puts a field back and the reader types again

- **WHEN** a reader types in a settings field, presses Escape to put it back, and types again
- **THEN** the modal stays open and shows no "has an unsaved edit" sentence

### Requirement: A settings section says it is saving while its write travels

While a write sent by a Project settings section is in flight, that section's text boxes SHALL
draw as busy — a progress cursor and ink that differs from an editable box while still clearing
4.5:1 on the box's fill — and the modal SHALL say `Saving <Section>…` in a polite status region
that is present, empty, before the write is sent. Once the write lands the boxes SHALL draw as
editable again and the status SHALL be empty.

#### Scenario: a band of the ladder travels

- **WHEN** a reader renames a band and presses Enter while the write is slow
- **THEN** the band shows a progress cursor in ink of at least 4.5:1, the modal says `Saving Priorities…`, and both clear when the ladder lands
