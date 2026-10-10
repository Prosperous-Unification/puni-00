## ADDED Requirements

### Requirement: Saved plans carry points measures and no templates

A saved plan's canonical input SHALL carry `points_estimate` measures exactly as it carries
the other metrics, at the input schema version allocated at packet time; a body at the
previous version SHALL upgrade on read with no points and schedule identically. Size
templates SHALL NOT be captured. Comparing two saved plans SHALL report points changes under
`measures`.

#### Scenario: a comparison names a points change

- **GIVEN** two saved plans differing only in `010.dev`'s points
- **WHEN** they are compared
- **THEN** the difference names `010.dev`, `points_estimate` and both values

#### Scenario: an old saved plan reads without points

- **GIVEN** a saved plan stored at the previous input schema version
- **WHEN** it is read
- **THEN** its input is at the new version with no points measure and its schedule equals the
  one computed from the stored body
