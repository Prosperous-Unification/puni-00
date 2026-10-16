## ADDED Requirements

### Requirement: Column resizing has a bounded source owner

Column resize arithmetic, callback contract, component and existing column callback factory SHALL live in `column-resize.tsx`, preserving their documentation and existing exports from `use-plan-layout.tsx`. Both files SHALL contain fewer than 800 physical lines.

#### Scenario: Existing callers use the extracted component

- **WHEN** the table imports its existing resize exports from `use-plan-layout.tsx`
- **THEN** the component SHALL retain accessibility, styles and identity, and selected F7 findings SHALL omit the oversized hook source

### Requirement: Extraction preserves the pointer gesture

The extracted component SHALL capture the pointer, measure unresolved Name width once, clamp from initial width, ignore foreign moves and releases, commit only on matching release and abandon on cancellation. A missing header SHALL throw. Callback storage behavior and hook state ownership SHALL remain unchanged.

#### Scenario: Matching and foreign pointer events

- **WHEN** a captured pointer moves several times with foreign moves and releases interleaved
- **THEN** width SHALL follow travel from initial width and commit once on matching release

#### Scenario: Gesture cancellation

- **WHEN** a started gesture is cancelled
- **THEN** it SHALL abandon without commit and ignore subsequent moves and releases
