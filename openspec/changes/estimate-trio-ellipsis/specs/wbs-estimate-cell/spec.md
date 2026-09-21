## ADDED Requirements

### Requirement: A resting trio that does not fit ends in an ellipsis

When a folded step cell cannot show its whole typed trio, the resting trio SHALL end in an ellipsis rather than a clipped glyph, and the result and the assignee SHALL keep the rendering they already have.

#### Scenario: A wide trio stands beside a fractional result and an assignee

- **WHEN** a folded step with the trio `20/24/30`, the result `24.3` and a named assignee is at rest
- **THEN** the trio box ends in an ellipsis rather than a clipped glyph
- **THEN** the result's and the assignee's boxes are drawn inside the cell and the row stays one line high

#### Scenario: The same cell is being typed in

- **WHEN** the cell takes the focus
- **THEN** the trio box declares no ellipsis and scrolls its whole value
