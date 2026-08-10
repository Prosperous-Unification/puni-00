## ADDED Requirements

### Requirement: A role's columns fold behind its final figure

Each role SHALL show, by default, a single column holding its final planning
figure per row, headed by a control that unfolds the role's three estimate
points and its assignee beside it. Folding SHALL be per role and local to the
viewer. A typed but unsent estimate SHALL survive folding and unfolding. A
trio that cannot be saved SHALL remain visible while folded, as a marked final
figure carrying the reason.

#### Scenario: the table at rest

- **WHEN** a project with Dev and QA roles is shown
- **THEN** each role contributes one column, holding the final figure, and no
  estimate or assignee inputs are shown

#### Scenario: unfolding one role

- **WHEN** the Dev control is activated
- **THEN** Dev's three estimate boxes and its assignee appear beside its
  figure, and QA stays folded

#### Scenario: a draft survives the fold

- **GIVEN** `5` typed into Dev optimistic and nothing sent
- **WHEN** Dev is folded and unfolded again
- **THEN** the box still reads `5` and nothing has been sent

#### Scenario: a complaint outlives the fold

- **GIVEN** a half-filled trio
- **WHEN** the role is folded
- **THEN** the row's final figure is marked, carrying the reason
