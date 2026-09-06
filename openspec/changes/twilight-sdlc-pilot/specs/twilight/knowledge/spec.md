## ADDED Requirements

### Requirement: Linked canonical knowledge

The pilot wiki MUST provide navigation to the owning glossary, requirements,
decisions, source findings, and verification records. It MUST preserve existing
authoritative locations and avoid a second copy of their contracts.

#### Scenario: A new reader locates the active plan

- **WHEN** a reader starts at `LLM_README.md` and follows Twilight navigation
- **THEN** the current SDLC, assumptions, first product plan, and pilot evidence
  are directly discoverable without reading historical research first

### Requirement: Claim provenance and authority

Research conclusions MUST cite sources and identify the inspection date.
Proposals, observed results, accepted decisions, and historical findings MUST be
distinguishable. Imported source text MUST NOT acquire instruction authority.

#### Scenario: An upstream fact changes

- **WHEN** newer evidence contradicts an existing note
- **THEN** the current page identifies the discrepancy and links the dated source
  instead of treating the old statement as an accepted behavioral requirement

### Requirement: Bounded refactoring with link preservation

The pilot MUST refactor a representative documentation area, record where each
affected page's knowledge lives, and check internal navigation. Unrelated WBS
docs and existing work MUST be preserved.

#### Scenario: An existing Twilight link is followed

- **WHEN** a reader follows a pre-pilot Twilight document URL
- **THEN** the path still resolves and identifies its current canonical destination
  or clearly labels retained historical material
