## ADDED Requirements

### Requirement: The plan leaves the tool as a plan document

Beside the Markdown and CSV exports, the table SHALL offer the plan as a plan
document: the JSON `GET /api/projects/:id/export?format=json` answers, which is
the whole project, never the view of it, and is the one export the tool can read
back (`plan-import`).

#### Scenario: the document is the whole plan

- **GIVEN** a branch collapsed and a search narrowing the table to one row
- **WHEN** `Download JSON` is pressed
- **THEN** every work item in the project is in the document
