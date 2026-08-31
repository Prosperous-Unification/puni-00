## MODIFIED Requirements

### Requirement: A critical row's slack is a quiet tag, not a warning

Where a row is on the critical path the Slack column SHALL print the word
`critical` as a tag, and that tag SHALL carry no hue a reader can name — no
`--destructive`, and nothing else the palette spends on an error.

Its ink SHALL be the ink the ordinary slack figures in the same column are
printed in, and its ground SHALL be a neutral tint of the page's own
background, so the tag is still distinguishable from a figure without claiming
anything is wrong.

The tag SHALL remain legible against that ground in both palettes.

#### Scenario: the critical tag beside an ordinary slack figure

- **GIVEN** a plan holding one row on the critical path and one row with slack
  to spare
- **WHEN** the Slack column is read in either palette
- **THEN** the critical tag's ink SHALL carry no nameable hue, SHALL be the
  same ink as the ordinary row's figure, SHALL stand on a ground of its own
  that also carries no nameable hue, and SHALL clear the contrast asked of
  small text
