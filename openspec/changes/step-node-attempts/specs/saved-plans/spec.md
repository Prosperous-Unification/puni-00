## ADDED Requirements

### Requirement: Saved plans carry the timezone and no attempts

A saved plan's canonical input SHALL carry `settings.timezone` at the input schema version
allocated at packet time; a body at the previous version SHALL upgrade on read with `UTC` and
schedule identically. Attempts SHALL NOT be captured, as fact dates are not. Comparing two
saved plans SHALL report a timezone change under `settings`.

#### Scenario: an old saved plan reads as UTC

- **GIVEN** a saved plan stored at the previous input schema version
- **WHEN** it is read
- **THEN** its settings carry `timezone: 'UTC'` and its schedule equals the one computed from
  the stored body

#### Scenario: a comparison names a zone change

- **GIVEN** two saved plans differing only in the project's timezone
- **WHEN** they are compared
- **THEN** the difference names `timezone` with both values
